import LegacyPageHost from "../components/LegacyPageHost";

function FileReviewPage() {
  return (
    <LegacyPageHost
      htmlPath="/legacy/file-review.html"
      cssHrefs={["/assets/css/common.css", "/assets/css/main.css", "/assets/css/file-review.css"]}
      scripts={[
        { src: "/assets/js/navbar.js", module: true },
        { src: "/assets/js/vendor/mammoth.browser.min.js" },
        { src: "/assets/js/file-review.js", module: true },
      ]}
    />
  );
}

export default FileReviewPage;
