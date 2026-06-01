import { fetchEvidenceGraph } from "./api.js";

/** 上一次证据网注册的 resize，避免重复打开面板时监听器堆积 */
let _lastEvidenceGraphResizeHandler = null;

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderGraphNodeDetail(panelEl, d) {
  if (!panelEl) return;
  const props = d && d.properties ? d.properties : {};
  const neoClass = d && d.labels && d.labels.length ? d.labels[0] : "—";
  const title =
    (props.label && String(props.label).trim()) ||
    (props.name && String(props.name).trim()) ||
    `结点 ${d && d.id != null ? d.id : ""}`;

  const rows = [
    ["类型", neoClass],
    ["实体名", props.label || "—"],
    ["实体分类", props.kind || "—"],
    ["稳定键", props.stable_key || props.stableKey || "—"],
    ["图 id", d && d.id != null ? String(d.id) : "—"],
  ];
  const extraKeys = Object.keys(props).filter(
    (k) => !["label", "name", "kind", "stable_key", "stableKey"].includes(k)
  );
  for (const k of extraKeys.sort()) {
    rows.push([k, props[k]]);
  }

  panelEl.innerHTML = `
    <div class="my-cases-graph-detail__title">${escapeHtml(title)}</div>
    <dl class="my-cases-graph-detail__dl">
      ${rows
        .map(
          ([k, v]) =>
            `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(
              typeof v === "object" ? JSON.stringify(v) : String(v ?? "—")
            )}</dd>`
        )
        .join("")}
    </dl>
  `;
}

function clearGraphNodeDetail(panelEl) {
  if (!panelEl) return;
  panelEl.innerHTML = `<p class="my-cases-graph-detail__placeholder">点击上图中的结点，查看名称、分类与属性。</p>`;
}

async function ensureNeo4jd3Loaded() {
  const existingCtor = globalThis.Neo4jd3 || globalThis.Neo4jD3;
  if (existingCtor) return existingCtor;
  const existingScript = document.querySelector(
    'script[src*="assets/vendor/neo4jd3/js/neo4jd3.js"]'
  );
  if (existingScript) {
    return globalThis.Neo4jd3 || globalThis.Neo4jD3 || null;
  }
  await new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = "./assets/vendor/neo4jd3/js/neo4jd3.js";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => resolve();
    document.head.appendChild(s);
  });
  return globalThis.Neo4jd3 || globalThis.Neo4jD3 || null;
}

function measureGraphHostPx() {
  const minPx = 420;
  const vhPx = Math.round(window.innerHeight * 0.52);
  return Math.max(minPx, vhPx);
}

/**
 * 打开证据网页时调用：后端会检查案由/诉求/案情与各证据指纹，未扫描则先构建再返回。
 */
export async function renderEvidenceGraph({ caseId, canvasId = "myCasesGraphCanvas" }) {
  const container = document.getElementById(canvasId);
  if (!container) return;

  if (_lastEvidenceGraphResizeHandler) {
    window.removeEventListener("resize", _lastEvidenceGraphResizeHandler);
    _lastEvidenceGraphResizeHandler = null;
  }

  const statusId = `${canvasId}Status`;
  const graphId = `${canvasId}Inner`;

  const detailId = `${canvasId}Detail`;

  container.innerHTML = `
    <div id="${statusId}" class="my-cases-graph-status">正在同步案件与证据并构建关系网…</div>
    <div id="${graphId}" class="my-cases-graph-inner"></div>
    <div id="${detailId}" class="my-cases-graph-detail" role="region" aria-label="选中结点详情">
      <p class="my-cases-graph-detail__placeholder">点击上图中的结点，查看名称、分类与属性。</p>
    </div>
  `;

  const statusEl = document.getElementById(statusId);
  const graphHost = document.getElementById(graphId);
  const detailEl = document.getElementById(detailId);

  function applyGraphHostSize() {
    if (!graphHost || !graphHost.isConnected) return;
    const h = measureGraphHostPx();
    graphHost.style.minHeight = `${h}px`;
    graphHost.style.height = `${h}px`;
  }

  const Neo4jd3Ctor = await ensureNeo4jd3Loaded();
  if (!Neo4jd3Ctor) {
    if (statusEl) {
      statusEl.textContent = "neo4jd3 未加载，无法渲染证据网。";
      statusEl.classList.add("my-cases-graph-status--error");
    }
    return;
  }

  applyGraphHostSize();

  const onResize = () => applyGraphHostSize();
  window.addEventListener("resize", onResize, { passive: true });
  _lastEvidenceGraphResizeHandler = onResize;

  try {
    const data = await fetchEvidenceGraph(caseId);
    const neo = data?.neo4j;
    const nodes = neo?.results?.[0]?.data?.[0]?.graph?.nodes || [];
    if (!nodes.length) {
      window.removeEventListener("resize", onResize);
      _lastEvidenceGraphResizeHandler = null;
      if (detailEl) clearGraphNodeDetail(detailEl);
      if (statusEl) {
        statusEl.textContent =
          "暂无结点。请先在「证据」中上传材料，或在案件详情中补充诉求摘要与案情经过。";
      }
      return;
    }

    if (statusEl) {
      statusEl.textContent = "";
    }

    applyGraphHostSize();

    if (detailEl) clearGraphNodeDetail(detailEl);

    // eslint-disable-next-line new-cap
    new Neo4jd3Ctor(`#${graphId}`, {
      neo4jData: neo,
      nodeRadius: 38,
      minCollision: 88,
      zoomFit: true,
      infoPanel: false,
      onNodeClick(d) {
        renderGraphNodeDetail(detailEl, d);
      },
    });

    window.requestAnimationFrame(() => {
      applyGraphHostSize();
      window.setTimeout(() => window.dispatchEvent(new Event("resize")), 60);
    });
  } catch (e) {
    window.removeEventListener("resize", onResize);
    _lastEvidenceGraphResizeHandler = null;
    if (statusEl) {
      statusEl.classList.add("my-cases-graph-status--error");
      statusEl.textContent = `加载失败：${e?.message || e}`;
    }
  }
}
