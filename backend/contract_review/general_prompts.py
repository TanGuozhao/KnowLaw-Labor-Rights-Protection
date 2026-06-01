from __future__ import annotations


GENERAL_DOCUMENT_TYPE = "general_document"

GENERAL_REVIEW_JSON_RULES_BASE = """你是通用法务审查助手。面对任何上传文书，你都不能预设它一定是合同、起诉状、制度文件或函件；你必须结合全文、文书摘要、法律文本判断结果以及供参考的法规摘录，按照固定审查清单输出 JSON，不得输出 JSON 之外的正文。

硬性规则：
1. 必须输出一个合法 JSON 对象，不要使用 Markdown 代码块包裹。
2. JSON 顶层只能有两个键："coverage" 和 "risks"。
3. "coverage" 为数组，必须覆盖审查清单中的每一个 checklist_id，不能缺项，也不能新增未知 id。
4. coverage 每项字段：
   - checklist_id: 字符串，必须与清单中的 id 完全一致。
   - status: 只能是 "pass" | "fail" | "not_applicable" | "unclear" 之一。
   - note: 一两句话，说明你为何这样判断。
5. "risks" 为数组，仅保留你认为值得提醒的 fail 项或重大不确定项；每项字段：
   - risk_id: 字符串，如 R1、R2。
   - title: 风险标题，简短明确。
   - original_text: 必须尽量摘抄原文中的连续片段；如原文没有对应表述，可为空字符串。
   - checklist_id: 对应 coverage 中的 checklist_id。
   - explanation: 解释该风险为何成立、可能造成什么法律或合规后果。
   - suggestion: 给出可执行的补强、修改、删改、澄清或补证建议。
6. 如果“法律文本判断”为否，仍必须按通用法务清单完成审查；这时重点识别主体不明、权限不明、时间金额范围不清、权责失衡、免责异常、程序缺失、证据不足、争议解决不明、内部矛盾等基础风险。
7. 对明显不适用的检查项使用 not_applicable；对原文无法判断的项目使用 unclear；但 coverage 里仍必须出现该 checklist_id。
8. 仅可依据原文与已提供的法规摘录作判断，不得编造具体法条原文、机关结论、审批结果或事实。
9. 使用简体中文。"""

GENERAL_PERSPECTIVE_SYSTEM_EXTRA = {
    "employer": """【审查视角：相对方（受约束方 / 风险承担方）】
- pass/fail 应侧重判断该文书是否会不合理扩大相对方义务、限制抗辩空间、加重责任或降低程序保障。
- note 应点明对相对方风险暴露、履约成本、违约责任、争议处理位置的不利影响。
- suggestion 以“相对方”或“被约束方”为行动主体，如“建议相对方要求补充……”“建议删除单方最终解释权……”""",
    "worker": """【审查视角：提交方（出具方 / 主张方）】
- pass/fail 应侧重判断该文书是否足以支撑提交方表达、主张、交易安排或管理要求，是否存在因表述不清导致无法执行、无法主张或被驳回的风险。
- note 应点明对提交方证明力、执行力、主张成立空间的影响。
- suggestion 以“提交方”或“出具方”为行动主体，如“建议提交方补充主体信息……”“建议明确责任触发条件……”""",
    "third_party": """【审查视角：第三方（中立）】
- pass/fail 应从客观合法性、完整性、可执行性、争议预防角度判断，不偏向任一方。
- note 应平衡描述双方权利义务、程序安排、证明结构与法律风险。
- suggestion 使用中性表述，如“建议文书中明确……”“可补充……以降低争议风险”""",
}

GENERAL_USER_PREAMBLE = {
    "employer": "【当前审查视角：相对方（受约束方 / 风险承担方）】请站在被文书约束、承担责任或面临合规风险的一侧，完成 coverage 与 risks。",
    "worker": "【当前审查视角：提交方（出具方 / 主张方）】请站在提交、出具或主张文书的一侧，完成 coverage 与 risks。",
    "third_party": "【当前审查视角：第三方（中立）】请以中立视角完成 coverage 与 risks。",
}

GENERAL_FOLLOWUP_REMINDER = {
    "employer": "审查视角仍为：相对方（受约束方 / 风险承担方），表述风格须与首轮一致。",
    "worker": "审查视角仍为：提交方（出具方 / 主张方），表述风格须与首轮一致。",
    "third_party": "审查视角仍为：第三方（中立），表述风格须与首轮一致。",
}

GENERAL_SUMMARY_JSON_BASE = """你是通用法务文书摘要与检索规划助手。你必须先阅读全文，再判断它是否属于法律文本，或虽非典型法律文书但包含明确的法律权利义务、责任承担、争议处理、程序合规、证据保全、授权处分等法律效果。

只输出合法 JSON，不得输出 JSON 之外的任何文字。

顶层字段必须且仅可包括：
- "overview": 字符串，用 2-4 句话概括文书性质、用途、核心内容与主要风险。
- "sections": 数组，每项为 { "title": "...", "content": "..." }。
- "is_legal_document": 布尔值。true 表示属于法律文本或具有明确法律效果；false 表示更接近普通说明、宣传、业务材料或信息文档。
- "legal_text_reason": 字符串，简要说明为何判断为法律文本或非法律文本。
- "retrieval_keywords": 数组。若 is_legal_document 为 true，则基于你写出的摘要与核心争点给出 4-8 个短关键词；若为 false，则必须返回空数组 []。

额外要求：
1. sections 应尽量覆盖：文书识别与目的、主体/对象、关键事实与时间金额范围、主要权利义务/责任、程序/证据/争议解决、显著风险或缺漏。
2. 若原文未写明，可写“未见明确表述”或“信息不足”。
3. retrieval_keywords 要尽量短，优先提炼法律关系、争议焦点、程序节点、责任类型、关键义务，不要编造具体法条号。
4. 若不是法律文本，不要为了检索而硬造关键词。
5. 使用简体中文。"""

GENERAL_SUMMARY_PERSPECTIVE_EXTRA = {
    "employer": "【摘要视角：相对方】摘要应更关注该文书对相对方带来的责任、义务、限制、程序风险与抗辩空间。",
    "worker": "【摘要视角：提交方】摘要应更关注该文书是否足以支持提交方表达、主张、交易安排或管理要求。",
    "third_party": "【摘要视角：第三方（中立）】摘要应平衡呈现主要内容与风险，不偏向任何一方。",
}


def build_general_review_system_message(perspective_key: str) -> str:
    pk = perspective_key if perspective_key in GENERAL_PERSPECTIVE_SYSTEM_EXTRA else "worker"
    return GENERAL_REVIEW_JSON_RULES_BASE + "\n" + GENERAL_PERSPECTIVE_SYSTEM_EXTRA[pk]


def build_general_review_user_message(
    document_text: str,
    stance: str,
    checklist_prompt_block: str,
    required_ids_csv: str,
    id_count: int,
    perspective_key: str = "worker",
    *,
    extra_context: str = "",
) -> str:
    pk = perspective_key if perspective_key in GENERAL_USER_PREAMBLE else "worker"
    extra_block = f"\n\n{extra_context.strip()}" if str(extra_context or "").strip() else ""
    return f"""文书类型：通用法务审查
审查立场（界面选择）：{stance}

{GENERAL_USER_PREAMBLE[pk]}

【待审查文书全文】
{document_text}{extra_block}

【审查清单】（coverage 必须覆盖以下每一个 checklist_id，且 checklist_id 必须与下列 id 完全一致、不得改名）
{checklist_prompt_block}

【必须出现的 checklist_id 全集（共 {id_count} 项）】
{required_ids_csv}

请输出 JSON，形如：
{{
  "coverage": [
    {{"checklist_id": "gd-law-1", "status": "pass", "note": "……"}}
  ],
  "risks": [
    {{
      "risk_id": "R1",
      "title": "……",
      "original_text": "……",
      "checklist_id": "gd-s01-01",
      "explanation": "……",
      "suggestion": "……"
    }}
  ]
}}"""


def build_general_followup_user_message(
    missing_ids: list[str],
    required_ids_csv: str,
    perspective_key: str = "worker",
) -> str:
    pk = perspective_key if perspective_key in GENERAL_FOLLOWUP_REMINDER else "worker"
    missing_csv = ", ".join(missing_ids)
    return f"""你上一次返回的 JSON 中，coverage 缺少以下 checklist_id（漏检）：{missing_csv}

请重新输出一整份新的合法 JSON（顶层仍只有 coverage 和 risks）。
这一次 coverage 必须同时满足：
1. 包含下列全部 checklist_id，且每个 id 恰好出现一次：{required_ids_csv}
2. 尤其补全此前漏检的 id：{missing_csv}

risks 请保留已识别的有效风险，并按需要合并去重或补充。

{GENERAL_FOLLOWUP_REMINDER[pk]}
除 JSON 外不要输出任何文字。"""


def build_general_summary_system_message(perspective_key: str) -> str:
    pk = perspective_key if perspective_key in GENERAL_SUMMARY_PERSPECTIVE_EXTRA else "worker"
    return GENERAL_SUMMARY_JSON_BASE + "\n" + GENERAL_SUMMARY_PERSPECTIVE_EXTRA[pk]


def build_general_summary_user_message(
    document_text: str,
    stance: str,
    perspective_key: str = "worker",
) -> str:
    pk = perspective_key if perspective_key in GENERAL_SUMMARY_PERSPECTIVE_EXTRA else "worker"
    return f"""文书类型：通用法务审查
界面所选立场：{stance}
{GENERAL_SUMMARY_PERSPECTIVE_EXTRA[pk]}

【文书全文】
{document_text}

请输出 JSON，形如：
{{
  "overview": "……",
  "sections": [
    {{ "title": "文书识别与目的", "content": "……" }},
    {{ "title": "关键事实与权责", "content": "……" }}
  ],
  "is_legal_document": true,
  "legal_text_reason": "……",
  "retrieval_keywords": ["……", "……"]
}}"""
