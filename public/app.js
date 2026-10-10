const state = { lang: localStorage.getItem("rz-lang") || "fa" };
const labels = { news: {fa:"خبر",en:"NEWS"}, game:{fa:"بازی",en:"GAME"}, download:{fa:"دانلود",en:"DOWNLOAD"}, article:{fa:"مقاله",en:"GUIDE"} };
const $ = (sel) => document.querySelector(sel);
function escapeHtml(value="") {
  return String(value).replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
}
function applyLanguage() {
  const en = state.lang === "en";
  document.documentElement.lang = en ? "en" : "fa";
  document.documentElement.dir = en ? "ltr" : "rtl";
  document.body.dir = en ? "ltr" : "rtl";
  document.body.classList.toggle("ltr", en);
  document.querySelectorAll("[data-fa][data-en]").forEach(el => {
    el.innerHTML = en ? el.dataset.en : el.dataset.fa;
  });
  $("#langToggle").textContent = en ? "فارسی / EN" : "EN / فارسی";
  localStorage.setItem("rz-lang", state.lang);
  loadContent();
}
$("#langToggle").addEventListener("click", () => { state.lang = state.lang === "fa" ? "en" : "fa"; applyLanguage(); });
function card(item) {
  const en = state.lang === "en";
  const title = en ? item.title_en : item.title_fa;
  const summary = en ? item.summary_en : item.summary_fa;
  const tag = labels[item.kind]?.[state.lang] || item.kind;
  const image = item.image_url ? `<img src="${escapeHtml(item.image_url)}" alt="" loading="lazy" onerror="this.remove()">` : "";
  const link = item.link_url ? `<a href="${escapeHtml(item.link_url)}" ${/^https?:\/\//i.test(item.link_url) ? 'target="_blank" rel="noopener noreferrer"' : ''}>${en ? "OPEN ↗" : "مشاهده ↗"}</a>` : `<span>${en ? "REDZONE" : "ردزون"}</span>`;
  return `<article class="content-card"><div class="card-image">${image}<span class="card-tag">${escapeHtml(tag)}</span></div><div class="card-body"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(summary || "")}</p><div class="card-foot"><span>${escapeHtml(item.category || "REDZONE")}</span>${link}</div></div></article>`;
}
function downloadItem(item) {
  const en = state.lang === "en";
  const title = en ? item.title_en : item.title_fa;
  const summary = en ? item.summary_en : item.summary_fa;
  const link = item.link_url ? `<a href="${escapeHtml(item.link_url)}" ${/^https?:\/\//i.test(item.link_url) ? 'target="_blank" rel="noopener noreferrer"' : ''}>${en ? "GET ↗" : "دریافت ↗"}</a>` : `<span>—</span>`;
  return `<article class="download-item"><div class="download-icon">↓</div><div class="download-copy"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(summary || item.category || "")}</p></div>${link}</article>`;
}
async function loadContent() {
  const containers = { news: $("#newsCards"), game: $("#gameCards"), download: $("#downloadCards"), article: $("#articleCards") };
  try {
    const res = await fetch("/api/content");
    if (!res.ok) throw new Error("Could not load content");
    const data = await res.json();
    for (const [kind, container] of Object.entries(containers)) {
      const rows = data.filter(x => x.kind === kind);
      container.innerHTML = rows.length ? rows.map(kind === "download" ? downloadItem : card).join("") :
        `<div class="empty">${state.lang === "en" ? "Nothing here yet — add content from the admin panel." : "هنوز محتوایی نیست؛ از پنل ادمین اضافه کن."}</div>`;
    }
  } catch {
    Object.values(containers).forEach(c => c.innerHTML = `<div class="empty">${state.lang === "en" ? "Could not connect to the server." : "اتصال به سرور برقرار نشد."}</div>`);
  }
}
$("#year").textContent = new Date().getFullYear();
applyLanguage();
