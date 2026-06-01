"""
Knowledge graph helpers (kept as backup for future use).

The returned node structure is aligned with what neovis/neo-vis expects:
  { "identity": ..., "labels": [...], "properties": {...} }
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Union


_CYPHER_IDENT_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def _assert_cypher_ident(raw: Any, field_label: str = "标识符") -> str:
    name = str(raw or "").strip()
    if not name:
        return ""
    if not _CYPHER_IDENT_RE.match(name):
        raise ValueError(f"{field_label} 仅允许字母、数字与下划线，且不能以数字开头")
    return name


def _split_labels(raw: Optional[Union[str, List[str]]]) -> List[str]:
    if raw is None:
        return []
    if isinstance(raw, list):
        return [str(x).strip() for x in raw if str(x).strip()]
    return [s.strip() for s in str(raw).split(",") if s.strip()] + [
        s.strip() for s in str(raw).split("，") if s.strip()
    ]


def build_knowledge_graph_node(
    *,
    identity: Any = None,
    raw_labels: Optional[str] = None,
    labels: Optional[List[str]] = None,
    properties: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Build a knowledge graph node object.

    Parameters:
      identity: Neo4j internal id (may be int or driver integer-like object)
      raw_labels: comma-separated Neo4j labels, e.g. "Person,Case"
      labels: explicit labels array (takes precedence over raw_labels)
      properties: node properties dict
    """

    next_labels = labels if labels is not None else _split_labels(raw_labels)
    normalized_labels = [_assert_cypher_ident(l, "节点标签") for l in next_labels]
    normalized_labels = [l for l in normalized_labels if l]

    normalized_props: Dict[str, Any] = properties if isinstance(properties, dict) else {}

    label_clause = "".join(f":{l}" for l in normalized_labels)
    create_cypher = (
        f"CREATE (n{label_clause}) SET n += $props RETURN id(n) AS id, labels(n) AS labels"
        if normalized_labels
        else None
    )

    return {
        "identity": identity,
        "labels": normalized_labels,
        "properties": normalized_props,
        "neo4j": {
            "create_cypher": create_cypher,
            "create_params": {"props": normalized_props},
        },
    }

