import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function normalizeLine(line) {
  return String(line || "").replace(/\u3000/g, " ").trim();
}

function toSlug(input) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isCaseTitle(line) {
  return /^案例[0-9一二三四五六七八九十百千]+[.、．]?\s*\S*/.test(line) || /^指导案例\d+号$/.test(line);
}

function pickSummary(lines) {
  for (const line of lines) {
    if (!line) continue;
    if (/^【(基本案情|裁判结果|典型意义|相关法条|关键词|裁判要点|裁判理由)】/.test(line)) continue;
    if (/^(基本案情|裁判结果|裁判理由|相关法条|关键词|裁判要点)$/.test(line)) continue;
    return line;
  }
  return "查看案例详情";
}

function finalizeCase(item, index) {
  const titleOnly = /^案例[0-9一二三四五六七八九十百千]+[.、．]?$/.test(item.title);
  const summary = pickSummary(item.lines);
  const displayTitle = titleOnly ? `${item.title} ${summary}` : item.title;
  return {
    id: `${toSlug(displayTitle) || "case"}-${index + 1}`,
    title: displayTitle,
    rawTitle: item.title,
    summary,
    content: item.lines.join("\n"),
  };
}

function parseTypicalCases(text) {
  const lines = text.split(/\r?\n/).map(normalizeLine);
  const rawCases = [];
  let current = null;

  for (const line of lines) {
    if (!line) continue;
    if (isCaseTitle(line)) {
      if (current) rawCases.push(current);
      current = { title: line, lines: [] };
      continue;
    }
    if (current) current.lines.push(line);
  }

  if (current) rawCases.push(current);
  return rawCases.map(finalizeCase);
}

async function main() {
  const root = path.resolve(__dirname, "..");
  const sourcePath = path.resolve(root, "public", "data", "typical-cases.txt");
  const outputPath = path.resolve(root, "public", "data", "typical-cases.json");

  const text = await fs.readFile(sourcePath, "utf-8");
  const cases = parseTypicalCases(text);
  await fs.writeFile(outputPath, `${JSON.stringify(cases, null, 2)}\n`, "utf-8");
  console.log(`generated ${cases.length} cases -> ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

