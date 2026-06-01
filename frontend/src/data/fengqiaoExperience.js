let fengqiaoCache = null;

function normalizeLine(line) {
  return String(line || "")
    .replace(/[\u00a0\u2002\u2003\u2009\u202f]/g, " ")
    .replace(/\u3000/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function toSlug(input) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isSourceLine(line) {
  if (!line || line.length > 30) return false;
  if (/[:：|]/.test(line)) return false;
  if (isMetaLine(line)) return false;
  return /(人民政府|司法局|人力资源和社会保障局|信息网|法院网|法院|检察院|检察日报|法治网|长安网|发布厅|新华网|中国日报网|民主与法制网)$/.test(line);
}

function isLikelyTitle(line) {
  if (!line) return false;
  if (line.length < 6) return false;
  return !/^(来源|时间|发布时间|信息来源|文章来源|【|案情|案例回顾|作者：|日期：|________________________________________)/.test(
    line,
  );
}

function pickSummary(lines) {
  for (const line of lines) {
    if (!line) continue;
    if (/^(来源|时间|发布时间|信息来源|文章来源|作者：|日期：)/.test(line)) continue;
    return line;
  }
  return "查看详情";
}

function isMetaLine(line) {
  return /^(来源|信息来源|时间|发布时间|文章来源|作者：|日期：|阅读量：|浏览量：)/.test(line);
}

function cleanupBody(lines) {
  const cleaned = [];
  for (const raw of lines) {
    const line = normalizeLine(raw);
    if (!line) continue;
    if (line === "________________________________________") continue;
    if (isMetaLine(line)) continue;
    cleaned.push(line.replace(/^办案手记】/, "【办案手记】"));
  }
  return cleaned;
}

function extractDate(metaLine, bodyLines) {
  const datePattern =
    /((?:19|20)\d{2}[./-]\d{1,2}[./-]\d{1,2}(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?|(?:19|20)\d{2}年\d{1,2}月\d{1,2}日(?:\s*\d{1,2}:\d{2}(?::\d{2})?)?)/;
  const fromMeta = normalizeLine(metaLine).match(datePattern)?.[1];
  if (fromMeta) return fromMeta;
  for (const line of bodyLines.slice(0, 2)) {
    if (!/^(时间|发布时间|日期|信息来源|来源|文章来源)/.test(line)) continue;
    const v = line.match(datePattern)?.[1];
    if (v) return v;
  }
  return "";
}

function parseFengqiaoArticles(text) {
  const lines = text.split(/\r?\n/).map(normalizeLine).filter(Boolean);
  const articles = [];
  let current = null;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const next = lines[i + 1] || "";
    const startNew = isSourceLine(line) && isLikelyTitle(next);

    if (startNew) {
      if (current) articles.push(current);
      current = { source: line, title: next, lines: [], metaLine: "" };
      i += 1;
      continue;
    }

    if (!current) continue;
    if (!current.metaLine && isMetaLine(line)) {
      current.metaLine = line;
      continue;
    }
    current.lines.push(line);
  }

  if (current) articles.push(current);

  return articles.map((item, index) => {
    const bodyLines = cleanupBody(item.lines);
    const summary = pickSummary(bodyLines);
    const date = extractDate(item.metaLine, bodyLines);
    const caseNo = index + 1;
    const normalizedTitle = (item.title || "")
      .replace(/^办案手记】/, "【办案手记】")
      .replace(/\s+/g, " ")
      .trim();
    const safeTitle =
      normalizedTitle.length > 48 ? `${normalizedTitle.slice(0, 48).trim()}…` : normalizedTitle;
    return {
      id: `${toSlug(item.title || `article-${index + 1}`) || "article"}-${index + 1}`,
      caseNo,
      listTitle: `案例${caseNo}. ${safeTitle}`,
      source: item.source,
      date,
      title: safeTitle,
      summary,
      content: bodyLines.join("\n"),
    };
  });
}

async function fetchFirstAvailable(urls) {
  for (const url of urls) {
    try {
      const resp = await fetch(url);
      if (resp.ok) return resp.text();
    } catch {
      // ignore and try next source
    }
  }
  throw new Error("无法加载枫桥经验数据。");
}

export async function loadFengqiaoArticles() {
  if (fengqiaoCache) return fengqiaoCache;
  try {
    const resp = await fetch("/data/fengqiao-experience.json");
    if (resp.ok) {
      const json = await resp.json();
      if (Array.isArray(json)) {
        fengqiaoCache = json;
        return fengqiaoCache;
      }
    }
  } catch {
    // fallback to parsing raw data
  }
  const text = await fetchFirstAvailable(["/枫桥经验", "/data/fengqiao-experience.txt"]);
  fengqiaoCache = parseFengqiaoArticles(text);
  return fengqiaoCache;
}

