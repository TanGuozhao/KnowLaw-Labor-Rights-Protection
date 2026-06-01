import { runContractReview, runContractSummary, uploadEvidenceOcr } from "./api.js";
import { setupProtectedPage } from "./page-auth.js";

const fileReviewInput = document.getElementById("fileReviewInput");
const fileReviewFileHint = document.getElementById("fileReviewFileHint");
const frHistoryList = document.getElementById("frHistoryList");
const frHistorySearch = document.getElementById("frHistorySearch");
const frCurrentFileName = document.getElementById("frCurrentFileName");
const frDocScroll = document.getElementById("frDocScroll");
const frDocStatus = document.getElementById("frDocStatus");
const frDocEmpty = document.getElementById("frDocEmpty");
const frDocFrame = document.getElementById("frDocFrame");
const frDocImage = document.getElementById("frDocImage");
const frDocHtml = document.getElementById("frDocHtml");
const frDocPlain = document.getElementById("frDocPlain");
const frDocUnsupported = document.getElementById("frDocUnsupported");
const frRerunBtn = document.getElementById("frRerunBtn");
const frDownloadBtn = document.getElementById("frDownloadBtn");
const frAiMeta = document.getElementById("frAiMeta");
const frRiskListRoot = document.getElementById("frRiskListRoot");
const frSummaryMeta = document.getElementById("frSummaryMeta");
const frSummaryRoot = document.getElementById("frSummaryRoot");
const frContractTypeEl = document.getElementById("frContractType");

const FR_STANCE_OPTIONS_LABOR = [
  { value: "劳动者（乙方）", label: "劳动者（乙方）" },
  { value: "雇佣者（甲方）", label: "雇佣者（甲方）" },
  { value: "第三方（中立）", label: "第三方（中立）" },
];
const FR_STANCE_OPTIONS_COMPLAINT = [
  { value: "原告（起诉方）", label: "原告（起诉方）" },
  { value: "被告（应诉方）", label: "被告（应诉方）" },
  { value: "第三方（中立）", label: "第三方（中立）" },
];

const frUploadLabel = document.querySelector("label.fr-upload");

function isFrPlaceholderEmptyView() {
  return Boolean(
    frDocEmpty &&
      !frDocEmpty.classList.contains("hidden") &&
      frDocEmpty.querySelector("[data-fr-placeholder]")
  );
}

setupProtectedPage({
  welcomeEl: "mainUserWelcome",
  logoutEl: "mainLogoutBtn",
});

function getDocumentType() {
  const v = frContractTypeEl?.value || "labor_contract";
  if (v === "civil_complaint") return "civil_complaint";
  if (v === "labor") return "labor_contract";
  return "labor_contract";
}

function syncFrStanceOptions() {
  const stanceEl = document.getElementById("frReviewStance");
  if (!stanceEl) return;
  const opts =
    getDocumentType() === "civil_complaint" ? FR_STANCE_OPTIONS_COMPLAINT : FR_STANCE_OPTIONS_LABOR;
  const cur = stanceEl.value;
  stanceEl.innerHTML = "";
  for (const o of opts) {
    const opt = document.createElement("option");
    opt.value = o.value;
    opt.textContent = o.label;
    stanceEl.appendChild(opt);
  }
  const match = opts.find((x) => x.value === cur);
  stanceEl.value = match ? cur : opts[0].value;
}

const DB_NAME = "labelhelp-file-review";
const DB_VER = 1;
const STORE = "files";

/** 正文解析结果本地缓存版本（与 FrRecord.parseCache 内各字段的 v 一致） */
const PARSE_CACHE_VERSION = 1;

/** @type {string | null} */
let activeRecordId = null;
let dbPromise = null;
/** @type {FrRecord[] | null} */
let recordsCache = null;
let historySearchTimerId = 0;
let pdfObjectUrl = "";
let imageObjectUrl = "";

/** mammoth 输出的 HTML 快照，用于清除高亮后还原 */
let docxHtmlSnapshot = "";
/** 纯文本模式下的正文快照 */
let plainTextSnapshot = "";
/** PDF 解析与高亮所需的页面状态 */
let pdfViewerState = null;
let pdfRenderVersion = 0;
let pdfjsLibPromise = null;

const PDFJS_DIST_VERSION = "5.6.205";
const PDFJS_MODULE_URL = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_DIST_VERSION}/build/pdf.min.mjs`;
const PDFJS_WORKER_URL = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_DIST_VERSION}/build/pdf.worker.min.mjs`;

/** 风险卡片「定位」用：键 -> 模型返回的原文 */
const riskHighlightByKey = new Map();
let riskHighlightKeySeq = 0;

/** 是否至少成功完成过一次审查（用于「下载报告」可用与按钮文案） */
let hasCompletedReviewOnce = false;
let isReviewing = false;

function updateReviewActionButtons() {
  if (!frRerunBtn) return;
  if (isReviewing) {
    frRerunBtn.textContent = "正在审查";
    frRerunBtn.disabled = true;
  } else {
    frRerunBtn.disabled = false;
    frRerunBtn.textContent = hasCompletedReviewOnce ? "再次审查" : "开始审查";
  }
  if (frDownloadBtn) {
    const dis = !hasCompletedReviewOnce || isReviewing;
    frDownloadBtn.disabled = dis;
    frDownloadBtn.classList.toggle("fr-action--muted", dis);
  }
}

/**
 * @typedef {{
 *   pdf?: { v: number, scanByPage: Record<string, { detections: unknown[] }> },
 *   docx?: { v: number, html: string },
 *   text?: { v: number, text: string },
 * }} FrParseCache
 */

/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   mimeType: string,
 *   kind: string,
 *   createdAt: number,
 *   blob: Blob,
 *   parseCache?: FrParseCache
 * }} FrRecord
 */

function newId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `fr_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function sortRecordsByCreatedTime(rows = []) {
  return [...rows].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

function openDb() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error || new Error("IndexedDB 打开失败"));
    };
    req.onblocked = () => {
      dbPromise = null;
      reject(new Error("IndexedDB 被占用，请关闭其他页面后重试"));
    };
  });

  return dbPromise;
}

/** @returns {Promise<FrRecord[]>} */
async function readAllRecordsFromDb() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(/** @type {FrRecord[]} */ (req.result || []));
    req.onerror = () => reject(req.error);
  });
}

/** @returns {Promise<FrRecord[]>} */
async function loadRecords(force = false) {
  if (!force && Array.isArray(recordsCache)) {
    return recordsCache;
  }
  const rows = await readAllRecordsFromDb();
  recordsCache = sortRecordsByCreatedTime(rows);
  return recordsCache;
}

/** @param {FrRecord} rec */
async function saveRecord(rec) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(rec);
    tx.oncomplete = () => {
      const next = Array.isArray(recordsCache)
        ? recordsCache.filter((item) => item.id !== rec.id)
        : [];
      recordsCache = sortRecordsByCreatedTime([rec, ...next]);
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

/** @param {string} id */
async function getRecord(id) {
  const cached = Array.isArray(recordsCache)
    ? recordsCache.find((item) => item.id === id) || null
    : null;
  if (cached) return cached;

  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

/**
 * 将解析结果合并写入当前活动记录的 IndexedDB，避免下次重复 OCR / Word 解析等。
 * @param {FrParseCache} patch
 */
async function persistParseCacheForActiveRecord(patch) {
  if (!activeRecordId || !patch || typeof patch !== "object") return;
  const rec = await getRecord(activeRecordId);
  if (!rec) return;
  const prev = rec.parseCache && typeof rec.parseCache === "object" ? rec.parseCache : {};
  rec.parseCache = { ...prev, ...patch };
  await saveRecord(rec);
}

/**
 * @param {unknown} pdfParseCache
 * @param {number} pageNumber
 */
function getCachedScanDetections(pdfParseCache, pageNumber) {
  const sp =
    pdfParseCache && typeof pdfParseCache === "object" && "scanByPage" in pdfParseCache
      ? /** @type {{ scanByPage?: unknown }} */ (pdfParseCache).scanByPage
      : null;
  if (!sp || typeof sp !== "object") return null;
  const entry = /** @type {Record<string, unknown>} */ (sp)[String(pageNumber)];
  const d = entry && typeof entry === "object" && "detections" in entry ? entry.detections : null;
  return Array.isArray(d) && d.length ? d : null;
}

/**
 * @param {object[]} pages
 * @returns {{ v: number, scanByPage: Record<string, { detections: unknown[] }> } | null}
 */
function buildPdfScanCachePayload(pages) {
  /** @type {Record<string, { detections: unknown[] }>} */
  const scanByPage = {};
  for (const p of pages) {
    if (!p || p.mode !== "scan" || p.error) continue;
    const d = p.detections;
    if (!Array.isArray(d) || !d.length) continue;
    scanByPage[String(p.pageNumber)] = { detections: d };
  }
  return Object.keys(scanByPage).length
    ? { v: PARSE_CACHE_VERSION, scanByPage }
    : null;
}

/**
 * @param {File} file
 * @param {Blob} [blob]
 */
function classifyFile(file, blob) {
  const name = String(file.name || "").toLowerCase();
  const t = String((blob && blob.type) || file.type || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  if (t === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (
    t === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    name.endsWith(".docx")
  ) {
    return "docx";
  }
  if (t === "application/msword" || name.endsWith(".doc")) return "doc";
  if (t.startsWith("text/") || name.endsWith(".txt")) return "text";
  if (t.startsWith("image/")) return "image";
  return "unknown";
}

function setStatus(text, isError = false) {
  if (!frDocStatus) return;
  frDocStatus.textContent = text || "";
  frDocStatus.classList.toggle("fr-doc-status--error", Boolean(isError && text));
}

function renderPagedHtmlDocument(html, options = {}) {
  if (!frDocHtml) return;
  frDocHtml.classList.remove("hidden");
  frDocHtml.innerHTML = html || "<p>（未解析到正文）</p>";
  docxHtmlSnapshot = html || "";
}

function renderPagedTextDocument(text, options = {}) {
  if (!frDocPlain) return;
  frDocPlain.classList.remove("hidden");
  frDocPlain.textContent = text || "";
  plainTextSnapshot = text || "";
}

async function loadPdfJsLib() {
  if (!pdfjsLibPromise) {
    pdfjsLibPromise = import(PDFJS_MODULE_URL).then((mod) => {
      mod.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
      return mod;
    });
  }
  return pdfjsLibPromise;
}

function hasPdfView() {
  return Boolean(
    pdfViewerState &&
      frDocFrame &&
      !frDocFrame.classList.contains("hidden") &&
      Array.isArray(pdfViewerState.pages)
  );
}

function clearPdfTextHighlight(div) {
  if (!div) return;
  div.classList.remove(
    "highlight",
    "begin",
    "middle",
    "end",
    "selected",
    "fr-ai-highlight",
    "fr-pdf-text-hit",
    "fr-doc-mark-target",
    "fr-locate-flash"
  );
  div.removeAttribute("data-highlight-key");
}

function clearPdfHighlights() {
  if (!pdfViewerState?.pages) return;
  for (const page of pdfViewerState.pages) {
    if (Array.isArray(page.textDivs)) {
      page.textDivs.forEach(clearPdfTextHighlight);
    }
    if (page.highlightLayer) {
      page.highlightLayer.querySelectorAll(".fr-pdf-ocr-highlight").forEach((node) => node.remove());
    }
  }
}

function clearPdfViewerState() {
  clearPdfHighlights();
  pdfViewerState = null;
  if (frDocFrame) {
    frDocFrame.innerHTML = "";
    frDocFrame.classList.remove("fr-pdf-viewer--loading");
  }
}

function getPdfRenderTargetWidth() {
  const scrollWidth = frDocScroll?.clientWidth || 860;
  return Math.max(640, Math.min(980, scrollWidth - 64));
}

/** 画布按设备像素比放大，CSS 仍用逻辑尺寸；上限避免超大页面拖慢渲染与 OCR。 */
function getPdfOutputScale() {
  const dpr =
    typeof globalThis !== "undefined" && typeof globalThis.devicePixelRatio === "number"
      ? globalThis.devicePixelRatio
      : 1;
  return Math.min(Math.max(dpr, 1), 2.5);
}

function normalizePdfTextItems(items = []) {
  const ranges = [];
  let text = "";
  /** 与 pdf.js TextLayer 一致：忽略 str===undefined 的项（如 begin/endMarkedContent），否则 ranges 下标与 textDivs 错位，高亮无法落到真实 span 上 */
  const drawable = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i] || {};
    if (item.str === undefined) continue;
    drawable.push(item);
  }
  for (let j = 0; j < drawable.length; j++) {
    const item = drawable[j];
    const value = normalizeNbsp(item.str || "");
    const start = text.length;
    text += value;
    const end = text.length;
    ranges.push({ start, end });
    const isLast = j === drawable.length - 1;
    if (item.hasEOL) {
      text += "\n";
    } else if (value && !isLast) {
      text += " ";
    }
  }
  return { text, ranges };
}

function normalizeOcrDetections(rows = []) {
  return rows
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const polygon = Array.isArray(row.polygon)
        ? row.polygon
            .map((point) => {
              const x = Number(point?.x);
              const y = Number(point?.y);
              if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
              return { x, y };
            })
            .filter(Boolean)
        : [];
      let bbox = row.bbox && typeof row.bbox === "object" ? row.bbox : null;
      if ((!bbox || !Number.isFinite(Number(bbox.left))) && polygon.length) {
        const xs = polygon.map((point) => point.x);
        const ys = polygon.map((point) => point.y);
        bbox = {
          left: Math.min(...xs),
          top: Math.min(...ys),
          width: Math.max(...xs) - Math.min(...xs),
          height: Math.max(...ys) - Math.min(...ys),
        };
      }
      if (!bbox) return null;
      const left = Number(bbox.left);
      const top = Number(bbox.top);
      const width = Number(bbox.width);
      const height = Number(bbox.height);
      if (![left, top, width, height].every(Number.isFinite)) return null;
      return {
        text: String(row.text || "").trim(),
        polygon,
        bbox: { left, top, width, height },
        confidence: row.confidence,
      };
    })
    .filter(Boolean);
}

function normalizeOcrLines(lines = []) {
  const ranges = [];
  let text = "";
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const value = normalizeNbsp(line?.text || "");
    const start = text.length;
    text += value;
    const end = text.length;
    ranges.push({ start, end });
    if (value && i < lines.length - 1) {
      text += "\n";
    }
  }
  return { text, ranges };
}

function isLikelyTextPdfPage(items = []) {
  const nonEmpty = items
    .map((item) => String(item?.str || "").trim())
    .filter(Boolean);
  const compact = nonEmpty.join("").replace(/\s+/g, "");
  return nonEmpty.length >= 8 && compact.length >= 30;
}

/**
 * @param {object} viewport 与 pdfPage.render 相同的高分辨率 viewport（scale 已含 outputScale）
 * @param {number} pageNumber
 * @param {number} [outputScale=1] 设备像素比；用于把 canvas 物理像素映射到 CSS 逻辑宽高
 */
function createPdfPageShell(viewport, pageNumber, outputScale = 1) {
  const cssW = Math.max(1, Math.round(viewport.width / outputScale));
  const cssH = Math.max(1, Math.round(viewport.height / outputScale));

  const pageEl = document.createElement("section");
  pageEl.className = "fr-pdf-page";
  pageEl.dataset.pageNumber = String(pageNumber);

  const meta = document.createElement("div");
  meta.className = "fr-pdf-page__meta";

  const label = document.createElement("span");
  label.className = "fr-pdf-page__label";
  label.textContent = `第 ${pageNumber} 页`;

  const badge = document.createElement("span");
  badge.className = "fr-pdf-page__badge";
  badge.textContent = "解析中";

  meta.append(label, badge);

  const paper = document.createElement("div");
  paper.className = "fr-pdf-page__paper";
  paper.style.width = `${cssW}px`;
  paper.style.height = `${cssH}px`;
  paper.style.setProperty("--total-scale-factor", String(viewport.scale));

  const canvas = document.createElement("canvas");
  canvas.className = "fr-pdf-page__canvas";
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  canvas.setAttribute("aria-hidden", "true");

  const textLayer = document.createElement("div");
  textLayer.className = "textLayer fr-pdf-text-layer";
  textLayer.style.width = `${cssW}px`;
  textLayer.style.height = `${cssH}px`;
  textLayer.style.setProperty("--total-scale-factor", String(viewport.scale));

  const highlightLayer = document.createElement("div");
  highlightLayer.className = "fr-pdf-highlight-layer";
  highlightLayer.style.width = `${cssW}px`;
  highlightLayer.style.height = `${cssH}px`;

  paper.append(canvas, textLayer, highlightLayer);
  pageEl.append(meta, paper);

  return { pageEl, badge, canvas, textLayer, highlightLayer };
}

function createCanvasBlob(canvas, type = "image/png") {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("无法导出页面图像"));
    }, type);
  });
}

/**
 * 高分辨率 canvas 上屏后，OCR 使用缩放到「逻辑尺寸」的位图，使返回框坐标与 highlight 层（CSS 像素）一致。
 * @param {number} [outputScale=1]
 */
async function ocrPdfCanvasPage(canvas, pageNumber, renderVersion, outputScale = 1) {
  let blobSource = canvas;
  if (outputScale > 1) {
    const w = Math.max(1, Math.round(canvas.width / outputScale));
    const h = Math.max(1, Math.round(canvas.height / outputScale));
    const oc = document.createElement("canvas");
    oc.width = w;
    oc.height = h;
    const ctx = oc.getContext("2d", { alpha: false });
    if (ctx) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(canvas, 0, 0, w, h);
      blobSource = oc;
    }
  }
  const blob = await createCanvasBlob(blobSource);
  if (renderVersion !== pdfRenderVersion) {
    throw new Error("已切换到其他文件");
  }
  const file = new File([blob], `file-review-page-${pageNumber}.png`, {
    type: blob.type || "image/png",
  });
  const result = await uploadEvidenceOcr(file);
  if (renderVersion !== pdfRenderVersion) {
    throw new Error("已切换到其他文件");
  }
  return {
    text: String(result?.ocr_text || ""),
    detections: normalizeOcrDetections(result?.detections || []),
  };
}

/**
 * @param {Blob} blob
 * @param {string} name
 * @param {unknown} [pdfParseCache] 首次解析后写入 IndexedDB，再次打开时传入以跳过扫描页 OCR。
 */
async function renderPdfDocument(blob, name, pdfParseCache) {
  if (!frDocFrame) return;

  const renderVersion = ++pdfRenderVersion;
  clearPdfViewerState();
  pdfObjectUrl = URL.createObjectURL(blob);

  frDocFrame.classList.remove("hidden");
  frDocFrame.classList.add("fr-pdf-viewer--loading");
  if (frCurrentFileName) frCurrentFileName.textContent = name;

  try {
    const pdfjsLib = await loadPdfJsLib();
    if (renderVersion !== pdfRenderVersion) return;

    const loadingTask = pdfjsLib.getDocument(pdfObjectUrl);
    const pdfDoc = await loadingTask.promise;
    if (renderVersion !== pdfRenderVersion) return;

    const pages = [];
    let textPageCount = 0;
    let scanPageCount = 0;
    let scanFromCacheCount = 0;
    let ocrFailureCount = 0;

    const outputScale = getPdfOutputScale();

    for (let pageNumber = 1; pageNumber <= pdfDoc.numPages; pageNumber++) {
      if (renderVersion !== pdfRenderVersion) return;
      setStatus(`正在解析 PDF 第 ${pageNumber}/${pdfDoc.numPages} 页…`);

      const pdfPage = await pdfDoc.getPage(pageNumber);
      const baseViewport = pdfPage.getViewport({ scale: 1 });
      const targetWidth = getPdfRenderTargetWidth();
      const scale = targetWidth / baseViewport.width;
      const viewport = pdfPage.getViewport({ scale: scale * outputScale });

      const shell = createPdfPageShell(viewport, pageNumber, outputScale);
      frDocFrame.appendChild(shell.pageEl);

      const canvasContext = shell.canvas.getContext("2d", { alpha: false });
      await pdfPage.render({ canvasContext, viewport }).promise;
      const textContent = await pdfPage.getTextContent({ includeMarkedContent: true });
      const textItems = Array.isArray(textContent.items) ? textContent.items : [];

      if (isLikelyTextPdfPage(textItems)) {
        const textLayer = new pdfjsLib.TextLayer({
          textContentSource: textContent,
          container: shell.textLayer,
          viewport,
        });
        await textLayer.render();
        const textIndex = normalizePdfTextItems(textItems);

        pages.push({
          pageNumber,
          mode: "text",
          pageEl: shell.pageEl,
          paperEl: shell.pageEl.querySelector(".fr-pdf-page__paper"),
          highlightLayer: shell.highlightLayer,
          textDivs: Array.from(textLayer.textDivs || []),
          itemRanges: textIndex.ranges,
          searchText: textIndex.text,
        });
        textPageCount += 1;
        shell.badge.textContent = "文字层";
      } else {
        scanPageCount += 1;
        shell.badge.textContent = "OCR";
        shell.pageEl.classList.add("is-scan-page");
        shell.textLayer.classList.add("hidden");
        const cachedDets = getCachedScanDetections(pdfParseCache, pageNumber);
        try {
          if (cachedDets) {
            setStatus(`正在从本地缓存恢复扫描页 ${pageNumber}/${pdfDoc.numPages}…`);
            const lineIndex = normalizeOcrLines(cachedDets);
            pages.push({
              pageNumber,
              mode: "scan",
              pageEl: shell.pageEl,
              paperEl: shell.pageEl.querySelector(".fr-pdf-page__paper"),
              highlightLayer: shell.highlightLayer,
              detections: cachedDets,
              lineRanges: lineIndex.ranges,
              searchText: lineIndex.text,
            });
            shell.badge.textContent = "OCR(缓存)";
            scanFromCacheCount += 1;
          } else {
            setStatus(`正在识别扫描页 ${pageNumber}/${pdfDoc.numPages}…`);
            const ocrData = await ocrPdfCanvasPage(
              shell.canvas,
              pageNumber,
              renderVersion,
              outputScale
            );
            const lineIndex = normalizeOcrLines(ocrData.detections);
            pages.push({
              pageNumber,
              mode: "scan",
              pageEl: shell.pageEl,
              paperEl: shell.pageEl.querySelector(".fr-pdf-page__paper"),
              highlightLayer: shell.highlightLayer,
              detections: ocrData.detections,
              lineRanges: lineIndex.ranges,
              searchText: lineIndex.text,
            });
          }
        } catch (err) {
          ocrFailureCount += 1;
          shell.badge.textContent = "OCR失败";
          pages.push({
            pageNumber,
            mode: "scan",
            pageEl: shell.pageEl,
            paperEl: shell.pageEl.querySelector(".fr-pdf-page__paper"),
            highlightLayer: shell.highlightLayer,
            detections: [],
            lineRanges: [],
            searchText: "",
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    if (renderVersion !== pdfRenderVersion) return;

    pdfViewerState = {
      type: "pdf",
      pages,
      reviewText: pages
        .map((page) => String(page.searchText || "").trim())
        .filter(Boolean)
        .join("\n\n"),
    };
    frDocFrame.classList.remove("fr-pdf-viewer--loading");

    const pdfPayload = buildPdfScanCachePayload(pages);
    if (pdfPayload) {
      void persistParseCacheForActiveRecord({ pdf: pdfPayload });
    }

    let status = `已解析 PDF：${textPageCount} 页文字层`;
    if (scanPageCount) {
      status += `，${scanPageCount} 页扫描内容`;
      if (scanFromCacheCount) {
        status += `（${scanFromCacheCount} 页使用本地缓存，未重复 OCR）`;
      }
    }
    if (ocrFailureCount) status += `（${ocrFailureCount} 页 OCR 失败）`;
    setStatus(status, !pdfViewerState.reviewText.trim() && ocrFailureCount > 0);
  } catch (err) {
    clearPdfViewerState();
    frDocFrame?.classList.add("hidden");
    if (frDocUnsupported) {
      frDocUnsupported.classList.remove("hidden");
      frDocUnsupported.textContent = `无法解析该 PDF 文件：${err instanceof Error ? err.message : String(err)}`;
    }
    setStatus("PDF 解析失败。", true);
  }
}

function findPdfPageMatch(pageState, originalText) {
  if (!pageState?.searchText || !originalText) return null;
  const range = findMatchRange(pageState.searchText, originalText);
  if (!range) return null;

  if (pageState.mode === "text") {
    const itemIndexes = [];
    for (let i = 0; i < pageState.itemRanges.length; i++) {
      const itemRange = pageState.itemRanges[i];
      if (itemRange.end <= range.start || itemRange.start >= range.end) continue;
      itemIndexes.push(i);
    }
    if (!itemIndexes.length) return null;
    return { pageState, mode: "text", itemIndexes };
  }

  const lineIndexes = [];
  for (let i = 0; i < pageState.lineRanges.length; i++) {
    const lineRange = pageState.lineRanges[i];
    if (lineRange.end <= range.start || lineRange.start >= range.end) continue;
    lineIndexes.push(i);
  }
  if (!lineIndexes.length) return null;
  return { pageState, mode: "scan", lineIndexes };
}

function findPdfMatch(originalText) {
  if (!pdfViewerState?.pages) return null;
  for (const pageState of pdfViewerState.pages) {
    const match = findPdfPageMatch(pageState, originalText);
    if (match) return match;
  }
  return null;
}

function applyPdfTextHighlight(pageState, itemIndexes, highlightKey) {
  const total = itemIndexes.length;
  itemIndexes.forEach((itemIndex, pos) => {
    const div = pageState.textDivs?.[itemIndex];
    if (!div) return;
    div.classList.add("highlight", "fr-ai-highlight", "fr-pdf-text-hit");
    if (total > 1) {
      div.classList.add(pos === 0 ? "begin" : pos === total - 1 ? "end" : "middle");
    }
    if (highlightKey) div.setAttribute("data-highlight-key", highlightKey);
  });
}

function applyPdfOcrHighlight(pageState, lineIndexes, highlightKey) {
  if (!pageState.highlightLayer) return;
  lineIndexes.forEach((lineIndex) => {
    const line = pageState.detections?.[lineIndex];
    const box = line?.bbox;
    if (!box) return;
    const rect = document.createElement("div");
    rect.className = "fr-pdf-ocr-highlight fr-ai-highlight";
    if (highlightKey) rect.setAttribute("data-highlight-key", highlightKey);
    rect.style.left = `${box.left}px`;
    rect.style.top = `${box.top}px`;
    rect.style.width = `${Math.max(box.width, 2)}px`;
    rect.style.height = `${Math.max(box.height, 16)}px`;
    pageState.highlightLayer.appendChild(rect);
  });
}

function applyPdfHighlight(match, highlightKey) {
  if (!match) return false;
  if (match.mode === "text") {
    applyPdfTextHighlight(match.pageState, match.itemIndexes, highlightKey);
    return true;
  }
  if (match.mode === "scan") {
    applyPdfOcrHighlight(match.pageState, match.lineIndexes, highlightKey);
    return true;
  }
  return false;
}

function cleanupObjectUrls() {
  pdfRenderVersion += 1;
  clearPdfViewerState();
  if (pdfObjectUrl) {
    URL.revokeObjectURL(pdfObjectUrl);
    pdfObjectUrl = "";
  }
  if (imageObjectUrl) {
    URL.revokeObjectURL(imageObjectUrl);
    imageObjectUrl = "";
  }
  if (frDocFrame) frDocFrame.innerHTML = "";
  if (frDocImage) frDocImage.removeAttribute("src");
}

function hideAllDocViews() {
  [frDocEmpty, frDocFrame, frDocImage, frDocHtml, frDocPlain, frDocUnsupported].forEach((el) => {
    if (el) el.classList.add("hidden");
  });
}

/** 无历史记录或出错时：仅显示占位提示，不加载示例正文 */
function showDemoView() {
  cleanupObjectUrls();
  hideAllDocViews();
  docxHtmlSnapshot = "";
  plainTextSnapshot = "";
  frDocEmpty?.classList.remove("hidden");
  if (frCurrentFileName) {
    frCurrentFileName.textContent = "未打开文件";
  }
  setStatus("");
}

/** 打开用户文件前：去掉演示区锚点 id，避免与正文定位冲突 */
function stripDemoMarkId() {
  const el = document.getElementById("frDocMark");
  if (el && frDocEmpty?.contains(el)) {
    el.removeAttribute("id");
  }
}

function clearDynamicLocateIds() {
  [frDocFrame, frDocImage, frDocPlain].forEach((el) => {
    if (el?.id === "frDocMark") el.removeAttribute("id");
  });
  if (frDocHtml) {
    frDocHtml.querySelectorAll("[id='frDocMark']").forEach((n) => n.removeAttribute("id"));
  }
}

/**
 * @param {Blob} blob
 * @param {string} name
 * @param {string} kind
 * @param {FrParseCache} [parseCache] 与记录一并存储的解析快照，避免重复 OCR / Word 解析。
 */
async function renderBlobToView(blob, name, kind, parseCache) {
  stripDemoMarkId();
  cleanupObjectUrls();
  hideAllDocViews();
  clearDynamicLocateIds();
  docxHtmlSnapshot = "";
  plainTextSnapshot = "";

  const mammothLib = globalThis.mammoth;

  if (kind === "pdf") {
    const pdfCache =
      parseCache?.pdf?.v === PARSE_CACHE_VERSION ? parseCache.pdf : undefined;
    await renderPdfDocument(blob, name, pdfCache);
    return;
  }

  if (kind === "docx") {
    const cachedDocx = parseCache?.docx;
    if (cachedDocx?.v === PARSE_CACHE_VERSION && typeof cachedDocx.html === "string") {
      frDocUnsupported?.classList.add("hidden");
      renderPagedHtmlDocument(cachedDocx.html || "<p>（未解析到正文）</p>", {
        currentPage: 1,
        resetPage: true,
      });
      plainTextSnapshot = "";
      setStatus("已从本地缓存加载 Word 正文（无需重新解析）。");
      if (frCurrentFileName) frCurrentFileName.textContent = name;
      return;
    }
    if (!mammothLib || typeof mammothLib.convertToHtml !== "function") {
      if (frDocUnsupported) {
        frDocUnsupported.classList.remove("hidden");
        frDocUnsupported.textContent =
          "未加载 Word 解析库（mammoth）。请检查网络后刷新页面，或改用 PDF。";
      }
      setStatus("Word 解析库未就绪。", true);
      return;
    }
    try {
      const ab = await blob.arrayBuffer();
      const result = await mammothLib.convertToHtml({ arrayBuffer: ab });
      renderPagedHtmlDocument(result.value || "<p>（未解析到正文）</p>", {
        currentPage: 1,
        resetPage: true,
      });
      plainTextSnapshot = "";
      const messages = result.messages?.length ? `（解析提示 ${result.messages.length} 条）` : "";
      setStatus(`已解析 Word（.docx）${messages}`);
      void persistParseCacheForActiveRecord({
        docx: { v: PARSE_CACHE_VERSION, html: result.value || "" },
      });
    } catch (err) {
      if (frDocUnsupported) {
        frDocUnsupported.classList.remove("hidden");
        frDocUnsupported.textContent = `无法解析该 Word 文件：${err instanceof Error ? err.message : String(err)}`;
      }
      setStatus("Word 解析失败。", true);
    }
    if (frCurrentFileName) frCurrentFileName.textContent = name;
    return;
  }

  if (kind === "doc") {
    if (frDocUnsupported) {
      frDocUnsupported.classList.remove("hidden");
      frDocUnsupported.textContent =
        "旧版 Word（.doc）暂不支持在浏览器内直接解析正文。请将文件另存为 .docx 或导出为 PDF 后上传。";
    }
    setStatus("");
    if (frCurrentFileName) frCurrentFileName.textContent = name;
    return;
  }

  if (kind === "text") {
    const cachedText = parseCache?.text;
    if (cachedText?.v === PARSE_CACHE_VERSION && typeof cachedText.text === "string") {
      docxHtmlSnapshot = "";
      renderPagedTextDocument(cachedText.text, {
        currentPage: 1,
        resetPage: true,
      });
      setStatus("已从本地缓存加载文本（无需重新读取）。");
      if (frCurrentFileName) frCurrentFileName.textContent = name;
      return;
    }
    const text = await blob.text();
    docxHtmlSnapshot = "";
    renderPagedTextDocument(text, {
      currentPage: 1,
      resetPage: true,
    });
    setStatus("已加载纯文本。");
    void persistParseCacheForActiveRecord({ text: { v: PARSE_CACHE_VERSION, text } });
    if (frCurrentFileName) frCurrentFileName.textContent = name;
    return;
  }

  if (kind === "image") {
    imageObjectUrl = URL.createObjectURL(blob);
    if (frDocImage) {
      frDocImage.classList.remove("hidden");
      frDocImage.src = imageObjectUrl;
      frDocImage.id = "frDocMark";
    }
    setStatus("已加载图片。");
    if (frCurrentFileName) frCurrentFileName.textContent = name;
    return;
  }

  if (frDocUnsupported) {
    frDocUnsupported.classList.remove("hidden");
    frDocUnsupported.textContent = "暂不支持该文件类型。请上传 PDF、Word（.docx）、纯文本或图片。";
  }
  setStatus("不支持的文件类型。", true);
  if (frCurrentFileName) frCurrentFileName.textContent = name;
}

/**
 * @param {FrRecord} rec
 */
async function openRecord(rec) {
  if (!rec?.blob) return;
  activeRecordId = rec.id;
  await renderBlobToView(rec.blob, rec.name, rec.kind, rec.parseCache);
  void renderHistoryList(frHistorySearch?.value ?? "");
}

function formatDate(ts) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function iconLetterForKind(kind, name) {
  const n = String(name || "").toLowerCase();
  if (kind === "pdf" || n.endsWith(".pdf")) return "P";
  if (kind === "docx" || kind === "doc" || n.endsWith(".docx") || n.endsWith(".doc")) return "W";
  if (kind === "text" || n.endsWith(".txt")) return "T";
  if (kind === "image") return "I";
  return "F";
}

async function renderHistoryList(filter = "") {
  if (!frHistoryList) return;
  const q = String(filter).trim().toLowerCase();
  const rows = await loadRecords();
  frHistoryList.replaceChildren();

  for (const item of rows) {
    if (q && !String(item.name || "").toLowerCase().includes(q)) continue;
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `fr-history-item${item.id === activeRecordId ? " is-active" : ""}`;
    btn.dataset.id = item.id;
    const letter = iconLetterForKind(item.kind, item.name);
    btn.innerHTML = `
      <span class="fr-doc-icon" aria-hidden="true">${letter}</span>
      <span class="fr-history-item__text">
        <span class="fr-history-item__name"></span>
        <span class="fr-history-item__meta"></span>
      </span>
    `;
    btn.querySelector(".fr-history-item__name").textContent = item.name;
    btn.querySelector(".fr-history-item__meta").textContent = formatDate(item.createdAt);
    li.appendChild(btn);
    frHistoryList.appendChild(li);
  }
}

function scheduleHistoryRender(filter = "") {
  if (historySearchTimerId) {
    window.clearTimeout(historySearchTimerId);
  }
  historySearchTimerId = window.setTimeout(() => {
    void renderHistoryList(filter);
  }, 120);
}

async function ingestFile(file) {
  const kind = classifyFile(file);
  const id = newId();
  /** @type {FrRecord} */
  const rec = {
    id,
    name: file.name,
    mimeType: file.type || "application/octet-stream",
    kind,
    createdAt: Date.now(),
    blob: file
  };
  await saveRecord(rec);
  activeRecordId = id;
  if (fileReviewFileHint) {
    fileReviewFileHint.textContent = `已保存：${file.name}`;
  }
  await renderHistoryList(frHistorySearch?.value ?? "");
  await openRecord(rec);
}

async function refreshAfterInit() {
  const rows = await loadRecords(true);
  if (!rows.length) {
    activeRecordId = null;
    showDemoView();
    await renderHistoryList(frHistorySearch?.value ?? "");
    return;
  }
  await renderHistoryList(frHistorySearch?.value ?? "");
  const first = rows[0];
  if (first) await openRecord(first);
}

if (frHistoryList) {
  frHistoryList.addEventListener("click", (event) => {
    const btn = event.target instanceof Element ? event.target.closest("button[data-id]") : null;
    if (!btn) return;
    const recordId = String(btn.getAttribute("data-id") || "").trim();
    if (!recordId) return;
    void (async () => {
      const rec = await getRecord(recordId);
      if (rec) await openRecord(/** @type {FrRecord} */ (rec));
    })();
  });
}

if (frHistorySearch) {
  frHistorySearch.addEventListener("input", () => {
    scheduleHistoryRender(frHistorySearch.value);
  });
}

if (fileReviewInput && frUploadLabel) {
  fileReviewInput.addEventListener("change", async () => {
    const file = fileReviewInput.files?.[0];
    fileReviewInput.value = "";
    if (!file) return;
    frUploadLabel.setAttribute("aria-busy", "true");
    setStatus("正在读取文件…");
    try {
      await ingestFile(file);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus(`读取失败：${msg}`, true);
      if (fileReviewFileHint) fileReviewFileHint.textContent = "保存失败，请重试。";
    } finally {
      frUploadLabel.removeAttribute("aria-busy");
    }
  });
}

function setActiveTab(tabId) {
  document.querySelectorAll(".fr-tab").forEach((btn) => {
    const is = btn.dataset.tab === tabId;
    btn.classList.toggle("is-active", is);
    btn.setAttribute("aria-selected", is ? "true" : "false");
  });
  document.querySelectorAll(".fr-pane").forEach((pane) => {
    const is = pane.dataset.pane === tabId;
    pane.classList.toggle("is-visible", is);
  });
}

document.querySelectorAll(".fr-tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    const tabId = btn.dataset.tab;
    if (tabId) setActiveTab(tabId);
  });
});

function normalizeNbsp(s) {
  return String(s || "").replace(/\u00a0/g, " ");
}

/**
 * 与提交给模型的正文一致：用 textContent（与 Range 文本节点累计长度对齐），不用 innerText。
 */
function captureContractTextForReview() {
  if (hasPdfView()) {
    return normalizeNbsp(pdfViewerState?.reviewText || "").trim();
  }
  if (frDocHtml && !frDocHtml.classList.contains("hidden")) {
    return normalizeNbsp(frDocHtml.textContent || "").trim();
  }
  if (frDocPlain && !frDocPlain.classList.contains("hidden")) {
    return normalizeNbsp(frDocPlain.textContent || "").trim();
  }
  if (isFrPlaceholderEmptyView()) return "";
  const sheet = document.querySelector("#frDocEmpty .fr-sheet");
  if (frDocEmpty && !frDocEmpty.classList.contains("hidden") && sheet) {
    return normalizeNbsp(sheet.textContent || "").trim();
  }
  return "";
}

function rawLinearTextForHighlight() {
  if (hasPdfView()) {
    return normalizeNbsp(pdfViewerState?.reviewText || "");
  }
  if (frDocHtml && !frDocHtml.classList.contains("hidden")) {
    return normalizeNbsp(frDocHtml.textContent || "");
  }
  if (frDocPlain && !frDocPlain.classList.contains("hidden")) {
    return normalizeNbsp(frDocPlain.textContent || "");
  }
  if (isFrPlaceholderEmptyView()) return "";
  const sheet = document.querySelector("#frDocEmpty .fr-sheet");
  if (frDocEmpty && !frDocEmpty.classList.contains("hidden") && sheet) {
    return normalizeNbsp(sheet.textContent || "");
  }
  return "";
}

/** 将「trim 后字符串」中的下标映射回 raw（与 textContent 一致） */
function mapTrimmedIndicesToRaw(raw, startInTrimmed, endInTrimmed) {
  const lead = raw.length - raw.trimStart().length;
  return {
    start: lead + startInTrimmed,
    end: lead + endInTrimmed,
  };
}

/** @param {string} raw */
function computeSpecForRisk(raw, otext) {
  const sent = raw.trim();
  const specT = findMatchRange(sent, otext);
  if (!specT) return null;
  const spec = mapTrimmedIndicesToRaw(raw, specT.start, specT.end);
  if (spec.start < 0 || spec.end > raw.length || spec.end <= spec.start) return null;
  return spec;
}

/**
 * 与原文可定位的优先；指出文件/材料缺失的靠后。
 * @returns {number} 0 顶部 / 1 中部 / 2 底部
 */
function classifyRiskSortOrder(r) {
  const o = r.original_text ? String(r.original_text).trim() : "";
  if (o.length > 0) return 0;
  const blob = `${r.title || ""}\n${r.explanation || ""}\n${r.suggestion || ""}`;
  if (/(缺失|未提供|未上传|缺少|无附件|未见|未附)/.test(blob)) return 2;
  return 1;
}

/** @param {object[]} risks */
function sortRisksForDisplay(risks) {
  return [...risks].sort((a, b) => {
    const da = classifyRiskSortOrder(a);
    const db = classifyRiskSortOrder(b);
    if (da !== db) return da - db;
    return 0;
  });
}

/**
 * 审查完成后默认在正文栏标出所有可匹配的原文（多段 <mark>）。
 * @param {{ key: string, original_text?: string }[]} riskItems
 */
function applyAllRiskHighlights(riskItems) {
  if (hasPdfView()) {
    clearPdfHighlights();
    for (const item of riskItems) {
      const otext = item.original_text ? String(item.original_text) : "";
      if (!otext.trim()) continue;
      const match = findPdfMatch(otext);
      if (!match) continue;
      applyPdfHighlight(match, item.key);
    }
    return;
  }

  restoreCenterDocumentMarkup();
  const raw = rawLinearTextForHighlight();
  if (!raw) return;

  const specs = [];
  for (const item of riskItems) {
    const otext = item.original_text ? String(item.original_text) : "";
    if (!otext.trim()) continue;
    const spec = computeSpecForRisk(raw, otext);
    if (!spec) continue;
    specs.push({ start: spec.start, end: spec.end, key: item.key });
  }

  specs.sort((a, b) => a.start - b.start);
  const accepted = [];
  for (const s of specs) {
    if (accepted.some((a) => !(s.end <= a.start || s.start >= a.end))) continue;
    accepted.push(s);
  }

  if (frDocHtml && !frDocHtml.classList.contains("hidden") && docxHtmlSnapshot) {
    accepted.sort((a, b) => b.start - a.start);
    for (const s of accepted) {
      const r = setRangeForOffsets(frDocHtml, s.start, s.end);
      if (!r) continue;
      const mark = document.createElement("mark");
      mark.className = "fr-ai-highlight";
      mark.setAttribute("data-highlight-key", s.key);
      try {
        r.surroundContents(mark);
      } catch {
        const frag = r.extractContents();
        mark.appendChild(frag);
        r.insertNode(mark);
      }
    }
    return;
  }

  if (frDocPlain && !frDocPlain.classList.contains("hidden") && plainTextSnapshot !== "") {
    const rawP = normalizeNbsp(plainTextSnapshot);
    const specsP = [];
    for (const item of riskItems) {
      const otext = item.original_text ? String(item.original_text) : "";
      if (!otext.trim()) continue;
      const spec = computeSpecForRisk(rawP, otext);
      if (!spec) continue;
      specsP.push({ start: spec.start, end: spec.end, key: item.key });
    }
    specsP.sort((a, b) => a.start - b.start);
    const acceptedP = [];
    for (const s of specsP) {
      if (acceptedP.some((a) => !(s.end <= a.start || s.start >= a.end))) continue;
      acceptedP.push(s);
    }
    let pos = 0;
    const frag = document.createDocumentFragment();
    for (const s of acceptedP) {
      if (s.start < pos) continue;
      if (pos < s.start) frag.append(document.createTextNode(rawP.slice(pos, s.start)));
      const mark = document.createElement("mark");
      mark.className = "fr-ai-highlight";
      mark.setAttribute("data-highlight-key", s.key);
      mark.textContent = rawP.slice(s.start, s.end);
      frag.append(mark);
      pos = s.end;
    }
    if (pos < rawP.length) frag.append(document.createTextNode(rawP.slice(pos)));
    frDocPlain.textContent = "";
    frDocPlain.append(frag);
  }
}

function findMatchRange(full, needle) {
  if (!full || !needle) return null;
  const nt = needle.trim();
  if (!nt) return null;
  let i = full.indexOf(needle);
  if (i >= 0) return { start: i, end: i + needle.length };
  i = full.indexOf(nt);
  if (i >= 0) return { start: i, end: i + nt.length };
  const strip = (s) => s.replace(/\s+/g, "").replace(/\u00a0/g, "");
  const nf = strip(full);
  const nn = strip(needle);
  if (nn.length < 2) return null;
  const j = nf.indexOf(nn);
  if (j < 0) return null;
  let pos = 0;
  let start = -1;
  for (let k = 0; k < full.length; k++) {
    if (/\s/.test(full[k])) continue;
    if (pos === j) {
      start = k;
      break;
    }
    pos++;
  }
  if (start < 0) return null;
  let end = start;
  let got = 0;
  for (; end < full.length && got < nn.length; end++) {
    if (/\s/.test(full[end])) continue;
    got++;
  }
  return { start, end };
}

function setRangeForOffsets(el, start, end) {
  if (start < 0 || end < start) return null;
  const range = document.createRange();
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
  let charCount = 0;
  let started = false;
  let node = walker.nextNode();
  while (node) {
    const len = node.textContent.length;
    if (len === 0) {
      node = walker.nextNode();
      continue;
    }
    const nextCharCount = charCount + len;
    if (!started && nextCharCount > start) {
      range.setStart(node, Math.max(0, Math.min(len, start - charCount)));
      started = true;
    }
    if (started && nextCharCount >= end) {
      range.setEnd(node, Math.max(0, Math.min(len, end - charCount)));
      return range;
    }
    charCount = nextCharCount;
    node = walker.nextNode();
  }
  return null;
}

function restoreCenterDocumentMarkup() {
  clearDynamicLocateIds();
  if (hasPdfView()) {
    clearPdfHighlights();
  }
  if (frDocHtml && docxHtmlSnapshot) {
    frDocHtml.innerHTML = docxHtmlSnapshot;
  }
  if (frDocPlain && plainTextSnapshot !== "") {
    frDocPlain.textContent = plainTextSnapshot;
    frDocPlain.removeAttribute("id");
  }
}

/**
 * 按模型返回的原文在 middle 栏包裹 <mark>（单段，会还原正文）；PDF / 图片 / .doc 不支持。
 * @param {string} originalText
 * @param {string} [highlightKey] 若提供则写入 data-highlight-key，便于随后滚动定位
 */
function highlightOriginalInView(originalText, highlightKey) {
  if (hasPdfView()) {
    restoreCenterDocumentMarkup();
    const match = findPdfMatch(originalText);
    if (!match) return false;
    return applyPdfHighlight(match, highlightKey || `pdf_manual_${Date.now()}`);
  }

  restoreCenterDocumentMarkup();
  const raw = rawLinearTextForHighlight();
  const sent = raw.trim();
  const specT = findMatchRange(sent, originalText);
  if (!specT) return false;
  const spec = mapTrimmedIndicesToRaw(raw, specT.start, specT.end);
  if (spec.start < 0 || spec.end > raw.length || spec.end <= spec.start) return false;

  const setMarkAttrs = (mark) => {
    mark.className = "fr-ai-highlight fr-doc-mark-target";
    if (highlightKey) mark.setAttribute("data-highlight-key", highlightKey);
    else mark.id = "frDocMark";
  };

  if (frDocHtml && !frDocHtml.classList.contains("hidden") && docxHtmlSnapshot) {
    const r = setRangeForOffsets(frDocHtml, spec.start, spec.end);
    if (!r) return false;
    const mark = document.createElement("mark");
    setMarkAttrs(mark);
    try {
      r.surroundContents(mark);
    } catch {
      const frag = r.extractContents();
      mark.appendChild(frag);
      r.insertNode(mark);
    }
    return true;
  }

  if (frDocPlain && !frDocPlain.classList.contains("hidden")) {
    const snap = plainTextSnapshot;
    const rawP = normalizeNbsp(snap);
    const sentP = rawP.trim();
    const s2t = findMatchRange(sentP, originalText);
    if (!s2t) return false;
    const s2 = mapTrimmedIndicesToRaw(rawP, s2t.start, s2t.end);
    const before = rawP.slice(0, s2.start);
    const mid = rawP.slice(s2.start, s2.end);
    const after = rawP.slice(s2.end);
    frDocPlain.textContent = "";
    frDocPlain.append(document.createTextNode(before));
    const mark = document.createElement("mark");
    setMarkAttrs(mark);
    mark.textContent = mid;
    frDocPlain.append(mark);
    frDocPlain.append(document.createTextNode(after));
    return true;
  }

  return false;
}

/** @param {string} key */
function flashLocateMarkByKey(key) {
  if (hasPdfView() && frDocFrame) {
    const esc = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(key) : key.replace(/"/g, '\\"');
    const nodes = Array.from(
      frDocFrame.querySelectorAll(`[data-highlight-key="${esc}"]`)
    );
    if (!nodes.length || !frDocScroll) return false;
    const target = nodes[0].closest(".fr-pdf-page") || nodes[0];
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    nodes.forEach((node) => {
      node.classList.remove("fr-locate-flash");
      void node.offsetWidth;
      node.classList.add("fr-locate-flash");
      node.addEventListener("animationend", () => node.classList.remove("fr-locate-flash"), {
        once: true,
      });
    });
    return true;
  }

  const esc = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(key) : key.replace(/"/g, '\\"');
  const sel = `mark.fr-ai-highlight[data-highlight-key="${esc}"]`;
  const el =
    (frDocHtml && !frDocHtml.classList.contains("hidden") && frDocHtml.querySelector(sel)) ||
    (frDocPlain && !frDocPlain.classList.contains("hidden") && frDocPlain.querySelector(sel)) ||
    null;
  if (!el || !frDocScroll) return false;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.remove("fr-locate-flash");
  void el.offsetWidth;
  el.classList.add("fr-locate-flash");
  el.addEventListener("animationend", () => el.classList.remove("fr-locate-flash"), { once: true });
  return true;
}

function escapeHtmlFr(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderAiResults(data) {
  if (!frRiskListRoot || !frAiMeta) return;
  riskHighlightByKey.clear();
  riskHighlightKeySeq = 0;

  const complete = Boolean(data.complete);
  const rounds = data.rounds ?? 0;
  const nCov = (data.coverage || []).length;
  const nId = data.checklist_id_count ?? nCov;
  const miss = (data.missing_ids || []).length;

  const pv = data.perspective;
  const docType = data.document_type || getDocumentType();
  const pvLabel =
    docType === "civil_complaint"
      ? pv === "employer"
        ? "被告"
        : pv === "third_party"
          ? "第三方（中立）"
          : "原告"
      : pv === "employer"
        ? "雇佣者"
        : pv === "third_party"
          ? "第三方（中立）"
          : "劳动者";
  const pvPrefix = pv ? `审查视角：${pvLabel}。` : "";

  frAiMeta.classList.toggle("fr-ai-meta--warn", !complete);
  if (complete) {
    frAiMeta.textContent = `${pvPrefix}清单 coverage 已齐全：${nCov} / ${nId} 项；共 ${rounds} 轮模型调用。`;
  } else {
    frAiMeta.textContent = `${pvPrefix}未完全覆盖：尚有 ${miss} 个 checklist_id 缺失（已达追问上限或解析失败）。当前 ${nCov} / ${nId} 项；${rounds} 轮。`;
  }

  const risks = data.risks || [];
  if (!risks.length) {
    frRiskListRoot.innerHTML =
      '<p class="fr-pane-placeholder"> risks 为空（可能均为 pass）。仍请结合 coverage 与文书正文核对。</p>';
    return;
  }

  const sorted = sortRisksForDisplay(risks);
  const parts = [];
  const highlightItems = [];

  for (const r of sorted) {
    const key = `rk_${riskHighlightKeySeq++}`;
    const otext = r.original_text ? String(r.original_text) : "";
    if (otext.trim()) riskHighlightByKey.set(key, otext);

    const title = escapeHtmlFr(r.title || "");
    const expl = escapeHtmlFr(r.explanation || "");
    const sug = escapeHtmlFr(r.suggestion || "");
    const canLocate = Boolean(otext.trim());
    const cardCls = `fr-risk-card${canLocate ? " fr-risk-card--locatable" : ""}`;

    parts.push(`<article class="${cardCls}" data-highlight-key="${key}"${canLocate ? ' role="button" tabindex="0"' : ""}>
  <h3 class="fr-risk-card__title">${title}</h3>
  <p class="fr-risk-line">说明：${expl}</p>
  <p class="fr-risk-line fr-risk-line--suggest">建议：${sug}</p>
</article>`);

    highlightItems.push({ key, original_text: otext });
  }
  frRiskListRoot.innerHTML = parts.join("");
  applyAllRiskHighlights(highlightItems);
}

function resetSummaryPane() {
  if (frSummaryMeta) frSummaryMeta.textContent = "";
  if (frSummaryRoot) {
    const hint =
      getDocumentType() === "civil_complaint"
        ? "完成「开始审查」后，将自动生成民事起诉状要点摘要。"
        : "完成「开始审查」后，将自动生成劳动合同要点摘要。";
    frSummaryRoot.innerHTML = `<p class="fr-pane-placeholder">${hint}</p>`;
  }
}

/**
 * @param {{ overview?: string, perspective?: string, sections?: { title?: string, content?: string }[] }} sum
 */
function renderContractSummaryHtml(sum) {
  if (!frSummaryRoot) return;
  if (frSummaryMeta && sum?.perspective) {
    const dt = getDocumentType();
    const sl =
      dt === "civil_complaint"
        ? sum.perspective === "employer"
          ? "被告"
          : sum.perspective === "third_party"
            ? "第三方（中立）"
            : "原告"
        : sum.perspective === "employer"
          ? "雇佣者"
          : sum.perspective === "third_party"
            ? "第三方（中立）"
            : "劳动者";
    frSummaryMeta.textContent = `摘要视角：${sl}`;
  }
  const overviewTrim = String(sum?.overview || "").trim();
  const overview = overviewTrim
    ? escapeHtmlFr(overviewTrim).replace(/\n/g, "<br>")
    : "";
  const sections = Array.isArray(sum?.sections) ? sum.sections : [];
  const parts = [];
  if (overview) {
    parts.push(
      `<section class="fr-summary-block fr-summary-block--overview" aria-labelledby="fr-sum-overview"><h3 id="fr-sum-overview" class="fr-summary-h3">总览</h3><p class="fr-summary-text">${overview}</p></section>`
    );
  }
  for (const s of sections) {
    const t = escapeHtmlFr(s?.title || "");
    const c = escapeHtmlFr(s?.content || "").replace(/\n/g, "<br>");
    parts.push(
      `<section class="fr-summary-block"><h3 class="fr-summary-h3">${t}</h3><p class="fr-summary-text">${c}</p></section>`
    );
  }
  if (!parts.length) {
    frSummaryRoot.innerHTML =
      '<p class="fr-pane-placeholder">模型未返回摘要内容，请重新审查后再试。</p>';
    return;
  }
  frSummaryRoot.innerHTML = parts.join("");
}

async function generateContractSummaryAfterReview(text, stance, documentType) {
  if (!frSummaryRoot) return;
  if (frSummaryMeta) frSummaryMeta.textContent = "";
  const dt = documentType || getDocumentType();
  frSummaryRoot.innerHTML =
    dt === "civil_complaint"
      ? '<p class="fr-summary-loading">正在生成诉状摘要…</p>'
      : '<p class="fr-summary-loading">正在生成合同摘要…</p>';
  try {
    const sum = await runContractSummary({ contract_text: text, stance, document_type: dt });
    renderContractSummaryHtml(sum);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    frSummaryRoot.innerHTML = `<p class="fr-summary-error">摘要生成失败：${escapeHtmlFr(msg)}</p>`;
  }
}

async function runContractReviewFlow() {
  if (!frRerunBtn) return;
  const text = captureContractTextForReview();
  if (text.length < 12) {
    setStatus(
      "当前无法提取足够正文。请等待 PDF 解析或 OCR 完成，或上传 .docx / .txt。",
      true
    );
    return;
  }

  const stanceEl = document.getElementById("frReviewStance");
  const stance = stanceEl?.value || "劳动者（乙方）";
  const documentType = getDocumentType();

  isReviewing = true;
  updateReviewActionButtons();
  setStatus("正在调用文书审查接口（全量清单 + 多轮补全），可能需要数分钟…");
  if (frAiMeta) {
    frAiMeta.textContent = "正在审查，请稍候（多轮模型调用，可能需要数分钟）…";
    frAiMeta.classList.remove("fr-ai-meta--warn");
  }
  if (frRiskListRoot) frRiskListRoot.innerHTML = "";
  resetSummaryPane();

  try {
    const data = await runContractReview({
      contract_text: text,
      stance,
      document_type: documentType,
    });
    renderAiResults(data);
    hasCompletedReviewOnce = true;
    setActiveTab("ai");
    setStatus(data.complete ? "审查完成，清单已全覆盖。" : "审查结束：存在未覆盖项，请查看右侧说明。");
    void generateContractSummaryAfterReview(text, stance, documentType);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    setStatus(`审查失败：${msg}`, true);
  } finally {
    isReviewing = false;
    updateReviewActionButtons();
  }
}

if (frRiskListRoot) {
  function locateFromRiskCard(card) {
    const key = card.getAttribute("data-highlight-key");
    const otext = key ? riskHighlightByKey.get(key) : "";
    if (!otext || !String(otext).trim()) {
      setStatus("该条未提供可匹配的原文片段。", true);
      return;
    }
    if (flashLocateMarkByKey(key)) return;
    const ok = highlightOriginalInView(otext, key);
    if (!ok) {
      setStatus("未在中间栏找到与模型一致的原文（标点、空格或换行可能不同）。", true);
      return;
    }
    flashLocateMarkByKey(key);
  }

  frRiskListRoot.addEventListener("click", (ev) => {
    const card = ev.target.closest(".fr-risk-card");
    if (!card || !frRiskListRoot.contains(card)) return;
    locateFromRiskCard(card);
  });

  frRiskListRoot.addEventListener("keydown", (ev) => {
    if (ev.key !== "Enter" && ev.key !== " ") return;
    const card = ev.target.closest(".fr-risk-card");
    if (!card || !frRiskListRoot.contains(card)) return;
    if (!card.classList.contains("fr-risk-card--locatable")) return;
    ev.preventDefault();
    locateFromRiskCard(card);
  });
}

if (frRerunBtn) {
  frRerunBtn.addEventListener("click", () => {
    void runContractReviewFlow();
  });
}

if (frDownloadBtn) {
  frDownloadBtn.addEventListener("click", () => {
    if (frDownloadBtn.disabled) return;
    window.print();
  });
}

updateReviewActionButtons();

if (frContractTypeEl) {
  frContractTypeEl.addEventListener("change", () => {
    syncFrStanceOptions();
    resetSummaryPane();
  });
}
syncFrStanceOptions();

void refreshAfterInit().catch(() => {
  showDemoView();
});
