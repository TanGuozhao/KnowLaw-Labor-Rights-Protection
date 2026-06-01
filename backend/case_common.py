def ensure_applicant_character(conn, user_id: int) -> str:
    cur = conn.cursor()
    cur.execute("SELECT * FROM users WHERE user_id = ?", (user_id,))
    row = cur.fetchone()
    if not row:
        raise ValueError("用户不存在")
    cid = str(user_id)
    cur.execute("SELECT 1 FROM characters WHERE character_id = ?", (cid,))
    if cur.fetchone():
        return cid
    cur.execute(
        """
        INSERT INTO characters (
            character_id, phone, email, name, gender, job, id_card, age,
            home_addr, work_addr
        )
        VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)
        """,
        (
            cid,
            row["phone"],
            row["email"],
            row["name"],
            row["gender"],
            row["job"],
            row["home_addr"],
            row["work_addr"] or "无",
        ),
    )
    return cid


def case_owned(cur, case_id: str, user_id: int) -> bool:
    cur.execute(
        """
        SELECT 1 FROM cases
        WHERE case_id = ? AND owner_user_id = ?
        LIMIT 1
        """,
        (case_id, user_id),
    )
    return cur.fetchone() is not None


def evidence_owned_and_path(cur, evidence_id: str, user_id: int) -> tuple[bool, str | None]:
    cur.execute(
        """
        SELECT COALESCE(
            (
                SELECT ef.file_path
                FROM evidence_files ef
                WHERE ef.evidence_id = e.evidence_id
                ORDER BY ef.is_primary DESC, ef.uploaded_at DESC
                LIMIT 1
            ),
            e.file_path
        ) AS file_path
        FROM evidence e
        JOIN cases c ON c.case_id = e.related_case_id
        WHERE e.evidence_id = ? AND c.owner_user_id = ?
        LIMIT 1
        """,
        (evidence_id, user_id),
    )
    row = cur.fetchone()
    if not row:
        return (False, None)
    return (True, row["file_path"])


def evidence_revision_file_owned(
    cur, evidence_id: str, revision_id: str, user_id: int
) -> tuple[bool, str | None]:
    """校验历史版本文件归属；返回 (是否允许, superseded_file_path)。"""
    cur.execute(
        """
        SELECT r.superseded_file_path, r.change_kind
        FROM evidence_revisions r
        JOIN cases c ON c.case_id = r.case_id
        WHERE r.revision_id = ?
          AND r.evidence_id = ?
          AND c.owner_user_id = ?
        LIMIT 1
        """,
        (revision_id, evidence_id, user_id),
    )
    row = cur.fetchone()
    if not row:
        return (False, None)
    if str(row["change_kind"] or "") != "file":
        return (False, None)
    path = row["superseded_file_path"]
    if not path:
        return (False, None)
    return (True, str(path))
