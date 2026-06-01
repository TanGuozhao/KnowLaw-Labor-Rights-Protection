import LegacyPageHost from "../components/LegacyPageHost";

function DocumentGeneratorPage() {
  return (
    <LegacyPageHost
      htmlPath="/legacy/document-generator.html"
      cssHrefs={["/assets/css/common.css", "/assets/css/main.css", "/assets/css/document-generator.css"]}
      scripts={[
        { src: "/assets/js/navbar.js", module: true },
        { src: "/assets/js/document-generator.js", module: true },
      ]}
    />
  );
}

export default DocumentGeneratorPage;
