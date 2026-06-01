"""整案证据导出：清单 CSV、ZIP（含当前附件与历史文件版本）。"""

from __future__ import annotations

import csv
import io
import re
import zipfile
from pathlib import Path
from typing import Any

from evidence_common import resolve_file_abs_path


def _safe_zip_segment(name: str, max_len: int = 56) -> str:
    s = re.sub(r'[\s<>:"/\\|?*]+', "_", (name or "").strip())
    s = re.sub(r"_+", "_", s).strip("._") or "item"
    return s[:max_len]


def _utf8_sig_csv() -> str:
    return "\ufeff"


def _row_get(r: Any, key: str, default: Any = None) -> Any:
    try:
        return r[key]
    except (KeyError, TypeError, IndexError):
        pass
    if isinstance(r, dict):
        return r.get(key, default)
    return getattr(r, key, default)


def build_case_evidence_csv_rows(
    case_title: str,
    evidence_rows: list[Any],
) -> str:
    """返回含 BOM 的 CSV 文本，便于 Excel 打开中文。"""
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["案件标题", case_title])
    w.writerow([])
    w.writerow(
        [
            "序号",
            "证据名称",
            "证据类型",
            "提交日期",
            "关联时间",
            "来源",
            "备注",
            "是否有附件",
            "证据ID",
            "历史记录条数",
        ]
    )
    for i, r in enumerate(evidence_rows, start=1):
        fp = _row_get(r, "file_path")
        rev_c = _row_get(r, "revision_count") or 0
        w.writerow(
            [
                i,
                _row_get(r, "name"),
                _row_get(r, "evidence_type"),
                _row_get(r, "submission_date"),
                _row_get(r, "related_time"),
                _row_get(r, "source"),
                _row_get(r, "note"),
                "是" if fp else "否",
                _row_get(r, "evidence_id"),
                rev_c,
            ]
        )
    return _utf8_sig_csv() + buf.getvalue()


def build_case_evidence_revision_csv(revision_rows: list[dict[str, Any]]) -> str:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(
        [
            "修订时间",
            "证据名称_当前",
            "类型",
            "文件历史在压缩包中的路径",
            "元数据修订摘要",
        ]
    )
    for row in revision_rows:
        w.writerow(
            [
                row.get("archived_at"),
                row.get("evidence_name"),
                row.get("change_kind"),
                row.get("zip_inner_path") or "",
                row.get("meta_summary") or "",
            ]
        )
    return _utf8_sig_csv() + buf.getvalue()


def build_case_evidence_zip_bytes(
    *,
    backend_root: Path,
    case_title: str,
    evidence_rows: list[Any],
    revision_rows: list[dict[str, Any]],
) -> io.BytesIO:
    """
    revision_rows: 每项含 evidence_name, archived_at, change_kind, superseded_file_path, meta_summary, zip_inner_path（可先空，由本函数填写）.
    实际写入 zip 时，对 file 类修订从 superseded_file_path 读盘。
    """
    zip_buf = io.BytesIO()
    ev_order: dict[str, int] = {}
    ev_name_by_id: dict[str, str] = {}
    for i, r in enumerate(evidence_rows, start=1):
        eid = str(_row_get(r, "evidence_id") or "")
        ev_order[eid] = i
        ev_name_by_id[eid] = str(_row_get(r, "name") or "")

    arc_REVISION: list[dict[str, Any]] = []

    with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zf:
        manifest_rows = []
        for i, r in enumerate(evidence_rows, start=1):
            eid = str(_row_get(r, "evidence_id") or "")
            nm = str(_row_get(r, "name") or "证据")
            fp = _row_get(r, "file_path")
            rev_c = _row_get(r, "revision_count") or 0
            inner = ""
            if fp:
                try:
                    abs_p = resolve_file_abs_path(backend_root, fp)
                except ValueError:
                    abs_p = None
                if abs_p and abs_p.is_file():
                    ext = abs_p.suffix or Path(str(fp)).suffix or ".bin"
                    inner = f"当前附件/{i:03d}_{_safe_zip_segment(nm)}_{eid[-8:]}{ext}"
                    zf.write(abs_p, inner)
            manifest_rows.append(
                {
                    "evidence_id": eid,
                    "name": _row_get(r, "name"),
                    "evidence_type": _row_get(r, "evidence_type"),
                    "submission_date": _row_get(r, "submission_date"),
                    "related_time": _row_get(r, "related_time"),
                    "source": _row_get(r, "source"),
                    "note": _row_get(r, "note"),
                    "file_path": fp,
                    "revision_count": rev_c,
                    "zip_current_attachment": inner,
                }
            )

        # 清单 CSV（增强列：压缩包内当前附件路径）
        buf_m = io.StringIO()
        wm = csv.writer(buf_m)
        wm.writerow(
            [
                "序号",
                "证据名称",
                "证据类型",
                "提交日期",
                "关联时间",
                "来源",
                "备注",
                "压缩包内当前附件路径",
                "证据ID",
                "历史记录条数",
            ]
        )
        for row in manifest_rows:
            idx = ev_order[str(row["evidence_id"])]
            wm.writerow(
                [
                    idx,
                    row.get("name"),
                    row.get("evidence_type"),
                    row.get("submission_date"),
                    row.get("related_time"),
                    row.get("source"),
                    row.get("note"),
                    row.get("zip_current_attachment") or "",
                    row.get("evidence_id"),
                    row.get("revision_count") or 0,
                ]
            )
        case_csv = (
            _utf8_sig_csv()
            + f"案件标题,{case_title}\n"
            + buf_m.getvalue()
        )
        zf.writestr("证据清单.csv", case_csv.encode("utf-8"))

        for rev in revision_rows:
            eid = str(rev.get("evidence_id") or "")
            idx = ev_order.get(eid, 0)
            nm = rev.get("evidence_name") or ev_name_by_id.get(eid) or "证据"
            ck = rev.get("change_kind")
            zip_inner = ""
            if ck == "file" and rev.get("superseded_file_path"):
                try:
                    abs_p = resolve_file_abs_path(
                        backend_root, str(rev["superseded_file_path"])
                    )
                except ValueError:
                    abs_p = None
                if abs_p and abs_p.is_file():
                    ext = abs_p.suffix or ".bin"
                    ts = str(rev.get("archived_at") or "").replace(":", "").replace(" ", "_")
                    rid = str(rev.get("revision_id") or "")[:8]
                    zip_inner = (
                        f"历史版本/{idx:03d}_{_safe_zip_segment(nm)}/"
                        f"{ts}_rev{rid}{ext}"
                    )
                    zf.write(abs_p, zip_inner)
            summary = rev.get("meta_summary") or ""
            arc_REVISION.append(
                {
                    "archived_at": rev.get("archived_at"),
                    "evidence_name": nm,
                    "change_kind": "文件替换" if ck == "file" else "信息修订",
                    "zip_inner_path": zip_inner,
                    "meta_summary": summary,
                }
            )

        rev_csv = build_case_evidence_revision_csv(arc_REVISION)
        zf.writestr("修订与历史版本.csv", rev_csv.encode("utf-8"))

    zip_buf.seek(0)
    return zip_buf

