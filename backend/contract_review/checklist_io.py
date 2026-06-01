"""Load review checklists shared by the backend contract-review pipeline."""

from __future__ import annotations

from pathlib import Path

from config_cache import load_json_config

_LABELHELP_ROOT = Path(__file__).resolve().parent.parent.parent

CHECKLIST_PATH_BY_TYPE: dict[str, Path] = {
    "labor_contract": _LABELHELP_ROOT / "assets" / "data" / "labor-contract-review-checklist.json",
    "civil_complaint": _LABELHELP_ROOT / "assets" / "data" / "civil-complaint-review-checklist.json",
    "general_document": _LABELHELP_ROOT / "assets" / "data" / "general-document-review-checklist.json",
}


def load_checklist_bundle(document_type: str = "labor_contract") -> dict:
    key = str(document_type or "").strip() or "labor_contract"
    path = CHECKLIST_PATH_BY_TYPE.get(key) or CHECKLIST_PATH_BY_TYPE["labor_contract"]
    return load_json_config(path)


def flatten_checklist_rows(bundle: dict) -> list[dict]:
    """Flatten bundle rows in the same order as the JSON file."""
    rows: list[dict] = []
    for law in bundle.get("legal_basis") or []:
        lid = str(law.get("id") or "").strip()
        if not lid:
            continue
        rows.append(
            {
                "id": lid,
                "text": str(law.get("text") or "").strip(),
                "section": "法律依据",
            }
        )

    for sec in bundle.get("sections") or []:
        stitle = str(sec.get("title") or "").strip() or "未分类"
        for item in sec.get("items") or []:
            iid = str(item.get("id") or "").strip()
            if not iid:
                continue
            row: dict = {
                "id": iid,
                "text": str(item.get("text") or "").strip(),
                "section": stitle,
            }
            hint = str(item.get("hint") or "").strip()
            if hint:
                row["hint"] = hint
            rows.append(row)
    return rows


def ordered_checklist_ids(rows: list[dict]) -> list[str]:
    return [row["id"] for row in rows]


def _section_header_for_perspective(
    section: str,
    perspective_key: str,
    *,
    leading_newline: bool,
    document_type: str = "labor_contract",
) -> str:
    """Add a perspective-aware section intro before each checklist block."""
    sec = section or "未分类"
    dt = str(document_type or "").strip() or "labor_contract"

    if dt == "civil_complaint":
        if perspective_key == "employer":
            sub = "本部分从被告应诉、抗辩与程序风险角度，逐条核对下列检查点。"
        elif perspective_key == "third_party":
            sub = "本部分以第三方中立立场，核对下列起诉状要素与程序、实体表达的规范性。"
        else:
            sub = "本部分从原告诉请、事实与举证责任角度，逐条核对下列检查点。"
    elif dt == "general_document":
        if perspective_key == "employer":
            sub = "本部分从相对方、被约束方或风险承担方角度，逐条核对下列通用法务检查点。"
        elif perspective_key == "third_party":
            sub = "本部分以第三方中立立场，核对下列通用法务检查点的合法性、完整性与可执行性。"
        else:
            sub = "本部分从提交方、出具方或主张方角度，逐条核对下列通用法务检查点。"
    elif perspective_key == "employer":
        sub = "本部分从用人单位用工管理、合规义务、经营成本与风险可控性角度，逐条核对下列检查点。"
    elif perspective_key == "third_party":
        sub = "本部分以第三方中立立场，不偏不倚地核对下列检查点与法律及通常商业惯例的符合性。"
    else:
        sub = "本部分从劳动者权益保障、法定底线与实质公平角度，逐条核对下列检查点。"

    body = f"【{sec}】\n（{sub}）"
    return f"\n{body}" if leading_newline else body


def format_checklist_for_prompt(
    rows: list[dict],
    perspective_key: str = "worker",
    document_type: str = "labor_contract",
) -> str:
    pk = perspective_key if perspective_key in ("employer", "worker", "third_party") else "worker"
    dt = str(document_type or "").strip() or "labor_contract"
    lines: list[str] = []
    prev_section: str | None = None

    for row in rows:
        sec = str(row.get("section") or "").strip() or "未分类"
        if sec != prev_section:
            lines.append(
                _section_header_for_perspective(
                    sec,
                    pk,
                    leading_newline=bool(lines),
                    document_type=dt,
                )
            )
            prev_section = sec

        hint = str(row.get("hint") or "").strip()
        extra = f"\n   （提示：{hint}）" if hint else ""
        lines.append(f"- {row['id']}: {row['text']}{extra}")

    return "\n".join(lines)
