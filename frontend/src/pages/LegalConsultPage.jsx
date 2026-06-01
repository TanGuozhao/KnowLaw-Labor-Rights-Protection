import LegacyPageHost from "../components/LegacyPageHost";

function LegalConsultPage() {
  return (
    <LegacyPageHost
      htmlPath="/legacy/legal-consult.html"
      cssHrefs={["/assets/css/common.css", "/assets/css/main.css", "/assets/css/legal-consult.css"]}
      scripts={[
        { src: "/assets/js/navbar.js", module: true },
        { src: "/assets/js/legal-consult.js", module: true },
      ]}
    />
  );
}

export default LegalConsultPage;
