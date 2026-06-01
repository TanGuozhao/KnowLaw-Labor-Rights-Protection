from pathlib import Path
from typing import Any

import requests

from config_cache import load_json_config


CONFIG_PATH = Path(__file__).resolve().parent / "config" / "deli_config.json"


def load_deli_config() -> dict:
    try:
        return load_json_config(CONFIG_PATH)
    except FileNotFoundError as exc:
        raise FileNotFoundError(f"Deli config not found: {CONFIG_PATH}") from exc


def _auth_headers(config: dict) -> dict:
    appid = str(config.get("appid", "")).strip()
    secret = str(config.get("secret", "")).strip()
    if not appid or appid == "REPLACE_WITH_DELI_APPID":
        raise ValueError("请先在 backend/config/deli_config.json 中填写有效的 appid")
    if not secret or secret == "REPLACE_WITH_DELI_SECRET":
        raise ValueError("请先在 backend/config/deli_config.json 中填写有效的 secret")
    return {"appid": appid, "secret": secret}


def search_cases(keyword_arr: list[str]) -> Any:
    config = load_deli_config()
    base_url = str(config.get("base_url", "https://openapi.delilegal.com")).rstrip("/")
    path = str(config.get("case_search_path", "/api/qa/v3/search/queryListCase"))

    body = {
        "pageNo": int(config.get("pageNo", 1)),
        "pageSize": int(config.get("pageSize", 1000)),
        "sortField": str(config.get("sortField", "correlation")),
        "sortOrder": str(config.get("sortOrder", "desc")),
        "condition": {"keywordArr": keyword_arr},
    }

    resp = requests.post(
        f"{base_url}{path}",
        headers=_auth_headers(config),
        json=body,
        timeout=30,
    )
    data = resp.json() if resp.content else {}
    if resp.status_code >= 400:
        raise RuntimeError(f"得理案例检索失败: HTTP {resp.status_code} {data}")
    return data


def search_laws(keyword_arr: list[str]) -> Any:
    config = load_deli_config()
    base_url = str(config.get("base_url", "https://openapi.delilegal.com")).rstrip("/")
    path = str(config.get("law_search_path", "/api/qa/v3/search/queryListLaw"))
    field_name = str(config.get("law_field_name", "semantic") or "semantic").strip() or "semantic"

    body = {
        "pageNo": int(config.get("pageNo", 1)),
        "pageSize": int(config.get("pageSize", 1000)),
        "sortField": str(config.get("sortField", "correlation")),
        "sortOrder": str(config.get("sortOrder", "desc")),
        "condition": {
            "keywords": keyword_arr,
            "keywordArr": keyword_arr,
            "fieldName": field_name,
        },
    }

    resp = requests.post(
        f"{base_url}{path}",
        headers=_auth_headers(config),
        json=body,
        timeout=30,
    )
    data = resp.json() if resp.content else {}
    if resp.status_code >= 400:
        raise RuntimeError(f"得理法规检索失败: HTTP {resp.status_code} {data}")
    return data


def get_law_info(law_id: str, merge: bool = True) -> Any:
    config = load_deli_config()
    base_url = str(config.get("base_url", "https://openapi.delilegal.com")).rstrip("/")
    path = str(config.get("law_info_path", "/api/qa/v3/search/lawInfo"))

    params = {
        "lawId": str(law_id or "").strip(),
        "merge": "true" if merge else "false",
    }

    resp = requests.get(
        f"{base_url}{path}",
        headers=_auth_headers(config),
        params=params,
        timeout=30,
    )
    data = resp.json() if resp.content else {}
    if resp.status_code >= 400:
        raise RuntimeError(f"得理法规详情查询失败: HTTP {resp.status_code} {data}")
    return data

