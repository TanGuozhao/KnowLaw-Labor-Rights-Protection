import { register } from "./api.js";
import { saveAuthSession } from "./auth.js";
import { redirectIfAuthenticated } from "./page-auth.js";

const registerForm = document.getElementById("registerForm");
const registerError = document.getElementById("registerError");
const submitBtn = document.getElementById("submitBtn");

redirectIfAuthenticated("/");

function isValidPhone(phone) {
  return /^\d{11}$/.test(phone);
}

if (registerForm) {
  registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    registerError.textContent = "";

    const formData = new FormData(registerForm);
    const payload = {
      phone: String(formData.get("phone") || "").trim(),
      email: String(formData.get("email") || "").trim(),
      name: String(formData.get("name") || "").trim(),
      password: String(formData.get("password") || ""),
      confirmPassword: String(formData.get("confirmPassword") || "")
    };

    if (!payload.phone && !payload.email) {
      registerError.textContent = "手机号和邮箱至少填写一项";
      return;
    }

    if (payload.phone && !isValidPhone(payload.phone)) {
      registerError.textContent = "请输入11位手机号";
      return;
    }

    if (payload.password.length < 6) {
      registerError.textContent = "密码至少6位";
      return;
    }

    if (payload.password !== payload.confirmPassword) {
      registerError.textContent = "两次输入的密码不一致";
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "注册中...";

    try {
      const result = await register(payload);

      if (result.token) {
        saveAuthSession({
          token: result.token,
          user: result.user || { name: payload.name, phone: payload.phone || null, email: payload.email || null },
          remember: true
        });
      }

      window.location.href = "/";
    } catch (error) {
      registerError.textContent = error.message || "注册失败，请稍后重试";
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "注册并登录";
    }
  });
}
