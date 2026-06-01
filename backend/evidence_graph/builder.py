"""编排：对单份证据或案件字段构建/同步关系网。"""

from __future__ import annotations

import sqlite3
from datetime import datetime
from typing import Any

from evidence_graph import fingerprints
from evidence_graph.llm_extract import extract_knowledge_graph
from evidence_graph.store import load_graph_for_case, merge_and_store, remove_graph_source


def _case_context_from_row(case_row: sqlite3.Row | Any) -> str:
    parts = [
        f"被申请人：{case_row['respondent_name'] or ''}",
        f"案由：{case_row['reason'] or ''}",
        f"阶段：{case_row['stage'] or ''}",
        f"争议时间：{case_row['case_time'] or ''}",
    ]
    return "\n".join(parts)


def build_or_refresh_evidence(
    conn: sqlite3.Connection,
    case_id: str,
    evidence_id: str,
) -> None:
    cur = conn.cursor()
    cur.execute(
        """
        SELECT e.evidence_id, e.name, e.description, e.evidence_type, e.ocr_text, e.file_path,
               e.related_time, c.reason, c.case_time, c.details, c.request, c.stage,
               r.name AS respondent_name
        FROM evidence e
        JOIN cases c ON c.case_id = e.related_case_id
        JOIN characters r ON c.respondent_id = r.character_id
        WHERE e.evidence_id = ? AND e.related_case_id = ?
        """,
        (evidence_id, case_id),
    )
    row = cur.fetchone()
    if not row:
        return

    fp = fingerprints.fingerprint_evidence_row(
        {
            "name": row["name"],
            "evidence_type": row["evidence_type"],
            "description": row["description"],
            "ocr_text": row["ocr_text"],
            "file_path": row["file_path"],
            "related_time": row["related_time"],
        }
    )
    cur.execute(
        "SELECT content_hash FROM case_graph_scan_state WHERE case_id = ? AND source_key = ?",
        (case_id, f"evidence:{evidence_id}"),
    )
    prev = cur.fetchone()
    if prev and prev[0] == fp:
        return

    ctx = _case_context_from_row(row)
    body = (row["ocr_text"] or "") or (row["description"] or "") or ""
    title = str(row["name"] or "").strip() or "证据"
    graph = extract_knowledge_graph(
        case_context=ctx,
        material_title=title,
        material_body=body,
        source_label=f"证据：{title}（{row['evidence_type'] or ''}）",
    )
    merge_and_store(cur, case_id, f"evidence:{evidence_id}", graph)
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    cur.execute(
        """
        INSERT INTO case_graph_scan_state (case_id, source_key, content_hash, scanned_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(case_id, source_key) DO UPDATE SET
            content_hash = excluded.content_hash,
            scanned_at = excluded.scanned_at
        """,
        (case_id, f"evidence:{evidence_id}", fp, now),
    )
    cur.execute(
        """
        UPDATE evidence SET graph_content_hash = ?, graph_scanned_at = ?
        WHERE evidence_id = ?
        """,
        (fp, now, evidence_id),
    )
    conn.commit()


def build_or_refresh_case_field(
    conn: sqlite3.Connection,
    case_id: str,
    field: str,
) -> None:
    """field: request | details | reason"""
    if field not in ("request", "details", "reason"):
        return
    cur = conn.cursor()
    cur.execute(
        """
        SELECT c.case_id, c.reason, c.case_time, c.details, c.request, c.stage,
               r.name AS respondent_name
        FROM cases c
        JOIN characters r ON c.respondent_id = r.character_id
        WHERE c.case_id = ?
        """,
        (case_id,),
    )
    row = cur.fetchone()
    if not row:
        return

    text = str(row[field] or "").strip()
    source_key = f"case:{field}"
    fp = fingerprints.fingerprint_text(text)
    cur.execute(
        "SELECT content_hash FROM case_graph_scan_state WHERE case_id = ? AND source_key = ?",
        (case_id, source_key),
    )
    prev = cur.fetchone()
    if not text:
        if prev:
            remove_graph_source(cur, case_id, source_key)
            cur.execute(
                "DELETE FROM case_graph_scan_state WHERE case_id = ? AND source_key = ?",
                (case_id, source_key),
            )
            conn.commit()
        return
    if prev and prev[0] == fp:
        return

    ctx = _case_context_from_row(row)
    labels = {
        "request": "诉求摘要（案件表 request）",
        "details": "案情经过（案件表 details）",
        "reason": "案由/争议（案件表 reason）",
    }
    graph = extract_knowledge_graph(
        case_context=ctx,
        material_title=labels[field],
        material_body=text,
        source_label=labels[field],
    )
    merge_and_store(cur, case_id, source_key, graph)
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    cur.execute(
        """
        INSERT INTO case_graph_scan_state (case_id, source_key, content_hash, scanned_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(case_id, source_key) DO UPDATE SET
            content_hash = excluded.content_hash,
            scanned_at = excluded.scanned_at
        """,
        (case_id, source_key, fp, now),
    )
    conn.commit()


def sync_case_graph_full(conn: sqlite3.Connection, case_id: str) -> dict[str, Any]:
    """扫描案件字段 + 全部证据（指纹变化才重建）。"""
    build_or_refresh_case_field(conn, case_id, "request")
    build_or_refresh_case_field(conn, case_id, "details")
    build_or_refresh_case_field(conn, case_id, "reason")

    cur = conn.cursor()
    cur.execute(
        """
        SELECT evidence_id FROM evidence
        WHERE related_case_id = ?
        ORDER BY submission_date ASC
        """,
        (case_id,),
    )
    for r in cur.fetchall():
        eid = str(r[0])
        build_or_refresh_evidence(conn, case_id, eid)

    return load_graph_for_case(conn.cursor(), case_id)


def graph_to_neo4j(results: dict[str, Any]) -> dict[str, Any]:
    """供 neo4jd3 使用的 results[0].data[0].graph 结构。"""
    nodes_out = []
    for n in results.get("nodes") or []:
        nid = n.get("id") or n.get("node_id")
        nodes_out.append(
            {
                "id": nid,
                "labels": ["EvidenceNode"],
                "properties": {
                    "node_id": nid,
                    "label": n.get("label") or "",
                    "kind": n.get("kind") or "other",
                    "stable_key": n.get("stable_key") or "",
                },
            }
        )
    rels = []
    for e in results.get("edges") or []:
        eid = e.get("id") or e.get("edge_id")
        rel_type = "REL"
        rels.append(
            {
                "id": eid,
                "type": rel_type,
                "startNode": e["from_node_id"],
                "endNode": e["to_node_id"],
                "properties": {
                    "relation": str(e.get("relation") or ""),
                    "label": e.get("label") or "",
                    "source_ref": e.get("source_ref") or "",
                },
            }
        )
    return {
        "results": [
            {
                "data": [
                    {
                        "graph": {
                            "nodes": nodes_out,
                            "relationships": rels,
                        }
                    }
                ]
            }
        ]
    }
