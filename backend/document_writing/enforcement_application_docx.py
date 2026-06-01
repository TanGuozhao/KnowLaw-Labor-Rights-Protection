"""申请执行书 Word：使用法院范文样式模板 + {{占位符}}。"""
from __future__ import annotations

from pathlib import Path

from document_writing.civil_complaint_docx import replace_placeholders_in_document

# 由 patch_labor_word_templates.py 从范文生成（含 {{占位符}}），避免占用中的源文件无法写入
ENFORCEMENT_APPLICATION_TEMPLATE_PATH = (
    Path(__file__).resolve().parent.parent / "docx" / "applicationForEnforcementDocumentForApp.docx"
)


def ensure_enforcement_application_template_exists() -> Path:
    path = ENFORCEMENT_APPLICATION_TEMPLATE_PATH
    if not path.exists():
        raise FileNotFoundError(
            f"缺少模板文件：{path.name}，请放入目录 {path.parent}；"
            "若从范文恢复，请运行 python backend/document_writing/patch_labor_word_templates.py 嵌入占位符。"
        )
    return path


def format_enforcement_applicant_official_line(payload: dict) -> str:
    name = str(payload.get("applicant_name") or "").strip() or "×××"
    gender = str(payload.get("applicant_gender") or "").strip() or "男/女"
    birth = str(payload.get("applicant_birth") or "").strip() or "××××年××月××日"
    if "出生" not in birth:
        birth = f"{birth}出生"
    eth = str(payload.get("applicant_ethnicity") or "").strip() or "×"
    if eth and not eth.endswith("族"):
        eth = f"{eth}族"
    job = str(payload.get("applicant_job") or "").strip()
    job_part = f"{job}，" if job else "……(写明工作单位和职务或者职业)，"
    addr = str(payload.get("applicant_address") or "").strip() or "……"
    idn = str(payload.get("applicant_id_number") or "").strip()
    phone = str(payload.get("applicant_phone") or "").strip() or "……"
    line = f"{name}，{gender}，{birth}，{eth}，{job_part}住{addr}。"
    if idn:
        line += f"公民身份号码：{idn}。"
    line += f"联系方式：{phone}。"
    return line


def format_enforcement_respondent_official_line(payload: dict) -> str:
    org_rep = str(payload.get("respondent_legal_representative") or "").strip()
    name = str(payload.get("respondent_name") or "").strip() or "×××"
    addr = str(payload.get("respondent_address") or "").strip() or "……"
    phone = str(payload.get("respondent_phone") or "").strip() or "……"
    if org_rep:
        return f"{name}，住所地{addr}。法定代表人：{org_rep}。联系方式：{phone}。"
    return f"{name}，住{addr}。联系方式：{phone}。"


def format_legal_representative_line(payload: dict) -> str:
    t = str(payload.get("legal_representative_line") or payload.get("legalRepresentativeLine") or "").strip()
    return t if t else "无。"


def format_entrusted_agent_line(payload: dict) -> str:
    t = str(payload.get("entrusted_agent_line") or payload.get("entrustedAgentLine") or "").strip()
    return t if t else "无。"


def build_enforcement_opening_paragraph(payload: dict) -> str:
    an = str(payload.get("applicant_name") or "").strip() or "×××"
    rn = str(payload.get("respondent_name") or "").strip() or "×××"
    cause = str(payload.get("case_cause") or payload.get("caseCause") or "").strip() or "（案由）"
    issuer = str(payload.get("basis_issuer") or "").strip() or "××××人民法院"
    jno = str(payload.get("basis_judgment_no") or "").strip() or "……号"
    doc_phrase = str(
        payload.get("basis_doc_type_phrase") or payload.get("basisDocTypePhrase") or ""
    ).strip() or "民事判决（或其他生效法律文书）"
    perf = str(
        payload.get("enforcement_non_performance_phrase") or payload.get("enforcementNonPerformancePhrase") or ""
    ).strip() or "未履行/未全部履行生效法律文书确定的给付义务"
    core = (
        f"申请执行人{an}与被执行人{rn}……（{cause}）一案，{issuer}（{jno}）{doc_phrase}已发生法律效力。"
        f"被执行人{rn}{perf}，特向你院申请强制执行。"
    )
    extra = str(payload.get("basis_extra") or "").strip()
    facts = str(payload.get("facts") or "").strip()
    parts: list[str] = [core]
    if extra:
        parts.append(extra)
    if facts:
        parts.append(facts)
    return "\n\n".join(parts) if len(parts) > 1 else core


def format_attachment_line(payload: dict) -> str:
    t = str(payload.get("attachment_line") or payload.get("attachmentLine") or "").strip()
    return t if t else "附：生效法律文书壹份"


def format_applicant_block(payload: dict) -> str:
    """劳动仲裁等文书：申请执行人信息合并为一行（姓名：…，性别：…）。"""
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
    idn = str(payload.get("applicant_id_number") or "").strip()
    if idn:
        parts.append(f"公民身份号码：{idn}")
    phone = str(payload.get("applicant_phone") or "").strip()
    if phone:
        parts.append(f"联系电话：{phone}")
    if not parts:
        return "（请填写申请执行人信息）"
    return "，".join(parts)


def format_respondent_block_enforcement(payload: dict) -> str:
    """兼容劳动仲裁/调解等：保留「姓名：…」式合并表述（非法院申请执行书专用行）。"""
    org_rep = str(payload.get("respondent_legal_representative") or "").strip()
    name = str(payload.get("respondent_name") or "").strip()
    addr = str(payload.get("respondent_address") or "").strip()
    phone = str(payload.get("respondent_phone") or "").strip()
    if org_rep:
        parts: list[str] = []
        if name:
            parts.append(f"单位名称：{name}")
        if addr:
            parts.append(f"住所地：{addr}")
        parts.append(f"法定代表人/主要负责人：{org_rep}")
        if phone:
            parts.append(f"联系电话：{phone}")
        return "，".join(parts) if parts else "（请填写被申请执行单位信息）"
    parts = []
    if name:
        parts.append(f"姓名：{name}")
    if addr:
        parts.append(f"住址：{addr}")
    if phone:
        parts.append(f"联系电话：{phone}")
    if not parts:
        return "（请填写被申请执行人信息）"
    return "，".join(parts)


def format_basis_block(payload: dict) -> str:
    """用于预览/其他导出：执行依据条目化摘要。"""
    lines: list[str] = []
    no = str(payload.get("basis_judgment_no") or "").strip()
    if no:
        lines.append(f"生效法律文书案号：{no}")
    issuer = str(payload.get("basis_issuer") or "").strip()
    if issuer:
        lines.append(f"作出机关：{issuer}")
    eff = str(payload.get("basis_effective_date") or "").strip()
    if eff:
        lines.append(f"生效日期：{eff}")
    extra = str(payload.get("basis_extra") or "").strip()
    if extra:
        lines.append(extra)
    if not lines:
        return "（请填写执行依据，如判决书/调解书/仲裁裁决案号及生效情况）"
    return "\n".join(lines)


def build_enforcement_application_mapping(payload: dict) -> dict[str, str]:
    req = str(payload.get("requests") or "").strip() or "……(写明请求执行的内容)。"
    return {
        "applicant_block": format_enforcement_applicant_official_line(payload),
        "legal_representative_line": format_legal_representative_line(payload),
        "entrusted_agent_line": format_entrusted_agent_line(payload),
        "respondent_block": format_enforcement_respondent_official_line(payload),
        "enforcement_opening_paragraph": build_enforcement_opening_paragraph(payload),
        "requests": req,
        "court_name": str(payload.get("court_name") or "").strip() or "××××人民法院",
        "attachment_line": format_attachment_line(payload),
        "date_text": str(payload.get("date_text") or payload.get("dateText") or "").strip() or "××××年××月××日",
    }
