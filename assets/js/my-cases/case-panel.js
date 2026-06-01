import { createCase, listCases } from "../api.js";
import {
  elements,
  escapeHtml,
  getSelectedCaseFromCache,
  state,
} from "./shared.js";

let casePanelInitialized = false;

export function renderMainCanvas(caseItem) {
  if (!elements.myCasesMainCanvas) return;
  if (!caseItem) {
    elements.myCasesMainCanvas.innerHTML = `
      <div class="my-cases-canvas-inner">
        <p class="my-cases-empty-tip">暂无案件。请点击右上角「新建案件」，在弹出面板中填写信息后创建。</p>
      </div>
    `;
    return;
  }

  const row = (label, value) => {
    const v = escapeHtml(value);
    if (!String(value ?? "").trim()) return "";
    return `<div class="my-cases-detail-row"><span class="my-cases-detail-label">${escapeHtml(label)}</span><span class="my-cases-detail-value">${v}</span></div>`;
  };

  const title = String(caseItem.title || caseItem.reason || "维权案件");
  const blocks = [
    `<h2 class="my-cases-detail-title">案件详情</h2>`,
    `<p class="my-cases-detail-lead">${escapeHtml(title)}</p>`,
    `<div class="my-cases-detail-grid">`,
    row("当前阶段", caseItem.stage),
    row("创建时间", caseItem.build_time),
    row("紧急程度", caseItem.emergency_degree),
    row("被申请人", caseItem.respondent_name),
    row("案由 / 争议", caseItem.reason),
    row("争议时间", caseItem.case_time),
    `</div>`,
    `<section class="my-cases-detail-block" aria-labelledby="my-cases-req-h">`,
    `<h3 id="my-cases-req-h" class="my-cases-detail-block-title">诉求摘要</h3>`,
    `<p class="my-cases-detail-text">${escapeHtml(caseItem.request || "（未填写）")}</p>`,
    `</section>`,
    `<section class="my-cases-detail-block" aria-labelledby="my-cases-story-h">`,
    `<h3 id="my-cases-story-h" class="my-cases-detail-block-title">案情经过</h3>`,
    `<p class="my-cases-detail-text my-cases-detail-text--multiline">${escapeHtml(caseItem.details || "（未填写）")}</p>`,
    `</section>`,
  ];

  elements.myCasesMainCanvas.innerHTML = `<div class="my-cases-canvas-inner my-cases-canvas-inner--detail">${blocks.join("")}</div>`;
}

function fillCaseSelect(preferredCaseId = "") {
  if (!elements.caseSelect) return;

  const targetCaseId = String(preferredCaseId || elements.caseSelect.value || "").trim();
  elements.caseSelect.innerHTML = "";
  state.casesCache.forEach((item) => {
    const opt = document.createElement("option");
    opt.value = String(item.case_id || "");
    opt.textContent = String(item.title || item.case_id || "案件");
    elements.caseSelect.appendChild(opt);
  });

  if (!state.casesCache.length) return;

  const hasPreferredCase = state.casesCache.some(
    (item) => String(item.case_id || "") === targetCaseId,
  );
  elements.caseSelect.value = hasPreferredCase
    ? targetCaseId
    : String(state.casesCache[0].case_id || "");
}

export async function refreshCases(options = {}) {
  const preservedCaseId = String(options.preferredCaseId || elements.caseSelect?.value || "").trim();
  const data = await listCases();
  state.casesCache = Array.isArray(data?.cases) ? data.cases : [];
  fillCaseSelect(preservedCaseId);
  renderMainCanvas(getSelectedCaseFromCache());
}

function setNewCaseDialogError(msg) {
  if (!elements.newCaseDialogError) return;
  if (!msg) {
    elements.newCaseDialogError.textContent = "";
    elements.newCaseDialogError.classList.add("hidden");
    return;
  }
  elements.newCaseDialogError.textContent = msg;
  elements.newCaseDialogError.classList.remove("hidden");
}

function openNewCaseDialog() {
  if (!elements.newCaseDialog) return;
  setNewCaseDialogError("");
  elements.newCaseDialog.showModal();
  window.setTimeout(() => elements.newCaseRespondent?.focus(), 0);
}

function closeNewCaseDialog() {
  elements.newCaseDialog?.close();
  setNewCaseDialogError("");
}

export function initCasePanel(options = {}) {
  if (casePanelInitialized) return;
  casePanelInitialized = true;

  const onCasesUpdated = typeof options.onCasesUpdated === "function"
    ? options.onCasesUpdated
    : null;

  if (elements.newCaseOpenBtn) {
    elements.newCaseOpenBtn.addEventListener("click", () => openNewCaseDialog());
  }

  if (elements.newCaseDialogCancel) {
    elements.newCaseDialogCancel.addEventListener("click", () => closeNewCaseDialog());
  }

  if (elements.newCaseForm) {
    elements.newCaseForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      setNewCaseDialogError("");
      const respondent = String(elements.newCaseRespondent?.value || "").trim();
      const reason = String(elements.newCaseReason?.value || "").trim() || "维权案件";
      if (!respondent) {
        setNewCaseDialogError("请填写被申请人（用人单位）名称");
        elements.newCaseRespondent?.focus();
        return;
      }

      if (elements.newCaseDialogSubmit) {
        elements.newCaseDialogSubmit.disabled = true;
      }

      try {
        const result = await createCase({ respondent_name: respondent, reason, stage: "暂存" });
        if (elements.newCaseRespondent) elements.newCaseRespondent.value = "";
        if (elements.newCaseReason) elements.newCaseReason.value = "";
        closeNewCaseDialog();
        await refreshCases({ preferredCaseId: String(result?.case?.case_id || "") });
        if (onCasesUpdated) {
          await onCasesUpdated();
        }
      } catch (error) {
        setNewCaseDialogError(error?.message || "创建失败");
      } finally {
        if (elements.newCaseDialogSubmit) {
          elements.newCaseDialogSubmit.disabled = false;
        }
      }
    });
  }
}