"""Prompt builders for summary extraction across review document types."""

from __future__ import annotations

from contract_review.general_prompts import (
    GENERAL_DOCUMENT_TYPE,
    build_general_summary_system_message,
    build_general_summary_user_message,
)

CONTRACT_SUMMARY_JSON_BASE = """你是劳动合同信息提取与摘要助手，只根据用户提供的合同正文输出 JSON，不得输出 JSON 之外的文字。

硬性规则：
1. 必须输出一个合法 JSON 对象。
2. 顶层字段：
   - "overview": 用 2-4 句话概括合同性质、期限、核心权利义务与主要风险。
   - "sections": 数组，每项为 { "title": "...", "content": "..." }。
3. sections 应尽量覆盖：合同主体与用工关系、合同期限与试用期、工作内容与工作地点、劳动报酬与支付、工作时间与休息休假、社会保险与福利待遇、合同解除终止与违约责任、保密与竞业限制。
4. 若原文未写明，可写“未见明确约定”或“信息不足”。
5. 使用简体中文。"""

PERSPECTIVE_SUMMARY_EXTRA = {
    "employer": "【摘要视角：雇佣者】摘要应更关注用工管理、合规义务、成本、违约责任与争议控制。",
    "worker": "【摘要视角：劳动者】摘要应更关注报酬、工时、社保福利、解约保护与不利条款。",
    "third_party": "【摘要视角：第三方（中立）】摘要应平衡概括双方权利义务与主要风险。",
}

COMPLAINT_SUMMARY_JSON_BASE = """你是民事起诉状信息提取与摘要助手，只根据用户提供的起诉状全文输出 JSON，不得输出 JSON 之外的文字。

硬性规则：
1. 必须输出一个合法 JSON 对象。
2. 顶层字段：
   - "overview": 用 2-4 句话概括案由、当事人、核心诉请与争议外观。
   - "sections": 数组，每项为 { "title": "...", "content": "..." }。
3. sections 应尽量覆盖：当事人与诉讼代理人、诉讼请求、事实与理由、证据与证明目的、管辖与程序事项。
4. 若原文未写明，可写“未见明确表述”或“信息不足”。
5. 使用简体中文。"""

COMPLAINT_PERSPECTIVE_SUMMARY_EXTRA = {
    "employer": "【摘要视角：被告（应诉方）】摘要应更关注原告诉请对被告责任、程序安排与抗辩空间的影响。",
    "worker": "【摘要视角：原告（起诉方）】摘要应更关注原告诉请、事实支撑与证据结构。",
    "third_party": "【摘要视角：第三方（中立）】摘要应平衡呈现诉请、事实与程序要点。",
}


def build_summary_system_message(
    perspective_key: str,
    document_type: str = "labor_contract",
) -> str:
    pk = perspective_key if perspective_key in ("employer", "worker", "third_party") else "worker"
    dt = str(document_type or "").strip() or "labor_contract"
    if dt == GENERAL_DOCUMENT_TYPE:
        return build_general_summary_system_message(pk)
    if dt == "civil_complaint":
        return COMPLAINT_SUMMARY_JSON_BASE + "\n" + COMPLAINT_PERSPECTIVE_SUMMARY_EXTRA[pk]
    return CONTRACT_SUMMARY_JSON_BASE + "\n" + PERSPECTIVE_SUMMARY_EXTRA[pk]


def build_summary_user_message(
    contract_text: str,
    stance: str,
    perspective_key: str = "worker",
    document_type: str = "labor_contract",
    *,
    user_requirements: str = "",
) -> str:
    pk = perspective_key if perspective_key in ("employer", "worker", "third_party") else "worker"
    dt = str(document_type or "").strip() or "labor_contract"

    requirements_block = f"\n\n【本次审查需额外关注的用户临时要求】\n{str(user_requirements or '').strip()}" if str(
        user_requirements or ""
    ).strip() else ""

    if dt == GENERAL_DOCUMENT_TYPE:
        return build_general_summary_user_message(
            f"{contract_text}{requirements_block}",
            stance,
            pk,
        )

    if dt == "civil_complaint":
        preamble = {
            "employer": "【摘要视角：被告（应诉方）】",
            "worker": "【摘要视角：原告（起诉方）】",
            "third_party": "【摘要视角：第三方（中立）】",
        }[pk]
        return f"""文书类型：民事起诉状
界面所选立场：{stance}
{preamble}

【起诉状全文】
{contract_text}{requirements_block}

请输出 JSON，形如：
{{
  "overview": "……",
  "sections": [
    {{ "title": "当事人与诉讼代理人", "content": "……" }},
    {{ "title": "诉讼请求", "content": "……" }}
  ]
}}"""

    preamble = {
        "employer": "【摘要视角：雇佣者（用人单位 / 甲方）】",
        "worker": "【摘要视角：劳动者（乙方）】",
        "third_party": "【摘要视角：第三方（中立）】",
    }[pk]
    return f"""文书类型：劳动合同
界面所选立场：{stance}
{preamble}

【合同正文】
{contract_text}{requirements_block}

请输出 JSON，形如：
{{
  "overview": "……",
  "sections": [
    {{ "title": "合同主体与用工关系", "content": "……" }},
    {{ "title": "合同期限与试用期", "content": "……" }}
  ]
}}"""
