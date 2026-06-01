import { Link } from "react-router-dom";

const menuItems = [
  { key: "home", label: "首页", href: "/" },
  { key: "main", label: "服务导航", href: "/main" },
  { key: "rights-guide", label: "维权指南", href: "/rights-guide" },
  { key: "legal-consult", label: "法律咨询", href: "/legal-consult" },
  { key: "retrieval", label: "类案检索", href: "/case-retrieval" },
  { key: "file-review", label: "文件审查", href: "/file-review" },
  { key: "document-generator", label: "文书生成", href: "/document-generator" },
  { key: "rights-management", label: "档案管理", href: "/rights-management" },
];

function Navbar({ activeKey = "", userName = "", onLogout }) {
  return (
    <nav className="navbar animate-fade-rise">
      <div className="brand">
        知法<sup>Legal</sup>
      </div>
      <ul className="menu">
        {menuItems.map((item) => (
          <li key={item.key}>
            <Link to={item.href} aria-current={item.key === activeKey ? "page" : undefined}>
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
      <div className="nav-right">
        <span className="nav-user">{userName ? `你好，${userName}` : ""}</span>
        {userName ? (
          <button className="nav-btn nav-btn--ghost" type="button" onClick={onLogout}>
            退出
          </button>
        ) : null}
        <Link className="nav-btn nav-btn--primary" to={userName ? "/profile" : "/login"}>
          {userName ? "个人中心" : "登录"}
        </Link>
      </div>
    </nav>
  );
}

export default Navbar;
