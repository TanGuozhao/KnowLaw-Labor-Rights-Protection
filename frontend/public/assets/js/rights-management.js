import { createCase, listCases } from "./api.js";
import { isAuthenticated } from "./auth.js";

const els = {
  list: document.getElementById("rmCaseList"),
  detail: document.getElementById("rmCaseDetail"),
  reloadBtn: document.getElementById("rmReloadBtn"),
  newBtn: document.getElementById("rmNewBtn"),
  modal: document.getElementById("rmCreateModal"),
  backdrop: document.getElementById("rmModalBackdrop"),
  cancelBtn: document.getElementById("rmCancelBtn"),
  form: document.getElementById("rmCreateForm"),
  respondent: document.getElementById("rmRespondent"),
  reason: document.getElementById("rmReason"),
  details: document.getElementById("rmDetails"),
  error: document.getElementById("rmFormError"),
};

let cases = [];
let selectedId = "";

function escapeHtml(text) {
  return String(text ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function resolveLoginPath() {
  return window.location.pathname.endsWith(".html") ? "./login.html" : "/login";
}

function renderList() {
  if (!els.list) return;
  if (!cases.length) {
    els.list.innerHTML = '<div class="rm-empty">暂无事项，点击“新建维权事项”开始。</div>';
    return;
  }
  els.list.innerHTML = cases.map((item) => {
    const id = String(item.case_id || "");
    const active = id === selectedId ? " active" : "";
    const title = escapeHtml(item.title || item.reason || "维权事项");
    const respondent = escapeHtml(item.respondent_name || "未填写被申请人");
    return `<button type="button" class="rm-card${active}" data-id="${id}"><div class="rm-card-title">${title}</div><div class="rm-card-meta">${respondent}</div></button>`;
  }).join("");
}

function renderDetail() {
  if (!els.detail) return;
  const current = cases.find((item) => String(item.case_id || "") === selectedId);
  if (!current) {
    els.detail.innerHTML = '<div class="rm-empty">请选择左侧维权事项查看详情。</div>';
    return;
  }
  const field = (label, value) => `<div class="rm-field"><div class="rm-field-label">${escapeHtml(label)}</div><div class="rm-field-value">${escapeHtml(value || "未填写")}</div></div>`;
  els.detail.innerHTML = `<h2 class="rm-title">${escapeHtml(current.title || current.reason || "维权事项")}</h2><div class="rm-detail-grid">${field("被申请人", current.respondent_name)}${field("案由", current.reason)}${field("当前阶段", current.stage)}${field("创建时间", current.build_time)}${field("诉求摘要", current.request)}${field("经过说明", current.details)}</div>`;
}

function openModal() {
  els.error.textContent = "";
  els.backdrop.classList.remove("hidden");
  els.modal.classList.remove("hidden");
  els.respondent.focus();
}

function closeModal() {
  els.backdrop.classList.add("hidden");
  els.modal.classList.add("hidden");
}

async function loadCases(preferId = "") {
  const data = await listCases();
  cases = Array.isArray(data?.cases) ? data.cases : [];
  selectedId = preferId || (cases[0] ? String(cases[0].case_id || "") : "");
  renderList();
  renderDetail();
}

async function handleCreate(event) {
  event.preventDefault();
  els.error.textContent = "";
  const respondent = String(els.respondent.value || "").trim();
  const reason = String(els.reason.value || "").trim() || "维权事项";
  const details = String(els.details.value || "").trim();
  if (!respondent) {
    els.error.textContent = "请填写被申请人。";
    els.respondent.focus();
    return;
  }
  try {
    const result = await createCase({ respondent_name: respondent, reason, details, stage: "暂存" });
    closeModal();
    els.form.reset();
    await loadCases(String(result?.case?.case_id || ""));
  } catch (error) {
    els.error.textContent = error?.message || "创建失败";
  }
}

function bindEvents() {
  els.newBtn?.addEventListener("click", openModal);
  els.cancelBtn?.addEventListener("click", closeModal);
  els.backdrop?.addEventListener("click", closeModal);
  els.reloadBtn?.addEventListener("click", () => { void loadCases(selectedId); });
  els.form?.addEventListener("submit", (event) => { void handleCreate(event); });
  els.list?.addEventListener("click", (event) => {
    const target = event.target.closest(".rm-card");
    if (!target) return;
    selectedId = String(target.dataset.id || "");
    renderList();
    renderDetail();
  });
}

async function init() {
  if (!isAuthenticated()) {
    window.location.replace(resolveLoginPath());
    return;
  }
  bindEvents();
  try {
    await loadCases();
  } catch (error) {
    if (els.detail) els.detail.innerHTML = `<div class="rm-empty">${escapeHtml(error?.message || "加载失败")}</div>`;
  }
}

void init();
