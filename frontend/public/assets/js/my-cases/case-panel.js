import { createCase, listCases, updateCase } from "../api.js";
import {
  TEMPLATE_IDS,
  buildRightsCaseReport,
  getMissingFieldsForTemplate,
  listDocumentSnapshots,
  loadRightsCaseDraft,
  normalizeLegacyCaseToRightsCase,
  parseRightsCaseReport,
  saveRightsCaseDraft,
} from "../rights-case-model.js";
import {
  elements,
  escapeHtml,
  getSelectedCaseFromCache,
  state,
} from "./shared.js";
import { hydrateArchives } from "./archives-panel.js";

let casePanelInitialized = false;

function attachEditableCaseSections(caseItem) {
  const caseId = String(caseItem?.case_id || "").trim();
  if (!caseId) return;
  let saving = false;
  const fields = Array.from(document.querySelectorAll("[data-case-edit-field]"));
  fields.forEach((dd) => {
    const activate = () => {
      if (!dd || dd.dataset.editing === "1" || saving) return;
      const key = String(dd.dataset.caseEditField || "").trim();
      if (!key) return;
      const prev = String(dd.dataset.rawValue || "").trim();
      dd.dataset.editing = "1";
      dd.innerHTML = "";
      const input = document.createElement("input");
      input.type = "text";
      input.className = "my-cases-input my-cases-dialog-field";
      input.value = prev;
      input.style.width = "100%";
      dd.appendChild(input);
      input.focus();
      input.select();
      const commit = async () => {
        const next = String(input.value || "").trim();
        dd.dataset.editing = "0";
        dd.textContent = next || "（未填写）";
        dd.dataset.rawValue = next;
        if (next === prev) return;
        saving = true;
        try {
          const payload = {
            stage: key === "stage" ? next : String(caseItem.stage || "").trim(),
            respondent_name: key === "respondent_name" ? next : String(caseItem.respondent_name || "").trim(),
            reason: key === "reason" ? next : String(caseItem.reason || "").trim(),
            case_time: key === "case_time" ? next : String(caseItem.case_time || "").trim(),
            emergency_degree: key === "emergency_degree" ? next : String(caseItem.emergency_degree || "").trim(),
            request: key === "request" ? next : String(caseItem.request || "").trim(),
            details: key === "details" ? next : String(caseItem.details || "").trim(),
          };
          await updateCase(caseId, payload);
          caseItem.stage = payload.stage;
          caseItem.respondent_name = payload.respondent_name;
          caseItem.reason = payload.reason;
          caseItem.case_time = payload.case_time;
          caseItem.emergency_degree = payload.emergency_degree;
          caseItem.request = payload.request;
          caseItem.details = payload.details;
        } catch (e) {
          dd.textContent = prev || "（未填写）";
          dd.dataset.rawValue = prev;
          alert(e?.message || "请求失败，请稍后重试");
        } finally {
          saving = false;
        }
      };
      input.addEventListener("blur", () => {
        void commit();
      }, { once: true });
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          input.blur();
        } else if (e.key === "Escape") {
          e.preventDefault();
          dd.dataset.editing = "0";
          dd.textContent = prev || "（未填写）";
          dd.dataset.rawValue = prev;
        }
      });
    };
    dd.addEventListener("click", activate);
    dd.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        activate();
      }
    });
  });
}

function renderTemplateReadiness(caseItem) {
  const rightsCase = normalizeLegacyCaseToRightsCase(caseItem);
  const rows = TEMPLATE_IDS.map((templateId) => {
    const missing = getMissingFieldsForTemplate(rightsCase, templateId);
    return {
      templateId,
      missingCount: missing.length,
      missingPreview: missing.slice(0, 3).map((item) => item.label).join("、"),
    };
  }).sort((a, b) => a.missingCount - b.missingCount);

  const listHtml = rows
    .map((item) => {
      const title = item.templateId;
      if (!item.missingCount) {
        return `<li><strong>${escapeHtml(title)}</strong>：已具备生成条件</li>`;
      }
      const preview = item.missingPreview || "字段待补充";
      return `<li><strong>${escapeHtml(title)}</strong>：缺 ${item.missingCount} 项（${escapeHtml(preview)}）</li>`;
    })
    .join("");

  return `
    <section class="my-cases-detail-block" aria-labelledby="my-cases-doc-gap-h">
      <h3 id="my-cases-doc-gap-h" class="my-cases-detail-block-title">文书字段缺口诊断</h3>
      <ul class="my-cases-detail-text my-cases-detail-text--multiline">${listHtml}</ul>
    </section>
  `;
}

function renderDocumentSnapshotSummary(caseItem) {
  const caseId = String(caseItem?.case_id || "").trim();
  if (!caseId) return "";
  const snapshots = listDocumentSnapshots(caseId, 5);
  if (!snapshots.length) {
    return `
      <section class="my-cases-detail-block" aria-labelledby="my-cases-doc-history-h">
        <h3 id="my-cases-doc-history-h" class="my-cases-detail-block-title">文书生成快照</h3>
        <p class="my-cases-detail-text">暂无快照。可前往「文书生成」导出 Word/PDF 后自动沉淀。</p>
      </section>
    `;
  }
  const rows = snapshots.map((item) => {
    const when = String(item.createdAt || "").replace("T", " ").slice(0, 16);
    const channel = String(item.outputChannel || "preview");
    return `<li>${escapeHtml(when)} - ${escapeHtml(item.templateId || "unknown")} - ${escapeHtml(channel)} - 缺失 ${Number(item.missingFieldCount || 0)} 项</li>`;
  });
  return `
    <section class="my-cases-detail-block" aria-labelledby="my-cases-doc-history-h">
      <h3 id="my-cases-doc-history-h" class="my-cases-detail-block-title">文书生成快照</h3>
      <ul class="my-cases-detail-text my-cases-detail-text--multiline">${rows.join("")}</ul>
    </section>
  `;
}

function renderCaseReportTools(caseItem) {
  const caseId = String(caseItem?.case_id || "").trim();
  if (!caseId) return "";
  return `
    <section class="my-cases-detail-block" aria-labelledby="my-cases-report-tool-h">
      <h3 id="my-cases-report-tool-h" class="my-cases-detail-block-title">案情报告导出 / 反填</h3>
      <p class="my-cases-detail-text">可导出当前模型报告，或粘贴报告（含 \`\`\`rights-case-json 代码块）反填模型。</p>
      <div class="my-cases-head-actions" style="margin-top:8px;gap:8px;justify-content:flex-start;">
        <button type="button" class="liquid-glass" data-action="export-rights-case-report">导出案情报告</button>
        <button type="button" class="liquid-glass" data-action="apply-rights-case-report">报告反填模型</button>
      </div>
      <textarea id="rightsCaseReportInput" class="my-cases-input my-cases-dialog-field" rows="6" placeholder="将报告全文粘贴到这里，再点击「报告反填模型」"></textarea>
      <p id="rightsCaseReportStatus" class="my-cases-detail-text" style="margin-top:6px;"></p>
    </section>
  `;
}

function updateCaseReportStatus(msg) {
  const el = document.getElementById("rightsCaseReportStatus");
  if (!el) return;
  el.textContent = String(msg || "");
}

function updateLocalCaseFromRightsCase(caseId, rightsCase) {
  const id = String(caseId || "").trim();
  if (!id) return;
  const idx = state.casesCache.findIndex((item) => String(item.case_id || "") === id);
  if (idx < 0) return;
  const prev = state.casesCache[idx];
  const next = {
    ...prev,
    title: rightsCase?.meta?.title || prev.title,
    stage: rightsCase?.meta?.status || prev.stage,
    respondent_name: rightsCase?.participants?.respondent?.name || prev.respondent_name,
    reason: rightsCase?.facts?.caseCause || prev.reason,
    request: rightsCase?.claims?.summary || prev.request,
    details: rightsCase?.facts?.narrative || prev.details,
  };
  state.casesCache[idx] = next;
}

function handleExportRightsCaseReport() {
  const current = getSelectedCaseFromCache();
  if (!current) return;
  const caseId = String(current.case_id || "").trim();
  const draft = loadRightsCaseDraft(caseId);
  const rightsCase = draft && typeof draft === "object" ? draft : normalizeLegacyCaseToRightsCase(current);
  const report = buildRightsCaseReport(rightsCase);
  const blob = new Blob([report], { type: "text/markdown;charset=utf-8" });
  const a = document.createElement("a");
  const href = URL.createObjectURL(blob);
  a.href = href;
  a.download = `维权事项报告_${caseId || "未命名"}.md`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
  updateCaseReportStatus("报告已导出，可编辑后回填模型。");
}

function handleApplyRightsCaseReport() {
  const current = getSelectedCaseFromCache();
  if (!current) return;
  const caseId = String(current.case_id || "").trim();
  const input = document.getElementById("rightsCaseReportInput");
  const source = String(input?.value || "").trim();
  if (!source) {
    updateCaseReportStatus("请先粘贴报告内容。");
    return;
  }
  try {
    const base = loadRightsCaseDraft(caseId) || normalizeLegacyCaseToRightsCase(current);
    const parsed = parseRightsCaseReport(source, { baseCase: base });
    if (!parsed?.meta?.caseId) parsed.meta.caseId = caseId;
    saveRightsCaseDraft(caseId, parsed);
    updateLocalCaseFromRightsCase(caseId, parsed);
    renderMainCanvas(getSelectedCaseFromCache());
    updateCaseReportStatus("报告反填成功，模型已更新。");
  } catch (error) {
    updateCaseReportStatus(`反填失败：${error?.message || "报告格式不正确"}`);
  }
}

export function renderMainCanvas(caseItem) {
  if (!elements.myCasesMainCanvas) return;
  if (!caseItem) {
    elements.myCasesMainCanvas.innerHTML = `
      <div class="my-cases-canvas-inner">
        <p class="my-cases-empty-tip">暂无案件。请点击右上角「新建维权事项」，在弹出面板中填写信息后创建。</p>
      </div>
    `;
    return;
  }

  const row = (label, value, key = "") => {
    const v = escapeHtml(value);
    if (!String(value ?? "").trim()) return "";
    if (!key) {
      return `<div class="my-cases-detail-row"><span class="my-cases-detail-label">${escapeHtml(label)}</span><span class="my-cases-detail-value">${v}</span></div>`;
    }
    return `<div class="my-cases-detail-row"><span class="my-cases-detail-label">${escapeHtml(label)}</span><span class="my-cases-detail-value my-cases-archive-editable" data-case-edit-field="${escapeHtml(key)}" data-raw-value="${escapeHtml(value || "")}" tabindex="0" role="button">${v}</span></div>`;
  };

  const title = String(caseItem.title || caseItem.reason || "维权案件");
  const blocks = [
    `<h2 class="my-cases-detail-title">案件详情</h2>`,
    `<p class="my-cases-detail-lead">${escapeHtml(title)}</p>`,
    `<div class="my-cases-detail-grid">`,
    row("当前阶段", caseItem.stage, "stage"),
    row("创建时间", caseItem.build_time),
    row("紧急程度", caseItem.emergency_degree, "emergency_degree"),
    row("被申请人", caseItem.respondent_name, "respondent_name"),
    row("案由 / 争议", caseItem.reason, "reason"),
    row("争议时间", caseItem.case_time, "case_time"),
    `</div>`,
    `<section class="my-cases-detail-block" aria-labelledby="my-cases-req-h">`,
    `<h3 id="my-cases-req-h" class="my-cases-detail-block-title">诉求摘要</h3>`,
    `<p class="my-cases-detail-text my-cases-archive-editable" data-case-edit-field="request" data-raw-value="${escapeHtml(caseItem.request || "")}" tabindex="0" role="button">${escapeHtml(caseItem.request || "（未填写）")}</p>`,
    `</section>`,
    `<section class="my-cases-detail-block" aria-labelledby="my-cases-story-h">`,
    `<h3 id="my-cases-story-h" class="my-cases-detail-block-title">案情经过</h3>`,
    `<p class="my-cases-detail-text my-cases-detail-text--multiline my-cases-archive-editable" data-case-edit-field="details" data-raw-value="${escapeHtml(caseItem.details || "")}" tabindex="0" role="button">${escapeHtml(caseItem.details || "（未填写）")}</p>`,
    `</section>`,
    `<section class="my-cases-detail-block" aria-label="案件主体档案">`,
    `<div id="myCasesArchivesMount"><div class="my-cases-archive-empty">正在加载档案…</div></div>`,
    `</section>`,
  ];

  elements.myCasesMainCanvas.innerHTML = `<div class="my-cases-canvas-inner my-cases-canvas-inner--detail">${blocks.join("")}</div>`;

  const cid = String(caseItem.case_id || "").trim();
  const mount = document.getElementById("myCasesArchivesMount");
  if (cid && mount) {
    void hydrateArchives(mount, cid, async () => {
      await hydrateArchives(mount, cid, null);
    }).catch((e) => {
      mount.innerHTML = `<div class="my-cases-archive-empty">档案加载失败：${escapeHtml(e?.message || String(e))}</div>`;
    });
  }
  attachEditableCaseSections(caseItem);
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
  state.casesCache.forEach((item) => {
    const caseId = String(item.case_id || "").trim();
    if (!caseId) return;
    saveRightsCaseDraft(caseId, normalizeLegacyCaseToRightsCase(item));
  });
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
  window.setTimeout(() => elements.newCaseName?.focus(), 0);
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
      const caseName = String(elements.newCaseName?.value || "").trim();
      if (!caseName) {
        setNewCaseDialogError("请填写案件名称");
        elements.newCaseName?.focus();
        return;
      }

      if (elements.newCaseDialogSubmit) {
        elements.newCaseDialogSubmit.disabled = true;
      }

      try {
        const result = await createCase({ case_name: caseName, stage: "暂存" });
        const createdCaseId = String(result?.case?.case_id || "").trim();
        if (createdCaseId) {
          saveRightsCaseDraft(
            createdCaseId,
            normalizeLegacyCaseToRightsCase({
              ...result.case,
              case_id: createdCaseId,
              reason: caseName,
              stage: "暂存",
            }),
          );
        }
        if (elements.newCaseName) elements.newCaseName.value = "";
        closeNewCaseDialog();
        await refreshCases({ preferredCaseId: createdCaseId });
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

  if (elements.myCasesMainCanvas) {
    elements.myCasesMainCanvas.addEventListener("click", (event) => {
      const target = event.target.closest("[data-action]");
      if (!target) return;
      const action = String(target.dataset.action || "").trim();
      if (action === "export-rights-case-report") {
        handleExportRightsCaseReport();
      } else if (action === "apply-rights-case-report") {
        handleApplyRightsCaseReport();
      }
    });
  }
}