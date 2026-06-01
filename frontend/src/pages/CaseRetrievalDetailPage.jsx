import LegacyPageHost from "../components/LegacyPageHost";

function CaseRetrievalDetailPage() {
  return (
    <LegacyPageHost
      htmlPath="/legacy/case-retrieval-detail.html"
      cssHrefs={["/assets/css/common.css", "/assets/css/main.css", "/assets/css/case-retrieval-detail.css"]}
      scripts={[
        { src: "/assets/js/navbar.js", module: true },
        { src: "/assets/js/case-retrieval-detail.js", module: true },
      ]}
    />
  );
}

export default CaseRetrievalDetailPage;
