"""
法律咨询：先以 LLM 改写检索 query、拉取法规条文，再将摘录作为参考交给混元生成回答。
"""

import re

from chat_service import chat_completion
from retrieval_service import (
    RETRIEVAL_LAW,
    build_law_citations_and_context,
    search_by_intent,
    to_keyword_array,
)

_CONSULT_DISCLAIMER = "该回答仅供参考，复杂问题请咨询专业律师。"

_TURN_SUMMARY_START = "<<<TURN_SUMMARY>>>"
_TURN_SUMMARY_END = "<<<END_TURN_SUMMARY>>>"

_RE_TURN_SUMMARY = re.compile(
    rf"{re.escape(_TURN_SUMMARY_START)}\s*(.*?)\s*{re.escape(_TURN_SUMMARY_END)}",
    re.DOTALL | re.MULTILINE,
)

_CONSULT_SYSTEM = (
    "你是「法律咨询助手」，面向**没有法律基础的普通人**写回答。用户消息中会附带：用户原问题、检索用改写、以及从法规库检索到的「条文摘录」（仅供引用，勿声称摘录以外的条号）。\n"
    "\n"
    "【篇幅：硬性要短】\n"
    "1. **正文**（不含最后一行免责）控制在 **240 个汉字以内**（含标点与法条名）；宁可少写、写短句，也不要超长。\n"
    "2. 正文尽量 **整段一气呵成**（一个自然段）；不要分段成小作文。\n"
    "3. **尽量不要列表**；若用户问题明显需要并列条件，才用 **一个** 无序列表，且 **不超过 2 条**，每条一行、一句话说完。\n"
    "\n"
    "【写法：白话、好懂】\n"
    "4. **开头第一句**就要像跟邻居说话一样，直接答「能/不能」「一般可以/一般不行」或「要看……」；不要铺垫背景。\n"
    "5. 少用官话从句；若出现法律术语，用括号跟**半句白话**解释即可。\n"
    "6. 禁止写成普法教材：不要「情况一/情况二」式分条；不要「法律依据」「办理要点」等**小标题**；不写办事材料清单、不写「去哪个部门几步走」。\n"
    "7. 用户只问「能不能」时：**结论 + 一句最常见的条件或例外** 就停笔，不要展开后果、不要延伸话题。\n"
    "\n"
    "【法条】\n"
    "8. 正文里 **最多一处**「《法律名称》第×条」，后面跟**半句**要旨（须与摘录一致）；不要罗列多条。\n"
    "9. 若摘录不足，一句带过「具体条文请以官方文本为准」，勿虚构条号。\n"
    "\n"
    "【格式】\n"
    "10. 禁止 emoji、颜文字、装饰符号；禁止 # 标题与 --- 分割线；加粗**少用**，只标 1～2 个词。\n"
    "\n"
    f"11. 最后一行**单独一行**原文照抄（不要加粗、不要改字）：{_CONSULT_DISCLAIMER}\n"
    "\n"
    "12. 在免责声明**之后**必须换行，再输出本轮记忆用摘要（供系统压缩上文，**不要**写入正文可见部分之外的多余解释）：\n"
    f"{_TURN_SUMMARY_START}\n"
    "（单独一段，**不超过 60 字**：用一句话概括用户核心关切与你的结论要点）\n"
    f"{_TURN_SUMMARY_END}\n"
    "除上述标签块外，不要再输出其它后记。"
)


def _is_emoji_codepoint(o: int) -> bool:
    if 0x1F300 <= o <= 0x1FAFF:
        return True
    if 0x1F600 <= o <= 0x1F64F:
        return True
    if 0x1F680 <= o <= 0x1F6FF:
        return True
    if 0x1F900 <= o <= 0x1F9FF:
        return True
    if 0x1F1E6 <= o <= 0x1F1FF:
        return True
    if 0x2600 <= o <= 0x27BF:
        return True
    if 0x2300 <= o <= 0x23FF:
        return True
    if 0xFE00 <= o <= 0xFE0F:
        return True
    return False


def strip_emojis(text: str) -> str:
    """去掉常见 emoji / 绘文字，避免模型仍输出装饰符号。"""
    if not text:
        return text
    return "".join(ch for ch in text if not _is_emoji_codepoint(ord(ch)))


def strip_horizontal_rules(text: str) -> str:
    return re.sub(r"^\s*([-*_])\1{2,}\s*$", "", text, flags=re.MULTILINE)


def flatten_markdown_headings(text: str) -> str:
    """将 # 标题转为加粗一行，避免渲染成过大字号。"""

    def _repl(m: re.Match) -> str:
        title = (m.group(3) or "").strip()
        return f"**{title}**" if title else ""

    return re.sub(r"^(\s{0,3})(#{1,6})\s+(\S.*)$", _repl, text, flags=re.MULTILINE)


def normalize_consult_reply_text(text: str) -> str:
    """后处理：去分割线、压平标题、去 emoji。"""
    t = strip_horizontal_rules(str(text or ""))
    t = flatten_markdown_headings(t)
    t = strip_emojis(t)
    return t.strip()


def _truncate_body_to_chars(body: str, max_chars: int) -> str:
    """在不超过 max_chars 的前提下尽量落在句号处截断。"""
    b = (body or "").strip()
    if len(b) <= max_chars:
        return b
    window = b[: max_chars + 50]
    floor = max(0, max_chars - 100)
    for sep in ("。", "！", "？", ".", ";", "；"):
        cut = window.rfind(sep, floor, len(window))
        if cut >= max_chars // 2:
            return window[: cut + 1].strip()
    return b[:max_chars].rstrip() + "…"


def extract_turn_summary(raw: str) -> tuple[str, str]:
    """从模型输出中拆出 <<<TURN_SUMMARY>>>…<<<END_TURN_SUMMARY>>>，返回 (正文, 摘要)。"""
    s = str(raw or "")
    m = _RE_TURN_SUMMARY.search(s)
    if not m:
        return s.strip(), ""
    inner = (m.group(1) or "").strip()
    body = (s[: m.start()] + s[m.end() :]).strip()
    return body, inner


def _fallback_reply_summary(body_for_user: str, user_query: str) -> str:
    """模型未输出摘要块时，用正文前若干字兜底，保证下一轮仍有记忆。"""
    disc = _CONSULT_DISCLAIMER
    b = (body_for_user or "").strip()
    while b.endswith(disc):
        b = b[: -len(disc)].rstrip()
    b = b.replace("\n", " ").strip()
    if len(b) > 90:
        b = b[:89] + "…"
    q = str(user_query or "").strip().replace("\n", " ")
    if len(q) > 40:
        q = q[:39] + "…"
    if q and b:
        return f"用户：{q}；答复要点：{b}"
    return b or q or ""


def _clip_summary_text(s: str, max_chars: int) -> str:
    t = str(s or "").strip().replace("\n", " ")
    if len(t) <= max_chars:
        return t
    return t[: max_chars - 1] + "…"


def enforce_consult_reply_length(text: str, *, max_body_chars: int = 260) -> str:
    """
    控制老百姓可读篇幅：正文不超过 max_body_chars；末尾固定一行免责（去重后只保留一次）。
    """
    raw = (text or "").strip()
    if not raw:
        return raw
    disc = _CONSULT_DISCLAIMER
    body = raw
    while body.endswith(disc):
        body = body[: -len(disc)].rstrip()
    if disc in body:
        i = body.rfind(disc)
        tail = body[i + len(disc) :].strip()
        if not tail:
            body = body[:i].rstrip()

    body = _truncate_body_to_chars(body.strip(), max_body_chars)
    return f"{body}\n{disc}".strip()


def populate_legal_index_keywords(original_q: str, r: dict, legal_index: dict) -> None:
    """
    界面「法律索引」展示用：优先检索改写中的扩展短词，避免把 keywordArr 里重复的整句当作关键词。
    """
    o = str(original_q or "").strip()
    rw = r.get("rewrite") if isinstance(r.get("rewrite"), dict) else {}
    rewritten = str(rw.get("rewrittenQuery") or "").strip()
    raw_exp = rw.get("expansions")
    expansions = raw_exp if isinstance(raw_exp, list) else []
    tags: list[str] = [str(x).strip() for x in expansions if str(x).strip()]

    seen: set[str] = set()
    out: list[str] = []

    def add(tag: str) -> None:
        tag = str(tag or "").strip()
        if len(tag) < 2:
            return
        if tag == o or tag == rewritten:
            return
        if tag in seen:
            return
        if len(tag) >= max(len(o) - 1, 10) and (o in tag or tag in o):
            return
        seen.add(tag)
        out.append(tag)

    for t in tags:
        add(t)

    if len(out) < 3:
        for p in to_keyword_array(o):
            add(p)
            if len(out) >= 10:
                break

    legal_index["retrieval_keywords"] = out[:10]


def run_workflow(
    user_query: str,
    prior_turn_summaries: list[dict] | None = None,
) -> dict:
    """
    返回：
      reply: 模型主文（已去掉记忆摘要块，可直接展示）
      reply_summary: 本轮回复摘要（供下一轮压缩记忆）
      user_legal_index: 写入用户消息的「法律索引」（改写、关键词等）
      assistant_legal_index: 写入助手消息的索引（含 citations）
      citations: 精确到条的引用字符串列表
      llm_error: 若混元调用失败则为 True
    """
    q = str(user_query or "").strip()
    if not q:
        empty_idx: dict = {"rewritten_query": "", "retrieval_keywords": [], "notes": ""}
        return {
            "reply": "（问题不能为空）",
            "reply_summary": "",
            "user_legal_index": empty_idx,
            "assistant_legal_index": {**empty_idx, "citations": [], "citation_refs": []},
            "citations": [],
            "citation_refs": [],
            "llm_error": False,
        }

    legal_index: dict = {"rewritten_query": "", "retrieval_keywords": [], "notes": ""}
    laws: list = []
    r: dict = {}
    try:
        r = search_by_intent(q, RETRIEVAL_LAW, rewrite=True, rewrite_max_keywords=12)
        laws = r.get("laws") if isinstance(r.get("laws"), list) else []
        rw = r.get("rewrite") if isinstance(r.get("rewrite"), dict) else {}
        legal_index["rewritten_query"] = str(rw.get("rewrittenQuery") or "").strip()
        populate_legal_index_keywords(q, r if isinstance(r, dict) else {}, legal_index)
        n = str(rw.get("notes") or "").strip()
        if n:
            legal_index["notes"] = n
    except Exception as exc:  # noqa: BLE001 — 检索失败仍尝试回答
        legal_index["notes"] = f"retrieval_error: {exc}"

    citations, law_context, citation_refs = build_law_citations_and_context(laws, max_articles=12)
    if not (law_context or "").strip():
        law_context = (
            "（当前未检索到可用法规摘录。请结合法律常识谨慎作答，勿编造具体法条原文。）"
        )

    hist: list[dict] = []
    if isinstance(prior_turn_summaries, list):
        hist = [x for x in prior_turn_summaries if isinstance(x, dict)]
    hist = hist[-5:]
    if hist:
        hist_chunks: list[str] = []
        for i, turn in enumerate(hist, start=1):
            qs = _clip_summary_text(str(turn.get("question_summary") or ""), 120)
            rs = _clip_summary_text(str(turn.get("reply_summary") or ""), 180)
            hist_chunks.append(f"第{i}轮\n问（摘要）：{qs}\n答（摘要）：{rs}")
        hist_block = "\n\n".join(hist_chunks)
    else:
        hist_block = "（无：本轮为会话起始或尚无历史摘要）"

    user_block = (
        f"【前序对话摘要（最多 5 轮，仅用于承接上文；正文不要复述本块全文）】\n{hist_block}\n\n"
        f"【用户原问题】\n{q}\n\n"
        f"【检索用问题改写】\n{legal_index.get('rewritten_query') or q}\n\n"
        f"【供参考的法规条文摘录】\n{law_context}\n\n"
        "【本题输出约束】按系统要求写：**正文 240 字以内、单段为主、尽量不要列表**（必要时列表≤2 条）；"
        "第一句就答能/不能；禁止「情况一/二」与章节目录式小标题；法条最多一处半句；"
        f"最后一行单独写：{_CONSULT_DISCLAIMER}；免责声明后必须输出 {_TURN_SUMMARY_START}…{_TURN_SUMMARY_END} 摘要块；"
        "禁止 emoji 与 # 标题、--- 分割线。"
    )

    llm_error = False
    reply_summary = ""
    try:
        raw_reply = chat_completion(
            [
                {"role": "system", "content": _CONSULT_SYSTEM},
                {"role": "user", "content": user_block},
            ],
            max_tokens=800,
        )
        body, reply_summary = extract_turn_summary(str(raw_reply or ""))
        reply = normalize_consult_reply_text(body) or "（暂无回复内容）"
        reply = enforce_consult_reply_length(reply, max_body_chars=260)
        reply_summary = str(reply_summary or "").strip()
        if not reply_summary:
            reply_summary = _fallback_reply_summary(reply, q)
        reply_summary = _clip_summary_text(reply_summary, 200)
    except Exception as exc:  # noqa: BLE001
        reply = f"（模型错误：{exc}）"
        llm_error = True
        reply_summary = ""

    assistant_legal_index = {**legal_index, "citations": citations, "citation_refs": citation_refs}

    return {
        "reply": reply,
        "reply_summary": reply_summary if not llm_error else "",
        "user_legal_index": legal_index,
        "assistant_legal_index": assistant_legal_index,
        "citations": citations,
        "citation_refs": citation_refs,
        "llm_error": llm_error,
    }
