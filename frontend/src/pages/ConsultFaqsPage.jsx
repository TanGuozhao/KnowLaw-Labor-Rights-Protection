import LegacyPageHost from "../components/LegacyPageHost";

function ConsultFaqsPage() {
  return (
    <LegacyPageHost
      htmlPath="/legacy/consult-faqs.html"
      cssHrefs={["/assets/css/common.css", "/assets/css/main.css", "/assets/css/consult-faqs.css"]}
      scripts={[
        { src: "/assets/js/navbar.js", module: true },
        { src: "/assets/js/consult-faqs.js", module: true },
      ]}
    />
  );
}

export default ConsultFaqsPage;
