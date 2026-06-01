"""劳动人事争议仲裁申请书 Word：使用 backend/docx 下用户版式模板 + {{占位符}}。"""
from __future__ import annotations

from pathlib import Path

from document_writing.enforcement_application_docx import (
    format_respondent_block_enforcement,
)

LABOR_ARBITRATION_TEMPLATE_PATH = (
    Path(__file__).resolve().parent.parent / "docx" / "laborArbitrationApplicationForm.docx"
)


def ensure_labor_arbitration_template_exists() -> Path:
    path = LABOR_ARBITRATION_TEMPLATE_PATH
    if not path.exists():
        raise FileNotFoundError(
            f"缺少模板文件：{path.name}，请放入目录 {path.parent}；"
            "若从范文重新制作，请运行 python backend/document_writing/patch_labor_word_templates.py 嵌入占位符。"
        )
    return path


def format_labor_arbitration_applicant_block(payload: dict) -> str:
    parts: list[str] = []
    name = str(payload.get("applicant_name") or "").strip()
    if name:
        parts.append(f"姓名：{name}")
    g = str(payload.get("applicant_gender") or "").strip()
    if g:
        parts.append(f"性别：{g}")
    eth = str(payload.get("applicant_ethnicity") or "").strip()
    if eth:
        parts.append(f"民族：{eth}")
    birth = str(payload.get("applicant_birth") or "").strip()
    if birth:
        parts.append(f"出生日期：{birth}")
    addr = str(payload.get("applicant_address") or "").strip()
    if addr:
        parts.append(f"住址：{addr}")
    id_type = str(payload.get("applicant_id_type") or "").strip()
    id_no = str(payload.get("applicant_id_number") or "").strip()
    if id_type or id_no:
        merged = f"{id_type}：{id_no}" if id_type and id_no else id_type or id_no
        parts.append(f"身份证件类型及证件号码：{merged}")
    job = str(payload.get("applicant_job") or "").strip()
    if job:
        parts.append(f"工作单位及职务：{job}")
    phone = str(payload.get("applicant_phone") or "").strip()
    if phone:
        parts.append(f"联系电话：{phone}")
    contract_place = str(payload.get("contract_performance_place") or "").strip()
    if contract_place:
        parts.append(f"劳动合同履行地：{contract_place}")
    return "，".join(parts) if parts else "（请填写申请人信息）"


def build_labor_arbitration_mapping(payload: dict) -> dict[str, str]:
    ev = str(payload.get("evidence_list") or payload.get("evidenceList") or "").strip()
    agent = str(payload.get("agent_block") or payload.get("agentBlock") or "").strip()
    legal_rep = str(payload.get("respondent_legal_representative") or "").strip()
    legal_rep_job = str(payload.get("respondent_legal_representative_job") or "").strip()
    if legal_rep and legal_rep_job:
        payload = {**payload, "respondent_legal_representative": f"{legal_rep}（{legal_rep_job}）"}
    return {
        "applicant_block": format_labor_arbitration_applicant_block(payload),
        "agent_block": agent or "无",
        "respondent_block": format_respondent_block_enforcement(payload),
        "claims": str(payload.get("claims") or "").strip() or "（仲裁请求）",
        "facts": str(payload.get("facts") or "").strip() or "（事实与理由）",
        "evidence_list": ev or "（无）",
        "attachment_line": str(payload.get("attachment_line") or "").strip() or "（无）",
        "arbitration_commission": str(payload.get("arbitration_commission") or "").strip()
        or "（劳动人事争议仲裁委员会全称）",
        "applicant_name": str(payload.get("applicant_name") or "").strip() or "（申请人姓名）",
        "date_text": str(payload.get("date_text") or payload.get("dateText") or "").strip() or "（日期）",
    }
