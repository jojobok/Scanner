"use strict";
const STORAGE_KEY = "scanner-studio-draft-v1";
const $ = id => document.getElementById(id);
function emptyProject() { return {portion:"",title:"",scenes:[]}; }
function load() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (data && typeof data === "object" && Array.isArray(data.scenes)) return data;
  } catch (_) {}
  return emptyProject();
}
const project = load();
const SR = window.StudioRequests;
const GB = window.StudioGrok, MEDIA = window.StudioMedia, CLOUD = window.StudioCloud;
let objectUrls = []; // previews of files kept on this device; released on every redraw
// Stores one file as a new version. Returns {entry} or {duplicate} or {error}.
async function storeFile(file, sceneUidValue, requestId, reason){
  const kind=GB.fileKind(file);const problem=GB.checkFile(file,null);
  if(problem)return {error:problem};
  const hash=await MEDIA.sha256(file);
  if(hash){const known=project.media.find(m=>m.sha256===hash);if(known)return {duplicate:known};
    try{const stored=await MEDIA.findBySha(hash);if(stored)return {duplicate:stored}}catch(_){}}
  const id=MEDIA.newId();
  await MEDIA.put({id,sceneUid:sceneUidValue,requestId,type:kind,name:file.name,mime:file.type,size:file.size,sha256:hash,blob:file});
  MEDIA.persist();
  const entry={id,request_id:requestId||null,scene_uid:sceneUidValue||null,type:kind,name:file.name,mime:file.type,size:file.size,
    sha256:hash,added_at:new Date().toISOString(),reason:reason||null};
  project.media.push(entry);
  return {entry};
}
function linkToRequest(entry,scene,req){
  entry.scene_uid=scene.uid;entry.reason=null;
  if(req){entry.request_id=req.id;req.status="received";req.file={name:entry.name,mime:entry.mime,size:entry.size,media_id:entry.id,received_at:entry.added_at}}
  if(entry.type==="I"&&scene.image_status!=="approved")scene.image_status="review";
  scene.approved=false;
  MEDIA.setScene(entry.id,scene.uid).catch(()=>{});
}
// ---- automatic path: request -> studio server queue -> Grok Bot routine -> result imported here
function approvedMediaOf(scene){
  return project.media.find(m=>m.id===scene.approved_media_id)
    ||[...project.media].reverse().find(m=>m.type==="I"&&m.request_id&&m.request_id===scene.approved_image_request&&m.scene_uid===scene.uid);
}
async function sendToBot(scene,req){
  if(!CLOUD.state.available)return;
  req.cloud="sending";req.cloud_error=null;save();
  try{
    let source=null;
    if(req.type==="V"){
      const m=approvedMediaOf(scene);const rec=m&&await MEDIA.get(m.id);
      source={id:scene.approved_image_request,blob:rec&&rec.blob};
    }
    await CLOUD.submit(req,source);req.cloud="queued";
  }catch(err){req.cloud="error";req.cloud_error=err.message}
  save();render();
}
let polling=false;
async function pollBot(){
  if(polling||!CLOUD.state.available||document.hidden)return;
  polling=true;let changed=false;
  try{
    for(const scene of project.scenes){
      for(const req of scene.requests.filter(r=>r.status==="waiting"&&r.cloud==="queued")){
        let st;try{st=await CLOUD.status(req.id)}catch(_){continue}
        if(st.status==="failed"){req.cloud="failed";req.cloud_error=st.error;changed=true;continue}
        if(st.status==="claimed"&&req.cloud_seen!=="claimed"){req.cloud_seen="claimed";changed=true}
        const imported=req.cloud_imported||(req.cloud_imported=[]);
        for(const f of st.files||[]){
          if(imported.includes(f.file_id))continue;
          const blob=await CLOUD.file(f.file_id);
          const res=await storeFile(new File([blob],f.name,{type:f.mime}),null,req.id);
          imported.push(f.file_id);
          if(res.entry){res.entry.remote_file_id=f.file_id;linkToRequest(res.entry,scene,req)}
          else if(res.duplicate){req.status="received"}
          changed=true;
        }
      }
    }
  }finally{polling=false}
  if(changed){save();render();renderIntake()}
}
CLOUD.health().then(st=>{if(st.available){render();pollBot();setInterval(pollBot,20000)}});
document.addEventListener("visibilitychange",()=>{if(!document.hidden)pollBot()});
function sceneUid(){return "s"+Date.now().toString(36)+Math.random().toString(36).slice(2,7)}
(function migrate(){
  let changed=false;
  if(!project.code){project.code=SR.newProductionCode();changed=true}
  project.scenes.forEach(s=>{if(!s.uid){s.uid=sceneUid();changed=true}if(!Array.isArray(s.requests)){s.requests=[];changed=true}});
  if(!Array.isArray(project.media)){
    project.media=[];
    project.scenes.forEach(s=>s.requests.forEach(r=>{if(r.file)project.media.push({id:r.id,request_id:r.id,scene_uid:s.uid,type:r.type,
      name:r.file.name,mime:r.file.mime,size:r.file.size,sha256:null,added_at:r.file.received_at||r.created_at,reason:null})}));
    changed=true;
  }
  if(changed) localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
})();
$("portion").value = project.portion || "";
$("title").value = project.title || "";
function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(project)); }
for (const id of ["portion","title"]) {
  $(id).addEventListener("input", () => { project[id] = $(id).value; save(); });
}
let expandedScene = null;
function render() {
  objectUrls.forEach(u=>URL.revokeObjectURL(u)); objectUrls=[];
  const root = $("scenes");
  root.replaceChildren();
  if (!project.scenes.length) {
    const p = document.createElement("p"); p.className="status"; p.textContent="אין עדיין סצנות. הוסף סצנה כדי להתחיל."; root.append(p);
  }
  project.scenes.forEach((scene, index) => {
    const card = document.createElement("article"); card.className="scene";
    const heading = document.createElement("button"); heading.type="button"; heading.className="scene-toggle"; heading.setAttribute("aria-expanded",String(expandedScene===index)); heading.textContent="סצנה " + (index + 1) + (expandedScene===index ? "  ▲" : "  ▼");
    heading.addEventListener("click",()=>{expandedScene=expandedScene===index?null:index;render();});
    const status = document.createElement("p"); status.className="status"; status.textContent=scene.approved?"מאושרת":"ממתינה לאישור";
    const label = document.createElement("label"); label.textContent="קריינות";
    const area = document.createElement("textarea"); area.value=scene.narration || "";
    area.setAttribute("aria-label","קריינות סצנה " + (index + 1));
    area.addEventListener("input",()=>{scene.narration=area.value;scene.approved=false;status.textContent="ממתינה לאישור";save();});
    const actions = document.createElement("div"); actions.className="actions";
    const approve = document.createElement("button"); approve.className="primary"; approve.textContent="אשר סצנה";
    approve.addEventListener("click",()=>{scene.approved=true;save();render();});
    const remove = document.createElement("button"); remove.className="secondary"; remove.textContent="מחק סצנה";
    remove.addEventListener("click",()=>{if(!confirm("למחוק את הסצנה מהטיוטה המקומית?"))return;project.media.filter(m=>m.scene_uid===scene.uid).forEach(m=>{m.scene_uid=null;m.reason="scene_deleted";MEDIA.setScene(m.id,null).catch(()=>{})});project.scenes.splice(index,1);renderIntake();expandedScene=null;save();render();});
    const promptLabel = document.createElement("label"); promptLabel.textContent="פרומפט לתמונה (אנגלית)";
    const promptArea = document.createElement("textarea"); promptArea.value=scene.image_prompt || "";
    promptArea.dir="ltr"; promptArea.style.textAlign="left";
    promptArea.setAttribute("aria-label","פרומפט לתמונה סצנה " + (index + 1));
    promptArea.placeholder="Cinematic biblical scene, vertical 9:16...";
    promptArea.addEventListener("input",()=>{scene.image_prompt=promptArea.value;scene.approved=false;status.textContent="ממתינה לאישור";save();});
    const prepare=document.createElement("button");prepare.type="button";prepare.className="secondary";prepare.textContent="הכן פרומפט קולנועי";
    const prepared=document.createElement("textarea");prepared.readOnly=true;prepared.dir="ltr";prepared.style.textAlign="left";prepared.hidden=true;
    const copyPrompt=document.createElement("button");copyPrompt.type="button";copyPrompt.className="secondary";copyPrompt.textContent="העתק פרומפט";copyPrompt.hidden=true;
    prepare.addEventListener("click",()=>{
      const scenePrompt=(scene.image_prompt||"").trim();
      if(!scenePrompt){alert("יש למלא קודם פרומפט לתמונה");return}
      prepared.value=[scenePrompt,"Ultra-realistic professional cinematic biblical scene, vertical 9:16, natural lighting, authentic ancient Middle Eastern setting, historically plausible clothing and architecture, modest attire, consistent character appearance, realistic anatomy and proportions, detailed environment, no modern objects, no text, no logos, no watermarks, no split screen, no collage, no fantasy effects."].join("\\n\\n").replace(/\\n/g,"\n");
      prepared.hidden=false;copyPrompt.hidden=false;
    });
    copyPrompt.addEventListener("click",async()=>{
      try{await navigator.clipboard.writeText(prepared.value);copyPrompt.textContent="הועתק"}catch(_){prepared.focus();prepared.select();alert("סמן והעתק את הפרומפט ידנית")}
    });
    const generationTitle=document.createElement("strong");generationTitle.textContent="יצירת תמונה";
    const generationStatus=document.createElement("p");generationStatus.className="status";
    generationStatus.textContent="נוצר ב־Grok Bot במנוי שלך ונשמר בתיקיית "+SR.DEFAULT_FOLDER+" ב־Google Drive. האולפן לא מתחבר לחשבון Grok ואין חיובים.";
    if(!Array.isArray(scene.requests)) scene.requests=[];
    const latest=type=>[...scene.requests].reverse().find(r=>r.type===type);
    const generateButton=document.createElement("button");generateButton.type="button";generateButton.className="primary";generateButton.textContent="צור תמונה";
    const videoButton=document.createElement("button");videoButton.type="button";videoButton.className="secondary";videoButton.textContent="צור סרטון מהתמונה";
    const packageArea=document.createElement("textarea");packageArea.readOnly=true;packageArea.dir="ltr";packageArea.style.textAlign="left";packageArea.hidden=true;
    packageArea.setAttribute("aria-label","הוראה ל־Grok Bot");
    // browser handoff: copy the prompt and open Grok, where the user is already signed in
    const grokTitle=document.createElement("strong");grokTitle.textContent="דרך Grok בדפדפן (החשבון הקיים שלך)";grokTitle.hidden=true;
    const grokText=document.createElement("textarea");grokText.readOnly=true;grokText.dir="ltr";grokText.style.textAlign="left";grokText.hidden=true;
    grokText.setAttribute("aria-label","פרומפט להדבקה ב־Grok");
    const openGrok=document.createElement("a");openGrok.className="primary button-link";openGrok.href=GB.IMAGINE_URL;openGrok.target="_blank";openGrok.rel="noopener noreferrer";openGrok.textContent="העתק ופתח ב־Grok";openGrok.hidden=true;
    const grokHint=document.createElement("p");grokHint.className="status";grokHint.hidden=true;
    grokHint.textContent="הפרומפט מועתק ו־Grok נפתח בלשונית חדשה. מדביקים, יוצרים, שומרים את הקובץ במכשיר, וחוזרים לכאן ל\"צרף תוצר מ־Grok\".";
    openGrok.addEventListener("click",()=>{
      try{navigator.clipboard.writeText(grokText.value).then(()=>{openGrok.textContent="הועתק – הדבק ב־Grok"},()=>{grokText.focus();grokText.select()})}catch(_){grokText.focus();grokText.select()}
    });
    // image-to-video in Grok's own page needs the approved image as the first frame:
    // hand the original file back to the user (iOS share sheet -> Save Image, or a download)
    const saveApproved=document.createElement("button");saveApproved.type="button";saveApproved.className="secondary";
    saveApproved.textContent="שמור את התמונה המאושרת למכשיר";saveApproved.hidden=true;
    function approvedMedia(){
      return project.media.find(m=>m.id===scene.approved_media_id)
        ||[...project.media].reverse().find(m=>m.type==="I"&&m.request_id&&m.request_id===scene.approved_image_request&&m.scene_uid===scene.uid);
    }
    saveApproved.addEventListener("click",async()=>{
      const m=approvedMedia();if(!m){alert("התמונה המאושרת לא שמורה במכשיר. צרף אותה קודם.");return}
      let rec;try{rec=await MEDIA.get(m.id)}catch(_){}
      if(!rec||!rec.blob){alert("הקובץ לא נמצא במכשיר.");return}
      const ext=(m.name.match(/\.[a-z0-9]+$/i)||[".jpg"])[0];
      const file=new File([rec.blob],(m.request_id||"approved-image")+ext,{type:m.mime||rec.blob.type||"image/jpeg"});
      try{
        if(navigator.canShare&&navigator.canShare({files:[file]})){await navigator.share({files:[file]});return}
      }catch(err){if(err&&err.name==="AbortError")return}
      const url=URL.createObjectURL(file);const a=document.createElement("a");a.href=url;a.download=file.name;document.body.append(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
    });
    function showGrok(req){
      const show=!!(req&&req.grok);
      grokTitle.hidden=grokText.hidden=openGrok.hidden=grokHint.hidden=!show;
      const video=show&&req.type==="V";
      saveApproved.hidden=!video;
      if(show){grokText.value=req.grok;openGrok.textContent="העתק ופתח ב־Grok"}
      grokHint.textContent=video
        ?(approvedMedia()?"לסרטון: 1. שמור את התמונה המאושרת למכשיר. 2. העתק ופתח ב־Grok. 3. ב־Grok Imagine העלה את התמונה, הדבק את ההוראה וצור סרטון. 4. שמור את הסרטון וחזור ל\"צרף תוצר מ־Grok\"."
          :"התמונה המאושרת לא שמורה במכשיר, ולכן אי אפשר להעביר אותה ל־Grok מכאן. צרף אותה קודם ב\"צרף תוצר מ־Grok\" ואשר אותה.")
        :"הפרומפט מועתק ו־Grok נפתח בלשונית חדשה. מדביקים, יוצרים, שומרים את הקובץ במכשיר, וחוזרים לכאן ל\"צרף תוצר מ־Grok\".";
    }
    // bring the result back: stored on this device only, linked to the scene and request
    const attachLabel=document.createElement("label");attachLabel.className="secondary file-button";attachLabel.textContent="צרף תוצר מ־Grok";
    const attachInput=document.createElement("input");attachInput.type="file";attachInput.accept="image/*,video/*";attachInput.className="visually-hidden";
    attachInput.setAttribute("aria-label","צרף תמונה או סרטון שנוצרו ב־Grok, סצנה "+(index+1));attachLabel.append(attachInput);
    const attachStatus=document.createElement("p");attachStatus.className="status";attachStatus.setAttribute("role","status");
    attachInput.addEventListener("change",async()=>{
      const file=attachInput.files&&attachInput.files[0];attachInput.value="";
      if(!file)return;
      const kind=GB.fileKind(file);const problem=GB.checkFile(file,null);
      if(problem){attachStatus.textContent=problem;return}
      let req=[...scene.requests].reverse().find(r=>r.type===kind&&r.status==="waiting");
      if(!req){req={id:SR.makeRequestId(project.code,index+1,kind),type:kind,status:"waiting",created_at:new Date().toISOString(),source:"manual"};scene.requests.push(req)}
      let res;
      try{res=await storeFile(file,scene.uid,req.id)}catch(err){attachStatus.textContent="שמירת הקובץ במכשיר נכשלה: "+err.message;return}
      if(res.error){attachStatus.textContent=res.error;return}
      if(res.duplicate){attachStatus.textContent="הקובץ הזה כבר קיים באולפן ("+res.duplicate.name+"). לא נשמר שוב.";save();return}
      linkToRequest(res.entry,scene,req);
      if(kind==="I")imageStatus.value=scene.image_status;
      status.textContent="ממתינה לאישור";save();
      attachStatus.textContent=(kind==="I"?"התמונה":"הסרטון")+" נשמר במכשיר ושויך לבקשה "+req.id+".";
      showPreview();renderRequests();
    });
    const copyPackage=document.createElement("button");copyPackage.type="button";copyPackage.className="secondary";copyPackage.textContent="העתק הוראה ל־Grok Bot";copyPackage.hidden=true;
    const requestList=document.createElement("ul");requestList.className="requests";
    const STATUS_TEXT={waiting:"ממתינה לתוצר מ־Grok Bot",received:"התקבל תוצר",superseded:"הוחלפה בבקשה חדשה"};
    function renderRequests(){
      requestList.replaceChildren();
      scene.requests.slice(-4).reverse().forEach(r=>{
        const li=document.createElement("li");
        const code=document.createElement("code");code.textContent=r.id;
        const CLOUD_TEXT={sending:"נשלחת ל־Grok Bot",queued:r.cloud_seen==="claimed"?"Grok Bot יוצר":"בתור של Grok Bot",error:"שליחה נכשלה",failed:"Grok Bot נכשל"};
        li.append(code," · ",(r.type==="V"?"סרטון":"תמונה")," · ",(r.status==="waiting"&&CLOUD_TEXT[r.cloud])||STATUS_TEXT[r.status]||r.status);
        requestList.append(li);
      });
      const img=latest("I");
      videoButton.disabled=!(scene.image_status==="approved"&&scene.approved_image_request);
      videoButton.title=videoButton.disabled?"קודם יש לאשר תמונה":"";
      generationStatus.textContent=img&&img.status==="waiting"
        ?"בקשה "+img.id+" ממתינה. העתק את ההוראה ל־Grok Bot. הקובץ יישמר בשם הזה בתיקייה "+SR.DEFAULT_FOLDER+"."
        :"נוצר ב־Grok Bot במנוי שלך ונשמר בתיקיית "+SR.DEFAULT_FOLDER+" ב־Google Drive. האולפן לא מתחבר לחשבון Grok ואין חיובים.";
      if(img&&img.status==="waiting")generationStatus.textContent="בקשה "+img.id+" ממתינה. \"העתק ופתח ב־Grok\" ליצירה בחשבון שלך, ואז \"צרף תוצר מ־Grok\".";
      if(img&&img.status==="waiting"&&img.cloud){
        const seen=CLOUD.state.bot_last_seen?" · Grok Bot בדק לאחרונה ב־"+new Date(CLOUD.state.bot_last_seen).toLocaleTimeString("he-IL",{hour:"2-digit",minute:"2-digit"}):" · Grok Bot עדיין לא התחבר לשרת";
        generationStatus.textContent={sending:"שולח ל־Grok Bot...",queued:(img.cloud_seen==="claimed"?"Grok Bot יוצר את התמונה":"נשלח ל־Grok Bot, ממתין ליצירה")+seen,
          error:"השליחה לשרת נכשלה: "+(img.cloud_error||""),failed:"Grok Bot דיווח על כשל: "+(img.cloud_error||"")+". לחץ שוב \"צור תמונה\" לבקשה חדשה."}[img.cloud]||generationStatus.textContent;
      }
      const vid=latest("V");
      if(vid&&vid.status==="waiting"&&vid.cloud)videoButton.title={queued:"הסרטון נשלח ל־Grok Bot",failed:"Grok Bot דיווח על כשל: "+(vid.cloud_error||"")}[vid.cloud]||"";
      const open=[...scene.requests].reverse().find(r=>r.status==="waiting"&&r.grok&&!r.cloud);
      showGrok(open);
    }
    function addRequest(type,text,extra){
      scene.requests.filter(r=>r.type===type&&r.status==="waiting").forEach(r=>{r.status="superseded"});
      const id=SR.makeRequestId(project.code,index+1,type);
      const req=Object.assign({id,type,status:"waiting",created_at:new Date().toISOString()},extra||{});
      req.package=text(id);
      scene.requests.push(req);save();
      packageArea.value=req.package;packageArea.hidden=false;copyPackage.hidden=false;copyPackage.textContent="העתק הוראה ל־Grok Bot";
      req.grok=type==="I"?GB.imagePrompt({prompt:req.prompt,revision:req.revision}):GB.videoPrompt({motion:req.motion,scenePrompt:scene.image_prompt});save();
      if(CLOUD.state.available){sendToBot(scene,req)}else{showGrok(req)}
      renderRequests();
    }
    generateButton.addEventListener("click",()=>{
      const scenePrompt=(scene.image_prompt||"").trim();
      if(!scenePrompt){alert("יש למלא קודם פרומפט לתמונה");return}
      const prev=latest("I");
      const revision=scene.image_status==="revision"?(scene.image_revision||""):"";
      addRequest("I",id=>SR.imagePackage({id,prompt:scenePrompt,revision,previousId:prev&&prev.id}),{prompt:scenePrompt,revision});
      if(scene.image_status!=="revision"){scene.image_status="not_started"}
      save();
    });
    videoButton.addEventListener("click",()=>{
      if(videoButton.disabled){alert("יש לאשר קודם תמונה לסצנה");return}
      const motion=prompt("תנועת מצלמה לסרטון (באנגלית):","Slow cinematic push-in.");
      if(motion===null)return;
      addRequest("V",id=>SR.videoPackage({id,sourceId:scene.approved_image_request,motion}),{source:scene.approved_image_request,motion});
    });
    copyPackage.addEventListener("click",async()=>{
      try{await navigator.clipboard.writeText(packageArea.value);copyPackage.textContent="הועתק"}catch(_){packageArea.focus();packageArea.select();alert("סמן והעתק את ההוראה ידנית")}
    });
    const imageStatusLabel=document.createElement("label");imageStatusLabel.textContent="מצב תמונה";
    const imageStatus=document.createElement("select");
    [["not_started","טרם נוצרה"],["review","ממתינה לבדיקה"],["approved","תמונה אושרה"],["revision","נדרש תיקון"]].forEach(([value,title])=>{const option=document.createElement("option");option.value=value;option.textContent=title;imageStatus.append(option)});
    imageStatus.value=scene.image_status||"not_started";
    imageStatus.addEventListener("change",()=>{scene.image_status=imageStatus.value;
      if(imageStatus.value==="approved"){const r=latest("I");scene.approved_image_request=r?r.id:(scene.approved_image_request||null)}
      scene.approved=false;status.textContent="ממתינה לאישור";save();renderRequests()});
    const revisionLabel=document.createElement("label");revisionLabel.textContent="הערות לתיקון תמונה";
    const revisionArea=document.createElement("textarea");revisionArea.value=scene.image_revision||"";
    revisionArea.placeholder="מה לשנות בתמונה?";
    revisionArea.addEventListener("input",()=>{scene.image_revision=revisionArea.value;scene.image_status="revision";imageStatus.value="revision";scene.approved=false;status.textContent="ממתינה לאישור";save()});
        const mediaTitle=document.createElement("strong");mediaTitle.textContent="מדיה לסצנה";
    const mediaNote=document.createElement("p");mediaNote.className="status";mediaNote.textContent="קישורים לתצוגה בלבד. לא מתבצעת יצירת תמונה או וידאו.";
    const imageLabel=document.createElement("label");imageLabel.textContent="קישור לתמונה (HTTPS)";
    const imageInput=document.createElement("input");imageInput.type="url";imageInput.dir="ltr";imageInput.placeholder="https://...";
    imageInput.value=scene.image_url||"";
    const videoLabel=document.createElement("label");videoLabel.textContent="קישור לסרטון (HTTPS)";
    const videoInput=document.createElement("input");videoInput.type="url";videoInput.dir="ltr";videoInput.placeholder="https://...";
    videoInput.value=scene.video_url||"";
    const preview=document.createElement("div");preview.className="media-preview";
    function safeUrl(value){try{const u=new URL(value);return u.protocol==="https:"?u.href:null}catch(_){return null}}
    function showPreview(){
      preview.replaceChildren();
      const imageUrl=safeUrl(imageInput.value.trim()),videoUrl=safeUrl(videoInput.value.trim());
      if(imageUrl){const image=document.createElement("img");image.src=imageUrl;image.alt="תצוגת תמונה לסצנה "+(index+1);image.loading="lazy";image.referrerPolicy="no-referrer";preview.append(image)}
      if(videoUrl){const video=document.createElement("video");video.src=videoUrl;video.controls=true;video.preload="none";video.setAttribute("playsinline","");preview.append(video)}
      // files brought back from Grok and kept on this device (latest image and video)
      const stored=project.media.filter(m=>m.scene_uid===scene.uid).slice().reverse();
      stored.forEach(m=>{
        const fig=document.createElement("figure");fig.className="version";fig.dataset.media=m.id;
        const el=document.createElement(m.type==="I"?"img":"video");
        if(m.type==="I")el.alt="תמונה מ־Grok, סצנה "+(index+1)+" ("+(m.request_id||m.name)+")";else{el.controls=true;el.setAttribute("playsinline","");el.preload="metadata"}
        const cap=document.createElement("figcaption");
        cap.textContent=(m.request_id||m.name)+(scene.approved_media_id===m.id?" · ✓ התמונה המאושרת":"");
        fig.append(el,cap);
        if(m.type==="I"&&scene.approved_media_id!==m.id){
          const pick=document.createElement("button");pick.type="button";pick.className="secondary";pick.textContent="אשר תמונה זו";
          pick.addEventListener("click",()=>{scene.approved_media_id=m.id;scene.image_status="approved";
            if(m.request_id)scene.approved_image_request=m.request_id;scene.approved=false;save();render()});
          fig.append(pick);
        }
        preview.append(fig);
        MEDIA.get(m.id).then(rec=>{
          if(!rec||!rec.blob||!el.isConnected)return;
          const url=URL.createObjectURL(rec.blob);objectUrls.push(url);el.src=url;
        }).catch(()=>{cap.textContent+=" · הקובץ לא נמצא במכשיר"});
      });
      if(!imageUrl&&!videoUrl&&!stored.length){const note=document.createElement("p");note.className="status no-media";note.textContent="לא צורפה מדיה לסצנה.";preview.append(note)}
    }
    function updateMedia(){
      const hadImage=scene.image_url,hadVideo=scene.video_url;
      scene.image_url=imageInput.value.trim();scene.video_url=videoInput.value.trim();
      const mark=type=>{const r=latest(type);if(r&&r.status==="waiting"){r.status="received";if(type==="I"){scene.image_status="review";imageStatus.value="review"}}};
      if(scene.image_url&&scene.image_url!==hadImage)mark("I");
      if(scene.video_url&&scene.video_url!==hadVideo)mark("V");
      scene.approved=false;status.textContent="ממתינה לאישור";save();showPreview();renderRequests()}
    imageInput.addEventListener("change",updateMedia);videoInput.addEventListener("change",updateMedia);
    showPreview();
    actions.append(approve,remove);
    const details=document.createElement("div");details.hidden=expandedScene!==index;
    renderRequests();
    const genActions=document.createElement("div");genActions.className="actions";genActions.append(generateButton,videoButton);
    const attachRow=document.createElement("div");attachRow.className="actions";attachRow.append(attachLabel);
    details.append(label,area,promptLabel,promptArea,prepare,prepared,copyPrompt,generationTitle,generationStatus,genActions,grokTitle,grokHint,saveApproved,grokText,openGrok,attachRow,attachStatus,packageArea,copyPackage,requestList,imageStatusLabel,imageStatus,revisionLabel,revisionArea,mediaTitle,mediaNote,imageLabel,imageInput,videoLabel,videoInput,preview,actions);
    card.append(heading,status,details);root.append(card);
  });
}
$("add").addEventListener("click",()=>{project.scenes.push({uid:sceneUid(),narration:"",image_prompt:"",approved:false,requests:[]});expandedScene=project.scenes.length-1;save();render();});
$("export").addEventListener("click",()=>{
  const blob = new Blob([JSON.stringify(project,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob);
  const link=document.createElement("a");link.href=url;link.download="scanner-plan.json";link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
});
render();
renderIntake();

// ---- bulk import (iOS Files, incl. Google Drive): matched only by a valid request ID
const REASON={no_id:"אין מזהה תקין בשם הקובץ",other_production:"מזהה של הפקה אחרת",type_mismatch:"סוג הקובץ לא מתאים לבקשה",
  unknown_request:"המזהה לא נמצא בבקשות של ההפקה",scene_deleted:"הסצנה שלו נמחקה"};
function renderIntake(){
  const box=$("intake");if(!box)return;box.replaceChildren();
  const waiting=project.media.filter(m=>!m.scene_uid);
  if(!waiting.length){const p=document.createElement("p");p.className="status";p.textContent="אין קבצים שממתינים לשיוך.";box.append(p);return}
  waiting.forEach(m=>{
    const row=document.createElement("div");row.className="scene";
    const name=document.createElement("strong");name.textContent=m.name;name.dir="ltr";
    const why=document.createElement("p");why.className="status";why.textContent=REASON[m.reason]||"לא שויך";
    const pickScene=document.createElement("select");pickScene.setAttribute("aria-label","בחר סצנה עבור "+m.name);
    project.scenes.forEach((s,i)=>{const o=document.createElement("option");o.value=s.uid;o.textContent="סצנה "+(i+1);pickScene.append(o)});
    const assign=document.createElement("button");assign.type="button";assign.className="primary";assign.textContent="שייך לסצנה";
    assign.disabled=!project.scenes.length;
    assign.addEventListener("click",()=>{const s=project.scenes.find(x=>x.uid===pickScene.value);if(!s)return;
      const req=m.request_id&&s.requests.find(r=>r.id===m.request_id);linkToRequest(m,s,req);save();render();renderIntake()});
    const acts=document.createElement("div");acts.className="actions";acts.append(pickScene,assign);
    row.append(name,why,acts);box.append(row);
  });
}
$("importPick").addEventListener("click",()=>$("importFiles").click());
$("importFiles").addEventListener("change",async e=>{
  const files=[...e.target.files];e.target.value="";
  if(!files.length)return;
  const out=$("importStatus");out.textContent="מייבא "+files.length+" קבצים...";
  let auto=0,waiting=0,dup=0;const failed=[];
  for(const f of files){
    try{
      const match=SR.matchFile(project,f.name,f.type);
      const res=await storeFile(f,null,match.parsed?match.parsed.id:null,match.reason);
      if(res.error){failed.push(f.name+": "+res.error);continue}
      if(res.duplicate){dup++;continue}
      if(match.request){linkToRequest(res.entry,project.scenes[match.sceneIndex],match.request);auto++}else waiting++;
      save();
    }catch(err){failed.push(f.name+": "+err.message)}
  }
  out.textContent="שויכו אוטומטית: "+auto+" · ממתינים לשיוך: "+waiting+(dup?" · כבר קיימים: "+dup:"")+(failed.length?" · נכשלו: "+failed.join("; "):"");
  render();renderIntake();
});

$("demo").addEventListener("click", () => {
  const button = $("demo");
  const portion = $("portion").value.trim();
  if (!portion) { alert("יש להזין שם פרשה"); return; }
  if (project.scenes.length && !confirm("טעינת הדגמה תחליף את הסצנות בטיוטה המקומית. עותק גיבוי יישמר במכשיר. להמשיך?")) return;
  button.disabled = true;
  button.textContent = "טוען תסריט...";
  try {
    const result = {
      parasha: portion,
      title: "פרשת " + portion + " (תסריט הדגמה)",
      scenes: [
        ["פתיחה: מה אפשר ללמוד מפרשת " + portion + "? (טקסט הדגמה בלבד)", "Cinematic biblical desert landscape at sunrise, vertical 9:16"],
        ["המסע מתחיל ברגע של התבוננות.", "Ancient tents in a desert valley, natural warm light, vertical 9:16"],
        ["לפעמים הדרך ארוכה, ולא רואים את סופה.", "Winding path through rocky hills, realistic biblical setting, vertical 9:16"],
        ["אבל כל צעד קטן יכול לפתוח דרך חדשה.", "Sandaled feet walking along an ancient stone path, vertical 9:16"],
        ["חשוב לזכור את הכוח של מעשה טוב.", "Warm sunbeams across ancient Judean hills, vertical 9:16"],
        ["שבת שלום. זהו תסריט הדגמה בלבד, לא תוכן תורני מאומת.", "Quiet ancient landscape at golden hour, vertical 9:16"]
      ].map(([narration,image_prompt]) => ({uid:sceneUid(),narration,image_prompt,approved:false,requests:[]}))
    };
    if (project.scenes.length) localStorage.setItem("scanner-studio-backup-" + Date.now(), JSON.stringify(project));
    project.portion = result.parasha;
    project.title = result.title;
    project.scenes = result.scenes;
    $("title").value = project.title;
    expandedScene=0;save(); render();
  } catch (error) {
    alert("לא ניתן ליצור תסריט הדגמה: " + error.message);
  } finally {
    button.disabled = false;
    button.textContent = "צור תסריט הדגמה";
  }
});
