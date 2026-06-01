"""劳动争议调解申请书 Word：使用 backend/docx 下用户版式模板 + {{占位符}}。"""
from __future__ import annotations

from pathlib import Path

from document_writing.enforcement_application_docx import (
    format_respondent_block_enforcement,
)

# 新模板（英文文件名）
LABOR_MEDIATION_APPLICATION_TEMPLATE_PATH = (
    Path(__file__).resolve().parent.parent / "docx" / "laborDisputeMediationApplicationForm.docx"
)


def ensure_labor_mediation_application_template_exists() -> Path:
    path = LABOR_MEDIATION_APPLICATION_TEMPLATE_PATH
    if not path.exists():
        raise FileNotFoundError(
            f"缺少模板文件：{path.name}，请放入目录 {path.parent}；"
            "若从范文重新制作，请运行 python backend/document_writing/patch_labor_word_templates.py 嵌入占位符。"
        )
    return path


def format_labor_mediation_applicant_block(payload: dict) -> str:
    parts = [
        payload.get("applicant_name") and f"姓名：{str(payload.get('applicant_name')).strip()}",
        payload.get("applicant_gender") and f"性别：{str(payload.get('applicant_gender')).strip()}",
        payload.get("applicant_ethnicity") and f"民族：{str(payload.get('applicant_ethnicity')).strip()}",
        payload.get("applicant_birth") and f"出生日期：{str(payload.get('applicant_birth')).strip()}",
        payload.get("applicant_address") and f"住址：{str(payload.get('applicant_address')).strip()}",
        payload.get("applicant_id_type") and f"身份证件类型：{str(payload.get('applicant_id_type')).strip()}",
        payload.get("applicant_id_number") and f"证件号码：{str(payload.get('applicant_id_number')).strip()}",
        payload.get("applicant_job") and f"工作单位及职务：{str(payload.get('applicant_job')).strip()}",
        payload.get("applicant_phone") and f"联系电话：{str(payload.get('applicant_phone')).strip()}",
        payload.get("contract_performance_place")
        and f"劳动合同履行地：{str(payload.get('contract_performance_place')).strip()}",
    ]
    out = [x for x in parts if x]
    return "，".join(out) if out else "（请填写申请人信息）"


def build_labor_mediation_mapping(payload: dict) -> dict[str, str]:
    ev = str(payload.get("evidence_list") or payload.get("evidenceList") or "").strip()
    preamble = str(payload.get("mediation_preamble") or payload.get("mediationPreamble") or "").strip()
    return {
        "applicant_block": format_labor_mediation_applicant_block(payload),
        "respondent_block": format_respondent_block_enforcement(payload),
        "mediation_preamble": preamble or "因申请人与被申请人发生劳动争议，申请调解。",
        "claims": str(payload.get("claims") or "").strip() or "（调解请求）",
        "facts": str(payload.get("facts") or "").strip() or "（事实与理由）",
        "evidence_list": ev or "（无）",
        "mediation_org": str(payload.get("mediation_org") or "").strip() or "（劳动争议调解组织全称）",
        "applicant_name": str(payload.get("applicant_name") or "").strip() or "（申请人姓名）",
        "date_text": str(payload.get("date_text") or payload.get("dateText") or "").strip() or "（日期）",
    }
