import {
  buildLaborInspectionComplaintCollectPayload,
  buildRightsCaseFromDocumentForm,
  getMissingFieldsForTemplate,
} from "./rights-case-model.js";
import { setupProtectedPage } from "./page-auth.js";

setupProtectedPage();

const els = {
  quizStepText: document.getElementById("quizStepText"),
  quizProgressFill: document.getElementById("quizProgressFill"),
  quizQuestionTitle: document.getElementById("quizQuestionTitle"),
  quizQuestionHint: document.getElementById("quizQuestionHint"),
  quizAnswerArea: document.getElementById("quizAnswerArea"),
  quizPrevBtn: document.getElementById("quizPrevBtn"),
  quizNextBtn: document.getElementById("quizNextBtn"),
  quizValidateBtn: document.getElementById("quizValidateBtn"),
  quizStatus: document.getElementById("quizStatus"),
  quizSummary: document.getElementById("quizSummary"),
  quizJsonPreview: document.getElementById("quizJsonPreview"),
};

/**
 * 与 `document-generator.js` 中 `collectFormData()` 的劳动保障监察投诉书分支字段对齐。
 * 每题可包含多个 collectKey（文书表单字段名）。
 */
const QUESTIONS = [
  {
    id: "complainant_core",
    title: "投诉人信息（姓名 / 性别 / 手机 / 证件号）",
    hint: "对应文书页「投诉人信息」第一行四项。",
    type: "group",
    fields: [
      { collectKey: "applicant", label: "投诉人姓名", type: "text" },
      { collectKey: "complainantGender", label: "性别", type: "select", options: ["", "男", "女"] },
      { collectKey: "applicantPhone", label: "手机号", type: "text" },
      { collectKey: "complainantIdNumber", label: "身份证号 / 其他证件号", type: "text" },
    ],
  },
  {
    id: "complainant_region",
    title: "投诉人地址（省 / 市 / 区 + 详细地址 + 邮编）",
    hint: "对应文书页「省/市/区」与「详细地址」「邮编」。",
    type: "group",
    fields: [
      { collectKey: "complainantProvince", label: "省 / 直辖市", type: "text" },
      { collectKey: "complainantCity", label: "市", type: "text" },
      { collectKey: "complainantDistrict", label: "区 / 县", type: "text" },
      { collectKey: "complainantAddressDetail", label: "详细地址（街道、门牌号）", type: "text" },
      { collectKey: "complainantPostalCode", label: "邮编", type: "text" },
    ],
  },
  {
    id: "respondent_core",
    title: "被投诉人信息（单位 / 注册地址 / 法定代表人 / 联系人）",
    hint: "对应文书页「被投诉人信息」上半部分。",
    type: "group",
    fields: [
      { collectKey: "respondent", label: "被投诉人 / 被投诉单位", type: "text" },
      { collectKey: "respondentRegisteredAddress", label: "注册地址（营业执照注册地址）", type: "text" },
      { collectKey: "respondentLegalRepresentative", label: "法定代表人（主要负责人）", type: "text" },
      { collectKey: "respondentContactName", label: "联系人姓名", type: "text" },
      { collectKey: "respondentContactJobTitle", label: "联系人职务", type: "text" },
    ],
  },
  {
    id: "respondent_business",
    title: "被投诉人经营地（省市区文本 + 详细）",
    hint:
      "文书页支持「省/市/区」下拉或「实际办公或经营地点」整段文本；此处两路都采集，至少填一路即可在模型中还原。",
    type: "group",
    fields: [
      { collectKey: "respondentBusinessRegion", label: "实际办公或经营地点（省市区整段，如：四川省成都市成华区）", type: "text" },
      { collectKey: "respondentBusinessProvince", label: "经营地省（若拆分填写）", type: "text" },
      { collectKey: "respondentBusinessCity", label: "经营地市", type: "text" },
      { collectKey: "respondentBusinessDistrict", label: "经营地区/县", type: "text" },
      { collectKey: "respondentBusinessDetail", label: "经营地详细（门牌/园区/楼层等，可选）", type: "text" },
    ],
  },
  {
    id: "respondent_contact_post",
    title: "被投诉人联系与邮编",
    hint: "对应「联系人电话」「单位邮编」。",
    type: "group",
    fields: [
      { collectKey: "respondentContactPhone", label: "联系人电话", type: "text" },
      { collectKey: "respondentPostalCode", label: "单位邮编", type: "text" },
    ],
  },
  {
    id: "body_page2",
    title: "正文（请求事项 + 事实与理由 + 证据，可选）",
    hint: "对应文书页第二页「请求事项」「事实与理由」；证据列表为可选补充。",
    type: "group",
    fields: [
      { collectKey: "claims", label: "请求事项（可多行）", type: "textarea" },
      { collectKey: "facts", label: "事实与理由", type: "textarea" },
      { collectKey: "evidenceList", label: "证据目录（可选，多行）", type: "textarea" },
    ],
  },
];

let currentStep = 0;
/** @type {Record<string, string>} */
const answers = {};

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fieldDomId(collectKey) {
  return `quizField_${collectKey}`;
}

function renderGroup(q) {
  const rows = (q.fields || [])
    .map((f) => {
      const id = fieldDomId(f.collectKey);
      const value = String(answers[f.collectKey] || "");
      let control = "";
      if (f.type === "select") {
        const opts = (f.options || [])
          .map(
            (opt) =>
              `<option value="${escapeHtml(opt)}"${value === opt ? " selected" : ""}>${escapeHtml(opt || "请选择")}</option>`,
          )
          .join("");
        control = `<select id="${id}" class="search-input">${opts}</select>`;
      } else if (f.type === "textarea") {
        control = `<textarea id="${id}" class="search-input doc-gen-textarea" rows="4" placeholder="请输入">${escapeHtml(value)}</textarea>`;
      } else {
        control = `<input id="${id}" class="search-input" type="text" value="${escapeHtml(value)}" placeholder="请输入">`;
      }
      return `<label class="model-quiz-field"><span class="model-quiz-field-label">${escapeHtml(f.label)}</span>${control}</label>`;
    })
    .join("");
  return `<div class="model-quiz-field-grid">${rows}</div>`;
}

function collectCurrentAnswers() {
  const q = QUESTIONS[currentStep];
  if (!q) return;
  if (q.type === "group") {
    (q.fields || []).forEach((f) => {
      const el = document.getElementById(fieldDomId(f.collectKey));
      answers[f.collectKey] = String(el?.value || "").trim();
    });
    return;
  }
}

function buildCollectFormDataFromAnswers() {
  const fd = { templateId: "labor_security_inspection_complaint", type: "complaint" };
  Object.entries(answers).forEach(([k, v]) => {
    fd[k] = v;
  });
  return fd;
}

function buildRightsCaseModel() {
  const fd = buildCollectFormDataFromAnswers();
  return buildRightsCaseFromDocumentForm("labor_security_inspection_complaint", fd, {});
}

function renderPreview() {
  const rightsCase = buildRightsCaseModel();
  const rebuilt = buildLaborInspectionComplaintCollectPayload(rightsCase);
  const missing = getMissingFieldsForTemplate(rightsCase, "labor_security_inspection_complaint");
  const lines = [
    ["投诉人", rebuilt.applicant],
    ["被投诉单位", rebuilt.respondent],
    ["投诉人通讯地址拼接", rebuilt.complainantAddress],
    ["被投诉经营地拼接", rebuilt.respondentBusinessAddress],
    ["请求事项", rebuilt.claims],
    ["事实与理由", rebuilt.facts],
  ];
  els.quizSummary.innerHTML = [
    `<div><strong>模板缺失项（按当前诊断规则）：</strong>${missing.length ? escapeHtml(missing.map((m) => m.label).join("、")) : "无"}</div>`,
    ...lines.map(([k, v]) => `<div><strong>${escapeHtml(k)}：</strong>${escapeHtml(v || "未填写")}</div>`),
  ].join("");
  els.quizJsonPreview.textContent = JSON.stringify(rightsCase, null, 2);
}

function renderStep() {
  const q = QUESTIONS[currentStep];
  if (!q) return;
  els.quizStepText.textContent = `第 ${currentStep + 1} 题 / 共 ${QUESTIONS.length} 题`;
  const progress = ((currentStep + 1) / QUESTIONS.length) * 100;
  els.quizProgressFill.style.width = `${progress}%`;
  els.quizQuestionTitle.textContent = q.title;
  els.quizQuestionHint.textContent = q.hint;
  els.quizAnswerArea.innerHTML = q.type === "group" ? renderGroup(q) : "";
  els.quizPrevBtn.disabled = currentStep <= 0;
  els.quizNextBtn.textContent = currentStep >= QUESTIONS.length - 1 ? "完成答题" : "下一题";
  renderPreview();
}

function setStatus(text) {
  if (els.quizStatus) els.quizStatus.textContent = text || "";
}

function valuesEqual(a, b) {
  return String(a ?? "").trim() === String(b ?? "").trim();
}

function validateModelMapping() {
  const rightsCase = buildRightsCaseModel();
  const rebuilt = buildLaborInspectionComplaintCollectPayload(rightsCase);
  const keys = Object.keys(answers).filter((k) => String(answers[k] || "").trim());
  let ok = 0;
  keys.forEach((k) => {
    if (valuesEqual(answers[k], rebuilt[k])) ok += 1;
  });
  setStatus(`映射校验：已填写字段 ${keys.length} 项，其中 ${ok} 项与模型回读一致。`);
}

els.quizPrevBtn?.addEventListener("click", () => {
  collectCurrentAnswers();
  if (currentStep > 0) currentStep -= 1;
  renderStep();
});

els.quizNextBtn?.addEventListener("click", () => {
  collectCurrentAnswers();
  if (currentStep < QUESTIONS.length - 1) {
    currentStep += 1;
    renderStep();
    return;
  }
  renderPreview();
  setStatus("答题完成，可点击「校验模型映射」。");
});

els.quizValidateBtn?.addEventListener("click", () => {
  collectCurrentAnswers();
  validateModelMapping();
  renderStep();
});

renderStep();
