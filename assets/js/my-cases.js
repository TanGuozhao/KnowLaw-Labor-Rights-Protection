import { renderEvidenceGraph } from "./evidence-graph.js";
import { renderEvidenceTimeline } from "./evidence-timeline.js";
import { initCasePanel, refreshCases, renderMainCanvas } from "./my-cases/case-panel.js";
import {
  initEvidencePanel,
  loadEvidenceSummary,
  syncEvidenceUploadButton,
  updateEvidenceNoCaseHint,
} from "./my-cases/evidence-panel.js";
import {
  elements,
  getSelectedCaseFromCache,
  getSelectedCaseId,
  initMyCasesPage,
  syncAddEvidenceButton,
} from "./my-cases/shared.js";

initMyCasesPage();
initCasePanel({ onCasesUpdated: handleCaseChange });
initEvidencePanel();

function renderPanelEmptyState(canvas, message) {
  if (!canvas) return;
  canvas.innerHTML = `<div style="padding:18px;color:rgba(28,54,94,0.72);font-size:13px;">${message}</div>`;
}

function renderTimelinePanel() {
  const caseId = getSelectedCaseId();
  if (caseId) {
    void renderEvidenceTimeline({ caseId, canvasId: "myCasesTimelineCanvas" });
    return;
  }
  renderPanelEmptyState(
    elements.myCasesTimelineCanvas,
    "请先在「案件」中创建并选中当前维权案件。",
  );
}

function renderGraphPanel() {
  const caseId = getSelectedCaseId();
  if (caseId) {
    void renderEvidenceGraph({ caseId, canvasId: "myCasesGraphCanvas" });
    return;
  }
  renderPanelEmptyState(
    elements.myCasesGraphCanvas,
    "请先在「案件」中创建并选中当前维权案件。",
  );
}

function setFuncPanel(panel) {
  const isCase = panel === "case";
  const isEvidence = panel === "evidence";
  const isTimeline = panel === "timeline";
  const isGraph = panel === "graph";

  if (elements.myCasesPaneCase) elements.myCasesPaneCase.classList.toggle("hidden", !isCase);
  if (elements.myCasesPaneEvidence) elements.myCasesPaneEvidence.classList.toggle("hidden", !isEvidence);
  if (elements.myCasesPaneTimeline) elements.myCasesPaneTimeline.classList.toggle("hidden", !isTimeline);
  if (elements.myCasesPaneGraph) elements.myCasesPaneGraph.classList.toggle("hidden", !isGraph);

  elements.funcBtns.forEach((btn) => {
    const active = btn.dataset.panel === panel;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-pressed", active ? "true" : "false");
  });

  if (isEvidence) {
    updateEvidenceNoCaseHint();
    void loadEvidenceSummary();
    return;
  }

  if (isTimeline) {
    updateEvidenceNoCaseHint();
    renderTimelinePanel();
    return;
  }

  if (isGraph) {
    updateEvidenceNoCaseHint();
    renderGraphPanel();
  }
}

function handleCaseChange() {
  renderMainCanvas(getSelectedCaseFromCache());
  syncAddEvidenceButton();
  updateEvidenceNoCaseHint();

  if (elements.myCasesPaneEvidence && !elements.myCasesPaneEvidence.classList.contains("hidden")) {
    void loadEvidenceSummary();
  }
  if (elements.myCasesPaneTimeline && !elements.myCasesPaneTimeline.classList.contains("hidden")) {
    renderTimelinePanel();
  }
  if (elements.myCasesPaneGraph && !elements.myCasesPaneGraph.classList.contains("hidden")) {
    renderGraphPanel();
  }
}

elements.funcBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    setFuncPanel(btn.dataset.panel || "case");
  });
});

if (elements.caseSelect) {
  elements.caseSelect.addEventListener("change", () => {
    handleCaseChange();
  });
}

async function init() {
  try {
    await refreshCases();
    syncAddEvidenceButton();
    syncEvidenceUploadButton();
    updateEvidenceNoCaseHint();
  } catch (error) {
    const message = error?.message || String(error);
    if (
      message.includes("重新登录") ||
      message.includes("未登录") ||
      message.includes("令牌无效")
    ) {
      window.location.replace("./login.html");
      return;
    }
    alert(message || "加载案件失败");
  }
}

void init();
