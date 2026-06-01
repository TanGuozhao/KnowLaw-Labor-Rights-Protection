const RIGHTS_CASE_SCHEMA_VERSION = "1.0.0";

const TEMPLATE_IDS = [
  "labor_security_inspection_complaint",
  "civil_complaint",
  "enforcement_application",
  "labor_arbitration_application",
  "labor_mediation_application",
  "evidence_list",
];

const RIGHTS_CASE_FIELD_DICTIONARY = {
  "meta.caseId": { label: "案件ID", module: "meta" },
  "meta.title": { label: "案件标题", module: "meta" },
  "participants.claimant.name": { label: "申请人姓名", module: "participants" },
  "participants.claimant.gender": { label: "申请人性别", module: "participants" },
  "participants.claimant.ethnicity": { label: "申请人民族", module: "participants" },
  "participants.claimant.birthDate": { label: "申请人出生日期", module: "participants" },
  "participants.claimant.idType": { label: "申请人证件类型", module: "participants" },
  "participants.claimant.idNumber": { label: "申请人证件号", module: "participants" },
  "participants.claimant.phone": { label: "申请人电话", module: "participants" },
  "participants.claimant.landline": { label: "申请人固定电话", module: "participants" },
  "participants.claimant.postalCode": { label: "申请人邮编", module: "participants" },
  "participants.claimant.address.full": { label: "申请人地址", module: "participants" },
  "participants.claimant.job": { label: "申请人职业", module: "participants" },
  "participants.claimant.contractPerformancePlace": { label: "劳动合同履行地", module: "participants" },
  "participants.respondent.name": { label: "相对方名称", module: "participants" },
  "participants.respondent.legalRepresentative": { label: "法定代表人", module: "participants" },
  "participants.respondent.legalRepresentativeJob": { label: "法定代表人职务", module: "participants" },
  "participants.respondent.contactName": { label: "联系人姓名", module: "participants" },
  "participants.respondent.contactJobTitle": { label: "联系人职务", module: "participants" },
  "participants.respondent.contactPhone": { label: "联系人电话", module: "participants" },
  "participants.respondent.postalCode": { label: "相对方邮编", module: "participants" },
  "participants.respondent.address.registered": { label: "注册地址", module: "participants" },
  "participants.respondent.address.business": { label: "经营/办公地", module: "participants" },
  "claims.summary": { label: "诉求摘要", module: "claims" },
  "facts.narrative": { label: "事实与理由", module: "facts" },
  "facts.caseCause": { label: "案由", module: "facts" },
  "procedure.courtName": { label: "法院名称", module: "procedure" },
  "procedure.arbitrationCommission": { label: "仲裁委员会", module: "procedure" },
  "execution.basisJudgmentNo": { label: "执行依据案号", module: "execution" },
  "execution.basisIssuer": { label: "执行依据作出机关", module: "execution" },
  "execution.basisEffectiveDate": { label: "执行依据生效日期", module: "execution" },
  "execution.requests": { label: "申请执行事项", module: "execution" },
  "evidence.listText": { label: "证据列表文本", module: "evidence" },
  "evidence.items": { label: "证据表格条目", module: "evidence" },
  "litigation.laborInspectionComplaint.complainantProvince": { label: "投诉人省/直辖市", module: "litigation" },
  "litigation.laborInspectionComplaint.complainantCity": { label: "投诉人市", module: "litigation" },
  "litigation.laborInspectionComplaint.complainantDistrict": { label: "投诉人区/县", module: "litigation" },
  "litigation.laborInspectionComplaint.complainantAddressDetail": { label: "投诉人详细地址", module: "litigation" },
  "litigation.laborInspectionComplaint.respondentBusinessProvince": { label: "被投诉人经营地省", module: "litigation" },
  "litigation.laborInspectionComplaint.respondentBusinessCity": { label: "被投诉人经营地市", module: "litigation" },
  "litigation.laborInspectionComplaint.respondentBusinessDistrict": { label: "被投诉人经营地区", module: "litigation" },
  "litigation.laborInspectionComplaint.respondentBusinessRegionText": { label: "被投诉人经营地省市区文本", module: "litigation" },
  "litigation.laborInspectionComplaint.respondentBusinessDetail": { label: "被投诉人经营地详细", module: "litigation" },
  "litigation.civilLaborComplaint.claimChecklist": { label: "诉讼请求勾选项", module: "litigation" },
  "litigation.civilLaborComplaint.preLitigationPreservation": { label: "诉前保全信息", module: "litigation" },
  "litigation.civilLaborComplaint.factMatrix": { label: "事实与理由矩阵", module: "litigation" },
  "litigation.civilLaborComplaint.mediationIntent": { label: "诉前调解意愿", module: "litigation" },
};

const DOCUMENT_TEMPLATE_FIELD_MAP = {
  labor_security_inspection_complaint: {
    requiredFields: [
      "participants.claimant.name",
      "participants.claimant.gender",
      "participants.claimant.idNumber",
      "participants.claimant.phone",
      "participants.claimant.address.full",
      "participants.claimant.postalCode",
      "participants.respondent.name",
      "participants.respondent.legalRepresentative",
      "participants.respondent.contactName",
      "participants.respondent.contactPhone",
      "participants.respondent.address.registered",
      "participants.respondent.address.business",
      "claims.summary",
      "facts.narrative",
    ],
    optionalFields: [
      "participants.claimant.landline",
      "participants.respondent.contactJobTitle",
      "participants.respondent.postalCode",
      "evidence.listText",
    ],
    deriveRules: [
      "participants.claimant.address.full <= complainantProvince+complainantCity+complainantDistrict+complainantAddressDetail",
      "participants.respondent.address.business <= respondentBusinessRegion/respondentBusinessProvince+City+District+respondentBusinessDetail",
    ],
  },
  civil_complaint: {
    requiredFields: [
      "participants.claimant.name",
      "participants.claimant.gender",
      "participants.claimant.ethnicity",
      "participants.claimant.birthDate",
      "participants.claimant.address.full",
      "participants.claimant.idNumber",
      "participants.claimant.phone",
      "participants.respondent.name",
      "participants.respondent.address.registered",
      "facts.caseCause",
      "claims.summary",
      "facts.narrative",
      "procedure.courtName",
    ],
    optionalFields: [
      "participants.respondent.phone",
      "participants.respondent.legalRepresentative",
      "evidence.listText",
    ],
    deriveRules: [],
  },
  enforcement_application: {
    requiredFields: [
      "participants.claimant.name",
      "participants.claimant.gender",
      "participants.claimant.ethnicity",
      "participants.claimant.birthDate",
      "participants.claimant.address.full",
      "participants.claimant.idNumber",
      "participants.claimant.phone",
      "participants.respondent.name",
      "participants.respondent.address.registered",
      "facts.caseCause",
      "execution.basisJudgmentNo",
      "execution.basisIssuer",
      "execution.basisEffectiveDate",
      "execution.requests",
      "facts.narrative",
      "procedure.courtName",
    ],
    optionalFields: [
      "participants.claimant.job",
      "participants.respondent.legalRepresentative",
      "execution.basisExtra",
      "execution.basisDocTypePhrase",
      "execution.attachmentLine",
    ],
    deriveRules: [],
  },
  labor_arbitration_application: {
    requiredFields: [
      "participants.claimant.name",
      "participants.claimant.gender",
      "participants.claimant.ethnicity",
      "participants.claimant.birthDate",
      "participants.claimant.address.full",
      "participants.claimant.idType",
      "participants.claimant.idNumber",
      "participants.claimant.phone",
      "participants.respondent.name",
      "participants.respondent.address.registered",
      "procedure.arbitrationCommission",
      "claims.summary",
      "facts.narrative",
    ],
    optionalFields: [
      "participants.claimant.job",
      "participants.claimant.contractPerformancePlace",
      "participants.respondent.legalRepresentative",
      "participants.respondent.legalRepresentativeJob",
      "participants.respondent.contactName",
      "participants.respondent.address.business",
      "evidence.listText",
      "documents.current.agentBlock",
      "documents.current.attachmentLine",
    ],
    deriveRules: [],
  },
  labor_mediation_application: {
    requiredFields: [
      "participants.claimant.name",
      "participants.claimant.gender",
      "participants.claimant.ethnicity",
      "participants.claimant.birthDate",
      "participants.claimant.address.full",
      "participants.claimant.idType",
      "participants.claimant.idNumber",
      "participants.claimant.phone",
      "participants.claimant.job",
      "participants.claimant.contractPerformancePlace",
      "participants.respondent.name",
      "participants.respondent.address.registered",
      "claims.summary",
      "facts.narrative",
    ],
    optionalFields: [
      "participants.respondent.legalRepresentative",
      "participants.respondent.contactName",
      "participants.respondent.address.business",
    ],
    deriveRules: [],
  },
  evidence_list: {
    requiredFields: [
      "evidence.items",
      "documents.current.submitterName",
      "documents.current.submissionDate",
    ],
    optionalFields: [
      "documents.current.totalItems",
      "documents.current.totalPages",
      "documents.current.courtReceiver",
    ],
    deriveRules: [
      "documents.current.totalItems <= count(evidence.items)",
      "documents.current.totalPages <= sum(evidence.items[].pages)",
    ],
  },
};

const STORAGE_KEYS = {
  caseDraftPrefix: "rights_case_draft:",
  snapshotPrefix: "rights_case_doc_snapshots:",
};
const REPORT_JSON_FENCE = "rights-case-json";

function getByPath(obj, path) {
  return String(path || "")
    .split(".")
    .filter(Boolean)
    .reduce((acc, key) => (acc == null ? acc : acc[key]), obj);
}

function setByPath(obj, path, value) {
  const keys = String(path || "").split(".").filter(Boolean);
  if (!keys.length) return;
  let cursor = obj;
  for (let i = 0; i < keys.length - 1; i += 1) {
    const key = keys[i];
    if (!cursor[key] || typeof cursor[key] !== "object") cursor[key] = {};
    cursor = cursor[key];
  }
  cursor[keys[keys.length - 1]] = value;
}

function composeRegionAddress(province, city, district, detail) {
  return [province, city, district, detail].map((v) => String(v || "").trim()).filter(Boolean).join("");
}

function ensureLaborInspectionComplaintNode(rightsCase) {
  rightsCase.litigation = rightsCase.litigation || {};
  rightsCase.litigation.laborInspectionComplaint = rightsCase.litigation.laborInspectionComplaint || {};
  const node = rightsCase.litigation.laborInspectionComplaint;
  node.complainantAddress = node.complainantAddress || {};
  node.respondentBusinessAddress = node.respondentBusinessAddress || {};
  return node;
}

function syncLaborInspectionComplaintFromLaborForm(rightsCase, formData = {}) {
  const d = formData || {};
  const tid = String(d.templateId || "").trim();
  if (tid && tid !== "labor_security_inspection_complaint") return rightsCase;
  const node = ensureLaborInspectionComplaintNode(rightsCase);

  node.complainantProvince = String(d.complainantProvince || node.complainantProvince || "").trim();
  node.complainantCity = String(d.complainantCity || node.complainantCity || "").trim();
  node.complainantDistrict = String(d.complainantDistrict || node.complainantDistrict || "").trim();
  node.complainantAddressDetail = String(d.complainantAddressDetail || node.complainantAddressDetail || "").trim();

  node.respondentBusinessProvince = String(d.respondentBusinessProvince || node.respondentBusinessProvince || "").trim();
  node.respondentBusinessCity = String(d.respondentBusinessCity || node.respondentBusinessCity || "").trim();
  node.respondentBusinessDistrict = String(d.respondentBusinessDistrict || node.respondentBusinessDistrict || "").trim();
  node.respondentBusinessRegionText = String(d.respondentBusinessRegion || node.respondentBusinessRegionText || "").trim();
  node.respondentBusinessDetail = String(d.respondentBusinessDetail || node.respondentBusinessDetail || "").trim();

  const complainantFull = composeRegionAddress(
    node.complainantProvince,
    node.complainantCity,
    node.complainantDistrict,
    node.complainantAddressDetail,
  );
  node.complainantAddress.full = complainantFull;

  const regionText = String(node.respondentBusinessRegionText || "").trim();
  const composedBusiness = regionText
    ? regionText + String(node.respondentBusinessDetail || "").trim()
    : composeRegionAddress(
        node.respondentBusinessProvince,
        node.respondentBusinessCity,
        node.respondentBusinessDistrict,
        "",
      ) + String(node.respondentBusinessDetail || "").trim();
  node.respondentBusinessAddress.full = composedBusiness;

  return rightsCase;
}

function buildLaborInspectionComplaintCollectPayload(rightsCase = {}) {
  const c = rightsCase || {};
  const node = c?.litigation?.laborInspectionComplaint || {};
  const claimant = c?.participants?.claimant || {};
  const respondent = c?.participants?.respondent || {};

  const complainantAddress = composeRegionAddress(
    node.complainantProvince,
    node.complainantCity,
    node.complainantDistrict,
    node.complainantAddressDetail,
  );
  const respondentBusinessRegionText = String(node.respondentBusinessRegionText || "").trim();
  const respondentBusinessAddress =
    respondentBusinessRegionText ||
    composeRegionAddress(
      node.respondentBusinessProvince,
      node.respondentBusinessCity,
      node.respondentBusinessDistrict,
      "",
    ) + String(node.respondentBusinessDetail || "").trim();

  return {
    templateId: "labor_security_inspection_complaint",
    type: "complaint",
    applicant: String(claimant.name || "").trim(),
    complainantGender: String(claimant.gender || "").trim(),
    complainantIdNumber: String(claimant.idNumber || "").trim(),
    complainantProvince: String(node.complainantProvince || "").trim(),
    complainantCity: String(node.complainantCity || "").trim(),
    complainantDistrict: String(node.complainantDistrict || "").trim(),
    complainantAddressDetail: String(node.complainantAddressDetail || "").trim(),
    complainantAddress: complainantAddress || String(claimant?.address?.full || "").trim(),
    complainantPostalCode: String(claimant.postalCode || "").trim(),
    applicantPhone: String(claimant.phone || "").trim(),
    complainantLandline: String(claimant.landline || "").trim(),
    respondent: String(respondent.name || "").trim(),
    respondentLegalRepresentative: String(respondent.legalRepresentative || "").trim(),
    respondentContactName: String(respondent.contactName || "").trim(),
    respondentContactJobTitle: String(respondent.contactJobTitle || "").trim(),
    respondentRegisteredAddress: String(respondent?.address?.registered || "").trim(),
    respondentBusinessProvince: String(node.respondentBusinessProvince || "").trim(),
    respondentBusinessCity: String(node.respondentBusinessCity || "").trim(),
    respondentBusinessDistrict: String(node.respondentBusinessDistrict || "").trim(),
    respondentBusinessRegion: respondentBusinessRegionText,
    respondentBusinessDetail: String(node.respondentBusinessDetail || "").trim(),
    respondentBusinessAddress: respondentBusinessAddress || String(respondent?.address?.business || "").trim(),
    respondentContactPhone: String(respondent.contactPhone || "").trim(),
    respondentPostalCode: String(respondent.postalCode || "").trim(),
    claims: String(c?.claims?.summary || "").trim(),
    facts: String(c?.facts?.narrative || "").trim(),
    evidenceList: String(c?.evidence?.listText || "").trim(),
  };
}

function hasMeaningfulValue(value) {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === "object") return Object.keys(value).length > 0;
  return String(value || "").trim().length > 0;
}

function safeParse(json, fallback) {
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}

function cloneJsonLike(value, fallback) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function buildCaseTitle(data) {
  const reason = String(data?.reason || "").trim();
  const respondent = String(data?.respondent_name || "").trim();
  if (reason && respondent) return `${reason} - ${respondent}`;
  return reason || respondent || "维权事项";
}

function createEmptyRightsCase(seed = {}) {
  return {
    schemaVersion: RIGHTS_CASE_SCHEMA_VERSION,
    meta: {
      caseId: String(seed.caseId || "").trim(),
      title: String(seed.title || "").trim() || "维权事项",
      status: String(seed.status || "draft"),
      createdAt: String(seed.createdAt || nowIso()),
      updatedAt: String(seed.updatedAt || nowIso()),
    },
    participants: {
      claimant: { address: {} },
      respondent: { address: {} },
    },
    claims: {},
    facts: {},
    procedure: {},
    evidence: {
      items: [],
    },
    execution: {},
    documents: {
      current: {},
    },
    litigation: {
      laborInspectionComplaint: {
        complainantProvince: "",
        complainantCity: "",
        complainantDistrict: "",
        complainantAddressDetail: "",
        complainantAddress: { full: "" },
        respondentBusinessProvince: "",
        respondentBusinessCity: "",
        respondentBusinessDistrict: "",
        respondentBusinessRegionText: "",
        respondentBusinessDetail: "",
        respondentBusinessAddress: { full: "" },
      },
      civilLaborComplaint: {
        plaintiff: {
          personType: "natural_person",
          domicileAddress: "",
          habitualResidenceAddress: "",
          entrustedAgent: {
            hasAgent: false,
            name: "",
            organization: "",
            title: "",
            phone: "",
            authorizationType: "",
          },
        },
        defendant: {
          legalEntityType: "",
          socialCreditCode: "",
          listedCompanyFlag: "",
          organizationType: "",
          ownershipNature: "",
        },
        claimChecklist: {
          unpaidWages: { selected: "", detail: "" },
          noWrittenContractDoubleWage: { selected: "", detail: "" },
          overtimePay: { selected: "", detail: "" },
          unusedAnnualLeavePay: { selected: "", detail: "" },
          socialInsuranceDamage: { selected: "", detail: "" },
          wrongfulTerminationCompensation: { selected: "", detail: "" },
          illegalTerminationCompensation: { selected: "", detail: "" },
          litigationCosts: { selected: "" },
          otherClaims: "",
          preservationClaim: "",
        },
        preLitigationPreservation: {
          applied: "",
          preservationCourt: "",
          preservationTime: "",
          preservationCaseNo: "",
          note: "",
        },
        factMatrix: {
          laborContractSigning: "",
          laborContractPerformance: "",
          terminationAndCompensation: "",
          workInjury: "",
          laborArbitration: "",
          otherRelevantFacts: "",
          legalBasis: "",
          evidenceCatalogSummary: "",
        },
        mediationIntent: {
          knowsNonLitigationMediation: "",
          knowsPreMediationBenefits: {
            benefit1: "",
            benefit2: "",
            benefit3: "",
            benefit4: "",
            benefit5: "",
          },
          willingPreMediation: "",
          signatureName: "",
          signatureDate: "",
        },
      },
    },
    extensions: {},
  };
}

function buildCivilLaborComplaintFormPayload(rightsCase = {}) {
  const c = rightsCase || {};
  const plaintiff = c?.participants?.claimant || {};
  const defendant = c?.participants?.respondent || {};
  const form = c?.litigation?.civilLaborComplaint || {};
  return {
    plaintiff_name: String(plaintiff.name || "").trim(),
    plaintiff_gender: String(plaintiff.gender || "").trim(),
    plaintiff_birth: String(plaintiff.birthDate || "").trim(),
    plaintiff_ethnicity: String(plaintiff.ethnicity || "").trim(),
    plaintiff_employer_and_job: String(plaintiff.job || "").trim(),
    plaintiff_phone: String(plaintiff.phone || "").trim(),
    plaintiff_domicile_address: String(form?.plaintiff?.domicileAddress || "").trim(),
    plaintiff_habitual_residence: String(form?.plaintiff?.habitualResidenceAddress || "").trim(),
    plaintiff_id_type: String(plaintiff.idType || "").trim(),
    plaintiff_id_number: String(plaintiff.idNumber || "").trim(),
    entrusted_agent: { ...(form?.plaintiff?.entrustedAgent || {}) },

    defendant_name: String(defendant.name || "").trim(),
    defendant_main_business_place: String(defendant?.address?.business || "").trim(),
    defendant_registered_address: String(defendant?.address?.registered || "").trim(),
    defendant_legal_representative: String(defendant.legalRepresentative || "").trim(),
    defendant_legal_representative_title: String(defendant.legalRepresentativeJob || "").trim(),
    defendant_phone: String(defendant.contactPhone || "").trim(),
    defendant_social_credit_code: String(form?.defendant?.socialCreditCode || "").trim(),
    defendant_listed_company_flag: String(form?.defendant?.listedCompanyFlag || "").trim(),
    defendant_organization_type: String(form?.defendant?.organizationType || "").trim(),
    defendant_ownership_nature: String(form?.defendant?.ownershipNature || "").trim(),
    defendant_legal_entity_type: String(form?.defendant?.legalEntityType || "").trim(),

    claim_checklist: { ...(form?.claimChecklist || {}) },
    pre_litigation_preservation: { ...(form?.preLitigationPreservation || {}) },
    fact_matrix: { ...(form?.factMatrix || {}) },
    mediation_intent: { ...(form?.mediationIntent || {}) },
  };
}

function applyCivilLaborComplaintFormPayload(rightsCase = {}, formPayload = {}) {
  const next = mergeRightsCase(createEmptyRightsCase(), rightsCase || {});
  const f = formPayload || {};

  assignIfValue(next, "participants.claimant.name", f.plaintiff_name);
  assignIfValue(next, "participants.claimant.gender", f.plaintiff_gender);
  assignIfValue(next, "participants.claimant.birthDate", f.plaintiff_birth);
  assignIfValue(next, "participants.claimant.ethnicity", f.plaintiff_ethnicity);
  assignIfValue(next, "participants.claimant.job", f.plaintiff_employer_and_job);
  assignIfValue(next, "participants.claimant.phone", f.plaintiff_phone);
  assignIfValue(next, "participants.claimant.idType", f.plaintiff_id_type);
  assignIfValue(next, "participants.claimant.idNumber", f.plaintiff_id_number);

  assignIfValue(next, "participants.respondent.name", f.defendant_name);
  assignIfValue(next, "participants.respondent.address.business", f.defendant_main_business_place);
  assignIfValue(next, "participants.respondent.address.registered", f.defendant_registered_address);
  assignIfValue(next, "participants.respondent.legalRepresentative", f.defendant_legal_representative);
  assignIfValue(next, "participants.respondent.legalRepresentativeJob", f.defendant_legal_representative_title);
  assignIfValue(next, "participants.respondent.contactPhone", f.defendant_phone);

  const complaintNode = next.litigation?.civilLaborComplaint || {};
  complaintNode.plaintiff = complaintNode.plaintiff || {};
  complaintNode.defendant = complaintNode.defendant || {};
  complaintNode.claimChecklist = complaintNode.claimChecklist || {};
  complaintNode.preLitigationPreservation = complaintNode.preLitigationPreservation || {};
  complaintNode.factMatrix = complaintNode.factMatrix || {};
  complaintNode.mediationIntent = complaintNode.mediationIntent || {};

  complaintNode.plaintiff.domicileAddress = String(f.plaintiff_domicile_address || complaintNode.plaintiff.domicileAddress || "").trim();
  complaintNode.plaintiff.habitualResidenceAddress = String(
    f.plaintiff_habitual_residence || complaintNode.plaintiff.habitualResidenceAddress || "",
  ).trim();
  if (f.entrusted_agent && typeof f.entrusted_agent === "object") {
    complaintNode.plaintiff.entrustedAgent = {
      ...(complaintNode.plaintiff.entrustedAgent || {}),
      ...f.entrusted_agent,
    };
  }

  complaintNode.defendant.socialCreditCode = String(
    f.defendant_social_credit_code || complaintNode.defendant.socialCreditCode || "",
  ).trim();
  complaintNode.defendant.listedCompanyFlag = String(
    f.defendant_listed_company_flag || complaintNode.defendant.listedCompanyFlag || "",
  ).trim();
  complaintNode.defendant.organizationType = String(
    f.defendant_organization_type || complaintNode.defendant.organizationType || "",
  ).trim();
  complaintNode.defendant.ownershipNature = String(
    f.defendant_ownership_nature || complaintNode.defendant.ownershipNature || "",
  ).trim();
  complaintNode.defendant.legalEntityType = String(
    f.defendant_legal_entity_type || complaintNode.defendant.legalEntityType || "",
  ).trim();

  if (f.claim_checklist && typeof f.claim_checklist === "object") {
    complaintNode.claimChecklist = { ...complaintNode.claimChecklist, ...f.claim_checklist };
  }
  if (f.pre_litigation_preservation && typeof f.pre_litigation_preservation === "object") {
    complaintNode.preLitigationPreservation = {
      ...complaintNode.preLitigationPreservation,
      ...f.pre_litigation_preservation,
    };
  }
  if (f.fact_matrix && typeof f.fact_matrix === "object") {
    complaintNode.factMatrix = { ...complaintNode.factMatrix, ...f.fact_matrix };
  }
  if (f.mediation_intent && typeof f.mediation_intent === "object") {
    complaintNode.mediationIntent = { ...complaintNode.mediationIntent, ...f.mediation_intent };
  }

  next.litigation = next.litigation || {};
  next.litigation.civilLaborComplaint = complaintNode;
  return next;
}

function normalizeLegacyCaseToRightsCase(rawCase = {}) {
  const out = createEmptyRightsCase({
    caseId: rawCase.case_id,
    title: rawCase.title || buildCaseTitle(rawCase),
    status: rawCase.stage || "draft",
    createdAt: rawCase.build_time || nowIso(),
    updatedAt: nowIso(),
  });
  setByPath(out, "participants.respondent.name", String(rawCase.respondent_name || "").trim());
  setByPath(out, "claims.summary", String(rawCase.request || rawCase.reason || "").trim());
  setByPath(out, "facts.narrative", String(rawCase.details || "").trim());
  setByPath(out, "facts.caseCause", String(rawCase.reason || "").trim());
  return out;
}

function assignIfValue(target, path, value) {
  if (!hasMeaningfulValue(value)) return;
  setByPath(target, path, value);
}

function buildRightsCaseFromDocumentForm(templateId, formData = {}, options = {}) {
  const base = createEmptyRightsCase({
    caseId: options.caseId,
    title: options.title || buildCaseTitle(options.legacyCase || {}),
    status: options.status || "draft",
  });
  const t = String(templateId || formData.templateId || "").trim();
  assignIfValue(base, "documents.current.templateId", t);
  assignIfValue(base, "claims.summary", formData.claims || formData.requests);
  assignIfValue(base, "facts.narrative", formData.facts);
  assignIfValue(base, "facts.caseCause", formData.case_cause);
  assignIfValue(base, "procedure.courtName", formData.court_name);
  assignIfValue(base, "procedure.arbitrationCommission", formData.arbitration_commission);

  assignIfValue(base, "participants.claimant.name", formData.applicant || formData.applicant_name || formData.plaintiff_name);
  assignIfValue(base, "participants.claimant.gender", formData.complainantGender || formData.applicant_gender || formData.plaintiff_gender);
  assignIfValue(base, "participants.claimant.ethnicity", formData.applicant_ethnicity || formData.plaintiff_ethnicity);
  assignIfValue(base, "participants.claimant.birthDate", formData.applicant_birth || formData.plaintiff_birth);
  assignIfValue(base, "participants.claimant.idType", formData.applicant_id_type);
  assignIfValue(base, "participants.claimant.idNumber", formData.complainantIdNumber || formData.applicant_id_number || formData.plaintiff_id_number);
  assignIfValue(base, "participants.claimant.phone", formData.applicantPhone || formData.applicant_phone || formData.plaintiff_phone);
  assignIfValue(base, "participants.claimant.landline", formData.complainantLandline);
  assignIfValue(base, "participants.claimant.postalCode", formData.complainantPostalCode);
  assignIfValue(base, "participants.claimant.address.full", formData.complainantAddress || formData.applicant_address || formData.plaintiff_address);
  assignIfValue(base, "participants.claimant.job", formData.applicant_job);
  assignIfValue(base, "participants.claimant.contractPerformancePlace", formData.contract_performance_place);

  assignIfValue(base, "participants.respondent.name", formData.respondent || formData.respondent_name || formData.defendant_name);
  assignIfValue(base, "participants.respondent.legalRepresentative", formData.respondentLegalRepresentative || formData.respondent_legal_representative || formData.defendant_legal_representative);
  assignIfValue(base, "participants.respondent.legalRepresentativeJob", formData.respondent_legal_representative_job);
  assignIfValue(base, "participants.respondent.contactName", formData.respondentContactName || formData.respondent_contact_person);
  assignIfValue(base, "participants.respondent.contactJobTitle", formData.respondentContactJobTitle);
  assignIfValue(base, "participants.respondent.contactPhone", formData.respondentContactPhone || formData.respondent_phone || formData.defendant_phone);
  assignIfValue(base, "participants.respondent.postalCode", formData.respondentPostalCode);
  assignIfValue(base, "participants.respondent.address.registered", formData.respondentRegisteredAddress || formData.respondent_address || formData.defendant_address);
  assignIfValue(base, "participants.respondent.address.business", formData.respondentBusinessAddress || formData.respondent_business_place);

  assignIfValue(base, "execution.basisJudgmentNo", formData.basis_judgment_no);
  assignIfValue(base, "execution.basisIssuer", formData.basis_issuer);
  assignIfValue(base, "execution.basisEffectiveDate", formData.basis_effective_date);
  assignIfValue(base, "execution.basisExtra", formData.basis_extra);
  assignIfValue(base, "execution.basisDocTypePhrase", formData.basis_doc_type_phrase);
  assignIfValue(base, "execution.attachmentLine", formData.attachment_line);
  assignIfValue(base, "execution.requests", formData.requests);

  assignIfValue(base, "evidence.listText", formData.evidence_list || formData.evidenceList);
  if (Array.isArray(formData.evidence_items)) assignIfValue(base, "evidence.items", formData.evidence_items);
  assignIfValue(base, "documents.current.totalItems", formData.total_items);
  assignIfValue(base, "documents.current.totalPages", formData.total_pages);
  assignIfValue(base, "documents.current.submitterName", formData.submitter_name);
  assignIfValue(base, "documents.current.submissionDate", formData.submission_date);
  assignIfValue(base, "documents.current.courtReceiver", formData.court_receiver);
  assignIfValue(base, "documents.current.agentBlock", formData.agent_block);
  assignIfValue(base, "documents.current.attachmentLine", formData.attachment_line);

  syncLaborInspectionComplaintFromLaborForm(base, { ...formData, templateId: t || formData.templateId });

  return base;
}

function getMissingFieldsForTemplate(rightsCase, templateId) {
  const map = DOCUMENT_TEMPLATE_FIELD_MAP[String(templateId || "").trim()];
  if (!map) return [];
  return map.requiredFields
    .filter((path) => !hasMeaningfulValue(getByPath(rightsCase, path)))
    .map((path) => ({
      path,
      label: RIGHTS_CASE_FIELD_DICTIONARY[path]?.label || path,
    }));
}

function saveRightsCaseDraft(caseId, rightsCase) {
  const id = String(caseId || rightsCase?.meta?.caseId || "").trim();
  if (!id) return;
  localStorage.setItem(`${STORAGE_KEYS.caseDraftPrefix}${id}`, JSON.stringify(rightsCase || {}));
}

function loadRightsCaseDraft(caseId) {
  const id = String(caseId || "").trim();
  if (!id) return null;
  const raw = localStorage.getItem(`${STORAGE_KEYS.caseDraftPrefix}${id}`);
  return raw ? safeParse(raw, null) : null;
}

function createDocumentSnapshot(payload = {}) {
  return {
    snapshotId: `doc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    caseId: String(payload.caseId || payload.rightsCase?.meta?.caseId || "").trim(),
    templateId: String(payload.templateId || payload.rightsCase?.documents?.current?.templateId || "").trim(),
    createdAt: nowIso(),
    outputChannel: String(payload.outputChannel || "preview"),
    generatedText: String(payload.generatedText || "").trim(),
    missingFieldCount: Array.isArray(payload.missingFields) ? payload.missingFields.length : 0,
    missingFields: Array.isArray(payload.missingFields) ? payload.missingFields : [],
    formData: payload.formData || {},
    rightsCase: payload.rightsCase || null,
  };
}

function appendDocumentSnapshot(caseId, snapshot) {
  const id = String(caseId || snapshot?.caseId || "").trim();
  if (!id || !snapshot) return;
  const key = `${STORAGE_KEYS.snapshotPrefix}${id}`;
  const oldList = safeParse(localStorage.getItem(key) || "[]", []);
  const list = Array.isArray(oldList) ? oldList : [];
  list.unshift(snapshot);
  localStorage.setItem(key, JSON.stringify(list.slice(0, 30)));
}

function listDocumentSnapshots(caseId, limit = 5) {
  const id = String(caseId || "").trim();
  if (!id) return [];
  const key = `${STORAGE_KEYS.snapshotPrefix}${id}`;
  const list = safeParse(localStorage.getItem(key) || "[]", []);
  return Array.isArray(list) ? list.slice(0, Math.max(0, Number(limit) || 0)) : [];
}

function fmt(value, fallback = "未填写") {
  const text = String(value || "").trim();
  return text || fallback;
}

function buildRightsCaseReport(rightsCase = {}, options = {}) {
  const c = rightsCase || {};
  const title = fmt(c?.meta?.title, "维权事项报告");
  const caseId = fmt(c?.meta?.caseId, "未绑定");
  const status = fmt(c?.meta?.status, "draft");
  const claimant = c?.participants?.claimant || {};
  const respondent = c?.participants?.respondent || {};
  const claims = fmt(c?.claims?.summary);
  const facts = fmt(c?.facts?.narrative);
  const caseCause = fmt(c?.facts?.caseCause);
  const templateId = fmt(c?.documents?.current?.templateId);
  const courtName = fmt(c?.procedure?.courtName);
  const arbitrationCommission = fmt(c?.procedure?.arbitrationCommission);
  const evidenceCount = Array.isArray(c?.evidence?.items) ? c.evidence.items.length : 0;
  const evidenceText = fmt(c?.evidence?.listText);
  const reportAt = options.generatedAt || nowIso();
  const jsonPayload = JSON.stringify(c, null, 2);
  return [
    "# 维权事项报告",
    "",
    `- 报告生成时间：${reportAt}`,
    `- 案件ID：${caseId}`,
    `- 案件标题：${title}`,
    `- 当前维权阶段：${status}`,
    "",
    "## 当事人信息",
    `- 申请人：${fmt(claimant.name)}`,
    `- 申请人联系方式：${fmt(claimant.phone)}`,
    `- 申请人证件号：${fmt(claimant.idNumber)}`,
    `- 申请人地址：${fmt(claimant?.address?.full)}`,
    `- 相对方：${fmt(respondent.name)}`,
    `- 相对方法定代表人：${fmt(respondent.legalRepresentative)}`,
    `- 相对方联系人：${fmt(respondent.contactName)}`,
    `- 相对方联系电话：${fmt(respondent.contactPhone)}`,
    "",
    "## 案情与诉求",
    `- 案由：${caseCause}`,
    `- 诉求摘要：${claims}`,
    `- 事实与理由：${facts}`,
    "",
    "## 维权行动与程序状态",
    `- 当前文书模板：${templateId}`,
    `- 法院：${courtName}`,
    `- 仲裁委员会：${arbitrationCommission}`,
    `- 已登记证据数量：${String(evidenceCount)}`,
    `- 证据摘要：${evidenceText}`,
    "",
    "## 机器可解析模型",
    `请保留下方代码块，用于报告反填模型。`,
    "",
    `\`\`\`${REPORT_JSON_FENCE}`,
    jsonPayload,
    "```",
    "",
  ].join("\n");
}

function extractRightsCaseJsonFromReport(reportText) {
  const raw = String(reportText || "");
  const fenceRegex = new RegExp(`\\\`\\\`\\\`${REPORT_JSON_FENCE}\\s*([\\s\\S]*?)\\\`\\\`\\\``, "m");
  const fenced = raw.match(fenceRegex);
  if (fenced && fenced[1]) {
    return safeParse(fenced[1].trim(), null);
  }
  return safeParse(raw.trim(), null);
}

function mergeRightsCase(baseCase, patchCase) {
  const base = typeof baseCase === "object" && baseCase ? cloneJsonLike(baseCase, createEmptyRightsCase()) : createEmptyRightsCase();
  const patch = typeof patchCase === "object" && patchCase ? patchCase : {};
  const walk = (target, src) => {
    Object.entries(src).forEach(([k, v]) => {
      if (Array.isArray(v)) {
        target[k] = v.map((item) => (item && typeof item === "object" ? cloneJsonLike(item, {}) : item));
        return;
      }
      if (v && typeof v === "object") {
        if (!target[k] || typeof target[k] !== "object" || Array.isArray(target[k])) target[k] = {};
        walk(target[k], v);
        return;
      }
      if (v !== undefined) target[k] = v;
    });
  };
  walk(base, patch);
  if (!base.schemaVersion) base.schemaVersion = RIGHTS_CASE_SCHEMA_VERSION;
  if (!base.meta) base.meta = {};
  if (!base.meta.updatedAt) base.meta.updatedAt = nowIso();
  else base.meta.updatedAt = nowIso();
  return base;
}

function parseRightsCaseReport(reportText, options = {}) {
  const parsed = extractRightsCaseJsonFromReport(reportText);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("报告中未找到可解析的 RightsCase JSON 数据");
  }
  const merged = mergeRightsCase(options.baseCase || createEmptyRightsCase(), parsed);
  return merged;
}

export {
  DOCUMENT_TEMPLATE_FIELD_MAP,
  RIGHTS_CASE_FIELD_DICTIONARY,
  RIGHTS_CASE_SCHEMA_VERSION,
  TEMPLATE_IDS,
  appendDocumentSnapshot,
  buildRightsCaseFromDocumentForm,
  buildLaborInspectionComplaintCollectPayload,
  createDocumentSnapshot,
  createEmptyRightsCase,
  buildRightsCaseReport,
  buildCivilLaborComplaintFormPayload,
  composeRegionAddress,
  getMissingFieldsForTemplate,
  listDocumentSnapshots,
  loadRightsCaseDraft,
  parseRightsCaseReport,
  applyCivilLaborComplaintFormPayload,
  normalizeLegacyCaseToRightsCase,
  saveRightsCaseDraft,
};
