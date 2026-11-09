"use strict";
// Scanner Studio – original files brought back from Grok, kept on THIS device (IndexedDB).
// Nothing is uploaded anywhere, and the studio never deletes an original file.
//
// Schema (database "scanner-studio-media", store "files", keyPath "id"):
//   v1: one record per request; id = request ID.
//   v2: one record per imported FILE (versions). Records get requestId, sceneUid, sha256;
//       new files get their own unique id ("f…"). v1 records keep their id (no blob is moved)
//       and are upgraded in place: requestId = their old id. Indexes: sha256, sceneUid, requestId.
(function (root) {
  const DB_NAME = "scanner-studio-media", STORE = "files", VERSION = 2;
  let opening = null;

  function upgrade(db, tx, oldVersion) {
    const store = oldVersion < 1 ? db.createObjectStore(STORE, { keyPath: "id" }) : tx.objectStore(STORE);
    if (oldVersion < 2) {
      for (const [name, path] of [["sha256", "sha256"], ["sceneUid", "sceneUid"], ["requestId", "requestId"]]) {
        if (!store.indexNames.contains(name)) store.createIndex(name, path, { unique: false });
      }
      if (oldVersion >= 1) {
        // v1 -> v2: annotate existing records in place; blobs are untouched, nothing is deleted
        store.openCursor().onsuccess = e => {
          const cur = e.target.result;
          if (!cur) return;
          const rec = cur.value;
          if (!rec.requestId) rec.requestId = rec.id;
          if (!("sha256" in rec)) rec.sha256 = null;
          rec.schema = 2;
          cur.update(rec);
          cur.continue();
        };
      }
    }
  }

  function open() {
    if (!root.indexedDB) return Promise.reject(new Error("אחסון קבצים לא זמין בדפדפן הזה"));
    if (!opening) {
      opening = new Promise((resolve, reject) => {
        const req = root.indexedDB.open(DB_NAME, VERSION);
        req.onupgradeneeded = e => upgrade(req.result, req.transaction, e.oldVersion);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => { opening = null; reject(req.error || new Error("open failed")); };
        req.onblocked = () => { opening = null; reject(new Error("סגור לשוניות אחרות של האולפן ונסה שוב")); };
      });
    }
    return opening;
  }
  function run(mode, fn) {
    return open().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const result = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(result && "result" in result ? result.result : undefined);
      tx.onerror = () => reject(tx.error || new Error("storage failed"));
      tx.onabort = () => reject(tx.error || new Error("storage aborted (the device may be out of space)"));
    }));
  }

  async function sha256(blob) {
    if (!(root.crypto && root.crypto.subtle)) return null;
    const buf = await root.crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
    return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, "0")).join("");
  }
  function newId() { return "f" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

  const api = {
    VERSION,
    newId,
    sha256,
    /** record: { id, sceneUid, requestId, type: "I"|"V", name, mime, size, sha256, blob } */
    put: record => run("readwrite", s => s.put(Object.assign({ added_at: new Date().toISOString(), schema: 2 }, record))),
    get: id => run("readonly", s => s.get(id)),
    /** first stored record with this content hash, or undefined */
    findBySha: hash => run("readonly", s => s.index("sha256").get(hash)),
    /** reassign a stored file (e.g. to the intake box when its scene is deleted); never deletes */
    setScene: (id, sceneUid) => run("readwrite", s => {
      const r = s.get(id);
      r.onsuccess = () => { if (r.result) { r.result.sceneUid = sceneUid; s.put(r.result); } };
      return r;
    }),
    /** ask the browser not to clear these files when space is low (best effort) */
    persist: () => (root.navigator && navigator.storage && navigator.storage.persist ? navigator.storage.persist().catch(() => false) : Promise.resolve(false)),
  };
  root.StudioMedia = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
