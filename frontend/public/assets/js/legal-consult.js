import {
  createConversation,
  deleteConversation,
  getLawInfo,
  listConsultFaqs,
  listConversationMessages,
  listConversations,
  sendConversationMessage,
  updateConversation
} from "./api.js";
import { setupProtectedPage } from "./page-auth.js";
import { marked } from "./vendor/marked.esm.js";
import DOMPurify from "./vendor/purify.es.mjs";

marked.use({ breaks: true, gfm: true });

const lawInfoCache = new Map();

function decodeHtmlEntities(text) {
  const textarea = document.createElement("textarea");
  textarea.innerHTML = String(text || "");
  return textarea.value;
}

function stripHtmlishMarkup(text, { collapseWhitespace = true } = {}) {
  const raw = String(text || "").trim();
  if (!raw) return "";
  const decoded = decodeHtmlEntities(raw);
  const doc = new DOMParser().parseFromString(`<div>${decoded}</div>`, "text/html");
  const plain = String(doc.body.textContent || "")
    .replace(/\u00a0/g, " ")
    .replace(/\r\n?/g, "\n");
  return collapseWhitespace ? plain.replace(/\s+/g, " ").trim() : plain.trim();
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
    info.body
  ];
  for (const item of directCandidates) {
    if (typeof item === "string" && item.trim()) return item;
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
      if (text) sections.push(name ? `${name}\n${text}` : String(text));
    });
    if (sections.length) return sections.join("\n\n");
  }
  return "";
}

async function loadLawDetailForPanel(lawId) {
  const id = String(lawId || "").trim();
  if (!id) return "";
  if (lawInfoCache.has(id)) return lawInfoCache.get(id);
  const data = await getLawInfo(id, true);
  const text = extractLawInfoText(data?.lawInfo || data);
  const normalized = String(text || "").trim();
  if (normalized) lawInfoCache.set(id, normalized);
  return normalized || "";
}

function stripEmojisClient(text) {
  const s = String(text || "");
  try {
    return s.replace(/\p{Extended_Pictographic}/gu, "");
  } catch {
    return s.replace(/[\u2600-\u27BF\u2300-\u23FF]/g, "");
  }
}

function preprocessConsultMarkdown(src) {
  let s = stripEmojisClient(String(src || ""));
  s = s.replace(/^\s*([-*_])\1{2,}\s*$/gm, "");
  s = s.replace(/^(\s{0,3})(#{1,6})\s+(\S.*)$/gm, (_line, _w, _hashes, title) => {
    const t = String(title || "").trim();
    return t ? `**${t}**` : "";
  });
  return s;
}

function renderMarkdownToSafeHtml(src) {
  try {
    const md = preprocessConsultMarkdown(src);
    const html = marked.parse(md, { async: false });
    return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
  } catch {
    return DOMPurify.sanitize(`<p>${String(src || "")}</p>`);
  }
}

async function openLawSourcePanel(ref) {
  const modal = document.getElementById("lawSourceModal");
  const titleEl = document.getElementById("lawSourceModalTitle");
  const bodyEl = document.getElementById("lawSourceModalBody");
  if (!modal || !bodyEl || !titleEl) return;
  titleEl.textContent = stripHtmlishMarkup(ref?.label || "条文原文");
  bodyEl.textContent = "加载中…";
  modal.hidden = false;
  document.body.classList.add("law-source-modal-open");

  const lawId = String(ref?.law_id || "").trim();
  const excerpt = stripHtmlishMarkup(ref?.excerpt || "", { collapseWhitespace: false });
  try {
    if (lawId) {
      const full = await loadLawDetailForPanel(lawId);
      bodyEl.textContent = stripHtmlishMarkup(full || excerpt || "暂无正文", { collapseWhitespace: false });
    } else {
      bodyEl.textContent =
        excerpt || "暂无正文（该条为检索摘录，未关联可拉取全文的法规 ID）";
    }
  } catch (e) {
    bodyEl.textContent = excerpt || (e?.message ? String(e.message) : "加载失败");
  }
}

function setupLawSourceModal() {
  const modal = document.getElementById("lawSourceModal");
  const closeBtn = document.getElementById("lawSourceModalClose");
  const backdrop = document.getElementById("lawSourceModalBackdrop");
  const closeFn = () => {
    if (modal) modal.hidden = true;
    document.body.classList.remove("law-source-modal-open");
  };
  closeBtn?.addEventListener("click", closeFn);
  backdrop?.addEventListener("click", closeFn);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal && !modal.hidden) closeFn();
  });
}

const ACTIVE_CONV_KEY = "lh_active_conv_id";

const chatLog = document.getElementById("chatLog");
const chatInput = document.getElementById("chatInput");
const sendBtn = document.getElementById("sendBtn");
const sessionListEl = document.getElementById("sessionList");
const newSessionBtn = document.getElementById("newSessionBtn");
const faqListEl = document.getElementById("faqList");
const faqPrevBtn = document.getElementById("faqPrevBtn");
const faqNextBtn = document.getElementById("faqNextBtn");
const faqPageIndicator = document.getElementById("faqPageIndicator");

setupProtectedPage();

/** @type {Array<{conversation_id: string, title: string, updated_time: string}>} */
let conversations = [];
let activeId = null;
const FAQ_PAGE_SIZE = 8;
let faqPage = 1;
let faqTotalPages = 1;

function parseDbTime(s) {
  if (!s) return Date.now();
  const d = new Date(String(s).replace(" ", "T"));
  return Number.isNaN(d.getTime()) ? Date.now() : d.getTime();
}

function sessionTitle(conv) {
  const t = String(conv?.title || "").trim();
  return t || "新对话";
}

function formatTime(ts) {
  const d = new Date(ts);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
}

function getActiveConversation() {
  return conversations.find((c) => c.conversation_id === activeId) || null;
}

function senderToUi(sender) {
  if (sender === "assistant") return { roleLabel: "助手", isUser: false };
  if (sender === "system") return { roleLabel: "系统", isUser: false };
  return { roleLabel: "你", isUser: true };
}

async function refreshConversationsFromServer() {
  const data = await listConversations();
  conversations = Array.isArray(data.conversations) ? data.conversations : [];
}

function renderSessionList() {
  if (!sessionListEl) return;
  sessionListEl.innerHTML = "";
  conversations.forEach((conv) => {
    const row = document.createElement("div");
    row.className = `legal-consult-session-item${conv.conversation_id === activeId ? " active" : ""}`;
    row.setAttribute("role", "listitem");
    row.dataset.id = conv.conversation_id;

    const main = document.createElement("div");
    main.className = "legal-consult-session-item-main";
    const titleEl = document.createElement("div");
    titleEl.className = "legal-consult-session-title";
    titleEl.textContent = sessionTitle(conv);
    const meta = document.createElement("div");
    meta.className = "legal-consult-session-meta";
    meta.textContent = formatTime(parseDbTime(conv.updated_time));
    main.appendChild(titleEl);
    main.appendChild(meta);

    const del = document.createElement("button");
    del.type = "button";
    del.className = "legal-consult-session-del";
    del.setAttribute("aria-label", "删除会话");
    del.textContent = "×";

    row.appendChild(main);
    row.appendChild(del);

    row.addEventListener("click", () => {
      void (async () => {
        activeId = conv.conversation_id;
        sessionStorage.setItem(ACTIVE_CONV_KEY, activeId);
        renderSessionList();
        await loadMessagesForActive();
      })();
    });

    del.addEventListener("click", (e) => {
      e.stopPropagation();
      void removeConversation(conv.conversation_id);
    });

    sessionListEl.appendChild(row);
  });
}

function clearChatDom() {
  if (chatLog) chatLog.innerHTML = "";
}

/**
 * @param {{
 *   sender?: string;
 *   legalIndex?: object;
 *   citations?: string[];
 *   citationRefs?: object[];
 * }} [meta]
 */
function appendMessageDom(roleLabel, text, isUser, meta) {
  if (!chatLog) return;
  const item = document.createElement("div");
  item.className = isUser ? "chat-item user" : "chat-item";
  const role = document.createElement("span");
  role.className = "role";
  role.textContent = roleLabel;
  const body = document.createElement("div");
  body.className = "chat-item-body";

  const useMd = meta?.sender === "assistant";
  if (useMd) {
    const md = document.createElement("div");
    md.className = "message-markdown";
    md.innerHTML = renderMarkdownToSafeHtml(text);
    body.appendChild(md);
  } else {
    const p = document.createElement("p");
    p.className = "message-plain";
    p.textContent = String(text);
    body.appendChild(p);
  }

  const li = meta?.legalIndex;
  let citationRefs = meta?.citationRefs;
  if (!Array.isArray(citationRefs) || !citationRefs.length) {
    if (li && Array.isArray(li.citation_refs)) citationRefs = li.citation_refs;
  }
  const cite =
    meta?.citations ||
    (!isUser && li && Array.isArray(li.citations) ? li.citations : null);

  if (isUser && li) {
    const idxEl = buildUserLegalIndexEl(li);
    if (idxEl) body.appendChild(idxEl);
  } else if (!isUser && ((cite && cite.length) || (citationRefs && citationRefs.length))) {
    const citeEl = buildAssistantCitationsEl(cite, citationRefs);
    if (citeEl) body.appendChild(citeEl);
  }

  item.appendChild(role);
  item.appendChild(body);
  chatLog.appendChild(item);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function buildUserLegalIndexEl() {
  /* 不在用户气泡下展示「法律索引 / 扩展检索词」，避免干扰阅读 */
  return null;
}

function extractRetrievalQueryFromCitationLabel(label) {
  const plain = stripHtmlishMarkup(label || "");
  if (!plain) return "";
  const m = plain.match(/《([^》]+)》\s*(第\s*[一二三四五六七八九十百千零〇\d]+\s*条(?:\s*之\s*[一二三四五六七八九十百千零〇\d]+)?(?:\s*第\s*[一二三四五六七八九十百千零〇\d]+\s*款)?(?:\s*第\s*[一二三四五六七八九十百千零〇\d]+\s*项)?)/);
  if (m?.[1] && m?.[2]) {
    return `${m[1]} ${m[2]}`.replace(/\s+/g, " ").trim();
  }
  const titleMatch = plain.match(/《([^》]+)》/);
  if (titleMatch?.[1]) return titleMatch[1].trim();
  return plain.slice(0, 120).trim();
}

function buildCaseRetrievalUrlFromCitation(ref) {
  const query = extractRetrievalQueryFromCitationLabel(ref?.label || "") || "相关法条 类案";
  const params = new URLSearchParams();
  params.set("mode", "retrieval");
  params.set("q", query);
  params.set("retrievalType", "case");
  return `/case-retrieval?${params.toString()}`;
}

function buildAssistantCitationsEl(citations, citationRefs) {
  const MAX_CITATIONS = 3;
  let refs =
    Array.isArray(citationRefs) && citationRefs.length
      ? citationRefs
      : null;
  if (!refs && Array.isArray(citations) && citations.length) {
    refs = citations.map((label) => ({
      label: String(label || "").trim(),
      law_id: "",
      excerpt: "",
      is_article: false
    }));
  }
  if (!refs || !refs.length) return null;
  refs = refs.slice(0, MAX_CITATIONS);
  const wrap = document.createElement("div");
  wrap.className = "chat-law-citations";
  let lineIdx = 0;
  refs.forEach((raw) => {
    const ref = raw && typeof raw === "object" ? raw : {};
    const label = stripHtmlishMarkup(ref.label || "");
    if (!label) return;
    const line = document.createElement("div");
    line.className =
      lineIdx === 0
        ? "chat-law-citations-line chat-law-citations-line-with-label"
        : "chat-law-citations-line chat-law-citations-line-indented";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chat-law-citation-btn";
    btn.textContent = label;
    btn.title = "点击跳转到类案检索";
    btn.addEventListener("click", () => {
      window.location.href = buildCaseRetrievalUrlFromCitation(ref);
    });
    if (lineIdx === 0) {
      const prefix = document.createElement("span");
      prefix.className = "chat-law-citations-label";
      prefix.textContent = "相关法条：";
      line.appendChild(prefix);
    }
    line.appendChild(btn);
    wrap.appendChild(line);
    lineIdx += 1;
  });
  return wrap.childElementCount ? wrap : null;
}

async function loadMessagesForActive() {
  clearChatDom();
  if (!activeId || !chatLog) return;
  try {
    const data = await listConversationMessages(activeId);
    const list = Array.isArray(data.messages) ? data.messages : [];
    list.forEach((m) => {
      const { roleLabel, isUser } = senderToUi(m.sender);
      appendMessageDom(roleLabel, m.content || "", isUser, {
        sender: m.sender,
        legalIndex: m.legal_index,
        citations: m.citations,
        citationRefs: m.citation_refs
      });
    });
  } catch (e) {
    appendMessageDom("系统", e.message || "加载消息失败", false);
  }
}

async function maybeSyncTitleFromFirstMessage(userText) {
  const conv = getActiveConversation();
  if (!conv || !activeId || String(conv.title || "").trim()) return;
  const t = userText.trim().replace(/\s+/g, " ");
  const title = t.length > 28 ? `${t.slice(0, 28)}…` : t;
  if (!title) return;
  try {
    await updateConversation(activeId, { title });
    conv.title = title;
    renderSessionList();
  } catch {
    /* 标题同步失败不影响对话 */
  }
}

function renderFaqs(items) {
  if (!faqListEl) return;
  faqListEl.innerHTML = "";
  if (!Array.isArray(items) || items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "legal-consult-faq-empty";
    empty.textContent = "暂无常见问题解答";
    faqListEl.appendChild(empty);
    return;
  }

  items.forEach((item) => {
    const row = document.createElement("article");
    row.className = "legal-consult-faq-item";
    row.setAttribute("role", "listitem");

    const q = document.createElement("p");
    q.className = "legal-consult-faq-item-query";
    q.textContent = `Q: ${String(item?.query || "").trim() || "未命名问题"}`;

    const a = document.createElement("p");
    a.className = "legal-consult-faq-item-answer";
    a.textContent = `A: ${String(item?.answer || "").trim() || "暂无回答"}`;

    row.appendChild(q);
    row.appendChild(a);
    faqListEl.appendChild(row);
  });
}

function updateFaqPagination() {
  if (faqPageIndicator) {
    faqPageIndicator.textContent = `第${faqPage}页 / 共${faqTotalPages}页`;
  }
  if (faqPrevBtn) faqPrevBtn.disabled = faqPage <= 1;
  if (faqNextBtn) faqNextBtn.disabled = faqPage >= faqTotalPages;
}

async function loadFaqPage(page) {
  const targetPage = Math.max(1, Number(page) || 1);
  const data = await listConsultFaqs({ page: targetPage, pageSize: FAQ_PAGE_SIZE });
  faqPage = Math.max(1, Number(data?.page) || targetPage);
  faqTotalPages = Math.max(1, Number(data?.total_pages) || 1);
  renderFaqs(Array.isArray(data?.items) ? data.items : []);
  updateFaqPagination();
}

async function removeConversation(cid) {
  try {
    await deleteConversation(cid);
  } catch (e) {
    alert(e.message || "删除失败");
    return;
  }
  await refreshConversationsFromServer();
  if (!conversations.length) {
    try {
      const { conversation } = await createConversation({ title: "" });
      await refreshConversationsFromServer();
      activeId = conversation.conversation_id;
    } catch (e) {
      alert(e.message || "创建会话失败");
      activeId = null;
    }
  } else if (activeId === cid) {
    activeId = conversations[0].conversation_id;
  }
  sessionStorage.setItem(ACTIVE_CONV_KEY, activeId || "");
  renderSessionList();
  await loadMessagesForActive();
}

async function startNewSession() {
  try {
    const { conversation } = await createConversation({ title: "" });
    await refreshConversationsFromServer();
    activeId = conversation.conversation_id;
    sessionStorage.setItem(ACTIVE_CONV_KEY, activeId);
    renderSessionList();
    await loadMessagesForActive();
    chatInput?.focus();
  } catch (e) {
    alert(e.message || "新建会话失败");
  }
}

async function sendMessage() {
  const content = String(chatInput?.value || "").trim();
  if (!content || !activeId) return;

  if (sendBtn) {
    sendBtn.disabled = true;
    sendBtn.textContent = "发送中...";
  }

  try {
    await sendConversationMessage(activeId, { message: content });
    if (chatInput) chatInput.value = "";
    await maybeSyncTitleFromFirstMessage(content);
    await refreshConversationsFromServer();
    renderSessionList();
    await loadMessagesForActive();
  } catch (error) {
    await loadMessagesForActive();
    appendMessageDom("系统", error.message || "发送失败，请稍后重试", false);
  } finally {
    if (sendBtn) {
      sendBtn.disabled = false;
      sendBtn.textContent = "发送";
    }
  }
}

if (newSessionBtn) {
  newSessionBtn.addEventListener("click", () => void startNewSession());
}

if (sendBtn) {
  sendBtn.addEventListener("click", () => void sendMessage());
}

if (chatInput) {
  chatInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  });
}

if (faqPrevBtn) {
  faqPrevBtn.addEventListener("click", () => {
    if (faqPage <= 1) return;
    void loadFaqPage(faqPage - 1);
  });
}

if (faqNextBtn) {
  faqNextBtn.addEventListener("click", () => {
    if (faqPage >= faqTotalPages) return;
    void loadFaqPage(faqPage + 1);
  });
}


async function init() {
  try {
    await refreshConversationsFromServer();
    if (!conversations.length) {
      const { conversation } = await createConversation({ title: "" });
      await refreshConversationsFromServer();
      activeId = conversation.conversation_id;
    } else {
      let saved = sessionStorage.getItem(ACTIVE_CONV_KEY);
      if (!saved || !conversations.some((c) => c.conversation_id === saved)) {
        saved = conversations[0].conversation_id;
      }
      activeId = saved;
    }
    sessionStorage.setItem(ACTIVE_CONV_KEY, activeId || "");
    renderSessionList();
    await loadMessagesForActive();
    try {
      await loadFaqPage(1);
    } catch (_faqError) {
      renderFaqs([]);
      updateFaqPagination();
    }
  } catch (e) {
    const msg = e?.message || String(e);
    if (msg.includes("重新登录") || msg.includes("未登录")) {
      window.location.replace("/login");
      return;
    }
    alert(msg || "加载会话失败，请刷新重试");
  }
}

setupLawSourceModal();
void init();
