"""Summary runner for review documents."""

from __future__ import annotations

from contract_review.client import contract_review_chat
from contract_review.general_prompts import GENERAL_DOCUMENT_TYPE
from contract_review.general_support import build_general_document_summary_payload
from contract_review.json_extract import extract_json_object
from contract_review.llm_settings import load_contract_review_settings
from contract_review.prompts import normalize_perspective
from contract_review.summary_prompts import build_summary_system_message, build_summary_user_message


def run_contract_summary_session(
    contract_text: str,
    stance: str = "劳动者（乙方）",
    document_type: str = "labor_contract",
    *,
    user_requirements: str = "",
) -> dict:
    cfg = load_contract_review_settings()
    max_chars = int(cfg.get("max_contract_chars") or cfg.get("max_input_chars") or 28000)

    text = str(contract_text or "").strip()
    if not text:
        if str(document_type or "").strip() in ("civil_complaint", GENERAL_DOCUMENT_TYPE):
            raise ValueError("文书正文不能为空")
        raise ValueError("合同正文不能为空")
    if len(text) > max_chars:
        text = text[:max_chars] + "\n\n…（正文过长，已截断）"

    perspective_key = normalize_perspective(stance)
    if str(document_type or "").strip() == GENERAL_DOCUMENT_TYPE:
        payload = build_general_document_summary_payload(
            text,
            stance=stance,
            perspective_key=perspective_key,
            user_requirements=user_requirements,
        )
        payload.pop("law_context", None)
        payload.pop("raw_summary_reply", None)
        payload["user_requirements"] = str(user_requirements or "").strip()
        return payload

    messages = [
        {"role": "system", "content": build_summary_system_message(perspective_key, document_type)},
        {
            "role": "user",
            "content": build_summary_user_message(
                text,
                stance,
                perspective_key,
                document_type,
                user_requirements=user_requirements,
            ),
        },
    ]
    raw = contract_review_chat(messages)
    data = extract_json_object(raw)

    overview = str(data.get("overview") or "").strip()
    sections: list[dict] = []
    for item in data.get("sections") or []:
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

    return {
        "overview": overview,
        "sections": sections,
        "perspective": perspective_key,
        "document_type": str(document_type or "").strip() or "labor_contract",
        "user_requirements": str(user_requirements or "").strip(),
    }
