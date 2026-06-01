"""
合同审查工作流骨架。

后续可在此串联：文本规范化 → 规则/清单检查 → 多轮 LLM → 结构化风险 JSON 等。
当前提供单轮预览入口，便于联调大模型配置。
"""

from __future__ import annotations

from contract_review.client import contract_review_chat
from contract_review.llm_settings import load_contract_review_settings

DEFAULT_SYSTEM_FALLBACK = (
    "你是专注劳动法律实务的律师助理，负责劳动合同审查。"
    "请使用简体中文，分条列出风险点与修改建议，表述简洁专业。"
)


def build_review_messages(
    contract_plain_text: str,
    *,
    contract_type: str = "劳动合同",
    stance: str = "劳动者（乙方）",
    max_input_chars: int | None = None,
) -> list[dict[str, str]]:
    cfg = load_contract_review_settings()
    limit = max_input_chars
    if limit is None:
        raw = cfg.get("max_input_chars")
        limit = int(raw) if raw is not None else 24000
    limit = max(1000, min(int(limit), 200000))
    body = (contract_plain_text or "").strip()
    if len(body) > limit:
        body = body[:limit] + "\n\n…（正文过长，已截断；工作流后续可做分段审查）"

    system = str(cfg.get("system_prompt") or "").strip() or DEFAULT_SYSTEM_FALLBACK
    user = (
        f"合同类型：{contract_type}\n"
        f"审查立场：{stance}\n\n"
        f"请审查以下合同正文，输出：1）总体评价 2）逐条风险（说明+建议）：\n\n{body}"
    )
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]


def run_contract_review_preview(
    contract_plain_text: str,
    *,
    contract_type: str = "劳动合同",
    stance: str = "劳动者（乙方）",
) -> dict:
    """
    占位：单次 LLM 审查，返回原始文本结果。
    后续可改为多步 workflow 并返回结构化字段（risks、clauses 等）。
    """
    messages = build_review_messages(
        contract_plain_text,
        contract_type=contract_type,
        stance=stance,
    )
    text = contract_review_chat(messages)
    return {
        "text": (text or "").strip(),
        "meta": {"contract_type": contract_type, "stance": stance},
    }


class ContractReviewWorkflow:
    """显式工作流类：预留步骤钩子，便于与任务队列或前端异步对接。"""

    def __init__(self) -> None:
        self._settings = load_contract_review_settings()

    @property
    def settings_snapshot(self) -> dict:
        """脱敏快照（便于健康检查），不包含 api_key。"""
        cfg = dict(self._settings)
        cfg.pop("api_key", None)
        return cfg

    def step_llm_review(
        self,
        contract_plain_text: str,
        *,
        contract_type: str = "劳动合同",
        stance: str = "劳动者（乙方）",
    ) -> dict:
        return run_contract_review_preview(
            contract_plain_text,
            contract_type=contract_type,
            stance=stance,
        )
