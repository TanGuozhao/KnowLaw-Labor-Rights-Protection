import LegacyPageHost from "../components/LegacyPageHost";

function ModelQuizPage() {
  return (
    <LegacyPageHost
      htmlPath="/legacy/model-quiz.html"
      cssHrefs={["/assets/css/common.css", "/assets/css/main.css", "/assets/css/model-quiz.css"]}
      scripts={[
        { src: "/assets/js/navbar.js", module: true },
        { src: "/assets/js/model-quiz.js", module: true },
      ]}
    />
  );
}

export default ModelQuizPage;
