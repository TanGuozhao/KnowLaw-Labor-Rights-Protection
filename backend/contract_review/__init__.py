"""
合同审查模块：大模型配置合并、客户端与工作流占位。

- 密钥与网关默认与 `backend/config/llm_config.json`（法律咨询）一致；
- 审查专属参数见 `backend/config/contract_review_llm.json`。
"""

from contract_review.client import contract_review_chat
from contract_review.llm_settings import load_contract_review_settings
from contract_review.prompts import normalize_perspective
from contract_review.review_orchestrator import run_contract_review_session
from contract_review.summary_runner import run_contract_summary_session
from contract_review.workflow import (
    ContractReviewWorkflow,
    build_review_messages,
    run_contract_review_preview,
)

__all__ = [
    "ContractReviewWorkflow",
    "build_review_messages",
    "contract_review_chat",
    "load_contract_review_settings",
    "normalize_perspective",
    "run_contract_review_preview",
    "run_contract_review_session",
    "run_contract_summary_session",
]
