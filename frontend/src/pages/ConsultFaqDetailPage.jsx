import LegacyPageHost from "../components/LegacyPageHost";

function ConsultFaqDetailPage() {
  return (
    <LegacyPageHost
      htmlPath="/legacy/consult-faq-detail.html"
      cssHrefs={["/assets/css/common.css", "/assets/css/main.css", "/assets/css/consult-faq-detail.css"]}
      scripts={[
        { src: "/assets/js/navbar.js", module: true },
        { src: "/assets/js/consult-faq-detail.js", module: true },
      ]}
    />
  );
}

export default ConsultFaqDetailPage;
