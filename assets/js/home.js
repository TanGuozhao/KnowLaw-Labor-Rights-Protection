import { clearAuthSession, getCurrentUser, isAuthenticated } from "./auth.js";

const authActionBtn = document.getElementById("authActionBtn");
const homeCtaBtn = document.getElementById("homeCtaBtn");
const userWelcome = document.getElementById("userWelcome");
const logoutBtn = document.getElementById("logoutBtn");

function refreshHomeAuthUI() {
  const loggedIn = isAuthenticated();
  const user = getCurrentUser();

  if (userWelcome) {
    userWelcome.textContent = loggedIn ? `你好，${user?.name || "用户"}` : "";
  }

  if (authActionBtn) {
    authActionBtn.textContent = loggedIn ? "个人中心" : "登录";
    authActionBtn.href = loggedIn ? "./profile.html" : "./login.html";
  }

  if (homeCtaBtn) {
    homeCtaBtn.textContent = loggedIn ? "开始吧" : "开始吧";
    homeCtaBtn.href = loggedIn ? "./main.html" : "./main.html";
  }

  if (logoutBtn) {
    logoutBtn.style.display = loggedIn ? "inline-flex" : "none";
  }
}

if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    clearAuthSession();
    refreshHomeAuthUI();
  });
}

refreshHomeAuthUI();

// Full-page scroll: wheel down/up -> snap to next/prev section
const homeSnap = document.getElementById("homeSnap");
const homeScrollDown = document.getElementById("homeScrollDown");

if (homeSnap) {
  const sections = Array.from(homeSnap.querySelectorAll(".home-section"));
  let isAnimating = false;

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function computeIndex() {
    const h = Math.max(1, homeSnap.clientHeight);
    return clamp(Math.round(homeSnap.scrollTop / h), 0, sections.length - 1);
  }

  function scrollToIndex(nextIndex) {
    if (nextIndex < 0 || nextIndex >= sections.length) return;
    if (!sections[nextIndex]) return;

    isAnimating = true;
    sections[nextIndex].scrollIntoView({ behavior: "smooth", block: "start" });

    // Prevent rapid wheel/trackpad triggering during smooth scroll
    window.setTimeout(() => {
      isAnimating = false;
    }, 900);
  }

  function updateScrollDownBtn() {
    if (!homeScrollDown) return;
    const idx = computeIndex();
    const canDown = idx < sections.length - 1;
    homeScrollDown.classList.toggle("is-visible", canDown);
    const onLightPanel = idx === 1 || idx === 3;
    homeScrollDown.classList.toggle("home-scroll-down--light", onLightPanel);
  }

  updateScrollDownBtn();
  homeSnap.addEventListener("scroll", updateScrollDownBtn, { passive: true });

  if (homeScrollDown) {
    homeScrollDown.addEventListener("click", () => {
      if (isAnimating) return;
      const idx = computeIndex();
      scrollToIndex(idx + 1);
    });
  }

  homeSnap.addEventListener(
    "wheel",
    (event) => {
      // If user is holding shift/page up/down etc, just let the default happen.
      if (event.shiftKey) return;
      if (isAnimating) return;
      if (sections.length <= 1) return;

      const dy = event.deltaY;
      if (Math.abs(dy) < 12) return;

      event.preventDefault();

      const idx = computeIndex();
      const dir = dy > 0 ? 1 : -1;
      const next = idx + dir;
      scrollToIndex(next);
    },
    { passive: false },
  );
}

