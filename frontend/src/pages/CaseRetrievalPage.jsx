import LegacyPageHost from "../components/LegacyPageHost";

function CaseRetrievalPage() {
  return (
    <LegacyPageHost
      htmlPath="/legacy/case-retrieval.html"
      cssHrefs={["/assets/css/common.css", "/assets/css/main.css", "/assets/css/case-retrieval.css"]}
      scripts={[
        { src: "/assets/js/navbar.js", module: true },
        { src: "/assets/js/case-retrieval.js", module: true },
      ]}
    />
  );
}

export default CaseRetrievalPage;
