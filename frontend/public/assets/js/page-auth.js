import { clearAuthSession, getCurrentUser, isAuthenticated } from "./auth.js";

function resolveElement(target) {
  if (!target) return null;
  if (typeof target === "string") {
    return document.getElementById(target) || document.querySelector(target);
  }
  return target;
}

function resolveLogoutElement(target) {
  return (
    resolveElement(target) ||
    document.getElementById("logoutBtn") ||
    document.getElementById("mainLogoutBtn")
  );
}

export function redirectIfAuthenticated(target = "/") {
  if (!isAuthenticated()) return false;
  window.location.replace(target);
  return true;
}

/** 与 React Navbar 一致：同步 #userWelcome / #logoutBtn / #authActionBtn */
export function syncPublicNavbarAuthUI(options = {}) {
  const { loginPage = "/login", fallbackName = "用户" } = options;
  const loggedIn = isAuthenticated();
  const user = getCurrentUser();
  const userWelcome = document.getElementById("userWelcome");
  const authActionBtn = document.getElementById("authActionBtn");
  const logoutBtn = document.getElementById("logoutBtn");

  if (userWelcome) {
    userWelcome.textContent = loggedIn ? `你好，${user?.name || fallbackName}` : "";
  }
  if (authActionBtn) {
    authActionBtn.textContent = loggedIn ? "个人中心" : "登录";
    authActionBtn.href = loggedIn ? "/profile" : loginPage;
  }
  if (logoutBtn) {
    logoutBtn.style.display = loggedIn ? "inline-flex" : "none";
  }
}

/**
 * 需要登录的 legacy 页：校验登录后同步导航，并可选绑定退出按钮。
 * @param {{ loginPage?: string, logoutEl?: string|null, fallbackName?: string, onLogout?: function|null }} options
 */
export function setupProtectedPage(options = {}) {
  const {
    loginPage = "/login",
    logoutEl = "logoutBtn",
    fallbackName = "用户",
    onLogout = null,
  } = options;

  if (!isAuthenticated()) {
    window.location.replace(loginPage);
    return null;
  }

  const user = getCurrentUser();
  syncPublicNavbarAuthUI({ loginPage, fallbackName });

  const logoutNode = resolveLogoutElement(logoutEl);
  if (logoutNode) {
    logoutNode.addEventListener("click", () => {
      clearAuthSession();
      syncPublicNavbarAuthUI({ loginPage, fallbackName });
      if (typeof onLogout === "function") {
        onLogout();
        return;
      }
      window.location.replace(loginPage);
    });
  }

  return user;
}
