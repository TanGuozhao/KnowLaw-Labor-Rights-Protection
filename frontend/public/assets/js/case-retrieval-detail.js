import { getLawInfo } from "./api.js";
import {
  buildCaseDetailDocumentHtml,
  buildLawDetailDocumentHtml,
  escapeHtml,
  extractLawInfoText,
  loadRetrievalDetailEntry,
  richTextToPlainText,
} from "./case-retrieval-common.js";
import { setupProtectedPage } from "./page-auth.js";

const mainUserWelcome = document.getElementById("mainUserWelcome");
const mainLogoutBtn = document.getElementById("mainLogoutBtn");
const caseDetailView = document.getElementById("caseDetailView");
const caseDetailBackBtn = document.getElementById("caseDetailBackBtn");
const caseDetailPrintBtn = document.getElementById("caseDetailPrintBtn");

setupProtectedPage({ welcomeEl: mainUserWelcome, logoutEl: mainLogoutBtn });

function setBackHref(url) {
  if (!caseDetailBackBtn) return;
  caseDetailBackBtn.href = String(url || "/case-retrieval");
}

function renderError(message) {
  if (!caseDetailView) return;
  caseDetailView.innerHTML = `
    <div class="case-detail-state case-detail-state--error">
      <h1 class="case-detail-state-title">详情加载失败</h1>
      <p class="case-detail-state-text">${escapeHtml(String(message || "请返回检索页后重试。"))}</p>
    </div>
  `;
}

function renderLoading(message = "正在加载详情...") {
  if (!caseDetailView) return;
  caseDetailView.innerHTML = `
    <div class="case-detail-state">
      <h1 class="case-detail-state-title">正在准备文书</h1>
      <p class="case-detail-state-text">${escapeHtml(String(message))}</p>
    </div>
  `;
}

async function hydrateLawPayload(rawData) {
  const payload = rawData && typeof rawData === "object" ? { ...rawData } : {};
  const lawId = String(payload?.lawId || payload?.law_id || payload?.id || "").trim();
  if (!lawId) return payload;

  try {
    const result = await getLawInfo(lawId, true);
    const text = extractLawInfoText(result?.lawInfo || result);
    if (String(text || "").trim()) {
      payload.text = text;
    }
  } catch {
    /* 使用列表页已缓存的摘要作为兜底 */
  }

  return payload;
}

async function init() {
  const params = new URLSearchParams(window.location.search);
  const detailId = String(params.get("entry") || "").trim();
  if (!detailId) {
    renderError("缺少详情参数，无法定位当前类案。");
    return;
  }

  const entry = loadRetrievalDetailEntry(detailId);
  if (!entry) {
    renderError("未找到当前类案的缓存数据，请返回检索页重新打开。");
    return;
  }

  setBackHref(entry?.searchUrl);

  if (entry?.kind === "law") {
    renderLoading("正在加载法规全文...");
    const lawPayload = await hydrateLawPayload(entry?.data);
    if (!caseDetailView) return;
    caseDetailView.innerHTML = buildLawDetailDocumentHtml(lawPayload);
    document.title = `${richTextToPlainText(lawPayload?.title || lawPayload?.name || "法规详情")} - 知法 Legal`;
    caseDetailView.scrollTop = 0;
    return;
  }

  if (entry?.kind !== "case") {
    renderError("当前检索结果类型暂不支持展示。");
    return;
  }

  if (!caseDetailView) return;
  caseDetailView.innerHTML = buildCaseDetailDocumentHtml(entry?.data || {});
  document.title = `${richTextToPlainText(entry?.data?.title || entry?.data?.caseName || "类案详情")} - 知法 Legal`;
  caseDetailView.scrollTop = 0;
}

if (caseDetailPrintBtn) {
  caseDetailPrintBtn.addEventListener("click", () => window.print());
}

void init();
