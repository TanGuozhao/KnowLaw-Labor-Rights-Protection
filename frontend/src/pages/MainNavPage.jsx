import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import { clearAuthSession, getCurrentUser, isAuthenticated } from "../auth";
import { loadTypicalCases } from "../data/typicalCases";
import { loadFengqiaoArticles } from "../data/fengqiaoExperience";

const NAV_CARDS = [
  {
    to: "/rights-guide",
    title: "维权指南",
    desc: "了解协商、调解、监察、仲裁与诉讼的维权步骤。",
    img: "/images/nav/guide.png",
  },
  {
    to: "/legal-consult",
    title: "法律咨询",
    desc: "发起问答对话，获得法律建议。",
    img: "/images/nav/chat.png",
  },
  {
    to: "/case-retrieval",
    title: "类案检索",
    desc: "按关键词检索相似裁判案例并查看详情。",
    img: "/images/nav/research.png",
  },
  {
    to: "/file-review",
    title: "文件审查",
    desc: "上传合同或材料，查看风险提示。",
    img: "/images/nav/check.png",
  },
  {
    to: "/document-generator",
    title: "文书生成",
    desc: "基于案情快速生成仲裁、投诉与催告文书草稿。",
    img: "/images/nav/write.png",
  },
  {
    to: "/rights-management",
    title: "档案管理",
    desc: "管理维权事项、证据与时间线。",
    img: "/images/nav/mine.png",
  },
];

function MainNavPage() {
  const [tick, setTick] = useState(0);
  const [cases, setCases] = useState([]);
  const [fengqiaoArticles, setFengqiaoArticles] = useState([]);
  const [caseListHeight, setCaseListHeight] = useState(null);
  const navGridRef = useRef(null);
  const navigate = useNavigate();

  const userName = useMemo(() => {
    if (!isAuthenticated()) return "";
    return getCurrentUser()?.name || "用户";
  }, [tick]);

  const handleLogout = () => {
    clearAuthSession();
    setTick((n) => n + 1);
    navigate("/", { replace: true });
  };

  useEffect(() => {
    loadTypicalCases()
      .then((items) => setCases(items))
      .catch(() => setCases([]));

    loadFengqiaoArticles()
      .then((items) => setFengqiaoArticles(items))
      .catch(() => setFengqiaoArticles([]));
  }, []);

  useLayoutEffect(() => {
    if (!navGridRef.current) return undefined;
    const updateHeight = () => {
      const h = navGridRef.current?.getBoundingClientRect().height || 0;
      setCaseListHeight(h > 0 ? Math.round(h) : null);
    };
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(navGridRef.current);
    window.addEventListener("resize", updateHeight);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateHeight);
    };
  }, []);

  return (
    <>
      <div className="overlay"></div>
      <main className="page nav-page">
        <Navbar activeKey="main" userName={userName} onLogout={handleLogout} />
        <section className="workspace animate-fade-rise-delay" aria-label="服务导航">
          <header className="nav-page-header">
            <h1>服务导航</h1>
            <p>选择要进入的页面，一步直达。</p>
          </header>
          <div className="nav-layout">
            <aside
              className="case-side-list case-side-list--left"
              aria-label="枫桥经验列表"
              style={caseListHeight ? { height: `${caseListHeight}px` } : undefined}
            >
              <h2>枫桥经验</h2>
              <ul>
                {fengqiaoArticles.slice(0, 24).map((item) => (
                  <li key={item.id}>
                    <Link to={`/fengqiao-experience/${item.id}`}>{item.listTitle || item.title}</Link>
                  </li>
                ))}
              </ul>
              <Link className="case-side-list-more" to="/fengqiao-experience">
                查看全部枫桥经验
              </Link>
            </aside>
            <div className="nav-grid" ref={navGridRef}>
              {NAV_CARDS.map(({ to, title, desc, img }) => (
                <Link
                  key={to}
                  className={`nav-card${img ? "" : " nav-card--text-only"}`}
                  to={to}
                >
                  {img ? (
                    <div className="nav-card-thumb">
                      <img src={img} alt="" width={200} height={200} loading="lazy" />
                    </div>
                  ) : null}
                  <div className="nav-card-text">
                    <h2>{title}</h2>
                    <p>{desc}</p>
                  </div>
                </Link>
              ))}
            </div>
            <aside
              className="case-side-list"
              aria-label="典型案例列表"
              style={caseListHeight ? { height: `${caseListHeight}px` } : undefined}
            >
              <h2>典型案例</h2>
              <ul>
                {cases.slice(0, 24).map((item) => (
                  <li key={item.id}>
                    <Link to={`/typical-cases/${item.id}`}>{item.title}</Link>
                  </li>
                ))}
              </ul>
              <Link className="case-side-list-more" to="/typical-cases">
                查看全部典型案例
              </Link>
            </aside>
          </div>
        </section>
      </main>
    </>
  );
}

export default MainNavPage;
