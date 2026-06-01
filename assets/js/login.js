import { login } from "./api.js";
import { saveAuthSession } from "./auth.js";
import { redirectIfAuthenticated } from "./page-auth.js";

const loginForm = document.getElementById("loginForm");
const loginError = document.getElementById("loginError");
const submitBtn = document.getElementById("submitBtn");

function getSafeRedirectTarget(defaultTarget = "./index.html") {
  try {
    const params = new URLSearchParams(window.location.search || "");
    const raw = String(params.get("redirect") || "").trim();
    if (!raw) return defaultTarget;
    if (raw.startsWith("/") && !raw.startsWith("//")) return raw;
    if (raw.startsWith("./") || raw.startsWith("../")) return raw;
    return defaultTarget;
  } catch {
    return defaultTarget;
  }
}

const redirectTarget = getSafeRedirectTarget("./index.html");
void redirectIfAuthenticated(redirectTarget);

if (loginForm) {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    loginError.textContent = "";
    submitBtn.disabled = true;
    submitBtn.textContent = "登录中...";

    const formData = new FormData(loginForm);
    const payload = {
      account: String(formData.get("account") || "").trim(),
      password: String(formData.get("password") || ""),
      remember: formData.get("remember") === "on"
    };

    try {
      const result = await login(payload);

      if (result.token) {
        saveAuthSession({
          token: result.token,
          user: result.user || null,
          remember: payload.remember
        });
      }

      window.location.href = redirectTarget;
    } catch (error) {
      loginError.textContent = error.message || "登录失败，请检查账号密码";
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "登录";
    }
  });
}
