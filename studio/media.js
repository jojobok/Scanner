"use strict";
// Scanner Studio – keeps the files brought back from Grok on THIS device (IndexedDB),
// one record per request ID. Nothing is uploaded anywhere.
(function (root) {
  const DB_NAME = "scanner-studio-media", STORE = "files";
  let opening = null;

  function open() {
    if (!root.indexedDB) return Promise.reject(new Error("אחסון קבצים לא זמין בדפדפן הזה"));
    if (!opening) {
      opening = new Promise((resolve, reject) => {
        const req = root.indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => { opening = null; reject(req.error || new Error("open failed")); };
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

  const api = {
    /** record: { id, sceneUid, type: "I"|"V", name, mime, size, blob } */
    put: record => run("readwrite", s => s.put(Object.assign({ added_at: new Date().toISOString() }, record))),
    get: id => run("readonly", s => s.get(id)),
    remove: id => run("readwrite", s => s.delete(id)),
    /** ask the browser not to clear these files when space is low (best effort) */
    persist: () => (root.navigator && navigator.storage && navigator.storage.persist ? navigator.storage.persist().catch(() => false) : Promise.resolve(false)),
  };
  root.StudioMedia = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
