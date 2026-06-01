"""Prompt builders for checklist-based review flows."""

from __future__ import annotations

from contract_review.general_prompts import (
    GENERAL_DOCUMENT_TYPE,
    build_general_followup_user_message,
    build_general_review_system_message,
    build_general_review_user_message,
)

CONTRACT_REVIEW_JSON_RULES_BASE = """你是劳动合同审查助手，只负责根据用户提供的合同正文与固定审查清单输出 JSON，不得输出 JSON 之外的正文。

硬性规则：
1. 必须输出一个合法 JSON 对象。
2. 顶层只能有 "coverage" 和 "risks" 两个键。
3. coverage 必须覆盖审查清单中的每一个 checklist_id，不能缺漏，也不能新增未知 id。
4. coverage 每项字段：
   - checklist_id: 必须与清单中的 id 完全一致。
   - status: 只能是 "pass" | "fail" | "not_applicable" | "unclear"。
   - note: 一两句话，说明为何这样判断。
5. risks 为数组，仅列出 fail 项或重大不确定项；每项字段：
   - risk_id: 如 R1、R2。
   - title: 风险标题。
   - original_text: 尽量摘录原文中的连续片段；没有对应原文可为空字符串。
   - checklist_id: 对应 coverage 中的 checklist_id。
   - explanation: 说明风险及可能后果。
   - suggestion: 给出修改、补充、谈判或提示建议。
6. 若清单项与当前文本明显无关，可用 not_applicable；若原文无法判断，可用 unclear；但 coverage 中仍必须出现该 checklist_id。
7. 使用简体中文。"""

PERSPECTIVE_SYSTEM_EXTRA = {
    "employer": """【审查视角：雇佣者（用人单位 / 甲方）】
- pass/fail 从用人单位的管理、合规、成本与争议控制角度判断。
- note 应点明对甲方管理权、证据地位、责任承担和合规成本的影响。
- suggestion 以“甲方 / 用人单位”为行动主体。""",
    "worker": """【审查视角：劳动者（乙方）】
- pass/fail 从劳动者权益、法定底线、公平性与可执行性角度判断。
- note 应点明对乙方报酬、工时、解约保护、社保福利、违约责任等的影响。
- suggestion 以“乙方 / 劳动者”为行动主体。""",
    "third_party": """【审查视角：第三方（中立）】
- pass/fail 从客观合法性、条款平衡性、争议预防与可执行性角度判断。
- note 应平衡描述双方权利义务与风险。
- suggestion 使用中性措辞，不偏向任一方。""",
}

PERSPECTIVE_USER_PREAMBLE = {
    "employer": "【当前审查视角：雇佣者（用人单位 / 甲方）】请从甲方视角完成 coverage 与 risks。",
    "worker": "【当前审查视角：劳动者（乙方）】请从乙方视角完成 coverage 与 risks。",
    "third_party": "【当前审查视角：第三方（中立）】请以中立视角完成 coverage 与 risks。",
}

PERSPECTIVE_FOLLOWUP_REMINDER = {
    "employer": "审查视角仍为：雇佣者（用人单位 / 甲方），表述风格须与首轮一致。",
    "worker": "审查视角仍为：劳动者（乙方），表述风格须与首轮一致。",
    "third_party": "审查视角仍为：第三方（中立），表述风格须与首轮一致。",
}

COMPLAINT_REVIEW_JSON_RULES_BASE = """你是民事起诉状审查助手，只负责根据用户提供的起诉状全文与固定审查清单输出 JSON，不得输出 JSON 之外的正文。

硬性规则：
1. 必须输出一个合法 JSON 对象。
2. 顶层只能有 "coverage" 和 "risks" 两个键。
3. coverage 必须覆盖审查清单中的每一个 checklist_id，不能缺漏，也不能新增未知 id。
4. coverage 每项字段：
   - checklist_id: 必须与清单中的 id 完全一致。
   - status: 只能是 "pass" | "fail" | "not_applicable" | "unclear"。
   - note: 一两句话，说明为何这样判断。
5. risks 为数组，仅列出 fail 项或重大不确定项；每项字段：
   - risk_id: 如 R1、R2。
   - title: 风险标题。
   - original_text: 尽量摘录原文中的连续片段；没有对应原文可为空字符串。
   - checklist_id: 对应 coverage 中的 checklist_id。
   - explanation: 说明风险及可能后果。
   - suggestion: 给出修改、补正、补证、程序调整或诉讼策略建议。
6. 若清单项与当前文本明显无关，可用 not_applicable；若原文无法判断，可用 unclear；但 coverage 中仍必须出现该 checklist_id。
7. 使用简体中文。"""

COMPLAINT_PERSPECTIVE_SYSTEM_EXTRA = {
    "employer": """【审查视角：被告（应诉方）】
- pass/fail 从被告应诉、抗辩、程序风险与责任防控角度判断。
- note 应点明对被告答辩、举证、管辖异议或反诉空间的影响。
- suggestion 以“被告 / 应诉方”为行动主体。""",
    "worker": """【审查视角：原告（起诉方）】
- pass/fail 从原告诉请清晰度、事实支撑、证据结构与立案/胜诉风险角度判断。
- note 应点明对原告立案、举证与请求成立空间的影响。
- suggestion 以“原告 / 起诉方”为行动主体。""",
    "third_party": """【审查视角：第三方（中立）】
- pass/fail 从程序合法性、事实逻辑、请求明确性与争议解决效率角度判断。
- note 应平衡说明双方程序与实体风险。
- suggestion 使用中性措辞。""",
}

COMPLAINT_USER_PREAMBLE = {
    "employer": "【当前审查视角：被告（应诉方）】请从被告视角完成 coverage 与 risks。",
    "worker": "【当前审查视角：原告（起诉方）】请从原告视角完成 coverage 与 risks。",
    "third_party": "【当前审查视角：第三方（中立）】请以中立视角完成 coverage 与 risks。",
}

COMPLAINT_FOLLOWUP_REMINDER = {
    "employer": "审查视角仍为：被告（应诉方），表述风格须与首轮一致。",
    "worker": "审查视角仍为：原告（起诉方），表述风格须与首轮一致。",
    "third_party": "审查视角仍为：第三方（中立），表述风格须与首轮一致。",
}


def normalize_perspective(stance: str) -> str:
    s = str(stance or "").strip().lower()
    if s in ("employer", "worker", "third_party"):
        return s
    if any(key in s for key in ("第三方", "中立")):
        return "third_party"
    if any(key in s for key in ("提交方", "出具方", "主张方")):
        return "worker"
    if any(key in s for key in ("相对方", "接收方", "受约束方", "风险承担方")):
        return "employer"
    if any(key in s for key in ("原告", "起诉方")):
        return "worker"
    if any(key in s for key in ("被告", "应诉方")):
        return "employer"
    if any(key in s for key in ("雇佣", "甲方", "用人单位", "雇主")):
        return "employer"
    if any(key in s for key in ("劳动", "乙方", "员工")):
        return "worker"
    return "worker"


def _requirements_block(user_requirements: str) -> str:
    text = str(user_requirements or "").strip()
    if not text:
        return ""
    return f"\n\n【本次审查需额外遵循的用户临时要求】\n{text}"


def build_contract_review_system_message(
    perspective_key: str,
    document_type: str = "labor_contract",
) -> str:
    pk = perspective_key if perspective_key in ("employer", "worker", "third_party") else "worker"
    dt = str(document_type or "").strip() or "labor_contract"
    if dt == GENERAL_DOCUMENT_TYPE:
        return build_general_review_system_message(pk)
    if dt == "civil_complaint":
        return COMPLAINT_REVIEW_JSON_RULES_BASE + "\n" + COMPLAINT_PERSPECTIVE_SYSTEM_EXTRA[pk]
    return CONTRACT_REVIEW_JSON_RULES_BASE + "\n" + PERSPECTIVE_SYSTEM_EXTRA[pk]


def build_initial_user_message(
    contract_text: str,
    stance: str,
    checklist_prompt_block: str,
    required_ids_csv: str,
    id_count: int,
    perspective_key: str = "worker",
    document_type: str = "labor_contract",
    *,
    extra_context: str = "",
    user_requirements: str = "",
) -> str:
    pk = perspective_key if perspective_key in ("employer", "worker", "third_party") else "worker"
    dt = str(document_type or "").strip() or "labor_contract"

    if dt == GENERAL_DOCUMENT_TYPE:
        return build_general_review_user_message(
            contract_text,
            stance,
            checklist_prompt_block,
            required_ids_csv,
            id_count,
            pk,
            extra_context=f"{str(extra_context or '').strip()}{_requirements_block(user_requirements)}".strip(),
        )

    if dt == "civil_complaint":
        preamble = COMPLAINT_USER_PREAMBLE[pk]
        type_line = "文书类型：民事起诉状"
        body_label = "【起诉状全文】"
        example_id = "qc-law-1"
        example_check = "qc-s01-01"
    else:
        preamble = PERSPECTIVE_USER_PREAMBLE[pk]
        type_line = "文书类型：劳动合同"
        body_label = "【合同正文】"
        example_id = "law-1"
        example_check = "s01-01"

    extra_block = f"\n\n{str(extra_context or '').strip()}" if str(extra_context or "").strip() else ""
    return f"""{type_line}
审查立场（界面选择）：{stance}

{preamble}

{body_label}
{contract_text}{extra_block}{_requirements_block(user_requirements)}

【审查清单】（coverage 必须覆盖以下每一个 checklist_id，且 checklist_id 必须与下列 id 完全一致、不得改名）
{checklist_prompt_block}

【必须出现的 checklist_id 全集（共 {id_count} 项）】
{required_ids_csv}

请输出 JSON，形如：
{{
  "coverage": [
    {{"checklist_id": "{example_id}", "status": "pass", "note": "……"}}
  ],
  "risks": [
    {{
      "risk_id": "R1",
      "title": "……",
      "original_text": "……",
      "checklist_id": "{example_check}",
      "explanation": "……",
      "suggestion": "……"
    }}
  ]
}}"""


def build_followup_user_message(
    missing_ids: list[str],
    required_ids_csv: str,
    perspective_key: str = "worker",
    document_type: str = "labor_contract",
    *,
    user_requirements: str = "",
) -> str:
    pk = perspective_key if perspective_key in ("employer", "worker", "third_party") else "worker"
    dt = str(document_type or "").strip() or "labor_contract"
    if dt == GENERAL_DOCUMENT_TYPE:
        return build_general_followup_user_message(missing_ids, required_ids_csv, pk) + _requirements_block(
            user_requirements
        )

    missing_csv = ", ".join(missing_ids)
    reminders = COMPLAINT_FOLLOWUP_REMINDER if dt == "civil_complaint" else PERSPECTIVE_FOLLOWUP_REMINDER
    reminder = reminders[pk]
    return f"""你上一次返回的 JSON 中，coverage 缺少以下 checklist_id（漏检）：{missing_csv}

请重新输出一整份新的合法 JSON（顶层仍只有 coverage 和 risks）。
这一次 coverage 必须同时满足：
1. 包含下列全部 checklist_id，且每个 id 恰好出现一次：{required_ids_csv}
2. 尤其补全此前漏检的 id：{missing_csv}

risks 请保留上一轮已识别的有效风险，并按需要合并去重或补充。{_requirements_block(user_requirements)}

{reminder}
除 JSON 外不要输出任何文字。"""
