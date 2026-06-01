import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { isAuthenticated } from "./auth";
import HomePage from "./pages/HomePage";
import MainNavPage from "./pages/MainNavPage";
import LegalConsultPage from "./pages/LegalConsultPage";
import CaseRetrievalPage from "./pages/CaseRetrievalPage";
import CaseRetrievalDetailPage from "./pages/CaseRetrievalDetailPage";
import FileReviewPage from "./pages/FileReviewPage";
import DocumentGeneratorPage from "./pages/DocumentGeneratorPage";
import MyCasesPage from "./pages/MyCasesPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import ProfilePage from "./pages/ProfilePage";
import ConsultFaqsPage from "./pages/ConsultFaqsPage";
import ConsultFaqDetailPage from "./pages/ConsultFaqDetailPage";
import RightsGuidePage from "./pages/RightsGuidePage";
import StartQuizPage from "./pages/StartQuizPage";
import TypicalCasesPage from "./pages/TypicalCasesPage";
import FengqiaoExperiencePage from "./pages/FengqiaoExperiencePage";
import ModelQuizPage from "./pages/ModelQuizPage";

function RequireAuth({ children }) {
  const location = useLocation();
  if (!isAuthenticated()) {
    const redirect = `${location.pathname || "/"}${location.search || ""}${location.hash || ""}`;
    return <Navigate to={`/login?redirect=${encodeURIComponent(redirect)}`} replace />;
  }
  return children;
}

function App() {
  return (
    <div className="app-shell">
      <div className="app-main">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/start" element={<StartQuizPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route
            path="/profile"
            element={
              <RequireAuth>
                <ProfilePage />
              </RequireAuth>
            }
          />
          <Route
            path="/main"
            element={
              <RequireAuth>
                <MainNavPage />
              </RequireAuth>
            }
          />
          <Route
            path="/legal-consult"
            element={
              <RequireAuth>
                <LegalConsultPage />
              </RequireAuth>
            }
          />
          <Route
            path="/case-retrieval"
            element={
              <RequireAuth>
                <CaseRetrievalPage />
              </RequireAuth>
            }
          />
          <Route
            path="/case-retrieval-detail"
            element={
              <RequireAuth>
                <CaseRetrievalDetailPage />
              </RequireAuth>
            }
          />
          <Route
            path="/file-review"
            element={
              <RequireAuth>
                <FileReviewPage />
              </RequireAuth>
            }
          />
          <Route
            path="/document-generator"
            element={
              <RequireAuth>
                <DocumentGeneratorPage />
              </RequireAuth>
            }
          />
          <Route
            path="/rights-management"
            element={
              <RequireAuth>
                <MyCasesPage />
              </RequireAuth>
            }
          />
          <Route
            path="/model-quiz"
            element={
              <RequireAuth>
                <ModelQuizPage />
              </RequireAuth>
            }
          />
          <Route path="/my-cases" element={<Navigate to="/rights-management" replace />} />
          <Route
            path="/consult-faqs"
            element={
              <RequireAuth>
                <ConsultFaqsPage />
              </RequireAuth>
            }
          />
          <Route
            path="/consult-faqs/:faqId"
            element={
              <RequireAuth>
                <ConsultFaqDetailPage />
              </RequireAuth>
            }
          />
          <Route
            path="/rights-guide"
            element={
              <RequireAuth>
                <RightsGuidePage />
              </RequireAuth>
            }
          />
          <Route
            path="/typical-cases"
            element={
              <RequireAuth>
                <TypicalCasesPage />
              </RequireAuth>
            }
          />
          <Route
            path="/typical-cases/:caseId"
            element={
              <RequireAuth>
                <TypicalCasesPage />
              </RequireAuth>
            }
          />
          <Route
            path="/fengqiao-experience"
            element={
              <RequireAuth>
                <FengqiaoExperiencePage />
              </RequireAuth>
            }
          />
          <Route
            path="/fengqiao-experience/:articleId"
            element={
              <RequireAuth>
                <FengqiaoExperiencePage />
              </RequireAuth>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
      <footer className="site-record">
        <a href="https://beian.miit.gov.cn/" target="_blank" rel="noreferrer">
          桂ICP备2026004816号-1
        </a>
      </footer>
    </div>
  );
}

export default App;
