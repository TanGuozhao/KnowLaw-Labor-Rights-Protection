import LegacyPageHost from "../components/LegacyPageHost";

function ProfilePage() {
  return (
    <LegacyPageHost
      htmlPath="/profile.html"
      cssHrefs={["/assets/css/common.css", "/assets/css/main.css", "/assets/css/profile.css"]}
      scripts={[
        { src: "/assets/js/navbar.js", module: true },
        { src: "/assets/js/profile.js", module: true },
      ]}
    />
  );
}

export default ProfilePage;
