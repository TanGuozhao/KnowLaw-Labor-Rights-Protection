import {
  downloadCivilComplaintDocx,
  downloadEnforcementApplicationDocx,
  downloadEvidenceListDocx,
  downloadLaborArbitrationApplicationDocx,
  downloadLaborMediationApplicationDocx,
  downloadLaborComplaintDocx,
  extractLaborComplaintFields,
  fetchCaseArchives,
  getCurrentProfile,
  listCaseEvidence,
  listCases,
} from "./api.js";
import {
  appendDocumentSnapshot,
  buildRightsCaseFromDocumentForm,
  createDocumentSnapshot,
  getMissingFieldsForTemplate,
  saveRightsCaseDraft,
} from "./rights-case-model.js";
import { setupProtectedPage } from "./page-auth.js";
import { getCurrentUser } from "./auth.js";

setupProtectedPage();

const docGenForm = document.getElementById("docGenForm");
const docGenScrollArea = document.getElementById("docGenScrollArea");
const caseQuickSelect = document.getElementById("caseQuickSelect");
const docTypeEl = document.getElementById("docType");
const docTemplateEl = document.getElementById("docTemplate");
const applicantEl = document.getElementById("applicant");
const complainantGenderEl = document.getElementById("complainantGender");
const applicantPhoneEl = document.getElementById("applicantPhone");
const complainantIdNumberEl = document.getElementById("complainantIdNumber");
const complainantProvinceEl = document.getElementById("complainantProvince");
const complainantCityEl = document.getElementById("complainantCity");
const complainantDistrictEl = document.getElementById("complainantDistrict");
const complainantAddressDetailEl = document.getElementById("complainantAddressDetail");
const complainantPostalCodeEl = document.getElementById("complainantPostalCode");
const respondentEl = document.getElementById("respondent");
const respondentLegalRepresentativeEl = document.getElementById("respondentLegalRepresentative");
const respondentContactNameEl = document.getElementById("respondentContactName");
const respondentContactJobTitleEl = document.getElementById("respondentContactJobTitle");
const respondentRegisteredAddressEl = document.getElementById("respondentRegisteredAddress");
const respondentBusinessProvinceEl = document.getElementById("respondentBusinessProvince");
const respondentBusinessCityEl = document.getElementById("respondentBusinessCity");
const respondentBusinessDistrictEl = document.getElementById("respondentBusinessDistrict");
const respondentBusinessRegionEl = document.getElementById("respondentBusinessRegion");
const respondentBusinessDetailEl = document.getElementById("respondentBusinessDetail");
const respondentContactPhoneEl = document.getElementById("respondentContactPhone");
const respondentPostalCodeEl = document.getElementById("respondentPostalCode");
const claimsEl = document.getElementById("claims");
const factsEl = document.getElementById("facts");
const evidenceListEl = document.getElementById("evidenceList");
const civilPlaintiffNameEl = document.getElementById("civilPlaintiffName");
const civilPlaintiffGenderEl = document.getElementById("civilPlaintiffGender");
const civilPlaintiffEthnicityEl = document.getElementById("civilPlaintiffEthnicity");
const civilPlaintiffBirthEl = document.getElementById("civilPlaintiffBirth");
const civilPlaintiffAddressEl = document.getElementById("civilPlaintiffAddress");
const civilPlaintiffIdNumberEl = document.getElementById("civilPlaintiffIdNumber");
const civilPlaintiffPhoneEl = document.getElementById("civilPlaintiffPhone");
const civilDefendantNameEl = document.getElementById("civilDefendantName");
const civilDefendantAddressEl = document.getElementById("civilDefendantAddress");
const civilDefendantPhoneEl = document.getElementById("civilDefendantPhone");
const civilDefendantLegalRepresentativeEl = document.getElementById("civilDefendantLegalRepresentative");
const civilCourtNameEl = document.getElementById("civilCourtName");
const civilCaseCauseEl = document.getElementById("civilCaseCause");
const civilClaimsEl = document.getElementById("civilClaims");
const civilFactsEl = document.getElementById("civilFacts");
const civilEvidenceListEl = document.getElementById("civilEvidenceList");
const docGenLaborPanelEl = document.getElementById("docGenLaborPanel");
const docGenCivilPanelEl = document.getElementById("docGenCivilPanel");
const docGenEnforcementPanelEl = document.getElementById("docGenEnforcementPanel");
const docGenArbitrationPanelEl = document.getElementById("docGenArbitrationPanel");
const docGenMediationPanelEl = document.getElementById("docGenMediationPanel");
const docGenStickySmartEl = document.getElementById("docGenStickySmart");
const enfApplicantNameEl = document.getElementById("enfApplicantName");
const enfApplicantGenderEl = document.getElementById("enfApplicantGender");
const enfApplicantEthnicityEl = document.getElementById("enfApplicantEthnicity");
const enfApplicantBirthEl = document.getElementById("enfApplicantBirth");
const enfApplicantAddressEl = document.getElementById("enfApplicantAddress");
const enfApplicantIdNumberEl = document.getElementById("enfApplicantIdNumber");
const enfApplicantPhoneEl = document.getElementById("enfApplicantPhone");
const enfApplicantJobEl = document.getElementById("enfApplicantJob");
const enfLegalRepEl = document.getElementById("enfLegalRep");
const enfEntrustedAgentEl = document.getElementById("enfEntrustedAgent");
const enfRespondentNameEl = document.getElementById("enfRespondentName");
const enfRespondentAddressEl = document.getElementById("enfRespondentAddress");
const enfRespondentPhoneEl = document.getElementById("enfRespondentPhone");
const enfRespondentLegalRepresentativeEl = document.getElementById("enfRespondentLegalRepresentative");
const enfCourtNameEl = document.getElementById("enfCourtName");
const enfCaseCauseEl = document.getElementById("enfCaseCause");
const enfBasisJudgmentNoEl = document.getElementById("enfBasisJudgmentNo");
const enfBasisIssuerEl = document.getElementById("enfBasisIssuer");
const enfBasisEffectiveDateEl = document.getElementById("enfBasisEffectiveDate");
const enfBasisExtraEl = document.getElementById("enfBasisExtra");
const enfBasisDocTypePhraseEl = document.getElementById("enfBasisDocTypePhrase");
const enfAttachmentLineEl = document.getElementById("enfAttachmentLine");
const enfRequestsEl = document.getElementById("enfRequests");
const enfFactsEl = document.getElementById("enfFacts");
const arbApplicantNameEl = document.getElementById("arbApplicantName");
const arbApplicantGenderEl = document.getElementById("arbApplicantGender");
const arbApplicantEthnicityEl = document.getElementById("arbApplicantEthnicity");
const arbApplicantBirthEl = document.getElementById("arbApplicantBirth");
const arbApplicantAddressEl = document.getElementById("arbApplicantAddress");
const arbApplicantIdTypeEl = document.getElementById("arbApplicantIdType");
const arbApplicantIdNumberEl = document.getElementById("arbApplicantIdNumber");
const arbApplicantJobEl = document.getElementById("arbApplicantJob");
const arbApplicantPhoneEl = document.getElementById("arbApplicantPhone");
const arbContractPerformancePlaceEl = document.getElementById("arbContractPerformancePlace");
const arbRespondentNameEl = document.getElementById("arbRespondentName");
const arbRespondentAddressEl = document.getElementById("arbRespondentAddress");
const arbRespondentPhoneEl = document.getElementById("arbRespondentPhone");
const arbRespondentLegalRepresentativeEl = document.getElementById("arbRespondentLegalRepresentative");
const arbRespondentLegalRepresentativeJobEl = document.getElementById(
  "arbRespondentLegalRepresentativeJob",
);
const arbRespondentBusinessPlaceEl = document.getElementById("arbRespondentBusinessPlace");
const arbRespondentContactPersonEl = document.getElementById("arbRespondentContactPerson");
const arbCommissionEl = document.getElementById("arbCommission");
const arbClaimsEl = document.getElementById("arbClaims");
const arbFactsEl = document.getElementById("arbFacts");
const arbEvidenceListEl = document.getElementById("arbEvidenceList");
const arbAgentBlockEl = document.getElementById("arbAgentBlock");
const arbAttachmentLineEl = document.getElementById("arbAttachmentLine");
const medApplicantNameEl = document.getElementById("medApplicantName");
const medApplicantGenderEl = document.getElementById("medApplicantGender");
const medApplicantEthnicityEl = document.getElementById("medApplicantEthnicity");
const medApplicantBirthEl = document.getElementById("medApplicantBirth");
const medApplicantAddressEl = document.getElementById("medApplicantAddress");
const medApplicantIdNumberEl = document.getElementById("medApplicantIdNumber");
const medApplicantIdTypeEl = document.getElementById("medApplicantIdType");
const medApplicantJobEl = document.getElementById("medApplicantJob");
const medApplicantPhoneEl = document.getElementById("medApplicantPhone");
const medContractPerformancePlaceEl = document.getElementById("medContractPerformancePlace");
const medRespondentNameEl = document.getElementById("medRespondentName");
const medRespondentAddressEl = document.getElementById("medRespondentAddress");
const medRespondentPhoneEl = document.getElementById("medRespondentPhone");
const medRespondentLegalRepresentativeEl = document.getElementById("medRespondentLegalRepresentative");
const medRespondentBusinessPlaceEl = document.getElementById("medRespondentBusinessPlace");
const medRespondentContactPersonEl = document.getElementById("medRespondentContactPerson");
const medClaimsEl = document.getElementById("medClaims");
const medFactsEl = document.getElementById("medFacts");
const docGenEvidencePanelEl = document.getElementById("docGenEvidencePanel");
const evlRowsTbody = document.getElementById("evlRows");
const evlAddRowBtn = document.getElementById("evlAddRowBtn");
const evlRemoveRowBtn = document.getElementById("evlRemoveRowBtn");
const evlTotalItemsEl = document.getElementById("evlTotalItems");
const evlTotalPagesEl = document.getElementById("evlTotalPages");
const evlSubmitterNameEl = document.getElementById("evlSubmitterName");
const evlSubmissionDateEl = document.getElementById("evlSubmissionDate");
const evlCourtReceiverEl = document.getElementById("evlCourtReceiver");
const docGenStatus = document.getElementById("docGenStatus");
const docPreview = document.getElementById("docPreview");
const docGenWordCount = document.getElementById("docGenWordCount");
const downloadWordBtn = document.getElementById("downloadWordBtn");
const downloadPdfBtn = document.getElementById("downloadPdfBtn");
const smartNarrativeEl = document.getElementById("smartNarrative");
const applyNarrativeBtn = document.getElementById("applyNarrativeBtn");
const prevPageBtn = document.getElementById("prevPageBtn");
const nextPageBtn = document.getElementById("nextPageBtn");
const docGenPageIndicator = document.getElementById("docGenPageIndicator");
const REGION_DATA_URL = "https://raw.githubusercontent.com/modood/Administrative-divisions-of-China/master/dist/pca-code.json";

let currentDocumentText = "";
let currentFormPage = 1;
/** @type {Map<string, object>} */
const caseById = new Map();

const TEMPLATE_OPTIONS = [
  { id: "labor_security_inspection_complaint", label: "劳动保障监察投诉书" },
  { id: "civil_complaint", label: "民事起诉状" },
  { id: "enforcement_application", label: "申请执行书" },
  { id: "labor_arbitration_application", label: "劳动人事争议仲裁申请书" },
  { id: "labor_mediation_application", label: "劳动争议调解申请书" },
  { id: "evidence_list", label: "证据材料清单" },
];

let activeTemplateId = "labor_security_inspection_complaint";
const applicantProfileDefaults = {
  name: "",
  gender: "",
  phone: "",
  email: "",
  id_card: "",
  region: "",
  home_addr: "",
  occupation: "",
  school: "",
  birth_date: "",
  ethnicity: "",
  postal_code: "",
  landline_phone: "",
};

function getTotalFormPages() {
  return activeTemplateId === "evidence_list" ? 1 : 2;
}
let initialFieldsMarkup = "";

function nowDateText() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}年${m}月${day}日`;
}

function splitLines(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/** 去掉行首已有序号，避免自动生成序号时出现「1. 1. xxx」 */
function stripLeadingEnumeration(line) {
  return String(line ?? "").replace(/^\s*\d+[\.\．、]\s*/, "").trim();
}

function getDocTypeLabel(templateId) {
  const tid = templateId || activeTemplateId;
  const hit = TEMPLATE_OPTIONS.find((t) => t.id === tid);
  return hit?.label || "文书";
}

/** 未填写时右侧展示的空白范本（与 buildDocument 结构一致） */
const LABOR_COMPLAINT_TEMPLATE_PAYLOAD = {
  applicant: "［投诉人姓名］",
  complainantGender: "［性别］",
  complainantIdNumber: "［身份证件号］",
  complainantAddress: "［通讯地址：省、市、区及街道门牌］",
  complainantPostalCode: "［邮编］",
  applicantPhone: "［联系电话］",
  respondent: "［被投诉单位全称］",
  respondentLegalRepresentative: "［法定代表人或主要负责人］",
  respondentContactName: "［联系人］",
  respondentContactJobTitle: "［职务］",
  respondentRegisteredAddress: "［注册地址］",
  respondentBusinessAddress: "［实际经营地址］",
  respondentContactPhone: "［联系电话］",
  respondentPostalCode: "［邮编］",
  claims: "1. ［具体投诉请求一，如：支付拖欠工资××元］\n2. ［具体投诉请求二］",
  facts:
    "［事实与理由：入职时间、岗位、工资约定、争议发生经过、与单位沟通情况等。可分多行书写。］",
  dateText: "［　　年　　月　　日］",
  evidenceList: "",
  complainantLandline: "［固定电话］",
};

/** 民事起诉状：与 Word 占位符、右侧预览一致 */
const CIVIL_COMPLAINT_TEMPLATE_PAYLOAD = {
  plaintiff_name: "［原告姓名］",
  plaintiff_gender: "［性别］",
  plaintiff_ethnicity: "［民族］",
  plaintiff_birth: "［出生日期］",
  plaintiff_address: "［住址］",
  plaintiff_id_number: "［身份证号］",
  plaintiff_phone: "［联系电话］",
  defendant_name: "［被告姓名或单位名称］",
  defendant_address: "［被告住址或住所地］",
  defendant_phone: "［被告联系电话］",
  defendant_legal_representative: "",
  case_cause: "［案由］",
  claims: "1. ［诉讼请求一］\n2. ［诉讼请求二］",
  facts: "［事实与理由］",
  evidence_list: "",
  court_name: "［××人民法院］",
  dateText: "［　　年　　月　　日］",
};

/** 申请执行书：与法院范文 Word、右侧预览一致 */
const ENFORCEMENT_APPLICATION_TEMPLATE_PAYLOAD = {
  applicant_name: "［申请执行人姓名］",
  applicant_gender: "［性别］",
  applicant_ethnicity: "［民族］",
  applicant_birth: "［出生日期］",
  applicant_job: "",
  applicant_address: "［住址］",
  applicant_id_number: "［身份证号］",
  applicant_phone: "［联系电话］",
  legal_representative_line: "",
  entrusted_agent_line: "",
  respondent_name: "［被执行人姓名或单位名称］",
  respondent_address: "［住址或住所地］",
  respondent_phone: "［联系电话］",
  respondent_legal_representative: "",
  case_cause: "［案由］",
  basis_judgment_no: "［生效法律文书案号］",
  basis_issuer: "［作出机关］",
  basis_effective_date: "［生效日期］",
  basis_extra: "",
  basis_doc_type_phrase: "",
  attachment_line: "",
  requests: "……(写明请求执行的内容)。",
  facts: "［事实与理由：如拒不履行情况、已催告情况等］",
  court_name: "［执行法院全称］",
  dateText: "［　　年　　月　　日］",
};

/** 劳动仲裁申请书 */
const LABOR_ARBITRATION_TEMPLATE_PAYLOAD = {
  applicant_name: "［申请人姓名］",
  applicant_gender: "［性别］",
  applicant_ethnicity: "［民族］",
  applicant_birth: "［出生日期］",
  applicant_address: "［住址］",
  applicant_id_type: "［身份证件类型］",
  applicant_id_number: "［身份证号］",
  applicant_job: "",
  applicant_phone: "［联系电话］",
  contract_performance_place: "",
  respondent_name: "［被申请人姓名或单位名称］",
  respondent_address: "［住址或住所地］",
  respondent_phone: "［联系电话］",
  respondent_legal_representative: "",
  respondent_legal_representative_job: "",
  respondent_business_place: "",
  respondent_contact_person: "",
  arbitration_commission: "［××劳动人事争议仲裁委员会］",
  claims: "1. ［仲裁请求一］\n2. ［仲裁请求二］",
  facts: "［事实与理由］",
  evidence_list: "",
  agent_block: "",
  attachment_line: "",
  dateText: "［　　年　　月　　日］",
};

/** 劳动争议调解申请书 */
const LABOR_MEDIATION_TEMPLATE_PAYLOAD = {
  applicant_name: "［申请人姓名］",
  applicant_gender: "［性别］",
  applicant_ethnicity: "［民族］",
  applicant_birth: "［出生日期］",
  applicant_address: "［住址］",
  applicant_id_type: "［身份证件类型］",
  applicant_id_number: "［身份证号］",
  applicant_job: "［工作单位及职务］",
  applicant_phone: "［联系电话］",
  contract_performance_place: "［劳动合同履行地］",
  respondent_name: "［被申请人姓名或单位名称］",
  respondent_address: "［住址或住所地］",
  respondent_phone: "［联系电话］",
  respondent_legal_representative: "",
  respondent_business_place: "",
  respondent_contact_person: "",
  claims: "1. ［调解请求一］\n2. ［调解请求二］",
  facts: "［事实与理由］",
  dateText: "［　　年　　月　　日］",
};

/** 证据材料清单（表格行用于预览占位） */
const EVIDENCE_LIST_TEMPLATE_PAYLOAD = {
  evidence_items: Array.from({ length: 7 }, () => ({
    name: "\uff3b\u8bc1\u636e\u540d\u79f0\uff3d",
    source: "\uff3b\u8bc1\u636e\u6765\u6e90\uff3d",
    description: "\uff3b\u8bc1\u636e\u8bf4\u660e\uff3d",
    pages: "\uff3b\u9875\u6570\uff3d",
  })),
  total_items: "",
  total_pages: "",
  submitter_name: "\uff3b\u63d0\u4ea4\u4eba\uff3d",
  submission_date: "\uff3b\u3000\u3000\u5e74\u3000\u3000\u6708\u3000\u3000\u65e5\uff3d",
  court_receiver: "\uff3b\u6cd5\u9662\u63a5\u6536\u4eba\uff3d",
};

const DEFAULT_EVIDENCE_ROW_COUNT = 7;

function getDocGenPages() {
  let panel = docGenLaborPanelEl;
  if (activeTemplateId === "civil_complaint") panel = docGenCivilPanelEl;
  if (activeTemplateId === "enforcement_application") panel = docGenEnforcementPanelEl;
  if (activeTemplateId === "labor_arbitration_application") panel = docGenArbitrationPanelEl;
  if (activeTemplateId === "labor_mediation_application") panel = docGenMediationPanelEl;
  if (activeTemplateId === "evidence_list") panel = docGenEvidencePanelEl;
  if (!panel) return [];
  return Array.from(panel.querySelectorAll(".doc-gen-page"));
}

function toggleTemplatePanels(templateId) {
  const tid = String(templateId || "").trim();
  if (docGenLaborPanelEl) docGenLaborPanelEl.hidden = tid !== "labor_security_inspection_complaint";
  if (docGenCivilPanelEl) docGenCivilPanelEl.hidden = tid !== "civil_complaint";
  if (docGenEnforcementPanelEl) docGenEnforcementPanelEl.hidden = tid !== "enforcement_application";
  if (docGenArbitrationPanelEl) docGenArbitrationPanelEl.hidden = tid !== "labor_arbitration_application";
  if (docGenMediationPanelEl) docGenMediationPanelEl.hidden = tid !== "labor_mediation_application";
  if (docGenEvidencePanelEl) docGenEvidencePanelEl.hidden = tid !== "evidence_list";
  if (docGenStickySmartEl) docGenStickySmartEl.hidden = tid !== "labor_security_inspection_complaint";
}

function reindexEvidenceRows() {
  if (!evlRowsTbody) return;
  Array.from(evlRowsTbody.querySelectorAll("tr")).forEach((tr, i) => {
    const idxCell = tr.querySelector(".doc-gen-evl-idx");
    if (idxCell) idxCell.textContent = String(i + 1);
  });
}

function makeEvidenceTableRow(data) {
  const d = data || {};
  const tr = document.createElement("tr");
  tr.className = "doc-gen-evl-row";
  const idx = document.createElement("td");
  idx.className = "doc-gen-evl-idx";
  tr.appendChild(idx);
  const specs = [
    ["evl-in-name", d.name, 200],
    ["evl-in-source", d.source, 200],
    ["evl-in-desc", d.description, 300],
    ["evl-in-pages", d.pages, 20],
  ];
  for (const [cls, val, maxLen] of specs) {
    const td = document.createElement("td");
    const inp = document.createElement("input");
    inp.className = `search-input ${cls}`;
    inp.type = "text";
    inp.maxLength = maxLen;
    inp.value = val != null ? String(val) : "";
    td.appendChild(inp);
    tr.appendChild(td);
  }
  return tr;
}

function ensureEvidenceListRowCount(minRows) {
  if (!evlRowsTbody) return;
  const target = Math.max(Number(minRows) || 0, DEFAULT_EVIDENCE_ROW_COUNT);
  while (evlRowsTbody.children.length < target) {
    evlRowsTbody.appendChild(makeEvidenceTableRow({}));
  }
  reindexEvidenceRows();
}

function initEvidenceListFormIfEmpty() {
  if (!evlRowsTbody) return;
  if (evlRowsTbody.children.length === 0) {
    ensureEvidenceListRowCount(DEFAULT_EVIDENCE_ROW_COUNT);
  }
  if (evlSubmissionDateEl && !String(evlSubmissionDateEl.value || "").trim()) {
    evlSubmissionDateEl.value = nowDateText();
  }
}

function collectEvidenceItemsFromDom() {
  if (!evlRowsTbody) return [];
  return Array.from(evlRowsTbody.querySelectorAll("tr")).map((tr) => ({
    name: String(tr.querySelector(".evl-in-name")?.value || "").trim(),
    source: String(tr.querySelector(".evl-in-source")?.value || "").trim(),
    description: String(tr.querySelector(".evl-in-desc")?.value || "").trim(),
    pages: String(tr.querySelector(".evl-in-pages")?.value || "").trim(),
  }));
}

function normalizeImportedCaseEvidenceRows(items) {
  const rows = Array.isArray(items) ? items : [];
  return rows
    .map((item) => {
      const name = String(item?.name || "").trim();
      if (!name) return null;
      const source = String(item?.source || "").trim();
      const description = String(item?.description || item?.note || "").trim();
      return {
        name,
        source,
        description,
        pages: "",
        submitter: String(item?.submitter || "").trim(),
        submission_date: String(item?.submission_date || "").trim(),
      };
    })
    .filter(Boolean);
}

function buildEvidenceLinesForTextareas(rows) {
  return rows
    .map((row, idx) => {
      const chunks = [`${idx + 1}. ${row.name}`];
      if (row.source) chunks.push(`来源：${row.source}`);
      if (row.description) chunks.push(`说明：${row.description}`);
      return chunks.join("；");
    })
    .join("\n");
}

function applyImportedEvidenceToDocumentForm(rawEvidenceItems) {
  const rows = normalizeImportedCaseEvidenceRows(rawEvidenceItems);
  if (!rows.length) return 0;
  clearAndFillEvidenceRows(rows);
  if (evlSubmitterNameEl && !String(evlSubmitterNameEl.value || "").trim()) {
    evlSubmitterNameEl.value = rows.find((row) => row.submitter)?.submitter || "";
  }
  if (evlSubmissionDateEl && !String(evlSubmissionDateEl.value || "").trim()) {
    evlSubmissionDateEl.value = rows.find((row) => row.submission_date)?.submission_date || nowDateText();
  }
  const evidenceLines = buildEvidenceLinesForTextareas(rows);
  if (evidenceLines) {
    if (evidenceListEl && !String(evidenceListEl.value || "").trim()) evidenceListEl.value = evidenceLines;
    if (civilEvidenceListEl && !String(civilEvidenceListEl.value || "").trim()) civilEvidenceListEl.value = evidenceLines;
    if (arbEvidenceListEl && !String(arbEvidenceListEl.value || "").trim()) arbEvidenceListEl.value = evidenceLines;
  }
  return rows.length;
}

function clearAndFillEvidenceRows(items) {
  if (!evlRowsTbody) return;
  evlRowsTbody.replaceChildren();
  const src = Array.isArray(items) && items.length ? items : Array.from({ length: DEFAULT_EVIDENCE_ROW_COUNT }, () => ({}));
  src.forEach((it) => evlRowsTbody.appendChild(makeEvidenceTableRow(it)));
  reindexEvidenceRows();
}

function nonemptyEvidenceRows(items) {
  return (items || []).filter((it) => it && Object.values(it).some((v) => String(v || "").trim()));
}

function computeEvidenceTotals(payload) {
  const itemsOverride = String(payload.total_items || "").trim();
  const pagesOverride = String(payload.total_pages || "").trim();
  const items = nonemptyEvidenceRows(payload.evidence_items);
  let pagesSum = 0;
  let hasNum = false;
  for (const it of items) {
    const p = parseInt(String(it.pages || "").replace(/\s/g, ""), 10);
    if (!Number.isNaN(p)) {
      pagesSum += p;
      hasNum = true;
    }
  }
  const n = items.length;
  const itemsDisplay = itemsOverride || (n ? String(n) : "\u3000");
  const pagesDisplay = pagesOverride || (hasNum ? String(pagesSum) : "\u3000");
  return { itemsDisplay, pagesDisplay };
}

function collectEvidenceListFormData() {
  return {
    templateId: "evidence_list",
    evidence_items: collectEvidenceItemsFromDom(),
    total_items: String(evlTotalItemsEl?.value || "").trim(),
    total_pages: String(evlTotalPagesEl?.value || "").trim(),
    submitter_name: String(evlSubmitterNameEl?.value || "").trim(),
    submission_date: String(evlSubmissionDateEl?.value || "").trim(),
    court_receiver: String(evlCourtReceiverEl?.value || "").trim(),
  };
}

function isEvidenceListFormEmpty() {
  const d = collectEvidenceListFormData();
  if (String(d.submitter_name || "").trim() || String(d.submission_date || "").trim()) return false;
  if (String(d.court_receiver || "").trim() || String(d.total_items || "").trim() || String(d.total_pages || "").trim()) return false;
  return !nonemptyEvidenceRows(d.evidence_items).length;
}

function mergeEvidenceListFormWithTemplate() {
  const data = collectEvidenceListFormData();
  const tpl = EVIDENCE_LIST_TEMPLATE_PAYLOAD;
  const mergedItems = data.evidence_items.map((it, idx) => {
    const t = tpl.evidence_items[Math.min(idx, tpl.evidence_items.length - 1)];
    return {
      name: String(it.name || "").trim() ? it.name : t.name,
      source: String(it.source || "").trim() ? it.source : t.source,
      description: String(it.description || "").trim() ? it.description : t.description,
      pages: String(it.pages || "").trim() ? it.pages : t.pages,
    };
  });
  return {
    templateId: "evidence_list",
    evidence_items: mergedItems.length ? mergedItems : tpl.evidence_items.map((r) => ({ ...r })),
    total_items: String(data.total_items || "").trim(),
    total_pages: String(data.total_pages || "").trim(),
    submitter_name: String(data.submitter_name || "").trim() ? data.submitter_name : tpl.submitter_name,
    submission_date: String(data.submission_date || "").trim() ? data.submission_date : tpl.submission_date,
    court_receiver: String(data.court_receiver || "").trim() ? data.court_receiver : tpl.court_receiver,
  };
}

function buildEvidenceListDocument(payload) {
  const p = payload || {};
  const label = getDocTypeLabel("evidence_list");
  const { itemsDisplay, pagesDisplay } = computeEvidenceTotals(p);
  const lines = [label, ""];
  const items = nonemptyEvidenceRows(p.evidence_items);
  items.forEach((it, i) => {
    lines.push(
      `${i + 1}. ${it.name || ""}\uff1b\u6765\u6e90\uff1a${it.source || ""}\uff1b\u8bf4\u660e\uff1a${it.description || ""}\uff1b\u9875\u6570\uff1a${it.pages || ""}`,
    );
  });
  lines.push("");
  lines.push(`\u8bc1\u636e\u5408\u5171 ${itemsDisplay} \u9879 ${pagesDisplay} \u9875\uff08\u4ee5\u4e0a\u6750\u6599\u5747\u4e3a\u590d\u5370\u4ef6\uff09`);
  lines.push("");
  lines.push(`\u63d0\u4ea4\u4eba\uff1a${p.submitter_name || "\u3000\u3000"}    \u65e5\u671f\uff1a${p.submission_date || ""}`);
  lines.push(`\u6cd5\u9662\u63a5\u6536\u4eba\uff1a${p.court_receiver || ""}`);
  return lines.join("\n");
}

function renderEvidenceListHtml(payload) {
  const rows = payload.evidence_items || [];
  const { itemsDisplay, pagesDisplay } = computeEvidenceTotals(payload);
  const v = (x) => {
    const t = String(x ?? "").trim();
    return t ? escapeHtml(t) : '<span class="doc-gen-cell-placeholder">\u3000</span>';
  };
  const bodyRows = rows
    .map(
      (it, idx) =>
        `<tr><td>${idx + 1}</td><td>${v(it.name)}</td><td>${v(it.source)}</td><td>${v(it.description)}</td><td>${v(
          it.pages,
        )}</td></tr>`,
    )
    .join("");
  const summary = `\u8bc1\u636e\u5408\u5171 ${escapeHtml(String(itemsDisplay))} \u9879 ${escapeHtml(String(pagesDisplay))} \u9875\uff08\u4ee5\u4e0a\u6750\u6599\u5747\u4e3a\u590d\u5370\u4ef6\uff09`;
  return `<article class="doc-gen-complaint-wrap" aria-label="\u8bc1\u636e\u6750\u6599\u6e05\u5355\u9884\u89c8">
  <h2 class="doc-gen-complaint-title">\u8bc1\u636e\u6750\u6599\u6e05\u5355</h2>
  <table class="doc-gen-evidence-edit-table doc-gen-evidence-preview-table">
    <thead><tr><th class="doc-gen-evl-col-idx">\u5e8f\u53f7</th><th>\u8bc1\u636e\u540d\u79f0</th><th>\u8bc1\u636e\u6765\u6e90</th><th>\u8bc1\u636e\u8bf4\u660e</th><th class="doc-gen-evl-col-pages">\u9875\u6570</th></tr></thead>
    <tbody>${bodyRows}<tr><td colspan="5">${summary}</td></tr></tbody>
  </table>
  <p class="doc-gen-civil-p doc-gen-evl-preview-sign"><strong>\u63d0\u4ea4\u4eba\uff1a</strong>${v(payload.submitter_name)}\u3000<strong>\u65e5\u671f\uff1a</strong>${v(payload.submission_date)}</p>
  <p class="doc-gen-civil-p doc-gen-evl-preview-sign"><strong>\u6cd5\u9662\u63a5\u6536\u4eba\uff1a</strong>${v(payload.court_receiver)}</p>
</article>`;
}

function mountEvidenceListPreview(payload, templateMode) {
  if (!docPreview) return;
  docPreview.classList.remove("doc-gen-preview--civil");
  docPreview.classList.add("doc-gen-preview--table");
  docPreview.innerHTML = renderEvidenceListHtml(payload);
  if (templateMode) {
    currentDocumentText = "";
    if (docGenWordCount) {
      docGenWordCount.textContent =
        "\u8868\u683c\u7248\u5f0f\u4e0e\u4e0b\u8f7d\u7684 Word \u4e00\u81f4\uff1b\u586b\u5199\u5b8c\u6574\u540e\u53ef\u4fdd\u5b58 Word \u6216 PDF\u3002";
    }
    return;
  }
  const text = buildEvidenceListDocument(payload);
  currentDocumentText = text;
  if (docGenWordCount) {
    const t = String(text || "").trim();
    docGenWordCount.textContent = t ? `\u7ea6 ${[...t].length} \u5b57\uff08\u542b\u6807\u70b9\uff09` : "";
  }
}

function refreshEvidenceListPreview() {
  if (activeTemplateId !== "evidence_list") return;
  const empty = isEvidenceListFormEmpty();
  const payload = empty
    ? {
        templateId: "evidence_list",
        evidence_items: EVIDENCE_LIST_TEMPLATE_PAYLOAD.evidence_items.map((r) => ({ ...r })),
        total_items: EVIDENCE_LIST_TEMPLATE_PAYLOAD.total_items,
        total_pages: EVIDENCE_LIST_TEMPLATE_PAYLOAD.total_pages,
        submitter_name: EVIDENCE_LIST_TEMPLATE_PAYLOAD.submitter_name,
        submission_date: EVIDENCE_LIST_TEMPLATE_PAYLOAD.submission_date,
        court_receiver: EVIDENCE_LIST_TEMPLATE_PAYLOAD.court_receiver,
      }
    : mergeEvidenceListFormWithTemplate();
  mountEvidenceListPreview(payload, empty);
}

function formatEvidenceBlock(raw) {
  const lines = splitLines(raw);
  if (!lines.length) return "";
  return "\n\n证据目录：\n" + lines.map((line, idx) => `${idx + 1}. ${line}`).join("\n");
}

function composeRegionAddress(province, city, district, detail) {
  return [province, city, district, detail].map((v) => String(v || "").trim()).filter(Boolean).join("");
}

function splitRegionAddress(raw) {
  const text = String(raw || "").trim();
  if (!text) return { province: "", city: "", district: "", detail: "" };
  const m = text.match(/^(.*?(?:省|自治区|特别行政区|市))(.*?(?:市|州|地区|盟))?(.*?(?:区|县|旗|市))?(.*)$/);
  if (!m) return { province: "", city: "", district: "", detail: text };
  return {
    province: String(m[1] || "").trim(),
    city: String(m[2] || "").trim(),
    district: String(m[3] || "").trim(),
    detail: String(m[4] || "").trim(),
  };
}

function resetSelectOptions(selectEl, placeholder) {
  if (!selectEl) return;
  selectEl.replaceChildren();
  const first = document.createElement("option");
  first.value = "";
  first.textContent = placeholder;
  selectEl.appendChild(first);
}

function appendSelectOptions(selectEl, names) {
  if (!selectEl) return;
  names.forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    selectEl.appendChild(opt);
  });
}

function pickChildrenByName(nodes, name) {
  if (!name) return [];
  const found = (nodes || []).find((item) => String(item?.name || "").trim() === String(name).trim());
  return Array.isArray(found?.children) ? found.children : [];
}

function setSelectValueWithFallback(selectEl, value) {
  if (!selectEl) return;
  const v = String(value || "").trim();
  if (!v) {
    selectEl.value = "";
    return;
  }
  const has = Array.from(selectEl.options).some((opt) => opt.value === v);
  if (!has) {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    selectEl.appendChild(opt);
  }
  selectEl.value = v;
}

async function loadRegionData() {
  try {
    const res = await fetch(REGION_DATA_URL, { cache: "force-cache" });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function bindRegionCascade({ provinceEl, cityEl, districtEl, data, onRegionUpdate } = {}) {
  if (!provinceEl || !cityEl || !districtEl) return;
  const provinces = Array.isArray(data) ? data : [];

  const refreshCities = (cityValue = "", districtValue = "") => {
    const cityNodes = pickChildrenByName(provinces, provinceEl.value);
    resetSelectOptions(cityEl, "选择城市");
    appendSelectOptions(
      cityEl,
      cityNodes.map((item) => item.name).filter(Boolean),
    );
    setSelectValueWithFallback(cityEl, cityValue);
    refreshDistricts(districtValue);
  };

  const refreshDistricts = (districtValue = "") => {
    const cityNodes = pickChildrenByName(provinces, provinceEl.value);
    const districtNodes = pickChildrenByName(cityNodes, cityEl.value);
    resetSelectOptions(districtEl, "选择区/县");
    appendSelectOptions(
      districtEl,
      districtNodes.map((item) => item.name).filter(Boolean),
    );
    setSelectValueWithFallback(districtEl, districtValue);
    onRegionUpdate?.();
  };

  provinceEl.addEventListener("change", () => refreshCities());
  cityEl.addEventListener("change", () => refreshDistricts());

  refreshCities(cityEl.value, districtEl.value);
}

function isLaborComplaintFormEmpty() {
  if (String(smartNarrativeEl?.value || "").trim()) return false;
  const data = collectFormData();
  const keys = [
    "applicant",
    "complainantGender",
    "complainantIdNumber",
    "complainantProvince",
    "complainantCity",
    "complainantDistrict",
    "complainantAddressDetail",
    "complainantPostalCode",
    "applicantPhone",
    "respondent",
    "respondentLegalRepresentative",
    "respondentContactName",
    "respondentContactJobTitle",
    "respondentRegisteredAddress",
    "respondentBusinessProvince",
    "respondentBusinessCity",
    "respondentBusinessDistrict",
    "respondentBusinessDetail",
    "respondentContactPhone",
    "respondentPostalCode",
    "claims",
    "facts",
    "evidenceList",
    "respondentBusinessRegion",
  ];
  return !keys.some((k) => String(data[k] || "").trim());
}

/** 未生成文书时仅展示范本，不视为已生成正文（导出按钮保持禁用） */
function showLaborComplaintTemplatePreview() {
  mountLaborComplaintTablePreview({ ...LABOR_COMPLAINT_TEMPLATE_PAYLOAD }, true);
}

/** 将已填字段与范本占位合并，左侧任意编辑时右侧表格都能即时反映 */
function mergeLaborComplaintFormWithTemplate() {
  const data = collectFormData();
  const tpl = LABOR_COMPLAINT_TEMPLATE_PAYLOAD;
  const out = { ...tpl };
  for (const key of Object.keys(tpl)) {
    const trimmed = String(data[key] ?? "").trim();
    if (trimmed) out[key] = data[key];
  }
  out.dateText = data.dateText;
  return out;
}

let docPreviewRaf = 0;
function scheduleDocPreviewSync() {
  cancelAnimationFrame(docPreviewRaf);
  docPreviewRaf = requestAnimationFrame(() => {
    docPreviewRaf = 0;
    refreshActiveDocumentPreview();
  });
}

function refreshActiveDocumentPreview() {
  if (activeTemplateId === "labor_security_inspection_complaint") refreshLaborComplaintPreview();
  else if (activeTemplateId === "civil_complaint") refreshCivilComplaintPreview();
  else if (activeTemplateId === "enforcement_application") refreshEnforcementApplicationPreview();
  else if (activeTemplateId === "labor_arbitration_application") refreshLaborArbitrationPreview();
  else if (activeTemplateId === "labor_mediation_application") refreshLaborMediationPreview();
  else if (activeTemplateId === "evidence_list") refreshEvidenceListPreview();
}

function scheduleLaborComplaintPreviewSync() {
  scheduleDocPreviewSync();
}

function collectCivilFormData() {
  return {
    templateId: "civil_complaint",
    plaintiff_name: String(civilPlaintiffNameEl?.value || "").trim(),
    plaintiff_gender: String(civilPlaintiffGenderEl?.value || "").trim(),
    plaintiff_ethnicity: String(civilPlaintiffEthnicityEl?.value || "").trim(),
    plaintiff_birth: String(civilPlaintiffBirthEl?.value || "").trim(),
    plaintiff_address: String(civilPlaintiffAddressEl?.value || "").trim(),
    plaintiff_id_number: String(civilPlaintiffIdNumberEl?.value || "").trim(),
    plaintiff_phone: String(civilPlaintiffPhoneEl?.value || "").trim(),
    defendant_name: String(civilDefendantNameEl?.value || "").trim(),
    defendant_address: String(civilDefendantAddressEl?.value || "").trim(),
    defendant_phone: String(civilDefendantPhoneEl?.value || "").trim(),
    defendant_legal_representative: String(civilDefendantLegalRepresentativeEl?.value || "").trim(),
    case_cause: String(civilCaseCauseEl?.value || "").trim(),
    claims: String(civilClaimsEl?.value || "").trim(),
    facts: String(civilFactsEl?.value || "").trim(),
    evidence_list: String(civilEvidenceListEl?.value || "").trim(),
    court_name: String(civilCourtNameEl?.value || "").trim(),
    dateText: nowDateText(),
  };
}

function isCivilComplaintFormEmpty() {
  const d = collectCivilFormData();
  const keys = [
    "plaintiff_name",
    "plaintiff_gender",
    "plaintiff_ethnicity",
    "plaintiff_birth",
    "plaintiff_address",
    "plaintiff_id_number",
    "plaintiff_phone",
    "defendant_name",
    "defendant_address",
    "defendant_phone",
    "defendant_legal_representative",
    "case_cause",
    "claims",
    "facts",
    "evidence_list",
    "court_name",
  ];
  return !keys.some((k) => String(d[k] || "").trim());
}

function mergeCivilComplaintFormWithTemplate() {
  const data = collectCivilFormData();
  const tpl = CIVIL_COMPLAINT_TEMPLATE_PAYLOAD;
  const out = { ...tpl };
  for (const key of Object.keys(tpl)) {
    const trimmed = String(data[key] ?? "").trim();
    if (trimmed) out[key] = data[key];
  }
  out.dateText = data.dateText;
  return out;
}

function collectEnforcementFormData() {
  return {
    templateId: "enforcement_application",
    applicant_name: String(enfApplicantNameEl?.value || "").trim(),
    applicant_gender: String(enfApplicantGenderEl?.value || "").trim(),
    applicant_ethnicity: String(enfApplicantEthnicityEl?.value || "").trim(),
    applicant_birth: String(enfApplicantBirthEl?.value || "").trim(),
    applicant_job: String(enfApplicantJobEl?.value || "").trim(),
    applicant_address: String(enfApplicantAddressEl?.value || "").trim(),
    applicant_id_number: String(enfApplicantIdNumberEl?.value || "").trim(),
    applicant_phone: String(enfApplicantPhoneEl?.value || "").trim(),
    legal_representative_line: String(enfLegalRepEl?.value || "").trim(),
    entrusted_agent_line: String(enfEntrustedAgentEl?.value || "").trim(),
    respondent_name: String(enfRespondentNameEl?.value || "").trim(),
    respondent_address: String(enfRespondentAddressEl?.value || "").trim(),
    respondent_phone: String(enfRespondentPhoneEl?.value || "").trim(),
    respondent_legal_representative: String(enfRespondentLegalRepresentativeEl?.value || "").trim(),
    case_cause: String(enfCaseCauseEl?.value || "").trim(),
    basis_judgment_no: String(enfBasisJudgmentNoEl?.value || "").trim(),
    basis_issuer: String(enfBasisIssuerEl?.value || "").trim(),
    basis_effective_date: String(enfBasisEffectiveDateEl?.value || "").trim(),
    basis_extra: String(enfBasisExtraEl?.value || "").trim(),
    basis_doc_type_phrase: String(enfBasisDocTypePhraseEl?.value || "").trim(),
    attachment_line: String(enfAttachmentLineEl?.value || "").trim(),
    requests: String(enfRequestsEl?.value || "").trim(),
    facts: String(enfFactsEl?.value || "").trim(),
    court_name: String(enfCourtNameEl?.value || "").trim(),
    dateText: nowDateText(),
  };
}

function isEnforcementApplicationFormEmpty() {
  const d = collectEnforcementFormData();
  const keys = [
    "applicant_name",
    "applicant_gender",
    "applicant_ethnicity",
    "applicant_birth",
    "applicant_address",
    "applicant_id_number",
    "applicant_phone",
    "respondent_name",
    "respondent_address",
    "respondent_phone",
    "respondent_legal_representative",
    "case_cause",
    "basis_judgment_no",
    "basis_issuer",
    "basis_effective_date",
    "basis_extra",
    "requests",
    "facts",
    "court_name",
  ];
  return !keys.some((k) => String(d[k] || "").trim());
}

function mergeEnforcementApplicationFormWithTemplate() {
  const data = collectEnforcementFormData();
  const tpl = ENFORCEMENT_APPLICATION_TEMPLATE_PAYLOAD;
  const out = { ...tpl };
  for (const key of Object.keys(tpl)) {
    const trimmed = String(data[key] ?? "").trim();
    if (trimmed) out[key] = data[key];
  }
  out.dateText = data.dateText;
  return out;
}

function collectLaborArbitrationFormData() {
  return {
    templateId: "labor_arbitration_application",
    applicant_name: String(arbApplicantNameEl?.value || "").trim(),
    applicant_gender: String(arbApplicantGenderEl?.value || "").trim(),
    applicant_ethnicity: String(arbApplicantEthnicityEl?.value || "").trim(),
    applicant_birth: String(arbApplicantBirthEl?.value || "").trim(),
    applicant_address: String(arbApplicantAddressEl?.value || "").trim(),
    applicant_id_type: String(arbApplicantIdTypeEl?.value || "").trim(),
    applicant_id_number: String(arbApplicantIdNumberEl?.value || "").trim(),
    applicant_job: String(arbApplicantJobEl?.value || "").trim(),
    applicant_phone: String(arbApplicantPhoneEl?.value || "").trim(),
    contract_performance_place: String(arbContractPerformancePlaceEl?.value || "").trim(),
    respondent_name: String(arbRespondentNameEl?.value || "").trim(),
    respondent_address: String(arbRespondentAddressEl?.value || "").trim(),
    respondent_phone: String(arbRespondentPhoneEl?.value || "").trim(),
    respondent_legal_representative: String(arbRespondentLegalRepresentativeEl?.value || "").trim(),
    respondent_legal_representative_job: String(arbRespondentLegalRepresentativeJobEl?.value || "").trim(),
    respondent_business_place: String(arbRespondentBusinessPlaceEl?.value || "").trim(),
    respondent_contact_person: String(arbRespondentContactPersonEl?.value || "").trim(),
    arbitration_commission: String(arbCommissionEl?.value || "").trim(),
    claims: String(arbClaimsEl?.value || "").trim(),
    facts: String(arbFactsEl?.value || "").trim(),
    evidence_list: String(arbEvidenceListEl?.value || "").trim(),
    agent_block: String(arbAgentBlockEl?.value || "").trim(),
    attachment_line: String(arbAttachmentLineEl?.value || "").trim(),
    dateText: nowDateText(),
  };
}

function isLaborArbitrationFormEmpty() {
  const d = collectLaborArbitrationFormData();
  const keys = [
    "applicant_name",
    "applicant_gender",
    "applicant_ethnicity",
    "applicant_birth",
    "applicant_address",
    "applicant_id_type",
    "applicant_id_number",
    "applicant_job",
    "applicant_phone",
    "contract_performance_place",
    "respondent_name",
    "respondent_address",
    "respondent_phone",
    "respondent_legal_representative",
    "arbitration_commission",
    "claims",
    "facts",
  ];
  return !keys.some((k) => String(d[k] || "").trim());
}

function mergeLaborArbitrationFormWithTemplate() {
  const data = collectLaborArbitrationFormData();
  const tpl = LABOR_ARBITRATION_TEMPLATE_PAYLOAD;
  const out = { ...tpl };
  for (const key of Object.keys(tpl)) {
    const trimmed = String(data[key] ?? "").trim();
    if (trimmed) out[key] = data[key];
  }
  out.dateText = data.dateText;
  return out;
}

function collectLaborMediationFormData() {
  return {
    templateId: "labor_mediation_application",
    applicant_name: String(medApplicantNameEl?.value || "").trim(),
    applicant_gender: String(medApplicantGenderEl?.value || "").trim(),
    applicant_ethnicity: String(medApplicantEthnicityEl?.value || "").trim(),
    applicant_birth: String(medApplicantBirthEl?.value || "").trim(),
    applicant_address: String(medApplicantAddressEl?.value || "").trim(),
    applicant_id_type: String(medApplicantIdTypeEl?.value || "").trim(),
    applicant_id_number: String(medApplicantIdNumberEl?.value || "").trim(),
    applicant_job: String(medApplicantJobEl?.value || "").trim(),
    applicant_phone: String(medApplicantPhoneEl?.value || "").trim(),
    contract_performance_place: String(medContractPerformancePlaceEl?.value || "").trim(),
    respondent_name: String(medRespondentNameEl?.value || "").trim(),
    respondent_address: String(medRespondentAddressEl?.value || "").trim(),
    respondent_phone: String(medRespondentPhoneEl?.value || "").trim(),
    respondent_legal_representative: String(medRespondentLegalRepresentativeEl?.value || "").trim(),
    respondent_business_place: String(medRespondentBusinessPlaceEl?.value || "").trim(),
    respondent_contact_person: String(medRespondentContactPersonEl?.value || "").trim(),
    claims: String(medClaimsEl?.value || "").trim(),
    facts: String(medFactsEl?.value || "").trim(),
    dateText: nowDateText(),
  };
}

function isLaborMediationFormEmpty() {
  const d = collectLaborMediationFormData();
  const keys = [
    "applicant_name",
    "applicant_gender",
    "applicant_ethnicity",
    "applicant_birth",
    "applicant_address",
    "applicant_id_type",
    "applicant_id_number",
    "applicant_job",
    "applicant_phone",
    "contract_performance_place",
    "respondent_name",
    "respondent_address",
    "respondent_phone",
    "respondent_legal_representative",
    "claims",
    "facts",
  ];
  return !keys.some((k) => String(d[k] || "").trim());
}

function mergeLaborMediationFormWithTemplate() {
  const data = collectLaborMediationFormData();
  const tpl = LABOR_MEDIATION_TEMPLATE_PAYLOAD;
  const out = { ...tpl };
  for (const key of Object.keys(tpl)) {
    const trimmed = String(data[key] ?? "").trim();
    if (trimmed) out[key] = data[key];
  }
  out.dateText = data.dateText;
  return out;
}

function formatLaborApplicantBlock(p) {
  const parts = [
    p.applicant_name && `姓名：${p.applicant_name}`,
    p.applicant_gender && `性别：${p.applicant_gender}`,
    p.applicant_ethnicity && `民族：${p.applicant_ethnicity}`,
    p.applicant_birth && `出生日期：${p.applicant_birth}`,
    p.applicant_address && `住址：${p.applicant_address}`,
    p.applicant_id_type && `身份证件类型：${p.applicant_id_type}`,
    p.applicant_id_number && `证件号码：${p.applicant_id_number}`,
    p.applicant_job && `工作单位及职务：${p.applicant_job}`,
    p.applicant_phone && `联系电话：${p.applicant_phone}`,
    p.contract_performance_place && `劳动合同履行地：${p.contract_performance_place}`,
  ].filter(Boolean);
  return parts.length ? parts.join("，") : "（请填写申请人信息）";
}

function formatLaborRespondentBlock(p) {
  const orgRep = String(p.respondent_legal_representative || "").trim();
  if (orgRep) {
    const parts = [
      p.respondent_name && `单位名称：${p.respondent_name}`,
      p.respondent_address && `住所地：${p.respondent_address}`,
      p.respondent_legal_representative_job
        ? `法定代表人/主要负责人：${orgRep}（${p.respondent_legal_representative_job}）`
        : `法定代表人/主要负责人：${orgRep}`,
      p.respondent_business_place && `办公地或经营地：${p.respondent_business_place}`,
      p.respondent_contact_person && `联系人：${p.respondent_contact_person}`,
      p.respondent_phone && `联系电话：${p.respondent_phone}`,
    ].filter(Boolean);
    return parts.length ? parts.join("，") : "（请填写被申请单位信息）";
  }
  const parts = [
    p.respondent_name && `姓名：${p.respondent_name}`,
    p.respondent_address && `住址：${p.respondent_address}`,
    p.respondent_contact_person && `联系人：${p.respondent_contact_person}`,
    p.respondent_phone && `联系电话：${p.respondent_phone}`,
  ].filter(Boolean);
  return parts.length ? parts.join("，") : "（请填写被申请人信息）";
}

/** 与法院申请执行书范文首行一致（申请执行人：……） */
function formatEnforcementApplicantOfficialLine(p) {
  const name = String(p.applicant_name || "").trim() || "×××";
  const gender = String(p.applicant_gender || "").trim() || "男/女";
  let birth = String(p.applicant_birth || "").trim() || "××××年××月××日";
  if (!birth.includes("出生")) birth = `${birth}出生`;
  let eth = String(p.applicant_ethnicity || "").trim() || "×";
  if (eth && !eth.endsWith("族")) eth = `${eth}族`;
  const job = String(p.applicant_job || "").trim();
  const jobPart = job ? `${job}，` : "……(写明工作单位和职务或者职业)，";
  const addr = String(p.applicant_address || "").trim() || "……";
  const idn = String(p.applicant_id_number || "").trim();
  const phone = String(p.applicant_phone || "").trim() || "……";
  let line = `${name}，${gender}，${birth}，${eth}，${jobPart}住${addr}。`;
  if (idn) line += `公民身份号码：${idn}。`;
  line += `联系方式：${phone}。`;
  return line;
}

/** 范文「被执行人：」后的正文（不含前缀） */
function formatEnforcementRespondentOfficialLine(p) {
  const orgRep = String(p.respondent_legal_representative || "").trim();
  const name = String(p.respondent_name || "").trim() || "×××";
  const addr = String(p.respondent_address || "").trim() || "……";
  const phone = String(p.respondent_phone || "").trim() || "……";
  if (orgRep) {
    return `${name}，住所地${addr}。法定代表人：${orgRep}。联系方式：${phone}。`;
  }
  return `${name}，住${addr}。联系方式：${phone}。`;
}

function formatEnforcementLegalRepLine(p) {
  const t = String(p.legal_representative_line || "").trim();
  return t || "无。";
}

function formatEnforcementEntrustedLine(p) {
  const t = String(p.entrusted_agent_line || "").trim();
  return t || "无。";
}

function formatEnforcementOpeningParagraph(p) {
  const an = String(p.applicant_name || "").trim() || "×××";
  const rn = String(p.respondent_name || "").trim() || "×××";
  const cause = String(p.case_cause || "").trim() || "（案由）";
  const issuer = String(p.basis_issuer || "").trim() || "××××人民法院";
  const jno = String(p.basis_judgment_no || "").trim() || "……号";
  const docPhrase =
    String(p.basis_doc_type_phrase || "").trim() || "民事判决（或其他生效法律文书）";
  const perf =
    String(p.enforcement_non_performance_phrase || "").trim() ||
    "未履行/未全部履行生效法律文书确定的给付义务";
  let core = `申请执行人${an}与被执行人${rn}……（${cause}）一案，${issuer}（${jno}）${docPhrase}已发生法律效力。被执行人${rn}${perf}，特向你院申请强制执行。`;
  const extra = String(p.basis_extra || "").trim();
  const facts = String(p.facts || "").trim();
  const parts = [core];
  if (extra) parts.push(extra);
  if (facts) parts.push(facts);
  return parts.length > 1 ? parts.join("\n\n") : core;
}

function formatEnforcementAttachmentLine(p) {
  const t = String(p.attachment_line || "").trim();
  return t || "附：生效法律文书壹份";
}

function buildEnforcementDocument(payload) {
  const p = payload || {};
  const reqList = splitLines(p.requests);
  const reqText = reqList.length
    ? reqList.map((line, idx) => `${idx + 1}. ${stripLeadingEnumeration(line)}`).join("\n")
    : "……(写明请求执行的内容)。";
  const applicantBody = formatEnforcementApplicantOfficialLine(p);
  const respondentBody = formatEnforcementRespondentOfficialLine(p);
  const opening = formatEnforcementOpeningParagraph(p);
  const attach = formatEnforcementAttachmentLine(p);
  return `${getDocTypeLabel("enforcement_application")}

申请执行人：${applicantBody}

法定代理人/指定代理人：${formatEnforcementLegalRepLine(p)}

委托诉讼代理人：${formatEnforcementEntrustedLine(p)}

被执行人：${respondentBody}

（以上写明申请执行人、被执行人和其他诉讼参加人的姓名或者名称等基本信息）

${opening}

请求事项

${reqText}

此致
${p.court_name || "××××人民法院"}

${attach}

申请执行人(签名或盖章)

${p.dateText || ""}`;
}

function renderEnforcementApplicationHtml(payload) {
  const v = (x) => {
    const t = String(x ?? "").trim();
    return t ? escapeHtml(t) : '<span class="doc-gen-cell-placeholder">　</span>';
  };
  const applicantBody = formatEnforcementApplicantOfficialLine(payload);
  const respondentBody = formatEnforcementRespondentOfficialLine(payload);
  const openingHtml = escapeHtml(formatEnforcementOpeningParagraph(payload)).replace(/\n/g, "<br>");
  const requestsHtml = formatClaimsParagraphsHtml(payload.requests).replace(
    /（请补充具体诉求）/g,
    "（请补充请求执行的内容）",
  );
  return `<article class="doc-gen-civil-wrap" aria-label="申请执行书预览">
  <h2 class="doc-gen-civil-title">${escapeHtml(getDocTypeLabel("enforcement_application"))}</h2>
  <p class="doc-gen-civil-p"><strong>申请执行人：</strong>${escapeHtml(applicantBody)}</p>
  <p class="doc-gen-civil-p"><strong>法定代理人/指定代理人：</strong>${escapeHtml(formatEnforcementLegalRepLine(payload))}</p>
  <p class="doc-gen-civil-p"><strong>委托诉讼代理人：</strong>${escapeHtml(formatEnforcementEntrustedLine(payload))}</p>
  <p class="doc-gen-civil-p"><strong>被执行人：</strong>${escapeHtml(respondentBody)}</p>
  <p class="doc-gen-civil-p doc-gen-civil-note">（以上写明申请执行人、被执行人和其他诉讼参加人的姓名或者名称等基本信息）</p>
  <div class="doc-gen-civil-section">
    <div class="doc-gen-civil-body">${openingHtml}</div>
  </div>
  <div class="doc-gen-civil-section">
    <h3 class="doc-gen-civil-h3">请求事项</h3>
    <div class="doc-gen-civil-body">${requestsHtml}</div>
  </div>
  <p class="doc-gen-civil-p doc-gen-civil-signoff"><strong>此致</strong></p>
  <p class="doc-gen-civil-p doc-gen-civil-court">${v(payload.court_name)}</p>
  <p class="doc-gen-civil-p">${escapeHtml(formatEnforcementAttachmentLine(payload))}</p>
  <p class="doc-gen-civil-p doc-gen-civil-sign"><strong>申请执行人(签名或盖章)</strong></p>
  <p class="doc-gen-civil-p doc-gen-civil-date">${v(payload.dateText)}</p>
</article>`;
}

function mountEnforcementApplicationPreview(payload, templateMode) {
  if (!docPreview) return;
  docPreview.classList.remove("doc-gen-preview--table");
  docPreview.classList.add("doc-gen-preview--civil");
  docPreview.innerHTML = renderEnforcementApplicationHtml(payload);
  if (templateMode) {
    currentDocumentText = "";
    if (docGenWordCount) {
      docGenWordCount.textContent =
        "与下载的 Word 模板一致；填写完整后可保存 Word 或 PDF。";
    }
    return;
  }
  const text = buildEnforcementDocument(payload);
  currentDocumentText = text;
  if (docGenWordCount) {
    const t = String(text || "").trim();
    docGenWordCount.textContent = t ? `约 ${[...t].length} 字（含标点）` : "";
  }
}

function refreshEnforcementApplicationPreview() {
  if (activeTemplateId !== "enforcement_application") return;
  const empty = isEnforcementApplicationFormEmpty();
  const payload = empty
    ? { ...ENFORCEMENT_APPLICATION_TEMPLATE_PAYLOAD }
    : mergeEnforcementApplicationFormWithTemplate();
  mountEnforcementApplicationPreview(payload, empty);
}

function buildLaborArbitrationDocument(payload) {
  const p = payload || {};
  const claimList = splitLines(p.claims);
  const reqText = claimList.length
    ? claimList.map((line, idx) => `${idx + 1}. ${stripLeadingEnumeration(line)}`).join("\n")
    : "1. （请补充仲裁请求）";
  const factsText = splitLines(p.facts).join("\n") || "（请补充事实与理由。）";
  const evLines = splitLines(p.evidence_list);
  const evText = evLines.length ? evLines.join("\n") : "（无）";
  const agentText = String(p.agent_block || "").trim() || "（无）";
  const attachmentText = String(p.attachment_line || "").trim() || "（无）";
  const applicantBlock = formatLaborApplicantBlock(p);
  const respondentBlock = formatLaborRespondentBlock(p);
  return `${getDocTypeLabel("labor_arbitration_application")}

申请人：${applicantBlock}

委托代理人：${agentText}

被申请人：${respondentBlock}

仲裁请求：
${reqText}

事实与理由：
${factsText}

证据和证据来源（如有）：
${evText}

附：
${attachmentText}

此致
${p.arbitration_commission || "（劳动人事争议仲裁委员会）"}

申请人：${p.applicant_name || "（签名）"}（签名）
${p.dateText || ""}`;
}

function renderLaborArbitrationHtml(payload) {
  const v = (x) => {
    const t = String(x ?? "").trim();
    return t ? escapeHtml(t) : '<span class="doc-gen-cell-placeholder">　</span>';
  };
  const claimsHtml = formatClaimsParagraphsHtml(payload.claims).replace(
    /（请补充具体诉求）/g,
    "（请补充仲裁请求）",
  );
  const factsHtml = formatFactsSectionHtml(payload.facts, "");
  const evHtml = formatFactsSectionHtml(payload.evidence_list, "");
  const legalRep = String(payload.respondent_legal_representative || "").trim();
  const legalRepJob = String(payload.respondent_legal_representative_job || "").trim();
  const legalRepMerged = legalRep
    ? `${legalRep}${legalRepJob ? `，${legalRepJob}` : ""}`
    : "";
  return `<article class="doc-gen-table-wrap" aria-label="劳动人事争议仲裁申请书预览">
  <h2 class="doc-gen-table-title">${escapeHtml(getDocTypeLabel("labor_arbitration_application"))}</h2>
  <table class="doc-gen-complaint-table doc-gen-labor-table" role="table" aria-label="劳动人事争议仲裁申请书表格">
    <tbody>
      <tr>
        <td class="doc-gen-td-side">申请人</td>
        <td class="doc-gen-td-lab">姓名</td>
        <td class="doc-gen-td-val" colspan="2">${v(payload.applicant_name)}</td>
        <td class="doc-gen-td-lab">性别</td>
        <td class="doc-gen-td-val">${v(payload.applicant_gender)}</td>
      </tr>
      <tr>
        <td class="doc-gen-td-side">申请人</td>
        <td class="doc-gen-td-lab">民族</td>
        <td class="doc-gen-td-val" colspan="2">${v(payload.applicant_ethnicity)}</td>
        <td class="doc-gen-td-lab">出生日期</td>
        <td class="doc-gen-td-val">${v(payload.applicant_birth)}</td>
      </tr>
      <tr>
        <td class="doc-gen-td-side">申请人</td>
        <td class="doc-gen-td-lab">身份证件类型及证件号码</td>
        <td class="doc-gen-td-val" colspan="3">${v(`${payload.applicant_id_type || ""}${payload.applicant_id_type && payload.applicant_id_number ? "：" : ""}${payload.applicant_id_number || ""}`)}</td>
        <td class="doc-gen-td-lab">联系电话</td>
      </tr>
      <tr>
        <td class="doc-gen-td-side">申请人</td>
        <td class="doc-gen-td-lab">联系电话</td>
        <td class="doc-gen-td-val" colspan="2">${v(payload.applicant_phone)}</td>
        <td class="doc-gen-td-lab">工作单位及职务</td>
        <td class="doc-gen-td-val">${v(payload.applicant_job)}</td>
      </tr>
      <tr>
        <td class="doc-gen-td-side">申请人</td>
        <td class="doc-gen-td-lab">通讯地址</td>
        <td class="doc-gen-td-val" colspan="4">${v(payload.applicant_address)}</td>
      </tr>
      <tr>
        <td class="doc-gen-td-side">申请人</td>
        <td class="doc-gen-td-lab">劳动合同履行地</td>
        <td class="doc-gen-td-val" colspan="4">${v(payload.contract_performance_place)}</td>
      </tr>
      <tr>
        <td class="doc-gen-td-side">被申请人</td>
        <td class="doc-gen-td-lab">单位名称</td>
        <td class="doc-gen-td-val" colspan="2">${v(payload.respondent_name)}</td>
        <td class="doc-gen-td-lab">法定代表人姓名及职务</td>
        <td class="doc-gen-td-val">${v(legalRepMerged)}</td>
      </tr>
      <tr>
        <td class="doc-gen-td-side">被申请人</td>
        <td class="doc-gen-td-lab">单位住所地</td>
        <td class="doc-gen-td-val" colspan="2">${v(payload.respondent_address)}</td>
        <td class="doc-gen-td-lab">办公地或经营地</td>
        <td class="doc-gen-td-val">${v(payload.respondent_business_place)}</td>
      </tr>
      <tr>
        <td class="doc-gen-td-side">被申请人</td>
        <td class="doc-gen-td-lab">联系人</td>
        <td class="doc-gen-td-val" colspan="2">${v(payload.respondent_contact_person)}</td>
        <td class="doc-gen-td-lab">联系电话</td>
        <td class="doc-gen-td-val">${v(payload.respondent_phone)}</td>
      </tr>
      <tr>
        <td class="doc-gen-td-section" colspan="6">
          <div class="doc-gen-section-label">请求事项：</div>
          <div class="doc-gen-section-body">${claimsHtml}</div>
        </td>
      </tr>
      <tr>
        <td class="doc-gen-td-section" colspan="6">
          <div class="doc-gen-section-label">事实和理由：</div>
          <div class="doc-gen-section-body">${factsHtml}</div>
        </td>
      </tr>
      <tr>
        <td class="doc-gen-td-section" colspan="6">
          <div class="doc-gen-section-label">证据和证据来源：</div>
          <div class="doc-gen-section-body">${evHtml || v("（无）")}</div>
        </td>
      </tr>
      <tr>
        <td class="doc-gen-td-section" colspan="6">
          <div class="doc-gen-section-label">委托代理人：</div>
          <div class="doc-gen-section-body">${v(payload.agent_block)}</div>
        </td>
      </tr>
      <tr>
        <td class="doc-gen-td-section" colspan="6">
          <div class="doc-gen-section-label">此致</div>
          <div class="doc-gen-section-body">${v(payload.arbitration_commission)}</div>
          <div class="doc-gen-sign-block">
            <p class="doc-gen-sign-line">申请人（签字）：${v(payload.applicant_name)}</p>
            <p class="doc-gen-date-line">${v(payload.dateText)}</p>
          </div>
        </td>
      </tr>
      <tr>
        <td class="doc-gen-td-section" colspan="6">
          <div class="doc-gen-section-label">附件：</div>
          <div class="doc-gen-section-body">${v(payload.attachment_line)}</div>
        </td>
      </tr>
    </tbody>
  </table>
</article>`;
}

function mountLaborArbitrationPreview(payload, templateMode) {
  if (!docPreview) return;
  docPreview.classList.remove("doc-gen-preview--civil");
  docPreview.classList.add("doc-gen-preview--table");
  docPreview.innerHTML = renderLaborArbitrationHtml(payload);
  if (templateMode) {
    currentDocumentText = "";
    if (docGenWordCount) {
      docGenWordCount.textContent =
        "与下载的 Word 模板一致；填写完整后可保存 Word 或 PDF。";
    }
    return;
  }
  const text = buildLaborArbitrationDocument(payload);
  currentDocumentText = text;
  if (docGenWordCount) {
    const t = String(text || "").trim();
    docGenWordCount.textContent = t ? `约 ${[...t].length} 字（含标点）` : "";
  }
}

function refreshLaborArbitrationPreview() {
  if (activeTemplateId !== "labor_arbitration_application") return;
  const empty = isLaborArbitrationFormEmpty();
  const payload = empty ? { ...LABOR_ARBITRATION_TEMPLATE_PAYLOAD } : mergeLaborArbitrationFormWithTemplate();
  mountLaborArbitrationPreview(payload, empty);
}

function buildLaborMediationDocument(payload) {
  const p = payload || {};
  const claimList = splitLines(p.claims);
  const reqText = claimList.length
    ? claimList.map((line, idx) => `${idx + 1}. ${stripLeadingEnumeration(line)}`).join("\n")
    : "1. （请补充调解请求）";
  const factsText = splitLines(p.facts).join("\n") || "（请补充事实与理由。）";
  const applicantBlock = formatLaborApplicantBlock(p);
  const respondentBlock = formatLaborRespondentBlock(p);
  return `${getDocTypeLabel("labor_mediation_application")}

申请人：${applicantBlock}

被申请人：${respondentBlock}

调解请求：
${reqText}

事实与理由：
${factsText}

申请人：${p.applicant_name || "（签名）"}（签名）
${p.dateText || ""}`;
}

function renderLaborMediationHtml(payload) {
  const v = (x) => {
    const t = String(x ?? "").trim();
    return t ? escapeHtml(t) : '<span class="doc-gen-cell-placeholder">　</span>';
  };
  const claimsHtml = formatClaimsParagraphsHtml(payload.claims).replace(
    /（请补充具体诉求）/g,
    "（请补充调解请求）",
  );
  const factsHtml = formatFactsSectionHtml(payload.facts, "");
  const legalRep = String(payload.respondent_legal_representative || "").trim();
  return `<article class="doc-gen-table-wrap" aria-label="劳动争议调解申请书预览">
  <h2 class="doc-gen-table-title">${escapeHtml(getDocTypeLabel("labor_mediation_application"))}</h2>
  <table class="doc-gen-complaint-table doc-gen-labor-table" role="table" aria-label="劳动争议调解申请书表格">
    <tbody>
      <tr>
        <td rowspan="6" class="doc-gen-td-side">申（被申）请人</td>
        <td class="doc-gen-td-lab">姓名</td>
        <td class="doc-gen-td-val" colspan="2">${v(payload.applicant_name)}</td>
        <td class="doc-gen-td-lab">性别</td>
        <td class="doc-gen-td-val">${v(payload.applicant_gender)}</td>
      </tr>
      <tr>
        <td class="doc-gen-td-lab">民族</td>
        <td class="doc-gen-td-val" colspan="2">${v(payload.applicant_ethnicity)}</td>
        <td class="doc-gen-td-lab">出生日期</td>
        <td class="doc-gen-td-val">${v(payload.applicant_birth)}</td>
      </tr>
      <tr>
        <td class="doc-gen-td-lab">身份证件类型及证件号码</td>
        <td class="doc-gen-td-val" colspan="4">${v(`${payload.applicant_id_type || ""}${payload.applicant_id_type && payload.applicant_id_number ? "：" : ""}${payload.applicant_id_number || ""}`)}</td>
      </tr>
      <tr>
        <td class="doc-gen-td-lab">工作单位及职务</td>
        <td class="doc-gen-td-val" colspan="2">${v(payload.applicant_job)}</td>
        <td class="doc-gen-td-lab">联系电话</td>
        <td class="doc-gen-td-val">${v(payload.applicant_phone)}</td>
      </tr>
      <tr>
        <td class="doc-gen-td-lab">通讯地址</td>
        <td class="doc-gen-td-val" colspan="4">${v(payload.applicant_address)}</td>
      </tr>
      <tr>
        <td class="doc-gen-td-lab">劳动合同履行地</td>
        <td class="doc-gen-td-val" colspan="4">${v(payload.contract_performance_place)}</td>
      </tr>
      <tr>
        <td rowspan="3" class="doc-gen-td-side">被申（申）请人</td>
        <td class="doc-gen-td-lab">单位名称</td>
        <td class="doc-gen-td-val" colspan="2">${v(payload.respondent_name)}</td>
        <td class="doc-gen-td-lab">法定代表人姓名及职务</td>
        <td class="doc-gen-td-val">${v(legalRep)}</td>
      </tr>
      <tr>
        <td class="doc-gen-td-lab">单位住所地</td>
        <td class="doc-gen-td-val" colspan="2">${v(payload.respondent_address)}</td>
        <td class="doc-gen-td-lab">办公地或经营地</td>
        <td class="doc-gen-td-val">${v(payload.respondent_business_place)}</td>
      </tr>
      <tr>
        <td class="doc-gen-td-lab">联系人</td>
        <td class="doc-gen-td-val" colspan="2">${v(payload.respondent_contact_person)}</td>
        <td class="doc-gen-td-lab">联系电话</td>
        <td class="doc-gen-td-val">${v(payload.respondent_phone)}</td>
      </tr>
      <tr>
        <td class="doc-gen-td-section" colspan="6">
          <div class="doc-gen-section-label">请求事项：</div>
          <div class="doc-gen-section-body">${claimsHtml}</div>
        </td>
      </tr>
      <tr>
        <td class="doc-gen-td-section" colspan="6">
          <div class="doc-gen-section-label">事实和理由：</div>
          <div class="doc-gen-section-body">${factsHtml}</div>
        </td>
      </tr>
      <tr>
        <td class="doc-gen-td-section" colspan="6">
          <div class="doc-gen-sign-block">
            <p class="doc-gen-sign-line">申请人（签字）：${v(payload.applicant_name)}</p>
            <p class="doc-gen-date-line">${v(payload.dateText)}</p>
          </div>
        </td>
      </tr>
    </tbody>
  </table>
</article>`;
}

function mountLaborMediationPreview(payload, templateMode) {
  if (!docPreview) return;
  docPreview.classList.remove("doc-gen-preview--civil");
  docPreview.classList.add("doc-gen-preview--table");
  docPreview.innerHTML = renderLaborMediationHtml(payload);
  if (templateMode) {
    currentDocumentText = "";
    if (docGenWordCount) {
      docGenWordCount.textContent =
        "与下载的 Word 模板一致；填写完整后可保存 Word 或 PDF。";
    }
    return;
  }
  const text = buildLaborMediationDocument(payload);
  currentDocumentText = text;
  if (docGenWordCount) {
    const t = String(text || "").trim();
    docGenWordCount.textContent = t ? `约 ${[...t].length} 字（含标点）` : "";
  }
}

function refreshLaborMediationPreview() {
  if (activeTemplateId !== "labor_mediation_application") return;
  const empty = isLaborMediationFormEmpty();
  const payload = empty ? { ...LABOR_MEDIATION_TEMPLATE_PAYLOAD } : mergeLaborMediationFormWithTemplate();
  mountLaborMediationPreview(payload, empty);
}

function refreshCivilComplaintPreview() {
  if (activeTemplateId !== "civil_complaint") return;
  const empty = isCivilComplaintFormEmpty();
  const payload = empty ? { ...CIVIL_COMPLAINT_TEMPLATE_PAYLOAD } : mergeCivilComplaintFormWithTemplate();
  mountCivilComplaintPreview(payload, empty);
}

function buildCivilDocument(payload) {
  const p = payload || {};
  const claimList = splitLines(p.claims);
  const claimText = claimList.length
    ? claimList.map((line, idx) => `${idx + 1}. ${stripLeadingEnumeration(line)}`).join("\n")
    : "1. （请补充诉讼请求）";
  const factsText = splitLines(p.facts).join("\n") || "（请补充事实与理由。）";
  const ev = formatEvidenceBlock(p.evidence_list);
  const plaintiffLine = [
    p.plaintiff_name && `姓名：${p.plaintiff_name}`,
    p.plaintiff_gender && `性别：${p.plaintiff_gender}`,
    p.plaintiff_ethnicity && `民族：${p.plaintiff_ethnicity}`,
    p.plaintiff_birth && `出生日期：${p.plaintiff_birth}`,
    p.plaintiff_address && `住址：${p.plaintiff_address}`,
    p.plaintiff_id_number && `公民身份号码：${p.plaintiff_id_number}`,
    p.plaintiff_phone && `联系电话：${p.plaintiff_phone}`,
  ]
    .filter(Boolean)
    .join("，");
  let defendantBlock = "";
  if (String(p.defendant_legal_representative || "").trim()) {
    defendantBlock = [
      p.defendant_name && `单位名称：${p.defendant_name}`,
      p.defendant_address && `住所地：${p.defendant_address}`,
      `法定代表人/主要负责人：${p.defendant_legal_representative}`,
      p.defendant_phone && `联系电话：${p.defendant_phone}`,
    ]
      .filter(Boolean)
      .join("，");
  } else {
    defendantBlock = [
      p.defendant_name && `姓名：${p.defendant_name}`,
      p.defendant_address && `住址：${p.defendant_address}`,
      p.defendant_phone && `联系电话：${p.defendant_phone}`,
    ]
      .filter(Boolean)
      .join("，");
  }
  return `${getDocTypeLabel("civil_complaint")}

原告：${plaintiffLine || "（原告信息）"}

被告：${defendantBlock || "（被告信息）"}

案由：${p.case_cause || "（案由）"}

诉讼请求：
${claimText}

事实与理由：
${factsText}${ev}

此致
${p.court_name || "（人民法院）"}

具状人：${p.plaintiff_name || "（签名）"}
${p.dateText || ""}`;
}

function renderCivilComplaintHtml(payload) {
  const v = (x) => {
    const t = String(x ?? "").trim();
    return t ? escapeHtml(t) : '<span class="doc-gen-cell-placeholder">　</span>';
  };
  const claimsHtml = formatClaimsParagraphsHtml(payload.claims);
  const factsHtml = formatFactsSectionHtml(payload.facts, payload.evidence_list);
  const plaintiffLine = [
    payload.plaintiff_name && `姓名：${escapeHtml(payload.plaintiff_name)}`,
    payload.plaintiff_gender && `性别：${escapeHtml(payload.plaintiff_gender)}`,
    payload.plaintiff_ethnicity && `民族：${escapeHtml(payload.plaintiff_ethnicity)}`,
    payload.plaintiff_birth && `出生日期：${escapeHtml(payload.plaintiff_birth)}`,
    payload.plaintiff_address && `住址：${escapeHtml(payload.plaintiff_address)}`,
    payload.plaintiff_id_number && `公民身份号码：${escapeHtml(payload.plaintiff_id_number)}`,
    payload.plaintiff_phone && `联系电话：${escapeHtml(payload.plaintiff_phone)}`,
  ]
    .filter(Boolean)
    .join("，");
  let defLine = "";
  if (String(payload.defendant_legal_representative || "").trim()) {
    defLine = [
      payload.defendant_name && `单位名称：${escapeHtml(payload.defendant_name)}`,
      payload.defendant_address && `住所地：${escapeHtml(payload.defendant_address)}`,
      `法定代表人/主要负责人：${escapeHtml(payload.defendant_legal_representative)}`,
      payload.defendant_phone && `联系电话：${escapeHtml(payload.defendant_phone)}`,
    ]
      .filter(Boolean)
      .join("，");
  } else {
    defLine = [
      payload.defendant_name && `姓名：${escapeHtml(payload.defendant_name)}`,
      payload.defendant_address && `住址：${escapeHtml(payload.defendant_address)}`,
      payload.defendant_phone && `联系电话：${escapeHtml(payload.defendant_phone)}`,
    ]
      .filter(Boolean)
      .join("，");
  }
  return `<article class="doc-gen-civil-wrap" aria-label="民事起诉状预览">
  <h2 class="doc-gen-civil-title">${escapeHtml(getDocTypeLabel("civil_complaint"))}</h2>
  <p class="doc-gen-civil-p"><strong>原告：</strong>${plaintiffLine || v("")}</p>
  <p class="doc-gen-civil-p"><strong>被告：</strong>${defLine || v("")}</p>
  <p class="doc-gen-civil-p"><strong>案由：</strong>${v(payload.case_cause)}</p>
  <div class="doc-gen-civil-section">
    <h3 class="doc-gen-civil-h3">诉讼请求</h3>
    <div class="doc-gen-civil-body">${claimsHtml}</div>
  </div>
  <div class="doc-gen-civil-section">
    <h3 class="doc-gen-civil-h3">事实与理由</h3>
    <div class="doc-gen-civil-body">${factsHtml}</div>
  </div>
  <p class="doc-gen-civil-p doc-gen-civil-signoff"><strong>此致</strong></p>
  <p class="doc-gen-civil-p doc-gen-civil-court">${v(payload.court_name)}</p>
  <p class="doc-gen-civil-p doc-gen-civil-sign"><strong>具状人：</strong>${v(payload.plaintiff_name)}（签字）</p>
  <p class="doc-gen-civil-p doc-gen-civil-date">${v(payload.dateText)}</p>
</article>`;
}

function mountCivilComplaintPreview(payload, templateMode) {
  if (!docPreview) return;
  docPreview.classList.remove("doc-gen-preview--table");
  docPreview.classList.add("doc-gen-preview--civil");
  docPreview.innerHTML = renderCivilComplaintHtml(payload);
  if (templateMode) {
    currentDocumentText = "";
    if (docGenWordCount) {
      docGenWordCount.textContent =
        "与下载的 Word 模板一致；填写完整后可保存 Word 或 PDF。";
    }
    return;
  }
  const text = buildCivilDocument(payload);
  currentDocumentText = text;
  if (docGenWordCount) {
    const t = String(text || "").trim();
    docGenWordCount.textContent = t ? `约 ${[...t].length} 字（含标点）` : "";
  }
}

function refreshLaborComplaintPreview() {
  if (activeTemplateId !== "labor_security_inspection_complaint") return;
  const empty = isLaborComplaintFormEmpty();
  const payload = empty ? { ...LABOR_COMPLAINT_TEMPLATE_PAYLOAD } : mergeLaborComplaintFormWithTemplate();
  mountLaborComplaintTablePreview(payload, empty);
}

function buildDocument(payload) {
  const {
    applicant,
    complainantGender,
    complainantIdNumber,
    complainantAddress,
    complainantPostalCode,
    applicantPhone,
    respondent,
    respondentLegalRepresentative,
    respondentContactName,
    respondentContactJobTitle,
    respondentRegisteredAddress,
    respondentBusinessAddress,
    respondentContactPhone,
    respondentPostalCode,
    claims,
    facts,
    dateText,
    evidenceList,
  } = payload;
  const claimList = splitLines(claims);
  const claimText = claimList.length
    ? claimList
        .map((line, idx) => `${idx + 1}. ${stripLeadingEnumeration(line)}`)
        .join("\n")
    : "1. （请补充具体诉求）";
  const factsText =
    splitLines(facts).join("\n") || "（请补充事实与理由，可写明入职时间、岗位、工资及争议经过。）";
  const evidBlock = formatEvidenceBlock(evidenceList);
  return `${getDocTypeLabel("labor_security_inspection_complaint")}

投诉人：${applicant}
性别：${complainantGender}
身份证件号：${complainantIdNumber}
联系电话：${applicantPhone}
通讯地址：${complainantAddress}
邮编：${complainantPostalCode}

被投诉单位：${respondent}
注册地址：${respondentRegisteredAddress}
实际经营地址：${respondentBusinessAddress}
法定代表人（主要负责人）：${respondentLegalRepresentative}
联系人：${respondentContactName}
职务：${respondentContactJobTitle}
联系电话：${respondentContactPhone}
邮编：${respondentPostalCode}

投诉请求：
${claimText}

事实与理由：
${factsText}${evidBlock}

投诉人：${applicant}
${dateText}`;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatClaimsParagraphsHtml(claims) {
  const claimList = splitLines(claims);
  if (!claimList.length) return escapeHtml("1. （请补充具体诉求）");
  return claimList
    .map((line, idx) => `${idx + 1}. ${escapeHtml(stripLeadingEnumeration(line))}`)
    .join("<br>");
}

function formatFactsSectionHtml(facts, evidenceList) {
  const factsLines = splitLines(facts);
  const factsCore = factsLines.length
    ? factsLines.map((l) => escapeHtml(l)).join("<br>")
    : escapeHtml("（请补充事实与理由，可写明入职时间、岗位、工资及争议经过。）");
  const evLines = splitLines(evidenceList);
  if (!evLines.length) return factsCore;
  const evBody = evLines.map((line, idx) => `${idx + 1}. ${escapeHtml(line)}`).join("<br>");
  return `${factsCore}<br><br><strong>证据目录：</strong><br>${evBody}`;
}

/**
 * 与 backend/docx 模板 `Labor Security Inspection Complaint Form.docx` 首表结构对齐的 HTML 预览。
 */
function renderLaborComplaintTableHtml(payload) {
  const v = (x) => {
    const t = String(x ?? "").trim();
    return t ? escapeHtml(t) : '<span class="doc-gen-cell-placeholder">　</span>';
  };
  const landline = v(payload.complainantLandline);
  const labLegal = "法定代表人<br>（主要负责人）<br>姓　　名";
  const labName = "名　称<br>（姓　名）";
  const claimsHtml = formatClaimsParagraphsHtml(payload.claims);
  const factsHtml = formatFactsSectionHtml(payload.facts, payload.evidenceList);

  return `<article class="doc-gen-complaint-wrap" aria-label="劳动保障监察投诉书预览">
  <h2 class="doc-gen-complaint-title">劳动保障监察投诉书</h2>
  <table class="doc-gen-complaint-table">
    <tbody>
      <tr>
        <td rowspan="3" class="doc-gen-td-side">投诉人</td>
        <td class="doc-gen-td-lab">姓　名</td>
        <td class="doc-gen-td-val">${v(payload.applicant)}</td>
        <td class="doc-gen-td-lab">性别</td>
        <td class="doc-gen-td-val">${v(payload.complainantGender)}</td>
        <td class="doc-gen-td-lab">手机号码</td>
        <td class="doc-gen-td-val">${v(payload.applicantPhone)}</td>
      </tr>
      <tr>
        <td class="doc-gen-td-lab">身份证件号</td>
        <td class="doc-gen-td-val">${v(payload.complainantIdNumber)}</td>
        <td class="doc-gen-td-empty" colspan="2"></td>
        <td class="doc-gen-td-lab">固定电话</td>
        <td class="doc-gen-td-val">${landline}</td>
      </tr>
      <tr>
        <td class="doc-gen-td-lab">通讯地址</td>
        <td class="doc-gen-td-val" colspan="3">${v(payload.complainantAddress)}</td>
        <td class="doc-gen-td-lab">邮　编</td>
        <td class="doc-gen-td-val">${v(payload.complainantPostalCode)}</td>
      </tr>
      <tr>
        <td rowspan="4" class="doc-gen-td-side">被投诉人</td>
        <td rowspan="2" class="doc-gen-td-lab">${labName}</td>
        <td rowspan="2" class="doc-gen-td-val" colspan="3">${v(payload.respondent)}</td>
        <td class="doc-gen-td-lab">注册地址</td>
        <td class="doc-gen-td-val">${v(payload.respondentRegisteredAddress)}</td>
      </tr>
      <tr>
        <td class="doc-gen-td-lab">实际经营地址</td>
        <td class="doc-gen-td-val">${v(payload.respondentBusinessAddress)}</td>
      </tr>
      <tr>
        <td rowspan="2" class="doc-gen-td-lab">${labLegal}</td>
        <td rowspan="2" class="doc-gen-td-val">${v(payload.respondentLegalRepresentative)}</td>
        <td rowspan="2" class="doc-gen-td-lab">职务</td>
        <td rowspan="2" class="doc-gen-td-val">${v(payload.respondentContactJobTitle)}</td>
        <td class="doc-gen-td-lab">联系电话</td>
        <td class="doc-gen-td-val">${v(payload.respondentContactPhone)}</td>
      </tr>
      <tr>
        <td class="doc-gen-td-lab">邮　编</td>
        <td class="doc-gen-td-val">${v(payload.respondentPostalCode)}</td>
      </tr>
      <tr>
        <td class="doc-gen-td-section" colspan="7">
          <div class="doc-gen-section-label">请求事项：</div>
          <div class="doc-gen-section-body">${claimsHtml}</div>
        </td>
      </tr>
      <tr>
        <td class="doc-gen-td-section" colspan="7">
          <div class="doc-gen-section-label">事实与理由：</div>
          <div class="doc-gen-section-body">${factsHtml}</div>
        </td>
      </tr>
      <tr>
        <td class="doc-gen-td-notice" colspan="7">
          <div class="doc-gen-notice-title">说明：</div>
          <ol class="doc-gen-notice-list">
            <li>劳动保障监察机构对投诉人无法律规定的保密义务。投诉人坚持要求对其身份及投诉内容予以保密的，按举报办理。</li>
            <li>投诉人应当如实陈述，所提供的信息、证据等材料必须真实有效；送达地址为法律文书的有效送达地址；因未提供正确送达地址导致法律文书无法送达的，相应法律后果由投诉人自行承担。</li>
            <li>本监察机构无管辖权的，将通过「江苏省劳动保障监察举报投诉平台」转交有管辖权的劳动保障监察机构处理。有管辖权的机构实际收到投诉材料的日期为立案日期。</li>
            <li>涉及案前调解的，调解不成的，以调解结束之日为立案日期。</li>
          </ol>
        </td>
      </tr>
      <tr>
        <td class="doc-gen-td-declaration" colspan="7">
          <p class="doc-gen-declaration-main">
            本人已阅读并认可以上说明。本人（申请　/　不申请）案前调解。
          </p>
          <p class="doc-gen-declaration-hint">（请按照上述内容抄写一遍）</p>
          <div class="doc-gen-sign-block">
            <p class="doc-gen-sign-line">投诉人（签名）：<span class="doc-gen-sign-rule"></span></p>
            <p class="doc-gen-date-line">　　　　年　　月　　日</p>
          </div>
        </td>
      </tr>
    </tbody>
  </table>
  <div class="doc-gen-fill-requirements" aria-hidden="true">
    <p class="doc-gen-fill-req-title">填写要求：</p>
    <ol class="doc-gen-fill-req-list">
      <li>应当用钢笔、签字笔填写或打印机打印。</li>
      <li>请求事项应当简明扼要写明具体要求。</li>
    </ol>
  </div>
</article>`;
}

function mountLaborComplaintTablePreview(payload, templateMode) {
  if (!docPreview) return;
  docPreview.classList.remove("doc-gen-preview--civil");
  docPreview.classList.add("doc-gen-preview--table");
  docPreview.innerHTML = renderLaborComplaintTableHtml(payload);
  if (templateMode) {
    currentDocumentText = "";
    if (docGenWordCount) {
      docGenWordCount.textContent =
        "表格版式与下载的 Word 模板一致；填写完整后可保存 Word 或 PDF。";
    }
    return;
  }
  const text = buildDocument(payload);
  currentDocumentText = text;
  if (docGenWordCount) {
    const t = String(text || "").trim();
    docGenWordCount.textContent = t ? `约 ${[...t].length} 字（含标点）` : "";
  }
}

function renderPreview(text) {
  if (!docPreview) return;
  docPreview.classList.remove("doc-gen-preview--table", "doc-gen-preview--civil");
  docPreview.textContent = text;
  currentDocumentText = text;
  if (docGenWordCount) {
    const t = String(text || "").trim();
    docGenWordCount.textContent = t ? `约 ${[...t].length} 字（含标点）` : "";
  }
}

function setStatus(text) {
  if (docGenStatus) {
    docGenStatus.textContent = text || "";
  }
}

function renderEmptyTemplatePanel(templateLabel) {
  if (!docGenScrollArea) return;
  docGenScrollArea.replaceChildren();
  const section = document.createElement("section");
  section.className = "doc-gen-block doc-gen-page is-active";
  section.setAttribute("data-page", "1");
  section.setAttribute("aria-label", "模板字段");
  section.innerHTML = `<p class="detail-empty">${templateLabel ? `已选择「${templateLabel}」，字段配置暂未接入。` : "请先选择一个文书模板。"} </p>`;
  docGenScrollArea.appendChild(section);
}

function setActiveTemplate(templateId) {
  activeTemplateId = String(templateId || "").trim();
  const label = TEMPLATE_OPTIONS.find((t) => t.id === activeTemplateId)?.label || "";
  toggleTemplatePanels(activeTemplateId);
  if (activeTemplateId === "labor_security_inspection_complaint") {
    setStatus("");
    switchFormPage(1);
    refreshLaborComplaintPreview();
    return;
  }
  if (activeTemplateId === "civil_complaint") {
    setStatus("");
    switchFormPage(1);
    refreshCivilComplaintPreview();
    return;
  }
  if (activeTemplateId === "enforcement_application") {
    setStatus("");
    switchFormPage(1);
    refreshEnforcementApplicationPreview();
    return;
  }
  if (activeTemplateId === "labor_arbitration_application") {
    setStatus("");
    switchFormPage(1);
    refreshLaborArbitrationPreview();
    return;
  }
  if (activeTemplateId === "labor_mediation_application") {
    setStatus("");
    switchFormPage(1);
    refreshLaborMediationPreview();
    return;
  }
  if (activeTemplateId === "evidence_list") {
    setStatus("");
    initEvidenceListFormIfEmpty();
    switchFormPage(1);
    refreshEvidenceListPreview();
    return;
  }
  renderEmptyTemplatePanel(label);
  renderPreview("");
  setStatus(label ? `已切换模板：${label}。` : "");
}

function switchFormPage(page) {
  const maxPages = getTotalFormPages();
  const p = Math.max(1, Math.min(maxPages, Number(page) || 1));
  currentFormPage = p;
  getDocGenPages().forEach((section) => {
    const sectionPage = Number(section.getAttribute("data-page") || "1");
    section.classList.toggle("is-active", sectionPage === p);
  });
  if (prevPageBtn) prevPageBtn.disabled = p <= 1;
  if (nextPageBtn) nextPageBtn.disabled = p >= maxPages;
  if (docGenPageIndicator) docGenPageIndicator.textContent = `第 ${p} 页 / 共 ${maxPages} 页`;
  if (docGenScrollArea) docGenScrollArea.scrollTop = 0;
}

function collectFormData() {
  if (activeTemplateId === "civil_complaint") {
    return collectCivilFormData();
  }
  if (activeTemplateId === "enforcement_application") {
    return collectEnforcementFormData();
  }
  if (activeTemplateId === "labor_arbitration_application") {
    return collectLaborArbitrationFormData();
  }
  if (activeTemplateId === "labor_mediation_application") {
    return collectLaborMediationFormData();
  }
  if (activeTemplateId === "evidence_list") {
    return collectEvidenceListFormData();
  }
  const respondentBusinessRegionText = String(respondentBusinessRegionEl?.value || "").trim();
  return {
    templateId: "labor_security_inspection_complaint",
    type: "complaint",
    applicant: String(applicantEl?.value || "").trim(),
    complainantGender: String(complainantGenderEl?.value || "").trim(),
    complainantIdNumber: String(complainantIdNumberEl?.value || "").trim(),
    complainantProvince: String(complainantProvinceEl?.value || "").trim(),
    complainantCity: String(complainantCityEl?.value || "").trim(),
    complainantDistrict: String(complainantDistrictEl?.value || "").trim(),
    complainantAddressDetail: String(complainantAddressDetailEl?.value || "").trim(),
    complainantAddress: composeRegionAddress(
      complainantProvinceEl?.value,
      complainantCityEl?.value,
      complainantDistrictEl?.value,
      complainantAddressDetailEl?.value,
    ),
    complainantPostalCode: String(complainantPostalCodeEl?.value || "").trim(),
    applicantPhone: String(applicantPhoneEl?.value || "").trim(),
    complainantLandline: String(applicantProfileDefaults.landline_phone || "").trim(),
    respondent: String(respondentEl?.value || "").trim(),
    respondentLegalRepresentative: String(respondentLegalRepresentativeEl?.value || "").trim(),
    respondentContactName: String(respondentContactNameEl?.value || "").trim(),
    respondentContactJobTitle: String(respondentContactJobTitleEl?.value || "").trim(),
    respondentRegisteredAddress: String(respondentRegisteredAddressEl?.value || "").trim(),
    respondentBusinessProvince: String(respondentBusinessProvinceEl?.value || "").trim(),
    respondentBusinessCity: String(respondentBusinessCityEl?.value || "").trim(),
    respondentBusinessDistrict: String(respondentBusinessDistrictEl?.value || "").trim(),
    respondentBusinessRegion: respondentBusinessRegionText,
    respondentBusinessDetail: String(respondentBusinessDetailEl?.value || "").trim(),
    respondentBusinessAddress:
      (respondentBusinessRegionText ||
        composeRegionAddress(
          respondentBusinessProvinceEl?.value,
          respondentBusinessCityEl?.value,
          respondentBusinessDistrictEl?.value,
          "",
        )) + String(respondentBusinessDetailEl?.value || "").trim(),
    respondentContactPhone: String(respondentContactPhoneEl?.value || "").trim(),
    respondentPostalCode: String(respondentPostalCodeEl?.value || "").trim(),
    claims: String(claimsEl?.value || "").trim(),
    facts: String(factsEl?.value || "").trim(),
    evidenceList: String(evidenceListEl?.value || "").trim(),
    dateText: nowDateText(),
  };
}

function normalizeProfileUser(user) {
  const profile = user || {};
  return {
    name: String(profile.name || "").trim(),
    gender: String(profile.gender || "").trim(),
    phone: String(profile.phone || "").trim(),
    email: String(profile.email || "").trim(),
    id_card: String(profile.id_card || "").trim(),
    region: String(profile.region || "").trim(),
    home_addr: String(profile.home_addr || "").trim(),
    occupation: String(profile.occupation || profile.job || "").trim(),
    school: String(profile.school || "").trim(),
    birth_date: String(profile.birth_date || "").trim(),
    ethnicity: String(profile.ethnicity || "").trim(),
    postal_code: String(profile.postal_code || "").trim(),
    landline_phone: String(profile.landline_phone || "").trim(),
  };
}

function setFieldDefault(el, value, force = false) {
  if (!el) return;
  const next = String(value || "").trim();
  if (!next) return;
  if (force || !String(el.value || "").trim()) {
    el.value = next;
  }
}

function applyApplicantDefaultsFromProfile(user, force = false) {
  const profile = normalizeProfileUser(user);
  Object.assign(applicantProfileDefaults, profile);

  const fullAddress = `${profile.region}${profile.home_addr}`.trim();
  const parsedRegion = splitRegionAddress(profile.region);

  setFieldDefault(applicantEl, profile.name, force);
  setFieldDefault(complainantGenderEl, profile.gender, force);
  setFieldDefault(applicantPhoneEl, profile.phone, force);
  setFieldDefault(complainantIdNumberEl, profile.id_card, force);
  setFieldDefault(complainantPostalCodeEl, profile.postal_code, force);
  if (complainantProvinceEl) setSelectValueWithFallback(complainantProvinceEl, parsedRegion.province || complainantProvinceEl.value);
  if (complainantCityEl) setSelectValueWithFallback(complainantCityEl, parsedRegion.city || complainantCityEl.value);
  if (complainantDistrictEl) {
    setSelectValueWithFallback(complainantDistrictEl, parsedRegion.district || complainantDistrictEl.value);
  }
  setFieldDefault(complainantAddressDetailEl, profile.home_addr, force);

  setFieldDefault(civilPlaintiffNameEl, profile.name, force);
  setFieldDefault(civilPlaintiffGenderEl, profile.gender, force);
  setFieldDefault(civilPlaintiffEthnicityEl, profile.ethnicity, force);
  setFieldDefault(civilPlaintiffBirthEl, profile.birth_date, force);
  setFieldDefault(civilPlaintiffAddressEl, fullAddress, force);
  setFieldDefault(civilPlaintiffIdNumberEl, profile.id_card, force);
  setFieldDefault(civilPlaintiffPhoneEl, profile.phone, force);

  setFieldDefault(enfApplicantNameEl, profile.name, force);
  setFieldDefault(enfApplicantGenderEl, profile.gender, force);
  setFieldDefault(enfApplicantEthnicityEl, profile.ethnicity, force);
  setFieldDefault(enfApplicantBirthEl, profile.birth_date, force);
  setFieldDefault(enfApplicantJobEl, profile.occupation, force);
  setFieldDefault(enfApplicantAddressEl, fullAddress, force);
  setFieldDefault(enfApplicantIdNumberEl, profile.id_card, force);
  setFieldDefault(enfApplicantPhoneEl, profile.phone, force);

  setFieldDefault(arbApplicantNameEl, profile.name, force);
  setFieldDefault(arbApplicantGenderEl, profile.gender, force);
  setFieldDefault(arbApplicantEthnicityEl, profile.ethnicity, force);
  setFieldDefault(arbApplicantBirthEl, profile.birth_date, force);
  setFieldDefault(arbApplicantAddressEl, fullAddress, force);
  setFieldDefault(arbApplicantIdTypeEl, "居民身份证", force);
  setFieldDefault(arbApplicantIdNumberEl, profile.id_card, force);
  setFieldDefault(arbApplicantJobEl, profile.occupation, force);
  setFieldDefault(arbApplicantPhoneEl, profile.phone, force);

  setFieldDefault(medApplicantNameEl, profile.name, force);
  setFieldDefault(medApplicantGenderEl, profile.gender, force);
  setFieldDefault(medApplicantEthnicityEl, profile.ethnicity, force);
  setFieldDefault(medApplicantBirthEl, profile.birth_date, force);
  setFieldDefault(medApplicantAddressEl, fullAddress, force);
  setFieldDefault(medApplicantIdTypeEl, "居民身份证", force);
  setFieldDefault(medApplicantIdNumberEl, profile.id_card, force);
  setFieldDefault(medApplicantJobEl, profile.occupation, force);
  setFieldDefault(medApplicantPhoneEl, profile.phone, force);

  setFieldDefault(evlSubmitterNameEl, profile.name, force);
}

async function hydrateApplicantDefaults(force = false) {
  const fallbackUser = getCurrentUser() || {};
  applyApplicantDefaultsFromProfile(fallbackUser, force);
  try {
    const profileResp = await getCurrentProfile();
    applyApplicantDefaultsFromProfile(profileResp?.user || {}, force);
  } catch {
    // Ignore profile hydration failure and keep fallback defaults.
  }
}

function fillForm(data) {
  if (!data) return;
  let inferredTemplate = String(data.templateId || "").trim();
  if (!inferredTemplate) {
    if (String(data.plaintiff_name || "").trim()) inferredTemplate = "civil_complaint";
    else if (Array.isArray(data.evidence_items)) inferredTemplate = "evidence_list";
    else if (String(data.claims || "").trim() || String(data.facts || "").trim()) {
      inferredTemplate = "labor_mediation_application";
    }
    else if (String(data.arbitration_commission || "").trim()) inferredTemplate = "labor_arbitration_application";
    else if (String(data.basis_judgment_no || "").trim() || String(data.basis_issuer || "").trim()) {
      inferredTemplate = "enforcement_application";
    } else if (String(data.applicant_name || "").trim()) inferredTemplate = "labor_arbitration_application";
    else inferredTemplate = "labor_security_inspection_complaint";
  }
  activeTemplateId = inferredTemplate;
  if (docTemplateEl) docTemplateEl.value = inferredTemplate;
  toggleTemplatePanels(inferredTemplate);
  if (inferredTemplate === "civil_complaint") {
    if (docTypeEl) docTypeEl.value = "complaint";
    if (civilPlaintiffNameEl) civilPlaintiffNameEl.value = data.plaintiff_name || "";
    if (civilPlaintiffGenderEl) civilPlaintiffGenderEl.value = data.plaintiff_gender || "";
    if (civilPlaintiffEthnicityEl) civilPlaintiffEthnicityEl.value = data.plaintiff_ethnicity || "";
    if (civilPlaintiffBirthEl) civilPlaintiffBirthEl.value = data.plaintiff_birth || "";
    if (civilPlaintiffAddressEl) civilPlaintiffAddressEl.value = data.plaintiff_address || "";
    if (civilPlaintiffIdNumberEl) civilPlaintiffIdNumberEl.value = data.plaintiff_id_number || "";
    if (civilPlaintiffPhoneEl) civilPlaintiffPhoneEl.value = data.plaintiff_phone || "";
    if (civilDefendantNameEl) civilDefendantNameEl.value = data.defendant_name || "";
    if (civilDefendantAddressEl) civilDefendantAddressEl.value = data.defendant_address || "";
    if (civilDefendantPhoneEl) civilDefendantPhoneEl.value = data.defendant_phone || "";
    if (civilDefendantLegalRepresentativeEl) {
      civilDefendantLegalRepresentativeEl.value = data.defendant_legal_representative || "";
    }
    if (civilCourtNameEl) civilCourtNameEl.value = data.court_name || "";
    if (civilCaseCauseEl) civilCaseCauseEl.value = data.case_cause || "";
    if (civilClaimsEl) civilClaimsEl.value = data.claims || "";
    if (civilFactsEl) civilFactsEl.value = data.facts || "";
    if (civilEvidenceListEl) civilEvidenceListEl.value = data.evidence_list || "";
    return;
  }
  if (inferredTemplate === "labor_arbitration_application") {
    if (docTypeEl) docTypeEl.value = "complaint";
    if (arbApplicantNameEl) arbApplicantNameEl.value = data.applicant_name || "";
    if (arbApplicantGenderEl) arbApplicantGenderEl.value = data.applicant_gender || "";
    if (arbApplicantEthnicityEl) arbApplicantEthnicityEl.value = data.applicant_ethnicity || "";
    if (arbApplicantBirthEl) arbApplicantBirthEl.value = data.applicant_birth || "";
    if (arbApplicantAddressEl) arbApplicantAddressEl.value = data.applicant_address || "";
    if (arbApplicantIdTypeEl) arbApplicantIdTypeEl.value = data.applicant_id_type || "";
    if (arbApplicantIdNumberEl) arbApplicantIdNumberEl.value = data.applicant_id_number || "";
    if (arbApplicantJobEl) arbApplicantJobEl.value = data.applicant_job || "";
    if (arbApplicantPhoneEl) arbApplicantPhoneEl.value = data.applicant_phone || "";
    if (arbContractPerformancePlaceEl) {
      arbContractPerformancePlaceEl.value = data.contract_performance_place || "";
    }
    if (arbRespondentNameEl) arbRespondentNameEl.value = data.respondent_name || "";
    if (arbRespondentAddressEl) arbRespondentAddressEl.value = data.respondent_address || "";
    if (arbRespondentPhoneEl) arbRespondentPhoneEl.value = data.respondent_phone || "";
    if (arbRespondentLegalRepresentativeEl) {
      arbRespondentLegalRepresentativeEl.value = data.respondent_legal_representative || "";
    }
    if (arbRespondentLegalRepresentativeJobEl) {
      arbRespondentLegalRepresentativeJobEl.value = data.respondent_legal_representative_job || "";
    }
    if (arbRespondentBusinessPlaceEl) {
      arbRespondentBusinessPlaceEl.value = data.respondent_business_place || "";
    }
    if (arbRespondentContactPersonEl) {
      arbRespondentContactPersonEl.value = data.respondent_contact_person || "";
    }
    if (arbCommissionEl) arbCommissionEl.value = data.arbitration_commission || "";
    if (arbClaimsEl) arbClaimsEl.value = data.claims || "";
    if (arbFactsEl) arbFactsEl.value = data.facts || "";
    if (arbEvidenceListEl) arbEvidenceListEl.value = data.evidence_list || "";
    if (arbAgentBlockEl) arbAgentBlockEl.value = data.agent_block || "";
    if (arbAttachmentLineEl) arbAttachmentLineEl.value = data.attachment_line || "";
    return;
  }
  if (inferredTemplate === "labor_mediation_application") {
    if (docTypeEl) docTypeEl.value = "complaint";
    if (medApplicantNameEl) medApplicantNameEl.value = data.applicant_name || "";
    if (medApplicantGenderEl) medApplicantGenderEl.value = data.applicant_gender || "";
    if (medApplicantEthnicityEl) medApplicantEthnicityEl.value = data.applicant_ethnicity || "";
    if (medApplicantBirthEl) medApplicantBirthEl.value = data.applicant_birth || "";
    if (medApplicantAddressEl) medApplicantAddressEl.value = data.applicant_address || "";
    if (medApplicantIdTypeEl) medApplicantIdTypeEl.value = data.applicant_id_type || "";
    if (medApplicantIdNumberEl) medApplicantIdNumberEl.value = data.applicant_id_number || "";
    if (medApplicantJobEl) medApplicantJobEl.value = data.applicant_job || "";
    if (medApplicantPhoneEl) medApplicantPhoneEl.value = data.applicant_phone || "";
    if (medContractPerformancePlaceEl) {
      medContractPerformancePlaceEl.value = data.contract_performance_place || "";
    }
    if (medRespondentNameEl) medRespondentNameEl.value = data.respondent_name || "";
    if (medRespondentAddressEl) medRespondentAddressEl.value = data.respondent_address || "";
    if (medRespondentPhoneEl) medRespondentPhoneEl.value = data.respondent_phone || "";
    if (medRespondentLegalRepresentativeEl) {
      medRespondentLegalRepresentativeEl.value = data.respondent_legal_representative || "";
    }
    if (medRespondentBusinessPlaceEl) {
      medRespondentBusinessPlaceEl.value = data.respondent_business_place || "";
    }
    if (medRespondentContactPersonEl) {
      medRespondentContactPersonEl.value = data.respondent_contact_person || "";
    }
    if (medClaimsEl) medClaimsEl.value = data.claims || "";
    if (medFactsEl) medFactsEl.value = data.facts || "";
    return;
  }
  if (inferredTemplate === "enforcement_application") {
    if (docTypeEl) docTypeEl.value = "complaint";
    if (enfApplicantNameEl) enfApplicantNameEl.value = data.applicant_name || "";
    if (enfApplicantGenderEl) enfApplicantGenderEl.value = data.applicant_gender || "";
    if (enfApplicantEthnicityEl) enfApplicantEthnicityEl.value = data.applicant_ethnicity || "";
    if (enfApplicantBirthEl) enfApplicantBirthEl.value = data.applicant_birth || "";
    if (enfApplicantJobEl) enfApplicantJobEl.value = data.applicant_job || "";
    if (enfApplicantAddressEl) enfApplicantAddressEl.value = data.applicant_address || "";
    if (enfApplicantIdNumberEl) enfApplicantIdNumberEl.value = data.applicant_id_number || "";
    if (enfApplicantPhoneEl) enfApplicantPhoneEl.value = data.applicant_phone || "";
    if (enfLegalRepEl) enfLegalRepEl.value = data.legal_representative_line || "";
    if (enfEntrustedAgentEl) enfEntrustedAgentEl.value = data.entrusted_agent_line || "";
    if (enfRespondentNameEl) enfRespondentNameEl.value = data.respondent_name || "";
    if (enfRespondentAddressEl) enfRespondentAddressEl.value = data.respondent_address || "";
    if (enfRespondentPhoneEl) enfRespondentPhoneEl.value = data.respondent_phone || "";
    if (enfRespondentLegalRepresentativeEl) {
      enfRespondentLegalRepresentativeEl.value = data.respondent_legal_representative || "";
    }
    if (enfCaseCauseEl) enfCaseCauseEl.value = data.case_cause || "";
    if (enfBasisJudgmentNoEl) enfBasisJudgmentNoEl.value = data.basis_judgment_no || "";
    if (enfBasisIssuerEl) enfBasisIssuerEl.value = data.basis_issuer || "";
    if (enfBasisEffectiveDateEl) enfBasisEffectiveDateEl.value = data.basis_effective_date || "";
    if (enfBasisExtraEl) enfBasisExtraEl.value = data.basis_extra || "";
    if (enfBasisDocTypePhraseEl) enfBasisDocTypePhraseEl.value = data.basis_doc_type_phrase || "";
    if (enfAttachmentLineEl) enfAttachmentLineEl.value = data.attachment_line || "";
    if (enfRequestsEl) enfRequestsEl.value = data.requests || "";
    if (enfFactsEl) enfFactsEl.value = data.facts || "";
    if (enfCourtNameEl) enfCourtNameEl.value = data.court_name || "";
    return;
  }
  if (inferredTemplate === "evidence_list") {
    if (docTypeEl) docTypeEl.value = "complaint";
    const items = Array.isArray(data.evidence_items) ? data.evidence_items : [];
    clearAndFillEvidenceRows(items);
    if (evlTotalItemsEl) evlTotalItemsEl.value = data.total_items || "";
    if (evlTotalPagesEl) evlTotalPagesEl.value = data.total_pages || "";
    if (evlSubmitterNameEl) evlSubmitterNameEl.value = data.submitter_name || "";
    if (evlSubmissionDateEl) evlSubmissionDateEl.value = data.submission_date || "";
    if (evlCourtReceiverEl) evlCourtReceiverEl.value = data.court_receiver || "";
    return;
  }
  if (docTypeEl) docTypeEl.value = "complaint";
  if (applicantEl) applicantEl.value = data.applicant || "";
  if (complainantGenderEl) complainantGenderEl.value = data.complainantGender || "";
  if (complainantIdNumberEl) complainantIdNumberEl.value = data.complainantIdNumber || "";
  if (complainantProvinceEl) setSelectValueWithFallback(complainantProvinceEl, data.complainantProvince || "");
  if (complainantCityEl) setSelectValueWithFallback(complainantCityEl, data.complainantCity || "");
  if (complainantDistrictEl) setSelectValueWithFallback(complainantDistrictEl, data.complainantDistrict || "");
  if (complainantAddressDetailEl) complainantAddressDetailEl.value = data.complainantAddressDetail || "";
  if (!data.complainantProvince && !data.complainantCity && !data.complainantDistrict && !data.complainantAddressDetail && data.complainantAddress) {
    const parsed = splitRegionAddress(data.complainantAddress);
    if (complainantProvinceEl) setSelectValueWithFallback(complainantProvinceEl, parsed.province);
    if (complainantCityEl) setSelectValueWithFallback(complainantCityEl, parsed.city);
    if (complainantDistrictEl) setSelectValueWithFallback(complainantDistrictEl, parsed.district);
    if (complainantAddressDetailEl) complainantAddressDetailEl.value = parsed.detail;
  }
  if (complainantPostalCodeEl) complainantPostalCodeEl.value = data.complainantPostalCode || "";
  if (applicantPhoneEl) applicantPhoneEl.value = data.applicantPhone || "";
  if (respondentEl) respondentEl.value = data.respondent || "";
  if (respondentLegalRepresentativeEl) respondentLegalRepresentativeEl.value = data.respondentLegalRepresentative || "";
  if (respondentContactNameEl) respondentContactNameEl.value = data.respondentContactName || "";
  if (respondentContactJobTitleEl) respondentContactJobTitleEl.value = data.respondentContactJobTitle || "";
  if (respondentRegisteredAddressEl) respondentRegisteredAddressEl.value = data.respondentRegisteredAddress || "";
  if (respondentBusinessRegionEl) respondentBusinessRegionEl.value = data.respondentBusinessRegion || "";
  if (respondentBusinessProvinceEl) setSelectValueWithFallback(respondentBusinessProvinceEl, data.respondentBusinessProvince || "");
  if (respondentBusinessCityEl) setSelectValueWithFallback(respondentBusinessCityEl, data.respondentBusinessCity || "");
  if (respondentBusinessDistrictEl) setSelectValueWithFallback(respondentBusinessDistrictEl, data.respondentBusinessDistrict || "");
  if (respondentBusinessDetailEl) respondentBusinessDetailEl.value = data.respondentBusinessDetail || "";
  if (
    !data.respondentBusinessProvince &&
    !data.respondentBusinessCity &&
    !data.respondentBusinessDistrict &&
    !data.respondentBusinessDetail &&
    data.respondentBusinessAddress
  ) {
    const parsed = splitRegionAddress(data.respondentBusinessAddress);
    if (respondentBusinessProvinceEl) setSelectValueWithFallback(respondentBusinessProvinceEl, parsed.province);
    if (respondentBusinessCityEl) setSelectValueWithFallback(respondentBusinessCityEl, parsed.city);
    if (respondentBusinessDistrictEl) setSelectValueWithFallback(respondentBusinessDistrictEl, parsed.district);
    if (respondentBusinessRegionEl) respondentBusinessRegionEl.value = [parsed.province, parsed.city, parsed.district].filter(Boolean).join("");
    if (respondentBusinessDetailEl) respondentBusinessDetailEl.value = parsed.detail;
  }
  if (respondentContactPhoneEl) respondentContactPhoneEl.value = data.respondentContactPhone || "";
  if (respondentPostalCodeEl) respondentPostalCodeEl.value = data.respondentPostalCode || "";
  if (claimsEl) claimsEl.value = data.claims || "";
  if (factsEl) factsEl.value = data.facts || "";
  if (evidenceListEl) evidenceListEl.value = data.evidenceList || "";
}

function hasMissingRequiredFields(data) {
  if (data.templateId === "civil_complaint") {
    const requiredValues = [
      data.plaintiff_name,
      data.plaintiff_gender,
      data.plaintiff_ethnicity,
      data.plaintiff_birth,
      data.plaintiff_address,
      data.plaintiff_id_number,
      data.plaintiff_phone,
      data.defendant_name,
      data.defendant_address,
      data.case_cause,
      data.claims,
      data.facts,
      data.court_name,
    ];
    return requiredValues.some((value) => !String(value || "").trim());
  }
  if (data.templateId === "enforcement_application") {
    const requiredValues = [
      data.applicant_name,
      data.applicant_gender,
      data.applicant_ethnicity,
      data.applicant_birth,
      data.applicant_address,
      data.applicant_id_type,
      data.applicant_id_number,
      data.applicant_job,
      data.applicant_phone,
      data.contract_performance_place,
      data.respondent_name,
      data.respondent_address,
      data.case_cause,
      data.basis_judgment_no,
      data.basis_issuer,
      data.basis_effective_date,
      data.requests,
      data.facts,
      data.court_name,
    ];
    return requiredValues.some((value) => !String(value || "").trim());
  }
  if (data.templateId === "labor_arbitration_application") {
    const requiredValues = [
      data.applicant_name,
      data.applicant_gender,
      data.applicant_ethnicity,
      data.applicant_birth,
      data.applicant_address,
      data.applicant_id_type,
      data.applicant_id_number,
      data.applicant_phone,
      data.respondent_name,
      data.respondent_address,
      data.arbitration_commission,
      data.claims,
      data.facts,
    ];
    return requiredValues.some((value) => !String(value || "").trim());
  }
  if (data.templateId === "labor_mediation_application") {
    const requiredValues = [
      data.applicant_name,
      data.applicant_gender,
      data.applicant_ethnicity,
      data.applicant_birth,
      data.applicant_address,
      data.applicant_id_number,
      data.applicant_phone,
      data.respondent_name,
      data.respondent_address,
      data.claims,
      data.facts,
    ];
    return requiredValues.some((value) => !String(value || "").trim());
  }
  if (data.templateId === "evidence_list") {
    if (!String(data.submitter_name || "").trim() || !String(data.submission_date || "").trim()) return true;
    const items = Array.isArray(data.evidence_items) ? data.evidence_items : [];
    const hasNamed = items.some((it) => String(it?.name || "").trim());
    return !hasNamed;
  }
  const regionOk =
    String(data.respondentBusinessRegion || "").trim() ||
    (String(data.respondentBusinessProvince || "").trim() &&
      String(data.respondentBusinessCity || "").trim() &&
      String(data.respondentBusinessDistrict || "").trim());
  const requiredValues = [
    data.applicant,
    data.complainantGender,
    data.complainantIdNumber,
    data.complainantProvince,
    data.complainantCity,
    data.complainantDistrict,
    data.complainantAddressDetail,
    data.complainantPostalCode,
    data.applicantPhone,
    data.respondent,
    data.respondentLegalRepresentative,
    data.respondentContactName,
    data.respondentContactJobTitle,
    data.respondentRegisteredAddress,
    regionOk,
    data.respondentContactPhone,
    data.respondentPostalCode,
    data.claims,
    data.facts,
  ];
  return requiredValues.some((value) => !value);
}

function safeDownloadBase(name) {
  return String(name || "文书")
    .replace(/[/\\?%*:|"<>]/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 72);
}

function getSelectedCaseContext() {
  const caseId = String(caseQuickSelect?.value || "").trim();
  const sourceCase = caseById.get(caseId) || null;
  return {
    caseId,
    title: String(sourceCase?.title || sourceCase?.reason || "维权事项").trim(),
    sourceCase,
  };
}

function persistRightsCaseAndSnapshot(outputChannel) {
  const formData = collectFormData();
  const ctx = getSelectedCaseContext();
  const rightsCase = buildRightsCaseFromDocumentForm(activeTemplateId, formData, {
    caseId: ctx.caseId,
    title: ctx.title,
    legacyCase: ctx.sourceCase || {},
  });
  const missingFields = getMissingFieldsForTemplate(rightsCase, activeTemplateId);
  if (ctx.caseId) {
    saveRightsCaseDraft(ctx.caseId, rightsCase);
    appendDocumentSnapshot(
      ctx.caseId,
      createDocumentSnapshot({
        caseId: ctx.caseId,
        templateId: activeTemplateId,
        outputChannel,
        generatedText: currentDocumentText,
        missingFields,
        formData,
        rightsCase,
      }),
    );
  }
  return missingFields.length;
}

async function downloadPreviewAsPdf() {
  const data = collectFormData();
  if (hasMissingRequiredFields(data)) {
    setStatus("请先补全全部必填字段后再导出 PDF。");
    return;
  }
  refreshActiveDocumentPreview();
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const h2c = globalThis.html2canvas;
  const JsPdfCtor = globalThis.jspdf?.jsPDF;
  if (!docPreview || typeof h2c !== "function" || typeof JsPdfCtor !== "function") {
    setStatus("PDF 导出组件未加载，请刷新页面重试。");
    return;
  }
  try {
    setStatus("正在生成 PDF…");
    const canvas = await h2c(docPreview, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: "#ffffff",
    });
    const pdf = new JsPdfCtor({ orientation: "p", unit: "mm", format: "a4" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgData = canvas.toDataURL("image/png");
    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    let heightLeft = imgHeight;
    let position = 0;
    pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
    while (heightLeft >= 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }
    const label = getDocTypeLabel();
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    pdf.save(`${safeDownloadBase(label)}_${stamp}.pdf`);
    const missingCount = persistRightsCaseAndSnapshot("pdf");
    setStatus(`PDF 已开始下载。当前模板尚缺 ${missingCount} 项字段。`);
  } catch (err) {
    setStatus(`导出 PDF 失败：${err?.message || "请稍后重试"}`);
  }
}

async function hydrateCaseSelector() {
  if (!caseQuickSelect) return;
  caseById.clear();
  caseQuickSelect.replaceChildren();
  const opt0 = document.createElement("option");
  opt0.value = "";
  opt0.textContent = "从案件载入";
  caseQuickSelect.appendChild(opt0);

  try {
    const data = await listCases();
    const cases = Array.isArray(data?.cases) ? data.cases : [];
    cases.forEach((c) => {
      const id = String(c.case_id || "").trim();
      if (!id) return;
      caseById.set(id, c);
      const opt = document.createElement("option");
      opt.value = id;
      const title = String(c.title || c.reason || "案件").slice(0, 48);
      opt.textContent = `${title}`;
      caseQuickSelect.appendChild(opt);
    });
  } catch {
    /* 未登录或接口失败时保持仅「手动填写」 */
  }
}

async function applySelectedCase(rawCaseId) {
  const id = String(rawCaseId || "").trim();
  if (!id) {
    setStatus("请选择一项「我的案件」。");
    return;
  }
  const c = caseById.get(id);
  if (!c) {
    setStatus("案件数据失效，请刷新页面后重试。");
    return;
  }

  setStatus("正在载入案件与证据清单…");
  let importedEvidenceCount = 0;
  try {
    const ev = await listCaseEvidence(id);
    importedEvidenceCount = applyImportedEvidenceToDocumentForm(ev?.evidence);
  } catch {
    /* 证据列表可选 */
  }

  let caseArchives = null;
  try {
    caseArchives = await fetchCaseArchives(id);
  } catch {
    caseArchives = null;
  }

  await hydrateApplicantDefaults(false);

  if (respondentEl) respondentEl.value = String(c.respondent_name || "").trim();
  if (claimsEl) claimsEl.value = String(c.request || "").trim() || String(c.reason || "").trim();
  if (factsEl) factsEl.value = String(c.details || "").trim();

  const employer = caseArchives?.employer || null;
  if (employer) {
    const setIfEmpty = (el, value) => {
      const text = String(value || "").trim();
      if (!el || !text || String(el.value || "").trim()) return;
      el.value = text;
    };
    const businessRegion = String(employer.respondentBusinessRegion || "").trim();
    const businessDetail = String(employer.respondentBusinessDetail || "").trim();
    const businessAddress = [businessRegion, businessDetail].filter(Boolean).join(" ");

    setIfEmpty(respondentEl, employer.respondent || c.respondent_name);
    setIfEmpty(respondentLegalRepresentativeEl, employer.respondentLegalRepresentative);
    setIfEmpty(respondentContactNameEl, employer.respondentContactName);
    setIfEmpty(respondentContactJobTitleEl, employer.respondentContactJobTitle);
    setIfEmpty(respondentRegisteredAddressEl, employer.respondentRegisteredAddress);
    setIfEmpty(respondentBusinessRegionEl, businessRegion);
    setIfEmpty(respondentBusinessDetailEl, businessDetail);
    setIfEmpty(respondentBusinessProvinceEl, employer.respondentBusinessProvince);
    setIfEmpty(respondentBusinessCityEl, employer.respondentBusinessCity);
    setIfEmpty(respondentBusinessDistrictEl, employer.respondentBusinessDistrict);
    setIfEmpty(respondentContactPhoneEl, employer.respondentContactPhone);
    setIfEmpty(respondentPostalCodeEl, employer.respondentPostalCode);

    setIfEmpty(enfRespondentNameEl, employer.respondent || c.respondent_name);
    setIfEmpty(enfRespondentAddressEl, employer.respondentRegisteredAddress || businessAddress);
    setIfEmpty(enfRespondentPhoneEl, employer.respondentContactPhone);
    setIfEmpty(enfRespondentLegalRepresentativeEl, employer.respondentLegalRepresentative);

    setIfEmpty(civilDefendantNameEl, employer.respondent || c.respondent_name);
    setIfEmpty(civilDefendantAddressEl, employer.respondentRegisteredAddress || businessAddress);
    setIfEmpty(civilDefendantPhoneEl, employer.respondentContactPhone);
    setIfEmpty(civilDefendantLegalRepresentativeEl, employer.respondentLegalRepresentative);

    setIfEmpty(arbRespondentNameEl, employer.respondent || c.respondent_name);
    setIfEmpty(arbRespondentAddressEl, employer.respondentRegisteredAddress || businessAddress);
    setIfEmpty(arbRespondentPhoneEl, employer.respondentContactPhone);
    setIfEmpty(arbRespondentLegalRepresentativeEl, employer.respondentLegalRepresentative);
    setIfEmpty(arbRespondentLegalRepresentativeJobEl, employer.respondentContactJobTitle);
    setIfEmpty(arbRespondentBusinessPlaceEl, businessAddress);
    setIfEmpty(arbRespondentContactPersonEl, employer.respondentContactName);

    setIfEmpty(medRespondentNameEl, employer.respondent || c.respondent_name);
    setIfEmpty(medRespondentAddressEl, employer.respondentRegisteredAddress || businessAddress);
    setIfEmpty(medRespondentPhoneEl, employer.respondentContactPhone);
    setIfEmpty(medRespondentLegalRepresentativeEl, employer.respondentLegalRepresentative);
    setIfEmpty(medRespondentBusinessPlaceEl, businessAddress);
    setIfEmpty(medRespondentContactPersonEl, employer.respondentContactName);
  }
  setStatus(
    importedEvidenceCount > 0
      ? `已从案件载入表单，并自动导入 ${importedEvidenceCount} 条证据。请核对后可直接保存 Word 或 PDF。`
      : "已从案件载入表单，请核对后可直接保存 Word 或 PDF。",
  );
  if (
    activeTemplateId === "labor_security_inspection_complaint" ||
    activeTemplateId === "civil_complaint" ||
    activeTemplateId === "enforcement_application" ||
    activeTemplateId === "labor_arbitration_application" ||
    activeTemplateId === "labor_mediation_application" ||
    activeTemplateId === "evidence_list"
  ) {
    if (activeTemplateId === "civil_complaint") {
      if (civilDefendantNameEl && !String(civilDefendantNameEl.value || "").trim()) {
        civilDefendantNameEl.value = String(c.respondent_name || "").trim();
      }
      if (civilFactsEl && !String(civilFactsEl.value || "").trim()) {
        civilFactsEl.value = String(c.details || "").trim();
      }
      if (civilClaimsEl && !String(civilClaimsEl.value || "").trim()) {
        civilClaimsEl.value = String(c.request || "").trim() || String(c.reason || "").trim();
      }
      if (civilCaseCauseEl && !String(civilCaseCauseEl.value || "").trim()) {
        civilCaseCauseEl.value = String(c.reason || "").trim();
      }
    }
    if (activeTemplateId === "enforcement_application") {
      if (enfRespondentNameEl && !String(enfRespondentNameEl.value || "").trim()) {
        enfRespondentNameEl.value = String(c.respondent_name || "").trim();
      }
      if (enfFactsEl && !String(enfFactsEl.value || "").trim()) {
        enfFactsEl.value = String(c.details || "").trim();
      }
      if (enfRequestsEl && !String(enfRequestsEl.value || "").trim()) {
        enfRequestsEl.value = String(c.request || "").trim() || String(c.reason || "").trim();
      }
    }
    if (activeTemplateId === "labor_arbitration_application") {
      if (arbRespondentNameEl && !String(arbRespondentNameEl.value || "").trim()) {
        arbRespondentNameEl.value = String(c.respondent_name || "").trim();
      }
      if (arbFactsEl && !String(arbFactsEl.value || "").trim()) {
        arbFactsEl.value = String(c.details || "").trim();
      }
      if (arbClaimsEl && !String(arbClaimsEl.value || "").trim()) {
        arbClaimsEl.value = String(c.request || "").trim() || String(c.reason || "").trim();
      }
    }
    if (activeTemplateId === "labor_mediation_application") {
      if (medRespondentNameEl && !String(medRespondentNameEl.value || "").trim()) {
        medRespondentNameEl.value = String(c.respondent_name || "").trim();
      }
      if (medFactsEl && !String(medFactsEl.value || "").trim()) {
        medFactsEl.value = String(c.details || "").trim();
      }
      if (medClaimsEl && !String(medClaimsEl.value || "").trim()) {
        medClaimsEl.value = String(c.request || "").trim() || String(c.reason || "").trim();
      }
    }
    if (activeTemplateId === "evidence_list") {
      initEvidenceListFormIfEmpty();
    }
    scheduleDocPreviewSync();
  }
}

function applyExtractedFields(fields) {
  if (!fields || typeof fields !== "object") return 0;
  let updated = 0;
  const write = (el, value) => {
    const v = String(value || "").trim();
    if (!el || !v) return;
    el.value = v;
    updated += 1;
  };
  write(applicantEl, fields.complainant_name);
  write(complainantGenderEl, fields.complainant_gender);
  write(complainantIdNumberEl, fields.complainant_id_number);
  const complainantAddressParsed = splitRegionAddress(fields.complainant_mailing_address);
  write(complainantProvinceEl, complainantAddressParsed.province);
  write(complainantCityEl, complainantAddressParsed.city);
  write(complainantDistrictEl, complainantAddressParsed.district);
  write(complainantAddressDetailEl, complainantAddressParsed.detail || fields.complainant_mailing_address);
  write(complainantPostalCodeEl, fields.complainant_postal_code);
  write(applicantPhoneEl, fields.complainant_mobile_phone || fields.complainant_landline_phone);
  write(respondentEl, fields.respondent_name);
  write(respondentLegalRepresentativeEl, fields.respondent_legal_representative);
  write(respondentContactNameEl, fields.respondent_contact_name);
  write(respondentContactJobTitleEl, fields.respondent_contact_job_title);
  write(respondentRegisteredAddressEl, fields.respondent_registered_address);
  const respondentAddressParsed = splitRegionAddress(fields.respondent_business_address);
  write(respondentBusinessProvinceEl, respondentAddressParsed.province);
  write(respondentBusinessCityEl, respondentAddressParsed.city);
  write(respondentBusinessDistrictEl, respondentAddressParsed.district);
  write(respondentBusinessRegionEl, [respondentAddressParsed.province, respondentAddressParsed.city, respondentAddressParsed.district].filter(Boolean).join(""));
  write(respondentBusinessDetailEl, respondentAddressParsed.detail || fields.respondent_business_address);
  write(respondentContactPhoneEl, fields.respondent_contact_phone);
  write(respondentPostalCodeEl, fields.respondent_postal_code);
  write(claimsEl, fields.claim_requests);
  write(factsEl, fields.facts_and_reasons);
  return updated;
}

async function applyNarrativeToFields() {
  const sourceText = String(smartNarrativeEl?.value || "").trim();
  if (!sourceText) {
    setStatus("请先输入一段案情，再进行识别。");
    return;
  }
  if (!applyNarrativeBtn) return;
  applyNarrativeBtn.disabled = true;
  const oldLabel = applyNarrativeBtn.textContent;
  applyNarrativeBtn.textContent = "识别中...";
  setStatus("正在调用大模型识别要素...");
  try {
    const result = await extractLaborComplaintFields({ source_text: sourceText });
    const fields = result?.fields && typeof result.fields === "object" ? result.fields : {};
    const count = applyExtractedFields(fields);
    if (activeTemplateId === "labor_security_inspection_complaint") {
      scheduleDocPreviewSync();
    }
    setStatus(count > 0 ? `识别完成，已更新 ${count} 项字段。` : "识别完成，但未提取到可更新字段，请补充更具体的案情。");
  } catch (error) {
    setStatus(`识别失败：${error?.message || "请稍后重试"}`);
  } finally {
    applyNarrativeBtn.disabled = false;
    applyNarrativeBtn.textContent = oldLabel || "识别并更新上方字段";
  }
}

if (docGenForm) {
  docGenForm.addEventListener("input", () => {
    if (
      activeTemplateId === "labor_security_inspection_complaint" ||
      activeTemplateId === "civil_complaint" ||
      activeTemplateId === "enforcement_application" ||
      activeTemplateId === "labor_arbitration_application" ||
      activeTemplateId === "labor_mediation_application" ||
      activeTemplateId === "evidence_list"
    ) {
      scheduleDocPreviewSync();
    }
  });
  docGenForm.addEventListener("change", () => {
    if (
      activeTemplateId === "labor_security_inspection_complaint" ||
      activeTemplateId === "civil_complaint" ||
      activeTemplateId === "enforcement_application" ||
      activeTemplateId === "labor_arbitration_application" ||
      activeTemplateId === "labor_mediation_application" ||
      activeTemplateId === "evidence_list"
    ) {
      scheduleDocPreviewSync();
    }
  });
  docGenForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (
      activeTemplateId &&
      activeTemplateId !== "labor_security_inspection_complaint" &&
      activeTemplateId !== "civil_complaint" &&
      activeTemplateId !== "enforcement_application" &&
      activeTemplateId !== "labor_arbitration_application" &&
      activeTemplateId !== "labor_mediation_application" &&
      activeTemplateId !== "evidence_list"
    ) {
      setStatus("该模板字段暂未配置，无法生成文书。");
      renderPreview("");
      return;
    }
    const maxPages = getTotalFormPages();
    if (currentFormPage !== maxPages) {
      switchFormPage(maxPages);
      setStatus("请继续填写下一页后再保存文书。");
      return;
    }
    refreshActiveDocumentPreview();
    persistRightsCaseAndSnapshot("preview");
    setStatus("");
  });
}

if (downloadWordBtn) {
  downloadWordBtn.addEventListener("click", async () => {
    const data = collectFormData();
    if (hasMissingRequiredFields(data)) {
      setStatus("请先补全全部必填字段后再下载 Word。");
      return;
    }
    refreshActiveDocumentPreview();
    try {
      if (activeTemplateId === "civil_complaint") {
        await downloadCivilComplaintDocx(collectFormData());
      } else if (activeTemplateId === "enforcement_application") {
        await downloadEnforcementApplicationDocx(collectFormData());
      } else if (activeTemplateId === "labor_arbitration_application") {
        await downloadLaborArbitrationApplicationDocx(collectFormData());
      } else if (activeTemplateId === "labor_mediation_application") {
        await downloadLaborMediationApplicationDocx(collectFormData());
      } else if (activeTemplateId === "evidence_list") {
        await downloadEvidenceListDocx(collectFormData());
      } else {
        await downloadLaborComplaintDocx(collectFormData());
      }
      const missingCount = persistRightsCaseAndSnapshot("word");
      setStatus(`Word 已生成并开始下载。当前模板尚缺 ${missingCount} 项字段。`);
    } catch (error) {
      setStatus(`下载 Word 失败：${error?.message || "请稍后重试"}`);
    }
  });
}

if (downloadPdfBtn) {
  downloadPdfBtn.addEventListener("click", () => {
    void downloadPreviewAsPdf();
  });
}

if (caseQuickSelect) {
  caseQuickSelect.addEventListener("change", () => {
    void applySelectedCase(caseQuickSelect.value);
  });
}

if (applyNarrativeBtn) {
  applyNarrativeBtn.addEventListener("click", () => {
    void applyNarrativeToFields();
  });
}

if (prevPageBtn) {
  prevPageBtn.addEventListener("click", () => switchFormPage(currentFormPage - 1));
}

if (nextPageBtn) {
  nextPageBtn.addEventListener("click", () => switchFormPage(currentFormPage + 1));
}

if (evlAddRowBtn) {
  evlAddRowBtn.addEventListener("click", () => {
    if (!evlRowsTbody) return;
    evlRowsTbody.appendChild(makeEvidenceTableRow({}));
    reindexEvidenceRows();
    scheduleDocPreviewSync();
  });
}

if (evlRemoveRowBtn) {
  evlRemoveRowBtn.addEventListener("click", () => {
    if (!evlRowsTbody || evlRowsTbody.children.length <= 1) return;
    evlRowsTbody.removeChild(evlRowsTbody.lastElementChild);
    reindexEvidenceRows();
    scheduleDocPreviewSync();
  });
}

void hydrateCaseSelector();
switchFormPage(1);

if (docGenScrollArea) {
  initialFieldsMarkup = docGenScrollArea.innerHTML;
}

if (docTemplateEl) {
  docTemplateEl.addEventListener("change", () => {
    setActiveTemplate(docTemplateEl.value);
  });
  docTemplateEl.value = "labor_security_inspection_complaint";
  setActiveTemplate(docTemplateEl.value);
}

void hydrateApplicantDefaults(false).then(() => {
  scheduleDocPreviewSync();
});

void (async () => {
  const data = await loadRegionData();
  if (!Array.isArray(data) || !data.length) return;
  bindRegionCascade({
    provinceEl: complainantProvinceEl,
    cityEl: complainantCityEl,
    districtEl: complainantDistrictEl,
    data,
    onRegionUpdate: scheduleDocPreviewSync,
  });
  bindRegionCascade({
    provinceEl: respondentBusinessProvinceEl,
    cityEl: respondentBusinessCityEl,
    districtEl: respondentBusinessDistrictEl,
    data,
    onRegionUpdate: scheduleDocPreviewSync,
  });
})();
