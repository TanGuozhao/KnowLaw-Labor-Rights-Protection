import { syncPublicNavbarAuthUI } from "./page-auth.js";

const CANONICAL_ROUTES = {
  home: "/",
  main: "/main",
  "rights-guide": "/rights-guide",
  "legal-consult": "/legal-consult",
  retrieval: "/case-retrieval",
  "case-retrieval": "/case-retrieval",
  "case-retrieval-detail": "/case-retrieval-detail",
  "file-review": "/file-review",
  "document-generator": "/document-generator",
  "rights-management": "/rights-management",
  "my-cases": "/rights-management",
  "model-quiz": "/model-quiz",
  "consult-faqs": "/consult-faqs",
  "consult-faq-detail": "/consult-faqs",
  profile: "/profile",
  login: "/login",
  register: "/register",
};

function normalizeMenuItem(item) {
  const rawKey = String(item?.key || "").trim();
  const key = rawKey === "my-cases" ? "rights-management" : rawKey;
  const rawHref = String(item?.href || "").trim();
  const rawLabel = String(item?.label || "").trim();

  if (!key || !rawLabel) return null;

  const lowerHref = rawHref.toLowerCase();
  const href =
    CANONICAL_ROUTES[rawKey] ||
    CANONICAL_ROUTES[key] ||
    (lowerHref === "/my-cases" ||
    lowerHref === "./my-cases.html" ||
    lowerHref === "/my-cases.html" ||
    lowerHref === "./rights-management.html" ||
    lowerHref === "/rights-management.html"
      ? "/rights-management"
      : rawHref.startsWith("/")
        ? rawHref
        : rawHref);

  const label = key === "rights-management" ? "档案管理" : rawLabel;
  return { key, label, href };
}

function parseMenuConfig(container) {
  const raw = String(container?.dataset?.navbarMenu || "").trim();
  if (!raw) return [];

  return raw
    .split("|")
    .map((row) => row.trim())
    .filter(Boolean)
    .map((row) => {
      const [key, label, href] = row.split(":");
      return normalizeMenuItem({ key, label, href });
    })
    .filter(Boolean);
}

function createMenuItems(activeKey, items) {
  return items
    .map((item) => {
      const current = item.key === activeKey ? ' aria-current="page"' : "";
      return `<li><a href="${item.href}"${current}>${item.label}</a></li>`;
    })
    .join("");
}

function createUnifiedNavRight() {
  return `
    <div class="nav-right">
      <span class="nav-user" id="userWelcome"></span>
      <button class="nav-btn nav-btn--ghost" id="logoutBtn" type="button" style="display:none;">退出</button>
      <a class="nav-btn nav-btn--primary" id="authActionBtn" href="/login">登录</a>
    </div>
  `;
}

function createRightArea(variant, options) {
  if (variant === "guest-link") {
    const text = options.guestText || "返回首页";
    const href = String(options.guestHref || "/").trim() || "/";
    return `<a class="nav-btn nav-btn--primary" href="${href.startsWith("/") ? href : "/"}">${text}</a>`;
  }

  return createUnifiedNavRight();
}

function renderNavbar(container) {
  if (!container) return;
  const rawActiveKey = String(container.dataset.navbarActive || "").trim();
  const activeKey = rawActiveKey === "my-cases" ? "rights-management" : rawActiveKey;
  const variant = container.dataset.navbarVariant || "protected";
  const guestText = container.dataset.navbarGuestText || "";
  const guestHref = container.dataset.navbarGuestHref || "";
  const items = parseMenuConfig(container);

  container.innerHTML = `
    <nav class="navbar animate-fade-rise">
      <div class="brand">知法<sup>Legal</sup></div>
      <ul class="menu">
        ${createMenuItems(activeKey, items)}
      </ul>
      ${createRightArea(variant, { guestText, guestHref })}
    </nav>
  `;

  if (variant !== "guest-link") {
    syncPublicNavbarAuthUI();
  }
}

const defaultContainer = document.getElementById("sharedNavbar");
if (defaultContainer) {
  renderNavbar(defaultContainer);
}

export { renderNavbar };
