import { setupProtectedPage } from "./page-auth.js";

setupProtectedPage();

const detailCard = document.getElementById("faqDetailCard");

function parseFaqIdFromPath() {
  const parts = String(window.location.pathname || "").split("/").filter(Boolean);
  const maybeId = Number(parts[parts.length - 1]);
  return Number.isFinite(maybeId) && maybeId > 0 ? maybeId : null;
}

function readFaqDetail(faqId) {
  if (!faqId) return null;
  try {
    const raw = window.sessionStorage.getItem(`consultFaqDetail:${faqId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function renderFaqDetail(item) {
  if (!detailCard) return;
  if (!item) {
    detailCard.innerHTML = '<p class="consult-faq-detail-empty">未找到详情内容，请返回列表后重新进入。</p>';
    return;
  }

  const query = String(item.query || "");
  const queryDetail = String(item.query_detail || "");
  const answer = String(item.answer || "");
  const answerDetail = String(item.answer_detail || "");

  detailCard.innerHTML = "";

  const q = document.createElement("p");
  q.className = "consult-faq-detail-q";
  q.textContent = `Q: ${query}`;

  const qd = document.createElement("p");
  qd.className = "consult-faq-detail-q-detail";
  qd.textContent = `问题详情：${queryDetail}`;

  const a = document.createElement("p");
  a.className = "consult-faq-detail-a";
  a.textContent = `A: ${answer}`;

  const ad = document.createElement("p");
  ad.className = "consult-faq-detail-a-detail";
  ad.textContent = `回答详情：${answerDetail}`;

  detailCard.appendChild(q);
  detailCard.appendChild(qd);
  detailCard.appendChild(a);
  detailCard.appendChild(ad);
}

const faqId = parseFaqIdFromPath();
const detail = readFaqDetail(faqId);
renderFaqDetail(detail);
