import {
  clearAuthSession,
  getCurrentUser,
  isAuthenticated,
  isAuthFailureMessage,
  setCurrentUser,
} from "./auth.js";
import { getCurrentProfile } from "./api.js";

let sessionValidationPromise = null;

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
    document.getElementById("mainLogoutBtn") ||
    document.getElementById("logoutBtn")
  );
}

async function validateAuthSession() {
  if (!isAuthenticated()) {
    return { status: "missing", user: null };
  }

  if (!sessionValidationPromise) {
    sessionValidationPromise = (async () => {
      try {
        const result = await getCurrentProfile();
        const user = result?.user || getCurrentUser() || null;
        if (user) {
          setCurrentUser(user);
        }
        return { status: "valid", user };
      } catch (error) {
        if (isAuthFailureMessage(error?.message)) {
          clearAuthSession();
          return { status: "invalid", user: null };
        }
        return { status: "error", user: getCurrentUser() || null };
      } finally {
        sessionValidationPromise = null;
      }
    })();
  }

  return sessionValidationPromise;
}

export async function redirectIfAuthenticated(target = "./index.html") {
  if (!isAuthenticated()) return false;
  const result = await validateAuthSession();
  if (result.status !== "valid") return false;
  window.location.replace(target);
  return true;
}

export function setupProtectedPage(options = {}) {
  const {
    loginPage = "./login.html",
    welcomeEl = "mainUserWelcome",
    logoutEl = "mainLogoutBtn",
    fallbackName = "\u7528\u6237",
    onLogout = null,
  } = options;

  if (!isAuthenticated()) {
    window.location.replace(loginPage);
    return null;
  }

  const welcomeNode = resolveElement(welcomeEl);
  const applyWelcome = (user) => {
    if (!welcomeNode) return;
    welcomeNode.textContent = `\u4f60\u597d\uff0c${user?.name || fallbackName}`;
  };

  const user = getCurrentUser();
  applyWelcome(user);

  const logoutNode = resolveLogoutElement(logoutEl);
  if (logoutNode) {
    logoutNode.style.display = "inline-flex";
  }
  if (logoutNode) {
    logoutNode.addEventListener("click", () => {
      clearAuthSession();
      logoutNode.style.display = "none";
      if (typeof onLogout === "function") {
        onLogout();
        return;
      }
      window.location.replace(loginPage);
    });
  }

  return user;
}
