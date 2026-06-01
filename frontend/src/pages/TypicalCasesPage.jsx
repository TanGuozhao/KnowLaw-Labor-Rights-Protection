import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Navbar from "../components/Navbar";
import { clearAuthSession, getCurrentUser, isAuthenticated } from "../auth";
import { loadTypicalCases } from "../data/typicalCases";
import { RIGHTS_GUIDE_NAV } from "../data/rightsGuideContent";

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

function TypicalCasesPage() {
  const [tick, setTick] = useState(0);
  const [cases, setCases] = useState([]);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState({});
  const navigate = useNavigate();
  const { caseId } = useParams();

  const userName = useMemo(() => {
    if (!isAuthenticated()) return "";
    return getCurrentUser()?.name || "用户";
  }, [tick]);

  useEffect(() => {
    loadTypicalCases()
      .then((items) => {
        setCases(items);
      })
      .catch((e) => {
        setError(e.message || "案例数据加载失败。");
      });
  }, []);

  const activeCase = useMemo(() => {
    if (!caseId) return null;
    return cases.find((item) => item.id === caseId) || null;
  }, [caseId, cases]);

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
        <section className="rg-workspace animate-fade-rise-delay" aria-label="典型案例">
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
                <Link className="rg-nav-link is-active" to="/typical-cases" aria-current="page">
                  典型案例
                </Link>
                <Link className="rg-nav-link" to="/fengqiao-experience">
                  协商调解
                </Link>
              </div>
            </nav>
          </aside>

          <article className="panel right-panel rg-main" aria-live="polite">
            <header className="rg-main-head">
              <h1>{activeCase ? activeCase.title : "典型案例"}</h1>
              {activeCase ? (
                <p className="rg-breadcrumb">
                  <Link to="/typical-cases">典型案例</Link>
                  <span className="rg-breadcrumb-sep"> / </span>
                  <Link to={`/typical-cases/${activeCase.id}`}>{activeCase.title}</Link>
                </p>
              ) : null}
            </header>
            <div className="rg-main-body">
              {error ? <p className="rg-content-p">{error}</p> : null}
              {!error && !activeCase ? (
                <ul className="case-list-page">
                  {cases.map((item) => (
                    <li key={item.id}>
                      <Link to={`/typical-cases/${item.id}`}>{item.title}</Link>
                    </li>
                  ))}
                </ul>
              ) : null}
              {!error && activeCase
                ? activeCase.content.split("\n").map((line, idx) => (
                    <p key={`${activeCase.id}-${idx}`} className="rg-content-p">
                      {line}
                    </p>
                  ))
                : null}
            </div>
          </article>
        </section>
      </main>
    </>
  );
}

export default TypicalCasesPage;

