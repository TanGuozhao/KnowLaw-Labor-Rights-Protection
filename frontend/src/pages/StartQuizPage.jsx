import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import { clearAuthSession, getCurrentUser, isAuthenticated } from "../auth";

const START_QUIZ_SEEN_KEY = "lh_start_quiz_seen_v1";

const QUESTIONS = [
  {
    id: "identity",
    title: "1. 你当前更接近哪种身份？",
    options: ["劳动者（个人）", "企业/用人单位", "家属/代理人", "暂不确定"],
  },
  {
    id: "goal",
    title: "2. 你现在最想先解决什么问题？",
    options: ["先判断怎么维权", "先咨询可行方案", "先找相似案例", "先生成/整理文书", "先整理案件与证据"],
  },
  {
    id: "stage",
    title: "3. 你目前处理到哪个阶段？",
    options: ["刚发现问题，先了解方向", "正在协商或投诉中", "准备仲裁/诉讼，想提速", "已进入仲裁/诉讼流程"],
  },
];

const ROUTE_LABELS = {
  "/rights-guide": "维权指南",
  "/legal-consult": "法律咨询",
  "/case-retrieval": "类案检索",
  "/document-generator": "文书生成",
  "/rights-management": "档案管理",
  "/main": "功能页",
};

function pickRecommendedPath(answers) {
  const goal = answers.goal || "";
  const stage = answers.stage || "";
  const identity = answers.identity || "";

  if (goal.includes("整理案件与证据")) return "/rights-management";
  if (goal.includes("生成/整理文书")) return "/document-generator";
  if (goal.includes("找相似案例")) return "/case-retrieval";
  if (goal.includes("咨询可行方案")) return "/legal-consult";

  if (goal.includes("判断怎么维权")) {
    if (stage.includes("准备仲裁/诉讼") || stage.includes("已进入仲裁/诉讼流程")) {
      return "/case-retrieval";
    }
    return "/rights-guide";
  }

  if (identity.includes("企业/用人单位") && stage.includes("仲裁/诉讼")) {
    return "/legal-consult";
  }
  return "/main";
}

function StartQuizPage() {
  const [tick, setTick] = useState(0);
  const [answers, setAnswers] = useState({});
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

  const answeredCount = Object.keys(answers).length;
  const isComplete = answeredCount === QUESTIONS.length;
  const recommendedPath = pickRecommendedPath(answers);
  const recommendedLabel = ROUTE_LABELS[recommendedPath] || "功能页";

  useEffect(() => {
    if (typeof window === "undefined") return;
    const seen = window.localStorage.getItem(START_QUIZ_SEEN_KEY) === "1";
    if (seen) {
      navigate("/main", { replace: true });
      return;
    }
    window.localStorage.setItem(START_QUIZ_SEEN_KEY, "1");
  }, [navigate]);

  const handleChoose = (questionId, option) => {
    setAnswers((prev) => ({ ...prev, [questionId]: option }));
  };

  const handleContinue = () => {
    navigate("/main");
  };

  const handleFinish = () => {
    navigate(recommendedPath);
  };

  return (
    <>
      <div className="overlay" />
      <main className="page start-quiz-page">
        <Navbar activeKey="" userName={userName} onLogout={handleLogout} />

        <section className="start-quiz-panel animate-fade-rise-delay" aria-label="开始前选择题">
          <header className="start-quiz-header">
            <p className="start-quiz-eyebrow">开始前 3 个问题</p>
            <h1>先做个简单选择，再为你推荐合适入口</h1>
            <p className="start-quiz-subtitle">
              完成后进入功能选择页，你也可以稍后直接查看维权指南、咨询、类案检索或文书生成。
            </p>
          </header>

          <div className="start-quiz-list">
            {QUESTIONS.map((question) => (
              <section key={question.id} className="start-quiz-card">
                <h2>{question.title}</h2>
                <div className="start-quiz-options" role="radiogroup" aria-label={question.title}>
                  {question.options.map((option) => {
                    const checked = answers[question.id] === option;
                    return (
                      <button
                        key={option}
                        type="button"
                        className={`start-quiz-option${checked ? " is-selected" : ""}`}
                        aria-pressed={checked}
                        onClick={() => handleChoose(question.id, option)}
                      >
                        {option}
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>

          <footer className="start-quiz-footer">
            <p className="start-quiz-progress">
              已完成 {answeredCount}/{QUESTIONS.length} 题
            </p>
            <div className="start-quiz-actions">
              <button type="button" className="nav-btn start-quiz-skip" onClick={handleContinue}>
                先去功能页
              </button>
              <button
                type="button"
                className="nav-btn nav-btn--primary"
                onClick={handleFinish}
                disabled={!isComplete}
              >
                完成并进入{recommendedLabel}
              </button>
            </div>
          </footer>
        </section>
      </main>
    </>
  );
}

export default StartQuizPage;
