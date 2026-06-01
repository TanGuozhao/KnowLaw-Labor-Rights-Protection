import LegacyPageHost from "../components/LegacyPageHost";

function MyCasesPage() {
  return (
    <LegacyPageHost
      htmlPath="/legacy/rights-management.html"
      cssHrefs={[
        "/assets/css/common.css",
        "/assets/css/main.css",
        "/assets/css/my-cases.css",
        "/assets/vendor/neo4jd3/css/neo4jd3.css",
      ]}
      scripts={[
        { src: "/assets/js/navbar.js", module: true },
        { src: "https://d3js.org/d3.v4.min.js" },
        { src: "/assets/vendor/neo4jd3/js/neo4jd3.js" },
        { src: "/assets/js/my-cases.js", module: true },
      ]}
    />
  );
}

export default MyCasesPage;
