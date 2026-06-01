"""Multi-round checklist review orchestrator."""

from __future__ import annotations

from typing import Any

from contract_review.checklist_io import (
    flatten_checklist_rows,
    format_checklist_for_prompt,
    load_checklist_bundle,
    ordered_checklist_ids,
)
from contract_review.client import contract_review_chat
from contract_review.general_prompts import GENERAL_DOCUMENT_TYPE
from contract_review.general_support import build_general_document_summary_payload
from contract_review.json_extract import extract_json_object
from contract_review.llm_settings import load_contract_review_settings
from contract_review.prompts import (
    build_contract_review_system_message,
    build_followup_user_message,
    build_initial_user_message,
    normalize_perspective,
)

MAX_ROUNDS = 6
MAX_ASSISTANT_HISTORY_CHARS = 20000


def _normalize_status(raw: object) -> str:
    value = str(raw or "").strip().lower()
    if value in ("na", "n/a", "not-applicable", "not_applicable", "n_a"):
        return "not_applicable"
    if value in ("pass", "fail", "unclear"):
        return value
    return "unclear"


def _dedupe_risks(risks: list[dict]) -> list[dict]:
    seen: set[tuple[str, str, str]] = set()
    output: list[dict] = []
    for item in risks:
        if not isinstance(item, dict):
            continue
        key = (
            str(item.get("checklist_id") or "").strip(),
            str(item.get("title") or "").strip(),
            str(item.get("original_text") or "").strip()[:120],
        )
        if key in seen:
            continue
        seen.add(key)
        output.append(
            {
                "risk_id": str(item.get("risk_id") or "").strip(),
                "title": str(item.get("title") or "").strip(),
                "original_text": str(item.get("original_text") or "").strip(),
                "checklist_id": str(item.get("checklist_id") or "").strip(),
                "explanation": str(item.get("explanation") or "").strip(),
                "suggestion": str(item.get("suggestion") or "").strip(),
            }
        )
    return output


def _build_general_review_context(summary_payload: dict[str, Any]) -> str:
    if not summary_payload:
        return ""

    parts: list[str] = []
    overview = str(summary_payload.get("overview") or "").strip()
    if overview:
        parts.append(f"【文书摘要】\n{overview}")

    sections = summary_payload.get("sections")
    if isinstance(sections, list) and sections:
        section_lines: list[str] = []
        for item in sections[:5]:
            if not isinstance(item, dict):
                continue
            title = str(item.get("title") or "").strip()
            content = str(item.get("content") or "").strip()
            if not title and not content:
                continue
            section_lines.append(f"- {title or '未命名小节'}：{content or '无'}")
        if section_lines:
            parts.append("【摘要分解】\n" + "\n".join(section_lines))

    is_legal = summary_payload.get("is_legal_document")
    reason = str(summary_payload.get("legal_text_reason") or "").strip()
    if isinstance(is_legal, bool):
        parts.append(f"【法律文本判断】\n{'是' if is_legal else '否'}。{reason}")

    keywords = summary_payload.get("retrieval_keywords")
    if isinstance(keywords, list) and keywords:
        parts.append("【法条检索关键词】\n" + "、".join(str(x).strip() for x in keywords if str(x).strip()))

    law_context = str(summary_payload.get("law_context") or "").strip()
    retrieval_error = str(summary_payload.get("retrieval_error") or "").strip()
    if law_context:
        parts.append(f"【供参考的法规条文摘录】\n{law_context}")
    elif retrieval_error:
        parts.append(f"【法规检索结果】\n法规检索失败：{retrieval_error}")
    elif isinstance(is_legal, bool) and is_legal:
        parts.append("【法规检索结果】\n已尝试检索相关法条，但未获得可直接引用的法规摘录。请继续基于通用规则谨慎审查，不得编造法条原文。")

    summary_error = str(summary_payload.get("summary_error") or "").strip()
    if summary_error:
        parts.append(f"【摘要过程提示】\n摘要阶段存在回退：{summary_error}")

    return "\n\n".join(parts)


def _public_summary_payload(payload: dict[str, Any] | None) -> dict[str, Any] | None:
    if not payload:
        return None
    public = dict(payload)
    public.pop("law_context", None)
    public.pop("raw_summary_reply", None)
    return public


def run_contract_review_session(
    contract_text: str,
    stance: str = "劳动者（乙方）",
    document_type: str = "labor_contract",
    *,
    user_requirements: str = "",
) -> dict:
    cfg = load_contract_review_settings()
    max_chars = int(cfg.get("max_contract_chars") or cfg.get("max_input_chars") or 28000)

    bundle = load_checklist_bundle(document_type)
    rows = flatten_checklist_rows(bundle)
    required_list = ordered_checklist_ids(rows)
    required_set = set(required_list)
    row_meta = {row["id"]: row for row in rows}
    required_csv = ", ".join(required_list)
    id_count = len(required_list)

    perspective_key = normalize_perspective(stance)
    checklist_block = format_checklist_for_prompt(rows, perspective_key, document_type)

    text = str(contract_text or "").strip()
    if not text:
        if str(document_type or "").strip() in ("civil_complaint", GENERAL_DOCUMENT_TYPE):
            raise ValueError("文书正文不能为空")
        raise ValueError("合同正文不能为空")
    if len(text) > max_chars:
        text = text[:max_chars] + "\n\n…（正文过长，已截断；可在 contract_review_llm.json 中调整 max_contract_chars）"

    summary_payload: dict[str, Any] | None = None
    extra_context = ""
    if str(document_type or "").strip() == GENERAL_DOCUMENT_TYPE:
        try:
            summary_payload = build_general_document_summary_payload(
                text,
                stance=stance,
                perspective_key=perspective_key,
                user_requirements=user_requirements,
            )
        except Exception as exc:  # noqa: BLE001
            summary_payload = {
                "overview": "通用审查的摘要/检索阶段失败，已退回到规则审查模式。",
                "sections": [],
                "perspective": perspective_key,
                "document_type": GENERAL_DOCUMENT_TYPE,
                "is_legal_document": False,
                "legal_text_reason": f"摘要或检索失败：{exc}",
                "retrieval_keywords": [],
                "citations": [],
                "citation_refs": [],
                "retrieved_law_count": 0,
                "retrieval_error": str(exc),
                "summary_error": str(exc),
                "law_context": "",
            }
        extra_context = _build_general_review_context(summary_payload)

    messages: list[dict[str, str]] = [
        {
            "role": "system",
            "content": build_contract_review_system_message(perspective_key, document_type),
        },
        {
            "role": "user",
            "content": build_initial_user_message(
                text,
                stance,
                checklist_block,
                required_csv,
                id_count,
                perspective_key,
                document_type,
                extra_context=extra_context,
                user_requirements=user_requirements,
            ),
        },
    ]

    merged_coverage: dict[str, dict[str, Any]] = {}
    merged_risks: list[dict] = []
    last_raw = ""
    rounds = 0

    for round_idx in range(1, MAX_ROUNDS + 1):
        rounds = round_idx
        last_raw = contract_review_chat(messages)
        data = extract_json_object(last_raw)

        for item in data.get("coverage") or []:
            if not isinstance(item, dict):
                continue
            checklist_id = str(item.get("checklist_id") or "").strip()
            if checklist_id not in required_set:
                continue
            merged_coverage[checklist_id] = {
                "checklist_id": checklist_id,
                "status": _normalize_status(item.get("status")),
                "note": str(item.get("note") or "").strip(),
            }

        for risk in data.get("risks") or []:
            if isinstance(risk, dict):
                merged_risks.append(risk)

        missing = [item for item in required_list if item not in merged_coverage]
        if not missing:
            break

        messages.append({"role": "assistant", "content": last_raw[:MAX_ASSISTANT_HISTORY_CHARS]})
        messages.append(
            {
                "role": "user",
                "content": build_followup_user_message(
                    missing,
                    required_csv,
                    perspective_key,
                    document_type,
                    user_requirements=user_requirements,
                ),
            }
        )

    coverage_ordered: list[dict[str, Any]] = []
    for checklist_id in required_list:
        if checklist_id not in merged_coverage:
            continue
        row = dict(merged_coverage[checklist_id])
        meta = row_meta.get(checklist_id, {})
        row["checklist_text"] = meta.get("text", "")
        row["section"] = meta.get("section", "")
        coverage_ordered.append(row)

    missing_final = [item for item in required_list if item not in merged_coverage]

    result = {
        "complete": len(missing_final) == 0,
        "rounds": rounds,
        "missing_ids": missing_final,
        "coverage": coverage_ordered,
        "risks": _dedupe_risks(merged_risks),
        "checklist_version": bundle.get("version", 1),
        "checklist_id_count": id_count,
        "coverage_count": len(coverage_ordered),
        "perspective": perspective_key,
        "document_type": str(document_type or "").strip() or "labor_contract",
        "user_requirements": str(user_requirements or "").strip(),
    }
    public_summary = _public_summary_payload(summary_payload)
    if public_summary:
        result["summary_payload"] = public_summary
    return result
