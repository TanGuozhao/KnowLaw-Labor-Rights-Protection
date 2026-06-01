import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import { clearAuthSession, getCurrentUser, isAuthenticated } from "../auth";

const START_QUIZ_SEEN_KEY = "lh_start_quiz_seen_v1";

function HomePage() {
  const [tick, setTick] = useState(0);
  const [snapSectionIndex, setSnapSectionIndex] = useState(0);
  const [sectionTotal, setSectionTotal] = useState(1);
  const snapRef = useRef(null);
  const lockRef = useRef(false);

  const userName = useMemo(() => {
    if (!isAuthenticated()) return "";
    return getCurrentUser()?.name || "用户";
  }, [tick]);

  const handleLogout = () => {
    clearAuthSession();
    setTick((n) => n + 1);
  };

  const goToAdjacentSection = useCallback((direction) => {
    const snap = snapRef.current;
    if (!snap || lockRef.current) return false;
    const sections = Array.from(snap.querySelectorAll(".home-section"));
    if (sections.length <= 1) return false;

    const viewHeight = Math.max(1, snap.clientHeight);
    const currentIndex = Math.round(snap.scrollTop / viewHeight);
    const next = sections[currentIndex + direction];
    if (!next) return false;

    lockRef.current = true;
    next.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => {
      lockRef.current = false;
    }, 900);
    return true;
  }, []);

  useEffect(() => {
    const snap = snapRef.current;
    if (!snap) return;

    const updateIndex = () => {
      const sections = snap.querySelectorAll(".home-section");
      setSectionTotal(sections.length);
      const viewHeight = Math.max(1, snap.clientHeight);
      const idx = Math.round(snap.scrollTop / viewHeight);
      const max = Math.max(0, sections.length - 1);
      setSnapSectionIndex(Math.min(max, Math.max(0, idx)));
    };

    updateIndex();
    snap.addEventListener("scroll", updateIndex, { passive: true });
    return () => snap.removeEventListener("scroll", updateIndex);
  }, []);

  const showScrollDown = sectionTotal > 1 && snapSectionIndex < sectionTotal - 1;
  const scrollDownLightBg = snapSectionIndex === 1 || snapSectionIndex === 3;
  const startTarget =
    typeof window !== "undefined" && window.localStorage.getItem(START_QUIZ_SEEN_KEY) === "1"
      ? "/main"
      : "/start";

  const handleWheel = (event) => {
    if (event.shiftKey) return;
    if (Math.abs(event.deltaY) < 12) return;
    const dir = event.deltaY > 0 ? 1 : -1;
    if (goToAdjacentSection(dir)) {
      event.preventDefault();
    }
  };

  return (
    <>
      <div className="overlay"></div>
      <main className="page home-page">
        <Navbar activeKey="home" userName={userName} onLogout={handleLogout} />

        <div className="home-snap-container" id="homeSnap" ref={snapRef} onWheel={handleWheel}>
          <section className="home-section home-section-1 hero" aria-label="首页第一屏">
            <h1 className="animate-fade-rise">
              让每一位劳动者维权，
              <br />
              都有可信赖的法律支持。
            </h1>
            <p className="subtitle animate-fade-rise-delay">
              为劳动者提供劳动维权指引和法律智能服务
              <br />
              以专业、严谨和高效守护您的合法权益。
            </p>
            <Link className="liquid-glass cta animate-fade-rise-delay-2" to={startTarget}>
              开始吧
            </Link>
          </section>

          <section className="home-section home-section-2" aria-label="首页第二屏">
            <div className="home-section-content">
              <h2 className="home-section-title">专业法律咨询</h2>
              <p className="home-section-subtitle">
                从合同审查到争议解决，提供清晰路径与可执行的法律建议。
              </p>
              <Link className="home-feature-btn home-feature-btn--light" to="/legal-consult">
                法律咨询
              </Link>
            </div>
          </section>

          <section className="home-section home-section-3" aria-label="首页第三屏">
            <div className="home-section-content">
              <h2 className="home-section-title">高效合规与维权</h2>
              <p className="home-section-subtitle">
                以专业、严谨的方式守护您的合法权益，降低风险、提升确定性。
              </p>
              <Link className="home-feature-btn" to="/case-retrieval">
                类案检索
              </Link>
            </div>
          </section>

          <section className="home-section home-section-4" aria-label="首页第四屏">
            <div className="home-section-content">
              <h2 className="home-section-title">文书生成与材料整理</h2>
              <p className="home-section-subtitle">
                围绕劳动争议场景，快速形成可用文书草稿与提交材料清单。
              </p>
              <Link className="home-feature-btn home-feature-btn--light" to="/document-generator">
                文书生成
              </Link>
            </div>
            <div className="home-section-content home-section-content--right">
              <h2 className="home-section-title">文件审查与风险提示</h2>
              <p className="home-section-subtitle">
              核查劳动争议材料，快速识别信息缺失、表述风险与证据薄弱点。
              </p>
              <Link className="home-feature-btn home-feature-btn--light" to="/file-review">
                文件审查
              </Link>
            </div>
          </section>
        </div>

        {showScrollDown ? (
          <button
            type="button"
            className={`home-scroll-down${scrollDownLightBg ? " home-scroll-down--light" : ""}`}
            aria-label="向下翻页"
            onClick={() => goToAdjacentSection(1)}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M7 10L12 15 17 10"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        ) : null}
      </main>
    </>
  );
}

export default HomePage;
