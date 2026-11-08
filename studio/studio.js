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
$("portion").value = project.portion || "";
$("title").value = project.title || "";
function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(project)); }
for (const id of ["portion","title"]) {
  $(id).addEventListener("input", () => { project[id] = $(id).value; save(); });
}
let expandedScene = null;
function render() {
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
    remove.addEventListener("click",()=>{if(!confirm("למחוק את הסצנה מהטיוטה המקומית?"))return;project.scenes.splice(index,1);expandedScene=null;save();render();});
    const promptLabel = document.createElement("label"); promptLabel.textContent="פרומפט לתמונה (אנגלית)";
    const promptArea = document.createElement("textarea"); promptArea.value=scene.image_prompt || "";
    promptArea.dir="ltr"; promptArea.style.textAlign="left";
    promptArea.setAttribute("aria-label","פרומפט לתמונה סצנה " + (index + 1));
    promptArea.placeholder="Cinematic biblical scene, vertical 9:16...";
    promptArea.addEventListener("input",()=>{scene.image_prompt=promptArea.value;scene.approved=false;status.textContent="ממתינה לאישור";save();});
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
      if(!imageUrl&&!videoUrl){const note=document.createElement("p");note.className="status";note.textContent="לא צורפה מדיה לסצנה.";preview.append(note)}
    }
    function updateMedia(){scene.image_url=imageInput.value.trim();scene.video_url=videoInput.value.trim();scene.approved=false;status.textContent="ממתינה לאישור";save();showPreview()}
    imageInput.addEventListener("change",updateMedia);videoInput.addEventListener("change",updateMedia);
    showPreview();
    actions.append(approve,remove);
    const details=document.createElement("div");details.hidden=expandedScene!==index;
    details.append(label,area,promptLabel,promptArea,mediaTitle,mediaNote,imageLabel,imageInput,videoLabel,videoInput,preview,actions);
    card.append(heading,status,details);root.append(card);
  });
}
$("add").addEventListener("click",()=>{project.scenes.push({narration:"",image_prompt:"",approved:false});expandedScene=project.scenes.length-1;save();render();});
$("export").addEventListener("click",()=>{
  const blob = new Blob([JSON.stringify(project,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob);
  const link=document.createElement("a");link.href=url;link.download="scanner-plan.json";link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
});
render();

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
      ].map(([narration,image_prompt]) => ({narration,image_prompt,approved:false}))
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
