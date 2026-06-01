"""证据文件专用大模型配置：仅本模块读取，避免与 chat_service、contract_review 共用客户端逻辑。"""

from __future__ import annotations

from pathlib import Path

from config_cache import load_json_config

BACKEND_ROOT = Path(__file__).resolve().parent.parent
EVIDENCE_FILE_LLM_CONFIG = BACKEND_ROOT / "config" / "evidence_file_llm_config.json"
FALLBACK_LLM_CONFIG = BACKEND_ROOT / "config" / "llm_config.json"


def load_evidence_file_llm_config() -> dict:
    """
    读取 evidence_file_llm_config.json。
    若 api_key 未填或为占位符，则从 llm_config.json 仅继承 api_key（便于本地一套密钥），
    其余参数仍以证据专用配置为准。
    """
    cfg = dict(load_json_config(EVIDENCE_FILE_LLM_CONFIG))
    key = str(cfg.get("api_key", "") or "").strip()
    placeholders = {"", "REPLACE_WITH_HUNYUAN_API_KEY", "REPLACE_WITH_API_KEY"}
    if key in placeholders:
        try:
            base = load_json_config(FALLBACK_LLM_CONFIG)
            bk = str(base.get("api_key", "") or "").strip()
            if bk:
                cfg["api_key"] = bk
        except FileNotFoundError:
            pass
    return cfg
