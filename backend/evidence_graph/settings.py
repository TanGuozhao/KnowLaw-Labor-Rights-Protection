"""证据关系网专用大模型配置（与 chat / 证据文件解析独立）。"""

from __future__ import annotations

from pathlib import Path

from config_cache import load_json_config

BACKEND_ROOT = Path(__file__).resolve().parent.parent
GRAPH_LLM_CONFIG = BACKEND_ROOT / "config" / "evidence_graph_llm_config.json"
FALLBACK_LLM_CONFIG = BACKEND_ROOT / "config" / "llm_config.json"


def load_evidence_graph_llm_config() -> dict:
    cfg = dict(load_json_config(GRAPH_LLM_CONFIG))
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
