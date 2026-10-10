const $ = id => document.getElementById(id);
let items = [];
let editingId = null;
const fields = ["kind","category","title_fa","title_en","summary_fa","summary_en","body_fa","body_en","image_url","link_url"];
function esc(v="") { return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
async function api(url, options={}) {
  const res = await fetch(url, { credentials:"same-origin", ...options, headers: { ...(options.body instanceof FormData ? {} : {"Content-Type":"application/json"}), ...(options.headers||{}) } });
  const type = res.headers.get("content-type") || "";
  const body = type.includes("application/json") ? await res.json() : await res.text();
  if (res.status === 401) { location.href = "/admin/login"; throw new Error("Please sign in again."); }
  if (!res.ok) throw new Error(body.error || body || "Request failed.");
  return body;
}
function getPayload() {
  const p = {};
  fields.forEach(f => p[f] = $(f).value);
  p.published = $("published").checked ? 1 : 0;
  return p;
}
function resetForm() {
  editingId = null;
  $("contentForm").reset();
  $("published").checked = true;
  $("contentId").value = "";
  $("formTitle").textContent = "Add new content";
  $("saveBtn").textContent = "SAVE CONTENT";
  $("message").textContent = "";
}
function renderList() {
  $("contentCount").textContent = items.length;
  if (!items.length) { $("contentList").innerHTML = '<p class="note">No content yet. Add your first item using the form.</p>'; return; }
  $("contentList").innerHTML = items.map(item => `<article class="content-row"><div class="row-main"><strong>${esc(item.title_en)} <span class="status ${item.published ? "" : "off"}">${item.published ? "LIVE" : "DRAFT"}</span></strong><small>${esc(item.title_fa)} · ${esc(item.kind.toUpperCase())} · #${item.id}</small><div class="row-actions"><button class="mini edit" data-edit="${item.id}">EDIT</button><button class="mini delete" data-delete="${item.id}">DELETE</button></div></div></article>`).join("");
  $("contentList").querySelectorAll("[data-edit]").forEach(btn => btn.addEventListener("click", () => editItem(Number(btn.dataset.edit))));
  $("contentList").querySelectorAll("[data-delete]").forEach(btn => btn.addEventListener("click", () => deleteItem(Number(btn.dataset.delete))));
}
async function refresh() { items = await api("/api/admin/content"); renderList(); }
function editItem(id) {
  const item = items.find(x => x.id === id);
  if (!item) return;
  editingId = id;
  fields.forEach(f => $(f).value = item[f] ?? "");
  $("published").checked = Boolean(item.published);
  $("formTitle").textContent = `Edit content #${id}`;
  $("saveBtn").textContent = "UPDATE CONTENT";
  $("message").textContent = "";
  window.scrollTo({top:0,behavior:"smooth"});
}
async function deleteItem(id) {
  const item = items.find(x => x.id === id);
  if (!item || !confirm(`Delete "${item.title_en}"? This cannot be undone.`)) return;
  try { await api(`/api/admin/content/${id}`, {method:"DELETE"}); await refresh(); if (editingId === id) resetForm(); }
  catch(e) { alert(e.message); }
}
$("contentForm").addEventListener("submit", async e => {
  e.preventDefault();
  $("message").textContent = "Saving...";
  try {
    const payload = getPayload();
    if (editingId) await api(`/api/admin/content/${editingId}`, {method:"PUT", body:JSON.stringify(payload)});
    else await api("/api/admin/content", {method:"POST", body:JSON.stringify(payload)});
    $("message").textContent = "Saved successfully.";
    resetForm();
    await refresh();
  } catch(err) { $("message").textContent = err.message; }
});
$("resetBtn").addEventListener("click", resetForm);
$("uploadBtn").addEventListener("click", async () => {
  const file = $("imageFile").files[0];
  if (!file) { $("message").textContent = "Choose an image first."; return; }
  const fd = new FormData(); fd.append("image", file);
  $("message").textContent = "Uploading image...";
  try {
    const result = await api("/api/admin/upload", {method:"POST", body:fd});
    $("image_url").value = result.url;
    $("message").textContent = "Image uploaded. Save the content to publish it.";
  } catch(e) { $("message").textContent = e.message; }
});
(async () => {
  try { await api("/api/admin/me"); await refresh(); }
  catch(e) { $("contentList").innerHTML = `<p class="note">${esc(e.message)}</p>`; }
})();
