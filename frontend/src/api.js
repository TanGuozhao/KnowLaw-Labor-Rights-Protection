import { getAuthToken } from "./auth";

const API_BASE_URL =
  window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? "http://localhost:8080/api"
    : "/api";

async function api(path, options = {}) {
  const token = getAuthToken();
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body && !(options.body instanceof FormData)) headers["Content-Type"] = "application/json";
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
    body:
      options.body && !(options.body instanceof FormData) ? JSON.stringify(options.body) : options.body,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(data.message || "请求失败");
  return data;
}

function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function apiDownload(path, payload, fallbackFilename) {
  const token = getAuthToken();
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload || {}),
  });
  if (!res.ok) {
    let msg = "下载失败";
    try {
      const data = await res.json();
      msg = data?.message || msg;
    } catch {
      // noop
    }
    throw new Error(msg);
  }
  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") || "";
  const m = /filename="([^"]+)"/i.exec(disposition);
  triggerBlobDownload(blob, m?.[1] || fallbackFilename);
}

export const retrievalCases = (payload) => api("/retrieval", { method: "POST", body: payload });
export const getLawInfo = (lawId) => api(`/law-info?lawId=${encodeURIComponent(lawId)}&merge=true`);
export const authRegister = (payload) => api("/auth/register", { method: "POST", body: payload });
export const authLogin = (payload) => api("/auth/login", { method: "POST", body: payload });
export const authMe = () => api("/auth/me");
export const authLogout = () => api("/auth/logout", { method: "POST" });
export const listConversations = () => api("/conversations");
export const createConversation = (payload = {}) => api("/conversations", { method: "POST", body: payload });
export const deleteConversation = (id) => api(`/conversations/${encodeURIComponent(id)}`, { method: "DELETE" });
export const listConversationMessages = (id) => api(`/conversations/${encodeURIComponent(id)}/messages`);
export const updateConversation = (id, payload) =>
  api(`/conversations/${encodeURIComponent(id)}`, { method: "PATCH", body: payload });
export const sendConversationMessage = (id, payload) =>
  api(`/conversations/${encodeURIComponent(id)}/messages`, { method: "POST", body: payload });
export const listConsultFaqs = ({ page = 1, pageSize = 10, keyword = "", sort = "comprehensive" } = {}) =>
  api(
    `/consult-faqs?page=${encodeURIComponent(page)}&pageSize=${encodeURIComponent(pageSize)}&keyword=${encodeURIComponent(keyword)}&sort=${encodeURIComponent(sort)}`,
  );
export const listCases = () => api("/cases");
export const createCase = (payload) => api("/cases", { method: "POST", body: payload });
export const listCaseEvidence = (caseId) => api(`/cases/${encodeURIComponent(caseId)}/evidence`);
export const addCaseEvidence = (caseId, payload) =>
  api(`/cases/${encodeURIComponent(caseId)}/evidence`, { method: "POST", body: payload });
export const runContractReview = (payload) => api("/contract-review/run", { method: "POST", body: payload });
export const runContractSummary = (payload) =>
  api("/contract-review/summary", { method: "POST", body: payload });
export const uploadEvidenceOcr = (file) => {
  const fd = new FormData();
  fd.append("file", file);
  return api("/evidence/ocr", { method: "POST", body: fd });
};
export const polishDocumentDraft = (payload) => api("/documents/polish", { method: "POST", body: payload });
export const extractLaborComplaintFields = (payload) =>
  api("/documents/extract-fields", { method: "POST", body: payload });
export const downloadLaborComplaintDocx = (payload) =>
  apiDownload("/documents/labor-complaint-docx", payload, "劳动保障监察投诉书_已填写.docx");
export const downloadCivilComplaintDocx = (payload) =>
  apiDownload("/documents/civil-complaint-docx", payload, "民事起诉状_已填写.docx");
export const downloadEnforcementApplicationDocx = (payload) =>
  apiDownload("/documents/enforcement-application-docx", payload, "申请执行书_已填写.docx");
export const downloadEvidenceListDocx = (payload) =>
  apiDownload("/documents/evidence-list-docx", payload, "证据材料清单_已填写.docx");
export const downloadLaborArbitrationApplicationDocx = (payload) =>
  apiDownload("/documents/labor-arbitration-application-docx", payload, "劳动人事争议仲裁申请书_已填写.docx");
export const downloadLaborMediationApplicationDocx = (payload) =>
  apiDownload("/documents/labor-mediation-application-docx", payload, "劳动争议调解申请书_已填写.docx");
