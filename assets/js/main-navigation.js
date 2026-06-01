import { clearAuthSession, getCurrentUser, isAuthenticated } from "./auth.js";

const retrievalMode = new URLSearchParams(window.location.search).get("mode");
if (retrievalMode === "retrieval") {
  window.location.replace("./case-retrieval.html");
}

const mainUserWelcome = document.getElementById("mainUserWelcome");
const mainLogoutBtn = document.getElementById("mainLogoutBtn");
const mainAuthBtn = document.getElementById("mainAuthBtn");

function refreshMainNav() {
  const loggedIn = isAuthenticated();
  const user = getCurrentUser();

  if (mainUserWelcome) {
    mainUserWelcome.textContent = loggedIn ? `你好，${user?.name || "用户"}` : "";
  }

  if (mainLogoutBtn) {
    mainLogoutBtn.style.display = loggedIn ? "inline-flex" : "none";
  }

  if (mainAuthBtn) {
    mainAuthBtn.style.display = loggedIn ? "none" : "inline-flex";
  }
}

if (mainLogoutBtn) {
  mainLogoutBtn.addEventListener("click", () => {
    clearAuthSession();
    refreshMainNav();
    window.location.href = "./index.html";
  });
}

refreshMainNav();

