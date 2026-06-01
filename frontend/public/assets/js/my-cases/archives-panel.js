import {
  createCaseEmployer,
  createCaseLaborer,
  fetchCaseArchives,
  importLaborerFromMe,
  updateCaseEmployer,
  updateCaseLaborer,
} from "../api.js";

const qs = (id) => document.getElementById(id);

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function setError(el, msg) {
  if (!el) return;
  el.textContent = msg || "";
  el.classList.toggle("hidden", !msg);
}

function safeShowDialog(dialog) {
  if (!dialog) return;
  try {
    if (!dialog.open) dialog.showModal();
  } catch {
    dialog.setAttribute("open", "true");
  }
}

function safeCloseDialog(dialog) {
  if (!dialog) return;
  try {
    dialog.close();
  } catch {
    dialog.removeAttribute("open");
  }
}

function buildDetailDl(fields) {
  const rows = (fields || [])
    .filter((p) => p && p.label)
    .map((f) => {
      const val = String(f.value || "");
      const display = val || "—";
      return `<dt>${escapeHtml(f.label)}</dt><dd class="my-cases-archive-editable" data-field-key="${escapeHtml(f.key)}" tabindex="0" role="button">${escapeHtml(display)}</dd>`;
    })
    .join("");
  return `<dl>${rows}</dl>`;
}

export function renderArchivesIntoContainer(container, { caseId, archives, onChanged }) {
  if (!container) return;
  const laborer = archives?.laborer || null;
  const employer = archives?.employer || null;

  const laborerCard = laborer
    ? `
      <div class="my-cases-archive-card" id="laborerArchiveCard" role="button" tabindex="0" aria-label="查看当事人档案详情">
        <div class="my-cases-archive-card-title">${escapeHtml(laborer.name || "未命名劳动者")}</div>
        <div class="my-cases-archive-card-meta">
          <span>性别：${escapeHtml(laborer.gender || "—")}</span>
          <span>手机号：${escapeHtml(laborer.phone || "—")}</span>
        </div>
      </div>
    `
    : `<div class="my-cases-archive-empty">尚未添加当事人档案。</div>`;

  const employerCard = employer
    ? `
      <div class="my-cases-archive-card" id="employerArchiveCard" role="button" tabindex="0" aria-label="查看用人单位档案详情">
        <div class="my-cases-archive-card-title">${escapeHtml(employer.respondent || "未命名用人单位")}</div>
        <div class="my-cases-archive-card-meta">
          <span>法定代表人：${escapeHtml(employer.respondentLegalRepresentative || "—")}</span>
          <span>联系电话：${escapeHtml(employer.respondentContactPhone || "—")}</span>
        </div>
      </div>
    `
    : `<div class="my-cases-archive-empty">尚未添加用人单位档案。</div>`;

  container.innerHTML = `
    <section class="my-cases-archive-block" aria-label="当事人档案">
      <div class="my-cases-archive-head">
        <h3>当事人档案</h3>
        <button type="button" class="liquid-glass my-cases-archive-add-btn" id="laborerArchiveAddBtn">添加档案</button>
      </div>
      ${laborerCard}
    </section>
    <section class="my-cases-archive-block" aria-label="用人单位档案">
      <div class="my-cases-archive-head">
        <h3>用人单位档案</h3>
        <button type="button" class="liquid-glass my-cases-archive-add-btn" id="employerArchiveAddBtn">添加档案</button>
      </div>
      ${employerCard}
    </section>
    <div class="my-cases-archive-reserved-space" aria-hidden="true"></div>
  `;

  const laborerAddBtn = qs("laborerArchiveAddBtn");
  const employerAddBtn = qs("employerArchiveAddBtn");
  const laborerCardEl = qs("laborerArchiveCard");
  const employerCardEl = qs("employerArchiveCard");

  if (laborerAddBtn) laborerAddBtn.onclick = () => openLaborerAddDialog(caseId, onChanged);
  if (employerAddBtn) employerAddBtn.onclick = () => openEmployerFormDialog(caseId, onChanged);

  if (laborerCardEl) {
    const open = () => openDetailDialog({
      title: "当事人档案",
      caseId,
      kind: "laborer",
      payload: laborerToPayload(laborer),
      fields: laborerToFields(laborer),
      onChanged,
    });
    laborerCardEl.onclick = open;
    laborerCardEl.onkeydown = (e) => {
      if (e.key === "Enter" || e.key === " ") open();
    };
  }
  if (employerCardEl) {
    const open = () => openDetailDialog({
      title: "用人单位档案",
      caseId,
      kind: "employer",
      payload: employerToPayload(employer),
      fields: employerToFields(employer),
      onChanged,
    });
    employerCardEl.onclick = open;
    employerCardEl.onkeydown = (e) => {
      if (e.key === "Enter" || e.key === " ") open();
    };
  }
}

function laborerToFields(l) {
  if (!l) return [];
  return [
    { key: "name", label: "姓名", value: l.name },
    { key: "relation_to_me", label: "与本人关系", value: l.relation_to_me },
    { key: "gender", label: "性别", value: l.gender },
    { key: "phone", label: "手机号", value: l.phone },
    { key: "id_card", label: "身份证号", value: l.id_card },
    { key: "email", label: "邮箱", value: l.email },
    { key: "birth_date", label: "出生日期", value: l.birth_date },
    { key: "ethnicity", label: "民族", value: l.ethnicity },
    { key: "landline_phone", label: "固定电话", value: l.landline_phone },
    { key: "postal_code", label: "邮编", value: l.postal_code },
    { key: "region", label: "地区", value: l.region },
    { key: "home_addr", label: "家庭住址", value: l.home_addr },
    { key: "occupation", label: "职业", value: l.occupation },
    { key: "school", label: "学校", value: l.school },
  ];
}

function laborerToPayload(l) {
  return {
    name: l?.name || "",
    relation_to_me: l?.relation_to_me || "",
    gender: l?.gender || "",
    phone: l?.phone || "",
    id_card: l?.id_card || "",
    email: l?.email || "",
    birth_date: l?.birth_date || "",
    ethnicity: l?.ethnicity || "",
    landline_phone: l?.landline_phone || "",
    postal_code: l?.postal_code || "",
    region: l?.region || "",
    home_addr: l?.home_addr || "",
    occupation: l?.occupation || "",
    school: l?.school || "",
  };
}

function employerToFields(e) {
  if (!e) return [];
  return [
    { key: "respondent", label: "单位名称", value: e.respondent },
    { key: "respondentRegisteredAddress", label: "注册地址", value: e.respondentRegisteredAddress },
    { key: "respondentBusinessRegion", label: "实际办公/经营地点", value: e.respondentBusinessRegion },
    { key: "respondentBusinessDetail", label: "实际办公/经营详细地址", value: e.respondentBusinessDetail },
    { key: "respondentLegalRepresentative", label: "法定代表人/主要负责人", value: e.respondentLegalRepresentative },
    { key: "respondentContactName", label: "联系人", value: e.respondentContactName },
    { key: "respondentContactJobTitle", label: "职务", value: e.respondentContactJobTitle },
    { key: "respondentContactPhone", label: "联系电话", value: e.respondentContactPhone },
    { key: "respondentPostalCode", label: "邮编", value: e.respondentPostalCode },
  ];
}

function employerToPayload(e) {
  return {
    respondent: e?.respondent || "",
    respondentRegisteredAddress: e?.respondentRegisteredAddress || "",
    respondentBusinessRegion: e?.respondentBusinessRegion || "",
    respondentBusinessDetail: e?.respondentBusinessDetail || "",
    respondentLegalRepresentative: e?.respondentLegalRepresentative || "",
    respondentContactName: e?.respondentContactName || "",
    respondentContactJobTitle: e?.respondentContactJobTitle || "",
    respondentContactPhone: e?.respondentContactPhone || "",
    respondentPostalCode: e?.respondentPostalCode || "",
  };
}

function attachEditableHandlers(body, fields, draft, { caseId, kind, onChanged }) {
  const fieldMap = new Map((fields || []).map((f) => [f.key, f]));
  let saving = false;
  const persistDraft = async () => {
    if (kind === "laborer") {
      try {
        await updateCaseLaborer(caseId, draft);
      } catch {
        // Backward compatibility: older backend may not support PATCH yet.
        await createCaseLaborer(caseId, draft);
      }
      return;
    }
    try {
      await updateCaseEmployer(caseId, draft);
    } catch {
      // Backward compatibility: older backend may not support PATCH yet.
      await createCaseEmployer(caseId, draft);
    }
  };
  const activate = (dd) => {
    if (!dd || dd.dataset.editing === "1") return;
    const key = dd.dataset.fieldKey;
    if (!key || !fieldMap.has(key)) return;
    dd.dataset.editing = "1";
    const value = draft[key] ?? "";
    const input = document.createElement("input");
    input.type = "text";
    input.className = "my-cases-input my-cases-dialog-field";
    input.value = String(value);
    input.style.width = "100%";
    dd.innerHTML = "";
    dd.appendChild(input);
    input.focus();
    input.select();
    const commit = async () => {
      if (saving) return;
      const next = String(input.value || "").trim();
      const prev = String(draft[key] || "").trim();
      draft[key] = next;
      dd.dataset.editing = "0";
      dd.textContent = next || "—";
      if (next === prev) return;
      saving = true;
      try {
        await persistDraft();
        if (onChanged) await onChanged();
      } catch (e) {
        draft[key] = prev;
        dd.textContent = prev || "—";
        alert(e?.message || String(e));
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
        dd.textContent = String(draft[key] || "").trim() || "—";
      }
    });
  };
  body.querySelectorAll("dd.my-cases-archive-editable").forEach((dd) => {
    dd.addEventListener("click", () => activate(dd));
    dd.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        activate(dd);
      }
    });
  });
}

function openDetailDialog({ title, caseId, kind, payload, fields, onChanged }) {
  const dlg = qs("archiveDetailDialog");
  const h = qs("archiveDetailTitle");
  const sub = qs("archiveDetailSubtitle");
  const body = qs("archiveDetailBody");
  const close = qs("archiveDetailClose");
  if (h) h.textContent = title;
  if (sub) sub.textContent = "";
  const draft = { ...(payload || {}) };
  if (body) {
    body.innerHTML = buildDetailDl(fields);
    attachEditableHandlers(body, fields, draft, { caseId, kind, onChanged });
  }
  if (close) close.onclick = () => safeCloseDialog(dlg);
  safeShowDialog(dlg);
}

function openLaborerAddDialog(caseId, onChanged) {
  const dlg = qs("laborerAddDialog");
  const close = qs("laborerAddDialogClose");
  const importCard = qs("laborerImportMeCard");
  const createCard = qs("laborerCreateNewCard");

  if (close) close.onclick = () => safeCloseDialog(dlg);
  if (importCard) {
    importCard.onclick = async () => {
      importCard.disabled = true;
      try {
        await importLaborerFromMe(caseId);
        safeCloseDialog(dlg);
        if (onChanged) await onChanged();
      } catch (e) {
        alert(e?.message || String(e));
      } finally {
        importCard.disabled = false;
      }
    };
  }
  if (createCard) {
    createCard.onclick = () => {
      safeCloseDialog(dlg);
      openLaborerFormDialog(caseId, onChanged);
    };
  }
  safeShowDialog(dlg);
}

function openLaborerFormDialog(caseId, onChanged) {
  const dlg = qs("laborerFormDialog");
  const form = qs("laborerForm");
  const err = qs("laborerFormError");
  const cancel = qs("laborerFormCancel");

  if (cancel) cancel.onclick = () => safeCloseDialog(dlg);
  if (form) {
    form.onsubmit = async (ev) => {
      ev.preventDefault();
      setError(err, "");
      const payload = {
        name: qs("laborerName")?.value || "",
        relation_to_me: qs("laborerRelationToMe")?.value || "",
        gender: qs("laborerGender")?.value || "",
        phone: qs("laborerPhone")?.value || "",
        id_card: qs("laborerIdCard")?.value || "",
        email: qs("laborerEmail")?.value || "",
        region: qs("laborerRegion")?.value || "",
        home_addr: qs("laborerHomeAddr")?.value || "",
        occupation: qs("laborerOccupation")?.value || "",
        school: qs("laborerSchool")?.value || "",
      };
      try {
        await createCaseLaborer(caseId, payload);
        safeCloseDialog(dlg);
        if (onChanged) await onChanged();
        form.reset();
      } catch (e) {
        setError(err, e?.message || String(e));
      }
    };
  }
  safeShowDialog(dlg);
}

function openEmployerFormDialog(caseId, onChanged) {
  const dlg = qs("employerFormDialog");
  const form = qs("employerForm");
  const err = qs("employerFormError");
  const cancel = qs("employerFormCancel");

  if (cancel) cancel.onclick = () => safeCloseDialog(dlg);
  if (form) {
    form.onsubmit = async (ev) => {
      ev.preventDefault();
      setError(err, "");
      const payload = {
        respondent: qs("employerRespondent")?.value || "",
        respondentLegalRepresentative: qs("employerLegalRep")?.value || "",
        respondentContactName: qs("employerContactName")?.value || "",
        respondentContactJobTitle: qs("employerContactJobTitle")?.value || "",
        respondentContactPhone: qs("employerContactPhone")?.value || "",
        respondentRegisteredAddress: qs("employerRegisteredAddress")?.value || "",
        respondentBusinessRegion: qs("employerBusinessRegion")?.value || "",
        respondentBusinessDetail: qs("employerBusinessDetail")?.value || "",
        respondentPostalCode: qs("employerPostalCode")?.value || "",
      };
      try {
        await createCaseEmployer(caseId, payload);
        safeCloseDialog(dlg);
        if (onChanged) await onChanged();
        form.reset();
      } catch (e) {
        setError(err, e?.message || String(e));
      }
    };
  }
  safeShowDialog(dlg);
}

export async function hydrateArchives(container, caseId, onChanged) {
  const data = await fetchCaseArchives(caseId);
  renderArchivesIntoContainer(container, { caseId, archives: data, onChanged });
  return data;
}

