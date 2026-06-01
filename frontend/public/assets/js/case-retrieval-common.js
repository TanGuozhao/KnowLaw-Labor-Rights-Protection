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

const DETAIL_STORAGE_KEY = "zhifa.caseRetrievalDetailEntries";
const MAX_DETAIL_ENTRIES = 18;

const FOOTER_ROLE_RE =
  /^(审判人员|审判长|审判员|代理审判员|助理审判员|书记员|代理书记员|执行员|执行法官|法官助理|人民陪审员|陪审员)/;
const FOOTER_DATE_RE = /^(?:[二〇二○○Ｏ零一二三四五六七八九十0-9]{2,4}年).*[日号]$/;
const APPENDIX_LINE_RE = /^(附录|附相关法律条文|相关法律条文|附：|附)/;

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => {
    if (ch === "&") return "&amp;";
    if (ch === "<") return "&lt;";
    if (ch === ">") return "&gt;";
    if (ch === '"') return "&quot;";
    return "&#39;";
  });
}

export function normalizeEmArtifacts(value) {
  let raw = String(value ?? "");
  raw = raw.replace(/<\s*\/\s*em\s*<\s*>/gi, "</em>");
  raw = raw.replace(/<\s*em\s*>\s*\/\s*em\s*<\s*>/gi, "</em>");
  raw = raw.replace(/\/\s*em\s*<\s*>/gi, "");
  return raw;
}

export function sanitizeRichHtml(value) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${normalizeEmArtifacts(value)}</div>`, "text/html");
  const root = doc.body.firstElementChild;
  if (!root) return "";

  const walk = (node) => {
    const children = Array.from(node.childNodes);
    children.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) return;
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

export function toRichTextHtml(value) {
  const raw = normalizeEmArtifacts(value);
  if (!raw.trim()) return "";
  const hasTag = /<\/?[a-z][^>]*>/i.test(raw);
  if (hasTag) {
    return sanitizeRichHtml(raw).replace(/\/\s*em\s*<\s*>/gi, "");
  }
  return escapeHtml(raw).replace(/\n/g, "<br>");
}

export function richTextToPlainText(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${normalizeEmArtifacts(raw)}</div>`, "text/html");
  return String(doc.body.textContent || "").replace(/\s+/g, " ").trim();
}

export function toPlainTextForMatch(value) {
  return normalizeEmArtifacts(value)
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, "")
    .trim();
}

export function firstNonEmptyText(...values) {
  for (const value of values) {
    if (value == null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return "";
}

function normalizeCompareText(value) {
  return richTextToPlainText(value).replace(/[：:\s]/g, "").trim();
}

export function formatDocumentHeading(value) {
  const plain = String(value || "").trim();
  if (!plain) return "";
  if (plain.length >= 4 && plain.length <= 8 && /^[\u3400-\u9fff]+$/u.test(plain)) {
    return Array.from(plain).join(" ");
  }
  return plain;
}

function deriveCaseDocumentType(title, caseType) {
  const titleText = richTextToPlainText(title);
  const matched = titleText.match(
    /(执行裁定书|执行决定书|执行通知书|民事判决书|民事裁定书|刑事判决书|刑事裁定书|行政判决书|行政裁定书|支付令|决定书|判决书|裁定书|通知书|调解书|裁决书|意见书)$/
  );
  if (matched?.[1]) return matched[1];
  return richTextToPlainText(caseType);
}

function extractCourtFromContent(content) {
  const lines = String(content || "")
    .replace(/\r\n?/g, "\n")
    .split(/\n+/)
    .map((line) => richTextToPlainText(line).replace(/\s+/g, ""))
    .filter(Boolean);
  return firstNonEmptyText(lines.find((line) => /(人民法院|知识产权法院|互联网法院|铁路运输法院|金融法院|海事法院)$/.test(line)));
}

function extractDocumentTypeFromContent(content) {
  const lines = String(content || "")
    .replace(/\r\n?/g, "\n")
    .split(/\n+/)
    .map((line) => richTextToPlainText(line).replace(/\s+/g, ""))
    .filter(Boolean);
  return firstNonEmptyText(
    lines.find((line) =>
      /(执行裁定书|执行决定书|执行通知书|民事判决书|民事裁定书|刑事判决书|刑事裁定书|行政判决书|行政裁定书|支付令|决定书|判决书|裁定书|通知书|调解书|裁决书|意见书)$/.test(
        line
      )
    )
  );
}

function extractCaseNoFromContent(content) {
  const lines = String(content || "")
    .replace(/\r\n?/g, "\n")
    .split(/\n+/)
    .map((line) => richTextToPlainText(line).trim())
    .filter(Boolean);
  return firstNonEmptyText(lines.find((line) => /[（(]\d{4}[)）].+[号]$/.test(line)));
}

function extractTitleFromContent(content) {
  const raw = String(content || "")
    .replace(/\r\n?/g, "\n")
    .trim();
  if (!raw) return "";
  const firstLine = raw.split(/\n+/)[0] || raw;
  const plain = richTextToPlainText(firstLine).replace(/\s+/g, " ").trim();
  if (plain.length < 10 || plain.length > 200) return "";
  if (/^(正文|关键词|裁判要点|相关法条|基本案情|案情简介|案例要旨)$/u.test(plain)) return "";
  return plain.slice(0, 160);
}

export function getCaseCoreFields(item) {
  const content = firstNonEmptyText(
    item?.content,
    item?.detail,
    item?.detailContent,
    item?.htmlContent,
    item?.fullText,
    item?.summary
  );
  let title = firstNonEmptyText(
    item?.title,
    item?.caseName,
    item?.caseTitle,
    item?.name,
    item?.docTitle,
    item?.documentTitle,
    item?.judgmentTitle
  );
  if (!title) title = extractTitleFromContent(content);
  const caseType = firstNonEmptyText(item?.caseType, item?.docType, item?.documentType);

  const court = firstNonEmptyText(item?.court, item?.courtName, extractCourtFromContent(content));
  const caseNo = firstNonEmptyText(item?.caseNumber, item?.caseNo, item?.docNo, extractCaseNoFromContent(content));
  const documentType = firstNonEmptyText(deriveCaseDocumentType(title, caseType), extractDocumentTypeFromContent(content));

  return {
    title,
    court,
    date: firstNonEmptyText(item?.judgementDate, item?.judgementTime, item?.date),
    caseNo,
    caseType,
    level: firstNonEmptyText(item?.levelOfTrial),
    content,
    documentType,
  };
}

export function getLawCoreFields(item) {
  return {
    title: firstNonEmptyText(item?.title, item?.lawTitle, item?.lawName, item?.name),
    articleName: firstNonEmptyText(item?.name, item?.articleName, item?.subtitle),
    date: firstNonEmptyText(item?.publishDate, item?.issueDate, item?.date),
    lawId: firstNonEmptyText(item?.lawId, item?.law_id, item?.id),
    text: firstNonEmptyText(
      item?.text,
      item?.content,
      item?.lawContent,
      item?.detail,
      item?.detailText,
      item?.articleText,
      item?.fullText,
      item?.summary
    ),
  };
}

export function buildRetrievalSearchUrl({
  keyword = "",
  retrievalType = "auto",
  timeRange = "all",
  courtLevel = "national",
  lawLevel = "all",
  focusCaseNo = "",
} = {}) {
  const query = String(keyword || "").trim();
  const params = new URLSearchParams();
  if (query) {
    params.set("mode", "retrieval");
    params.set("q", query);
  }
  if (retrievalType && retrievalType !== "auto") params.set("retrievalType", retrievalType);
  if (timeRange && timeRange !== "all") params.set("timeRange", timeRange);
  if (courtLevel && courtLevel !== "national") params.set("courtLevel", courtLevel);
  if (lawLevel && lawLevel !== "all") params.set("lawLevel", lawLevel);
  if (focusCaseNo) params.set("focusCaseNo", focusCaseNo);
  const text = params.toString();
  return `/case-retrieval${text ? `?${text}` : ""}`;
}

function readDetailEntries() {
  if (typeof sessionStorage === "undefined") return {};
  try {
    const parsed = JSON.parse(sessionStorage.getItem(DETAIL_STORAGE_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeDetailEntries(entries) {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(DETAIL_STORAGE_KEY, JSON.stringify(entries || {}));
}

export function storeRetrievalDetailEntry(entry) {
  const entries = readDetailEntries();
  const id = `detail_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  entries[id] = {
    ...(entry || {}),
    storedAt: Date.now(),
  };

  const trimmed = {};
  Object.entries(entries)
    .sort((a, b) => Number(b[1]?.storedAt || 0) - Number(a[1]?.storedAt || 0))
    .slice(0, MAX_DETAIL_ENTRIES)
    .forEach(([key, value]) => {
      trimmed[key] = value;
    });
  writeDetailEntries(trimmed);
  return id;
}

export function loadRetrievalDetailEntry(id) {
  const entries = readDetailEntries();
  const entry = entries?.[String(id || "").trim()];
  return entry && typeof entry === "object" ? entry : null;
}

function buildMetaGridHtml(entries, gridClass = "case-summary-grid") {
  const validEntries = (entries || []).filter((entry) => entry?.value);
  if (!validEntries.length) return "";
  return `
    <dl class="${gridClass}">
      ${validEntries
        .map(
          (entry) => `
            <div class="${gridClass}-item">
              <dt class="${gridClass}-label">${escapeHtml(entry.label || "")}</dt>
              <dd class="${gridClass}-value">${entry.value}</dd>
            </div>
          `
        )
        .join("")}
    </dl>
  `;
}

function normalizeCaseContentSource(raw) {
  return normalizeEmArtifacts(raw)
    .replace(/\r\n?/g, "\n")
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\s*hr[^>]*>/gi, "\n")
    .replace(/<\/(?:p|div|section|article|blockquote|h[1-6]|table|thead|tbody|tfoot|tr|caption)\s*>/gi, "\n")
    .replace(/<(?:p|div|section|article|blockquote|h[1-6]|table|thead|tbody|tfoot|tr|caption)[^>]*>/gi, "")
    .replace(/<\s*(?:ul|ol|dl)[^>]*>/gi, "\n")
    .replace(/<\/(?:ul|ol|dl)\s*>/gi, "\n")
    .replace(/<\s*li[^>]*>/gi, "\n")
    .replace(/<\/\s*li\s*>/gi, "")
    .replace(/<\s*t[dh][^>]*>/gi, "")
    .replace(/<\/\s*t[dh]\s*>/gi, "  ");
}

function splitCaseContentLines(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return [];
  return normalizeCaseContentSource(raw)
    .split(/\n+/)
    .map((line) => line.replace(/^[\s\u3000]+|[\s\u3000]+$/g, ""))
    .filter(Boolean);
}

function stripDuplicateHeaderLines(lines, fields) {
  const working = [...lines];
  const titleText = normalizeCompareText(fields?.title);
  const courtText = normalizeCompareText(fields?.court);
  const caseNoText = normalizeCompareText(fields?.caseNo);
  const docTypeText = normalizeCompareText(fields?.documentType);

  while (working.length) {
    const current = normalizeCompareText(working[0]);
    if (!current) {
      working.shift();
      continue;
    }
    const isDuplicate =
      (titleText && current === titleText) ||
      (courtText && current === courtText) ||
      (caseNoText && current === caseNoText) ||
      (docTypeText && current === docTypeText);
    if (!isDuplicate) break;
    working.shift();
  }

  return working;
}

function isFooterLine(line) {
  const plain = normalizeCompareText(line);
  if (!plain) return false;
  return FOOTER_ROLE_RE.test(plain) || FOOTER_DATE_RE.test(plain);
}

function extractFooterLines(lines) {
  const source = [...lines];
  const appendixLines = [];
  while (source.length && APPENDIX_LINE_RE.test(normalizeCompareText(source[source.length - 1]))) {
    appendixLines.unshift(source.pop());
  }

  const working = [...source];
  const footerLines = [];
  while (working.length && isFooterLine(working[working.length - 1])) {
    footerLines.unshift(working.pop());
  }
  if (footerLines.length < 2) {
    return { bodyLines: lines, footerLines: [] };
  }
  return { bodyLines: [...working, ...appendixLines], footerLines };
}

function formatCaseParagraphHtml(rawLine) {
  const line = String(rawLine ?? "").trim();
  if (!line) return "";
  /* 不做「标签：正文」拆分，避免把「法院认为：」「基本事实：」等渲染成加粗小标题样式 */
  return `<p class="case-paper-paragraph case-paper-paragraph--body">${toRichTextHtml(line)}</p>`;
}

function renderCaseBodyFlat(lines) {
  if (!lines.length) {
    return `<div class="case-paper-body-flat"><p class="case-paper-empty">暂无文书正文。</p></div>`;
  }
  const inner = lines.map((line) => formatCaseParagraphHtml(line)).join("");
  return `<div class="case-paper-body-flat">${inner}</div>`;
}

function formatFooterLineHtml(rawLine) {
  const plain = richTextToPlainText(rawLine).replace(/\s+/g, "").trim();
  if (!plain) return "";
  const roleMatch = plain.match(
    /^(审判人员|审判长|审判员|代理审判员|助理审判员|书记员|代理书记员|执行员|执行法官|法官助理|人民陪审员|陪审员)(.+)$/
  );
  if (roleMatch && roleMatch[2] && !/(审判长|审判员|书记员|执行员|法官助理|陪审员)/.test(roleMatch[2])) {
    return `
      <p class="case-paper-sign-line">
        <span class="case-paper-sign-role">${escapeHtml(roleMatch[1])}</span>
        <span class="case-paper-sign-name">${escapeHtml(roleMatch[2])}</span>
      </p>
    `;
  }
  if (FOOTER_DATE_RE.test(plain)) {
    return `<p class="case-paper-sign-date">${escapeHtml(plain)}</p>`;
  }
  return `<p class="case-paper-sign-text">${toRichTextHtml(rawLine)}</p>`;
}

function renderFooterHtml(lines) {
  if (!lines.length) return "";
  return `
    <footer class="case-paper-footer">
      ${lines.map((line) => formatFooterLineHtml(line)).join("")}
    </footer>
  `;
}

export function buildCaseDetailDocumentHtml(item) {
  const fields = getCaseCoreFields(item);
  const titleHtml = toRichTextHtml(fields.title || "（未命名案例）");
  const courtHtml = toRichTextHtml(fields.court);
  const dateHtml = toRichTextHtml(fields.date);
  const caseNoHtml = toRichTextHtml(fields.caseNo);
  const caseTypeHtml = toRichTextHtml(fields.caseType);
  const levelHtml = toRichTextHtml(fields.level);

  const strippedLines = stripDuplicateHeaderLines(splitCaseContentLines(fields.content), fields);
  const { bodyLines, footerLines } = extractFooterLines(strippedLines);
  const bodyHtml = renderCaseBodyFlat(bodyLines);
  const footerHtml = renderFooterHtml(footerLines);

  return `
    <div class="case-detail-shell">
      <section class="case-summary-card">
        <h1 class="case-summary-title">${titleHtml}</h1>
        ${buildMetaGridHtml(
          [
            { label: "法院", value: courtHtml },
            { label: "日期", value: dateHtml },
            { label: "案号", value: caseNoHtml },
            { label: "类型", value: caseTypeHtml },
            { label: "审级", value: levelHtml },
          ],
          "case-summary-grid"
        )}
      </section>

      <article class="case-paper case-paper--case">
        <div class="case-paper-body case-paper-body--continuous">${bodyHtml}</div>
        ${footerHtml}
      </article>
    </div>
  `;
}

export function extractLawInfoText(rawInfo) {
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
    if (typeof item === "string" && item.trim()) return item;
  }

  const detailObjCandidates = [info.body, info.data, info.result, info.law, info.info, info.detailInfo];
  for (const obj of detailObjCandidates) {
    if (obj && typeof obj === "object") {
      const text = extractLawInfoText(obj);
      if (text) return text;
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

export function buildLawDetailDocumentHtml(item) {
  const fields = getLawCoreFields(item);
  const titleHtml = toRichTextHtml(fields.title || "（未命名法规）");
  const articleNameHtml = toRichTextHtml(fields.articleName);
  const dateHtml = toRichTextHtml(fields.date);
  const lawIdHtml = fields.lawId ? escapeHtml(fields.lawId) : "";
  const textHtml = toRichTextHtml(fields.text);

  return `
    <div class="case-detail-shell case-detail-shell--law">
      <section class="case-summary-card case-summary-card--law">
        <p class="case-summary-eyebrow">法规标题</p>
        <h1 class="case-summary-title">${titleHtml}</h1>
        ${buildMetaGridHtml(
          [
            { label: "条文", value: articleNameHtml },
            { label: "日期", value: dateHtml },
            { label: "法规ID", value: lawIdHtml },
          ],
          "case-summary-grid"
        )}
      </section>

      <article class="case-paper case-paper--law">
        <div class="case-paper-body case-paper-body--continuous">
          ${
            textHtml
              ? `<div class="case-paper-rich case-paper-rich--law">${textHtml}</div>`
              : `<p class="case-paper-empty">暂无条文内容。</p>`
          }
        </div>
      </article>
    </div>
  `;
}
