import { retrievalCases } from "./api.js";
import {
  buildRetrievalSearchUrl,
  escapeHtml,
  firstNonEmptyText,
  getCaseCoreFields,
  storeRetrievalDetailEntry,
  toPlainTextForMatch,
  toRichTextHtml,
} from "./case-retrieval-common.js";
import { setupProtectedPage } from "./page-auth.js";

const mainUserWelcome = document.getElementById("mainUserWelcome");
const mainLogoutBtn = document.getElementById("mainLogoutBtn");
const retrievalSearchInput = document.getElementById("retrievalSearchInput");
const retrievalSearchBtn = document.getElementById("retrievalSearchBtn");
const retrievalTypeSelect = document.getElementById("retrievalTypeSelect");
const retrievalTimeRangeSelect = document.getElementById("retrievalTimeRangeSelect");
const retrievalCourtLevelSelect = document.getElementById("retrievalCourtLevelSelect");
const retrievalLawLevelSelect = document.getElementById("retrievalLawLevelSelect");
const retrievalStatus = document.getElementById("retrievalStatus");
const caseList = document.getElementById("caseList");
const resultsPagination = document.getElementById("resultsPagination");
const prevPageBtn = document.getElementById("prevPageBtn");
const nextPageBtn = document.getElementById("nextPageBtn");
const pageNumbers = document.getElementById("pageNumbers");
const pageJumpInput = document.getElementById("pageJumpInput");
const pageJumpBtn = document.getElementById("pageJumpBtn");

const RESULTS_PER_PAGE = 9;
const RETRIEVAL_LIST_CACHE_KEY = "zhifa.caseRetrievalListCacheV1";
const RETRIEVAL_CACHE_MAX_AGE_MS = 3 * 60 * 60 * 1000;

let pendingFocusCaseNo = "";
let paginationState = {
  items: [],
  currentPage: 1,
  totalPages: 1,
  renderCard: null,
  openItem: null,
};

setupProtectedPage({ welcomeEl: mainUserWelcome, logoutEl: mainLogoutBtn });

function setRetrievalStatus(message, kind = "info") {
  if (!retrievalStatus) return;
  retrievalStatus.textContent = String(message || "");
  retrievalStatus.dataset.kind = kind;
}

function getSelectedRetrievalType() {
  const value = String(retrievalTypeSelect?.value || "auto").trim().toLowerCase();
  return ["auto", "case", "law"].includes(value) ? value : "auto";
}

function getSelectedRetrievalTimeRange() {
  const value = String(retrievalTimeRangeSelect?.value || "all").trim().toLowerCase();
  return ["all", "1y", "3y", "5y", "10y"].includes(value) ? value : "all";
}

function getSelectedRetrievalCourtLevel() {
  const value = String(retrievalCourtLevelSelect?.value || "national").trim().toLowerCase();
  return ["national", "province", "intermediate", "high", "supreme"].includes(value) ? value : "national";
}

function getSelectedRetrievalLawLevel() {
  const value = String(retrievalLawLevelSelect?.value || "all").trim().toLowerCase();
  return ["all", "law", "admin_regulation", "judicial_interpretation", "local_regulation"].includes(value)
    ? value
    : "all";
}

function shouldEnableRewrite(query, retrievalType) {
  const q = String(query || "").trim();
  if (!q) return false;
  const mode = String(retrievalType || "auto").toLowerCase();
  const tokenCount = q.split(/[，,。.;；、\s]+/).filter(Boolean).length;
  if (mode === "case" && q.length <= 8 && tokenCount <= 2) return false;
  if (q.length <= 6 && tokenCount <= 2) return false;
  return true;
}

function getCurrentSearchUrl({ focusCaseNo = "" } = {}) {
  return buildRetrievalSearchUrl({
    keyword: String(retrievalSearchInput?.value || "").trim(),
    retrievalType: getSelectedRetrievalType(),
    timeRange: getSelectedRetrievalTimeRange(),
    courtLevel: getSelectedRetrievalCourtLevel(),
    lawLevel: getSelectedRetrievalLawLevel(),
    focusCaseNo,
  });
}

function rememberSearchUrl({ focusCaseNo = "" } = {}) {
  window.history.replaceState({}, "", getCurrentSearchUrl({ focusCaseNo }));
}

function getRetrievalCacheState() {
  return {
    q: String(retrievalSearchInput?.value || "").trim(),
    retrievalType: getSelectedRetrievalType(),
    timeRange: getSelectedRetrievalTimeRange(),
    courtLevel: getSelectedRetrievalCourtLevel(),
    lawLevel: getSelectedRetrievalLawLevel(),
  };
}

function retrievalCacheStateEqual(a, b) {
  if (!a || !b) return false;
  return (
    a.q === b.q &&
    a.retrievalType === b.retrievalType &&
    a.timeRange === b.timeRange &&
    a.courtLevel === b.courtLevel &&
    a.lawLevel === b.lawLevel
  );
}

function saveRetrievalListCache(result) {
  if (typeof sessionStorage === "undefined") return;
  try {
    const state = getRetrievalCacheState();
    if (!state.q) return;
    sessionStorage.setItem(RETRIEVAL_LIST_CACHE_KEY, JSON.stringify({ state, result, t: Date.now() }));
  } catch {
    /* 单条结果过大或禁用存储时忽略 */
  }
}

function loadRetrievalListCache() {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(RETRIEVAL_LIST_CACHE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (!o?.state || !o?.result) return null;
    if (Date.now() - Number(o.t || 0) > RETRIEVAL_CACHE_MAX_AGE_MS) return null;
    return o;
  } catch {
    return null;
  }
}

function resetRetrievalUiControls() {
  if (retrievalSearchBtn) {
    retrievalSearchBtn.disabled = false;
    retrievalSearchBtn.textContent = "搜索";
  }
  if (retrievalSearchInput) retrievalSearchInput.disabled = false;
}

function applyRetrievalStateFromCache(state) {
  if (!state || typeof state !== "object") return;
  if (retrievalSearchInput && state.q) retrievalSearchInput.value = String(state.q);
  if (retrievalTypeSelect && ["auto", "case", "law"].includes(String(state.retrievalType || ""))) {
    retrievalTypeSelect.value = state.retrievalType;
  }
  if (retrievalTimeRangeSelect && ["all", "1y", "3y", "5y", "10y"].includes(String(state.timeRange || ""))) {
    retrievalTimeRangeSelect.value = state.timeRange;
  }
  if (
    retrievalCourtLevelSelect &&
    ["national", "province", "intermediate", "high", "supreme"].includes(String(state.courtLevel || ""))
  ) {
    retrievalCourtLevelSelect.value = state.courtLevel;
  }
  if (
    retrievalLawLevelSelect &&
    ["all", "law", "admin_regulation", "judicial_interpretation", "local_regulation"].includes(String(state.lawLevel || ""))
  ) {
    retrievalLawLevelSelect.value = state.lawLevel;
  }
}

function openRetrievalDetail(entry) {
  const detailId = storeRetrievalDetailEntry(entry);
  if (!detailId) {
    setRetrievalStatus("详情暂存失败，请稍后重试。", "error");
    return;
  }
  window.location.href = `/case-retrieval-detail?entry=${encodeURIComponent(detailId)}`;
}

function buildMetaInlineSegment(label, valueHtml, options = {}) {
  const hideWhenEmpty = Boolean(options.hideWhenEmpty);
  if (hideWhenEmpty && !valueHtml) return "";
  const inner =
    valueHtml ||
    '<span class="case-card-inline-empty" aria-label="暂无">—</span>';
  return `<span class="case-card-inline"><span class="case-card-meta-k">${label}</span> <span class="case-card-inline-val">${inner}</span></span>`;
}

function joinMetaSegments(segments) {
  const parts = segments.filter(Boolean);
  if (!parts.length) return "";
  return `<div class="case-card-meta-line">${parts.join('<span class="case-card-meta-sep" aria-hidden="true">·</span>')}</div>`;
}

function createCaseCard(item) {
  const fields = getCaseCoreFields(item);
  const titleHtml = toRichTextHtml(fields.title || "（未命名案例）");
  const courtHtml = toRichTextHtml(fields.court);
  const dateHtml = toRichTextHtml(fields.date);
  const caseNoHtml = toRichTextHtml(fields.caseNo);
  const caseTypeHtml = toRichTextHtml(fields.caseType);
  const levelHtml = toRichTextHtml(fields.level);

  const mainLine = joinMetaSegments([
    buildMetaInlineSegment("法院", courtHtml),
    buildMetaInlineSegment("日期", dateHtml),
    buildMetaInlineSegment("案号", caseNoHtml),
  ]);
  const subLine = joinMetaSegments([
    buildMetaInlineSegment("类型", caseTypeHtml, { hideWhenEmpty: true }),
    buildMetaInlineSegment("审级", levelHtml, { hideWhenEmpty: true }),
  ]);

  const card = document.createElement("button");
  card.type = "button";
  card.className = "case-card";
  card.innerHTML = `
    <div class="case-card-head">
      <div class="case-card-title">${titleHtml}</div>
    </div>
    ${mainLine}
    ${subLine}
  `;
  return card;
}

function normalizeLawPayload(row) {
  return {
    title: row?.title || "",
    name: row?.name || row?.articleName || row?.subtitle || "",
    text: row?.text || row?.content || row?.detail || "",
    date: row?.date || row?.publishDate || row?.issueDate || "",
    lawId: row?.lawId || row?.law_id || row?.id || "",
  };
}

function createLawCard(row) {
  const payload = normalizeLawPayload(row);
  const titleHtml = toRichTextHtml(payload.title || "（未命名法规）");
  const articleHtml = toRichTextHtml(payload.name || "相关条文");
  const dateHtml = toRichTextHtml(payload.date);
  const lawIdHtml = toRichTextHtml(payload.lawId);

  const metaLine = joinMetaSegments([
    buildMetaInlineSegment("条文", articleHtml),
    buildMetaInlineSegment("日期", dateHtml),
    buildMetaInlineSegment("法规ID", lawIdHtml),
  ]);

  const card = document.createElement("button");
  card.type = "button";
  card.className = "case-card case-card--law";
  card.innerHTML = `
    <div class="case-card-head">
      <div class="case-card-title">${titleHtml}</div>
    </div>
    ${metaLine}
  `;
  return card;
}

function normalizeMixedLawPayload(row) {
  const lawRow = row?.item || {};
  return {
    title: row?.title || lawRow?.title || lawRow?.lawTitle || lawRow?.lawName || "",
    name: row?.subtitle || lawRow?.name || lawRow?.articleName || "",
    date: row?.date || lawRow?.publishDate || lawRow?.issueDate || "",
    lawId: lawRow?.lawId || lawRow?.law_id || lawRow?.id || "",
    text:
      lawRow?.text ||
      lawRow?.content ||
      lawRow?.lawContent ||
      lawRow?.detail ||
      lawRow?.detailText ||
      lawRow?.articleText ||
      lawRow?.fullText ||
      "",
  };
}

function createMixedCard(row) {
  if (row?.type === "law") {
    return createLawCard(normalizeMixedLawPayload(row));
  }

  const item = row?.item || {};
  const fields = getCaseCoreFields(item);
  const titleHtml = toRichTextHtml(fields.title || "（未命名案例）");
  const courtHtml = toRichTextHtml(fields.court);
  const dateHtml = toRichTextHtml(fields.date);
  const caseNoHtml = toRichTextHtml(fields.caseNo);
  const score = Number(row?.score || 0);

  const scoreSeg =
    Number.isFinite(score) && score > 0
      ? buildMetaInlineSegment("相关度", `<strong>${score.toFixed(3)}</strong>`)
      : "";
  const metaLine = joinMetaSegments([
    buildMetaInlineSegment("法院", courtHtml),
    buildMetaInlineSegment("日期", dateHtml),
    buildMetaInlineSegment("案号", caseNoHtml),
    scoreSeg,
  ]);

  const card = document.createElement("button");
  card.type = "button";
  card.className = "case-card";
  card.innerHTML = `
    <div class="case-card-head">
      <div class="case-card-title">${titleHtml}</div>
    </div>
    ${metaLine}
  `;
  return card;
}

function hidePagination() {
  if (resultsPagination) resultsPagination.style.display = "none";
}

function updatePaginationBar() {
  if (!resultsPagination || !prevPageBtn || !nextPageBtn || !pageNumbers) return;
  const totalPages = Math.max(1, Number(paginationState.totalPages || 1));
  const currentPage = Math.min(totalPages, Math.max(1, Number(paginationState.currentPage || 1)));
  prevPageBtn.disabled = currentPage <= 1;
  nextPageBtn.disabled = currentPage >= totalPages;
  pageNumbers.innerHTML = "";
  const startPage = Math.max(1, currentPage - 4);
  const endPage = Math.min(totalPages, currentPage + 4);
  for (let page = startPage; page <= endPage; page += 1) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `page-btn${page === currentPage ? " active" : ""}`;
    btn.textContent = String(page);
    btn.addEventListener("click", () => gotoPage(page));
    pageNumbers.appendChild(btn);
  }
  if (pageJumpInput) {
    pageJumpInput.max = String(totalPages);
    pageJumpInput.value = String(currentPage);
  }
  resultsPagination.style.display = "flex";
}

function renderCurrentPageItems() {
  if (!caseList) return;
  caseList.innerHTML = "";
  const allItems = Array.isArray(paginationState.items) ? paginationState.items : [];
  if (!allItems.length || typeof paginationState.renderCard !== "function") {
    hidePagination();
    return;
  }

  const totalPages = Math.max(1, Math.ceil(allItems.length / RESULTS_PER_PAGE));
  paginationState.totalPages = totalPages;
  paginationState.currentPage = Math.min(totalPages, Math.max(1, paginationState.currentPage));

  const start = (paginationState.currentPage - 1) * RESULTS_PER_PAGE;
  const end = Math.min(start + RESULTS_PER_PAGE, allItems.length);
  const currentPageItems = allItems.slice(start, end);

  currentPageItems.forEach((item, offset) => {
    const globalIndex = start + offset;
    const card = paginationState.renderCard(item, globalIndex);
    if (!(card instanceof HTMLElement)) return;
    card.addEventListener("click", () => {
      if (typeof paginationState.openItem === "function") {
        paginationState.openItem(item, globalIndex);
      }
    });
    caseList.appendChild(card);
  });

  updatePaginationBar();
}

function gotoPage(pageNo) {
  const totalPages = Math.max(1, Number(paginationState.totalPages || 1));
  const target = Math.min(totalPages, Math.max(1, Number(pageNo || 1)));
  paginationState.currentPage = target;
  renderCurrentPageItems();
}

function setupPagination(items, { renderCard, openItem, initialIndex = 0 } = {}) {
  paginationState.items = Array.isArray(items) ? items : [];
  paginationState.renderCard = typeof renderCard === "function" ? renderCard : null;
  paginationState.openItem = typeof openItem === "function" ? openItem : null;
  const safeIndex = Math.max(0, Math.min(paginationState.items.length - 1, Number(initialIndex || 0)));
  paginationState.currentPage = paginationState.items.length ? Math.floor(safeIndex / RESULTS_PER_PAGE) + 1 : 1;
  paginationState.totalPages = Math.max(1, Math.ceil((paginationState.items.length || 1) / RESULTS_PER_PAGE));
  renderCurrentPageItems();
}

function renderPlaceholderCard(title, meta = "") {
  if (!caseList) return;
  const card = document.createElement("div");
  card.className = "case-card case-card--placeholder";
  card.innerHTML = `
    <div class="case-card-head">
      <div class="case-card-title">${escapeHtml(title)}</div>
    </div>
    ${meta ? `<div class="case-card-placeholder-text">${escapeHtml(meta)}</div>` : ""}
  `;
  caseList.innerHTML = "";
  caseList.appendChild(card);
}

function extractLawRows(result) {
  const source = Array.isArray(result?.laws) ? result.laws : [];
  const rows = [];

  source.forEach((law) => {
    const title = law?.title || law?.lawTitle || law?.lawName || law?.name || "（未命名法规）";
    const lawId = law?.lawId || law?.law_id || law?.id || "";
    const highlights = Array.isArray(law?.highlights) ? law.highlights : [];

    if (highlights.length) {
      highlights.forEach((item) => {
        rows.push({
          title,
          name: item?.name || item?.title || "相关条文",
          text: item?.text || "",
          lawId,
          date: law?.publishDate || law?.issueDate || law?.date || "",
        });
      });
      return;
    }

    rows.push({
      title,
      name: law?.name || law?.articleName || law?.levelName || "法规内容",
      text:
        law?.text ||
        law?.content ||
        law?.lawContent ||
        law?.summary ||
        law?.abstract ||
        law?.articleText ||
        law?.fullText ||
        "",
      lawId,
      date: law?.publishDate || law?.issueDate || law?.date || "",
    });
  });

  return rows;
}

function renderCaseResult(result, { silentStatus = false } = {}) {
  const rows = Array.isArray(result?.cases) ? result.cases : [];
  if (!rows.length) {
    renderPlaceholderCard("未获取到可展示的类案列表");
    hidePagination();
    if (!silentStatus) setRetrievalStatus("检索完成：未找到可展示的类案结果。", "warn");
    return;
  }

  const focusNo = toPlainTextForMatch(pendingFocusCaseNo);
  let selectedIndex = 0;
  if (focusNo) {
    const idx = rows.findIndex((item) => {
      const rawNo = item?.caseNumber || item?.caseNo || item?.docNo || "";
      const caseNoPlain = toPlainTextForMatch(rawNo);
      return caseNoPlain && (caseNoPlain.includes(focusNo) || focusNo.includes(caseNoPlain));
    });
    if (idx >= 0) selectedIndex = idx;
  }

  setupPagination(rows, {
    initialIndex: selectedIndex,
    renderCard: (item) => createCaseCard(item),
    openItem: (item) => {
      const focusCaseNo = firstNonEmptyText(item?.caseNumber, item?.caseNo, item?.docNo);
      openRetrievalDetail({
        kind: "case",
        data: item,
        searchUrl: getCurrentSearchUrl({ focusCaseNo }),
      });
    },
  });

  pendingFocusCaseNo = "";
  if (!silentStatus) setRetrievalStatus(`检索完成：已加载 ${rows.length} 条类案结果。`, "success");
}

function renderLawResult(result, { silentStatus = false } = {}) {
  const rows = extractLawRows(result);
  if (!rows.length) {
    renderPlaceholderCard("未获取到可展示的法规列表");
    hidePagination();
    if (!silentStatus) setRetrievalStatus("检索完成：未找到可展示的法规结果。", "warn");
    return;
  }

  setupPagination(rows, {
    initialIndex: 0,
    renderCard: (row) => createLawCard(row),
    openItem: (row) => {
      openRetrievalDetail({
        kind: "law",
        data: normalizeLawPayload(row),
        searchUrl: getCurrentSearchUrl(),
      });
    },
  });
  if (!silentStatus) setRetrievalStatus(`检索完成：已加载 ${rows.length} 条法规结果。`, "success");
}

function renderMixedResult(result, { silentStatus = false } = {}) {
  const rows = Array.isArray(result?.results) ? result.results : [];
  if (!rows.length) {
    renderPlaceholderCard("暂无检索结果", "请尝试调整关键词或筛选条件。");
    hidePagination();
    if (!silentStatus) setRetrievalStatus("检索完成：当前没有可展示的混合结果。", "warn");
    return;
  }

  setupPagination(rows, {
    initialIndex: 0,
    renderCard: (row) => createMixedCard(row),
    openItem: (row) => {
      if (row?.type === "law") {
        openRetrievalDetail({
          kind: "law",
          data: normalizeMixedLawPayload(row),
          searchUrl: getCurrentSearchUrl(),
        });
        return;
      }

      const item = row?.item || {};
      const focusCaseNo = firstNonEmptyText(item?.caseNumber, item?.caseNo, item?.docNo);
      openRetrievalDetail({
        kind: "case",
        data: item,
        searchUrl: getCurrentSearchUrl({ focusCaseNo }),
      });
    },
  });

  const lawCount = rows.filter((row) => row?.type === "law").length;
  const caseCount = rows.filter((row) => row?.type !== "law").length;
  if (!silentStatus) {
    setRetrievalStatus(`检索完成：混合结果 ${rows.length} 条（类案 ${caseCount} / 法规 ${lawCount}）。`, "success");
  }
}

function renderTipResult(result, { silentStatus = false } = {}) {
  const tips = String(result?.queryTips || "请输入法律相关问题，我会自动选择检索类型。");
  renderPlaceholderCard("检索提示", tips);
  hidePagination();
  if (!silentStatus) setRetrievalStatus("检索完成：当前输入更适合咨询问答而非检索。", "warn");
}

function renderSearchResult(result, selectedType = "auto", options = {}) {
  const silentStatus = Boolean(options.silentStatus);
  if (silentStatus) setRetrievalStatus("", "info");

  const mode = String(result?.retrievalType || "case");
  const hasMixed = Array.isArray(result?.results) && result.results.length > 0;
  if (hasMixed && (selectedType === "auto" || mode === "mixed")) {
    renderMixedResult(result, { silentStatus });
    return;
  }
  if (mode === "law") {
    renderLawResult(result, { silentStatus });
    return;
  }
  if (mode === "other") {
    renderTipResult(result, { silentStatus });
    return;
  }
  renderCaseResult(result, { silentStatus });
}

async function performRetrieval(keyword, triggerButton) {
  const query = String(keyword || "").trim();
  if (!query) {
    setRetrievalStatus("请输入关键词后再检索。", "warn");
    return false;
  }

  rememberSearchUrl();
  setRetrievalStatus("正在检索，请稍候...", "loading");

  if (triggerButton) {
    triggerButton.disabled = true;
    triggerButton.textContent = "检索中...";
  }
  if (retrievalSearchInput) retrievalSearchInput.disabled = true;

  try {
    const selectedType = getSelectedRetrievalType();
    const rewriteEnabled = shouldEnableRewrite(query, selectedType);
    const result = await retrievalCases({
      message: query,
      retrievalType: selectedType,
      timeRange: getSelectedRetrievalTimeRange(),
      courtLevel: getSelectedRetrievalCourtLevel(),
      lawLevel: getSelectedRetrievalLawLevel(),
      rewrite: rewriteEnabled,
      rewriteMaxKeywords: rewriteEnabled ? 8 : 0,
    });
    renderSearchResult(result, selectedType);
    saveRetrievalListCache(result);
    return true;
  } catch (error) {
    renderPlaceholderCard(error?.message || "检索失败，请稍后重试");
    hidePagination();
    setRetrievalStatus(`检索失败：${error?.message || "请稍后重试"}`, "error");
    return false;
  } finally {
    if (triggerButton) {
      triggerButton.disabled = false;
      triggerButton.textContent = "搜索";
    }
    if (retrievalSearchInput) retrievalSearchInput.disabled = false;
  }
}

function triggerRetrieval() {
  const keyword = String(retrievalSearchInput?.value || "").trim();
  void performRetrieval(keyword, retrievalSearchBtn);
}

function initFromUrl() {
  resetRetrievalUiControls();

  const params = new URLSearchParams(window.location.search);
  const initialQuery = String(params.get("q") || params.get("query") || "").trim();
  const initialType = String(params.get("retrievalType") || "").trim().toLowerCase();
  const initialTimeRange = String(params.get("timeRange") || "").trim().toLowerCase();
  const initialCourtLevel = String(params.get("courtLevel") || "").trim().toLowerCase();
  const initialLawLevel = String(params.get("lawLevel") || "").trim().toLowerCase();
  const initialFocusCaseNo = String(params.get("focusCaseNo") || "").trim();

  if (retrievalSearchInput && initialQuery) retrievalSearchInput.value = initialQuery;
  if (retrievalTypeSelect && ["auto", "case", "law"].includes(initialType)) retrievalTypeSelect.value = initialType;
  if (retrievalTimeRangeSelect && ["all", "1y", "3y", "5y", "10y"].includes(initialTimeRange)) {
    retrievalTimeRangeSelect.value = initialTimeRange;
  }
  if (retrievalCourtLevelSelect && ["national", "province", "intermediate", "high", "supreme"].includes(initialCourtLevel)) {
    retrievalCourtLevelSelect.value = initialCourtLevel;
  }
  if (retrievalLawLevelSelect && ["all", "law", "admin_regulation", "judicial_interpretation", "local_regulation"].includes(initialLawLevel)) {
    retrievalLawLevelSelect.value = initialLawLevel;
  }
  if (initialFocusCaseNo) pendingFocusCaseNo = initialFocusCaseNo;

  const cached = loadRetrievalListCache();
  const stateAfterUrl = getRetrievalCacheState();

  if (initialQuery && cached && retrievalCacheStateEqual(stateAfterUrl, cached.state)) {
    renderSearchResult(cached.result, getSelectedRetrievalType(), { silentStatus: true });
    return;
  }

  const fromDetail =
    typeof document !== "undefined" &&
    document.referrer &&
    /case-retrieval-detail/i.test(document.referrer);
  if (!initialQuery && fromDetail && cached?.state?.q) {
    applyRetrievalStateFromCache(cached.state);
    rememberSearchUrl();
    renderSearchResult(cached.result, getSelectedRetrievalType(), { silentStatus: true });
    return;
  }

  if (initialQuery) {
    void performRetrieval(initialQuery, retrievalSearchBtn);
    return;
  }

  renderPlaceholderCard("输入关键词开始检索", "点击任一结果卡片后，将进入独立的类案详情页阅读文书。");
  hidePagination();
  setRetrievalStatus("就绪", "info");
}

if (retrievalSearchBtn) {
  retrievalSearchBtn.addEventListener("click", triggerRetrieval);
}

if (retrievalSearchInput) {
  retrievalSearchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      triggerRetrieval();
    }
  });
}

if (prevPageBtn) {
  prevPageBtn.addEventListener("click", () => gotoPage(paginationState.currentPage - 1));
}

if (nextPageBtn) {
  nextPageBtn.addEventListener("click", () => gotoPage(paginationState.currentPage + 1));
}

if (pageJumpBtn) {
  pageJumpBtn.addEventListener("click", () => gotoPage(Number(pageJumpInput?.value || 1)));
}

if (pageJumpInput) {
  pageJumpInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      gotoPage(Number(pageJumpInput.value || 1));
    }
  });
}

window.addEventListener("error", (event) => {
  setRetrievalStatus(`前端错误：${event?.error?.message || event?.message || "未知错误"}`, "error");
  resetRetrievalUiControls();
});

window.addEventListener("unhandledrejection", (event) => {
  const reason = event?.reason;
  setRetrievalStatus(`前端错误：${reason?.message || String(reason || "未知 Promise 错误")}`, "error");
  resetRetrievalUiControls();
});

window.addEventListener("pageshow", (event) => {
  if (event.persisted) resetRetrievalUiControls();
});

initFromUrl();
