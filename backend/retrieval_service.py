"""检索服务：按用户问题自动分流到案例检索、法规检索或提示分支。"""

from concurrent.futures import ThreadPoolExecutor
from html import unescape
import json
import re
from typing import Any

from deli_client import search_cases, search_laws
from chat_service import chat_completion


RETRIEVAL_CASE = "case"
RETRIEVAL_LAW = "law"
RETRIEVAL_OTHER = "other"
RETRIEVAL_AUTO = "auto"
RETRIEVAL_MIXED = "mixed"

QUERY_TIPS = (
    "请描述法律相关问题，我会自动判断为案例检索或法规检索。"
    "例如：\"上下班途中交通事故工伤认定案例\"，"
    "或\"工伤保险条例第十四条怎么规定\"。"
)

LAW_PATTERN = re.compile(r"第\s*[一二三四五六七八九十百千零〇\d]+\s*条")

LAW_HINTS = (
    "法条",
    "条文",
    "法律规定",
    "法规",
    "条例",
    "办法",
    "司法解释",
    "适用法律",
    "依据什么法律",
    "法律依据",
)

CASE_HINTS = (
    "案例",
    "判例",
    "判决",
    "裁判",
    "案号",
    "法院",
    "审理",
    "同案",
    "类案",
)

LEGAL_HINTS = (
    "合同",
    "纠纷",
    "赔偿",
    "工伤",
    "劳动",
    "离婚",
    "抚养",
    "继承",
    "侵权",
    "诈骗",
    "刑事",
    "民事",
    "行政",
    "仲裁",
    "诉讼",
    "律师",
    "法律",
    "法条",
    "法规",
)

NON_LEGAL_HINTS = (
    "天气",
    "股票",
    "基金",
    "电影",
    "音乐",
    "菜谱",
    "旅游",
    "编程",
    "代码",
    "翻译",
    "笑话",
)


def to_keyword_array(query: str) -> list[str]:
    q = (query or "").strip()
    if not q:
        return [""]
    parts = re.split(r"[，,。.;；、\s]+", q)
    parts = [p.strip() for p in parts if p.strip()]
    if not parts:
        return [q]
    if q not in parts:
        parts.insert(0, q)
    seen = set()
    out: list[str] = []
    for p in parts:
        if p not in seen:
            out.append(p)
            seen.add(p)
    return out[:5]


def build_case_keyword_array(query: str) -> list[str]:
    """类案检索的轻量关键词策略：优先控制关键词数量，降低上游耗时。"""
    q = str(query or "").strip()
    if not q:
        return [""]

    parts = [p.strip() for p in re.split(r"[，,。.;；、\s]+", q) if p.strip()]
    # 多要素查询时仅保留主句 + 最有信息量的若干词，避免过宽关键词拖慢检索。
    if len(parts) >= 3:
        extra = sorted(set(parts), key=len, reverse=True)[:2]
        out = _dedupe_keep_order([q, *extra])
        return out[:3]

    return to_keyword_array(q)[:3]


def _contains_any(text: str, words: tuple[str, ...]) -> int:
    return sum(1 for w in words if w in text)


def detect_retrieval_type(user_query: str) -> str:
    """基于规则自动识别：案例 / 法规 / 其他。"""
    q = (user_query or "").strip().lower()
    if not q:
        return RETRIEVAL_OTHER

    law_score = _contains_any(q, LAW_HINTS)
    case_score = _contains_any(q, CASE_HINTS)

    if LAW_PATTERN.search(q):
        law_score += 2
    if "法" in q and any(s in q for s in ("第", "条", "款", "项")):
        law_score += 1

    if "案" in q and any(s in q for s in ("案例", "判决", "裁判", "法院")):
        case_score += 1

    if law_score == 0 and case_score == 0:
        if _contains_any(q, NON_LEGAL_HINTS) > 0:
            return RETRIEVAL_OTHER
        if _contains_any(q, LEGAL_HINTS) > 0:
            return RETRIEVAL_CASE
        return RETRIEVAL_OTHER

    return RETRIEVAL_LAW if law_score >= case_score else RETRIEVAL_CASE


def _dedupe_keep_order(items: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for raw in items:
        text = str(raw or "").strip()
        if not text:
            continue
        if text in seen:
            continue
        out.append(text)
        seen.add(text)
    return out


def _extract_json_object(text: str) -> dict:
    """从模型回复中尽量抽取 JSON 对象；失败则返回空 dict。"""
    raw = str(text or "").strip()
    if not raw:
        return {}
    # 常见：模型会用 ```json ... ``` 包裹
    fenced = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", raw, flags=re.IGNORECASE)
    if fenced:
        raw = fenced.group(1).strip()
    try:
        obj = json.loads(raw)
        return obj if isinstance(obj, dict) else {}
    except Exception:
        pass

    # 退化：从首个 { 到末个 } 截取
    start = raw.find("{")
    end = raw.rfind("}")
    if 0 <= start < end:
        snippet = raw[start : end + 1]
        try:
            obj = json.loads(snippet)
            return obj if isinstance(obj, dict) else {}
        except Exception:
            return {}
    return {}


def rewrite_query_with_llm(user_query: str, intent_hint: str) -> dict:
    """
    用 LLM 将用户 query 改写为“更适合检索”的主 query，并生成扩展查询列表。

    返回结构（尽量）：
    {
      "rewritten": str,
      "expansions": [str, ...],
      "notes": str
    }
    """
    q = str(user_query or "").strip()
    if not q:
        return {"rewritten": "", "expansions": [], "notes": ""}

    system = (
        "你是法律检索 Query 改写器。目标：提升召回和准确度。\n"
        "请根据用户问题，输出一个更适合检索的改写查询（rewritten），并给出扩展查询列表（expansions）。\n"
        "要求：\n"
        "- 输出必须是严格 JSON 对象，不要输出多余文字。\n"
        "- rewritten 用中文，尽量包含争议焦点、关键事实要素、请求点、法律关系。\n"
        "- expansions 为 6-10 条短查询（每条 <= 24 字），覆盖同义表述、要素拆分、可能相关法条/制度关键词。\n"
        "- 不要编造具体法条号或虚构事实；可以用制度名/法域词（如“工伤认定”“解除劳动合同”）。\n"
        "- 如果用户明显在问法条/条文解释，expansions 里要包含“第X条”“条文”类表达的替代说法（不强行补具体条号）。\n"
        "- intent_hint 仅供参考（case/law/mixed/other）。\n"
        'JSON schema: {"rewritten":"...", "expansions":["..."], "notes":"..."}'
    )
    user = f"intent_hint={intent_hint}\nuser_query={q}"
    reply = chat_completion(
        [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ]
    )
    obj = _extract_json_object(reply)
    rewritten = str(obj.get("rewritten") or obj.get("query") or obj.get("rewrite") or "").strip()
    expansions = obj.get("expansions") or obj.get("keywords") or obj.get("queries") or []
    if not isinstance(expansions, list):
        expansions = []
    expansions = [str(x or "").strip() for x in expansions]
    expansions = [x for x in expansions if x]
    notes = str(obj.get("notes") or "").strip()
    return {"rewritten": rewritten, "expansions": expansions, "notes": notes}


def build_keyword_arr_for_retrieval(
    *,
    original_query: str,
    rewritten_query: str | None,
    expansions: list[str] | None,
    max_items: int = 12,
) -> list[str]:
    base: list[str] = []
    oq = str(original_query or "").strip()
    rq = str(rewritten_query or "").strip()
    if rq:
        base.append(rq)
    if oq and oq != rq:
        base.append(oq)
    if expansions:
        base.extend([str(x or "").strip() for x in expansions])

    # 同时保留对原始 query 的分词拆分，提升“关键词式”召回
    base.extend(to_keyword_array(oq))
    base.extend(to_keyword_array(rq))

    deduped = _dedupe_keep_order(base)
    return deduped[: max(1, int(max_items or 12))]


def _case_dedupe_key(row: dict) -> str:
    case_no = str(row.get("caseNumber") or row.get("caseNo") or row.get("docNo") or "").strip()
    if case_no:
        return f"caseNo:{case_no}"
    title = str(row.get("title") or row.get("caseName") or row.get("name") or row.get("docTitle") or "").strip()
    court = str(row.get("court") or row.get("courtName") or "").strip()
    date = str(row.get("judgementDate") or row.get("judgementTime") or row.get("date") or "").strip()
    return f"fallback:{title}|{court}|{date}"


def _law_dedupe_key(row: dict) -> str:
    law_id = str(row.get("lawId") or row.get("law_id") or row.get("id") or "").strip()
    highlights = row.get("highlights")
    article_name = ""
    if isinstance(highlights, list) and highlights:
        first = highlights[0] if isinstance(highlights[0], dict) else {}
        article_name = str(first.get("name") or first.get("title") or "").strip()
    article_name = article_name or str(row.get("articleName") or row.get("name") or "").strip()
    if law_id:
        return f"lawId:{law_id}|{article_name}"
    title = str(row.get("title") or row.get("lawTitle") or row.get("lawName") or "").strip()
    text = str(row.get("text") or row.get("content") or row.get("lawContent") or "").strip()
    return f"fallback:{title}|{article_name}|{text[:80]}"


def _merge_unique_rows(rows: list[dict], *, key_fn) -> list[dict]:
    best: dict[str, dict] = {}
    for r in rows:
        if not isinstance(r, dict):
            continue
        k = str(key_fn(r) or "").strip()
        if not k:
            continue
        score = _extract_score(r)
        prev = best.get(k)
        if prev is None or _extract_score(prev) < score:
            best[k] = r
    return list(best.values())


def _fanout_search_cases_by_queries(queries: list[str], *, max_workers: int = 6) -> dict:
    """对多个 query 并行调用得理案例检索，合并去重后返回。"""
    safe_queries = _dedupe_keep_order([str(q or "").strip() for q in queries])
    safe_queries = [q for q in safe_queries if q]
    if not safe_queries:
        return {"fanoutQueries": [], "caseDataFanout": [], "cases": [], "keywordArr": [""]}

    def _one(q: str) -> tuple[str, Any]:
        kw = build_case_keyword_array(q)
        return q, search_cases(kw)

    case_data_fanout: list[dict] = []
    all_rows: list[dict] = []
    with ThreadPoolExecutor(max_workers=max_workers) as ex:
        futures = [ex.submit(_one, q) for q in safe_queries]
        for f in futures:
            q, data = f.result()
            case_data_fanout.append({"query": q, "data": data})
            found = _find_first_list(data)
            if isinstance(found, list):
                all_rows.extend([r for r in found if isinstance(r, dict)])

    merged = _merge_unique_rows(all_rows, key_fn=_case_dedupe_key)
    merged.sort(key=_extract_score, reverse=True)
    return {
        "fanoutQueries": safe_queries,
        "caseDataFanout": case_data_fanout,
        "cases": merged,
        "keywordArr": safe_queries,
    }


def _fanout_search_laws_by_queries(queries: list[str], *, max_workers: int = 6) -> dict:
    """对多个 query 并行调用得理法规检索，合并去重后返回。"""
    safe_queries = _dedupe_keep_order([str(q or "").strip() for q in queries])
    safe_queries = [q for q in safe_queries if q]
    if not safe_queries:
        return {"fanoutQueries": [], "lawDataFanout": [], "laws": [], "keywordArr": [""]}

    def _one(q: str) -> tuple[str, Any]:
        kw = to_keyword_array(q)
        return q, search_laws(kw)

    law_data_fanout: list[dict] = []
    all_rows: list[dict] = []
    with ThreadPoolExecutor(max_workers=max_workers) as ex:
        futures = [ex.submit(_one, q) for q in safe_queries]
        for f in futures:
            q, data = f.result()
            law_data_fanout.append({"query": q, "data": data})
            found = _find_first_list(data)
            if isinstance(found, list):
                all_rows.extend([r for r in found if isinstance(r, dict)])

    merged = _merge_unique_rows(all_rows, key_fn=_law_dedupe_key)
    merged.sort(key=_extract_score, reverse=True)
    return {
        "fanoutQueries": safe_queries,
        "lawDataFanout": law_data_fanout,
        "laws": merged,
        "keywordArr": safe_queries,
    }


def _find_first_list(obj: Any) -> list[dict]:
    if isinstance(obj, list):
        if obj and all(isinstance(x, dict) for x in obj):
            return obj  # type: ignore[return-value]
        for x in obj:
            found = _find_first_list(x)
            if found:
                return found
        return []

    if isinstance(obj, dict):
        for v in obj.values():
            found = _find_first_list(v)
            if found:
                return found
        return []

    return []


def _to_float(value: Any) -> float:
    try:
        return float(value)
    except Exception:
        return 0.0


def _extract_score(row: dict) -> float:
    for key in (
        "correlation",
        "score",
        "similarity",
        "sim",
        "relevance",
        "matchScore",
        "rankScore",
    ):
        if key in row:
            return _to_float(row.get(key))
    return 0.0


def _normalize_case_item(row: dict) -> dict:
    return {
        "type": RETRIEVAL_CASE,
        "score": _extract_score(row),
        "title": row.get("title") or row.get("caseName") or row.get("name") or row.get("docTitle") or "（未命名案例）",
        "subtitle": row.get("court") or row.get("courtName") or "",
        "date": row.get("judgementDate") or row.get("judgementTime") or row.get("date") or "",
        "item": row,
    }


def _normalize_law_item(row: dict) -> dict:
    highlights = row.get("highlights")
    article_name = ""
    if isinstance(highlights, list) and highlights:
        first = highlights[0] if isinstance(highlights[0], dict) else {}
        article_name = first.get("name") or first.get("title") or ""
    article_name = article_name or row.get("articleName") or row.get("name") or ""
    return {
        "type": RETRIEVAL_LAW,
        "score": _extract_score(row),
        "title": row.get("title") or row.get("lawTitle") or row.get("lawName") or "（未命名法规）",
        "subtitle": article_name,
        "date": row.get("publishDate") or row.get("issueDate") or row.get("date") or "",
        "item": row,
    }


def search_similar_cases(user_query: str) -> dict:
    """得理类案检索，返回原始数据与解析出的案例列表。"""
    keyword_arr = build_case_keyword_array(user_query)
    case_data = search_cases(keyword_arr)
    cases = _find_first_list(case_data)
    return {
        "keywordArr": keyword_arr,
        "caseData": case_data,
        "cases": cases,
    }


def search_law_articles(user_query: str) -> dict:
    """得理法规检索，返回原始数据与解析出的法规列表。"""
    keyword_arr = to_keyword_array(user_query)
    law_data = search_laws(keyword_arr)
    laws = _find_first_list(law_data)
    return {
        "keywordArr": keyword_arr,
        "lawData": law_data,
        "laws": laws,
    }


def normalize_retrieval_type(value: str | None) -> str:
    v = str(value or "").strip().lower()
    if v in (RETRIEVAL_CASE, RETRIEVAL_LAW, RETRIEVAL_OTHER, RETRIEVAL_AUTO, RETRIEVAL_MIXED):
        return v
    return RETRIEVAL_AUTO


def is_strong_law_query(user_query: str) -> bool:
    """明显法条查询：优先法规检索，避免混合结果干扰。"""
    q = str(user_query or "").strip().lower()
    if not q:
        return False

    # 例如：劳动法第3条、工伤保险条例第十四条、第3条怎么规定
    if LAW_PATTERN.search(q):
        if any(k in q for k in ("法", "条例", "规定", "条文", "司法解释", "办法")):
            return True

    # 明确“第X条” + “怎么规定/是什么”类问法
    if LAW_PATTERN.search(q) and any(k in q for k in ("怎么", "如何", "是什么", "规定", "含义", "解释")):
        return True

    return False


def should_skip_rewrite_for_speed(user_query: str, retrieval_type: str) -> bool:
    """短且宽泛查询跳过改写，避免 LLM+fanout 放大请求时延。"""
    q = str(user_query or "").strip().lower()
    if not q:
        return True

    token_count = len([t for t in re.split(r"[，,。.;；、\s]+", q) if t.strip()])
    has_case_hint = _contains_any(q, CASE_HINTS) > 0
    has_law_hint = _contains_any(q, LAW_HINTS) > 0

    # 如“劳动法”“合同法”这类短词，改写收益低但会显著增加耗时。
    if len(q) <= 6 and token_count <= 2 and not has_case_hint and has_law_hint:
        return True

    # case 检索仅在“多要素长查询”才启用改写，避免宽泛词/短句触发慢路径。
    if retrieval_type == RETRIEVAL_CASE and (len(q) < 12 or token_count < 3):
        return True

    return False


def _cn_number_to_int(text: str) -> int | None:
    s = str(text or "").strip()
    if not s:
        return None
    if s.isdigit():
        return int(s)

    m = {"零": 0, "〇": 0, "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9}
    if s == "十":
        return 10
    if "十" in s:
        parts = s.split("十", 1)
        left = parts[0]
        right = parts[1]
        left_v = 1 if left == "" else m.get(left)
        right_v = 0 if right == "" else m.get(right)
        if left_v is None or right_v is None:
            return None
        return left_v * 10 + right_v

    if all(ch in m for ch in s):
        n = 0
        for ch in s:
            n = n * 10 + m[ch]
        return n
    return None


def _extract_article_no(text: str) -> int | None:
    raw = str(text or "")
    m = re.search(r"第\s*([一二三四五六七八九十零〇\d]+)\s*条", raw)
    if not m:
        return None
    return _cn_number_to_int(m.group(1))


def normalize_strong_law_query(user_query: str) -> str:
    """将强法条问句规整为检索友好的短查询（如“劳动法第3条是什么”->“劳动法第3条”）。"""
    q = str(user_query or "").strip()
    if not q:
        return q

    # 去掉常见问句尾巴，保留“法律名 + 第X条”核心结构。
    q = re.sub(r"(是|为)?\s*什么(意思|内容)?\s*[？?。!！]*$", "", q)
    q = re.sub(r"(怎?么|如何)\s*(规定|理解|解释)?\s*[？?。!！]*$", "", q)
    q = re.sub(r"(有何|有什么)?\s*(规定|要求|依据)?\s*[？?。!！]*$", "", q)
    q = re.sub(r"(吗|呢)\s*[？?。!！]*$", "", q)
    q = re.sub(r"\s+", "", q)
    return q.strip()


def extract_strong_law_rows(laws: list[Any], query: str) -> list[dict]:
    """强法条查询时，从 highlights 抽取条文级结果，优先命中 query 指定条号。"""
    target_no = _extract_article_no(query)
    picked: list[dict] = []
    fallback: list[dict] = []

    for law in laws if isinstance(laws, list) else []:
        if not isinstance(law, dict):
            continue
        highlights = law.get("highlights")
        if not isinstance(highlights, list) or not highlights:
            continue

        for h in highlights:
            if not isinstance(h, dict):
                continue
            name = str(h.get("name") or h.get("title") or "").strip()
            if not is_article_level_name(name):
                continue

            row = dict(law)
            row["articleName"] = name
            row["name"] = name
            row["text"] = str(h.get("text") or "")
            row["highlights"] = [{"name": name, "text": row["text"]}]

            if target_no is not None:
                n = _extract_article_no(name)
                if n is not None and n == target_no:
                    picked.append(row)
                else:
                    fallback.append(row)
            else:
                fallback.append(row)

    if picked:
        return picked
    return fallback[:10]


def resolve_auto_retrieval_type(user_query: str) -> str:
    """
    auto 模式下的分流策略：
    - 明确法条问法（如“第X条”“法律规定”）优先走法规检索；
    - 同时有案例与法条线索时走混合检索；
    - 其余回落到原有 detect_retrieval_type。
    """
    q = str(user_query or "").strip().lower()
    if not q:
        return RETRIEVAL_OTHER

    law_score = _contains_any(q, LAW_HINTS)
    case_score = _contains_any(q, CASE_HINTS)
    if LAW_PATTERN.search(q):
        law_score += 2

    # 法条意图足够强时，直接法规检索
    if law_score >= 2 and case_score == 0:
        return RETRIEVAL_LAW

    # 仅案例意图
    if case_score >= 2 and law_score == 0:
        return RETRIEVAL_CASE

    # 两类线索都明显，才走混合
    if law_score > 0 and case_score > 0:
        return RETRIEVAL_MIXED

    return detect_retrieval_type(q)


def search_by_intent(
    user_query: str,
    retrieval_type_override: str | None = None,
    *,
    rewrite: bool = False,
    rewrite_max_keywords: int = 12,
) -> dict:
    normalized_override = normalize_retrieval_type(retrieval_type_override)
    original_query = str(user_query or "").strip()
    if normalized_override not in ("", RETRIEVAL_AUTO):
        retrieval_type = normalized_override
    else:
        retrieval_type = resolve_auto_retrieval_type(original_query)

    strong_law_query = is_strong_law_query(original_query)

    # auto / mixed 下，明显法条查询强制走法规检索。
    if normalized_override in ("", RETRIEVAL_AUTO, RETRIEVAL_MIXED) and strong_law_query:
        retrieval_type = RETRIEVAL_LAW

    rewritten_query = ""
    rewrite_expansions: list[str] = []
    rewrite_notes = ""
    keyword_arr_override: list[str] | None = None
    fanout_queries: list[str] = []
    rewrite_applied = False

    if rewrite and original_query and not strong_law_query and not should_skip_rewrite_for_speed(original_query, retrieval_type):
        try:
            rewrite_obj = rewrite_query_with_llm(original_query, retrieval_type)
            rewritten_query = str(rewrite_obj.get("rewritten") or "").strip()
            rewrite_expansions = rewrite_obj.get("expansions") or []
            if not isinstance(rewrite_expansions, list):
                rewrite_expansions = []
            rewrite_expansions = [str(x or "").strip() for x in rewrite_expansions if str(x or "").strip()]
            rewrite_notes = str(rewrite_obj.get("notes") or "").strip()
            keyword_arr_override = build_keyword_arr_for_retrieval(
                original_query=original_query,
                rewritten_query=rewritten_query or None,
                expansions=rewrite_expansions,
                max_items=rewrite_max_keywords,
            )
            # 用于“并行检索并集”的 query 列表：主 query + 扩展 query（不再把扩展只当 keywordArr）
            fanout_queries = _dedupe_keep_order(
                [rewritten_query or original_query, original_query, *rewrite_expansions]
            )
            # 控制上游调用成本（每个 query 一次上游请求）
            fanout_queries = [q for q in fanout_queries if q][:4]
            rewrite_applied = bool(rewritten_query or rewrite_expansions)
        except Exception as exc:
            rewrite_notes = f"rewrite_failed: {exc}"
            keyword_arr_override = None

    if retrieval_type == RETRIEVAL_CASE:
        query_to_use = rewritten_query or original_query
        # rewrite 开启且生成了 expansions 时：走 fanout 并集（并行多次检索 + 去重合并）
        if rewrite and fanout_queries:
            fan = _fanout_search_cases_by_queries(fanout_queries, max_workers=min(6, len(fanout_queries)))
            result = {
                "keywordArr": fan.get("keywordArr", []),
                "caseData": fan.get("caseDataFanout", []),
                "cases": fan.get("cases", []),
            }
        else:
            result = search_similar_cases(query_to_use)
            if keyword_arr_override is not None:
                # 兼容：仍可用“加长 keywordArr”做一次检索
                result["keywordArr"] = keyword_arr_override
                result["caseData"] = search_cases(keyword_arr_override)
                result["cases"] = _find_first_list(result["caseData"])
        result["retrievalType"] = RETRIEVAL_CASE
        result["results"] = [_normalize_case_item(r) for r in (result.get("cases") or []) if isinstance(r, dict)]
        result["rewrite"] = {
            "enabled": bool(rewrite and rewrite_applied),
            "originalQuery": original_query,
            "rewrittenQuery": rewritten_query,
            "expansions": rewrite_expansions,
            "notes": rewrite_notes,
        }
        return result

    if retrieval_type == RETRIEVAL_LAW:
        query_to_use = original_query if strong_law_query else (rewritten_query or original_query)
        if strong_law_query:
            # 强法条查询不走改写并集，避免被泛化词带偏。
            strict_query = normalize_strong_law_query(query_to_use)
            result = search_law_articles(strict_query or query_to_use)
            strong_rows = extract_strong_law_rows(result.get("laws", []), query_to_use)
            if not strong_rows and strict_query and strict_query != query_to_use:
                # 上游对“问句式”关键词召回较差时，回退到规整关键词重试一次。
                result = search_law_articles(strict_query)
                strong_rows = extract_strong_law_rows(result.get("laws", []), strict_query)
            if strong_rows:
                result["laws"] = strong_rows
        elif rewrite and fanout_queries:
            fan = _fanout_search_laws_by_queries(fanout_queries, max_workers=min(6, len(fanout_queries)))
            result = {
                "keywordArr": fan.get("keywordArr", []),
                "lawData": fan.get("lawDataFanout", []),
                "laws": fan.get("laws", []),
            }
        else:
            result = search_law_articles(query_to_use)
            if keyword_arr_override is not None:
                result["keywordArr"] = keyword_arr_override
                result["lawData"] = search_laws(keyword_arr_override)
                result["laws"] = _find_first_list(result["lawData"])
        result["retrievalType"] = RETRIEVAL_LAW
        result["results"] = [_normalize_law_item(r) for r in (result.get("laws") or []) if isinstance(r, dict)]
        result["rewrite"] = {
            "enabled": bool(rewrite and rewrite_applied),
            "originalQuery": original_query,
            "rewrittenQuery": rewritten_query,
            "expansions": rewrite_expansions,
            "notes": rewrite_notes,
        }
        return result

    if retrieval_type == RETRIEVAL_MIXED:
        query_to_use = rewritten_query or original_query
        if rewrite and fanout_queries:
            # mixed + rewrite：分别对案例/法规做 fanout 并集（并行），再混排
            with ThreadPoolExecutor(max_workers=2) as ex:
                fc = ex.submit(
                    _fanout_search_cases_by_queries,
                    fanout_queries,
                    max_workers=min(6, len(fanout_queries)),
                )
                fl = ex.submit(
                    _fanout_search_laws_by_queries,
                    fanout_queries,
                    max_workers=min(6, len(fanout_queries)),
                )
                fan_case = fc.result()
                fan_law = fl.result()
            case_result = {
                "keywordArr": fan_case.get("keywordArr", []),
                "caseData": fan_case.get("caseDataFanout", []),
                "cases": fan_case.get("cases", []),
            }
            law_result = {
                "keywordArr": fan_law.get("keywordArr", []),
                "lawData": fan_law.get("lawDataFanout", []),
                "laws": fan_law.get("laws", []),
            }
        else:
            with ThreadPoolExecutor(max_workers=2) as ex:
                future_cases = ex.submit(search_similar_cases, query_to_use)
                future_laws = ex.submit(search_law_articles, query_to_use)
                case_result = future_cases.result()
                law_result = future_laws.result()

            if keyword_arr_override is not None:
                # 兼容：仍可用“加长 keywordArr”做两次检索
                case_result["keywordArr"] = keyword_arr_override
                case_result["caseData"] = search_cases(keyword_arr_override)
                case_result["cases"] = _find_first_list(case_result["caseData"])
                law_result["keywordArr"] = keyword_arr_override
                law_result["lawData"] = search_laws(keyword_arr_override)
                law_result["laws"] = _find_first_list(law_result["lawData"])

        cases = case_result.get("cases", [])
        laws = law_result.get("laws", [])
        mixed_rows = []
        if isinstance(cases, list):
            mixed_rows.extend(_normalize_case_item(r) for r in cases if isinstance(r, dict))
        if isinstance(laws, list):
            mixed_rows.extend(_normalize_law_item(r) for r in laws if isinstance(r, dict))

        mixed_terms = [t for t in to_keyword_array(query_to_use) if len(str(t or "").strip()) >= 2][:10]

        def _mixed_relevance(row: dict) -> tuple[float, float]:
            # 主排序：与查询词的文本相关性；次排序：上游相似度 score
            base_score = _to_float(row.get("score"))
            title = str(row.get("title") or "")
            subtitle = str(row.get("subtitle") or "")
            item = row.get("item") if isinstance(row.get("item"), dict) else {}
            detail_blob = " ".join(
                str(item.get(k) or "")
                for k in (
                    "title",
                    "caseName",
                    "name",
                    "docTitle",
                    "articleName",
                    "text",
                    "content",
                    "summary",
                )
            )
            head = f"{title} {subtitle}".strip()

            rel = 0.0
            for term in mixed_terms:
                term = str(term or "").strip()
                if not term:
                    continue
                if term in head:
                    rel += 4.0
                elif term in detail_blob:
                    rel += 1.5

            # 让上游 score 参与但不主导，避免“类型拼接顺序”影响前排。
            final_rel = rel + base_score * 0.1
            return final_rel, base_score

        mixed_rows.sort(key=_mixed_relevance, reverse=True)

        return {
            "retrievalType": RETRIEVAL_MIXED,
            "keywordArr": case_result.get("keywordArr", []) or law_result.get("keywordArr", []),
            "cases": cases if isinstance(cases, list) else [],
            "laws": laws if isinstance(laws, list) else [],
            "caseData": case_result.get("caseData", {}),
            "lawData": law_result.get("lawData", {}),
            "results": mixed_rows,
            "rewrite": {
                "enabled": bool(rewrite and rewrite_applied),
                "originalQuery": original_query,
                "rewrittenQuery": rewritten_query,
                "expansions": rewrite_expansions,
                "notes": rewrite_notes,
            },
        }

    return {
        "retrievalType": RETRIEVAL_OTHER,
        "keywordArr": to_keyword_array(user_query),
        "cases": [],
        "laws": [],
        "caseData": {},
        "lawData": {},
        "results": [],
        "queryTips": QUERY_TIPS,
        "rewrite": {
            "enabled": bool(rewrite and rewrite_applied),
            "originalQuery": original_query,
            "rewrittenQuery": rewritten_query,
            "expansions": rewrite_expansions,
            "notes": rewrite_notes,
        },
    }


_JUNK_ARTICLE_NAMES = frozenset(
    {
        "法律",
        "行政法规",
        "部门规章",
        "地方性法规",
        "司法解释",
        "规章",
        "相关条文",
        "法规内容",
    }
)


_HTML_TAG_RE = re.compile(r"<[^>]+>")
_STRICT_ARTICLE_NAME_RE = re.compile(
    r"^第\s*[一二三四五六七八九十百千零〇\d]+\s*条(?:\s*之\s*[一二三四五六七八九十百千零〇\d]+)?(?:\s*第\s*[一二三四五六七八九十百千零〇\d]+\s*款)?(?:\s*第\s*[一二三四五六七八九十百千零〇\d]+\s*项)?$"
)


def _plain_text_from_htmlish(value: Any) -> str:
    """
    将检索结果里的高亮 HTML/转义标签去掉，只保留纯文本。
    例如：<em>第1</em>号、&lt;em&gt;第1&lt;/em&gt;号 -> 第1号
    """
    text = unescape(str(value or ""))
    if not text:
        return ""
    text = _HTML_TAG_RE.sub("", text)
    text = text.replace("\xa0", " ")
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def clean_law_title_for_citation(title: str) -> str:
    """去掉法规名尾部泛称（如「…》法律」），便于与具体条号组合展示。"""
    t = _plain_text_from_htmlish(title)
    if not t:
        return "（未命名法规）"
    t = re.sub(
        r"[（(](?:法律|行政法规|部门规章|地方性法规|司法解释|规章)[)）]\s*$",
        "",
        t,
    )
    t = re.sub(r"(?:法律|行政法规|部门规章|司法解释|规章)\s*$", "", t).strip()
    return t or "（未命名法规）"


def is_article_level_name(name: str) -> bool:
    """是否为「第×条」级别的条文名（排除仅有「法律」等泛称）。"""
    n = _plain_text_from_htmlish(name)
    if not n or n in _JUNK_ARTICLE_NAMES:
        return False
    return bool(_STRICT_ARTICLE_NAME_RE.match(n))


def format_law_article_citation(law_title: str, article_name: str) -> str:
    """将法规名 + 条名格式化为「《…》第×条」形式的引用标题。"""
    t = clean_law_title_for_citation(law_title)
    an = _plain_text_from_htmlish(article_name)
    if not an or an in _JUNK_ARTICLE_NAMES or an in ("法规内容", "相关条文"):
        return f"《{t}》"
    return f"《{t}》{an}"


def expand_law_search_rows(laws: list[Any]) -> list[dict[str, str]]:
    """将得理法规检索的 law 行展开为若干「法规—条文」条目（与前端 extractLawRows 对齐）。"""
    rows: list[dict[str, str]] = []
    if not isinstance(laws, list):
        return rows
    for law in laws:
        if not isinstance(law, dict):
            continue
        title = _plain_text_from_htmlish(
            law.get("title") or law.get("lawTitle") or law.get("lawName") or law.get("name") or ""
        ).strip() or "（未命名法规）"
        law_id = str(
            law.get("lawId")
            or law.get("law_id")
            or law.get("id")
            or law.get("uuid")
            or law.get("lawUuid")
            or law.get("docId")
            or ""
        ).strip()
        highlights = law.get("highlights")
        if isinstance(highlights, list) and highlights:
            law_text_fallback = _plain_text_from_htmlish(
                law.get("text")
                or law.get("content")
                or law.get("lawContent")
                or law.get("summary")
                or law.get("abstract")
                or law.get("articleText")
                or law.get("fullText")
                or ""
            )
            for h in highlights:
                if not isinstance(h, dict):
                    continue
                name = (
                    _plain_text_from_htmlish(h.get("name"))
                    or _plain_text_from_htmlish(law.get("articleName") or law.get("name") or "")
                    or "相关条文"
                )
                text = _plain_text_from_htmlish(h.get("text")) or law_text_fallback
                hid = str(
                    h.get("lawId")
                    or h.get("law_id")
                    or h.get("id")
                    or h.get("lawID")
                    or law_id
                    or ""
                ).strip()
                rows.append(
                    {"title": title, "article_name": name, "text": text, "law_id": hid}
                )
            continue
        text = _plain_text_from_htmlish(
            law.get("text")
            or law.get("content")
            or law.get("lawContent")
            or law.get("summary")
            or law.get("abstract")
            or law.get("articleText")
            or law.get("fullText")
            or ""
        )
        name = _plain_text_from_htmlish(
            law.get("name") or law.get("articleName") or law.get("levelName") or ""
        ).strip() or "法规内容"
        rows.append({"title": title, "article_name": name, "text": text, "law_id": law_id})
    return rows


def build_law_citations_and_context(
    laws: list[Any],
    *,
    user_query: str = "",
    max_articles: int = 8,
    max_chars_per_article: int = 2000,
) -> tuple[list[str], str, list[dict[str, Any]]]:
    """
    从法规检索结果生成：
    - citations：展示用短标签（有条号则精确到条；否则为摘录标题）
    - context：供模型阅读的摘录正文
    - citation_refs：供前端点击查原文（law_id + excerpt）
    """
    expanded = expand_law_search_rows(laws if isinstance(laws, list) else [])
    cap = max(1, int(max_articles))
    # 只保留“条级命中 + 有法规ID + 有正文”的条目，避免将摘要/标题误当法条。
    article_rows = [
        e
        for e in expanded
        if is_article_level_name(e.get("article_name") or "")
        and str(e.get("law_id") or "").strip()
        and _plain_text_from_htmlish(e.get("text") or "")
    ]

    def _query_terms(query: str) -> list[str]:
        terms = [str(x or "").strip() for x in to_keyword_array(query or "")]
        terms = [t for t in terms if len(t) >= 2]
        # 先保留更长词，避免短词噪声；并限制数量防止过拟合。
        terms = sorted(set(terms), key=len, reverse=True)
        return terms[:8]

    query_terms = _query_terms(user_query)

    def _relevance_score(entry: dict[str, Any], idx: int) -> int:
        title = _plain_text_from_htmlish(entry.get("title") or "")
        name = _plain_text_from_htmlish(entry.get("article_name") or "")
        text = _plain_text_from_htmlish(entry.get("text") or "")
        head = f"{title} {name}"

        # 基础分：检索原顺序越靠前权重越高
        score = max(0, 20 - idx)
        for t in query_terms:
            if t in head:
                score += 20
            elif t in text:
                score += 6
        return score

    scored_rows = [(entry, _relevance_score(entry, i)) for i, entry in enumerate(article_rows)]
    ranked_rows = [e for e, _ in sorted(scored_rows, key=lambda x: x[1], reverse=True)]

    # 先取高相关条文；若不足 cap，用严格条文的相关排序补足。
    high_rows = [e for e, s in scored_rows if s >= 20]
    selected_rows: list[dict[str, Any]] = []
    selected_rows.extend(high_rows[:cap])

    if len(selected_rows) < cap:
        for e in ranked_rows:
            if e in selected_rows:
                continue
            selected_rows.append(e)
            if len(selected_rows) >= cap:
                break

    # 严格条文仍不足时，降级到“有正文的法规摘录”补足，避免页面经常出现 0 条。
    if len(selected_rows) < cap:
        relaxed_rows = [
            e
            for e in expanded
            if _plain_text_from_htmlish(e.get("text") or "")
            and _plain_text_from_htmlish(e.get("title") or "")
            and _plain_text_from_htmlish(e.get("article_name") or "") not in _JUNK_ARTICLE_NAMES
        ]
        relaxed_scored = [
            (entry, _relevance_score(entry, i)) for i, entry in enumerate(relaxed_rows)
        ]
        for e, _ in sorted(relaxed_scored, key=lambda x: x[1], reverse=True):
            if e in selected_rows:
                continue
            selected_rows.append(e)
            if len(selected_rows) >= cap:
                break

    # 上游有时只返回法规标题 + ID（无 highlights/无正文）。
    # 这时再降级为“标题级引用”，保证前端仍能展示可点击的法规列表。
    if len(selected_rows) < cap:
        title_only_rows: list[dict[str, Any]] = []
        for law in laws if isinstance(laws, list) else []:
            if not isinstance(law, dict):
                continue
            title = _plain_text_from_htmlish(
                law.get("title") or law.get("lawTitle") or law.get("lawName") or law.get("name") or ""
            ).strip()
            if not title:
                continue
            law_id = str(
                law.get("lawId")
                or law.get("law_id")
                or law.get("id")
                or law.get("uuid")
                or law.get("lawUuid")
                or law.get("docId")
                or ""
            ).strip()
            if not law_id:
                continue
            level = _plain_text_from_htmlish(law.get("levelName") or "")
            title_only_rows.append(
                {
                    "title": title,
                    "article_name": level or "法规内容",
                    "text": "",
                    "law_id": law_id,
                }
            )

        for e in title_only_rows:
            if e in selected_rows:
                continue
            selected_rows.append(e)
            if len(selected_rows) >= cap:
                break

    citation_refs: list[dict[str, Any]] = []
    seen_labels: set[str] = set()
    parts: list[str] = []
    clip = max(1, int(max_chars_per_article))

    for entry in selected_rows:
        raw_title = _plain_text_from_htmlish(entry.get("title"))
        title = clean_law_title_for_citation(raw_title)
        name = _plain_text_from_htmlish(entry.get("article_name"))
        text = _plain_text_from_htmlish(entry.get("text"))
        law_id = str(entry.get("law_id") or "").strip()

        label = format_law_article_citation(title, name)
        excerpt = text[:clip] if text else ""
        is_article = True

        if label in seen_labels:
            continue
        seen_labels.add(label)

        citation_refs.append(
            {
                "label": label,
                "law_id": law_id,
                "excerpt": excerpt,
                "is_article": is_article,
            }
        )

        idx = len(citation_refs)
        body = excerpt if excerpt else ("（条文正文略或未返回）" if is_article else "（无检索片段正文）")
        parts.append(f"【{idx}】{label}\n{body}")

        if len(citation_refs) >= cap:
            break

    citations = [r["label"] for r in citation_refs]
    return citations, "\n\n".join(parts), citation_refs
