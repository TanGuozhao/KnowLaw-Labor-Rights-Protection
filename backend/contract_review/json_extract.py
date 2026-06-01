"""从大模型回复中解析 JSON 对象。"""

from __future__ import annotations

import json
import re


def extract_json_object(text: str) -> dict:
    raw = (text or "").strip()
    if not raw:
        raise ValueError("模型返回为空")

    m = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", raw, re.IGNORECASE)
    if m:
        raw = m.group(1).strip()

    start = raw.find("{")
    if start < 0:
        raise ValueError("未找到 JSON 对象起始")

    depth = 0
    for i, ch in enumerate(raw[start:], start=start):
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                try:
                    return json.loads(raw[start : i + 1])
                except json.JSONDecodeError as exc:
                    raise ValueError(f"JSON 解析失败: {exc}") from exc

    raise ValueError("JSON 大括号未闭合")
