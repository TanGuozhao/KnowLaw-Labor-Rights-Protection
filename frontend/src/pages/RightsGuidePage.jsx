import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import { clearAuthSession, getCurrentUser, isAuthenticated } from "../auth";
import laborRightsFlowchart from "../assets/labor-rights-flowchart.png";
import {
  RIGHTS_GUIDE_NAV,
  getAllSectionIds,
  getSectionById,
} from "../data/rightsGuideContent";
import laborInspectionChannels from "../data/laborInspectionChannels.json";

function formatParagraphs(paragraphs) {
  return paragraphs.map((p, i) => {
    const parts = p.split(/\*\*(.+?)\*\*/g);
    return (
      <p key={i} className="rg-content-p">
        {parts.map((part, j) => (j % 2 === 1 ? <strong key={j}>{part}</strong> : part))}
      </p>
    );
  });
}

function NavTree({
  nodes,
  depth,
  activeId,
  expanded,
  onToggleExpand,
  onSelectLeaf,
}) {
  return (
    <ul className={depth ? "rg-nav-sub" : "rg-nav-root"}>
      {nodes.map((node) => {
        if (node.children) {
          const isOpen = expanded[node.id] !== false;
          return (
            <li key={node.id} className="rg-nav-group">
              <button
                type="button"
                className={`rg-nav-parent${isOpen ? " is-open" : ""}`}
                onClick={() => onToggleExpand(node.id)}
                aria-expanded={isOpen}
              >
                <span className="rg-nav-parent-label">{node.label}</span>
                <span className="rg-chevron" aria-hidden>
                  {isOpen ? "▼" : "▶"}
                </span>
              </button>
              {isOpen ? (
                <NavTree
                  nodes={node.children}
                  depth={depth + 1}
                  activeId={activeId}
                  expanded={expanded}
                  onToggleExpand={onToggleExpand}
                  onSelectLeaf={onSelectLeaf}
                />
              ) : null}
            </li>
          );
        }
        return (
          <li key={node.id}>
            <button
              type="button"
              className={`rg-nav-item rg-nav-item--leaf${node.id === activeId ? " is-active" : ""}`}
              aria-current={node.id === activeId ? "true" : undefined}
              onClick={() => onSelectLeaf(node.id)}
            >
              {node.label}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function normalizeText(value) {
  return String(value || "").trim();
}

function parseInspectionData(rawData) {
  const provinces = Array.isArray(rawData?.provinces) ? rawData.provinces : [];
  return provinces.map((provinceItem) => {
    const provinceName = normalizeText(provinceItem.province);
    const rows = Array.isArray(provinceItem.rows) ? provinceItem.rows : [];
    let currentCity = "";
    const cityRowsMap = new Map();
    const cityOptions = [];
    const provinceRows = [];

    rows.forEach((row) => {
      const region = normalizeText(row.region).replace(/\s+/g, "");
      const channel = normalizeText(row.channel);
      if (!region || !channel) return;

      const isProvinceLevel = /(省|自治区|兵团|特别行政区)本级$/.test(region);
      if (isProvinceLevel) {
        provinceRows.push({ region, channel });
      }

      const cityMarkerMatch = region.match(/^.+(?:市|州|盟|地区|区|县|旗)本级$/);
      if (cityMarkerMatch) {
        currentCity = region.replace(/本级$/, "");
        if (!cityRowsMap.has(currentCity)) {
          cityRowsMap.set(currentCity, []);
          cityOptions.push(currentCity);
        }
        cityRowsMap.get(currentCity).push({ region, channel });
        return;
      }

      if (!currentCity) {
        currentCity = provinceName;
        if (!cityRowsMap.has(currentCity)) {
          cityRowsMap.set(currentCity, []);
          cityOptions.push(currentCity);
        }
      }
      cityRowsMap.get(currentCity).push({ region, channel });
    });

    return {
      province: provinceName,
      cityOptions,
      cityRowsMap,
      provinceRows,
    };
  });
}

function inferDefaultsByRegion(regionText, provinceItems) {
  const region = normalizeText(regionText);
  if (!region) return { province: "", city: "" };
  const provinceItem = provinceItems.find((item) => region.includes(item.province));
  if (!provinceItem) return { province: "", city: "" };
  const city = provinceItem.cityOptions.find((cityName) => region.includes(cityName)) || provinceItem.cityOptions[0] || "";
  return { province: provinceItem.province, city };
}

function RightsGuidePage() {
  const [tick, setTick] = useState(0);
  const [activeId, setActiveId] = useState("overview");
  const [expanded, setExpanded] = useState({});
  const [selectedProvince, setSelectedProvince] = useState("");
  const [selectedCity, setSelectedCity] = useState("");
  const navigate = useNavigate();

  const validIds = useMemo(() => new Set(getAllSectionIds()), []);

  const userName = useMemo(() => {
    if (!isAuthenticated()) return "";
    return getCurrentUser()?.name || "用户";
  }, [tick]);

  const handleLogout = () => {
    clearAuthSession();
    setTick((n) => n + 1);
    navigate("/", { replace: true });
  };

  const active = getSectionById(activeId);
  const inspectionProvinceItems = useMemo(
    () => parseInspectionData(laborInspectionChannels),
    []
  );
  const selectedProvinceItem = useMemo(
    () => inspectionProvinceItems.find((item) => item.province === selectedProvince) || null,
    [inspectionProvinceItems, selectedProvince]
  );

  const currentCityRows = useMemo(() => {
    if (!selectedProvinceItem || !selectedCity) return [];
    return selectedProvinceItem.cityRowsMap.get(selectedCity) || [];
  }, [selectedProvinceItem, selectedCity]);

  const visibleInspectionRows = useMemo(() => {
    if (!selectedProvinceItem || !selectedCity) return [];
    return [...selectedProvinceItem.provinceRows, ...currentCityRows];
  }, [selectedProvinceItem, selectedCity, currentCityRows]);

  const syncHash = useCallback(() => {
    const h = (window.location.hash || "").replace(/^#/, "");
    if (h && validIds.has(h)) {
      setActiveId(h);
    }
  }, [validIds]);

  useEffect(() => {
    syncHash();
  }, [syncHash]);

  useEffect(() => {
    const onHash = () => syncHash();
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [syncHash]);

  useEffect(() => {
    setExpanded((prev) => {
      const next = { ...prev };
      if (activeId.startsWith("prelit-")) next.prelit = true;
      if (activeId.startsWith("court-")) next.court = true;
      if (activeId.startsWith("green-")) next.green = true;
      return next;
    });
  }, [activeId]);

  useEffect(() => {
    if (!inspectionProvinceItems.length) return;
    const defaults = inferDefaultsByRegion(getCurrentUser()?.region, inspectionProvinceItems);
    const nextProvince = defaults.province || inspectionProvinceItems[0]?.province || "";
    const provinceItem =
      inspectionProvinceItems.find((item) => item.province === nextProvince) || inspectionProvinceItems[0];
    const nextCity = defaults.city || provinceItem?.cityOptions?.[0] || "";
    setSelectedProvince(nextProvince);
    setSelectedCity(nextCity);
  }, [inspectionProvinceItems, tick]);

  const selectLeaf = (id) => {
    setActiveId(id);
    if (window.history?.replaceState) {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#${id}`);
    }
  };

  const toggleExpand = (groupId) => {
    setExpanded((prev) => {
      const isOpen = prev[groupId] !== false;
      return { ...prev, [groupId]: !isOpen };
    });
  };

  return (
    <>
      <div className="overlay" />
      <main className="page guide-page">
        <Navbar activeKey="rights-guide" userName={userName} onLogout={handleLogout} />

        <section className="rg-workspace animate-fade-rise-delay" aria-label="维权指南">
          <aside className="panel left-panel rg-sidebar" aria-label="分类导航">
            <div className="rg-sidebar-head">
              <h2 className="rg-sidebar-title">维权指南</h2>
            </div>
            <nav className="rg-nav" aria-label="劳动维权流程">
              <NavTree
                nodes={RIGHTS_GUIDE_NAV}
                depth={0}
                activeId={activeId}
                expanded={expanded}
                onToggleExpand={toggleExpand}
                onSelectLeaf={selectLeaf}
              />
              <div className="rg-extra-entry">
                <Link className="rg-nav-link" to="/typical-cases">
                  典型案例
                </Link>
                <Link className="rg-nav-link" to="/fengqiao-experience">
                  协商调解
                </Link>
              </div>
            </nav>
          </aside>

          <article className="panel right-panel rg-main" aria-live="polite">
            <header className="rg-main-head">
              <h1>{active?.title || "维权指南"}</h1>
            </header>
            <div className="rg-main-body" id="rg-article">
              {activeId === "overview" ? (
                <figure className="rg-flowchart-wrap" aria-label="劳动法维权全流程流程图">
                  <div className="rg-flowchart-scroll">
                    <img
                      className="rg-flowchart-image"
                      src={laborRightsFlowchart}
                      alt="劳动法维权全流程：维权准备 →（非诉维权：协商和解 / 第三方调解 / 劳动监察投诉）→ 劳动仲裁 →（法院诉讼：一审 → 二审 → 再审）→ 维权成功"
                      loading="lazy"
                    />
                  </div>
                </figure>
              ) : null}
              {active?.body ? formatParagraphs(active.body) : null}
              {activeId === "prelit-inspection" ? (
                <section className="rg-inspection-panel" aria-label="劳动保障监察行政投诉渠道查询">
                  <p className="rg-inspection-hint">
                    请选择您所在的地区，可以查看所在地的劳动保障监察行政投诉渠道。
                  </p>
                  <div className="rg-inspection-filters">
                    <label className="rg-inspection-label">
                      省份
                      <select
                        className="rg-inspection-select"
                        value={selectedProvince}
                        onChange={(event) => {
                          const nextProvince = event.target.value;
                          const nextProvinceItem =
                            inspectionProvinceItems.find((item) => item.province === nextProvince) || null;
                          setSelectedProvince(nextProvince);
                          setSelectedCity(nextProvinceItem?.cityOptions?.[0] || "");
                        }}
                      >
                        {inspectionProvinceItems.map((item) => (
                          <option key={item.province} value={item.province}>
                            {item.province}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="rg-inspection-label">
                      城市
                      <select
                        className="rg-inspection-select"
                        value={selectedCity}
                        onChange={(event) => setSelectedCity(event.target.value)}
                        disabled={!selectedProvinceItem}
                      >
                        {(selectedProvinceItem?.cityOptions || []).map((city) => (
                          <option key={city} value={city}>
                            {city}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="rg-inspection-table-wrap">
                    <table className="rg-inspection-table">
                      <thead>
                        <tr>
                          <th>省份</th>
                          <th>地区</th>
                          <th>举报投诉渠道</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleInspectionRows.map((row, idx) => (
                          <tr key={`${row.region}-${idx}`}>
                            <td>{selectedProvince}</td>
                            <td>{row.region}</td>
                            <td>{row.channel}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ) : null}
            </div>
          </article>
        </section>
      </main>
    </>
  );
}

export default RightsGuidePage;
