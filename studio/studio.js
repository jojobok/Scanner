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
function render() {
  const root = $("scenes");
  root.replaceChildren();
  if (!project.scenes.length) {
    const p = document.createElement("p"); p.className="status"; p.textContent="אין עדיין סצנות. הוסף סצנה כדי להתחיל."; root.append(p);
  }
  project.scenes.forEach((scene, index) => {
    const card = document.createElement("article"); card.className="scene";
    const heading = document.createElement("strong"); heading.textContent="סצנה " + (index + 1);
    const status = document.createElement("p"); status.className="status"; status.textContent=scene.approved?"מאושרת":"ממתינה לאישור";
    const label = document.createElement("label"); label.textContent="קריינות";
    const area = document.createElement("textarea"); area.value=scene.narration || "";
    area.setAttribute("aria-label","קריינות סצנה " + (index + 1));
    area.addEventListener("input",()=>{scene.narration=area.value;scene.approved=false;status.textContent="ממתינה לאישור";save();});
    const actions = document.createElement("div"); actions.className="actions";
    const approve = document.createElement("button"); approve.className="primary"; approve.textContent="אשר סצנה";
    approve.addEventListener("click",()=>{scene.approved=true;save();render();});
    const remove = document.createElement("button"); remove.className="secondary"; remove.textContent="מחק סצנה";
    remove.addEventListener("click",()=>{if(!confirm("למחוק את הסצנה מהטיוטה המקומית?"))return;project.scenes.splice(index,1);save();render();});
    actions.append(approve,remove);card.append(heading,status,label,area,actions);root.append(card);
  });
}
$("add").addEventListener("click",()=>{project.scenes.push({narration:"",approved:false});save();render();});
$("export").addEventListener("click",()=>{
  const blob = new Blob([JSON.stringify(project,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob);
  const link=document.createElement("a");link.href=url;link.download="scanner-plan.json";link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
});
render();

$("demo").addEventListener("click", async () => {
  const button = $("demo");
  const portion = $("portion").value.trim();
  if (!portion) { alert("יש להזין שם פרשה"); return; }
  if (project.scenes.length && !confirm("טעינת הדגמה תחליף את הסצנות בטיוטה המקומית. להמשיך?")) return;
  button.disabled = true;
  button.textContent = "טוען תסריט...";
  try {
    const response = await fetch("/api/demo-script", {
      method: "POST", headers: {"Content-Type":"application/json"},
      body: JSON.stringify({portion})
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "שגיאה בשרת");
    project.portion = result.parasha;
    project.title = result.title;
    project.scenes = result.scenes;
    $("title").value = project.title;
    save(); render();
  } catch (error) {
    alert("לא ניתן לטעון תסריט: " + error.message + ". יש להפעיל את שרת האולפן המקומי.");
  } finally {
    button.disabled = false;
    button.textContent = "טען תסריט הדגמה מהמנוע";
  }
});
