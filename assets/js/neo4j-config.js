const NEO4J_CONFIG_KEY = "neo4j_local_config";

const DEFAULT_NEO4J_CONFIG = {
  serverUrl: "bolt://localhost:7687",
  serverUser: "neo4j",
  serverPassword: "",
  database: "neo4j",
  initialCypher: "MATCH (n)-[r]->(m) RETURN n,r,m LIMIT 60",
};

export function getDefaultNeo4jConfig() {
  return { ...DEFAULT_NEO4J_CONFIG };
}

export function loadNeo4jConfig() {
  const raw = localStorage.getItem(NEO4J_CONFIG_KEY);
  if (!raw) {
    return getDefaultNeo4jConfig();
  }

  try {
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_NEO4J_CONFIG,
      ...parsed,
    };
  } catch (_error) {
    return getDefaultNeo4jConfig();
  }
}

export function saveNeo4jConfig(config) {
  const next = {
    ...DEFAULT_NEO4J_CONFIG,
    ...config,
  };
  localStorage.setItem(NEO4J_CONFIG_KEY, JSON.stringify(next));
  return next;
}
