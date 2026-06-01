import LegacyPageHost from "../components/LegacyPageHost";

function RegisterPage() {
  return (
    <LegacyPageHost
      htmlPath="/register.html"
      cssHrefs={["/assets/css/common.css", "/assets/css/register.css"]}
      scripts={[
        { src: "/assets/js/navbar.js", module: true },
        { src: "/assets/js/register.js", module: true },
      ]}
    />
  );
}

export default RegisterPage;
