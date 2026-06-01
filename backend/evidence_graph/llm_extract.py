"""调用证据关系网专用大模型，从材料文本抽取结点和关系（JSON）。"""

from __future__ import annotations

import re
import uuid
from typing import Any

from openai import OpenAI

from contract_review.json_extract import extract_json_object
from evidence_graph.settings import load_evidence_graph_llm_config


def _slug_key(s: str) -> str:
    t = re.sub(r"[^\w\u4e00-\u9fff]+", "_", (s or "").strip())
    t = re.sub(r"_+", "_", t).strip("_")
    return t[:64] or "node"


def extract_knowledge_graph(
    *,
    case_context: str,
    material_title: str,
    material_body: str,
    source_label: str,
) -> dict[str, Any]:
    """
    返回 { "nodes": [...], "edges": [...] }。
    每个 node: stable_key, label, kind
    每个 edge: from_stable_key, to_stable_key, relation, label(可选)
    kind 取值: person, organization, document, fact, claim, amount, other
    """
    cfg = load_evidence_graph_llm_config()
    api_key = str(cfg.get("api_key", "") or "").strip()
    if not api_key:
        return _heuristic_graph(material_title, material_body)

    base_url = str(cfg.get("base_url", "https://api.hunyuan.cloud.tencent.com/v1") or "").strip()
    model = str(cfg.get("model", "hunyuan-turbos-latest") or "").strip()
    enable_enhancement = bool(cfg.get("enable_enhancement", True))

    body = (material_body or "")[:12000]
    user_blob = (
        f"【材料来源】{source_label}\n【材料标题】{material_title}\n\n"
        f"【案件上下文】\n{case_context[:4000]}\n\n"
        f"【材料正文摘录】\n{body}"
    )

    system = (
        "你是劳动争议证据关系抽取助手。根据材料从劳动维权视角抽取「实体结点」和「关系边」。"
        "只输出一个 JSON 对象，禁止 Markdown。"
        "JSON 结构："
        '{"nodes":[{"stable_key":"英文小写+下划线唯一键","label":"中文简短实体名","kind":"person|organization|document|fact|claim|amount|other"}],'
        '"edges":[{"from_stable_key":"","to_stable_key":"","relation":"关系类型如 雇佣/证明/涉及/主张","label":"可选说明"}]}。'
        "要求：stable_key 在同一输出内唯一；用人单位、劳动者、证据文书、争议事实、金额诉求应分别建结点；"
        "材料中明确出现的主体与文书必须覆盖；关系边要可理解。若正文过少，可仅输出与标题相关的结点。"
    )

    client = OpenAI(api_key=api_key, base_url=base_url)
    kwargs: dict = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user_blob},
        ],
    }
    if enable_enhancement:
        kwargs["extra_body"] = {"enable_enhancement": True}

    try:
        completion = client.chat.completions.create(**kwargs)
        raw_reply = (completion.choices[0].message.content or "").strip()
        data = extract_json_object(raw_reply)
    except Exception:
        return _heuristic_graph(material_title, material_body)

    nodes = data.get("nodes") or []
    edges = data.get("edges") or []
    if not isinstance(nodes, list):
        nodes = []
    if not isinstance(edges, list):
        edges = []

    # 规范化并保证 stable_key 唯一
    seen: set[str] = set()
    out_nodes: list[dict[str, Any]] = []
    for i, n in enumerate(nodes):
        if not isinstance(n, dict):
            continue
        sk = str(n.get("stable_key") or "").strip() or f"node_{i}_{uuid.uuid4().hex[:8]}"
        sk = _slug_key(sk)
        base = sk
        j = 0
        while sk in seen:
            j += 1
            sk = f"{base}_{j}"
        seen.add(sk)
        label = str(n.get("label") or "").strip() or "未命名"
        kind = str(n.get("kind") or "other").strip() or "other"
        out_nodes.append({"stable_key": sk, "label": label, "kind": kind})

    keys_ok = {n["stable_key"] for n in out_nodes}
    out_edges: list[dict[str, Any]] = []
    for e in edges:
        if not isinstance(e, dict):
            continue
        a = str(e.get("from_stable_key") or "").strip()
        b = str(e.get("to_stable_key") or "").strip()
        if a not in keys_ok or b not in keys_ok:
            continue
        out_edges.append(
            {
                "from_stable_key": a,
                "to_stable_key": b,
                "relation": str(e.get("relation") or "关联").strip() or "关联",
                "label": str(e.get("label") or "").strip() or None,
            }
        )

    return {"nodes": out_nodes, "edges": out_edges}


def _heuristic_graph(title: str, body: str) -> dict[str, Any]:
    """无 API Key 或解析失败时的最小图。"""
    t = (title or "").strip() or "材料"
    b = (body or "")[:2000]
    n1 = _slug_key(t)[:48] or "doc"
    nodes = [
        {"stable_key": n1, "label": t[:80], "kind": "document"},
    ]
    edges: list[dict[str, Any]] = []
    if "公司" in b or "单位" in b:
        n2 = "org_mentioned"
        nodes.append({"stable_key": n2, "label": "用人单位（文中提及）", "kind": "organization"})
        edges.append(
            {
                "from_stable_key": n1,
                "to_stable_key": n2,
                "relation": "涉及",
                "label": None,
            }
        )
    return {"nodes": nodes, "edges": edges}
