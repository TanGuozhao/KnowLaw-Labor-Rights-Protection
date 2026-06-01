"""
Tencent Cloud OCR wrapper for GeneralAccurateOCR.

Docs:
- https://cloud.tencent.com/document/product/866/34937
- https://cloud.tencent.com/document/product/866/33527
"""

from __future__ import annotations

import datetime as dt
import hashlib
import hmac
import json
import logging
import time
from pathlib import Path
from typing import Any

import requests

from config_cache import load_json_config

logger = logging.getLogger(__name__)

HOST = "ocr.tencentcloudapi.com"
API_URL = f"https://{HOST}"
SERVICE = "ocr"
VERSION = "2018-11-19"
ACTION = "GeneralAccurateOCR"
ALGORITHM = "TC3-HMAC-SHA256"

_CONFIG_PATH = Path(__file__).resolve().parent / "config" / "tencent_ocr_config.json"


def _sha256_hex(raw: bytes | str) -> str:
    if isinstance(raw, str):
        raw = raw.encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def _sign(key: bytes, msg: str) -> bytes:
    return hmac.new(key, msg.encode("utf-8"), hashlib.sha256).digest()


def _load_config() -> tuple[str, str, str]:
    try:
        cfg = load_json_config(_CONFIG_PATH)
    except FileNotFoundError:
        return "", "", ""
    secret_id = str(cfg.get("secret_id") or cfg.get("secretId") or "").strip()
    secret_key = str(cfg.get("secret_key") or cfg.get("secretKey") or "").strip()
    region = str(cfg.get("region") or "").strip()
    # 通用印刷体识别需指定地域；留空时腾讯云常返回鉴权或参数错误
    if not region:
        region = "ap-guangzhou"
    return secret_id, secret_key, region


def _credentials_look_unconfigured(secret_id: str, secret_key: str) -> bool:
    """占位符或未填写时提示用户，避免用无效字符串调用腾讯云得到难懂错误。"""
    if not secret_id or not secret_key:
        return True
    blob = f"{secret_id}\n{secret_key}".upper()
    return "REPLACE" in blob or "YOUR_" in blob or "TODO" in blob


def _build_headers(payload: str, *, secret_id: str, secret_key: str, region: str) -> dict[str, str]:
    timestamp = int(time.time())
    date = dt.datetime.utcfromtimestamp(timestamp).strftime("%Y-%m-%d")

    headers_for_sign = {
        "content-type": "application/json; charset=utf-8",
        "host": HOST,
        "x-tc-action": ACTION.lower(),
    }
    if region:
        headers_for_sign["x-tc-region"] = region.lower()

    signed_headers = ";".join(sorted(headers_for_sign))
    canonical_headers = "".join(f"{k}:{headers_for_sign[k]}\n" for k in sorted(headers_for_sign))
    canonical_request = "\n".join(
        [
            "POST",
            "/",
            "",
            canonical_headers,
            signed_headers,
            _sha256_hex(payload),
        ]
    )
    credential_scope = f"{date}/{SERVICE}/tc3_request"
    string_to_sign = "\n".join(
        [
            ALGORITHM,
            str(timestamp),
            credential_scope,
            _sha256_hex(canonical_request),
        ]
    )

    secret_date = _sign(f"TC3{secret_key}".encode("utf-8"), date)
    secret_service = _sign(secret_date, SERVICE)
    secret_signing = _sign(secret_service, "tc3_request")
    signature = hmac.new(secret_signing, string_to_sign.encode("utf-8"), hashlib.sha256).hexdigest()

    authorization = (
        f"{ALGORITHM} "
        f"Credential={secret_id}/{credential_scope}, "
        f"SignedHeaders={signed_headers}, "
        f"Signature={signature}"
    )

    headers = {
        "Authorization": authorization,
        "Content-Type": "application/json; charset=utf-8",
        "Host": HOST,
        "X-TC-Action": ACTION,
        "X-TC-Timestamp": str(timestamp),
        "X-TC-Version": VERSION,
    }
    if region:
        headers["X-TC-Region"] = region
    return headers


def _bbox_from_polygon(polygon: list[dict[str, Any]] | None) -> dict[str, int] | None:
    if not isinstance(polygon, list) or not polygon:
        return None
    points = []
    for point in polygon:
        if not isinstance(point, dict):
            continue
        try:
            x = int(point.get("X"))
            y = int(point.get("Y"))
        except (TypeError, ValueError):
            continue
        points.append((x, y))
    if not points:
        return None
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    return {
        "left": min(xs),
        "top": min(ys),
        "width": max(xs) - min(xs),
        "height": max(ys) - min(ys),
    }


def extract_detections(result: dict[str, Any] | None) -> list[dict[str, Any]]:
    if not isinstance(result, dict):
        return []
    detections = result.get("TextDetections")
    if not isinstance(detections, list):
        return []

    rows: list[dict[str, Any]] = []
    for item in detections:
        if not isinstance(item, dict):
            continue
        text = str(item.get("DetectedText") or "").strip()
        polygon = item.get("Polygon")
        polygon_out = []
        if isinstance(polygon, list):
            for point in polygon:
                if not isinstance(point, dict):
                    continue
                try:
                    polygon_out.append(
                        {
                            "x": int(point.get("X")),
                            "y": int(point.get("Y")),
                        }
                    )
                except (TypeError, ValueError):
                    continue
        rows.append(
            {
                "text": text,
                "confidence": item.get("Confidence"),
                "polygon": polygon_out,
                "bbox": _bbox_from_polygon(polygon_out),
                "item_polygon": item.get("ItemPolygon") if isinstance(item.get("ItemPolygon"), dict) else None,
                "advanced_info": item.get("AdvancedInfo"),
            }
        )
    return rows


def extract_plain_text(result: dict[str, Any] | None) -> str:
    lines_out: list[str] = []
    for row in extract_detections(result):
        text = str(row.get("text") or "").strip()
        if text:
            lines_out.append(text)
    return "\n".join(lines_out)


def recognize_base64(img_base64: str, lang_type: str = "zh-CHS") -> tuple[str, dict[str, Any]]:
    """
    Call Tencent Cloud OCR and return (plain_text, raw_response["Response"]).

    `lang_type` is kept for compatibility with the previous provider signature.
    """
    del lang_type

    img_base64 = (img_base64 or "").strip()
    if not img_base64:
        raise ValueError("图片不能为空")

    secret_id, secret_key, region = _load_config()
    if not secret_id or not secret_key:
        raise RuntimeError(
            "未配置腾讯云 OCR。请在 backend/config/tencent_ocr_config.json 中设置 secret_id、secret_key"
        )
    if _credentials_look_unconfigured(secret_id, secret_key):
        raise RuntimeError(
            "腾讯云 OCR 未正确配置：请将 backend/config/tencent_ocr_config.json 中的 "
            "REPLACE_WITH_TENCENT_* 替换为控制台真实的 SecretId / SecretKey，并视情况设置 region（如 ap-guangzhou）。"
        )

    body = {
        "ImageBase64": img_base64,
    }
    payload = json.dumps(body, ensure_ascii=False, separators=(",", ":"))
    headers = _build_headers(
        payload,
        secret_id=secret_id,
        secret_key=secret_key,
        region=region,
    )

    resp = requests.post(API_URL, data=payload.encode("utf-8"), headers=headers, timeout=90)
    raw = resp.text
    if not resp.ok:
        snippet = (raw or "")[:400].replace("\n", " ")
        logger.warning("Tencent OCR HTTP %s: %s", resp.status_code, snippet)
        raise RuntimeError(
            f"腾讯云 OCR 请求失败 (HTTP {resp.status_code})"
            + (f"，响应片段：{snippet}" if snippet else "")
        )

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError("腾讯云 OCR 返回非 JSON") from exc

    result = data.get("Response")
    if not isinstance(result, dict):
        raise RuntimeError("腾讯云 OCR 返回缺少 Response")

    err = result.get("Error")
    if isinstance(err, dict):
        code = str(err.get("Code") or "").strip()
        message = str(err.get("Message") or "").strip()
        hint = f"{code}: {message}" if code or message else "未知错误"
        logger.warning("Tencent OCR API Error: %s", hint)
        raise RuntimeError(f"腾讯云 OCR 识别失败 ({hint})")

    text = extract_plain_text(result)
    return text, result
