import { clearAuthSession } from "./auth.js";
import { syncPublicNavbarAuthUI } from "./page-auth.js";

const retrievalMode = new URLSearchParams(window.location.search).get("mode");
if (retrievalMode === "retrieval") {
  window.location.replace("/case-retrieval");
}

function refreshMainNav() {
  syncPublicNavbarAuthUI();
}

const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    clearAuthSession();
    refreshMainNav();
    window.location.href = "/";
  });
}

refreshMainNav();
