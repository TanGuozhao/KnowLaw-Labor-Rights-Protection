"""证据类型推断与材料完善度（劳动维权常见维度）。"""

from __future__ import annotations

import uuid
from pathlib import Path
from typing import Any, Callable

# (展示标签, 是否已覆盖: evidence_type / ocr_text)
_COMPLETENESS_RULES: list[tuple[str, Callable[[str, str], bool]]] = [
    ("劳动关系或用工证明", lambda t, o: "劳动合同" in t or "劳动关系" in (o + t)),
    ("工资报酬", lambda t, o: "工资" in t or "薪资" in o or "月薪" in o),
    ("解除或离职相关", lambda t, o: "解除" in (o + t) or "辞退" in o or "离职" in o),
    ("考勤或加班", lambda t, o: "考勤" in (o + t) or "加班" in o),
]


def infer_evidence_type(ocr_text: str) -> str:
    """由 OCR 粗分类证据类型（可后续接模型）。"""
    t = ocr_text or ""
    # 主体资格证据
    if "身份证" in t:
        return "申请人身份证复印件"
    if "营业执照" in t or "工商注册" in t or "注册号" in t:
        return "公司工商注册信息"
    if "组织机构代码" in t or "组织机构代码证" in t or "机构代码" in t:
        return "组织机构代码证"

    # 劳动关系存续与履行证据
    if "劳动合同" in t or ("合同" in t and "劳动" in t):
        return "劳动合同"
    # 实习/见习类协议（与用人单位建立用工关系的书面材料，归入劳动合同类便于材料归类）
    if "实习合同" in t or "实习协议" in t or "见习协议" in t or "见习合同" in t:
        return "劳动合同"
    if "录用通知" in t or "录用通知书" in t:
        return "录用通知书"
    if "入职登记" in t:
        return "入职登记表"
    if "社保" in t or "社保证明" in t:
        return "社保证明"
    if "个人所得税" in t or ("所得税" in t and "个人" in t):
        return "个人所得税缴纳记录"
    if "工资流水" in t or ("工资" in t and ("流水" in t or "发放" in t or "实发" in t)):
        return "工资流水"
    if "考勤" in t or "打卡" in t:
        return "考勤打卡记录"
    if "员工身份" in t or "员工" in t and "工牌" in t:
        return "员工身份文件"

    # 争议事实与主张依据证据
    if "解除劳动合同" in t or ("解除" in t and ("劳动合同" in t or "终止" in t or "终止合同" in t)):
        return "解除劳动合同通知书"
    if "补发" in t or ("限期" in t and "工资" in t) or "拖欠" in t:
        return "限期补发克扣（拖欠）工资通知书"
    if "聊天记录" in t or "对话" in t and "聊天" in t:
        return "聊天记录"
    if "录音" in t or "录像" in t or "视频" in t:
        return "录音录像"
    if "照片" in t or "图片" in t:
        return "照片"
    if "电子记录" in t or "邮件" in t:
        return "电子记录"

    # 工伤专项证据
    if "工伤认定" in t:
        return "工伤认定决定书"
    if "劳动能力鉴定" in t or "劳动能力鉴定结论" in t:
        return "劳动能力鉴定结论通知书"
    if "医疗证明" in t or "门诊" in t or "住院" in t:
        return "医疗证明"

    return "其他证据图片"


def compute_material_completeness(
    evidence_items: list[dict[str, Any]],
) -> dict[str, Any]:
    """
    根据已有证据的识别的类型与 OCR 文本，估算材料覆盖度。
    evidence_items: 每项含 evidence_type、ocr_text（可为空）
    """
    matched: set[str] = set()
    for label, pred in _COMPLETENESS_RULES:
        for it in evidence_items:
            t = str(it.get("evidence_type") or "")
            o = str(it.get("ocr_text") or "")
            if pred(t, o):
                matched.add(label)
                break
    total = len(_COMPLETENESS_RULES)
    score = int(round(100 * len(matched) / total)) if total else 0
    missing = [lbl for lbl, _ in _COMPLETENESS_RULES if lbl not in matched]
    return {"score": score, "covered": list(matched), "missing": missing}


def save_evidence_bytes(
    upload_root: Any,
    user_id: int,
    evidence_id: str,
    original_filename: str,
    raw: bytes,
) -> str:
    """
    写入 uploads/evidence/{user_id}/{evidence_id}_{token}{ext}，返回相对路径（存 DB）。
    使用唯一文件名避免同一证据多次上传时覆盖旧文件。
    """
    suffix = Path(original_filename or "").suffix.lower()
    allowed_suffixes = {
        ".jpg",
        ".jpeg",
        ".png",
        ".webp",
        ".gif",
        ".bmp",
        ".pdf",
        ".doc",
        ".docx",
        ".xls",
        ".xlsx",
        ".txt",
    }
    if suffix not in allowed_suffixes:
        suffix = ".bin"
    user_dir = Path(upload_root) / str(user_id)
    user_dir.mkdir(parents=True, exist_ok=True)
    token = uuid.uuid4().hex[:12]
    filename = f"{evidence_id}_{token}{suffix}"
    path = user_dir / filename
    path.write_bytes(raw)
    return f"evidence/{user_id}/{filename}"


def archive_superseded_file_for_revision(
    backend_root: Any,
    upload_root: Any,
    user_id: int,
    old_rel_path: str,
    new_original_filename: str,
    revision_id: str,
) -> str:
    """
    在替换证据文件前，将旧文件登记到历史版本。
    若新旧扩展名相同：复制旧文件到 _rev_{revision_id}{ext}，避免被覆盖丢失。
    若扩展名不同：保留旧路径不变（新文件写入另一扩展名路径）。
    返回应写入 evidence_revisions.superseded_file_path 的相对路径。
    """
    from evidence_common import resolve_file_abs_path

    br = Path(backend_root)
    abs_old = resolve_file_abs_path(br, old_rel_path)
    if not abs_old.is_file():
        raise FileNotFoundError("旧附件不存在，无法归档")

    old_suffix = (abs_old.suffix or "").lower()
    new_suffix = Path(new_original_filename or "").suffix.lower()
    allowed_suffixes = {
        ".jpg",
        ".jpeg",
        ".png",
        ".webp",
        ".gif",
        ".bmp",
        ".pdf",
        ".doc",
        ".docx",
        ".xls",
        ".xlsx",
        ".txt",
    }
    if new_suffix not in allowed_suffixes:
        new_suffix = ".bin"
    if old_suffix not in allowed_suffixes:
        old_suffix = abs_old.suffix.lower() or ".bin"

    uid_str = str(user_id)
    user_dir = Path(upload_root) / uid_str
    user_dir.mkdir(parents=True, exist_ok=True)

    if old_suffix == new_suffix:
        arch_rel = f"evidence/{uid_str}/_rev_{revision_id}{old_suffix}"
        dest = resolve_file_abs_path(br, arch_rel)
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(abs_old.read_bytes())
        return arch_rel
    return old_rel_path
