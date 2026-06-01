// Knowledge graph helpers (kept as backup for future use).
// Node shape is aligned with what neovis/neo-vis expects:
//   { identity, labels, properties }

const CYPHER_IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

function assertCypherIdent(raw, fieldLabel = "标识符") {
  const name = String(raw ?? "").trim();
  if (!name) return "";
  if (!CYPHER_IDENT_RE.test(name)) {
    throw new Error(`${fieldLabel} 仅允许字母、数字与下划线，且不能以数字开头`);
  }
  return name;
}

function splitLabels(raw) {
  return String(raw ?? "")
    .split(/[,，]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Build a knowledge graph node object.
 *
 * @param {object} params
 * @param {*} [params.identity=null] - Neo4j internal id; may be number or driver integer-like object.
 * @param {string} [params.rawLabels] - Comma-separated Neo4j labels, e.g. "Person,Case".
 * @param {string[]} [params.labels] - Explicit labels array.
 * @param {Record<string, any>} [params.properties={}] - Node properties.
 * @returns {{
 *   identity: *,
 *   labels: string[],
 *   properties: Record<string, any>,
 *   neo4j: { createCypher: string | null, createParams: { props: Record<string, any> } }
 * }}
 */
export function buildKnowledgeGraphNode({
  identity = null,
  rawLabels,
  labels,
  properties = {},
} = {}) {
  const nextLabels = Array.isArray(labels) ? labels : splitLabels(rawLabels);
  const normalizedLabels = nextLabels.map((l) => assertCypherIdent(l, "节点标签")).filter(Boolean);

  const normalizedProps =
    properties && typeof properties === "object" && !Array.isArray(properties) ? properties : {};

  const labelClause = normalizedLabels.map((l) => `:${l}`).join("");
  const createCypher = normalizedLabels.length
    ? `CREATE (n${labelClause}) SET n += $props RETURN id(n) AS id, labels(n) AS labels`
    : null;

  return {
    identity,
    labels: normalizedLabels,
    properties: normalizedProps,
    neo4j: {
      createCypher,
      createParams: { props: normalizedProps },
    },
  };
}

