import { listCaseEvidence } from "./api.js";

const NODE_FIXED_SIZE = 42;
const MAX_LABEL_RENDER_CHARS = 240;
const TIMELINE_NODE_RADIUS = 40;

function escapeForCypherString(raw) {
  // Neo4j string literal escaping.
  return String(raw ?? "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function tryParseMonthYear(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return null;

  // Examples:
  // - 2025-11
  // - 2025/11
  // - 2025年11月
  // - 2025年11月或2025年12月 (we only take the first match)
  const m = s.match(/(\d{4})\s*[-/年]\s*(\d{1,2})\s*(?:月)?/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (!year || month < 1 || month > 12) return null;
  // Use first day of that month as ordering anchor.
  return Date.UTC(year, month - 1, 1);
}

function formatMonthYear(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const m = s.match(/(\d{4})\s*[-/年]\s*(\d{1,2})\s*(?:月)?/);
  if (!m) return "";
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (!year || month < 1 || month > 12) return "";
  return `${year}-${String(month).padStart(2, "0")}`;
}

function evidenceSortKey(e) {
  // Prefer related_time for human timeline ordering; fallback to submission_date.
  const t = tryParseMonthYear(e.related_time);
  if (t !== null && t !== undefined) return t;
  const sub = String(e.submission_date ?? "");
  const parsed = Date.parse(sub.replace(" ", "T"));
  return Number.isFinite(parsed) ? parsed : 0;
}

function wrapTextToLines(ctx, text, maxW) {
  const lines = [];
  const paragraphs = String(text ?? "")
    .replace(/\r/g, "")
    .split("\n");
  for (const para of paragraphs) {
    const p = para.trim();
    if (!p) continue;
    let line = "";
    for (const ch of Array.from(p)) {
      const test = line + ch;
      if (ctx.measureText(test).width <= maxW) {
        line = test;
      } else {
        if (line) lines.push(line);
        if (ctx.measureText(ch).width > maxW) {
          lines.push(ch);
          line = "";
        } else {
          line = ch;
        }
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

function trimLinesToMaxWithEllipsis(ctx, lines, maxLines, maxW) {
  if (lines.length <= maxLines) return lines;
  const out = lines.slice(0, maxLines);
  let last = out[maxLines - 1];
  const ell = "…";
  while (last.length > 0 && ctx.measureText(`${last}${ell}`).width > maxW) {
    last = last.slice(0, -1);
  }
  out[maxLines - 1] = last.length ? `${last}${ell}` : ell;
  return out;
}

function nodePrimaryTextForTimeline(node) {
  const p = node?.properties || {};
  const raw =
    p?.title ??
    p?.name ??
    p?.time_text ??
    p?.evidence_id ??
    p?.order ??
    node?.title ??
    node?.name ??
    node?.time_text ??
    node?.evidence_id ??
    node?.order ??
    "";
  const s = String(raw ?? "");
  // In case Neo4j/Neovis ends up escaping newline.
  return s.replace(/\\n/g, "\n").trim();
}

function nodeLabelForTimeline(node) {
  const s = nodePrimaryTextForTimeline(node);
  if (!s) return "";
  if (s.length <= MAX_LABEL_RENDER_CHARS) return s;
  return `${s.slice(0, MAX_LABEL_RENDER_CHARS)}…`;
}

function uniformNodeCtxRenderer({ ctx, x, y, state, style, label }) {
  const r = NODE_FIXED_SIZE;
  const d = r * 2;
  const lineWidth = state.selected
    ? style.borderWidthSelected ?? style.borderWidth * 2
    : style.borderWidth;

  let fill = style.color?.background ?? "#f2f6ff";
  let stroke = style.color?.border ?? "#5c7fc4";
  if (state.selected) {
    fill = style.color?.highlight?.background ?? fill;
    stroke = style.color?.highlight?.border ?? stroke;
  } else if (state.hover) {
    fill = style.color?.hover?.background ?? fill;
    stroke = style.color?.hover?.border ?? stroke;
  }

  const fontSize = style.font?.size ?? 12;
  const fontFace = style.font?.face ?? "Inter, sans-serif";
  const fontColor = style.font?.color ?? "#132b56";
  const shadow = style.shadow;

  return {
    drawNode() {
      if (shadow?.enabled) {
        ctx.save();
        ctx.shadowColor = shadow.color ?? "rgba(0,0,0,0.2)";
        ctx.shadowBlur = shadow.size ?? 10;
        ctx.shadowOffsetX = shadow.x ?? 0;
        ctx.shadowOffsetY = shadow.y ?? 3;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.restore();
      }

      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.lineWidth = lineWidth;
      ctx.strokeStyle = stroke;
      ctx.stroke();

      const text = String(label ?? "").replace(/\r/g, "").trim();
      if (!text) return;

      ctx.font = `${fontSize}px ${fontFace}`;
      ctx.fillStyle = fontColor;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      const maxW = r * 1.62;
      const lineHeight = fontSize * 1.22;
      const maxLines = Math.max(1, Math.floor((r * 2 * 0.82) / lineHeight));

      let lines = wrapTextToLines(ctx, text, maxW);
      lines = trimLinesToMaxWithEllipsis(ctx, lines, maxLines, maxW);

      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, r * 0.94, 0, Math.PI * 2);
      ctx.clip();

      const totalH = lines.length * lineHeight;
      let cy = y - totalH / 2 + lineHeight / 2;
      for (const ln of lines) {
        ctx.fillText(ln, x, cy);
        cy += lineHeight;
      }
      ctx.restore();
    },
    drawExternalLabel() {},
    nodeDimensions: { width: d, height: d },
  };
}

async function ensureNeo4jd3Loaded() {
  const existingCtor = globalThis.Neo4jd3 || globalThis.Neo4jD3;
  if (existingCtor) return existingCtor;

  // 如果已经有同路径的脚本标签在加载中/加载失败，不重复插入，直接放弃。
  const existingScript = document.querySelector(
    'script[src*="assets/vendor/neo4jd3/js/neo4jd3.js"]'
  );
  if (existingScript) {
    return null;
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

function decorateTimelineNodeTimeLabels(graphId) {
  const host = document.getElementById(graphId);
  if (!host) return;
  const svg = host.querySelector("svg");
  if (!svg) return;

  const nodeGroups = svg.querySelectorAll(".node");
  nodeGroups.forEach((group) => {
    const d = group.__data__;
    const props = d?.properties || {};
    const timeText = String(props.time_text || "").trim();
    if (!timeText) return;

    let timeLabel = group.querySelector(".timeline-time-label");
    if (!timeLabel) {
      timeLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
      timeLabel.setAttribute("class", "timeline-time-label");
      timeLabel.setAttribute("x", "0");
      timeLabel.setAttribute("y", "62");
      timeLabel.setAttribute("text-anchor", "middle");
      timeLabel.setAttribute("font-size", "12");
      timeLabel.setAttribute("fill", "#1c365e");
      timeLabel.style.pointerEvents = "none";
      group.appendChild(timeLabel);
    }
    timeLabel.textContent = timeText;
  });
}

function decorateTimelineNodeTypeLabels(graphId) {
  const host = document.getElementById(graphId);
  if (!host) return;
  const svg = host.querySelector("svg");
  if (!svg) return;

  const nodeGroups = svg.querySelectorAll(".node");
  nodeGroups.forEach((group) => {
    const d = group.__data__;
    const props = d?.properties || {};
    const typeText =
      String(props.evidence_type || "").trim() ||
      String(props.name || "").trim() ||
      "证据";
    const maxCharsPerLine = 5;
    const maxLines = 2;
    const chars = Array.from(typeText);
    const lines = [];
    for (let i = 0; i < chars.length; i += maxCharsPerLine) {
      lines.push(chars.slice(i, i + maxCharsPerLine).join(""));
    }
    let wrapped = lines.slice(0, maxLines);
    if (lines.length > maxLines && wrapped.length) {
      const lastIdx = wrapped.length - 1;
      const last = wrapped[lastIdx];
      wrapped[lastIdx] = last.length >= maxCharsPerLine ? `${last.slice(0, maxCharsPerLine - 1)}…` : `${last}…`;
    }

    let typeLabel = group.querySelector(".timeline-type-label");
    if (!typeLabel) {
      typeLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
      typeLabel.setAttribute("class", "timeline-type-label");
      typeLabel.setAttribute("x", "0");
      typeLabel.setAttribute("y", "0");
      typeLabel.setAttribute("text-anchor", "middle");
      typeLabel.setAttribute("font-size", "12");
      typeLabel.setAttribute("font-weight", "600");
      typeLabel.setAttribute("fill", "#0f2a55");
      typeLabel.style.pointerEvents = "none";
      group.appendChild(typeLabel);
    }
    while (typeLabel.firstChild) {
      typeLabel.removeChild(typeLabel.firstChild);
    }
    const lineHeight = 14;
    const startDy = -((wrapped.length - 1) * lineHeight) / 2;
    wrapped.forEach((line, idx) => {
      const tspan = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
      tspan.setAttribute("x", "0");
      tspan.setAttribute("dy", idx === 0 ? String(startDy) : String(lineHeight));
      tspan.textContent = line;
      typeLabel.appendChild(tspan);
    });
  });
}

function enforceStraightTimelineLayout(graphId) {
  const host = document.getElementById(graphId);
  if (!host) return;
  const svg = host.querySelector("svg");
  if (!svg) return;

  const nodeGroups = Array.from(svg.querySelectorAll(".node"));
  if (!nodeGroups.length) return;

  const sortable = nodeGroups
    .map((group) => ({ group, data: group.__data__ }))
    .filter((item) => item.data && item.data.properties);
  if (!sortable.length) return;

  sortable.sort((a, b) => {
    const ao = Number(a.data?.properties?.order ?? 0);
    const bo = Number(b.data?.properties?.order ?? 0);
    return ao - bo;
  });

  const width = host.clientWidth || 900;
  const height = host.clientHeight || 420;
  const leftPad = 64;
  const rightPad = 64;
  const lineY = Math.max(84, Math.floor(height * 0.52));
  const usable = Math.max(120, width - leftPad - rightPad);
  const step = sortable.length > 1 ? usable / (sortable.length - 1) : 0;

  sortable.forEach((item, index) => {
    const x = leftPad + step * index;
    const y = lineY;
    // 设置 fx/fy 可把节点固定在直线布局，避免力导继续团在一起。
    item.data.x = x;
    item.data.y = y;
    item.data.fx = x;
    item.data.fy = y;
  });
}

export async function renderEvidenceTimeline({ caseId, canvasId = "myCasesTimelineCanvas" }) {
  const container = document.getElementById(canvasId);
  if (!container) return;

  const statusId = `${canvasId}Status`;
  const graphId = `${canvasId}Inner`;
  container.innerHTML = `
    <div id="${statusId}" style="padding:18px;color:rgba(28,54,94,0.72);font-size:13px;">时间线渲染中…</div>
    <div id="${graphId}" style="width:100%;height:100%;"></div>
  `;

  const data = await listCaseEvidence(caseId);
  const evidence = Array.isArray(data?.evidence) ? data.evidence : [];

  if (!evidence.length) {
    container.innerHTML = `<div style="padding:18px;color:rgba(28,54,94,0.72);font-size:13px;">该案件暂无证据。</div>`;
    return;
  }

  // Sort and generate timeline relationships.
  const sorted = [...evidence].sort((a, b) => evidenceSortKey(a) - evidenceSortKey(b));
  // Build neo4jd3-compatible data directly from sorted evidence.
  const nodes = [];
  const relationships = [];

  sorted.forEach((ev, index) => {
    const evidenceId = String(ev?.evidence_id || "").trim();
    if (!evidenceId) {
      return;
    }

    const timeText =
      formatMonthYear(ev.related_time) ||
      String(ev.related_time || "").trim() ||
      String(ev.submission_date || "").slice(0, 10) ||
      "";
    const title =
      String(ev.evidence_type || "").trim() ||
      String(ev.name || "").trim() ||
      "证据";

    nodes.push({
      id: evidenceId,
      labels: ["Case"],
      properties: {
        evidence_id: evidenceId,
        name: String(ev.name || "").trim(),
        evidence_type: String(ev.evidence_type || "").trim(),
        related_time: ev.related_time ?? null,
        submission_date: ev.submission_date ?? null,
        time_text: timeText,
        title,
        order: index,
      },
    });

    if (index < sorted.length - 1) {
      const next = sorted[index + 1];
      const nextId = String(next?.evidence_id || "").trim();
      if (nextId) {
        relationships.push({
          id: `rel_${index}_${evidenceId}_${nextId}`,
          type: "NEXT",
          startNode: evidenceId,
          endNode: nextId,
          properties: {
            order: index,
            type: "NEXT",
          },
        });
      }
    }
  });

  const Neo4jd3Ctor = await ensureNeo4jd3Loaded();
  if (!Neo4jd3Ctor) {
    const statusEl = document.getElementById(statusId);
    if (statusEl) {
      statusEl.style.color = "rgba(176,48,48,0.95)";
      statusEl.textContent = "neo4jd3 未加载，无法渲染时间线。";
    }
    return;
  }

  try {
    // neo4jd3 expects一个选择器或元素，这里传入内部 graph 容器。
    // eslint-disable-next-line new-cap
    new Neo4jd3Ctor(`#${graphId}`, {
      neo4jData: {
        results: [
          {
            data: [
              {
                graph: {
                  nodes,
                  relationships,
                },
              },
            ],
          },
        ],
      },
      nodeRadius: TIMELINE_NODE_RADIUS,
      minCollision: TIMELINE_NODE_RADIUS * 2 + 8,
      zoomFit: true,
      infoPanel: false,
    });

    // neo4jd3 渲染完节点后，补充“节点下方时间”文本。
    window.setTimeout(() => enforceStraightTimelineLayout(graphId), 0);
    window.setTimeout(() => enforceStraightTimelineLayout(graphId), 120);
    window.setTimeout(() => enforceStraightTimelineLayout(graphId), 360);
    window.setTimeout(() => decorateTimelineNodeTypeLabels(graphId), 0);
    window.setTimeout(() => decorateTimelineNodeTypeLabels(graphId), 250);
    window.setTimeout(() => decorateTimelineNodeTimeLabels(graphId), 0);
    window.setTimeout(() => decorateTimelineNodeTimeLabels(graphId), 250);

    const statusEl = document.getElementById(statusId);
    if (statusEl) {
      statusEl.textContent = "";
    }
  } catch (err) {
    const statusEl = document.getElementById(statusId);
    if (statusEl) {
      statusEl.style.color = "rgba(176,48,48,0.95)";
      statusEl.textContent = `时间线渲染失败：${String(err?.message || err)}`;
    }
  }
}

