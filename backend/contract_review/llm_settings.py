"""合同审查用大模型配置：在 llm_config.json 基础上合并 contract_review_llm.json。"""

from __future__ import annotations

from pathlib import Path

from config_cache import load_json_config

BACKEND_ROOT = Path(__file__).resolve().parent.parent
LLM_CONFIG_PATH = BACKEND_ROOT / "config" / "llm_config.json"
CONTRACT_REVIEW_LLM_PATH = BACKEND_ROOT / "config" / "contract_review_llm.json"


def load_contract_review_settings() -> dict:
    """
    返回合并后的配置（含 api_key、base_url、model 等）。
    contract_review_llm.json 中的非空字段覆盖 llm_config.json；
    其中 model 为空字符串时表示不覆盖，仍用 llm_config 的 model。
    """
    base = load_json_config(LLM_CONFIG_PATH)
    try:
        extra = load_json_config(CONTRACT_REVIEW_LLM_PATH)
    except FileNotFoundError:
        extra = {}
    out = dict(base)
    skip_meta = {"_comment", "_description"}
    for key, value in extra.items():
        if key in skip_meta:
            continue
        if value is None:
            continue
        if isinstance(value, str) and value.strip() == "":
            continue
        out[key] = value
    return out
