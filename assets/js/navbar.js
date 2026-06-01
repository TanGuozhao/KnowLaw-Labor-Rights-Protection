const items = [
  { key: "home", label: "首页", href: "/" },
  { key: "main", label: "服务导航", href: "/main" },
  { key: "rights-guide", label: "维权指南", href: "/rights-guide" },
  { key: "legal-consult", label: "法律咨询", href: "/legal-consult" },
  { key: "retrieval", label: "类案检索", href: "/case-retrieval" },
  { key: "file-review", label: "文件审查", href: "/file-review" },
  { key: "document-generator", label: "文书生成", href: "/document-generator" },
  { key: "rights-management", label: "档案管理", href: "/rights-management" },
];

function createMenuItems(activeKey) {
  const normalizedActiveKey = activeKey === "my-cases" ? "rights-management" : activeKey;
  return items
    .map((item) => {
      const current = item.key === normalizedActiveKey ? ' aria-current="page"' : "";
      return `<li><a href="${item.href}"${current}>${item.label}</a></li>`;
    })
    .join("");
}

function createRightArea(variant, options) {
  if (variant === "home") {
    return `
      <div class="nav-right">
        <span class="nav-user" id="userWelcome"></span>
        <button class="liquid-glass nav-btn" id="logoutBtn" type="button" style="display:none;">退出</button>
        <a class="liquid-glass nav-btn" id="authActionBtn" href="/login">登录</a>
      </div>
    `;
  }

  if (variant === "guest-link") {
    const text = options.guestText || "返回首页";
    return `<a class="liquid-glass nav-btn" href="/">${text}</a>`;
  }

  return `
    <div class="nav-right">
      <span class="nav-user" id="mainUserWelcome"></span>
      <button class="liquid-glass nav-btn" id="mainLogoutBtn" type="button" style="display:none;">退出登录</button>
    </div>
  `;
}

function renderNavbar(container) {
  if (!container) return;
  if (container.firstElementChild?.classList?.contains("navbar")) return;
  const activeKey = container.dataset.navbarActive || "";
  const variant = container.dataset.navbarVariant || "protected";
  const guestText = container.dataset.navbarGuestText || "";
  const guestHref = container.dataset.navbarGuestHref || "";

  container.innerHTML = `
    <nav class="navbar animate-fade-rise">
      <div class="brand">知法<sup>Legal</sup></div>
      <ul class="menu">
        ${createMenuItems(activeKey)}
      </ul>
      ${createRightArea(variant, { guestText, guestHref })}
    </nav>
  `;
}

const defaultContainer = document.getElementById("sharedNavbar");
if (defaultContainer) {
  renderNavbar(defaultContainer);
}

export { renderNavbar };
