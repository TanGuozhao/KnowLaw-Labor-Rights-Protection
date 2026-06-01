import { setupProtectedPage } from "../page-auth.js";

export const elements = {
  userWelcome: document.getElementById("userWelcome"),
  logoutBtn: document.getElementById("logoutBtn"),
  caseSelect: document.getElementById("caseSelect"),
  myCasesMainCanvas: document.getElementById("myCasesMainCanvas"),
  myCasesPaneCase: document.getElementById("myCasesPaneCase"),
  myCasesPaneEvidence: document.getElementById("myCasesPaneEvidence"),
  myCasesPaneTimeline: document.getElementById("myCasesPaneTimeline"),
  myCasesPaneGraph: document.getElementById("myCasesPaneGraph"),
  myCasesTimelineCanvas: document.getElementById("myCasesTimelineCanvas"),
  myCasesGraphCanvas: document.getElementById("myCasesGraphCanvas"),
  funcBtns: document.querySelectorAll(".my-cases-func-btn"),
  newCaseDialog: document.getElementById("newCaseDialog"),
  newCaseOpenBtn: document.getElementById("newCaseOpenBtn"),
  newCaseForm: document.getElementById("newCaseForm"),
  newCaseDialogCancel: document.getElementById("newCaseDialogCancel"),
  newCaseDialogSubmit: document.getElementById("newCaseDialogSubmit"),
  newCaseDialogError: document.getElementById("newCaseDialogError"),
  newCaseName: document.getElementById("newCaseName"),
  evidenceCompletenessScore: document.getElementById("evidenceCompletenessScore"),
  evidenceCompletenessFill: document.getElementById("evidenceCompletenessFill"),
  evidenceCompletenessTrack: document.getElementById("evidenceCompletenessTrack"),
  evidenceCompletenessHint: document.getElementById("evidenceCompletenessHint"),
  evidenceListEl: document.getElementById("evidenceListEl"),
  evidenceFileInput: document.getElementById("evidenceFileInput"),
  evidenceFileName: document.getElementById("evidenceFileName"),
  evidenceOcrBtn: document.getElementById("evidenceOcrBtn"),
  evidenceOcrStatus: document.getElementById("evidenceOcrStatus"),
  evidenceOcrText: document.getElementById("evidenceOcrText"),
  evidencePersistCheck: document.getElementById("evidencePersistCheck"),
  evidenceNoCaseHint: document.getElementById("evidenceNoCaseHint"),
  addEvidenceOpenBtn: document.getElementById("addEvidenceOpenBtn"),
  newEvidenceOpenBtn: document.getElementById("newEvidenceOpenBtn"),
  newEvidenceChoiceDialog: document.getElementById("newEvidenceChoiceDialog"),
  newEvidenceChoiceDialogClose: document.getElementById("newEvidenceChoiceDialogClose"),
  newEvidenceAutoCard: document.getElementById("newEvidenceAutoCard"),
  newEvidenceManualCard: document.getElementById("newEvidenceManualCard"),
  addEvidenceDialog: document.getElementById("addEvidenceDialog"),
  addEvidenceDialogTitle: document.getElementById("addEvidenceDialogTitle"),
  addEvidenceForm: document.getElementById("addEvidenceForm"),
  addEvidenceDialogCancel: document.getElementById("addEvidenceDialogCancel"),
  addEvidenceDialogSubmit: document.getElementById("addEvidenceDialogSubmit"),
  addEvidenceDialogError: document.getElementById("addEvidenceDialogError"),
  addEvidenceName: document.getElementById("addEvidenceName"),
  addEvidenceType: document.getElementById("addEvidenceType"),
  addEvidenceDescription: document.getElementById("addEvidenceDescription"),
  addEvidenceSource: document.getElementById("addEvidenceSource"),
  addEvidenceProvince: document.getElementById("addEvidenceProvince"),
  addEvidenceCity: document.getElementById("addEvidenceCity"),
  addEvidenceDistrict: document.getElementById("addEvidenceDistrict"),
  addEvidenceDetailAddress: document.getElementById("addEvidenceDetailAddress"),
  addEvidenceYear: document.getElementById("addEvidenceYear"),
  addEvidenceMonth: document.getElementById("addEvidenceMonth"),
  addEvidenceDay: document.getElementById("addEvidenceDay"),
  addEvidenceNote: document.getElementById("addEvidenceNote"),
  addEvidenceFileInput: document.getElementById("addEvidenceFileInput"),
  addEvidencePickFileBtn: document.getElementById("addEvidencePickFileBtn"),
  addEvidenceUploadFileName: document.getElementById("addEvidenceUploadFileName"),
  addEvidenceUploadStatus: document.getElementById("addEvidenceUploadStatus"),
  evidenceViewerDialog: document.getElementById("evidenceViewerDialog"),
  evidenceViewerTitle: document.getElementById("evidenceViewerTitle"),
  evidenceViewerHint: document.getElementById("evidenceViewerHint"),
  evidenceViewerFrame: document.getElementById("evidenceViewerFrame"),
  evidenceViewerImage: document.getElementById("evidenceViewerImage"),
  evidenceViewerFallback: document.getElementById("evidenceViewerFallback"),
  evidenceViewerCloseBtn: document.getElementById("evidenceViewerCloseBtn"),
  evidenceViewerOpenNewBtn: document.getElementById("evidenceViewerOpenNewBtn"),
  evidenceViewerDownloadBtn: document.getElementById("evidenceViewerDownloadBtn"),
  exportEvidenceCsvBtn: document.getElementById("exportEvidenceCsvBtn"),
  exportEvidenceZipBtn: document.getElementById("exportEvidenceZipBtn"),
  evidenceRevisionsDialog: document.getElementById("evidenceRevisionsDialog"),
  evidenceRevisionsSubtitle: document.getElementById("evidenceRevisionsSubtitle"),
  evidenceRevisionsList: document.getElementById("evidenceRevisionsList"),
  evidenceRevisionsCloseBtn: document.getElementById("evidenceRevisionsCloseBtn"),
  evidenceDetailDialog: document.getElementById("evidenceDetailDialog"),
  evidenceDetailTitle: document.getElementById("evidenceDetailTitle"),
  evidenceDetailSubtitle: document.getElementById("evidenceDetailSubtitle"),
  evidenceDetailBody: document.getElementById("evidenceDetailBody"),
  evidenceDetailViewSourceBtn: document.getElementById("evidenceDetailViewSourceBtn"),
  evidenceDetailImportSourceBtn: document.getElementById("evidenceDetailImportSourceBtn"),
  evidenceDetailCloseBtn: document.getElementById("evidenceDetailCloseBtn"),
};

export const state = {
  casesCache: [],
  evidenceCardUploadTargetId: "",
  evidenceViewerObjectUrl: "",
  evidenceViewerFileName: "证据附件",
  evidenceCache: [],
  evidenceSummaryRequestSeq: 0,
  editEvidenceId: "",
  evidenceRevisionsTargetId: "",
  evidenceSelectedFile: null,
};

export function initMyCasesPage() {
  // Use id strings so resolveElement runs after the navbar has rendered (same document order as script tags).
  setupProtectedPage();
}

export function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");
}

export function parseDateParts(raw) {
  const s = String(raw || "").trim();
  if (!s) return { year: "", month: "", day: "" };
  const m = s.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (!m) return { year: "", month: "", day: "" };
  return {
    year: m[1],
    month: m[2].padStart(2, "0"),
    day: m[3].padStart(2, "0"),
  };
}

export function buildRelatedDateFromSelect() {
  const y = String(elements.addEvidenceYear?.value || "").trim();
  const m = String(elements.addEvidenceMonth?.value || "").trim();
  const d = String(elements.addEvidenceDay?.value || "").trim();
  if (!y || !m || !d) return null;
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

export function getSelectedCaseId() {
  return String(elements.caseSelect?.value || "").trim();
}

export function getSelectedCaseFromCache() {
  const caseId = getSelectedCaseId();
  return state.casesCache.find((item) => String(item.case_id || "") === caseId) || null;
}

export function syncAddEvidenceButton() {
  const disabled = !elements.caseSelect?.value;
  if (elements.addEvidenceOpenBtn) elements.addEvidenceOpenBtn.disabled = disabled;
  if (elements.newEvidenceOpenBtn) elements.newEvidenceOpenBtn.disabled = disabled;
}