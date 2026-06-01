import { getPublicConsultDetail } from "./api.js";
import { setupProtectedPage } from "./page-auth.js";

const consultDetailTitle = document.getElementById("consultDetailTitle");
const consultDetailMeta = document.getElementById("consultDetailMeta");
const consultDetailBody = document.getElementById("consultDetailBody");
const consultDetailSourceBtn = document.getElementById("consultDetailSourceBtn");

setupProtectedPage();

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");
}

function renderError(msg) {
  if (!consultDetailBody) return;
  consultDetailBody.innerHTML = `<div class="consult-block"><h3 class="consult-block-title">加载失败</h3><div class="consult-block-text">${escapeHtml(
    msg || "请稍后重试"
  )}</div></div>`;
}

function renderConsult(consult) {
  if (!consultDetailBody) return;
  const title = consult?.consulttitle || "问题咨询";
  const ctime = consult?.consulttime || "";
  const ctype = consult?.consulttype || "";
  const content = consult?.consultcontent || "";
  const replies = Array.isArray(consult?.replies) ? consult.replies : [];

  if (consultDetailTitle) consultDetailTitle.textContent = String(title);
  if (consultDetailMeta) {
    consultDetailMeta.textContent = [
      ctype ? `类别：${ctype}` : "",
      ctime ? `提问时间：${ctime}` : "",
    ]
      .filter(Boolean)
      .join(" · ");
  }
  if (consultDetailSourceBtn) {
    consultDetailSourceBtn.href = consult?.source_url || "#";
    consultDetailSourceBtn.classList.toggle("disabled", !consult?.source_url);
  }

  const replyBlocks = replies.length
    ? replies
        .map((r, idx) => {
          const rtime = escapeHtml(r?.replytime || "");
          const rbody = escapeHtml(r?.replycontent || "");
          const whoRaw =
            r?.lawyertype === 1
              ? r?.lawyernumber
              : r?.lawyertype === 2
              ? r?.expertnumber
              : "";
          const who = escapeHtml(whoRaw || "");
          const meta = [
            who ? `<span>答复人：${who}</span>` : "",
            rtime ? `<span>回答时间：${rtime}</span>` : "",
          ]
            .filter(Boolean)
            .join("");
          return `<div class="consult-block consult-reply">
            <h3 class="consult-block-title">回答 ${idx + 1}</h3>
            <div class="consult-block-meta">${meta}</div>
            <div class="consult-block-text">${rbody || "（无正文）"}</div>
          </div>`;
        })
        .join("")
    : `<div class="consult-block consult-reply">
        <h3 class="consult-block-title">回答</h3>
        <div class="consult-block-text">（暂无公开回复内容）</div>
      </div>`;

  consultDetailBody.innerHTML = `
    <div class="consult-block">
      <h3 class="consult-block-title">问题</h3>
      <div class="consult-block-meta">
        ${ctime ? `<span>提问时间：${escapeHtml(ctime)}</span>` : ""}
      </div>
      <div class="consult-block-text">${escapeHtml(title)}</div>
    </div>
    <div class="consult-block">
      <h3 class="consult-block-title">问题详情</h3>
      <div class="consult-block-text">${escapeHtml(content) || "（未提供详情）"}</div>
    </div>
    ${replyBlocks}
  `;
}

async function init() {
  const params = new URLSearchParams(window.location.search);
  const pkid = String(params.get("pkid") || "").trim();
  if (!pkid) {
    renderError("缺少 pkid 参数，无法加载咨询详情");
    return;
  }
  try {
    const data = await getPublicConsultDetail(pkid);
    const consult = data?.consult;
    if (!consult) {
      renderError("未获取到咨询详情");
      return;
    }
    renderConsult(consult);
  } catch (e) {
    renderError(e?.message || "加载失败，请稍后重试");
  }
}

void init();