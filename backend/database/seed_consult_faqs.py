import json
from pathlib import Path

from .connection import get_connection


SEED_FILE = Path(__file__).resolve().parent / "consult_faqs.seed.json"
# 去敏感化后的咨询案例（与仓库 assets 同源），导入为常见问题解答
LEGAL_CASES_FILE = (
    Path(__file__).resolve().parents[2] / "assets" / "data" / "legal-consult-12348-sample100.json"
)


def load_seed_items() -> list[dict]:
    raw = SEED_FILE.read_text(encoding="utf-8")
    data = json.loads(raw)
    if not isinstance(data, list):
        raise ValueError("Seed JSON must be a list.")
    return data


def _answer_summary_from_detail(detail: str, max_len: int = 200) -> str:
    """从长回答中生成列表用的短摘要，满足 consult_faqs.answer 非空约束。"""
    t = str(detail or "").strip()
    if not t:
        return "详见回答详情。"
    cut = t.find("。")
    if 12 <= cut <= max_len:
        return t[: cut + 1].strip()
    if cut > max_len:
        return t[:max_len].rstrip() + "…"
    if len(t) <= max_len:
        return t
    return t[:max_len].rstrip() + "…"


def load_legal_case_seed_items() -> list[dict]:
    """读取 assets/data 下中文键名的案例 JSON，转为 consult_faqs 种子行。"""
    if not LEGAL_CASES_FILE.is_file():
        return []
    raw = LEGAL_CASES_FILE.read_text(encoding="utf-8")
    data = json.loads(raw)
    if not isinstance(data, list):
        return []
    out: list[dict] = []
    for row in data:
        if not isinstance(row, dict):
            continue
        title = str(row.get("问题标题") or row.get("query") or "").strip()
        qd = str(row.get("问题详情") or row.get("query_detail") or "").strip()
        ad = str(row.get("回复详情") or row.get("answer_detail") or "").strip()
        if not title or not ad:
            continue
        ans = str(row.get("answer") or "").strip() or _answer_summary_from_detail(ad)
        out.append(
            {
                "query": title,
                "query_detail": qd,
                "answer": ans,
                "answer_detail": ad,
            }
        )
    return out


def upsert_seed_items(items: list[dict]) -> tuple[int, int]:
    conn = get_connection()
    cur = conn.cursor()
    inserted = 0
    updated = 0
    try:
        for idx, item in enumerate(items, start=1):
            query = str(item.get("query") or "").strip()
            query_detail = str(item.get("query_detail") or "").strip()
            answer = str(item.get("answer") or "").strip()
            answer_detail = str(item.get("answer_detail") or "").strip()
            if not query or not answer:
                continue

            raw_sort = item.get("sort_order")
            if raw_sort is not None and str(raw_sort).strip() != "":
                try:
                    sort_order = int(raw_sort)
                except (TypeError, ValueError):
                    sort_order = idx * 10
            else:
                sort_order = idx * 10

            cur.execute(
                "SELECT faq_id FROM consult_faqs WHERE query = ? LIMIT 1",
                (query,),
            )
            row = cur.fetchone()
            if row:
                cur.execute(
                    """
                    UPDATE consult_faqs
                    SET query_detail = ?,
                        answer = ?,
                        answer_detail = ?,
                        sort_order = ?,
                        is_active = 1,
                        updated_at = datetime('now', 'localtime')
                    WHERE faq_id = ?
                    """,
                    (query_detail, answer, answer_detail, sort_order, row["faq_id"]),
                )
                updated += 1
            else:
                cur.execute(
                    """
                    INSERT INTO consult_faqs (
                        query, query_detail, answer, answer_detail, sort_order, is_active
                    ) VALUES (?, ?, ?, ?, ?, 1)
                    """,
                    (query, query_detail, answer, answer_detail, sort_order),
                )
                inserted += 1
        conn.commit()
    finally:
        cur.close()
        conn.close()
    return inserted, updated


def main() -> None:
    base = load_seed_items()
    cases = load_legal_case_seed_items()
    merged = base + cases
    inserted, updated = upsert_seed_items(merged)
    print(
        f"consult_faqs seeded. inserted={inserted}, updated={updated}, "
        f"total_input={len(merged)} (base={len(base)}, cases={len(cases)})"
    )


if __name__ == "__main__":
    main()
