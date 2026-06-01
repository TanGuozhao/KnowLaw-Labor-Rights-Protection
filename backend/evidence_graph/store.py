"""证据关系网持久化：按来源删除、结点查重合并、写入边。"""

from __future__ import annotations

import hashlib
import json
import re
import sqlite3
import uuid
from typing import Any


def normalize_for_dedupe(label: str, kind: str) -> str:
    s = (label or "").strip()
    s = re.sub(r"\s+", "", s)
    return f"{(kind or 'other').lower()}|{s[:180]}"


def dedupe_key_hash(norm: str) -> str:
    return hashlib.sha256(norm.encode("utf-8")).hexdigest()


def remove_graph_source(cur: sqlite3.Cursor, case_id: str, source_ref: str) -> None:
    """移除某一来源贡献的边与结点来源；孤立结点删除。"""
    cur.execute(
        """
        DELETE FROM evidence_graph_edges
        WHERE case_id = ? AND source_ref = ?
        """,
        (case_id, source_ref),
    )
    cur.execute(
        """
        DELETE FROM evidence_graph_node_sources
        WHERE case_id = ? AND source_ref = ?
        """,
        (case_id, source_ref),
    )
    cur.execute(
        """
        DELETE FROM evidence_graph_nodes
        WHERE case_id = ?
          AND node_id NOT IN (
            SELECT node_id FROM evidence_graph_node_sources WHERE case_id = ?
          )
        """,
        (case_id, case_id),
    )
    cur.execute(
        """
        DELETE FROM evidence_graph_edges
        WHERE case_id = ?
          AND (
            from_node_id NOT IN (SELECT node_id FROM evidence_graph_nodes WHERE case_id = ?)
            OR to_node_id NOT IN (SELECT node_id FROM evidence_graph_nodes WHERE case_id = ?)
          )
        """,
        (case_id, case_id, case_id),
    )


def merge_and_store(
    cur: sqlite3.Cursor,
    case_id: str,
    source_ref: str,
    graph: dict[str, Any],
) -> None:
    """
    graph: { nodes: [{stable_key, label, kind}], edges: [{from_stable_key, to_stable_key, relation, label}] }
    同一 case 内按 dedupe_key 合并结点（查重）。
    """
    remove_graph_source(cur, case_id, source_ref)

    nodes_in = graph.get("nodes") or []
    edges_in = graph.get("edges") or []
    if not isinstance(nodes_in, list):
        nodes_in = []

    stable_to_nid: dict[str, str] = {}

    for n in nodes_in:
        if not isinstance(n, dict):
            continue
        sk = str(n.get("stable_key") or "").strip()
        label = str(n.get("label") or "").strip() or "未命名"
        kind = str(n.get("kind") or "other").strip() or "other"
        if not sk:
            continue

        norm = normalize_for_dedupe(label, kind)
        dk = dedupe_key_hash(norm)

        cur.execute(
            """
            SELECT node_id FROM evidence_graph_nodes
            WHERE case_id = ? AND dedupe_key = ?
            LIMIT 1
            """,
            (case_id, dk),
        )
        row = cur.fetchone()
        if row:
            nid = str(row[0])
        else:
            cur.execute(
                """
                SELECT node_id FROM evidence_graph_nodes
                WHERE case_id = ? AND stable_key = ?
                LIMIT 1
                """,
                (case_id, sk),
            )
            row2 = cur.fetchone()
            if row2:
                nid = str(row2[0])
            else:
                nid = str(uuid.uuid4())
                cur.execute(
                    """
                    INSERT INTO evidence_graph_nodes (
                        node_id, case_id, stable_key, dedupe_key, label, kind, extra_json
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (nid, case_id, sk, dk, label, kind, None),
                )

        cur.execute(
            """
            INSERT OR IGNORE INTO evidence_graph_node_sources (node_id, case_id, source_ref)
            VALUES (?, ?, ?)
            """,
            (nid, case_id, source_ref),
        )
        stable_to_nid[sk] = nid

    for e in edges_in:
        if not isinstance(e, dict):
            continue
        fa = str(e.get("from_stable_key") or "").strip()
        tb = str(e.get("to_stable_key") or "").strip()
        if fa not in stable_to_nid or tb not in stable_to_nid:
            continue
        rel = str(e.get("relation") or "关联").strip() or "关联"
        elab = e.get("label")
        elab = str(elab).strip() if elab else None
        eid = str(uuid.uuid4())
        cur.execute(
            """
            INSERT INTO evidence_graph_edges (
                edge_id, case_id, from_node_id, to_node_id, relation, label, source_ref
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (eid, case_id, stable_to_nid[fa], stable_to_nid[tb], rel, elab, source_ref),
        )


def load_graph_for_case(cur: sqlite3.Cursor, case_id: str) -> dict[str, Any]:
    cur.execute(
        """
        SELECT node_id, stable_key, label, kind, extra_json
        FROM evidence_graph_nodes
        WHERE case_id = ?
        """,
        (case_id,),
    )
    nrows = cur.fetchall()
    nodes = []
    for r in nrows:
        extra = r["extra_json"]
        try:
            extra_obj = json.loads(extra) if extra else {}
        except json.JSONDecodeError:
            extra_obj = {}
        nodes.append(
            {
                "id": r["node_id"],
                "stable_key": r["stable_key"],
                "label": r["label"],
                "kind": r["kind"],
                "extra": extra_obj,
            }
        )

    cur.execute(
        """
        SELECT edge_id, from_node_id, to_node_id, relation, label, source_ref
        FROM evidence_graph_edges
        WHERE case_id = ?
        """,
        (case_id,),
    )
    erows = cur.fetchall()
    edges = []
    for r in erows:
        edges.append(
            {
                "id": r["edge_id"],
                "from_node_id": r["from_node_id"],
                "to_node_id": r["to_node_id"],
                "relation": r["relation"],
                "label": r["label"],
                "source_ref": r["source_ref"],
            }
        )

    return {"nodes": nodes, "edges": edges}
