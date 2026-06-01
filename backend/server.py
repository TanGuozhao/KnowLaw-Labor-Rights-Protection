import base64
import json
import logging
import mimetypes
import re
import sqlite3
import time
import uuid
from pathlib import Path
from urllib.parse import quote

import requests
from flask import Flask, Response, jsonify, request, send_file, send_from_directory

from chat_service import chat_completion
from workflow import run_workflow
from retrieval_service import search_by_intent
from deli_client import get_law_info
from database import get_connection, initialize_database
from auth_common import bearer_token, hash_password, resolve_user_id_from_token
from case_common import (
    ensure_applicant_character,
    case_owned,
    evidence_owned_and_path,
    evidence_revision_file_owned,
)
from evidence_common import (
    allowed_evidence_attachment,
    allowed_evidence_image,
    resolve_file_abs_path,
)
from evidence_file_llm import analyze_evidence_document
from evidence_file_llm.text_extract import extract_text_from_bytes
from evidence_packaging import build_case_evidence_csv_rows, build_case_evidence_zip_bytes
from evidence_service import (
    archive_superseded_file_for_revision,
    compute_material_completeness,
    infer_evidence_type,
    save_evidence_bytes,
)
from tencent_ocr import extract_detections, recognize_base64
from document_writing import register_document_writing_routes

logger = logging.getLogger(__name__)

app = Flask(__name__)
# 证据附件（含 PDF/Office）体积通常较大，提升上传上限到 50MB。
app.config["MAX_CONTENT_LENGTH"] = 50 * 1024 * 1024
WEB_ROOT = Path(__file__).resolve().parent.parent
BACKEND_ROOT = Path(__file__).resolve().parent
EVIDENCE_UPLOAD_ROOT = BACKEND_ROOT / "uploads" / "evidence"
# Vite 生产构建（frontend 目录下 npm run build）；存在时站点走 React SPA。
FRONTEND_DIST = WEB_ROOT / "frontend" / "dist"
FRONTEND_ROOT = WEB_ROOT / "frontend"
FRONTEND_PUBLIC = FRONTEND_ROOT / "public"


def _frontend_dist_ready() -> bool:
    return (FRONTEND_DIST / "index.html").is_file()

# 中国法律服务网（12348）移动端公开咨询接口
_PUBLIC_CONSULTS_BASE = "https://www.12348.gov.cn/sfbMobile/"
_PUBLIC_CONSULTS_LIST_URL = _PUBLIC_CONSULTS_BASE + "consult/anonymous/consults"
_PUBLIC_CONSULTS_DETAIL_URL = _PUBLIC_CONSULTS_BASE + "consult/consultRepliesAndCommentsForLyjx"
_public_consults_cache: dict[str, tuple[float, dict]] = {}
_PUBLIC_CONSULTS_CACHE_TTL_SEC = 300

register_document_writing_routes(
    app,
    chat_completion=chat_completion,
    resolve_user_id_from_token=resolve_user_id_from_token,
)

def _allowed_evidence_image(filename: str, content_type: str) -> bool:
    return allowed_evidence_image(filename, content_type)


def _allowed_evidence_attachment(filename: str, content_type: str) -> bool:
    return allowed_evidence_attachment(filename, content_type)


def _ensure_applicant_character(conn, user_id: int) -> str:
    return ensure_applicant_character(conn, user_id)


def _case_owned(cur, case_id: str, user_id: int) -> bool:
    return case_owned(cur, case_id, user_id)


def _evidence_owned_and_path(cur, evidence_id: str, user_id: int) -> tuple[bool, str | None]:
    return evidence_owned_and_path(cur, evidence_id, user_id)


def _resolve_file_abs_path(file_path: str) -> Path:
    return resolve_file_abs_path(BACKEND_ROOT, file_path)


def _safe_export_filename_stub(case_title: str) -> str:
    s = re.sub(r'[\s<>:"/\\|?*]+', "_", (case_title or "").strip())
    s = re.sub(r"_+", "_", s).strip("._") or "case"
    return s[:48]


def _fetch_case_evidence_export_bundle(cur, case_id: str, user_id: int):
    if not _case_owned(cur, case_id, user_id):
        return None
    cur.execute(
        "SELECT title, reason FROM cases WHERE case_id = ? LIMIT 1",
        (case_id,),
    )
    crow = cur.fetchone()
    if not crow:
        return None
    title = str(crow["title"] or crow["reason"] or "维权案件").strip() or "维权案件"
    cur.execute(
        """
        SELECT e.evidence_id, e.name, e.description, e.evidence_type, e.source,
               e.submitter, e.submission_date, e.related_case_id,
               e.related_location, e.related_time, e.current_status, e.note,
               e.ocr_text,
               COALESCE(
                   (
                       SELECT ef.file_path
                       FROM evidence_files ef
                       WHERE ef.evidence_id = e.evidence_id
                       ORDER BY ef.is_primary DESC, ef.uploaded_at DESC
                       LIMIT 1
                   ),
                   e.file_path
               ) AS file_path,
               (SELECT COUNT(1) FROM evidence_revisions r WHERE r.evidence_id = e.evidence_id)
                   AS revision_count
        FROM evidence e
        WHERE e.related_case_id = ?
        ORDER BY e.submission_date DESC, e.evidence_id DESC
        """,
        (case_id,),
    )
    evidence_rows = cur.fetchall()
    cur.execute(
        """
        SELECT r.revision_id, r.evidence_id, r.archived_at, r.change_kind,
               r.superseded_file_path, r.snapshot_json, e.name AS evidence_name
        FROM evidence_revisions r
        JOIN evidence e ON e.evidence_id = r.evidence_id
        WHERE r.case_id = ?
        ORDER BY r.archived_at ASC
        """,
        (case_id,),
    )
    revision_pack = []
    for row in cur.fetchall():
        meta_summary = ""
        if row["change_kind"] == "metadata" and row["snapshot_json"]:
            try:
                o = json.loads(row["snapshot_json"])
                keys = list(o.keys())[:10]
                meta_summary = "; ".join(
                    f"{k}={o[k]}" for k in keys if o.get(k) not in (None, "")
                )
            except json.JSONDecodeError:
                meta_summary = str(row["snapshot_json"])[:500]
        revision_pack.append(
            {
                "revision_id": row["revision_id"],
                "evidence_id": row["evidence_id"],
                "archived_at": row["archived_at"],
                "change_kind": row["change_kind"],
                "superseded_file_path": row["superseded_file_path"],
                "evidence_name": row["evidence_name"],
                "meta_summary": meta_summary,
            }
        )
    return {"title": title, "evidence_rows": evidence_rows, "revision_rows": revision_pack}


def _safe_build_evidence_graph(case_id: str, evidence_id: str) -> None:
    """证据入库后异步构建关系网；失败不影响主流程。"""
    try:
        from evidence_graph.builder import build_or_refresh_evidence

        conn = get_connection()
        try:
            build_or_refresh_evidence(conn, case_id, evidence_id)
        finally:
            conn.close()
    except Exception:
        pass


@app.route("/api/cases/<case_id>/evidence-graph", methods=["GET", "OPTIONS"])
def api_case_evidence_graph(case_id: str):
    """同步扫描案件字段与全部证据（指纹变化则重建），返回图数据与 neo4jd3 结构。"""
    if request.method == "OPTIONS":
        return ("", 204)

    user_id = resolve_user_id_from_token()
    if user_id is None:
        return jsonify({"message": "未登录或令牌无效，请重新登录"}), 401

    cid = str(case_id or "").strip()
    if not cid:
        return jsonify({"message": "无效的案件 ID"}), 400

    conn = get_connection()
    try:
        cur = conn.cursor()
        if not _case_owned(cur, cid, user_id):
            return jsonify({"message": "案件不存在或无权操作"}), 404
        cur.close()

        from evidence_graph.builder import graph_to_neo4j, sync_case_graph_full

        graph = sync_case_graph_full(conn, cid)
        neo = graph_to_neo4j(graph)
        return jsonify({"graph": graph, "neo4j": neo})
    finally:
        conn.close()


@app.route("/", methods=["GET"])
def root():
    if _frontend_dist_ready():
        return send_from_directory(FRONTEND_DIST, "index.html")
    # 开发/未构建模式：走 Vite 的 SPA 入口（frontend/index.html），静态资源来自 frontend/public。
    return send_from_directory(FRONTEND_ROOT, "index.html")


@app.route("/<path:filename>", methods=["GET"])
def serve_web_files(filename: str):
    if filename.startswith("api/"):
        return jsonify({"message": "Not Found"}), 404
    if _frontend_dist_ready():
        # 先 dist：避免 WEB_ROOT 下旧 assets 与 Vite 产物同名时抢走 bundle，导致白屏
        dist_path = FRONTEND_DIST / filename
        if dist_path.is_file():
            return send_from_directory(FRONTEND_DIST, filename)
        web_path = WEB_ROOT / filename
        if web_path.is_file():
            return send_from_directory(WEB_ROOT, filename)
        return send_from_directory(FRONTEND_DIST, "index.html")
    # 未构建模式：优先从 frontend/public 提供静态资源；其余路径回退到 SPA 入口。
    public_path = FRONTEND_PUBLIC / filename
    if public_path.is_file():
        return send_from_directory(FRONTEND_PUBLIC, filename)
    # 兼容部分历史路径仍放在仓库根目录（例如后端生成的临时导出或手动放置文件）
    web_path = WEB_ROOT / filename
    if web_path.is_file():
        return send_from_directory(WEB_ROOT, filename)
    return send_from_directory(FRONTEND_ROOT, "index.html")


@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PATCH, DELETE, OPTIONS"
    return response


@app.errorhandler(413)
def handle_request_entity_too_large(_error):
    return (
        jsonify({"message": "上传失败：文件过大（最大 50MB）"}),
        413,
    )


@app.route("/api/chat", methods=["POST", "OPTIONS"])
def api_chat():
    if request.method == "OPTIONS":
        return ("", 204)

    payload = request.get_json(silent=True) or {}
    user_message = str(payload.get("message", "")).strip()

    if not user_message:
        return jsonify({"message": "消息不能为空"}), 400

    try:
        result = run_workflow(user_message)
    except Exception as exc:
        return jsonify({"message": str(exc)}), 500

    return jsonify(
        {
            "reply": result.get("reply", ""),
            "citations": result.get("citations") or [],
            "citation_refs": result.get("citation_refs") or [],
            "legal_index": result.get("user_legal_index") or {},
        }
    )


@app.route("/api/retrieval", methods=["POST", "OPTIONS"])
def api_retrieval():
    """检索（得理）：自动识别案例/法规检索类型。"""
    if request.method == "OPTIONS":
        return ("", 204)

    payload = request.get_json(silent=True) or {}
    keyword = str(payload.get("message", "") or payload.get("keyword", "")).strip()
    retrieval_type = str(payload.get("retrievalType", "auto") or "auto").strip().lower()
    rewrite = str(payload.get("rewrite", "") or "").strip().lower() in ("1", "true", "yes", "on")
    rewrite_max_keywords_raw = payload.get("rewriteMaxKeywords")

    if not keyword:
        return jsonify({"message": "检索关键词不能为空"}), 400
    if retrieval_type not in ("auto", "case", "law", "other", "mixed"):
        return jsonify({"message": "retrievalType 仅支持 auto/case/law/other/mixed"}), 400

    rewrite_max_keywords = 12
    if rewrite_max_keywords_raw is not None:
        try:
            rewrite_max_keywords = int(rewrite_max_keywords_raw)
            if rewrite_max_keywords <= 0:
                rewrite_max_keywords = 12
            rewrite_max_keywords = min(rewrite_max_keywords, 30)
        except Exception:
            rewrite_max_keywords = 12

    try:
        result = search_by_intent(
            keyword,
            retrieval_type_override=retrieval_type,
            rewrite=rewrite,
            rewrite_max_keywords=rewrite_max_keywords,
        )
    except Exception as exc:
        return jsonify({"message": str(exc)}), 500

    return jsonify(
        {
            "retrievalType": result.get("retrievalType", "case"),
            "keywordArr": result.get("keywordArr", []),
            "cases": result.get("cases", []),
            "laws": result.get("laws", []),
            "caseData": result.get("caseData", {}),
            "lawData": result.get("lawData", {}),
            "results": result.get("results", []),
            "queryTips": result.get("queryTips", ""),
            "rewrite": result.get("rewrite", {}),
        }
    )


@app.route("/api/law-info", methods=["GET", "OPTIONS"])
def api_law_info():
    """法规详情查询：转发得理 lawInfo，供前端点击法规后拉取完整条文。"""
    if request.method == "OPTIONS":
        return ("", 204)

    law_id = str(request.args.get("lawId", "") or "").strip()
    merge = str(request.args.get("merge", "true") or "true").strip().lower() != "false"

    if not law_id:
        return jsonify({"message": "lawId 不能为空"}), 400

    try:
        info = get_law_info(law_id, merge=merge)
    except Exception as exc:
        return jsonify({"message": str(exc)}), 500

    return jsonify({"lawInfo": info})


@app.route("/api/contract-review/run", methods=["POST", "OPTIONS"])
def api_contract_review_run():
    """劳动合同清单审查（专用 orchestrator + contract_review_chat，不走 /api/chat）。"""
    if request.method == "OPTIONS":
        return ("", 204)

    user_id = resolve_user_id_from_token()
    if user_id is None:
        return jsonify({"message": "未登录或令牌无效，请重新登录"}), 401

    payload = request.get_json(silent=True) or {}
    contract_text = str(payload.get("contract_text", "") or "")
    stance = str(payload.get("stance", "") or "").strip() or "劳动者（乙方）"
    user_requirements = str(payload.get("user_requirements", "") or "").strip()
    document_type = str(payload.get("document_type", "") or "").strip() or "labor_contract"
    if document_type not in ("labor_contract", "civil_complaint", "general_document"):
        document_type = "labor_contract"

    try:
        from contract_review.review_orchestrator import run_contract_review_session

        result = run_contract_review_session(
            contract_text,
            stance=stance,
            document_type=document_type,
            user_requirements=user_requirements,
        )
    except ValueError as exc:
        return jsonify({"message": str(exc)}), 400
    except Exception as exc:
        return jsonify({"message": str(exc)}), 500

    return jsonify(result)


@app.route("/api/contract-review/summary", methods=["POST", "OPTIONS"])
def api_contract_review_summary():
    """劳动合同结构化摘要（单轮 JSON，与 /contract-review/run 独立）。"""
    if request.method == "OPTIONS":
        return ("", 204)

    user_id = resolve_user_id_from_token()
    if user_id is None:
        return jsonify({"message": "未登录或令牌无效，请重新登录"}), 401

    payload = request.get_json(silent=True) or {}
    contract_text = str(payload.get("contract_text", "") or "")
    stance = str(payload.get("stance", "") or "").strip() or "劳动者（乙方）"
    user_requirements = str(payload.get("user_requirements", "") or "").strip()
    document_type = str(payload.get("document_type", "") or "").strip() or "labor_contract"
    if document_type not in ("labor_contract", "civil_complaint", "general_document"):
        document_type = "labor_contract"

    try:
        from contract_review.summary_runner import run_contract_summary_session

        result = run_contract_summary_session(
            contract_text,
            stance=stance,
            document_type=document_type,
            user_requirements=user_requirements,
        )
    except ValueError as exc:
        return jsonify({"message": str(exc)}), 400
    except Exception as exc:
        return jsonify({"message": str(exc)}), 500

    return jsonify(result)


@app.route("/api/auth/register", methods=["POST", "OPTIONS"])
def api_auth_register():
    if request.method == "OPTIONS":
        return ("", 204)

    payload = request.get_json(silent=True) or {}
    phone = str(payload.get("phone", "")).strip()
    email = str(payload.get("email", "")).strip()
    name = str(payload.get("name", "")).strip()
    password = str(payload.get("password", ""))

    if not phone and not email:
        return jsonify({"message": "手机号和邮箱至少填写一项"}), 400
    if phone and (not phone.isdigit() or len(phone) != 11):
        return jsonify({"message": "手机号格式不正确"}), 400
    if not name:
        return jsonify({"message": "姓名不能为空"}), 400
    if len(password) < 6:
        return jsonify({"message": "密码至少6位"}), 400

    conn = get_connection()
    cur = conn.cursor()
    token = str(uuid.uuid4())
    try:
        cur.execute(
            """
            INSERT INTO users (
                phone, email, name, gender, job, password_hash
            ) VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                phone if phone else None,
                email if email else None,
                name,
                "未填写",
                "未填写",
                hash_password(password),
            ),
        )
        user_id = cur.lastrowid
        cur.execute(
            "INSERT INTO auth_tokens (token, user_id) VALUES (?, ?)",
            (token, user_id),
        )
        conn.commit()
    except Exception as exc:
        conn.rollback()
        return jsonify({"message": f"注册失败: {exc}"}), 400
    finally:
        cur.close()
        conn.close()

    return jsonify(
        {
            "token": token,
            "message": "注册成功",
            "user": {
                "user_id": user_id,
                "name": name,
                "phone": phone if phone else None,
                "email": email if email else None,
            },
        }
    )


@app.route("/api/auth/login", methods=["POST", "OPTIONS"])
def api_auth_login():
    if request.method == "OPTIONS":
        return ("", 204)

    payload = request.get_json(silent=True) or {}
    account = str(payload.get("account", "")).strip()
    password = str(payload.get("password", ""))

    if not account or not password:
        return jsonify({"message": "账号或密码不能为空"}), 400

    conn = get_connection()
    cur = conn.cursor()
    token = str(uuid.uuid4())
    try:
        cur.execute(
            """
            SELECT user_id, phone, email, name, password_hash, status
            FROM users
            WHERE phone = ? OR email = ?
            LIMIT 1
            """,
            (account, account),
        )
        row = cur.fetchone()
        if not row:
            return jsonify({"message": "账号不存在"}), 404
        if row["status"] != "active":
            return jsonify({"message": "账号不可用"}), 403
        if row["password_hash"] != hash_password(password):
            return jsonify({"message": "密码错误"}), 401

        cur.execute(
            "INSERT INTO auth_tokens (token, user_id) VALUES (?, ?)",
            (token, row["user_id"]),
        )
        cur.execute(
            "UPDATE users SET last_login_at = datetime('now', 'localtime') WHERE user_id = ?",
            (row["user_id"],),
        )
        conn.commit()
    finally:
        cur.close()
        conn.close()

    return jsonify(
        {
            "token": token,
            "user": {
                "user_id": row["user_id"],
                "name": row["name"],
                "phone": row["phone"],
                "email": row["email"],
            },
        }
    )


_AUTH_PHONE_RE = re.compile(r"^\d{11}$")
_AUTH_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_AUTH_ID_CARD_RE = re.compile(r"^\d{17}[\dXx]$")
_AUTH_HAS_ALNUM_RE = re.compile(r"[A-Za-z0-9]")
_AUTH_GENDER_OPTIONS = {"", "\u7537", "\u5973"}
_AUTH_USER_COLUMNS = (
    "user_id, phone, email, name, gender, job, id_card, region, home_addr, school, "
    "birth_date, ethnicity, postal_code, landline_phone, "
    "role, status, real_name_verified, last_login_at, created_at, updated_at, password_hash"
)


def _auth_text(value, max_len: int | None = None) -> str:
    text = str(value or "").strip()
    if max_len is not None:
        text = text[:max_len]
    return text


def _auth_norm_phone(value) -> str | None:
    text = _auth_text(value, 32)
    if not text:
        return None
    if not _AUTH_PHONE_RE.fullmatch(text):
        raise ValueError("\u624b\u673a\u53f7\u683c\u5f0f\u4e0d\u6b63\u786e")
    return text


def _auth_norm_email(value) -> str | None:
    text = _auth_text(value, 120)
    if not text:
        return None
    if not _AUTH_EMAIL_RE.fullmatch(text):
        raise ValueError("\u90ae\u7bb1\u683c\u5f0f\u4e0d\u6b63\u786e")
    return text


def _auth_norm_id_card(value) -> str | None:
    text = _auth_text(value, 32).upper()
    if not text:
        return None
    if not _AUTH_ID_CARD_RE.fullmatch(text):
        raise ValueError("\u8eab\u4efd\u8bc1\u53f7\u683c\u5f0f\u4e0d\u6b63\u786e")
    return text


def _auth_norm_gender(value) -> str:
    text = _auth_text(value, 8)
    if text not in _AUTH_GENDER_OPTIONS:
        raise ValueError("\u6027\u522b\u9009\u9879\u4e0d\u6b63\u786e")
    return text


def _auth_reject_alpha_num(value: str, field_label: str) -> None:
    if value and _AUTH_HAS_ALNUM_RE.search(value):
        raise ValueError(f"{field_label}\u4e0d\u80fd\u5305\u542b\u6570\u5b57\u6216\u82f1\u6587\u5b57\u6bcd")


def _auth_fetch_user(cur, user_id: int):
    cur.execute(f"SELECT {_AUTH_USER_COLUMNS} FROM users WHERE user_id = ? LIMIT 1", (user_id,))
    return cur.fetchone()


def _auth_public_user(row) -> dict:
    return {
        "user_id": row["user_id"],
        "name": row["name"] or "",
        "gender": row["gender"] or "",
        "phone": row["phone"],
        "email": row["email"],
        "id_card": row["id_card"] or "",
        "region": row["region"] or "",
        "home_addr": row["home_addr"] or "",
        "occupation": row["job"] or "",
        "job": row["job"] or "",
        "school": row["school"] or "",
        "birth_date": row["birth_date"] or "",
        "ethnicity": row["ethnicity"] or "",
        "postal_code": row["postal_code"] or "",
        "landline_phone": row["landline_phone"] or "",
        "role": row["role"] or "user",
        "status": row["status"] or "active",
        "real_name_verified": bool(row["real_name_verified"]),
        "last_login_at": row["last_login_at"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def _auth_unique_field(cur, *, user_id: int, field: str, value: str | None, message: str) -> None:
    if not value:
        return
    cur.execute(
        f"SELECT user_id FROM users WHERE {field} = ? AND user_id <> ? LIMIT 1",
        (value, user_id),
    )
    if cur.fetchone():
        raise ValueError(message)


@app.route("/api/auth/me", methods=["GET", "OPTIONS"])
def api_auth_me():
    if request.method == "OPTIONS":
        return ("", 204)

    user_id = resolve_user_id_from_token()
    if user_id is None:
        return jsonify({"message": "\u672a\u767b\u5f55\u6216\u767b\u5f55\u5df2\u5931\u6548\uff0c\u8bf7\u91cd\u65b0\u767b\u5f55"}), 401

    conn = get_connection()
    cur = conn.cursor()
    try:
        row = _auth_fetch_user(cur, user_id)
        if not row:
            return jsonify({"message": "\u7528\u6237\u4e0d\u5b58\u5728"}), 404
        return jsonify({"user": _auth_public_user(row)})
    finally:
        cur.close()
        conn.close()


@app.route("/api/auth/profile", methods=["PATCH", "OPTIONS"])
def api_auth_profile():
    if request.method == "OPTIONS":
        return ("", 204)

    user_id = resolve_user_id_from_token()
    if user_id is None:
        return jsonify({"message": "\u672a\u767b\u5f55\u6216\u767b\u5f55\u5df2\u5931\u6548\uff0c\u8bf7\u91cd\u65b0\u767b\u5f55"}), 401

    payload = request.get_json(silent=True) or {}
    name = _auth_text(payload.get("name"), 50)
    region = _auth_text(payload.get("region"), 120)
    home_addr = _auth_text(payload.get("home_addr"), 200)
    occupation = _auth_text(payload.get("occupation") or payload.get("job"), 80)
    school = _auth_text(payload.get("school"), 120)
    birth_date = _auth_text(payload.get("birth_date"), 40)
    ethnicity = _auth_text(payload.get("ethnicity"), 20)
    postal_code = _auth_text(payload.get("postal_code"), 12)
    landline_phone = _auth_text(payload.get("landline_phone"), 20)

    try:
        gender = _auth_norm_gender(payload.get("gender"))
        phone = _auth_norm_phone(payload.get("phone"))
        email = _auth_norm_email(payload.get("email"))
        id_card = _auth_norm_id_card(payload.get("id_card"))
    except ValueError as exc:
        return jsonify({"message": str(exc)}), 400

    if not name:
        return jsonify({"message": "\u59d3\u540d\u4e0d\u80fd\u4e3a\u7a7a"}), 400
    if not phone and not email:
        return jsonify({"message": "\u624b\u673a\u53f7\u548c\u90ae\u7bb1\u81f3\u5c11\u586b\u5199\u4e00\u9879"}), 400

    try:
        _auth_reject_alpha_num(ethnicity, "\u6c11\u65cf")
        _auth_reject_alpha_num(occupation, "\u804c\u4e1a")
    except ValueError as exc:
        return jsonify({"message": str(exc)}), 400

    conn = get_connection()
    cur = conn.cursor()
    try:
        row = _auth_fetch_user(cur, user_id)
        if not row:
            return jsonify({"message": "\u7528\u6237\u4e0d\u5b58\u5728"}), 404

        _auth_unique_field(cur, user_id=user_id, field="phone", value=phone, message="\u624b\u673a\u53f7\u5df2\u88ab\u5176\u4ed6\u8d26\u53f7\u4f7f\u7528")
        _auth_unique_field(cur, user_id=user_id, field="email", value=email, message="\u90ae\u7bb1\u5df2\u88ab\u5176\u4ed6\u8d26\u53f7\u4f7f\u7528")
        _auth_unique_field(cur, user_id=user_id, field="id_card", value=id_card, message="\u8eab\u4efd\u8bc1\u53f7\u5df2\u88ab\u5176\u4ed6\u8d26\u53f7\u4f7f\u7528")

        cur.execute(
            """
            UPDATE users
            SET name = ?, gender = ?, phone = ?, email = ?, id_card = ?,
                region = ?, home_addr = ?, job = ?, school = ?,
                birth_date = ?, ethnicity = ?, postal_code = ?, landline_phone = ?,
                updated_at = datetime('now', 'localtime')
            WHERE user_id = ?
            """,
            (
                name,
                gender,
                phone,
                email,
                id_card,
                region,
                home_addr,
                occupation,
                school,
                birth_date,
                ethnicity,
                postal_code,
                landline_phone,
                user_id,
            ),
        )
        updated = _auth_fetch_user(cur, user_id)
        conn.commit()
    except ValueError as exc:
        conn.rollback()
        return jsonify({"message": str(exc)}), 400
    except sqlite3.IntegrityError:
        conn.rollback()
        return jsonify({"message": "\u4fe1\u606f\u5df2\u88ab\u5360\u7528\uff0c\u8bf7\u68c0\u67e5\u540e\u91cd\u8bd5"}), 409
    finally:
        cur.close()
        conn.close()

    return jsonify({"message": "\u4e2a\u4eba\u8d44\u6599\u5df2\u4fdd\u5b58", "user": _auth_public_user(updated)})


@app.route("/api/auth/change-password", methods=["POST", "OPTIONS"])
def api_auth_change_password():
    if request.method == "OPTIONS":
        return ("", 204)

    user_id = resolve_user_id_from_token()
    if user_id is None:
        return jsonify({"message": "\u672a\u767b\u5f55\u6216\u767b\u5f55\u5df2\u5931\u6548\uff0c\u8bf7\u91cd\u65b0\u767b\u5f55"}), 401

    payload = request.get_json(silent=True) or {}
    old_password = str(payload.get("old_password", ""))
    new_password = str(payload.get("new_password", ""))
    if not old_password or not new_password:
        return jsonify({"message": "\u8bf7\u5b8c\u6574\u586b\u5199\u5f53\u524d\u5bc6\u7801\u548c\u65b0\u5bc6\u7801"}), 400
    if len(new_password) < 6:
        return jsonify({"message": "\u65b0\u5bc6\u7801\u81f3\u5c116\u4f4d"}), 400

    conn = get_connection()
    cur = conn.cursor()
    try:
        row = _auth_fetch_user(cur, user_id)
        if not row:
            return jsonify({"message": "\u7528\u6237\u4e0d\u5b58\u5728"}), 404
        if row["password_hash"] != hash_password(old_password):
            return jsonify({"message": "\u5f53\u524d\u5bc6\u7801\u9519\u8bef"}), 401
        if row["password_hash"] == hash_password(new_password):
            return jsonify({"message": "\u65b0\u5bc6\u7801\u4e0d\u80fd\u4e0e\u5f53\u524d\u5bc6\u7801\u76f8\u540c"}), 400

        cur.execute(
            "UPDATE users SET password_hash = ?, updated_at = datetime('now', 'localtime') WHERE user_id = ?",
            (hash_password(new_password), user_id),
        )
        conn.commit()
    finally:
        cur.close()
        conn.close()

    return jsonify({"message": "\u5bc6\u7801\u4fee\u6539\u6210\u529f"})


@app.route("/api/auth/reset-password", methods=["POST", "OPTIONS"])
def api_auth_reset_password():
    if request.method == "OPTIONS":
        return ("", 204)

    user_id = resolve_user_id_from_token()
    if user_id is None:
        return jsonify({"message": "\u672a\u767b\u5f55\u6216\u767b\u5f55\u5df2\u5931\u6548\uff0c\u8bf7\u91cd\u65b0\u767b\u5f55"}), 401

    payload = request.get_json(silent=True) or {}
    account = _auth_text(payload.get("account"), 120)
    new_password = str(payload.get("new_password", ""))
    try:
        id_card = _auth_norm_id_card(payload.get("id_card"))
    except ValueError as exc:
        return jsonify({"message": str(exc)}), 400

    if not account:
        return jsonify({"message": "\u8bf7\u586b\u5199\u5df2\u7ed1\u5b9a\u7684\u624b\u673a\u53f7\u6216\u90ae\u7bb1"}), 400
    if not id_card:
        return jsonify({"message": "\u8bf7\u586b\u5199\u8eab\u4efd\u8bc1\u53f7"}), 400
    if len(new_password) < 6:
        return jsonify({"message": "\u65b0\u5bc6\u7801\u81f3\u5c116\u4f4d"}), 400

    conn = get_connection()
    cur = conn.cursor()
    try:
        row = _auth_fetch_user(cur, user_id)
        if not row:
            return jsonify({"message": "\u7528\u6237\u4e0d\u5b58\u5728"}), 404
        if row["status"] != "active":
            return jsonify({"message": "\u8d26\u53f7\u4e0d\u53ef\u7528"}), 403
        if not row["id_card"]:
            return jsonify({"message": "\u8bf7\u5148\u5728\u4e2a\u4eba\u8d44\u6599\u4e2d\u586b\u5199\u8eab\u4efd\u8bc1\u53f7\u540e\u518d\u91cd\u7f6e\u5bc6\u7801"}), 400
        if account not in {row["phone"], row["email"]}:
            return jsonify({"message": "\u8d26\u53f7\u4fe1\u606f\u6838\u9a8c\u5931\u8d25"}), 403
        if str(row["id_card"]).upper() != id_card:
            return jsonify({"message": "\u8eab\u4efd\u8bc1\u53f7\u6838\u9a8c\u5931\u8d25"}), 403
        if row["password_hash"] == hash_password(new_password):
            return jsonify({"message": "\u65b0\u5bc6\u7801\u4e0d\u80fd\u4e0e\u5f53\u524d\u5bc6\u7801\u76f8\u540c"}), 400

        cur.execute(
            "UPDATE users SET password_hash = ?, updated_at = datetime('now', 'localtime') WHERE user_id = ?",
            (hash_password(new_password), user_id),
        )
        conn.commit()
    finally:
        cur.close()
        conn.close()

    return jsonify({"message": "\u5bc6\u7801\u91cd\u7f6e\u6210\u529f"})


@app.route("/api/auth/logout", methods=["POST", "OPTIONS"])
def api_auth_logout():
    if request.method == "OPTIONS":
        return ("", 204)

    token = bearer_token()
    if not token:
        return jsonify({"message": "\u672a\u767b\u5f55\u6216\u767b\u5f55\u5df2\u5931\u6548\uff0c\u8bf7\u91cd\u65b0\u767b\u5f55"}), 401

    conn = get_connection()
    cur = conn.cursor()
    try:
        cur.execute("DELETE FROM auth_tokens WHERE token = ?", (token,))
        if cur.rowcount <= 0:
            conn.rollback()
            return jsonify({"message": "\u672a\u767b\u5f55\u6216\u767b\u5f55\u5df2\u5931\u6548\uff0c\u8bf7\u91cd\u65b0\u767b\u5f55"}), 401
        conn.commit()
    finally:
        cur.close()
        conn.close()

    return jsonify({"message": "\u5df2\u9000\u51fa\u767b\u5f55"})


def _row_to_conversation(row) -> dict:
    return {
        "conversation_id": row["conversation_id"],
        "title": row["title"] or "",
        "created_time": row["created_time"],
        "updated_time": row["updated_time"],
        "last_message_id": row["last_message_id"],
    }


@app.route("/api/conversations", methods=["GET", "POST", "OPTIONS"])
def api_conversations():
    if request.method == "OPTIONS":
        return ("", 204)

    user_id = resolve_user_id_from_token()
    if user_id is None:
        return jsonify({"message": "未登录或令牌无效，请重新登录"}), 401

    if request.method == "GET":
        conn = get_connection()
        cur = conn.cursor()
        try:
            cur.execute(
                """
                SELECT conversation_id, title, created_time, updated_time, last_message_id
                FROM conversations
                WHERE user_id = ? AND is_deleted = 0
                ORDER BY updated_time DESC
                """,
                (user_id,),
            )
            rows = cur.fetchall()
        finally:
            cur.close()
            conn.close()
        return jsonify({"conversations": [_row_to_conversation(r) for r in rows]})

    payload = request.get_json(silent=True) or {}
    title = str(payload.get("title", "") or "").strip() or None
    cid = str(uuid.uuid4())
    conn = get_connection()
    cur = conn.cursor()
    try:
        cur.execute(
            """
            INSERT INTO conversations (conversation_id, title, user_id)
            VALUES (?, ?, ?)
            """,
            (cid, title, user_id),
        )
        conn.commit()
        cur.execute(
            """
            SELECT conversation_id, title, created_time, updated_time, last_message_id
            FROM conversations
            WHERE conversation_id = ? AND user_id = ?
            """,
            (cid, user_id),
        )
        row = cur.fetchone()
    except Exception as exc:
        conn.rollback()
        return jsonify({"message": f"创建会话失败: {exc}"}), 400
    finally:
        cur.close()
        conn.close()

    return jsonify({"conversation": _row_to_conversation(row)})


@app.route("/api/conversations/<conversation_id>", methods=["PATCH", "DELETE", "OPTIONS"])
def api_conversation_one(conversation_id: str):
    if request.method == "OPTIONS":
        return ("", 204)

    user_id = resolve_user_id_from_token()
    if user_id is None:
        return jsonify({"message": "未登录或令牌无效，请重新登录"}), 401

    cid = str(conversation_id or "").strip()
    if not cid:
        return jsonify({"message": "无效的会话 ID"}), 400

    if request.method == "DELETE":
        conn = get_connection()
        cur = conn.cursor()
        try:
            cur.execute(
                """
                UPDATE conversations
                SET is_deleted = 1,
                    updated_time = datetime('now', 'localtime')
                WHERE conversation_id = ? AND user_id = ? AND is_deleted = 0
                """,
                (cid, user_id),
            )
            if cur.rowcount == 0:
                conn.rollback()
                return jsonify({"message": "会话不存在或已删除"}), 404
            cur.execute(
                """
                UPDATE messages
                SET is_deleted = 1,
                    deleted_time = datetime('now', 'localtime')
                WHERE conversation_id = ? AND is_deleted = 0
                """,
                (cid,),
            )
            conn.commit()
        finally:
            cur.close()
            conn.close()
        return jsonify({"message": "已删除"})

    payload = request.get_json(silent=True) or {}
    title = payload.get("title")
    if title is not None:
        title = str(title).strip() or None

    conn = get_connection()
    cur = conn.cursor()
    try:
        cur.execute(
            """
            UPDATE conversations
            SET title = COALESCE(?, title),
                updated_time = datetime('now', 'localtime')
            WHERE conversation_id = ? AND user_id = ? AND is_deleted = 0
            """,
            (title, cid, user_id),
        )
        conn.commit()
        if cur.rowcount == 0:
            return jsonify({"message": "会话不存在或已删除"}), 404
        cur.execute(
            """
            SELECT conversation_id, title, created_time, updated_time, last_message_id
            FROM conversations
            WHERE conversation_id = ? AND user_id = ?
            """,
            (cid, user_id),
        )
        row = cur.fetchone()
    finally:
        cur.close()
        conn.close()

    return jsonify({"conversation": _row_to_conversation(row)})


def _conversation_owned_cursor(cur, conversation_id: str, user_id: int) -> bool:
    cur.execute(
        """
        SELECT 1 FROM conversations
        WHERE conversation_id = ? AND user_id = ? AND is_deleted = 0
        LIMIT 1
        """,
        (conversation_id, user_id),
    )
    return cur.fetchone() is not None


def _next_message_sequence(cur, conversation_id: str) -> int:
    cur.execute(
        """
        SELECT COALESCE(MAX(sequence_num), 0) FROM messages
        WHERE conversation_id = ? AND is_deleted = 0
        """,
        (conversation_id,),
    )
    row = cur.fetchone()
    return int(row[0]) + 1


def _insert_text_message(
    cur,
    *,
    message_id: str,
    conversation_id: str,
    user_id: int,
    content: str,
    extra_data: dict,
    reply_to_id: str | None,
    sequence_num: int,
) -> None:
    cur.execute(
        """
        INSERT INTO messages (
            message_id, conversation_id, user_id, message_type, content,
            extra_data, reply_to_id, sequence_num
        ) VALUES (?, ?, ?, '文本', ?, ?, ?, ?)
        """,
        (
            message_id,
            conversation_id,
            user_id,
            content,
            json.dumps(extra_data, ensure_ascii=False),
            reply_to_id,
            sequence_num,
        ),
    )


def _make_question_summary(text: str, max_len: int = 100) -> str:
    """用户问题压缩摘要，供多轮记忆（无需额外调用模型）。"""
    t = str(text or "").strip().replace("\n", " ")
    if len(t) <= max_len:
        return t
    return t[: max_len - 1] + "…"


def _parse_message_sender_and_extra(row) -> tuple[str, dict]:
    sender = "user"
    meta: dict = {}
    if row["extra_data"]:
        try:
            raw = json.loads(row["extra_data"])
            if isinstance(raw, dict):
                meta = raw
                s = meta.get("sender")
                if s in ("user", "assistant", "system"):
                    sender = s
        except (json.JSONDecodeError, TypeError):
            pass
    return sender, meta


def _prior_qa_summaries_from_cursor(cur, conversation_id: str, limit: int = 5) -> list[dict]:
    """
    取本会话已落库消息中，最近若干轮「用户→助手」配对的摘要。
    用于下一轮 run_workflow 压缩上文，减少重复传全文。
    """
    cur.execute(
        """
        SELECT content, extra_data
        FROM messages
        WHERE conversation_id = ? AND is_deleted = 0
        ORDER BY sequence_num ASC, send_time ASC
        """,
        (conversation_id,),
    )
    rows = cur.fetchall()
    pairs: list[dict] = []
    i = 0
    while i < len(rows):
        sender_u, meta_u = _parse_message_sender_and_extra(rows[i])
        if sender_u != "user":
            i += 1
            continue
        if i + 1 >= len(rows):
            break
        sender_a, meta_a = _parse_message_sender_and_extra(rows[i + 1])
        if sender_a != "assistant":
            i += 1
            continue
        u_content = rows[i]["content"] or ""
        q_sum = str(meta_u.get("question_summary") or "").strip()
        if not q_sum:
            q_sum = _make_question_summary(u_content)
        a_content = rows[i + 1]["content"] or ""
        a_sum = str(meta_a.get("reply_summary") or "").strip()
        if not a_sum:
            a_sum = a_content[:120] + ("…" if len(a_content) > 120 else "")
        pairs.append({"question_summary": q_sum, "reply_summary": a_sum})
        i += 2
    return pairs[-limit:]


def _row_to_message(row) -> dict:
    sender = "user"
    legal_index = None
    citations = None
    citation_refs = None
    if row["extra_data"]:
        try:
            meta = json.loads(row["extra_data"])
            if isinstance(meta, dict):
                if meta.get("sender") in (
                    "user",
                    "assistant",
                    "system",
                ):
                    sender = meta["sender"]
                if "legal_index" in meta:
                    legal_index = meta.get("legal_index")
                if "citations" in meta:
                    citations = meta.get("citations")
                if "citation_refs" in meta:
                    citation_refs = meta.get("citation_refs")
        except (json.JSONDecodeError, TypeError):
            pass
    out = {
        "message_id": row["message_id"],
        "conversation_id": row["conversation_id"],
        "content": row["content"] or "",
        "send_time": row["send_time"],
        "sequence_num": row["sequence_num"],
        "sender": sender,
    }
    if legal_index is not None:
        out["legal_index"] = legal_index
    if citations is not None:
        out["citations"] = citations
    if citation_refs is not None:
        out["citation_refs"] = citation_refs
    return out


@app.route(
    "/api/conversations/<conversation_id>/messages",
    methods=["GET", "POST", "OPTIONS"],
)
def api_conversation_messages(conversation_id: str):
    if request.method == "OPTIONS":
        return ("", 204)

    user_id = resolve_user_id_from_token()
    if user_id is None:
        return jsonify({"message": "未登录或令牌无效，请重新登录"}), 401

    cid = str(conversation_id or "").strip()
    if not cid:
        return jsonify({"message": "无效的会话 ID"}), 400

    if request.method == "GET":
        conn = get_connection()
        cur = conn.cursor()
        try:
            if not _conversation_owned_cursor(cur, cid, user_id):
                return jsonify({"message": "会话不存在"}), 404
            cur.execute(
                """
                SELECT message_id, conversation_id, content, send_time,
                       sequence_num, extra_data
                FROM messages
                WHERE conversation_id = ? AND is_deleted = 0
                ORDER BY sequence_num ASC, send_time ASC
                """,
                (cid,),
            )
            rows = cur.fetchall()
        finally:
            cur.close()
            conn.close()
        return jsonify({"messages": [_row_to_message(r) for r in rows]})

    payload = request.get_json(silent=True) or {}
    text = str(payload.get("message", "") or payload.get("content", "")).strip()
    if not text:
        return jsonify({"message": "消息不能为空"}), 400

    conn = get_connection()
    cur = conn.cursor()
    pair = []
    try:
        if not _conversation_owned_cursor(cur, cid, user_id):
            return jsonify({"message": "会话不存在"}), 404

        prior_summaries = _prior_qa_summaries_from_cursor(cur, cid, 5)
        wf = run_workflow(text, prior_turn_summaries=prior_summaries)
        reply_text = str(wf.get("reply", "") or "").strip() or "（暂无回复内容）"
        reply_summary = str(wf.get("reply_summary") or "").strip()
        user_legal_index = wf.get("user_legal_index") if isinstance(wf.get("user_legal_index"), dict) else {}
        assistant_legal_index = (
            wf.get("assistant_legal_index")
            if isinstance(wf.get("assistant_legal_index"), dict)
            else {}
        )
        citations = wf.get("citations") if isinstance(wf.get("citations"), list) else []
        citation_refs = wf.get("citation_refs") if isinstance(wf.get("citation_refs"), list) else []
        llm_error = bool(wf.get("llm_error"))

        seq_u = _next_message_sequence(cur, cid)
        mid_u = str(uuid.uuid4())
        _insert_text_message(
            cur,
            message_id=mid_u,
            conversation_id=cid,
            user_id=user_id,
            content=text,
            extra_data={
                "sender": "user",
                "legal_index": user_legal_index,
                "question_summary": _make_question_summary(text),
            },
            reply_to_id=None,
            sequence_num=seq_u,
        )

        if llm_error:
            mid_s = str(uuid.uuid4())
            seq_s = _next_message_sequence(cur, cid)
            _insert_text_message(
                cur,
                message_id=mid_s,
                conversation_id=cid,
                user_id=user_id,
                content=reply_text,
                extra_data={"sender": "system"},
                reply_to_id=None,
                sequence_num=seq_s,
            )
            cur.execute(
                """
                UPDATE conversations
                SET last_message_id = ?,
                    updated_time = datetime('now', 'localtime')
                WHERE conversation_id = ? AND user_id = ?
                """,
                (mid_s, cid, user_id),
            )
            conn.commit()
            cur.execute(
                """
                SELECT message_id, conversation_id, content, send_time,
                       sequence_num, extra_data
                FROM messages
                WHERE message_id IN (?, ?)
                ORDER BY sequence_num ASC
                """,
                (mid_u, mid_s),
            )
            pair = cur.fetchall()
            return jsonify(
                {
                    "reply": reply_text,
                    "messages": [_row_to_message(r) for r in pair],
                    "citations": citations,
                    "citation_refs": citation_refs,
                    "legal_index": assistant_legal_index,
                    "error": True,
                }
            )

        mid_a = str(uuid.uuid4())
        seq_a = _next_message_sequence(cur, cid)
        _insert_text_message(
            cur,
            message_id=mid_a,
            conversation_id=cid,
            user_id=user_id,
            content=reply_text,
            extra_data={
                "sender": "assistant",
                "legal_index": assistant_legal_index,
                "citations": citations,
                "citation_refs": citation_refs,
                "reply_summary": reply_summary,
            },
            reply_to_id=None,
            sequence_num=seq_a,
        )

        cur.execute(
            """
            UPDATE conversations
            SET last_message_id = ?,
                updated_time = datetime('now', 'localtime')
            WHERE conversation_id = ? AND user_id = ?
            """,
            (mid_a, cid, user_id),
        )
        conn.commit()

        cur.execute(
            """
            SELECT message_id, conversation_id, content, send_time,
                   sequence_num, extra_data
            FROM messages
            WHERE message_id IN (?, ?)
            ORDER BY sequence_num ASC
            """,
            (mid_u, mid_a),
        )
        pair = cur.fetchall()
    except Exception as exc:
        conn.rollback()
        return jsonify({"message": f"发送失败: {exc}"}), 500
    finally:
        cur.close()
        conn.close()

    return jsonify(
        {
            "reply": reply_text,
            "messages": [_row_to_message(r) for r in pair],
            "citations": citations,
            "citation_refs": citation_refs,
            "legal_index": assistant_legal_index,
            "error": False,
        }
    )


@app.route("/api/cases", methods=["GET", "POST", "OPTIONS"])
def api_cases():
    if request.method == "OPTIONS":
        return ("", 204)

    user_id = resolve_user_id_from_token()
    if user_id is None:
        return jsonify({"message": "未登录或令牌无效，请重新登录"}), 401

    if request.method == "GET":
        conn = get_connection()
        cur = conn.cursor()
        try:
            cur.execute(
                """
                SELECT c.case_id, c.build_time, c.reason, c.case_time, c.details,
                       c.request, c.stage, c.emergency_degree, r.name AS respondent_name,
                       c.laborer_id, c.employer_id
                FROM cases c
                JOIN characters r ON c.respondent_id = r.character_id
                WHERE c.owner_user_id = ?
                ORDER BY c.build_time DESC
                """,
                (user_id,),
            )
            rows = cur.fetchall()
        finally:
            cur.close()
            conn.close()
        cases = []
        for row in rows:
            reason = row["reason"] or "维权案件"
            cases.append(
                {
                    "case_id": row["case_id"],
                    "title": reason if len(reason) <= 80 else reason[:77] + "…",
                    "reason": row["reason"],
                    "case_time": row["case_time"],
                    "details": row["details"],
                    "request": row["request"],
                    "stage": row["stage"],
                    "build_time": row["build_time"],
                    "emergency_degree": row["emergency_degree"],
                    "respondent_name": row["respondent_name"],
                }
            )
        return jsonify({"cases": cases})

    payload = request.get_json(silent=True) or {}
    case_name = str(payload.get("case_name") or payload.get("reason") or "").strip()
    if not case_name:
        return jsonify({"message": "请填写案件名称"}), 400
    # 新流程：创建案件时仅要求案件名称。用人单位可后续在案件档案中补充。
    respondent_name = str(payload.get("respondent_name") or "").strip() or "未填写"
    reason = case_name

    stage = str(payload.get("stage") or "暂存").strip()
    if stage not in (
        "暂存",
        "审核",
        "协商",
        "调解",
        "行政投诉",
        "仲裁",
        "诉讼",
    ):
        stage = "暂存"

    case_id = str(uuid.uuid4())
    resp_id = str(uuid.uuid4())
    conn = get_connection()
    cur = conn.cursor()
    try:
        applicant_id = _ensure_applicant_character(conn, user_id)
        cur.execute(
            """
            INSERT INTO characters (character_id, name, work_addr)
            VALUES (?, ?, '无')
            """,
            (resp_id, respondent_name),
        )
        cur.execute(
            """
            INSERT INTO cases (
                case_id, reason, case_time, details, request,
                applicant_id, respondent_id, stage, owner_user_id
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                case_id,
                reason,
                str(payload.get("case_time") or "").strip() or None,
                str(payload.get("details") or "").strip() or None,
                str(payload.get("request") or "").strip() or None,
                applicant_id,
                resp_id,
                stage,
                user_id,
            ),
        )
        conn.commit()
        cur.execute(
            """
            SELECT c.case_id, c.build_time, c.reason, c.case_time, c.details,
                   c.request, c.stage, c.emergency_degree, r.name AS respondent_name
            FROM cases c
            JOIN characters r ON c.respondent_id = r.character_id
            WHERE c.case_id = ? AND c.owner_user_id = ?
            """,
            (case_id, user_id),
        )
        row = cur.fetchone()
    except Exception as exc:
        conn.rollback()
        return jsonify({"message": f"创建失败: {exc}"}), 400
    finally:
        cur.close()
        conn.close()

    return jsonify({"case": _case_detail_dict(row)})


def _row_to_laborer(row) -> dict:
    if not row:
        return {}
    return {
        "laborer_id": row["laborer_id"],
        "user_id": row["user_id"],
        "name": row["name"] or "",
        "relation_to_me": row["relation_to_me"] or "",
        "gender": row["gender"] or "",
        "birth_date": row["birth_date"] or "",
        "ethnicity": row["ethnicity"] or "",
        "phone": row["phone"] or "",
        "landline_phone": row["landline_phone"] or "",
        "email": row["email"] or "",
        "postal_code": row["postal_code"] or "",
        "id_card": row["id_card"] or "",
        "region": row["region"] or "",
        "home_addr": row["home_addr"] or "",
        "occupation": row["occupation"] or "",
        "school": row["school"] or "",
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def _row_to_employer(row) -> dict:
    if not row:
        return {}
    return {
        "employer_id": row["employer_id"],
        "respondent": row["respondent"] or "",
        "respondentRegisteredAddress": row["respondentRegisteredAddress"] or "",
        "respondentBusinessRegion": row["respondentBusinessRegion"] or "",
        "respondentBusinessProvince": row["respondentBusinessProvince"] or "",
        "respondentBusinessCity": row["respondentBusinessCity"] or "",
        "respondentBusinessDistrict": row["respondentBusinessDistrict"] or "",
        "respondentBusinessDetail": row["respondentBusinessDetail"] or "",
        "respondentLegalRepresentative": row["respondentLegalRepresentative"] or "",
        "respondentContactName": row["respondentContactName"] or "",
        "respondentContactJobTitle": row["respondentContactJobTitle"] or "",
        "respondentContactPhone": row["respondentContactPhone"] or "",
        "respondentPostalCode": row["respondentPostalCode"] or "",
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


@app.route("/api/cases/<case_id>/archives", methods=["GET", "OPTIONS"])
def api_case_archives(case_id: str):
    """返回当前案件已绑定的劳动者/用人单位档案（若无则为空）。"""
    if request.method == "OPTIONS":
        return ("", 204)

    user_id = resolve_user_id_from_token()
    if user_id is None:
        return jsonify({"message": "未登录或令牌无效，请重新登录"}), 401

    cid = str(case_id or "").strip()
    if not cid:
        return jsonify({"message": "无效的案件 ID"}), 400

    conn = get_connection()
    cur = conn.cursor()
    try:
        if not _case_owned(cur, cid, user_id):
            return jsonify({"message": "案件不存在或无权操作"}), 404
        cur.execute(
            "SELECT laborer_id, employer_id FROM cases WHERE case_id = ? LIMIT 1",
            (cid,),
        )
        row = cur.fetchone()
        laborer_id = str(row["laborer_id"] or "").strip() if row else ""
        employer_id = str(row["employer_id"] or "").strip() if row else ""

        laborer = None
        employer = None
        if laborer_id:
            cur.execute(
                "SELECT * FROM laborers WHERE laborer_id = ? AND owner_user_id = ? LIMIT 1",
                (laborer_id, user_id),
            )
            laborer = cur.fetchone()
        if employer_id:
            cur.execute(
                "SELECT * FROM employers WHERE employer_id = ? AND owner_user_id = ? LIMIT 1",
                (employer_id, user_id),
            )
            employer = cur.fetchone()
    finally:
        cur.close()
        conn.close()

    return jsonify(
        {
            "case_id": cid,
            "laborer": _row_to_laborer(laborer) if laborer else None,
            "employer": _row_to_employer(employer) if employer else None,
        }
    )


@app.route("/api/cases/<case_id>/laborer/import-me", methods=["POST", "OPTIONS"])
def api_case_laborer_import_me(case_id: str):
    """从当前登录用户个人中心导入劳动者档案，并绑定到案件。"""
    if request.method == "OPTIONS":
        return ("", 204)

    user_id = resolve_user_id_from_token()
    if user_id is None:
        return jsonify({"message": "未登录或令牌无效，请重新登录"}), 401

    cid = str(case_id or "").strip()
    if not cid:
        return jsonify({"message": "无效的案件 ID"}), 400

    conn = get_connection()
    cur = conn.cursor()
    try:
        if not _case_owned(cur, cid, user_id):
            return jsonify({"message": "案件不存在或无权操作"}), 404

        cur.execute(f"SELECT {_AUTH_USER_COLUMNS} FROM users WHERE user_id = ? LIMIT 1", (user_id,))
        u = cur.fetchone()
        if not u:
            return jsonify({"message": "用户不存在"}), 404

        # Upsert by user_id (one-to-one with account).
        cur.execute(
            "SELECT laborer_id FROM laborers WHERE user_id = ? AND owner_user_id = ? LIMIT 1",
            (user_id, user_id),
        )
        existing = cur.fetchone()
        laborer_id = str(existing["laborer_id"]) if existing else str(uuid.uuid4())

        payload = {
            "name": u["name"] or "",
            "relation_to_me": "本人",
            "gender": u["gender"] or "",
            "birth_date": u["birth_date"] or "",
            "ethnicity": u["ethnicity"] or "",
            "phone": u["phone"] or "",
            "landline_phone": u["landline_phone"] or "",
            "email": u["email"] or "",
            "postal_code": u["postal_code"] or "",
            "id_card": u["id_card"] or "",
            "region": u["region"] or "",
            "home_addr": u["home_addr"] or "",
            "occupation": u["job"] or "",
            "school": u["school"] or "",
        }

        if existing:
            cur.execute(
                """
                UPDATE laborers
                SET name = ?, relation_to_me = ?, gender = ?, birth_date = ?, ethnicity = ?,
                    phone = ?, landline_phone = ?, email = ?, postal_code = ?,
                    id_card = ?, region = ?, home_addr = ?, occupation = ?, school = ?,
                    updated_at = datetime('now', 'localtime')
                WHERE laborer_id = ? AND owner_user_id = ?
                """,
                (
                    payload["name"],
                    payload["relation_to_me"],
                    payload["gender"],
                    payload["birth_date"],
                    payload["ethnicity"],
                    payload["phone"],
                    payload["landline_phone"],
                    payload["email"],
                    payload["postal_code"],
                    payload["id_card"],
                    payload["region"],
                    payload["home_addr"],
                    payload["occupation"],
                    payload["school"],
                    laborer_id,
                    user_id,
                ),
            )
        else:
            cur.execute(
                """
                INSERT INTO laborers (
                    laborer_id, owner_user_id, user_id,
                    name, relation_to_me, gender, birth_date, ethnicity,
                    phone, landline_phone, email, postal_code,
                    id_card, region, home_addr, occupation, school
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    laborer_id,
                    user_id,
                    user_id,
                    payload["name"],
                    payload["relation_to_me"],
                    payload["gender"],
                    payload["birth_date"],
                    payload["ethnicity"],
                    payload["phone"],
                    payload["landline_phone"],
                    payload["email"],
                    payload["postal_code"],
                    payload["id_card"],
                    payload["region"],
                    payload["home_addr"],
                    payload["occupation"],
                    payload["school"],
                ),
            )

        cur.execute(
            "UPDATE cases SET laborer_id = ? WHERE case_id = ? AND owner_user_id = ?",
            (laborer_id, cid, user_id),
        )

        cur.execute(
            "SELECT * FROM laborers WHERE laborer_id = ? AND owner_user_id = ? LIMIT 1",
            (laborer_id, user_id),
        )
        out = cur.fetchone()
        conn.commit()
    except Exception as exc:
        conn.rollback()
        return jsonify({"message": f"导入失败: {exc}"}), 400
    finally:
        cur.close()
        conn.close()

    return jsonify({"message": "已导入", "laborer": _row_to_laborer(out), "case_id": cid})


@app.route("/api/cases/<case_id>/laborer", methods=["POST", "PATCH", "OPTIONS"])
def api_case_laborer_create(case_id: str):
    """新建或更新当前案件绑定的劳动者档案。"""
    if request.method == "OPTIONS":
        return ("", 204)

    user_id = resolve_user_id_from_token()
    if user_id is None:
        return jsonify({"message": "未登录或令牌无效，请重新登录"}), 401

    cid = str(case_id or "").strip()
    if not cid:
        return jsonify({"message": "无效的案件 ID"}), 400

    payload = request.get_json(silent=True) or {}

    def t(v, max_len=200):
        return str(v or "").strip()[:max_len]

    conn = get_connection()
    cur = conn.cursor()
    try:
        if not _case_owned(cur, cid, user_id):
            return jsonify({"message": "案件不存在或无权操作"}), 404

        if request.method == "PATCH":
            cur.execute(
                """
                SELECT l.*
                FROM cases c
                JOIN laborers l ON l.laborer_id = c.laborer_id
                WHERE c.case_id = ? AND c.owner_user_id = ? AND l.owner_user_id = ?
                LIMIT 1
                """,
                (cid, user_id, user_id),
            )
            existing = cur.fetchone()
            if not existing:
                return jsonify({"message": "请先添加劳动者档案"}), 404
            name = str(payload.get("name") or "").strip()
            if not name:
                return jsonify({"message": "姓名不能为空"}), 400
            laborer_id = str(existing["laborer_id"])
            cur.execute(
                """
                UPDATE laborers
                SET name = ?, relation_to_me = ?, gender = ?, birth_date = ?, ethnicity = ?,
                    phone = ?, landline_phone = ?, email = ?, postal_code = ?,
                    id_card = ?, region = ?, home_addr = ?, occupation = ?, school = ?,
                    updated_at = datetime('now', 'localtime')
                WHERE laborer_id = ? AND owner_user_id = ?
                """,
                (
                    t(payload.get("name"), 50),
                    t(payload.get("relation_to_me"), 40),
                    t(payload.get("gender"), 8),
                    t(payload.get("birth_date"), 40),
                    t(payload.get("ethnicity"), 20),
                    t(payload.get("phone"), 32),
                    t(payload.get("landline_phone"), 32),
                    t(payload.get("email"), 120),
                    t(payload.get("postal_code"), 12),
                    t(payload.get("id_card"), 32).upper(),
                    t(payload.get("region"), 120),
                    t(payload.get("home_addr"), 200),
                    t(payload.get("occupation"), 80),
                    t(payload.get("school"), 120),
                    laborer_id,
                    user_id,
                ),
            )
            cur.execute(
                "SELECT * FROM laborers WHERE laborer_id = ? AND owner_user_id = ? LIMIT 1",
                (laborer_id, user_id),
            )
            out = cur.fetchone()
            conn.commit()
            return jsonify({"message": "已更新", "laborer": _row_to_laborer(out), "case_id": cid})

        name = str(payload.get("name") or "").strip()
        if not name:
            return jsonify({"message": "姓名不能为空"}), 400
        laborer_id = str(uuid.uuid4())

        cur.execute(
            """
            INSERT INTO laborers (
                laborer_id, owner_user_id, user_id,
                    name, relation_to_me, gender, birth_date, ethnicity,
                phone, landline_phone, email, postal_code,
                id_card, region, home_addr, occupation, school
                ) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                laborer_id,
                user_id,
                t(payload.get("name"), 50),
                    t(payload.get("relation_to_me"), 40),
                t(payload.get("gender"), 8),
                t(payload.get("birth_date"), 40),
                t(payload.get("ethnicity"), 20),
                t(payload.get("phone"), 32),
                t(payload.get("landline_phone"), 32),
                t(payload.get("email"), 120),
                t(payload.get("postal_code"), 12),
                t(payload.get("id_card"), 32).upper(),
                t(payload.get("region"), 120),
                t(payload.get("home_addr"), 200),
                t(payload.get("occupation"), 80),
                t(payload.get("school"), 120),
            ),
        )
        cur.execute(
            "UPDATE cases SET laborer_id = ? WHERE case_id = ? AND owner_user_id = ?",
            (laborer_id, cid, user_id),
        )
        cur.execute(
            "SELECT * FROM laborers WHERE laborer_id = ? AND owner_user_id = ? LIMIT 1",
            (laborer_id, user_id),
        )
        out = cur.fetchone()
        conn.commit()
    except Exception as exc:
        conn.rollback()
        return jsonify({"message": f"创建失败: {exc}"}), 400
    finally:
        cur.close()
        conn.close()
    return jsonify({"message": "已创建", "laborer": _row_to_laborer(out), "case_id": cid})


@app.route("/api/cases/<case_id>/employer", methods=["POST", "PATCH", "OPTIONS"])
def api_case_employer_create(case_id: str):
    """新建或更新当前案件绑定的用人单位档案。"""
    if request.method == "OPTIONS":
        return ("", 204)

    user_id = resolve_user_id_from_token()
    if user_id is None:
        return jsonify({"message": "未登录或令牌无效，请重新登录"}), 401

    cid = str(case_id or "").strip()
    if not cid:
        return jsonify({"message": "无效的案件 ID"}), 400

    payload = request.get_json(silent=True) or {}

    def t(v, max_len=200):
        return str(v or "").strip()[:max_len]

    conn = get_connection()
    cur = conn.cursor()
    try:
        if not _case_owned(cur, cid, user_id):
            return jsonify({"message": "案件不存在或无权操作"}), 404

        if request.method == "PATCH":
            cur.execute(
                """
                SELECT e.*
                FROM cases c
                JOIN employers e ON e.employer_id = c.employer_id
                WHERE c.case_id = ? AND c.owner_user_id = ? AND e.owner_user_id = ?
                LIMIT 1
                """,
                (cid, user_id, user_id),
            )
            existing = cur.fetchone()
            if not existing:
                return jsonify({"message": "请先添加用人单位档案"}), 404
            respondent = str(payload.get("respondent") or "").strip()
            if not respondent:
                return jsonify({"message": "单位名称不能为空"}), 400
            employer_id = str(existing["employer_id"])
            cur.execute(
                """
                UPDATE employers
                SET respondent = ?, respondentRegisteredAddress = ?, respondentBusinessRegion = ?,
                    respondentBusinessProvince = ?, respondentBusinessCity = ?, respondentBusinessDistrict = ?,
                    respondentBusinessDetail = ?,
                    respondentLegalRepresentative = ?, respondentContactName = ?, respondentContactJobTitle = ?,
                    respondentContactPhone = ?, respondentPostalCode = ?,
                    updated_at = datetime('now', 'localtime')
                WHERE employer_id = ? AND owner_user_id = ?
                """,
                (
                    t(payload.get("respondent"), 200),
                    t(payload.get("respondentRegisteredAddress"), 200),
                    t(payload.get("respondentBusinessRegion"), 200),
                    t(payload.get("respondentBusinessProvince"), 80),
                    t(payload.get("respondentBusinessCity"), 80),
                    t(payload.get("respondentBusinessDistrict"), 80),
                    t(payload.get("respondentBusinessDetail"), 200),
                    t(payload.get("respondentLegalRepresentative"), 80),
                    t(payload.get("respondentContactName"), 80),
                    t(payload.get("respondentContactJobTitle"), 80),
                    t(payload.get("respondentContactPhone"), 32),
                    t(payload.get("respondentPostalCode"), 12),
                    employer_id,
                    user_id,
                ),
            )
            cur.execute(
                "SELECT * FROM employers WHERE employer_id = ? AND owner_user_id = ? LIMIT 1",
                (employer_id, user_id),
            )
            out = cur.fetchone()
            conn.commit()
            return jsonify({"message": "已更新", "employer": _row_to_employer(out), "case_id": cid})

        respondent = str(payload.get("respondent") or "").strip()
        if not respondent:
            return jsonify({"message": "单位名称不能为空"}), 400
        employer_id = str(uuid.uuid4())

        cur.execute(
            """
            INSERT INTO employers (
                employer_id, owner_user_id,
                respondent, respondentRegisteredAddress, respondentBusinessRegion,
                respondentBusinessProvince, respondentBusinessCity, respondentBusinessDistrict,
                respondentBusinessDetail,
                respondentLegalRepresentative, respondentContactName, respondentContactJobTitle,
                respondentContactPhone, respondentPostalCode
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                employer_id,
                user_id,
                t(payload.get("respondent"), 200),
                t(payload.get("respondentRegisteredAddress"), 200),
                t(payload.get("respondentBusinessRegion"), 200),
                t(payload.get("respondentBusinessProvince"), 80),
                t(payload.get("respondentBusinessCity"), 80),
                t(payload.get("respondentBusinessDistrict"), 80),
                t(payload.get("respondentBusinessDetail"), 200),
                t(payload.get("respondentLegalRepresentative"), 80),
                t(payload.get("respondentContactName"), 80),
                t(payload.get("respondentContactJobTitle"), 80),
                t(payload.get("respondentContactPhone"), 32),
                t(payload.get("respondentPostalCode"), 12),
            ),
        )
        cur.execute(
            "UPDATE cases SET employer_id = ? WHERE case_id = ? AND owner_user_id = ?",
            (employer_id, cid, user_id),
        )
        cur.execute(
            "SELECT * FROM employers WHERE employer_id = ? AND owner_user_id = ? LIMIT 1",
            (employer_id, user_id),
        )
        out = cur.fetchone()
        conn.commit()
    except Exception as exc:
        conn.rollback()
        return jsonify({"message": f"创建失败: {exc}"}), 400
    finally:
        cur.close()
        conn.close()

    return jsonify({"message": "已创建", "employer": _row_to_employer(out), "case_id": cid})


def _case_detail_dict(row) -> dict:
    reason = row["reason"] or "维权案件"
    out = {
        "case_id": row["case_id"],
        "title": reason if len(reason) <= 80 else reason[:77] + "…",
        "reason": row["reason"],
        "case_time": row["case_time"],
        "details": row["details"],
        "request": row["request"],
        "stage": row["stage"],
        "build_time": row["build_time"],
        "emergency_degree": row["emergency_degree"],
        "respondent_name": row["respondent_name"],
    }
    # New: archive linkage (may be absent in legacy query selections)
    out["laborer_id"] = row["laborer_id"] if "laborer_id" in row.keys() else None
    out["employer_id"] = row["employer_id"] if "employer_id" in row.keys() else None
    return out


@app.route("/api/cases/<case_id>", methods=["GET", "PATCH", "OPTIONS"])
def api_case_one(case_id: str):
    if request.method == "OPTIONS":
        return ("", 204)

    user_id = resolve_user_id_from_token()
    if user_id is None:
        return jsonify({"message": "未登录或令牌无效，请重新登录"}), 401

    cid = str(case_id or "").strip()
    if not cid:
        return jsonify({"message": "无效的案件 ID"}), 400

    conn = get_connection()
    cur = conn.cursor()
    try:
        if request.method == "PATCH":
            payload = request.get_json(silent=True) or {}
            cur.execute(
                """
                SELECT c.reason, c.case_time, c.details, c.request, c.stage, c.emergency_degree,
                       c.respondent_id, r.name AS respondent_name
                FROM cases c
                JOIN characters r ON c.respondent_id = r.character_id
                WHERE c.case_id = ? AND c.owner_user_id = ?
                LIMIT 1
                """,
                (cid, user_id),
            )
            base = cur.fetchone()
            if not base:
                return jsonify({"message": "案件不存在"}), 404

            def _pick(name: str, old_val):
                if name not in payload:
                    return old_val
                return str(payload.get(name) or "").strip() or None

            stage = _pick("stage", base["stage"])
            if stage not in ("暂存", "审核", "协商", "调解", "行政投诉", "仲裁", "诉讼", None):
                return jsonify({"message": "当前阶段不合法"}), 400
            emergency_degree = _pick("emergency_degree", base["emergency_degree"])
            if emergency_degree not in ("低", "中", "高", None):
                return jsonify({"message": "紧急程度不合法"}), 400

            respondent_name = _pick("respondent_name", base["respondent_name"])
            if "respondent_name" in payload and not respondent_name:
                return jsonify({"message": "被申请人不能为空"}), 400

            cur.execute(
                """
                UPDATE cases
                SET reason = ?, case_time = ?, details = ?, request = ?,
                    stage = ?, emergency_degree = ?
                WHERE case_id = ? AND owner_user_id = ?
                """,
                (
                    _pick("reason", base["reason"]),
                    _pick("case_time", base["case_time"]),
                    _pick("details", base["details"]),
                    _pick("request", base["request"]),
                    stage,
                    emergency_degree,
                    cid,
                    user_id,
                ),
            )
            if cur.rowcount == 0:
                conn.rollback()
                return jsonify({"message": "案件不存在"}), 404
            if "respondent_name" in payload:
                cur.execute(
                    "UPDATE characters SET name = ? WHERE character_id = ?",
                    (respondent_name, base["respondent_id"]),
                )
            conn.commit()

        cur.execute(
            """
            SELECT c.case_id, c.build_time, c.reason, c.case_time, c.details,
                   c.request, c.stage, c.emergency_degree, r.name AS respondent_name,
                   c.laborer_id, c.employer_id
            FROM cases c
            JOIN characters r ON c.respondent_id = r.character_id
            WHERE c.case_id = ? AND c.owner_user_id = ?
            """,
            (cid, user_id),
        )
        row = cur.fetchone()
    finally:
        cur.close()
        conn.close()

    if not row:
        return jsonify({"message": "案件不存在"}), 404
    return jsonify({"case": _case_detail_dict(row)})


@app.route("/api/cases/<case_id>/evidence", methods=["GET", "POST", "OPTIONS"])
def api_case_evidence_list(case_id: str):
    if request.method == "OPTIONS":
        return ("", 204)

    user_id = resolve_user_id_from_token()
    if user_id is None:
        return jsonify({"message": "未登录或令牌无效，请重新登录"}), 401

    cid = str(case_id or "").strip()
    if not cid:
        return jsonify({"message": "无效的案件 ID"}), 400

    if request.method == "POST":
        payload = request.get_json(silent=True) or {}
        name = str(payload.get("name") or "").strip()
        evidence_type = str(payload.get("evidence_type") or "").strip() or "其他证据图片"
        description = str(payload.get("description") or "").strip() or None
        source = str(payload.get("source") or "").strip()
        related_location = str(payload.get("related_location") or "").strip() or None
        related_time = str(payload.get("related_time") or "").strip() or None
        current_status = str(payload.get("current_status") or "").strip() or "已收录"
        physical_info = str(payload.get("physical_info") or "").strip() or None
        note = str(payload.get("note") or "").strip() or None

        if not name:
            return jsonify({"message": "证据名称不能为空"}), 400

        conn = get_connection()
        cur = conn.cursor()
        try:
            if not _case_owned(cur, cid, user_id):
                return jsonify({"message": "案件不存在或无权操作"}), 404

            cur.execute("SELECT name FROM users WHERE user_id = ?", (user_id,))
            urow = cur.fetchone()
            submitter = urow["name"] if urow else str(user_id)

            ev_id = str(uuid.uuid4())
            cur.execute(
                """
                INSERT INTO evidence (
                    evidence_id, name, description, evidence_type, source,
                    submitter, submission_date, related_case_id,
                    related_location, related_time, current_status,
                    physical_info, note
                ) VALUES (?, ?, ?, ?, ?, ?,
                          datetime('now', 'localtime'), ?,
                          ?, ?, ?, ?, ?)
                """,
                (
                    ev_id,
                    name,
                    description,
                    evidence_type,
                    source,
                    submitter,
                    cid,
                    related_location,
                    related_time,
                    current_status,
                    physical_info,
                    note,
                ),
            )
            if payload.get("file_path"):
                cur.execute(
                    """
                    INSERT INTO evidence_files (
                        file_id, evidence_id, case_id, file_path, original_filename,
                        mime_type, file_size, is_primary, uploaded_at
                    )
                    VALUES (?, ?, ?, ?, ?, NULL, NULL, 1, datetime('now', 'localtime'))
                    """,
                    (
                        str(uuid.uuid4()),
                        ev_id,
                        cid,
                        str(payload.get("file_path")),
                        None,
                    ),
                )
            conn.commit()
        except Exception as exc:
            conn.rollback()
            return jsonify({"message": f"添加证据失败: {exc}"}), 500
        finally:
            cur.close()
            conn.close()

        _safe_build_evidence_graph(cid, ev_id)
        return jsonify({"message": "已添加", "evidence_id": ev_id})

    conn = get_connection()
    cur = conn.cursor()
    try:
        if not _case_owned(cur, cid, user_id):
            return jsonify({"message": "案件不存在"}), 404
        cur.execute(
            """
            SELECT e.evidence_id, e.name, e.description, e.evidence_type, e.source,
                   e.submitter, e.submission_date, e.related_case_id,
                   e.related_location, e.related_time, e.current_status, e.note,
                   e.ocr_text,
                   COALESCE(
                       (
                           SELECT ef.file_path
                           FROM evidence_files ef
                           WHERE ef.evidence_id = e.evidence_id
                           ORDER BY ef.is_primary DESC, ef.uploaded_at DESC
                           LIMIT 1
                       ),
                       e.file_path
                   ) AS file_path,
                   (
                       SELECT COUNT(1)
                       FROM evidence_files ef
                       WHERE ef.evidence_id = e.evidence_id
                   ) AS attachment_count,
                   (SELECT COUNT(1) FROM evidence_revisions r WHERE r.evidence_id = e.evidence_id)
                       AS revision_count
            FROM evidence e
            WHERE e.related_case_id = ?
            ORDER BY e.submission_date DESC, e.evidence_id DESC
            """,
            (cid,),
        )
        rows = cur.fetchall()
    finally:
        cur.close()
        conn.close()

    items = []
    for r in rows:
        items.append(
            {
                "evidence_id": r["evidence_id"],
                "name": r["name"],
                "description": r["description"],
                "evidence_type": r["evidence_type"],
                "source": r["source"],
                "submitter": r["submitter"],
                "submission_date": r["submission_date"],
                "related_time": r["related_time"],
                "related_location": r["related_location"],
                "note": r["note"],
                "ocr_text": r["ocr_text"],
                "file_path": r["file_path"],
                "attachment_count": int(r["attachment_count"] or 0),
                "revision_count": int(r["revision_count"] or 0),
            }
        )
    comp = compute_material_completeness(items)
    return jsonify({"evidence": items, "completeness": comp})


@app.route(
    "/api/cases/<case_id>/evidence/<evidence_id>",
    methods=["PATCH", "POST", "OPTIONS"],
)
def api_case_evidence_update(case_id: str, evidence_id: str):
    if request.method == "OPTIONS":
        return ("", 204)

    user_id = resolve_user_id_from_token()
    if user_id is None:
        return jsonify({"message": "未登录或令牌无效，请重新登录"}), 401

    cid = str(case_id or "").strip()
    ev_id = str(evidence_id or "").strip()
    if not cid or not ev_id:
        return jsonify({"message": "无效的案件或证据 ID"}), 400

    payload = request.get_json(silent=True) or {}
    name = str(payload.get("name") or "").strip()
    evidence_type = str(payload.get("evidence_type") or "").strip() or "其他证据图片"
    description = str(payload.get("description") or "").strip() or None
    source = str(payload.get("source") or "").strip() or None
    related_location = str(payload.get("related_location") or "").strip() or None
    related_time = str(payload.get("related_time") or "").strip() or None
    note = str(payload.get("note") or "").strip() or None

    if not name:
        return jsonify({"message": "证据名称不能为空"}), 400

    conn = get_connection()
    cur = conn.cursor()
    try:
        if not _case_owned(cur, cid, user_id):
            return jsonify({"message": "案件不存在或无权操作"}), 404
        cur.execute(
            """
            SELECT name, description, evidence_type, source, related_location, related_time, note
            FROM evidence
            WHERE evidence_id = ? AND related_case_id = ?
            """,
            (ev_id, cid),
        )
        old_row = cur.fetchone()
        if not old_row:
            return jsonify({"message": "证据不存在"}), 404

        def _norm(v):
            if v is None:
                return None
            return str(v).strip() or None

        new_tuple = (
            _norm(name),
            _norm(description),
            _norm(evidence_type),
            _norm(source),
            _norm(related_location),
            _norm(related_time),
            _norm(note),
        )
        old_tuple = (
            _norm(old_row["name"]),
            _norm(old_row["description"]),
            _norm(old_row["evidence_type"]),
            _norm(old_row["source"]),
            _norm(old_row["related_location"]),
            _norm(old_row["related_time"]),
            _norm(old_row["note"]),
        )
        if old_tuple != new_tuple:
            snap = {
                "name": old_row["name"],
                "description": old_row["description"],
                "evidence_type": old_row["evidence_type"],
                "source": old_row["source"],
                "related_location": old_row["related_location"],
                "related_time": old_row["related_time"],
                "note": old_row["note"],
            }
            rev_id = str(uuid.uuid4())
            cur.execute(
                """
                INSERT INTO evidence_revisions (
                    revision_id, evidence_id, case_id, archived_at,
                    change_kind, superseded_file_path, snapshot_json
                )
                VALUES (?, ?, ?, datetime('now', 'localtime'),
                        'metadata', NULL, ?)
                """,
                (rev_id, ev_id, cid, json.dumps(snap, ensure_ascii=False)),
            )

        cur.execute(
            """
            UPDATE evidence
            SET name = ?,
                evidence_type = ?,
                description = ?,
                source = ?,
                related_location = ?,
                related_time = ?,
                note = ?
            WHERE evidence_id = ? AND related_case_id = ?
            """,
            (
                name,
                evidence_type,
                description,
                source,
                related_location,
                related_time,
                note,
                ev_id,
                cid,
            ),
        )
        if cur.rowcount == 0:
            conn.rollback()
            return jsonify({"message": "证据不存在"}), 404
        conn.commit()
    except Exception as exc:
        conn.rollback()
        return jsonify({"message": f"更新证据失败: {exc}"}), 500
    finally:
        cur.close()
        conn.close()

    _safe_build_evidence_graph(cid, ev_id)
    return jsonify({"message": "已更新", "evidence_id": ev_id})


@app.route("/api/cases/<case_id>/evidence/upload-analyze", methods=["POST", "OPTIONS"])
def api_case_evidence_upload_analyze(case_id: str):
    """
    上传证据文件（图片/PDF/Office/TXT 等），抽取文本后由证据专用大模型推断类型并写入 evidence 表。
    与 /api/chat、合同审查等接口使用独立配置与调用链（evidence_file_llm）。
    """
    if request.method == "OPTIONS":
        return ("", 204)

    user_id = resolve_user_id_from_token()
    if user_id is None:
        return jsonify({"message": "未登录或令牌无效，请重新登录"}), 401

    cid = str(case_id or "").strip()
    if not cid:
        return jsonify({"message": "无效的案件 ID"}), 400

    if "file" not in request.files:
        return jsonify({"message": "请上传文件"}), 400
    upload = request.files["file"]
    if not upload or not upload.filename:
        return jsonify({"message": "请上传文件"}), 400

    if not _allowed_evidence_attachment(upload.filename, upload.content_type):
        return (
            jsonify(
                {
                    "message": "仅支持图片、PDF、Word、Excel、TXT（jpg/png/pdf/docx/xls/xlsx/txt 等）"
                }
            ),
            400,
        )

    raw = upload.read()
    if not raw:
        return jsonify({"message": "文件为空"}), 400

    fname = upload.filename or "证据材料"

    try:
        extracted = extract_text_from_bytes(
            fname,
            upload.content_type or "",
            raw,
            ocr_image_fn=recognize_base64,
        )
    except ValueError as exc:
        return jsonify({"message": str(exc)}), 400
    except RuntimeError as exc:
        return jsonify({"message": str(exc)}), 502

    analyzed = analyze_evidence_document(
        original_filename=fname,
        extracted_text=extracted,
    )

    conn = get_connection()
    cur = conn.cursor()
    try:
        if not _case_owned(cur, cid, user_id):
            return jsonify({"message": "案件不存在或无权操作"}), 404

        cur.execute("SELECT name FROM users WHERE user_id = ?", (user_id,))
        urow = cur.fetchone()
        submitter = urow["name"] if urow else str(user_id)

        ev_id = str(uuid.uuid4())
        rel_path = save_evidence_bytes(EVIDENCE_UPLOAD_ROOT, user_id, ev_id, fname, raw)

        name = str(analyzed.get("name") or "").strip() or fname
        ev_type = str(analyzed.get("evidence_type") or "").strip() or "其他证据图片"
        description = analyzed.get("description")
        if description is not None:
            description = str(description).strip() or None
        source = str(analyzed.get("source") or "").strip() or "用户上传"
        related_time = analyzed.get("related_time")
        if related_time is not None:
            related_time = str(related_time).strip() or None
        note = analyzed.get("note")
        if note is not None:
            note = str(note).strip() or None

        ocr_store = (extracted or "")[:50000] if extracted else None

        cur.execute(
            """
            INSERT INTO evidence (
                evidence_id, name, description, evidence_type, source,
                submitter, submission_date, related_case_id,
                current_status, note, ocr_text, file_path, related_time
            )
            VALUES (?, ?, ?, ?, ?, ?,
                    datetime('now', 'localtime'), ?,
                    '已收录', ?, ?, ?, ?)
            """,
            (
                ev_id,
                name,
                description,
                ev_type,
                source,
                submitter,
                cid,
                note,
                ocr_store,
                rel_path,
                related_time,
            ),
        )
        cur.execute(
            """
            INSERT INTO evidence_files (
                file_id, evidence_id, case_id, file_path, original_filename,
                mime_type, file_size, is_primary, uploaded_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now', 'localtime'))
            """,
            (
                str(uuid.uuid4()),
                ev_id,
                cid,
                rel_path,
                fname,
                upload.content_type or None,
                len(raw),
            ),
        )
        conn.commit()
    except Exception as exc:
        conn.rollback()
        return jsonify({"message": f"保存证据失败: {exc}"}), 500
    finally:
        cur.close()
        conn.close()

    _safe_build_evidence_graph(cid, ev_id)
    return jsonify(
        {
            "message": "已添加",
            "evidence_id": ev_id,
            "name": name,
            "evidence_type": ev_type,
            "description": description,
            "source": source,
            "related_time": related_time,
            "note": note,
            "ocr_text": extracted,
            "file_path": rel_path,
        }
    )


@app.route("/api/evidence/ocr", methods=["POST", "OPTIONS"])
def api_evidence_ocr():
    """上传证据图片，有道 OCR；可选 persist 写入 evidence 表并保存文件。"""
    if request.method == "OPTIONS":
        return ("", 204)

    user_id = resolve_user_id_from_token()
    if user_id is None:
        return jsonify({"message": "未登录或令牌无效，请重新登录"}), 401

    if "file" not in request.files:
        return jsonify({"message": "请上传图片文件"}), 400
    upload = request.files["file"]
    if not upload or not upload.filename:
        return jsonify({"message": "请上传图片文件"}), 400

    if not _allowed_evidence_image(upload.filename, upload.content_type):
        return jsonify({"message": "仅支持常见图片格式（如 JPG、PNG、WEBP）"}), 400

    raw = upload.read()
    if not raw:
        return jsonify({"message": "文件为空"}), 400

    case_id = str(request.form.get("case_id") or "").strip() or None
    persist = str(request.form.get("persist") or "").lower() in (
        "1",
        "true",
        "yes",
        "on",
    )
    if persist and not case_id:
        return jsonify({"message": "保存到证据库需指定当前案件（case_id）"}), 400

    b64 = base64.b64encode(raw).decode("ascii")
    try:
        ocr_text, _result = recognize_base64(b64, "zh-CHS")
    except ValueError as exc:
        return jsonify({"message": str(exc)}), 400
    except RuntimeError as exc:
        logger.warning("evidence/ocr failed: %s", exc)
        return jsonify({"message": str(exc)}), 502

    response: dict = {
        "ocr_text": ocr_text,
        "case_id": case_id,
        "provider": "tencent_general_accurate",
        "detections": extract_detections(_result),
        "angle": _result.get("Angle"),
    }

    if persist:
        conn = get_connection()
        cur = conn.cursor()
        try:
            if not _case_owned(cur, case_id, user_id):
                return jsonify({"message": "案件不存在或无权操作"}), 404
            cur.execute("SELECT name FROM users WHERE user_id = ?", (user_id,))
            urow = cur.fetchone()
            submitter = urow["name"] if urow else str(user_id)
            ev_id = str(uuid.uuid4())
            rel_path = save_evidence_bytes(
                EVIDENCE_UPLOAD_ROOT, user_id, ev_id, upload.filename or "", raw
            )
            ev_type = infer_evidence_type(ocr_text)
            fname = upload.filename or "证据图片"
            cur.execute(
                """
                INSERT INTO evidence (
                    evidence_id, name, description, evidence_type, source,
                    submitter, submission_date, related_case_id,
                    current_status, note, ocr_text, file_path
                )
                VALUES (?, ?, ?, ?, ?, ?,
                        datetime('now', 'localtime'), ?,
                        '已收录', ?, ?, ?)
                """,
                (
                    ev_id,
                    fname,
                    (ocr_text or "")[:2000] if ocr_text else None,
                    ev_type,
                    "用户上传",
                    submitter,
                    case_id,
                    None,
                    ocr_text,
                    rel_path,
                ),
            )
            cur.execute(
                """
                INSERT INTO evidence_files (
                    file_id, evidence_id, case_id, file_path, original_filename,
                    mime_type, file_size, is_primary, uploaded_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now', 'localtime'))
                """,
                (
                    str(uuid.uuid4()),
                    ev_id,
                    case_id,
                    rel_path,
                    fname,
                    upload.content_type or None,
                    len(raw),
                ),
            )
            conn.commit()
        except Exception as exc:
            conn.rollback()
            return jsonify({"message": f"保存证据失败: {exc}"}), 500
        finally:
            cur.close()
            conn.close()
        response["evidence_id"] = ev_id
        response["evidence_type"] = ev_type
        response["persisted"] = True
        _safe_build_evidence_graph(case_id, ev_id)
    else:
        response["persisted"] = False

    return jsonify(response)


@app.route("/api/evidence/<evidence_id>/file", methods=["GET", "POST", "OPTIONS"])
def api_evidence_file(evidence_id: str):
    if request.method == "OPTIONS":
        return ("", 204)

    user_id = resolve_user_id_from_token()
    if user_id is None:
        return jsonify({"message": "未登录或令牌无效，请重新登录"}), 401

    ev_id = str(evidence_id or "").strip()
    if not ev_id:
        return jsonify({"message": "无效的证据 ID"}), 400

    case_for_graph: str | None = None
    conn = get_connection()
    cur = conn.cursor()
    try:
        owned, current_path = _evidence_owned_and_path(cur, ev_id, user_id)
        if not owned:
            return jsonify({"message": "证据不存在或无权访问"}), 404

        file_id = str(request.args.get("file_id") or "").strip()
        if request.method == "GET":
            if file_id:
                cur.execute(
                    """
                    SELECT ef.file_path
                    FROM evidence_files ef
                    WHERE ef.evidence_id = ? AND ef.file_id = ?
                    LIMIT 1
                    """,
                    (ev_id, file_id),
                )
                frow = cur.fetchone()
                current_path = str(frow["file_path"]).strip() if frow and frow["file_path"] else None
            if not current_path:
                return jsonify({"message": "该证据尚未上传文件"}), 404
            try:
                abs_path = _resolve_file_abs_path(current_path)
            except ValueError:
                return jsonify({"message": "文件路径非法"}), 400
            if not abs_path.exists() or not abs_path.is_file():
                return jsonify({"message": "文件不存在"}), 404
            mime = mimetypes.guess_type(str(abs_path))[0] or "application/octet-stream"
            return send_file(abs_path, mimetype=mime, as_attachment=False)

        if "file" not in request.files:
            return jsonify({"message": "请上传文件"}), 400
        upload = request.files["file"]
        if not upload or not upload.filename:
            return jsonify({"message": "请上传文件"}), 400
        if not _allowed_evidence_attachment(upload.filename, upload.content_type):
            return (
                jsonify(
                    {
                        "message": "仅支持图片、PDF、Word、Excel、TXT（jpg/png/pdf/doc/docx/xls/xlsx/txt）"
                    }
                ),
                400,
            )
        raw = upload.read()
        if not raw:
            return jsonify({"message": "文件为空"}), 400

        cur.execute("SELECT file_path, related_case_id FROM evidence WHERE evidence_id = ?", (ev_id,))
        erow = cur.fetchone()
        old_path = (
            str(erow["file_path"]).strip()
            if erow and erow["file_path"]
            else ""
        ) or None
        case_row_id = (
            str(erow["related_case_id"])
            if erow and erow["related_case_id"]
            else None
        )

        if old_path and case_row_id:
            rev_id = str(uuid.uuid4())
            try:
                stored_rel = archive_superseded_file_for_revision(
                    BACKEND_ROOT,
                    EVIDENCE_UPLOAD_ROOT,
                    user_id,
                    old_path,
                    upload.filename or "",
                    rev_id,
                )
            except FileNotFoundError:
                stored_rel = None
            if stored_rel:
                cur.execute(
                    """
                    INSERT INTO evidence_revisions (
                        revision_id, evidence_id, case_id, archived_at,
                        change_kind, superseded_file_path, snapshot_json
                    )
                    VALUES (?, ?, ?, datetime('now', 'localtime'),
                            'file', ?, NULL)
                    """,
                    (rev_id, ev_id, case_row_id, stored_rel),
                )

        rel_path = save_evidence_bytes(EVIDENCE_UPLOAD_ROOT, user_id, ev_id, upload.filename or "", raw)
        cur.execute("UPDATE evidence_files SET is_primary = 0 WHERE evidence_id = ?", (ev_id,))
        cur.execute(
            """
            INSERT INTO evidence_files (
                file_id, evidence_id, case_id, file_path, original_filename,
                mime_type, file_size, is_primary, uploaded_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now', 'localtime'))
            """,
            (
                str(uuid.uuid4()),
                ev_id,
                case_row_id,
                rel_path,
                upload.filename or "",
                upload.content_type or None,
                len(raw),
            ),
        )
        cur.execute(
            """
            UPDATE evidence
            SET file_path = ?,
                source = COALESCE(source, '用户上传'),
                current_status = COALESCE(current_status, '已收录')
            WHERE evidence_id = ?
            """,
            (rel_path, ev_id),
        )
        cur.execute(
            "SELECT related_case_id FROM evidence WHERE evidence_id = ?",
            (ev_id,),
        )
        crow = cur.fetchone()
        case_for_graph = str(crow["related_case_id"]) if crow and crow["related_case_id"] else None
        conn.commit()
    except Exception as exc:
        conn.rollback()
        return jsonify({"message": f"上传失败: {exc}"}), 500
    finally:
        cur.close()
        conn.close()

    if case_for_graph:
        _safe_build_evidence_graph(case_for_graph, ev_id)
    return jsonify({"message": "上传成功", "evidence_id": ev_id, "file_path": rel_path})


@app.route("/api/evidence/<evidence_id>/files", methods=["GET", "OPTIONS"])
def api_evidence_files(evidence_id: str):
    if request.method == "OPTIONS":
        return ("", 204)

    user_id = resolve_user_id_from_token()
    if user_id is None:
        return jsonify({"message": "未登录或令牌无效，请重新登录"}), 401
    ev_id = str(evidence_id or "").strip()
    if not ev_id:
        return jsonify({"message": "无效的证据 ID"}), 400

    conn = get_connection()
    cur = conn.cursor()
    try:
        owned, _ = _evidence_owned_and_path(cur, ev_id, user_id)
        if not owned:
            return jsonify({"message": "证据不存在或无权访问"}), 404
        cur.execute(
            """
            SELECT file_id, file_path, original_filename, mime_type, file_size, is_primary, uploaded_at
            FROM evidence_files
            WHERE evidence_id = ?
            ORDER BY is_primary DESC, uploaded_at DESC, file_id DESC
            """,
            (ev_id,),
        )
        rows = cur.fetchall()
    finally:
        cur.close()
        conn.close()

    files = [
        {
            "file_id": r["file_id"],
            "file_path": r["file_path"],
            "original_filename": r["original_filename"],
            "mime_type": r["mime_type"],
            "file_size": r["file_size"],
            "is_primary": bool(r["is_primary"]),
            "uploaded_at": r["uploaded_at"],
        }
        for r in rows
    ]
    return jsonify({"files": files})


@app.route("/api/evidence/<evidence_id>/reanalyze", methods=["POST", "OPTIONS"])
def api_evidence_reanalyze(evidence_id: str):
    if request.method == "OPTIONS":
        return ("", 204)

    user_id = resolve_user_id_from_token()
    if user_id is None:
        return jsonify({"message": "未登录或令牌无效，请重新登录"}), 401

    ev_id = str(evidence_id or "").strip()
    if not ev_id:
        return jsonify({"message": "无效的证据 ID"}), 400
    if "file" not in request.files:
        return jsonify({"message": "请上传文件"}), 400
    upload = request.files["file"]
    if not upload or not upload.filename:
        return jsonify({"message": "请上传文件"}), 400
    if not _allowed_evidence_attachment(upload.filename, upload.content_type):
        return (
            jsonify(
                {
                    "message": "仅支持图片、PDF、Word、Excel、TXT（jpg/png/pdf/doc/docx/xls/xlsx/txt）"
                }
            ),
            400,
        )

    raw = upload.read()
    if not raw:
        return jsonify({"message": "文件为空"}), 400

    fname = upload.filename or "证据材料"
    try:
        extracted = extract_text_from_bytes(
            fname,
            upload.content_type or "",
            raw,
            ocr_image_fn=recognize_base64,
        )
    except ValueError as exc:
        return jsonify({"message": str(exc)}), 400
    except RuntimeError as exc:
        return jsonify({"message": str(exc)}), 502

    analyzed = analyze_evidence_document(
        original_filename=fname,
        extracted_text=extracted,
    )

    conn = get_connection()
    cur = conn.cursor()
    case_id = None
    try:
        owned, _old_path = _evidence_owned_and_path(cur, ev_id, user_id)
        if not owned:
            return jsonify({"message": "证据不存在或无权操作"}), 404

        cur.execute(
            "SELECT related_case_id FROM evidence WHERE evidence_id = ?",
            (ev_id,),
        )
        row = cur.fetchone()
        case_id = str(row["related_case_id"] or "").strip() if row else ""
        if not case_id:
            return jsonify({"message": "证据缺少关联案件，无法解析"}), 400

        rel_path = save_evidence_bytes(EVIDENCE_UPLOAD_ROOT, user_id, ev_id, fname, raw)
        cur.execute("UPDATE evidence_files SET is_primary = 0 WHERE evidence_id = ?", (ev_id,))
        cur.execute(
            """
            INSERT INTO evidence_files (
                file_id, evidence_id, case_id, file_path, original_filename,
                mime_type, file_size, is_primary, uploaded_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now', 'localtime'))
            """,
            (
                str(uuid.uuid4()),
                ev_id,
                case_id,
                rel_path,
                fname,
                upload.content_type or None,
                len(raw),
            ),
        )
        name = str(analyzed.get("name") or "").strip() or fname
        ev_type = str(analyzed.get("evidence_type") or "").strip() or "其他证据图片"
        description = analyzed.get("description")
        if description is not None:
            description = str(description).strip() or None
        source = str(analyzed.get("source") or "").strip() or "用户上传"
        related_time = analyzed.get("related_time")
        if related_time is not None:
            related_time = str(related_time).strip() or None
        note = analyzed.get("note")
        if note is not None:
            note = str(note).strip() or None
        ocr_store = (extracted or "")[:50000] if extracted else None

        cur.execute(
            """
            UPDATE evidence
            SET name = ?, description = ?, evidence_type = ?, source = ?,
                file_path = ?, ocr_text = ?, note = ?, related_time = ?
            WHERE evidence_id = ? AND related_case_id = ?
            """,
            (
                name,
                description,
                ev_type,
                source,
                rel_path,
                ocr_store,
                note,
                related_time,
                ev_id,
                case_id,
            ),
        )
        if cur.rowcount == 0:
            conn.rollback()
            return jsonify({"message": "证据不存在"}), 404
        conn.commit()
    except Exception as exc:
        conn.rollback()
        return jsonify({"message": f"解析更新失败: {exc}"}), 500
    finally:
        cur.close()
        conn.close()

    _safe_build_evidence_graph(case_id, ev_id)
    return jsonify({"message": "已更新并解析", "evidence_id": ev_id})


@app.route("/api/cases/<case_id>/evidence/export.csv", methods=["GET", "OPTIONS"])
def api_case_evidence_export_csv(case_id: str):
    if request.method == "OPTIONS":
        return ("", 204)

    user_id = resolve_user_id_from_token()
    if user_id is None:
        return jsonify({"message": "未登录或令牌无效，请重新登录"}), 401

    cid = str(case_id or "").strip()
    if not cid:
        return jsonify({"message": "无效的案件 ID"}), 400

    conn = get_connection()
    cur = conn.cursor()
    try:
        bundle = _fetch_case_evidence_export_bundle(cur, cid, user_id)
    finally:
        cur.close()
        conn.close()

    if bundle is None:
        return jsonify({"message": "案件不存在或无权操作"}), 404

    csv_text = build_case_evidence_csv_rows(
        bundle["title"], list(bundle["evidence_rows"])
    )
    stub = _safe_export_filename_stub(bundle["title"])
    filename = f"{stub}_证据清单.csv"
    disp = "attachment; filename*=UTF-8''" + quote(filename)
    return Response(
        csv_text.encode("utf-8"),
        mimetype="text/csv; charset=utf-8",
        headers={"Content-Disposition": disp},
    )


@app.route("/api/cases/<case_id>/evidence/export.zip", methods=["GET", "OPTIONS"])
def api_case_evidence_export_zip(case_id: str):
    if request.method == "OPTIONS":
        return ("", 204)

    user_id = resolve_user_id_from_token()
    if user_id is None:
        return jsonify({"message": "未登录或令牌无效，请重新登录"}), 401

    cid = str(case_id or "").strip()
    if not cid:
        return jsonify({"message": "无效的案件 ID"}), 400

    conn = get_connection()
    cur = conn.cursor()
    try:
        bundle = _fetch_case_evidence_export_bundle(cur, cid, user_id)
    finally:
        cur.close()
        conn.close()

    if bundle is None:
        return jsonify({"message": "案件不存在或无权操作"}), 404

    zip_buf = build_case_evidence_zip_bytes(
        backend_root=BACKEND_ROOT,
        case_title=bundle["title"],
        evidence_rows=list(bundle["evidence_rows"]),
        revision_rows=bundle["revision_rows"],
    )
    stub = _safe_export_filename_stub(bundle["title"])
    down_name = f"{stub}_证据材料.zip"
    return send_file(
        zip_buf,
        mimetype="application/zip",
        as_attachment=True,
        download_name=down_name,
    )


@app.route(
    "/api/cases/<case_id>/evidence/<evidence_id>/revisions",
    methods=["GET", "OPTIONS"],
)
def api_case_evidence_revisions(case_id: str, evidence_id: str):
    if request.method == "OPTIONS":
        return ("", 204)

    user_id = resolve_user_id_from_token()
    if user_id is None:
        return jsonify({"message": "未登录或令牌无效，请重新登录"}), 401

    cid = str(case_id or "").strip()
    eid = str(evidence_id or "").strip()
    if not cid or not eid:
        return jsonify({"message": "无效的案件或证据 ID"}), 400

    conn = get_connection()
    cur = conn.cursor()
    try:
        if not _case_owned(cur, cid, user_id):
            return jsonify({"message": "案件不存在或无权操作"}), 404
        cur.execute(
            """
            SELECT 1 FROM evidence WHERE evidence_id = ? AND related_case_id = ?
            LIMIT 1
            """,
            (eid, cid),
        )
        if not cur.fetchone():
            return jsonify({"message": "证据不存在"}), 404
        cur.execute(
            """
            SELECT revision_id, archived_at, change_kind, superseded_file_path, snapshot_json
            FROM evidence_revisions
            WHERE case_id = ? AND evidence_id = ?
            ORDER BY archived_at DESC, revision_id DESC
            """,
            (cid, eid),
        )
        rows = cur.fetchall()
    finally:
        cur.close()
        conn.close()

    out = []
    for r in rows:
        out.append(
            {
                "revision_id": r["revision_id"],
                "archived_at": r["archived_at"],
                "change_kind": r["change_kind"],
                "has_file": bool(r["superseded_file_path"]),
                "snapshot_json": r["snapshot_json"],
            }
        )
    return jsonify({"revisions": out})


@app.route(
    "/api/evidence/<evidence_id>/revisions/<revision_id>/file",
    methods=["GET", "OPTIONS"],
)
def api_evidence_revision_file(evidence_id: str, revision_id: str):
    if request.method == "OPTIONS":
        return ("", 204)

    user_id = resolve_user_id_from_token()
    if user_id is None:
        return jsonify({"message": "未登录或令牌无效，请重新登录"}), 401

    ev_id = str(evidence_id or "").strip()
    rid = str(revision_id or "").strip()
    if not ev_id or not rid:
        return jsonify({"message": "无效的参数"}), 400

    conn = get_connection()
    cur = conn.cursor()
    try:
        ok, rel = evidence_revision_file_owned(cur, ev_id, rid, user_id)
        if not ok or not rel:
            return jsonify({"message": "历史版本不存在或无权访问"}), 404
        try:
            abs_path = _resolve_file_abs_path(rel)
        except ValueError:
            return jsonify({"message": "文件路径非法"}), 400
        if not abs_path.exists() or not abs_path.is_file():
            return jsonify({"message": "文件不存在"}), 404
        mime = mimetypes.guess_type(str(abs_path))[0] or "application/octet-stream"
    finally:
        cur.close()
        conn.close()

    return send_file(abs_path, mimetype=mime, as_attachment=False)


@app.route("/api/health", methods=["GET"])
def api_health():
    return jsonify({"status": "ok"})


@app.route("/api/consult-faqs", methods=["GET", "OPTIONS"])
def api_consult_faqs():
    """法律咨询页常见问题解答列表（支持分页、排序和关键词检索）。"""
    if request.method == "OPTIONS":
        return ("", 204)

    user_id = resolve_user_id_from_token()
    if user_id is None:
        return jsonify({"message": "未登录或令牌无效，请重新登录"}), 401

    page_raw = str(request.args.get("page") or request.args.get("pageNum") or "1").strip()
    size_raw = str(request.args.get("pageSize") or request.args.get("size") or "10").strip()
    keyword = str(request.args.get("keyword") or "").strip()
    sort_mode = str(request.args.get("sort") or "comprehensive").strip().lower()
    try:
        page = max(1, int(page_raw))
    except ValueError:
        page = 1
    try:
        page_size = int(size_raw)
        if page_size <= 0:
            page_size = 10
        page_size = min(page_size, 50)
    except ValueError:
        page_size = 10

    sort_sql = {
        "asc": "ORDER BY created_at ASC, faq_id ASC",
        "desc": "ORDER BY created_at DESC, faq_id DESC",
        "comprehensive": "ORDER BY sort_order ASC, updated_at DESC, faq_id DESC",
    }.get(sort_mode, "ORDER BY sort_order ASC, updated_at DESC, faq_id DESC")

    where_sql = "WHERE is_active = 1"
    where_args: list = []
    if keyword:
        where_sql += (
            " AND (query LIKE ? OR query_detail LIKE ? OR answer LIKE ? OR answer_detail LIKE ?)"
        )
        kw = f"%{keyword}%"
        where_args.extend([kw, kw, kw, kw])

    offset = (page - 1) * page_size
    conn = get_connection()
    cur = conn.cursor()
    try:
        cur.execute(f"SELECT COUNT(1) AS cnt FROM consult_faqs {where_sql}", where_args)
        total = int((cur.fetchone() or {"cnt": 0})["cnt"] or 0)

        cur.execute(
            f"""
            SELECT faq_id, query, query_detail, answer, answer_detail, sort_order, created_at, updated_at
            FROM consult_faqs
            {where_sql}
            {sort_sql}
            LIMIT ? OFFSET ?
            """,
            [*where_args, page_size, offset],
        )
        rows = cur.fetchall()
    finally:
        cur.close()
        conn.close()

    items = [
        {
            "faq_id": row["faq_id"],
            "query": row["query"] or "",
            "query_detail": row["query_detail"] or "",
            "answer": row["answer"] or "",
            "answer_detail": row["answer_detail"] or "",
            "sort_order": int(row["sort_order"] or 0),
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }
        for row in rows
    ]
    total_pages = max(1, (total + page_size - 1) // page_size) if total > 0 else 1
    return jsonify(
        {
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": total_pages,
            "sort": sort_mode,
            "keyword": keyword,
            "items": items,
        }
    )


def _public_consults_request_json(url: str, *, params: dict) -> dict:
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        ),
        "Accept": "application/json, text/plain, */*",
        "Referer": "https://www.12348.gov.cn/",
    }
    resp = requests.get(url, params=params, headers=headers, timeout=20)
    resp.raise_for_status()
    return resp.json()


@app.route("/api/public-consults", methods=["GET", "OPTIONS"])
def api_public_consults_list():
    """问题咨询列表（代理 12348 公开接口），返回标题与咨询时间等字段。"""
    if request.method == "OPTIONS":
        return ("", 204)

    user_id = resolve_user_id_from_token()
    if user_id is None:
        return jsonify({"message": "未登录或令牌无效，请重新登录"}), 401

    keyword = str(request.args.get("keyword") or "").strip()
    type_ = str(request.args.get("type") or "zxlx").strip() or "zxlx"
    page_num = str(request.args.get("pageNum") or request.args.get("page") or "1").strip() or "1"
    page_size = str(request.args.get("pageSize") or request.args.get("size") or "15").strip() or "15"
    try:
        pn = max(1, int(page_num))
    except ValueError:
        pn = 1
    try:
        ps = int(page_size)
        if ps <= 0:
            ps = 15
        ps = min(ps, 50)
    except ValueError:
        ps = 15

    cache_key = f"list|{type_}|{keyword}|{pn}|{ps}"
    cached = _public_consults_cache.get(cache_key)
    now = time.time()
    if cached and (now - cached[0]) < _PUBLIC_CONSULTS_CACHE_TTL_SEC:
        return jsonify(cached[1])

    try:
        raw = _public_consults_request_json(
            _PUBLIC_CONSULTS_LIST_URL,
            params={"keyword": keyword, "type": type_, "pageNum": str(pn), "pageSize": str(ps)},
        )
    except requests.RequestException as exc:
        return jsonify({"message": f"拉取问题咨询失败：{exc}"}), 502
    except ValueError:
        return jsonify({"message": "拉取问题咨询失败：上游返回非 JSON"}), 502

    items = []
    for it in (raw.get("list") or []):
        items.append(
            {
                "pkid": it.get("pkid"),
                "consulttitle": it.get("consulttitle") or "",
                "consulttime": it.get("consulttime") or "",
                "consulttype": it.get("consulttype") or "",
            }
        )

    data = {
        "total": raw.get("total", 0),
        "page": raw.get("page", pn),
        "list": items,
    }
    _public_consults_cache[cache_key] = (now, data)
    return jsonify(data)


@app.route("/api/public-consults/<pkid>", methods=["GET", "OPTIONS"])
def api_public_consults_detail(pkid: str):
    """问题咨询详情（代理 12348 公开接口），提取问题、详情、时间与回复正文等。"""
    if request.method == "OPTIONS":
        return ("", 204)

    user_id = resolve_user_id_from_token()
    if user_id is None:
        return jsonify({"message": "未登录或令牌无效，请重新登录"}), 401

    cid = str(pkid or "").strip()
    if not cid:
        return jsonify({"message": "无效的咨询 ID"}), 400

    cache_key = f"detail|{cid}"
    cached = _public_consults_cache.get(cache_key)
    now = time.time()
    if cached and (now - cached[0]) < _PUBLIC_CONSULTS_CACHE_TTL_SEC:
        return jsonify(cached[1])

    try:
        raw = _public_consults_request_json(_PUBLIC_CONSULTS_DETAIL_URL, params={"pkid": cid})
    except requests.RequestException as exc:
        return jsonify({"message": f"拉取咨询详情失败：{exc}"}), 502
    except ValueError:
        return jsonify({"message": "拉取咨询详情失败：上游返回非 JSON"}), 502

    d = raw.get("data") or {}
    replies = []
    for r in (d.get("list") or []):
        replies.append(
            {
                "lawyertype": r.get("lawyertype"),
                "lawyernumber": r.get("lawyernumber") or "",
                "expertnumber": r.get("expertnumber") or "",
                "replycontent": r.get("replycontent") or "",
                "replytime": r.get("replytime") or "",
            }
        )

    data = {
        "pkid": d.get("pkid") or cid,
        "consulttitle": d.get("consulttitle") or "",
        "consultcontent": d.get("consultcontent") or "",
        "consulttime": d.get("consulttime") or "",
        "consulttype": d.get("consulttype") or "",
        "replies": replies,
        "source_url": f"https://www.12348.gov.cn/sfbMobile/app/page/wap/consult/detail/wap_consult_detail.html?pkid={cid}",
    }
    _public_consults_cache[cache_key] = (now, data)
    return jsonify({"consult": data})


def run_server() -> None:
    initialize_database()
    app.run(host="0.0.0.0", port=8080, debug=True)


if __name__ == "__main__":
    run_server()
