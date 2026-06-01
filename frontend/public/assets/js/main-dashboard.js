import { chat, getLawInfo, retrievalCases } from "./api.js";
import { setupProtectedPage } from "./page-auth.js";

const dashboardWorkspace = document.getElementById("dashboardWorkspace");
const retrievalWorkspace = document.getElementById("retrievalWorkspace");
const legalServicesNav = document.getElementById("legalServicesNav");
const dashboardSearchInput = document.getElementById("dashboardSearchInput");
const dashboardSearchBtn = document.getElementById("dashboardSearchBtn");
const retrievalSearchInput = document.getElementById("retrievalSearchInput");
const retrievalSearchBtn = document.getElementById("retrievalSearchBtn");
const retrievalTypeSelect = document.getElementById("retrievalTypeSelect");
const retrievalTimeRangeSelect = document.getElementById("retrievalTimeRangeSelect");
const retrievalCourtLevelSelect = document.getElementById("retrievalCourtLevelSelect");
const retrievalLawLevelSelect = document.getElementById("retrievalLawLevelSelect");
const retrievalStatus = document.getElementById("retrievalStatus");
const chatLog = document.getElementById("chatLog");
const chatInput = document.getElementById("chatInput");
const sendBtn = document.getElementById("sendBtn");
const caseList = document.getElementById("caseList");
const resultsPagination = document.getElementById("resultsPagination");
const prevPageBtn = document.getElementById("prevPageBtn");
const nextPageBtn = document.getElementById("nextPageBtn");
const pageNumbers = document.getElementById("pageNumbers");
const pageJumpInput = document.getElementById("pageJumpInput");
const pageJumpBtn = document.getElementById("pageJumpBtn");
const caseDetail = document.getElementById("caseDetail");
const retrievalModeHint = document.getElementById("retrievalModeHint");
const retrievalDetailTitle = document.getElementById("retrievalDetailTitle");
const retrievalDetailSub = document.getElementById("retrievalDetailSub");
const lawInfoCache = new Map();
let lawDetailRequestToken = 0;
let pendingFocusCaseNo = "";
const RESULTS_PER_PAGE = 7;
let paginationState = {
  items: [],
  currentPage: 1,
  totalPages: 1,
  selectedGlobalIndex: -1,
  renderCard: null,
  selectItem: null,
};

setupProtectedPage();

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => {
    if (ch === "&") return "&amp;";
    if (ch === "<") return "&lt;";
    if (ch === ">") return "&gt;";
    if (ch === '"') return "&quot;";
    return "&#39;";
  });
}

/** Block + inline tags allowed after attribute stripping (no on*, src, style). */
const ALLOWED_RICH_HTML_TAGS = new Set([
  "EM",
  "STRONG",
  "B",
  "I",
  "U",
  "BR",
  "P",
  "SPAN",
  "MARK",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "DIV",
  "SECTION",
  "ARTICLE",
  "BLOCKQUOTE",
  "UL",
  "OL",
  "LI",
  "HR",
  "DL",
  "DT",
  "DD",
  "TABLE",
  "THEAD",
  "TBODY",
  "TFOOT",
  "TR",
  "TH",
  "TD",
  "CAPTION",
]);

function normalizeEmArtifacts(value) {
  let raw = String(value ?? "");
  raw = raw.replace(/<\s*\/\s*em\s*<\s*>/gi, "</em>");
  raw = raw.replace(/<\s*em\s*>\s*\/\s*em\s*<\s*>/gi, "</em>");
  raw = raw.replace(/\/\s*em\s*<\s*>/gi, "");
  return raw;
}

function sanitizeRichHtml(value) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${normalizeEmArtifacts(value)}</div>`, "text/html");
  const root = doc.body.firstElementChild;
  if (!root) return "";

  const walk = (node) => {
    const children = Array.from(node.childNodes);
    children.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        return;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) {
        child.remove();
        return;
      }

      const element = /** @type {HTMLElement} */ (child);
      walk(element);

      if (!ALLOWED_RICH_HTML_TAGS.has(element.tagName)) {
        element.replaceWith(...Array.from(element.childNodes));
        return;
      }

      Array.from(element.attributes).forEach((attr) => element.removeAttribute(attr.name));
    });
  };

  walk(root);
  return root.innerHTML;
}

function toRichTextHtml(value) {
  const raw = normalizeEmArtifacts(value);
  if (!raw.trim()) return "";
  const hasTag = /<\/?[a-z][^>]*>/i.test(raw);
  if (hasTag) {
    return sanitizeRichHtml(raw).replace(/\/\s*em\s*<\s*>/gi, "");
  }
  return escapeHtml(raw).replace(/\n/g, "<br>");
}

function toPlainTextForMatch(value) {
  return normalizeEmArtifacts(value)
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, "")
    .trim();
}

function setRetrievalMode(mode, selectedType = "auto") {
  if (selectedType === "case") {
    if (retrievalModeHint) retrievalModeHint.textContent = "手动模式：类案检索";
    if (retrievalDetailTitle) retrievalDetailTitle.textContent = "类案详情";
    if (retrievalDetailSub) retrievalDetailSub.textContent = "已按手动选择执行类案检索。";
    return;
  }
  if (selectedType === "law") {
    if (retrievalModeHint) retrievalModeHint.textContent = "手动模式：法规检索";
    if (retrievalDetailTitle) retrievalDetailTitle.textContent = "法规详情";
    if (retrievalDetailSub) retrievalDetailSub.textContent = "已按手动选择执行法规检索。";
    return;
  }

  if (mode === "law") {
    if (retrievalModeHint) retrievalModeHint.textContent = "已识别为法规检索";
    if (retrievalDetailTitle) retrievalDetailTitle.textContent = "法规详情";
    if (retrievalDetailSub) retrievalDetailSub.textContent = "展示法规条文与关键信息。";
    return;
  }
  if (mode === "other") {
    if (retrievalModeHint) retrievalModeHint.textContent = "已识别为非检索问题";
    if (retrievalDetailTitle) retrievalDetailTitle.textContent = "检索提示";
    if (retrievalDetailSub) retrievalDetailSub.textContent = "请按提示输入法律问题。";
    return;
  }
  if (retrievalModeHint) retrievalModeHint.textContent = "已识别为类案检索";
  if (retrievalDetailTitle) retrievalDetailTitle.textContent = "类案详情";
  if (retrievalDetailSub) retrievalDetailSub.textContent = "展示与问题相关的相似案例。";
}

function renderDetailEmpty(text = "暂无内容") {
  if (!caseDetail) return;
  caseDetail.innerHTML = `<div class="detail-empty">${escapeHtml(text)}</div>`;
}

function setRetrievalStatus(message, kind = "info") {
  if (!retrievalStatus) return;
  const colors = {
    info: "rgba(19,43,86,.78)",
    loading: "rgba(29,86,176,.95)",
    success: "rgba(26,120,70,.95)",
    error: "rgba(176,48,48,.95)",
    warn: "rgba(145,92,21,.95)",
  };
  retrievalStatus.textContent = String(message || "");
  retrievalStatus.style.color = colors[kind] || colors.info;
}

function triggerRetrievalFromInput(buttonRef = retrievalSearchBtn) {
  const keyword = String(retrievalSearchInput?.value || "").trim();
  void performRetrieval(keyword, buttonRef, getSelectedRetrievalType());
}

function appendMessage(roleLabel, text, isUser = false) {
  if (!chatLog) return;
  const item = document.createElement("div");
  item.className = isUser ? "chat-item user" : "chat-item";
  item.innerHTML = `<span class="role">${escapeHtml(roleLabel)}</span><p>${escapeHtml(String(text))}</p>`;
  chatLog.appendChild(item);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function enterRetrievalPage(keyword = "") {
  if (dashboardWorkspace && retrievalWorkspace) {
    dashboardWorkspace.classList.add("hidden");
    retrievalWorkspace.classList.remove("hidden");
  }
  if (retrievalSearchInput && keyword) {
    retrievalSearchInput.value = keyword;
  }
  if (retrievalTypeSelect && !retrievalTypeSelect.value) {
    retrievalTypeSelect.value = "auto";
  }
}

function backToDashboard() {
  if (dashboardWorkspace && retrievalWorkspace) {
    retrievalWorkspace.classList.add("hidden");
    dashboardWorkspace.classList.remove("hidden");
  }
}

function renderCaseDetail(item) {
  if (!item) return renderDetailEmpty();
  const title = toRichTextHtml(item?.title || item?.caseName || item?.name || "（未命名案例）");
  const court = toRichTextHtml(item?.court || item?.courtName || "");
  const date = toRichTextHtml(item?.judgementDate || item?.judgementTime || item?.date || "");
  const caseNo = toRichTextHtml(item?.caseNumber || item?.caseNo || item?.docNo || "");
  const caseType = toRichTextHtml(item?.caseType || "");
  const level = toRichTextHtml(item?.levelOfTrial || "");
  const content = toRichTextHtml(item?.content || "");

  if (!caseDetail) return;
  caseDetail.innerHTML = `
    <div style="font-weight: 700; font-size: 16px; line-height: 1.5; overflow-wrap: anywhere; word-break: break-word;">${title}</div>
    <div style="margin-top: 10px; color: rgba(28,54,94,.78); font-size: 12px; display:flex; flex-wrap:wrap; gap:10px;">
      ${court ? `<span>法院：${court}</span>` : ""}
      ${date ? `<span>日期：${date}</span>` : ""}
      ${caseNo ? `<span>案号：${caseNo}</span>` : ""}
      ${caseType ? `<span>类型：${caseType}</span>` : ""}
      ${level ? `<span>审级：${level}</span>` : ""}
    </div>
    <div class="case-detail-rich">${content || "暂无详细内容"}</div>
  `;
}

function renderLawDetail(item) {
  if (!item) return renderDetailEmpty();
  const textHtml = toRichTextHtml(item?.text || "");
  if (!caseDetail) return;
  caseDetail.innerHTML = `
    <div class="law-detail-text case-detail-rich">${textHtml || "暂无条文内容"}</div>
  `;
}

function getSelectedRetrievalType() {
  const v = String(retrievalTypeSelect?.value || "auto").trim().toLowerCase();
  return ["auto", "case", "law"].includes(v) ? v : "auto";
}

function getSelectedRetrievalTimeRange() {
  const v = String(retrievalTimeRangeSelect?.value || "all").trim().toLowerCase();
  return ["all", "1y", "3y", "5y", "10y"].includes(v) ? v : "all";
}

function getSelectedRetrievalCourtLevel() {
  const v = String(retrievalCourtLevelSelect?.value || "national").trim().toLowerCase();
  return ["national", "province", "intermediate", "high", "supreme"].includes(v) ? v : "national";
}

function getSelectedRetrievalLawLevel() {
  const v = String(retrievalLawLevelSelect?.value || "all").trim().toLowerCase();
  return ["all", "law", "admin_regulation", "judicial_interpretation", "local_regulation"].includes(v) ? v : "all";
}

function extractLawInfoText(rawInfo) {
  const info = rawInfo && typeof rawInfo === "object" ? rawInfo : {};
  const directCandidates = [
    info.text,
    info.content,
    info.lawDetailContent,
    info.detailContent,
    info.htmlContent,
    info.fullText,
    info.lawContent,
    info.mergeText,
    info.mergeContent,
    info.articleText,
    info.detail,
    info.detailText,
    info.body,
  ];

  for (const item of directCandidates) {
    if (typeof item === "string" && item.trim()) {
      return item;
    }
  }

  const detailObjCandidates = [info.body, info.data, info.result, info.law, info.info, info.detailInfo];
  for (const obj of detailObjCandidates) {
    if (obj && typeof obj === "object") {
      const t = extractLawInfoText(obj);
      if (t) return t;
    }
  }

  const listCandidates = [info.articles, info.articleList, info.items, info.contents, info.highlights];
  for (const list of listCandidates) {
    if (!Array.isArray(list) || !list.length) continue;
    const sections = [];
    list.forEach((it) => {
      if (!it || typeof it !== "object") return;
      const name = it.name || it.title || it.articleName || it.articleNo || "";
      const text =
        it.text ||
        it.content ||
        it.articleText ||
        it.paragraph ||
        it.desc ||
        it.summary ||
        "";
      if (text) {
        sections.push(name ? `${name}\n${text}` : String(text));
      }
    });
    if (sections.length) {
      return sections.join("\n\n");
    }
  }

  return "";
}

async function loadLawDetailText(lawId) {
  const id = String(lawId || "").trim();
  if (!id) return "";
  if (lawInfoCache.has(id)) {
    const cached = String(lawInfoCache.get(id) || "");
    if (cached.trim()) return cached;
    lawInfoCache.delete(id);
  }

  const data = await getLawInfo(id, true);
  const text = extractLawInfoText(data?.lawInfo || data);
  const normalized = String(text || "").trim();
  if (normalized) {
    lawInfoCache.set(id, normalized);
    return normalized;
  }
  return "";
}

function prefetchLawDetails(lawIds, limit = 6) {
  const uniq = [];
  const seen = new Set();
  (lawIds || []).forEach((raw) => {
    const id = String(raw || "").trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    uniq.push(id);
  });
  uniq.slice(0, limit).forEach((id) => {
    void loadLawDetailText(id).catch(() => {});
  });
}

async function showLawDetail(row) {
  const requestToken = ++lawDetailRequestToken;
  const fallbackText = String(row?.text || "").trim();
  renderLawDetail({ text: fallbackText || "正在加载法规全文..." });

  const lawId = String(row?.lawId || "").trim();
  if (!lawId) {
    if (!fallbackText) {
      renderLawDetail({ text: "该条法规结果未提供 lawId，暂无法获取全文。请尝试更换关键词后重试。" });
    }
    return;
  }

  try {
    const fullText = await loadLawDetailText(lawId);
    if (requestToken !== lawDetailRequestToken) return;
    if (fullText) {
      renderLawDetail({ text: fullText });
      return;
    }
    if (fallbackText) {
      renderLawDetail({ text: fallbackText });
      return;
    }
    renderLawDetail({ text: "法规详情已返回，但未包含可展示正文。请尝试切换结果或更换关键词。" });
  } catch (error) {
    if (requestToken !== lawDetailRequestToken) return;
    if (fallbackText) {
      renderLawDetail({ text: fallbackText });
      return;
    }
    const msg = error?.message ? `法规详情加载失败：${error.message}` : "法规详情加载失败";
    renderLawDetail({ text: msg });
  }
}

function extractLawRows(result) {
  const source = Array.isArray(result?.laws) ? result.laws : [];
  const rows = [];

  source.forEach((law) => {
    const title = law?.title || law?.lawTitle || law?.lawName || law?.name || "（未命名法规）";
    const lawId = law?.lawId || law?.law_id || law?.id || "";
    const highlights = Array.isArray(law?.highlights) ? law.highlights : [];

    if (highlights.length) {
      highlights.forEach((h) => {
        const name = h?.name || "相关条文";
        const text = h?.text || "";
        rows.push({ title, name, text, lawId });
      });
      return;
    }

    const text =
      law?.text ||
      law?.content ||
      law?.lawContent ||
      law?.summary ||
      law?.abstract ||
      law?.articleText ||
      law?.fullText ||
      "";
    const name = law?.name || law?.articleName || law?.levelName || "法规内容";
    rows.push({ title, name, text, lawId });
  });

  return rows;
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

  let selectedIndex = Number(paginationState.selectedGlobalIndex);
  if (!(selectedIndex >= start && selectedIndex < end)) {
    selectedIndex = start;
    paginationState.selectedGlobalIndex = selectedIndex;
    if (typeof paginationState.selectItem === "function" && allItems[selectedIndex] !== undefined) {
      paginationState.selectItem(allItems[selectedIndex], selectedIndex);
    }
  }

  currentPageItems.forEach((item, offset) => {
    const globalIndex = start + offset;
    const card = paginationState.renderCard(item, globalIndex);
    if (!(card instanceof HTMLElement)) return;
    if (globalIndex === paginationState.selectedGlobalIndex) {
      card.classList.add("active");
    }
    card.addEventListener("click", () => {
      paginationState.selectedGlobalIndex = globalIndex;
      if (typeof paginationState.selectItem === "function") {
        paginationState.selectItem(item, globalIndex);
      }
      renderCurrentPageItems();
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

function setupPagination(items, { renderCard, selectItem, initialIndex = 0 } = {}) {
  paginationState.items = Array.isArray(items) ? items : [];
  paginationState.renderCard = typeof renderCard === "function" ? renderCard : null;
  paginationState.selectItem = typeof selectItem === "function" ? selectItem : null;
  const safeIndex = Math.max(0, Math.min(paginationState.items.length - 1, Number(initialIndex || 0)));
  paginationState.selectedGlobalIndex = paginationState.items.length ? safeIndex : -1;
  paginationState.currentPage = paginationState.items.length ? Math.floor(safeIndex / RESULTS_PER_PAGE) + 1 : 1;
  paginationState.totalPages = Math.max(1, Math.ceil((paginationState.items.length || 1) / RESULTS_PER_PAGE));
  renderCurrentPageItems();
}

function createCaseCard(item) {
  const title = toRichTextHtml(item?.title || item?.caseName || item?.name || item?.docTitle || "（未命名案例）");
  const court = toRichTextHtml(item?.court || item?.courtName || "");
  const date = toRichTextHtml(item?.judgementDate || item?.judgementTime || item?.date || "");
  const caseNo = toRichTextHtml(item?.caseNumber || item?.caseNo || item?.docNo || "");
  const card = document.createElement("div");
  card.className = "case-card";
  card.innerHTML = `
    <div class="case-title">${title}</div>
    <div class="case-meta">
      ${court ? `<span>法院：${court}</span>` : ""}
      ${date ? `<span>日期：${date}</span>` : ""}
      ${caseNo ? `<span>案号：${caseNo}</span>` : ""}
    </div>
  `;
  return card;
}

function createLawCard(row) {
  const titleHtml = toRichTextHtml(row?.title || "（未命名法规）");
  const nameHtml = toRichTextHtml(row?.name || "相关条文");
  const card = document.createElement("div");
  card.className = "case-card";
  card.innerHTML = `
    <div class="case-title">${titleHtml}</div>
    <div class="case-meta">
      <span class="law-row-name">${nameHtml}</span>
    </div>
  `;
  return card;
}

function getMixedLawDetailPayload(row) {
  const lawRow = row?.item || {};
  const lawId = lawRow?.lawId || lawRow?.law_id || lawRow?.id || "";
  const text =
    lawRow?.text ||
    lawRow?.content ||
    lawRow?.lawContent ||
    lawRow?.summary ||
    lawRow?.abstract ||
    lawRow?.articleText ||
    lawRow?.fullText ||
    "";
  return { lawId, text };
}

function createMixedCard(row) {
  const isLaw = row?.type === "law";
  const titleHtml = toRichTextHtml(row?.title || (isLaw ? "（未命名法规）" : "（未命名案例）"));
  const subtitleHtml = toRichTextHtml(row?.subtitle || "");
  const dateHtml = toRichTextHtml(row?.date || "");
  const score = Number(row?.score || 0);
  const card = document.createElement("div");
  card.className = "case-card";
  card.innerHTML = `
    <div class="case-title">${titleHtml}</div>
    <div class="case-meta">
      <span>${isLaw ? "法规" : "类案"}</span>
      ${subtitleHtml ? `<span>${subtitleHtml}</span>` : ""}
      ${dateHtml ? `<span>${dateHtml}</span>` : ""}
      ${Number.isFinite(score) && score > 0 ? `<span>相关度：${score.toFixed(3)}</span>` : ""}
    </div>
  `;
  return card;
}

function renderCaseResult(result) {
  if (!caseList) return;
  caseList.innerHTML = "";
  const arr = Array.isArray(result?.cases) ? result.cases : [];
  if (!arr.length) {
    const empty = document.createElement("div");
    empty.className = "case-card";
    empty.innerHTML = `<div class="case-title">未获取到可展示的类案列表</div>`;
    caseList.appendChild(empty);
    renderCaseDetail(null);
    hidePagination();
    setRetrievalStatus("检索完成：未找到可展示的类案结果。", "warn");
    return;
  }

  const focusNo = toPlainTextForMatch(pendingFocusCaseNo);
  let selectedIndex = 0;
  if (focusNo) {
    const idx = arr.findIndex((it) => {
      const rawNo = it?.caseNumber || it?.caseNo || it?.docNo || "";
      const caseNoPlain = toPlainTextForMatch(rawNo);
      return caseNoPlain && (caseNoPlain.includes(focusNo) || focusNo.includes(caseNoPlain));
    });
    if (idx >= 0) {
      selectedIndex = idx;
    }
  }

  setupPagination(arr, {
    initialIndex: selectedIndex,
    renderCard: (item) => createCaseCard(item),
    selectItem: (item) => renderCaseDetail(item),
  });

  pendingFocusCaseNo = "";
  setRetrievalStatus(`检索完成：已加载 ${arr.length} 条类案结果。`, "success");
}

function renderLawResult(result) {
  if (!caseList) return;
  caseList.innerHTML = "";
  const rows = extractLawRows(result);
  if (!rows.length) {
    const empty = document.createElement("div");
    empty.className = "case-card";
    empty.innerHTML = `<div class="case-title">未获取到可展示的法规列表</div>`;
    caseList.appendChild(empty);
    renderLawDetail(null);
    hidePagination();
    setRetrievalStatus("检索完成：未找到可展示的法规结果。", "warn");
    return;
  }

  setupPagination(rows, {
    initialIndex: 0,
    renderCard: (row) => createLawCard(row),
    selectItem: (row) => {
      void showLawDetail(row);
    },
  });
  prefetchLawDetails(rows.map((row) => row?.lawId));
  setRetrievalStatus(`检索完成：已加载 ${rows.length} 条法规结果。`, "success");
}

function renderMixedResult(result) {
  if (!caseList) return;
  caseList.innerHTML = "";
  const rows = Array.isArray(result?.results) ? result.results : [];
  if (!rows.length) {
    renderTipResult(result);
    return;
  }

  setupPagination(rows, {
    initialIndex: 0,
    renderCard: (row) => createMixedCard(row),
    selectItem: (row) => {
      if (row?.type === "law") {
        void showLawDetail(getMixedLawDetailPayload(row));
      } else {
        renderCaseDetail(row?.item || {});
      }
    },
  });

  const mixedLawIds = rows
    .filter((r) => r?.type === "law")
    .map((r) => {
      const lawRow = r?.item || {};
      return lawRow?.lawId || lawRow?.law_id || lawRow?.id || "";
    });
  prefetchLawDetails(mixedLawIds);

  const lawCount = rows.filter((r) => r?.type === "law").length;
  const caseCount = rows.filter((r) => r?.type !== "law").length;
  setRetrievalStatus(`检索完成：混合结果 ${rows.length} 条（类案 ${caseCount} / 法规 ${lawCount}）。`, "success");
}

function renderTipResult(result) {
  const tips = String(result?.queryTips || "请输入法律相关问题，我会自动选择检索类型。");
  if (caseList) {
    caseList.innerHTML = `
      <div class="case-card">
        <div class="case-title">检索提示</div>
        <div class="case-meta"><span>${escapeHtml(tips)}</span></div>
      </div>
    `;
  }
  renderDetailEmpty(tips);
  hidePagination();
  setRetrievalStatus("检索完成：当前输入更适合咨询问答而非检索。", "warn");
}

function renderSearchResult(result, selectedType = "auto") {
  const mode = String(result?.retrievalType || "case");
  const hasMixed = Array.isArray(result?.results) && result.results.length > 0;
  if (hasMixed && (selectedType === "auto" || mode === "mixed")) {
    if (retrievalModeHint) retrievalModeHint.textContent = "混合检索：法规 + 类案（按相关度排序）";
    if (retrievalDetailTitle) retrievalDetailTitle.textContent = "检索详情";
    if (retrievalDetailSub) retrievalDetailSub.textContent = "点击左侧任一结果，在右侧查看详情。";
    renderMixedResult(result);
    return;
  }
  setRetrievalMode(mode, selectedType);
  if (mode === "law") {
    renderLawResult(result);
    return;
  }
  if (mode === "other") {
    renderTipResult(result);
    return;
  }
  renderCaseResult(result);
}

async function performRetrieval(keyword, btn, selectedType = "auto") {
  if (!keyword) {
    setRetrievalStatus("请输入关键词后再检索。", "warn");
    return;
  }

  enterRetrievalPage(keyword);
  setRetrievalStatus("正在检索，请稍候...", "loading");

  if (btn) {
    btn.disabled = true;
    btn.textContent = "检索中...";
  }
  if (retrievalSearchInput) retrievalSearchInput.disabled = true;

  try {
    const result = await retrievalCases({
      message: keyword,
      retrievalType: selectedType,
      timeRange: getSelectedRetrievalTimeRange(),
      courtLevel: getSelectedRetrievalCourtLevel(),
      lawLevel: getSelectedRetrievalLawLevel(),
    });
    renderSearchResult(result, selectedType);
    return true;
  } catch (error) {
    setRetrievalMode("other", selectedType);
    if (caseList) {
      caseList.innerHTML = `
        <div class="case-card">
          <div class="case-title">${escapeHtml(error.message || "检索失败，请稍后重试")}</div>
        </div>
      `;
    }
    hidePagination();
    renderDetailEmpty();
    setRetrievalStatus(`检索失败：${error.message || "请稍后重试"}`, "error");
    return false;
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "搜索";
    }
    if (retrievalSearchInput) retrievalSearchInput.disabled = false;
  }
}

async function sendMessage() {
  const content = String(chatInput?.value || "").trim();
  if (!content) return;

  appendMessage("你", content, true);
  if (chatInput) chatInput.value = "";
  if (sendBtn) {
    sendBtn.disabled = true;
    sendBtn.textContent = "发送中...";
  }

  try {
    const result = await chat({ message: content });
    const reply = String(result?.reply ?? "").trim();
    appendMessage("助手", reply || "（暂无回复内容）", false);
  } catch (error) {
    appendMessage("系统", error.message || "发送失败，请稍后重试", false);
  } finally {
    if (sendBtn) {
      sendBtn.disabled = false;
      sendBtn.textContent = "发送";
    }
  }
}

if (dashboardSearchBtn) {
  dashboardSearchBtn.addEventListener("click", () => {
    const keyword = String(dashboardSearchInput?.value || "").trim();
    performRetrieval(keyword, dashboardSearchBtn, "auto");
  });
}

if (dashboardSearchInput) {
  dashboardSearchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      const keyword = String(dashboardSearchInput.value || "").trim();
      performRetrieval(keyword, dashboardSearchBtn, "auto");
    }
  });
}

if (retrievalSearchBtn) {
  retrievalSearchBtn.addEventListener("click", () => {
    triggerRetrievalFromInput(retrievalSearchBtn);
  });
}

if (retrievalSearchInput) {
  retrievalSearchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      triggerRetrievalFromInput(retrievalSearchBtn);
    }
  });
}

if (prevPageBtn) {
  prevPageBtn.addEventListener("click", () => {
    gotoPage(paginationState.currentPage - 1);
  });
}

if (nextPageBtn) {
  nextPageBtn.addEventListener("click", () => {
    gotoPage(paginationState.currentPage + 1);
  });
}

if (pageJumpBtn) {
  pageJumpBtn.addEventListener("click", () => {
    gotoPage(Number(pageJumpInput?.value || 1));
  });
}

if (pageJumpInput) {
  pageJumpInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      gotoPage(Number(pageJumpInput.value || 1));
    }
  });
}

if (sendBtn) {
  sendBtn.addEventListener("click", sendMessage);
}

if (chatInput) {
  chatInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });
}

if (legalServicesNav) {
  legalServicesNav.addEventListener("click", (event) => {
    event.preventDefault();
    backToDashboard();
  });
}

const urlParams = new URLSearchParams(window.location.search);
const mode = urlParams.get("mode");
if (mode === "retrieval") {
  const initialQuery = String(urlParams.get("q") || urlParams.get("query") || "").trim();
  const initialType = String(urlParams.get("retrievalType") || "").trim().toLowerCase();
  const initialTimeRange = String(urlParams.get("timeRange") || "").trim().toLowerCase();
  const initialCourtLevel = String(urlParams.get("courtLevel") || "").trim().toLowerCase();
  const initialLawLevel = String(urlParams.get("lawLevel") || "").trim().toLowerCase();
  const initialFocusCaseNo = String(urlParams.get("focusCaseNo") || "").trim();

  enterRetrievalPage(initialQuery);

  if (retrievalTypeSelect && ["auto", "case", "law"].includes(initialType)) {
    retrievalTypeSelect.value = initialType;
  }
  if (retrievalTimeRangeSelect && ["all", "1y", "3y", "5y", "10y"].includes(initialTimeRange)) {
    retrievalTimeRangeSelect.value = initialTimeRange;
  }
  if (retrievalCourtLevelSelect && ["national", "province", "intermediate", "high", "supreme"].includes(initialCourtLevel)) {
    retrievalCourtLevelSelect.value = initialCourtLevel;
  }
  if (retrievalLawLevelSelect && ["all", "law", "admin_regulation", "judicial_interpretation", "local_regulation"].includes(initialLawLevel)) {
    retrievalLawLevelSelect.value = initialLawLevel;
  }
  if (initialFocusCaseNo) {
    pendingFocusCaseNo = initialFocusCaseNo;
  }
  if (initialQuery) {
    void performRetrieval(initialQuery, retrievalSearchBtn, getSelectedRetrievalType());
  }
}

if (retrievalSearchBtn) {
  retrievalSearchBtn.onclick = () => {
    triggerRetrievalFromInput(retrievalSearchBtn);
  };
}

window.addEventListener("error", (event) => {
  if (!retrievalStatus) return;
  const msg = event?.error?.message || event?.message || "前端运行错误";
  setRetrievalStatus(`前端错误：${msg}`, "error");
});

window.addEventListener("unhandledrejection", (event) => {
  if (!retrievalStatus) return;
  const reason = event?.reason;
  const msg = reason?.message || String(reason || "未知 Promise 错误");
  setRetrievalStatus(`前端错误：${msg}`, "error");
});