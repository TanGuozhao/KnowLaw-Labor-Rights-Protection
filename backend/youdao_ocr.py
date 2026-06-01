"""
有道智云 OCR API（与 案例/app/.../YoudaoOcrApiService.java 一致）
https://openapi.youdao.com/ocrapi — application/x-www-form-urlencoded，signType=v3
"""

from __future__ import annotations

import hashlib
import json
import time
import uuid
from pathlib import Path
from typing import Any

import requests

from config_cache import load_json_config

API_URL = "https://openapi.youdao.com/ocrapi"
DETECT_TYPE_LINE = "10012"
IMAGE_TYPE_BASE64 = "1"
SIGN_TYPE_V3 = "v3"
DOC_TYPE_JSON = "json"

_CONFIG_PATH = Path(__file__).resolve().parent / "config" / "youdao_ocr_config.json"


def _build_input(img_base64: str) -> str:
    n = len(img_base64)
    if n <= 20:
        return img_base64
    return img_base64[:10] + str(n) + img_base64[-10:]


def _sha256_hex(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def _load_keys() -> tuple[str, str]:
    try:
        cfg = load_json_config(_CONFIG_PATH)
    except FileNotFoundError:
        return "", ""
    key = str(cfg.get("app_key") or cfg.get("appKey") or "").strip()
    secret = str(cfg.get("app_secret") or cfg.get("appSecret") or "").strip()
    return key, secret


def extract_plain_text(result: dict[str, Any] | None) -> str:
    """从 Result JSON 提取纯文本（与 Java extractPlainText 一致）。"""
    if not result or not isinstance(result, dict):
        return ""
    regions = result.get("regions")
    if not isinstance(regions, list):
        return ""
    lines_out: list[str] = []
    for region in regions:
        if not isinstance(region, dict):
            continue
        lines = region.get("lines")
        if not isinstance(lines, list):
            continue
        for line in lines:
            if not isinstance(line, dict):
                continue
            if "text" in line:
                t = line.get("text")
                if t is not None and str(t).strip():
                    lines_out.append(str(t).strip())
            elif "words" in line:
                words = line.get("words")
                if not isinstance(words, list):
                    continue
                parts: list[str] = []
                for w in words:
                    if isinstance(w, dict) and "word" in w:
                        parts.append(str(w.get("word") or ""))
                merged = "".join(parts).strip()
                if merged:
                    lines_out.append(merged)
    return "\n".join(lines_out)


def recognize_base64(img_base64: str, lang_type: str = "zh-CHS") -> tuple[str, dict[str, Any]]:
    """
    调用有道 OCR，返回 (纯文本, 原始 Result 对象)。
    """
    img_base64 = (img_base64 or "").strip()
    if not img_base64:
        raise ValueError("图片不能为空")
    lang_type = (lang_type or "").strip() or "zh-CHS"

    app_key, app_secret = _load_keys()
    if not app_key or not app_secret:
        raise RuntimeError(
            "未配置有道 OCR。请在 backend/config/youdao_ocr_config.json 中设置 app_key、app_secret"
        )

    salt = str(uuid.uuid4())
    curtime = str(int(time.time()))
    input_s = _build_input(img_base64)
    sign = _sha256_hex(app_key + input_s + salt + curtime + app_secret)

    data = {
        "img": img_base64,
        "langType": lang_type,
        "detectType": DETECT_TYPE_LINE,
        "imageType": IMAGE_TYPE_BASE64,
        "appKey": app_key,
        "salt": salt,
        "sign": sign,
        "docType": DOC_TYPE_JSON,
        "signType": SIGN_TYPE_V3,
        "curtime": curtime,
    }

    r = requests.post(
        API_URL,
        data=data,
        headers={
            "Accept": "application/json",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        timeout=90,
    )
    raw = r.text
    if not r.ok:
        raise RuntimeError(f"OCR 请求失败 (HTTP {r.status_code})")

    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as e:
        raise RuntimeError("OCR 返回非 JSON") from e

    err = payload.get("errorCode")
    if err is None:
        raise RuntimeError("OCR 返回缺少 errorCode")
    if str(err) != "0":
        raise RuntimeError(f"OCR 识别失败 (errorCode={err})")

    result = payload.get("Result")
    if not isinstance(result, dict):
        raise RuntimeError("OCR 成功但缺少 Result")

    text = extract_plain_text(result)
    return text, result
