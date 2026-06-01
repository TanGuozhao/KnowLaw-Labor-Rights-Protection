import {
  addCaseEvidence,
  downloadCaseEvidenceCsv,
  downloadCaseEvidenceZip,
  fetchEvidenceFileBlob,
  fetchEvidenceRevisionFileBlob,
  listCaseEvidence,
  listCaseEvidenceRevisions,
  updateCaseEvidence,
  uploadEvidenceAnalyze,
  uploadEvidenceFile,
  uploadEvidenceOcr,
} from "../api.js";
import { AREAS } from "../china-areas.js";
import {
  buildRelatedDateFromSelect,
  elements,
  escapeHtml,
  getSelectedCaseId,
  parseDateParts,
  syncAddEvidenceButton,
} from "./shared.js";

const {
  addEvidenceCity,
  addEvidenceDescription,
  addEvidenceDetailAddress,
  addEvidenceDialog,
  addEvidenceDialogCancel,
  addEvidenceDialogError,
  addEvidenceDialogSubmit,
  addEvidenceDialogTitle,
  addEvidenceDay,
  addEvidenceDistrict,
  addEvidenceFileInput,
  addEvidenceForm,
  addEvidenceMonth,
  addEvidenceName,
  addEvidenceNote,
  addEvidenceOpenBtn,
  addEvidencePickFileBtn,
  addEvidenceProvince,
  addEvidenceSource,
  addEvidenceType,
  addEvidenceUploadFileName,
  addEvidenceUploadStatus,
  addEvidenceYear,
  caseSelect,
  evidenceCompletenessFill,
  evidenceCompletenessHint,
  evidenceCompletenessScore,
  evidenceCompletenessTrack,
  evidenceFileInput,
  evidenceFileName,
  evidenceListEl,
  evidenceNoCaseHint,
  evidenceOcrBtn,
  evidenceOcrStatus,
  evidenceOcrText,
  evidencePersistCheck,
  evidenceRevisionsCloseBtn,
  evidenceRevisionsDialog,
  evidenceRevisionsList,
  evidenceRevisionsSubtitle,
  evidenceViewerCloseBtn,
  evidenceViewerDialog,
  evidenceViewerDownloadBtn,
  evidenceViewerFallback,
  evidenceViewerFrame,
  evidenceViewerHint,
  evidenceViewerImage,
  evidenceViewerOpenNewBtn,
  evidenceViewerTitle,
  exportEvidenceCsvBtn,
  exportEvidenceZipBtn,
} = elements;

let evidenceCardUploadTargetId = "";
let evidenceViewerObjectUrl = "";
let evidenceViewerFileName = "\u8bc1\u636e\u9644\u4ef6";
let evidenceCache = [];
let evidenceSummaryRequestSeq = 0;
let editEvidenceId = "";
let evidenceRevisionsTargetId = "";
/** @type {File | null} */
let evidenceSelectedFile = null;

export function syncEvidenceUploadButton() {
  if (evidenceOcrBtn) {
    evidenceOcrBtn.disabled = !evidenceSelectedFile;
  }
}

export function updateEvidenceNoCaseHint() {
  if (!evidenceNoCaseHint) return;
  const hasCase = Boolean(caseSelect?.value);
  const persist = Boolean(evidencePersistCheck?.checked);
  if (hasCase) {
    evidenceNoCaseHint.classList.add("hidden");
    evidenceNoCaseHint.textContent = "";
    return;
  }
  evidenceNoCaseHint.classList.remove("hidden");
  evidenceNoCaseHint.textContent = persist
    ? "\u5f53\u524d\u672a\u5173\u8054\u6848\u4ef6\uff1a\u8bf7\u5207\u6362\u5230\u300c\u6848\u4ef6\u300d\uff0c\u70b9\u51fb\u300c\u65b0\u5efa\u6848\u4ef6\u300d\u521b\u5efa\u5e76\u9009\u4e2d\u6848\u4ef6\u540e\u518d\u4e0a\u4f20\uff1b\u82e5\u4ec5\u9700 OCR\uff0c\u53ef\u53d6\u6d88\u52fe\u9009\u300c\u4fdd\u5b58\u5230\u672c\u6848\u8bc1\u636e\u5e93\u300d\u3002"
    : "\u5f53\u524d\u672a\u5173\u8054\u6848\u4ef6\uff1a\u4e0a\u4f20\u540e\u5c06\u4ec5\u8bc6\u522b\u6587\u5b57\u3002\u5165\u5e93\u8bf7\u5148\u5728\u300c\u6848\u4ef6\u300d\u4e2d\u300c\u65b0\u5efa\u6848\u4ef6\u300d\u5e76\u9009\u4e2d\uff0c\u518d\u52fe\u9009\u4fdd\u5b58\u3002";
}


function renderCompleteness(comp) {
  if (!comp) return;
  const score = typeof comp.score === "number" ? comp.score : 0;
  if (evidenceCompletenessScore) {
    evidenceCompletenessScore.textContent = `${score}%`;
  }
  if (evidenceCompletenessFill) {
    evidenceCompletenessFill.style.width = `${score}%`;
  }
  if (evidenceCompletenessTrack) {
    evidenceCompletenessTrack.setAttribute("aria-valuenow", String(score));
  }
  if (evidenceCompletenessHint) {
    const missing = Array.isArray(comp.missing) ? comp.missing : [];
    if (missing.length) {
      evidenceCompletenessHint.textContent = `建议补强：${missing.join("；")}。`;
    } else {
      evidenceCompletenessHint.textContent = "主要材料维度已部分覆盖，可作个案复查。";
    }
  }
}

function renderEvidenceList(items) {
  if (!evidenceListEl) return;
  const list = Array.isArray(items) ? items : [];
  if (!list.length) {
    evidenceListEl.innerHTML = `<div class="my-cases-evidence-empty">尚未保存任何证据，上传图片并勾选「保存到本案证据库」即可归档。</div>`;
    return;
  }
  evidenceListEl.innerHTML = list
    .map((it) => {
      const name = escapeHtml(it.name || "");
      const typ = escapeHtml(it.evidence_type || "");
      const date = escapeHtml(it.submission_date || "");
      const evidenceId = escapeHtml(it.evidence_id || "");
      const hasFile = Boolean(String(it.file_path || "").trim());
      const revCount = Number(it.revision_count || 0);
      const revBadge =
        revCount > 0
          ? `<span class="my-cases-evidence-rev-badge" title="历史记录 ${revCount} 条">${revCount} 历史</span>`
          : "";
      const baseText = String(it.ocr_text || it.description || "");
      const preview = escapeHtml(baseText.slice(0, 120));
      return `<div class="my-cases-evidence-card">
        <div class="my-cases-evidence-card-head">
          <div class="my-cases-evidence-card-titleline"><strong>${name}</strong>${revBadge}</div>
          <span class="my-cases-evidence-type">${typ}</span>
        </div>
        <div class="my-cases-evidence-card-meta">${date}</div>
        <div class="my-cases-evidence-snippet">${preview}${baseText.length > 120 ? "…" : ""}</div>
        <div class="my-cases-evidence-actions">
          <button type="button" class="liquid-glass my-cases-evidence-action-btn" data-action="edit" data-evidence-id="${evidenceId}">编辑</button>
          <button type="button" class="liquid-glass my-cases-evidence-action-btn" data-action="upload" data-evidence-id="${evidenceId}">上传</button>
          <button type="button" class="liquid-glass my-cases-evidence-action-btn" data-action="revisions" data-evidence-id="${evidenceId}" data-evidence-name="${name}">版本</button>
          <button type="button" class="liquid-glass my-cases-evidence-action-btn" data-action="view" data-evidence-id="${evidenceId}" data-evidence-name="${name}" ${hasFile ? "" : "disabled"}>查看</button>
        </div>
      </div>`;
    })
    .join("");
}

export async function loadEvidenceSummary() {
  const requestSeq = ++evidenceSummaryRequestSeq;
  const cid = getSelectedCaseId();
  if (!cid) {
    evidenceCache = [];
    renderEvidenceList([]);
    renderCompleteness({ score: 0, missing: [] });
    return;
  }

  if (evidenceListEl) {
    evidenceListEl.innerHTML = '<div class="my-cases-evidence-empty">正在加载证据列表…</div>';
  }

  try {
    const data = await listCaseEvidence(cid);
    if (requestSeq !== evidenceSummaryRequestSeq || cid !== getSelectedCaseId()) {
      return;
    }
    evidenceCache = Array.isArray(data?.evidence) ? data.evidence : [];
    renderEvidenceList(evidenceCache);
    renderCompleteness(data.completeness);
  } catch (error) {
    if (requestSeq !== evidenceSummaryRequestSeq || cid !== getSelectedCaseId()) {
      return;
    }
    evidenceCache = [];
    renderEvidenceList([]);
    renderCompleteness({ score: 0, missing: [] });
    setEvidenceStatus(error?.message || "加载证据失败", true);
  }
}


function setEvidenceStatus(text, isError = false) {
  if (!evidenceOcrStatus) return;
  evidenceOcrStatus.textContent = text || "";
  evidenceOcrStatus.classList.toggle("my-cases-ocr-status--error", isError);
}


const EVIDENCE_TYPE_OPTIONS = [
  // （1）主体资格证据
  "申请人身份证复印件",
  "公司工商注册信息",
  "组织机构代码证",

  // （2）劳动关系存续与履行证据
  "劳动合同",
  "录用通知书",
  "入职登记表",
  "社保证明",
  "工资流水",
  "个人所得税缴纳记录",
  "考勤打卡记录",
  "员工身份文件",

  // （3）争议事实与主张依据证据
  "聊天记录",
  "录音录像",
  "照片",
  "电子记录",
  "解除劳动合同通知书",
  "限期补发克扣（拖欠）工资通知书",

  // （4）工伤专项证据
  "工伤认定决定书",
  "劳动能力鉴定结论通知书",
  "医疗证明",

  "其他证据图片",
];

function fillEvidenceTypeSelect() {
  if (!addEvidenceType) return;
  addEvidenceType.innerHTML = "";
  EVIDENCE_TYPE_OPTIONS.forEach((t) => {
    const opt = document.createElement("option");
    opt.value = t;
    opt.textContent = t;
    addEvidenceType.appendChild(opt);
  });
  addEvidenceType.value = "其他证据图片";
}

function fillDateSelects() {
  if (!addEvidenceYear || !addEvidenceMonth || !addEvidenceDay) return;
  const nowYear = new Date().getFullYear();
  addEvidenceYear.innerHTML = '<option value="">年</option>';
  for (let y = nowYear + 2; y >= 1990; y -= 1) {
    const opt = document.createElement("option");
    opt.value = String(y);
    opt.textContent = `${y}年`;
    addEvidenceYear.appendChild(opt);
  }

  addEvidenceMonth.innerHTML = '<option value="">月</option>';
  for (let m = 1; m <= 12; m += 1) {
    const mm = String(m).padStart(2, "0");
    const opt = document.createElement("option");
    opt.value = mm;
    opt.textContent = `${m}月`;
    addEvidenceMonth.appendChild(opt);
  }

  addEvidenceDay.innerHTML = '<option value="">日</option>';
  for (let d = 1; d <= 31; d += 1) {
    const dd = String(d).padStart(2, "0");
    const opt = document.createElement("option");
    opt.value = dd;
    opt.textContent = `${d}日`;
    addEvidenceDay.appendChild(opt);
  }
}

function buildLocationFromSelect() {
  const p = String(addEvidenceProvince?.value || "").trim();
  const c = String(addEvidenceCity?.value || "").trim();
  const d = String(addEvidenceDistrict?.value || "").trim();
  const detail = String(addEvidenceDetailAddress?.value || "").trim();
  const parts = [p, c, d].filter(Boolean);
  // 直辖市在数据中可能“省/市同名”，避免出现“北京市北京市东城区”。
  if (parts.length >= 2 && parts[0] === parts[1]) {
    parts.splice(1, 1);
  }
  const base = parts.join("");
  if (!base && !detail) return "";
  if (!base) return detail;
  if (!detail) return base;
  return `${base} - ${detail}`;
}

function parseLocationToSelection(rawLocation) {
  const raw = String(rawLocation || "").trim();
  if (!raw) {
    return { province: "", city: "", district: "", detail: "" };
  }

  const splitMarker = raw.includes(" - ") ? " - " : raw.includes("-") ? "-" : "";
  const locationPart = splitMarker ? raw.split(splitMarker)[0].trim() : raw;
  const detailPart = splitMarker
    ? raw.slice(raw.indexOf(splitMarker) + splitMarker.length).trim()
    : "";

  // Try best-effort hierarchical matching from AREAS map.
  for (const province of Object.keys(AREAS)) {
    if (!locationPart.includes(province)) continue;
    const citiesMap = AREAS[province] || {};
    for (const city of Object.keys(citiesMap)) {
      if (!locationPart.includes(city)) continue;
      const districts = Array.isArray(citiesMap[city]) ? citiesMap[city] : [];
      for (const district of districts) {
        if (locationPart.includes(district)) {
          return { province, city, district, detail: detailPart };
        }
      }
      return { province, city, district: "", detail: detailPart };
    }
    return { province, city: "", district: "", detail: detailPart };
  }

  // Not recognized as province/city/district; keep as detail address only.
  return { province: "", city: "", district: "", detail: raw };
}

function setDialogLocationEnabledState() {
  const p = String(addEvidenceProvince?.value || "").trim();
  if (addEvidenceCity) addEvidenceCity.disabled = !p;
  if (addEvidenceDistrict) addEvidenceDistrict.disabled = !p || !String(addEvidenceCity?.value || "").trim();
}

function fillProvinceSelect() {
  if (!addEvidenceProvince) return;
  addEvidenceProvince.innerHTML = "";
  const opt0 = document.createElement("option");
  opt0.value = "";
  opt0.textContent = "请选择省";
  addEvidenceProvince.appendChild(opt0);

  Object.keys(AREAS).forEach((prov) => {
    const opt = document.createElement("option");
    opt.value = prov;
    opt.textContent = prov;
    addEvidenceProvince.appendChild(opt);
  });
}

function fillCitySelect(province) {
  if (!addEvidenceCity) return;
  addEvidenceCity.innerHTML = "";
  const opt0 = document.createElement("option");
  opt0.value = "";
  opt0.textContent = "请选择市";
  addEvidenceCity.appendChild(opt0);

  const cities = (AREAS[province] && typeof AREAS[province] === "object" ? Object.keys(AREAS[province]) : []) || [];
  cities.forEach((city) => {
    const opt = document.createElement("option");
    opt.value = city;
    opt.textContent = city;
    addEvidenceCity.appendChild(opt);
  });
}

function fillDistrictSelect(province, city) {
  if (!addEvidenceDistrict) return;
  addEvidenceDistrict.innerHTML = "";
  const opt0 = document.createElement("option");
  opt0.value = "";
  opt0.textContent = "请选择区";
  addEvidenceDistrict.appendChild(opt0);

  const districts =
    (AREAS[province] &&
      AREAS[province][city] &&
      Array.isArray(AREAS[province][city]) &&
      AREAS[province][city]) ||
    [];

  districts.forEach((district) => {
    const opt = document.createElement("option");
    opt.value = district;
    opt.textContent = district;
    addEvidenceDistrict.appendChild(opt);
  });
}

function initLocationSelect() {
  if (!addEvidenceProvince || !addEvidenceCity || !addEvidenceDistrict) return;
  fillProvinceSelect();
  setDialogLocationEnabledState();

  addEvidenceProvince.addEventListener("change", () => {
    const prov = String(addEvidenceProvince.value || "").trim();
    if (!prov) {
      if (addEvidenceCity) addEvidenceCity.value = "";
      if (addEvidenceDistrict) addEvidenceDistrict.value = "";
      setDialogLocationEnabledState();
      return;
    }
    fillCitySelect(prov);
    addEvidenceCity.value = "";
    if (addEvidenceDistrict) addEvidenceDistrict.value = "";
    setDialogLocationEnabledState();
  });

  addEvidenceCity.addEventListener("change", () => {
    const prov = String(addEvidenceProvince.value || "").trim();
    const city = String(addEvidenceCity.value || "").trim();
    if (!prov || !city) {
      if (addEvidenceDistrict) addEvidenceDistrict.value = "";
      setDialogLocationEnabledState();
      return;
    }
    fillDistrictSelect(prov, city);
    addEvidenceDistrict.value = "";
    setDialogLocationEnabledState();
  });
}

function setAddEvidenceDialogError(msg) {
  if (!addEvidenceDialogError) return;
  if (!msg) {
    addEvidenceDialogError.textContent = "";
    addEvidenceDialogError.classList.add("hidden");
    return;
  }
  addEvidenceDialogError.textContent = msg;
  addEvidenceDialogError.classList.remove("hidden");
}

function resetAddEvidenceFormForNew() {
  editEvidenceId = "";
  if (addEvidenceDialogTitle) addEvidenceDialogTitle.textContent = "添加证据";
  if (addEvidenceDialogSubmit) addEvidenceDialogSubmit.textContent = "确认添加";
  if (addEvidenceName) addEvidenceName.value = "";
  if (addEvidenceDescription) addEvidenceDescription.value = "";
  if (addEvidenceSource) addEvidenceSource.value = "";
  if (addEvidenceProvince) addEvidenceProvince.value = "";
  if (addEvidenceCity) addEvidenceCity.value = "";
  if (addEvidenceDistrict) addEvidenceDistrict.value = "";
  if (addEvidenceDetailAddress) addEvidenceDetailAddress.value = "";
  setDialogLocationEnabledState();
  if (addEvidenceYear) addEvidenceYear.value = "";
  if (addEvidenceMonth) addEvidenceMonth.value = "";
  if (addEvidenceDay) addEvidenceDay.value = "";
  if (addEvidenceNote) addEvidenceNote.value = "";
  if (addEvidenceType) addEvidenceType.value = "其他证据图片";
  if (addEvidenceFileInput) addEvidenceFileInput.value = "";
  if (addEvidenceUploadFileName) addEvidenceUploadFileName.textContent = "未选择文件";
  if (addEvidenceUploadStatus) {
    addEvidenceUploadStatus.textContent = "";
    addEvidenceUploadStatus.classList.remove("my-cases-evidence-upload-status--error");
  }
}

/**
 * @param {Record<string, unknown>} data
 */
function applyEvidenceAnalysisToForm(data) {
  if (addEvidenceName) addEvidenceName.value = String(data.name || "").trim();
  if (addEvidenceType) {
    const t = String(data.evidence_type || "其他证据图片").trim();
    const opts = Array.from(addEvidenceType.options || []).map((o) => o.value);
    addEvidenceType.value = opts.includes(t) ? t : "其他证据图片";
  }
  if (addEvidenceDescription) addEvidenceDescription.value = String(data.description || "").trim();
  if (addEvidenceSource) addEvidenceSource.value = String(data.source || "").trim();
  if (addEvidenceNote) addEvidenceNote.value = String(data.note || "").trim();
  const parts = parseDateParts(data.related_time);
  if (addEvidenceYear) addEvidenceYear.value = parts.year;
  if (addEvidenceMonth) addEvidenceMonth.value = parts.month;
  if (addEvidenceDay) addEvidenceDay.value = parts.day;
}

function setAddEvidenceUploadStatus(msg, isError = false) {
  if (!addEvidenceUploadStatus) return;
  addEvidenceUploadStatus.textContent = msg || "";
  addEvidenceUploadStatus.classList.toggle("my-cases-evidence-upload-status--error", isError);
}

function openAddEvidenceDialog() {
  if (!addEvidenceDialog) return;
  resetAddEvidenceFormForNew();
  setAddEvidenceDialogError("");
  setDialogLocationEnabledState();
  addEvidenceDialog.showModal();
  window.setTimeout(() => addEvidenceName?.focus(), 0);
}

function closeAddEvidenceDialog() {
  addEvidenceDialog?.close();
  setAddEvidenceDialogError("");
}

const evidenceCardUploadInput = document.createElement("input");
evidenceCardUploadInput.type = "file";
evidenceCardUploadInput.accept =
  "image/jpeg,image/png,image/webp,image/gif,image/bmp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain,.jpg,.jpeg,.png,.webp,.gif,.bmp,.pdf,.doc,.docx,.xls,.xlsx,.txt";
evidenceCardUploadInput.hidden = true;

async function openEvidenceFileById(evidenceId) {
  const { blob, contentType } = await fetchEvidenceFileBlob(evidenceId);
  if (evidenceViewerObjectUrl) {
    URL.revokeObjectURL(evidenceViewerObjectUrl);
  }
  evidenceViewerObjectUrl = URL.createObjectURL(blob);

  const isImage = contentType.startsWith("image/");
  const canInline = isImage || contentType.includes("pdf") || contentType.startsWith("text/");

  if (evidenceViewerImage) {
    evidenceViewerImage.classList.toggle("hidden", !isImage);
    evidenceViewerImage.src = isImage ? evidenceViewerObjectUrl : "";
  }
  if (evidenceViewerFrame) {
    const frameVisible = canInline && !isImage;
    evidenceViewerFrame.classList.toggle("hidden", !frameVisible);
    evidenceViewerFrame.src = frameVisible ? evidenceViewerObjectUrl : "about:blank";
  }
  if (evidenceViewerFallback) {
    evidenceViewerFallback.classList.toggle("hidden", canInline);
  }
  if (evidenceViewerHint) {
    evidenceViewerHint.textContent = canInline
      ? "已在面板内加载，可直接滚动阅读。"
      : "该格式暂不支持内嵌预览，可点击“新窗口打开”或“下载”查看。";
  }
  evidenceViewerDialog?.showModal();
}

function _extensionForMime(contentType) {
  const ct = (contentType || "").toLowerCase();
  if (ct.includes("pdf")) return ".pdf";
  if (ct.includes("png")) return ".png";
  if (ct.includes("jpeg") || ct.includes("jpg")) return ".jpg";
  if (ct.includes("webp")) return ".webp";
  if (ct.includes("gif")) return ".gif";
  if (ct.includes("spreadsheetml")) return ".xlsx";
  if (ct.includes("wordprocessingml")) return ".docx";
  if (ct.includes("plain")) return ".txt";
  return "";
}

async function openEvidenceRevisionsPanel(evidenceId, displayName) {
  const cid = getSelectedCaseId();
  if (!cid || !evidenceRevisionsDialog || !evidenceRevisionsList) return;
  evidenceRevisionsTargetId = evidenceId;
  if (evidenceRevisionsSubtitle) {
    evidenceRevisionsSubtitle.textContent = displayName
      ? `证据：${displayName}`
      : `证据 ID：${evidenceId}`;
  }
  evidenceRevisionsList.innerHTML = `<p class="my-cases-dialog-desc">加载中…</p>`;
  evidenceRevisionsDialog.showModal();
  try {
    const data = await listCaseEvidenceRevisions(cid, evidenceId);
    const revs = Array.isArray(data?.revisions) ? data.revisions : [];
    if (!revs.length) {
      evidenceRevisionsList.innerHTML =
        `<p class="my-cases-dialog-desc">暂无替换记录或信息修订历史。</p>`;
      return;
    }
    evidenceRevisionsList.innerHTML = revs
      .map((r) => {
        const rid = escapeHtml(String(r.revision_id || ""));
        const at = escapeHtml(String(r.archived_at || ""));
        const isFile = r.change_kind === "file";
        const ckLabel = isFile ? "附件替换" : "信息修订";
        if (isFile && r.has_file) {
          return `<div class="my-cases-evidence-revision-row" role="listitem">
            <div class="my-cases-evidence-revision-row-head">
              <span>${escapeHtml(ckLabel)}</span>
              <span class="my-cases-evidence-revision-meta">${at}</span>
            </div>
            <button type="button" class="liquid-glass my-cases-evidence-action-btn" data-rev-download="1" data-revision-id="${rid}">下载该版附件</button>
          </div>`;
        }
        let snapHtml = "";
        if (r.snapshot_json) {
          try {
            const o = JSON.parse(String(r.snapshot_json));
            snapHtml = escapeHtml(JSON.stringify(o, null, 2));
          } catch {
            snapHtml = escapeHtml(String(r.snapshot_json).slice(0, 2000));
          }
        }
        return `<div class="my-cases-evidence-revision-row" role="listitem">
          <div class="my-cases-evidence-revision-row-head">
            <span>${escapeHtml(ckLabel)}</span>
            <span class="my-cases-evidence-revision-meta">${at}</span>
          </div>
          ${snapHtml ? `<pre class="my-cases-evidence-revision-snapshot">${snapHtml}</pre>` : ""}
        </div>`;
      })
      .join("");
  } catch (err) {
    evidenceRevisionsList.innerHTML = `<p class="my-cases-evidence-upload-status--error">${escapeHtml(err?.message || String(err))}</p>`;
  }
}


let evidencePanelInitialized = false;

export function initEvidencePanel() {
  if (evidencePanelInitialized) return;
  evidencePanelInitialized = true;

  if (!evidenceCardUploadInput.isConnected && document.body) {
    document.body.appendChild(evidenceCardUploadInput);
  }

  fillEvidenceTypeSelect();
  initLocationSelect();
  fillDateSelects();

  if (evidencePersistCheck) {
    evidencePersistCheck.addEventListener("change", () => {
      updateEvidenceNoCaseHint();
    });
  }

  if (addEvidenceOpenBtn) {
    addEvidenceOpenBtn.addEventListener("click", () => {
      syncAddEvidenceButton();
      if (addEvidenceOpenBtn.disabled) {
        setEvidenceStatus("请先在「案件」中创建并选中当前维权案件。", true);
        return;
      }
      openAddEvidenceDialog();
    });
  }

  if (addEvidenceDialogCancel) {
    addEvidenceDialogCancel.addEventListener("click", () => closeAddEvidenceDialog());
  }

  if (addEvidencePickFileBtn && addEvidenceFileInput) {
    addEvidencePickFileBtn.addEventListener("click", () => {
      addEvidenceFileInput.value = "";
      addEvidenceFileInput.click();
    });
  }

  if (addEvidenceFileInput) {
    addEvidenceFileInput.addEventListener("change", async () => {
      const file = addEvidenceFileInput.files?.[0];
      if (!file) return;
      const cid = caseSelect?.value;
      if (!cid) {
        setAddEvidenceUploadStatus("请先创建并选中案件后再上传。", true);
        if (addEvidenceUploadFileName) addEvidenceUploadFileName.textContent = "未选择文件";
        addEvidenceFileInput.value = "";
        return;
      }
      if (addEvidenceUploadFileName) addEvidenceUploadFileName.textContent = file.name;
      setAddEvidenceUploadStatus("正在上传并由证据专用模型识别…");
      if (addEvidencePickFileBtn) addEvidencePickFileBtn.disabled = true;
      try {
        const data = await uploadEvidenceAnalyze(file, cid);
        const eid = String(data.evidence_id || "").trim();
        if (!eid) throw new Error("未返回证据 ID");
        editEvidenceId = eid;
        applyEvidenceAnalysisToForm(data);
        if (addEvidenceDialogSubmit) addEvidenceDialogSubmit.textContent = "保存修改";
        setAddEvidenceUploadStatus("已自动入库。请核对右侧信息，可修改后点「保存修改」或关闭。", false);
        await loadEvidenceSummary();
      } catch (err) {
        setAddEvidenceUploadStatus(err?.message || "识别失败", true);
      } finally {
        if (addEvidencePickFileBtn) addEvidencePickFileBtn.disabled = false;
      }
    });
  }

  if (addEvidenceForm) {
    addEvidenceForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      setAddEvidenceDialogError("");

      const cid = caseSelect?.value;
      if (!cid) {
        setAddEvidenceDialogError("未选中案件，无法添加证据");
        return;
      }

      const payload = {
        name: String(addEvidenceName?.value || "").trim(),
        evidence_type: String(addEvidenceType?.value || "").trim(),
        description: String(addEvidenceDescription?.value || "").trim() || null,
        source: String(addEvidenceSource?.value || "").trim() || null,
        related_location: buildLocationFromSelect() || null,
        related_time: buildRelatedDateFromSelect(),
        note: String(addEvidenceNote?.value || "").trim() || null,
      };

      if (!payload.name) {
        setAddEvidenceDialogError("请填写证据名称");
        addEvidenceName?.focus();
        return;
      }
      if (!payload.evidence_type) {
        setAddEvidenceDialogError("请选择证据类型");
        addEvidenceType?.focus();
        return;
      }

      if (addEvidenceDialogSubmit) addEvidenceDialogSubmit.disabled = true;
      try {
        if (editEvidenceId) {
          await updateCaseEvidence(cid, editEvidenceId, payload);
        } else {
          await addCaseEvidence(cid, payload);
        }
        resetAddEvidenceFormForNew();
        closeAddEvidenceDialog();
        await loadEvidenceSummary();
        updateEvidenceNoCaseHint();
        syncAddEvidenceButton();
      } catch (err) {
        setAddEvidenceDialogError(err?.message || "添加失败");
      } finally {
        if (addEvidenceDialogSubmit) addEvidenceDialogSubmit.disabled = false;
      }
    });
  }

  /** @type {File | null} */

  if (evidenceListEl) {
    evidenceListEl.addEventListener("click", (event) => {
      const btn = event.target instanceof Element ? event.target.closest("button[data-action][data-evidence-id]") : null;
      if (!btn) return;
      const action = String(btn.getAttribute("data-action") || "");
      const evidenceId = String(btn.getAttribute("data-evidence-id") || "").trim();
      if (!evidenceId) return;

      if (action === "upload") {
        evidenceCardUploadTargetId = evidenceId;
        evidenceCardUploadInput.value = "";
        evidenceCardUploadInput.click();
        return;
      }

      if (action === "edit") {
        const item = evidenceCache.find((it) => String(it?.evidence_id || "") === evidenceId);
        if (!item) {
          setEvidenceStatus("未找到对应证据，无法编辑", true);
          return;
        }
        editEvidenceId = evidenceId;
        if (addEvidenceUploadFileName) addEvidenceUploadFileName.textContent = "未选择文件";
        if (addEvidenceFileInput) addEvidenceFileInput.value = "";
        setAddEvidenceUploadStatus("");
        if (addEvidenceDialogTitle) addEvidenceDialogTitle.textContent = "编辑证据";
        if (addEvidenceDialogSubmit) addEvidenceDialogSubmit.textContent = "保存修改";
        if (addEvidenceName) addEvidenceName.value = String(item.name || "");
        if (addEvidenceType) addEvidenceType.value = String(item.evidence_type || "其他证据图片");
        if (addEvidenceDescription) addEvidenceDescription.value = String(item.description || "");
        if (addEvidenceSource) addEvidenceSource.value = String(item.source || "");
        const dateParts = parseDateParts(item.related_time);
        if (addEvidenceYear) addEvidenceYear.value = dateParts.year;
        if (addEvidenceMonth) addEvidenceMonth.value = dateParts.month;
        if (addEvidenceDay) addEvidenceDay.value = dateParts.day;
        if (addEvidenceNote) addEvidenceNote.value = String(item.note || "");
        const parsedLocation = parseLocationToSelection(item.related_location);
        if (addEvidenceProvince) {
          addEvidenceProvince.value = parsedLocation.province;
        }
        if (addEvidenceCity) {
          fillCitySelect(parsedLocation.province);
          addEvidenceCity.value = parsedLocation.city;
        }
        if (addEvidenceDistrict) {
          if (parsedLocation.province && parsedLocation.city) {
            fillDistrictSelect(parsedLocation.province, parsedLocation.city);
          } else {
            addEvidenceDistrict.innerHTML = '<option value="">请选择区</option>';
          }
          addEvidenceDistrict.value = parsedLocation.district;
        }
        if (addEvidenceDetailAddress) addEvidenceDetailAddress.value = parsedLocation.detail;
        setDialogLocationEnabledState();
        setAddEvidenceDialogError("");
        addEvidenceDialog?.showModal();
        window.setTimeout(() => addEvidenceName?.focus(), 0);
        return;
      }

      if (action === "revisions") {
        const disp = String(btn.getAttribute("data-evidence-name") || "").trim();
        void openEvidenceRevisionsPanel(evidenceId, disp);
        return;
      }

      if (action === "view") {
        if (btn.hasAttribute("disabled")) return;
        evidenceViewerFileName = String(btn.getAttribute("data-evidence-name") || "证据附件");
        if (evidenceViewerTitle) evidenceViewerTitle.textContent = `证据预览 - ${evidenceViewerFileName}`;
        void openEvidenceFileById(evidenceId).catch((err) => {
          setEvidenceStatus(err?.message || "查看失败", true);
        });
      }
    });
  }

  if (evidenceRevisionsList) {
    evidenceRevisionsList.addEventListener("click", async (event) => {
      const btn = event.target instanceof Element ? event.target.closest("button[data-rev-download]") : null;
      if (!btn || !evidenceRevisionsTargetId) return;
      const revisionId = String(btn.getAttribute("data-revision-id") || "").trim();
      if (!revisionId) return;
      btn.disabled = true;
      try {
        const { blob, contentType } = await fetchEvidenceRevisionFileBlob(
          evidenceRevisionsTargetId,
          revisionId
        );
        const ext = _extensionForMime(contentType) || ".bin";
        const a = document.createElement("a");
        const url = URL.createObjectURL(blob);
        a.href = url;
        a.download = `历史附件_${revisionId.slice(0, 8)}${ext}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } catch (err) {
        setEvidenceStatus(err?.message || "下载失败", true);
      } finally {
        btn.disabled = false;
      }
    });
  }

  if (evidenceRevisionsCloseBtn) {
    evidenceRevisionsCloseBtn.addEventListener("click", () => {
      evidenceRevisionsDialog?.close();
    });
  }

  if (exportEvidenceCsvBtn) {
    exportEvidenceCsvBtn.addEventListener("click", async () => {
      const cid = getSelectedCaseId();
      if (!cid) {
        setEvidenceStatus("请先选择案件", true);
        return;
      }
      exportEvidenceCsvBtn.disabled = true;
      try {
        await downloadCaseEvidenceCsv(cid);
        setEvidenceStatus("清单已开始下载。");
      } catch (err) {
        setEvidenceStatus(err?.message || "导出失败", true);
      } finally {
        exportEvidenceCsvBtn.disabled = false;
      }
    });
  }

  if (exportEvidenceZipBtn) {
    exportEvidenceZipBtn.addEventListener("click", async () => {
      const cid = getSelectedCaseId();
      if (!cid) {
        setEvidenceStatus("请先选择案件", true);
        return;
      }
      exportEvidenceZipBtn.disabled = true;
      try {
        await downloadCaseEvidenceZip(cid);
        setEvidenceStatus("压缩包已开始下载。");
      } catch (err) {
        setEvidenceStatus(err?.message || "打包失败", true);
      } finally {
        exportEvidenceZipBtn.disabled = false;
      }
    });
  }

  if (evidenceViewerCloseBtn) {
    evidenceViewerCloseBtn.addEventListener("click", () => {
      evidenceViewerDialog?.close();
    });
  }

  if (evidenceViewerOpenNewBtn) {
    evidenceViewerOpenNewBtn.addEventListener("click", () => {
      if (!evidenceViewerObjectUrl) return;
      const win = window.open(evidenceViewerObjectUrl, "_blank", "noopener,noreferrer");
      if (!win) {
        setEvidenceStatus("浏览器拦截了新窗口，请允许弹窗后重试", true);
      }
    });
  }

  if (evidenceViewerDownloadBtn) {
    evidenceViewerDownloadBtn.addEventListener("click", () => {
      if (!evidenceViewerObjectUrl) return;
      const a = document.createElement("a");
      a.href = evidenceViewerObjectUrl;
      a.download = evidenceViewerFileName || "证据附件";
      document.body.appendChild(a);
      a.click();
      a.remove();
    });
  }

  if (evidenceViewerDialog) {
    evidenceViewerDialog.addEventListener("close", () => {
      if (evidenceViewerFrame) evidenceViewerFrame.src = "about:blank";
      if (evidenceViewerImage) evidenceViewerImage.src = "";
      if (evidenceViewerObjectUrl) {
        URL.revokeObjectURL(evidenceViewerObjectUrl);
        evidenceViewerObjectUrl = "";
      }
    });
  }

  evidenceCardUploadInput.addEventListener("change", async () => {
    const file = evidenceCardUploadInput.files?.[0];
    const evidenceId = evidenceCardUploadTargetId;
    evidenceCardUploadTargetId = "";
    if (!file || !evidenceId) return;
    try {
      setEvidenceStatus("正在上传证据文件…");
      await uploadEvidenceFile(evidenceId, file);
      setEvidenceStatus("文件已上传并入库");
      await loadEvidenceSummary();
    } catch (err) {
      setEvidenceStatus(err?.message || "上传失败", true);
    } finally {
      evidenceCardUploadInput.value = "";
    }
  });

  if (evidenceFileInput && evidenceFileName && evidenceOcrBtn) {
    evidenceFileInput.addEventListener("change", () => {
      const f = evidenceFileInput.files?.[0];
      evidenceSelectedFile = f || null;
      evidenceFileName.textContent = f ? f.name : "未选择文件";
      syncEvidenceUploadButton();
      setEvidenceStatus("");
    });

    evidenceOcrBtn.addEventListener("click", async () => {
      if (!evidenceSelectedFile) return;
      const cid = caseSelect?.value || undefined;
      const persist = Boolean(evidencePersistCheck?.checked);
      if (persist && !cid) {
        setEvidenceStatus("保存到证据库需要先创建并选中案件（见上方黄底说明）", true);
        return;
      }
      evidenceOcrBtn.disabled = true;
      setEvidenceStatus("正在处理…");
      if (evidenceOcrText) evidenceOcrText.textContent = "";
      try {
        if (persist && cid) {
          await uploadEvidenceAnalyze(evidenceSelectedFile, cid);
          setEvidenceStatus("已智能识别并保存到证据库");
          await loadEvidenceSummary();
        } else {
          const data = await uploadEvidenceOcr(evidenceSelectedFile, {
            caseId: cid || undefined,
            persist
          });
          const t = data?.ocr_text ?? "";
          if (evidenceOcrText) {
            evidenceOcrText.textContent = t.trim() ? t : "（未识别到文字）";
          }
          setEvidenceStatus(
            data?.persisted ? "已识别并保存到证据库" : "识别完成（未保存到库）"
          );
          if (persist && data?.persisted) {
            await loadEvidenceSummary();
          }
        }
      } catch (e) {
        setEvidenceStatus(e?.message || "识别失败", true);
      } finally {
        syncEvidenceUploadButton();
      }
    });
  }
}
