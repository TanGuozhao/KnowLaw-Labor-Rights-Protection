import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Navbar from "../components/Navbar";
import { clearAuthSession, getCurrentUser, isAuthenticated } from "../auth";
import { RIGHTS_GUIDE_NAV } from "../data/rightsGuideContent";
import { loadFengqiaoArticles } from "../data/fengqiaoExperience";

function GuideNavTree({ nodes, depth, expanded, onToggleExpand }) {
  return (
    <ul className={depth ? "rg-nav-sub" : "rg-nav-root"}>
      {nodes.map((node) => {
        if (node.children) {
          const isOpen = expanded[node.id] !== false;
          return (
            <li key={node.id} className="rg-nav-group">
              <button
                type="button"
                className={`rg-nav-parent${isOpen ? " is-open" : ""}`}
                onClick={() => onToggleExpand(node.id)}
                aria-expanded={isOpen}
              >
                <span className="rg-nav-parent-label">{node.label}</span>
                <span className="rg-chevron" aria-hidden>
                  {isOpen ? "▼" : "▶"}
                </span>
              </button>
              {isOpen ? (
                <GuideNavTree
                  nodes={node.children}
                  depth={depth + 1}
                  expanded={expanded}
                  onToggleExpand={onToggleExpand}
                />
              ) : null}
            </li>
          );
        }
        return (
          <li key={node.id}>
            <Link className="rg-nav-link" to={`/rights-guide#${node.id}`}>
              {node.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function FengqiaoExperiencePage() {
  const [tick, setTick] = useState(0);
  const [articles, setArticles] = useState([]);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState({});
  const navigate = useNavigate();
  const { articleId } = useParams();

  const userName = useMemo(() => {
    if (!isAuthenticated()) return "";
    return getCurrentUser()?.name || "用户";
  }, [tick]);

  useEffect(() => {
    loadFengqiaoArticles()
      .then((items) => {
        setArticles(items);
      })
      .catch((e) => {
        setError(e.message || "枫桥经验数据加载失败。");
      });
  }, []);

  const activeArticle = useMemo(() => {
    if (!articleId) return null;
    return articles.find((item) => item.id === articleId) || null;
  }, [articleId, articles]);

  const handleLogout = () => {
    clearAuthSession();
    setTick((n) => n + 1);
    navigate("/", { replace: true });
  };

  const toggleExpand = (groupId) => {
    setExpanded((prev) => {
      const isOpen = prev[groupId] !== false;
      return { ...prev, [groupId]: !isOpen };
    });
  };

  return (
    <>
      <div className="overlay" />
      <main className="page guide-page">
        <Navbar activeKey="rights-guide" userName={userName} onLogout={handleLogout} />
        <section className="rg-workspace animate-fade-rise-delay" aria-label="协商调解">
          <aside className="panel left-panel rg-sidebar" aria-label="分类导航">
            <div className="rg-sidebar-head">
              <h2 className="rg-sidebar-title">维权指南</h2>
            </div>
            <nav className="rg-nav" aria-label="劳动维权流程">
              <GuideNavTree
                nodes={RIGHTS_GUIDE_NAV}
                depth={0}
                expanded={expanded}
                onToggleExpand={toggleExpand}
              />
              <div className="rg-extra-entry">
                <Link className="rg-nav-link" to="/typical-cases">
                  典型案例
                </Link>
                <Link className="rg-nav-link is-active" to="/fengqiao-experience" aria-current="page">
                  协商调解
                </Link>
              </div>
            </nav>
          </aside>

          <article className="panel right-panel rg-main" aria-live="polite">
            <header className="rg-main-head">
              <h1>{activeArticle ? activeArticle.listTitle || activeArticle.title : "协商调解（枫桥经验）"}</h1>
              {activeArticle ? (
                <p className="rg-breadcrumb">
                  <Link to="/fengqiao-experience">协商调解</Link>
                  <span className="rg-breadcrumb-sep"> / </span>
                  <Link to={`/fengqiao-experience/${activeArticle.id}`}>
                    {activeArticle.listTitle || activeArticle.title}
                  </Link>
                </p>
              ) : null}
            </header>
            <div className="rg-main-body">
              {error ? <p className="rg-content-p">{error}</p> : null}
              {!error && !activeArticle ? (
                <ul className="case-list-page">
                  {articles.map((item) => (
                    <li key={item.id}>
                      <Link to={`/fengqiao-experience/${item.id}`}>{item.listTitle || item.title}</Link>
                    </li>
                  ))}
                </ul>
              ) : null}
              {!error && activeArticle ? (
                <>
                  <p className="rg-content-p">
                    <strong>来源：</strong>
                    {activeArticle.source}
                  </p>
                  {activeArticle.date ? (
                    <p className="rg-content-p">
                      <strong>时间：</strong>
                      {activeArticle.date}
                    </p>
                  ) : null}
                  {activeArticle.content.split("\n").map((line, idx) => (
                    <p key={`${activeArticle.id}-${idx}`} className="rg-content-p">
                      {line}
                    </p>
                  ))}
                </>
              ) : null}
            </div>
          </article>
        </section>
      </main>
    </>
  );
}

export default FengqiaoExperiencePage;

