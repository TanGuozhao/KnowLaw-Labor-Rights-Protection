import { listConsultFaqs } from "./api.js";
import { setupProtectedPage } from "./page-auth.js";

setupProtectedPage();

const faqPageList = document.getElementById("faqPageList");
const faqPageIndicator = document.getElementById("faqPageIndicator");
const faqPagePrevBtn = document.getElementById("faqPagePrevBtn");
const faqPageNextBtn = document.getElementById("faqPageNextBtn");
const sortComprehensiveBtn = document.getElementById("sortComprehensiveBtn");
const sortAscBtn = document.getElementById("sortAscBtn");
const sortDescBtn = document.getElementById("sortDescBtn");
const faqSearchInput = document.getElementById("faqSearchInput");
const faqSearchBtn = document.getElementById("faqSearchBtn");

const state = {
  page: 1,
  totalPages: 1,
  sort: "comprehensive",
  keyword: "",
  pageSize: 9,
};

function setSortButtons() {
  const map = {
    comprehensive: sortComprehensiveBtn,
    asc: sortAscBtn,
    desc: sortDescBtn,
  };
  [sortComprehensiveBtn, sortAscBtn, sortDescBtn].forEach((btn) => btn?.classList.remove("active"));
  map[state.sort]?.classList.add("active");
}

function updatePagination() {
  if (faqPageIndicator) {
    faqPageIndicator.textContent = `第${state.page}页 / 共${state.totalPages}页`;
  }
  if (faqPagePrevBtn) faqPagePrevBtn.disabled = state.page <= 1;
  if (faqPageNextBtn) faqPageNextBtn.disabled = state.page >= state.totalPages;
}

function renderFaqList(items) {
  if (!faqPageList) return;
  faqPageList.innerHTML = "";
  if (!Array.isArray(items) || items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "consult-faqs-empty";
    empty.textContent = "未找到匹配的常见问题解答";
    faqPageList.appendChild(empty);
    return;
  }

  items.forEach((item) => {
    const faqId = Number(item?.faq_id);
    if (!Number.isFinite(faqId) || faqId <= 0) return;
    const card = document.createElement("article");
    card.className = "consult-faqs-item";
    card.setAttribute("role", "listitem");
    card.tabIndex = 0;
    card.setAttribute("aria-label", "查看问题详情");

    const q = document.createElement("p");
    q.className = "consult-faqs-q";
    q.textContent = `Q: ${item?.query || ""}`;

    const qd = document.createElement("p");
    qd.className = "consult-faqs-q-detail";
    qd.textContent = `问题详情：${item?.query_detail || ""}`;

    const a = document.createElement("p");
    a.className = "consult-faqs-a";
    a.textContent = `A: ${item?.answer || ""}`;

    const ad = document.createElement("p");
    ad.className = "consult-faqs-a-detail";
    ad.textContent = `回答详情：${item?.answer_detail || ""}`;

    card.appendChild(q);
    card.appendChild(qd);
    card.appendChild(a);
    card.appendChild(ad);

    const openDetail = () => {
      try {
        window.sessionStorage.setItem(`consultFaqDetail:${faqId}`, JSON.stringify(item));
      } catch {
        // Ignore session storage write failure and continue navigation.
      }
      window.location.href = `/consult-faqs/${faqId}`;
    };

    card.addEventListener("click", openDetail);
    card.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openDetail();
    });

    faqPageList.appendChild(card);
  });
}

async function refreshList() {
  const result = await listConsultFaqs({
    page: state.page,
    pageSize: state.pageSize,
    sort: state.sort,
    keyword: state.keyword,
  });
  state.page = Math.max(1, Number(result?.page) || 1);
  state.totalPages = Math.max(1, Number(result?.total_pages) || 1);
  renderFaqList(Array.isArray(result?.items) ? result.items : []);
  setSortButtons();
  updatePagination();
}

faqPagePrevBtn?.addEventListener("click", () => {
  if (state.page <= 1) return;
  state.page -= 1;
  void refreshList();
});

faqPageNextBtn?.addEventListener("click", () => {
  if (state.page >= state.totalPages) return;
  state.page += 1;
  void refreshList();
});

sortComprehensiveBtn?.addEventListener("click", () => {
  state.sort = "comprehensive";
  state.page = 1;
  void refreshList();
});

sortAscBtn?.addEventListener("click", () => {
  state.sort = "asc";
  state.page = 1;
  void refreshList();
});

sortDescBtn?.addEventListener("click", () => {
  state.sort = "desc";
  state.page = 1;
  void refreshList();
});

faqSearchBtn?.addEventListener("click", () => {
  state.keyword = String(faqSearchInput?.value || "").trim();
  state.page = 1;
  void refreshList();
});

faqSearchInput?.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  state.keyword = String(faqSearchInput.value || "").trim();
  state.page = 1;
  void refreshList();
});

void refreshList();
