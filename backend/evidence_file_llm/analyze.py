"""调用证据专用大模型，根据提取文本推断证据类型并填充结构化字段。"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from openai import OpenAI

from contract_review.json_extract import extract_json_object
from evidence_file_llm.settings import load_evidence_file_llm_config
from evidence_service import infer_evidence_type

EVIDENCE_TYPE_CHOICES = [
    "申请人身份证复印件",
    "公司工商注册信息",
    "组织机构代码证",
    "劳动合同",
    "录用通知书",
    "入职登记表",
    "社保证明",
    "工资流水",
    "个人所得税缴纳记录",
    "考勤打卡记录",
    "员工身份文件",
    "聊天记录",
    "录音录像",
    "照片",
    "电子记录",
    "解除劳动合同通知书",
    "限期补发克扣（拖欠）工资通知书",
    "工伤认定决定书",
    "劳动能力鉴定结论通知书",
    "医疗证明",
    "其他证据图片",
]


# 模型常输出但不在枚举内的表述 → 系统内标准类型
_TYPE_ALIASES: list[tuple[str, str]] = [
    ("实习合同", "劳动合同"),
    ("实习协议", "劳动合同"),
    ("见习协议", "劳动合同"),
    ("见习合同", "劳动合同"),
    ("劳务合同", "劳动合同"),
]


def _normalize_type(raw: str) -> str:
    t = (raw or "").strip()
    if t in EVIDENCE_TYPE_CHOICES:
        return t
    for alias, canonical in _TYPE_ALIASES:
        if alias in t:
            return canonical
    for opt in EVIDENCE_TYPE_CHOICES:
        if opt in t or t in opt:
            return opt
    return "其他证据图片"


def _refine_type_if_other(
    ev_type: str,
    *,
    name: str,
    description: str | None,
    extracted_text: str,
) -> str:
    """模型或归一化落到「其他」时，用语义与规则从标题/摘要/正文再判一次。"""
    if ev_type != "其他证据图片":
        return ev_type
    blob = "\n".join(
        x
        for x in (name, description or "", (extracted_text or "")[:16000])
        if x and str(x).strip()
    )
    inferred = infer_evidence_type(blob)
    if inferred != "其他证据图片":
        return inferred
    return ev_type


def _normalize_date(raw: str | None) -> str | None:
    if not raw:
        return None
    s = str(raw).strip()
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})$", s)
    if m:
        return s
    m2 = re.search(r"(\d{4})[年\-/](\d{1,2})[月\-/](\d{1,2})", s)
    if m2:
        y, mo, d = m2.group(1), int(m2.group(2)), int(m2.group(3))
        return f"{y}-{mo:02d}-{d:02d}"
    return None


def _fallback_from_text(filename: str, text: str) -> dict[str, Any]:
    base = Path(filename or "证据").stem
    name = (base[:120] if base else "未命名证据") or "未命名证据"
    ev_type = infer_evidence_type(f"{name}\n{text or ''}")
    return {
        "name": name,
        "evidence_type": ev_type,
        "description": (text or "")[:2000] if text else None,
        "source": "用户上传",
        "related_time": None,
        "note": "模型不可用，已按规则与文本粗分类，请核对后补充。",
    }


def analyze_evidence_document(
    *,
    original_filename: str,
    extracted_text: str,
) -> dict[str, Any]:
    """
    返回 name, evidence_type, description, source, related_time, note（均可能为 null）。
    """
    cfg = load_evidence_file_llm_config()
    api_key = str(cfg.get("api_key", "") or "").strip()
    base_url = str(cfg.get("base_url", "https://api.hunyuan.cloud.tencent.com/v1") or "").strip()
    model = str(cfg.get("model", "hunyuan-turbos-latest") or "").strip()
    enable_enhancement = bool(cfg.get("enable_enhancement", True))

    text = (extracted_text or "").strip()
    if not api_key:
        return _fallback_from_text(original_filename, text)

    types_line = "、".join(EVIDENCE_TYPE_CHOICES)
    user_blob = (
        f"文件名：{original_filename or '未命名'}\n\n"
        f"从文件中提取的正文（可能不完整）：\n{text[:24000]}"
    )

    system = (
        "你是劳动维权场景下的证据材料分析助手。根据给定文件名与正文，判断证据类别并提取关键信息。"
        "必须只输出一个 JSON 对象，不要 Markdown，不要解释。"
        "JSON 字段：name（证据简短标题，字符串），evidence_type（必须从下列选一："
        f"{types_line}"
        "），description（一句话摘要，可空），source（如微信聊天记录/银行 APP/邮箱，可空），"
        "related_time（YYYY-MM-DD 或 null），note（补充说明，可空）。"
        "分类规则：实习合同、实习协议、见习协议、劳务合同等确立用工关系的书面材料，evidence_type 一律选「劳动合同」；"
        "不要仅因扫描件或 PDF 就选「其他证据图片」。"
        "若正文为聊天截图 OCR，可概括对话主题；若为工资流水，可点明期间与金额线索。"
    )

    client = OpenAI(api_key=api_key, base_url=base_url)
    kwargs: dict = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user_blob},
        ],
    }
    if enable_enhancement:
        kwargs["extra_body"] = {"enable_enhancement": True}

    try:
        completion = client.chat.completions.create(**kwargs)
        raw_reply = (completion.choices[0].message.content or "").strip()
        data = extract_json_object(raw_reply)
    except Exception:
        return _fallback_from_text(original_filename, text)

    name = str(data.get("name") or "").strip() or None
    if not name:
        stem = Path(original_filename or "证据").stem
        name = stem[:120] if stem else "未命名证据"

    ev_type = _normalize_type(str(data.get("evidence_type") or ""))
    description = data.get("description")
    if description is not None:
        description = str(description).strip() or None
        if description and len(description) > 4000:
            description = description[:4000] + "…"

    source = data.get("source")
    if source is not None:
        source = str(source).strip() or None

    note = data.get("note")
    if note is not None:
        note = str(note).strip() or None

    related_time = _normalize_date(data.get("related_time"))

    ev_type = _refine_type_if_other(
        ev_type,
        name=name,
        description=description,
        extracted_text=text,
    )

    return {
        "name": name,
        "evidence_type": ev_type,
        "description": description,
        "source": source or "用户上传",
        "related_time": related_time,
        "note": note,
    }
