"""内容指纹：用于判断案件字段或证据是否需重新扫描构建图谱。"""

from __future__ import annotations

import hashlib
from typing import Any


def fingerprint_text(text: str | None) -> str:
    raw = (text or "").encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def fingerprint_evidence_row(row: dict[str, Any]) -> str:
    """证据名称、类型、OCR 摘要等变化时指纹变化。"""
    parts = [
        str(row.get("name") or ""),
        str(row.get("evidence_type") or ""),
        str(row.get("description") or ""),
        str(row.get("ocr_text") or "")[:80000],
        str(row.get("file_path") or ""),
        str(row.get("related_time") or ""),
    ]
    blob = "\n---\n".join(parts).encode("utf-8")
    return hashlib.sha256(blob).hexdigest()
