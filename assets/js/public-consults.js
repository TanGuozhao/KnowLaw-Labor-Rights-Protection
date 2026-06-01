import { listPublicConsults } from "./api.js";

const keywordInput = document.getElementById("publicConsultsKeyword");
const searchBtn = document.getElementById("publicConsultsSearchBtn");
const statusEl = document.getElementById("publicConsultsStatus");
const listEl = document.getElementById("publicConsultsList");
const moreBtn = document.getElementById("publicConsultsMoreBtn");

let currentKeyword = "";
let currentPage = 1;
let total = 0;
let loading = false;

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function setStatus(text) {
  if (!statusEl) return;
  statusEl.textContent = text || "";
}

function renderItems(items, { append } = { append: false }) {
  if (!listEl) return;
  const arr = Array.isArray(items) ? items : [];
  if (!append) listEl.innerHTML = "";

  if (!arr.length && !append) {
    listEl.innerHTML = `<div class="public-consults-empty">未找到可展示的咨询问答。你可以换个关键词再试试。</div>`;
    return;
  }

  const html = arr
    .map((it) => {
      const pkid = String(it?.pkid || "").trim();
      const title = escapeHtml(it?.consulttitle || "（未命名）");
      const time = escapeHtml(it?.consulttime || "");
      const type = escapeHtml(it?.consulttype || "");
      const meta = [
        time ? `<span>咨询时间：${time}</span>` : "",
        type ? `<span>类别：${type}</span>` : "",
      ]
        .filter(Boolean)
        .join("");
      return `<div class="public-consults-card">
        <div class="public-consults-title">${title}</div>
        <div class="public-consults-meta">${meta}</div>
      </div>`;
    })
    .join("");
  if (append) {
    listEl.insertAdjacentHTML("beforeend", html);
  } else {
    listEl.innerHTML = html;
  }
}

function syncMoreButton() {
  if (!moreBtn) return;
  const reachedEnd = total && currentPage * 15 >= total;
  moreBtn.disabled = loading || reachedEnd;
  moreBtn.textContent = reachedEnd ? "已到末尾" : loading ? "加载中..." : "加载更多";
}

async function loadPage({ reset } = { reset: false }) {
  if (loading) return;
  loading = true;
  syncMoreButton();
  if (reset) setStatus("正在加载...");

  try {
    const pageSize = 15;
    const data = await listPublicConsults({
      keyword: currentKeyword,
      type: "zxlx",
      pageNum: currentPage,
      pageSize,
    });
    total = Number(data?.total || 0);
    const list = Array.isArray(data?.list) ? data.list : [];
    renderItems(list, { append: !reset });
    setStatus(total ? `共找到 ${total} 条结果` : "");
  } catch (e) {
    if (!reset) return;
    setStatus(e?.message || "加载失败，请稍后重试");
    if (listEl) listEl.innerHTML = `<div class="public-consults-empty">${escapeHtml(e?.message || "加载失败")}</div>`;
  } finally {
    loading = false;
    syncMoreButton();
  }
}

function doSearch() {
  currentKeyword = String(keywordInput?.value || "").trim();
  currentPage = 1;
  total = 0;
  void loadPage({ reset: true });
}

if (searchBtn) {
  searchBtn.addEventListener("click", doSearch);
}

if (keywordInput) {
  keywordInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      doSearch();
    }
  });
}

if (moreBtn) {
  moreBtn.addEventListener("click", () => {
    currentPage += 1;
    void loadPage({ reset: false });
  });
}

syncMoreButton();
void loadPage({ reset: true });


