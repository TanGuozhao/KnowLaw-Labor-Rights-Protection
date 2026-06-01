from __future__ import annotations

import re
from typing import Any

from contract_review.client import contract_review_chat
from contract_review.general_prompts import (
    GENERAL_DOCUMENT_TYPE,
    build_general_summary_system_message,
    build_general_summary_user_message,
)
from contract_review.json_extract import extract_json_object
from retrieval_service import RETRIEVAL_LAW, build_law_citations_and_context, search_by_intent


_LEGAL_HINTS = (
    "合同",
    "协议",
    "条款",
    "甲方",
    "乙方",
    "原告",
    "被告",
    "仲裁",
    "起诉",
    "诉讼",
    "赔偿",
    "违约",
    "责任",
    "义务",
    "授权",
    "保密",
    "知识产权",
    "争议解决",
    "管辖",
    "签字",
    "盖章",
    "生效",
    "解除",
)

_GENERIC_KEYWORD_STOPWORDS = frozenset(
    {
        "文书",
        "法律文本",
        "主要风险",
        "关键事实",
        "核心内容",
        "信息不足",
        "未见明确表述",
        "通用法务审查",
    }
)


def _dedupe_keep_order(items: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for raw in items:
        text = str(raw or "").strip()
        if not text or text in seen:
            continue
        seen.add(text)
        out.append(text)
    return out


def _clean_sections(items: Any) -> list[dict[str, str]]:
    sections: list[dict[str, str]] = []
    if not isinstance(items, list):
        return sections
    for item in items:
        if not isinstance(item, dict):
            continue
        title = str(item.get("title") or "").strip()
        content = str(item.get("content") or "").strip()
        if not title and not content:
            continue
        sections.append(
            {
                "title": title or "（未命名小节）",
                "content": content or "（无）",
            }
        )
    return sections


def _normalize_retrieval_keywords(items: Any) -> list[str]:
    if not isinstance(items, list):
        return []
    out: list[str] = []
    for raw in items:
        text = str(raw or "").strip()
        if len(text) < 2 or len(text) > 24:
            continue
        if text in _GENERIC_KEYWORD_STOPWORDS:
            continue
        out.append(text)
    return _dedupe_keep_order(out)[:8]


def _heuristic_is_legal_document(text: str) -> tuple[bool, str]:
    raw = str(text or "").strip()
    if not raw:
        return False, "文书正文为空，无法识别。"
    score = sum(1 for hint in _LEGAL_HINTS if hint in raw)
    has_article = bool(re.search(r"第[\d一二三四五六七八九十百千零]+条", raw))
    has_party = "甲方" in raw and "乙方" in raw
    has_litigation = "原告" in raw and "被告" in raw
    is_legal = score >= 3 or has_article or has_party or has_litigation
    if is_legal:
        return True, "文书中包含明显的法律关系、权利义务、责任承担或争议处理表述。"
    return False, "全文更接近普通说明、业务材料或非规范性文本，未见足够强的法律约束结构。"


def _fallback_keywords_from_summary(overview: str, sections: list[dict[str, str]], raw_text: str) -> list[str]:
    candidates: list[str] = []
    chunks = [overview]
    chunks.extend(f"{item.get('title', '')} {item.get('content', '')}" for item in sections[:4])
    chunks.append(str(raw_text or "")[:240])
    for chunk in chunks:
        for part in re.split(r"[，。；：、\n,.()（）【】\[\] ]+", str(chunk or "")):
            text = part.strip()
            if len(text) < 2 or len(text) > 18:
                continue
            if text in _GENERIC_KEYWORD_STOPWORDS:
                continue
            candidates.append(text)
    return _dedupe_keep_order(candidates)[:6]


def _safe_excerpt(text: str, limit: int = 180) -> str:
    raw = str(text or "").strip().replace("\n", " ")
    if len(raw) <= limit:
        return raw
    return f"{raw[:limit].rstrip()}…"


def build_general_document_summary_payload(
    document_text: str,
    *,
    stance: str,
    perspective_key: str,
    user_requirements: str = "",
) -> dict[str, Any]:
    text = str(document_text or "").strip()
    raw_reply = ""
    summary_error = ""

    try:
        requirement_block = (
            f"\n\n【本次审查需额外关注的用户临时要求】\n{str(user_requirements or '').strip()}"
            if str(user_requirements or "").strip()
            else ""
        )
        raw_reply = contract_review_chat(
            [
                {"role": "system", "content": build_general_summary_system_message(perspective_key)},
                {
                    "role": "user",
                    "content": build_general_summary_user_message(
                        f"{text}{requirement_block}",
                        stance,
                        perspective_key,
                    ),
                },
            ]
        )
        data = extract_json_object(raw_reply)
    except Exception as exc:  # noqa: BLE001
        summary_error = str(exc)
        data = {}

    overview = str(data.get("overview") or "").strip()
    sections = _clean_sections(data.get("sections"))

    raw_is_legal = data.get("is_legal_document")
    reason = str(data.get("legal_text_reason") or "").strip()
    if isinstance(raw_is_legal, bool):
        is_legal_document = raw_is_legal
    else:
        is_legal_document, heuristic_reason = _heuristic_is_legal_document(text)
        if not reason:
            reason = heuristic_reason

    if not overview:
        overview = _safe_excerpt(text, limit=220) or "模型未能返回摘要，已回退为原文摘录。"
    if not sections:
        sections = [
            {
                "title": "内容摘录",
                "content": _safe_excerpt(text, limit=260) or "未提取到稳定摘要。",
            }
        ]

    retrieval_keywords = _normalize_retrieval_keywords(data.get("retrieval_keywords"))
    if is_legal_document and not retrieval_keywords:
        retrieval_keywords = _fallback_keywords_from_summary(overview, sections, text)
    if not is_legal_document:
        retrieval_keywords = []

    citations: list[str] = []
    citation_refs: list[dict[str, Any]] = []
    law_context = ""
    retrieval_error = ""
    retrieved_law_count = 0

    if is_legal_document and retrieval_keywords:
        try:
            retrieval_query = "；".join(retrieval_keywords)
            retrieval = search_by_intent(retrieval_query, RETRIEVAL_LAW, rewrite=False)
            laws = retrieval.get("laws") if isinstance(retrieval.get("laws"), list) else []
            retrieved_law_count = len(laws)
            citations, law_context, citation_refs = build_law_citations_and_context(
                laws,
                max_articles=8,
                max_chars_per_article=1200,
            )
        except Exception as exc:  # noqa: BLE001
            retrieval_error = str(exc)

    if summary_error and not reason:
        reason = f"摘要模型解析失败，已按规则回退判断：{summary_error}"

    return {
        "overview": overview,
        "sections": sections,
        "perspective": perspective_key,
        "document_type": GENERAL_DOCUMENT_TYPE,
        "is_legal_document": bool(is_legal_document),
        "legal_text_reason": reason,
        "retrieval_keywords": retrieval_keywords,
        "citations": citations,
        "citation_refs": citation_refs,
        "retrieved_law_count": retrieved_law_count,
        "retrieval_error": retrieval_error,
        "summary_error": summary_error,
        "law_context": law_context,
        "raw_summary_reply": raw_reply,
    }
