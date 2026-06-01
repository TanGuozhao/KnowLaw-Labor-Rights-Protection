import LegacyPageHost from "../components/LegacyPageHost";

function LoginPage() {
  return (
    <LegacyPageHost
      htmlPath="/login.html"
      cssHrefs={["/assets/css/common.css", "/assets/css/login.css"]}
      scripts={[
        { src: "/assets/js/navbar.js", module: true },
        { src: "/assets/js/login.js", module: true },
      ]}
    />
  );
}

export default LoginPage;
