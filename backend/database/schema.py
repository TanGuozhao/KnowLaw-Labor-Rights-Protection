import sqlite3

# 表名 -> 中文释义（文档/展示用）
TABLE_LABELS_CN: dict[str, str] = {
    "users": "用户表（登录账号与鉴权）",
    "auth_tokens": "登录令牌表（Bearer token 与用户绑定，供需登录的接口校验）",
    "characters": "人物表（案件申请人/被申请人等主体信息）",
    "laborers": "劳动者表（个人中心资料快照/主体信息）",
    "employers": "用人单位表（文书生成-被投诉人字段集合）",
    "cases": "案件表",
    "evidence": "证据表",
    "evidence_files": "证据附件表（一证据多附件）",
    "handling_measures": "处理措施表",
    "conversations": "会话表（会话元数据：标题、所属用户、软删与时间）",
    "messages": "消息表（会话内消息：类型、内容、媒体与回复链）",
    "consult_faqs": "常见问题解答表（法律咨询场景 QA 文档）",
}


def create_all_tables(conn: sqlite3.Connection) -> None:
    """Create all base tables required by the system."""
    _create_users_table(conn)
    _migrate_users_if_needed(conn)
    _migrate_users_profile_columns(conn)
    _create_users_indexes(conn)
    _create_auth_tokens_table(conn)
    _create_conversations_table(conn)
    _create_messages_table(conn)
    _create_consult_faqs_table(conn)
    _create_characters_table(conn)
    _create_laborers_table(conn)
    _create_employers_table(conn)
    _create_cases_table(conn)
    _create_evidence_table(conn)
    _create_handling_measures_table(conn)
    _migrate_cases_owner_user_id(conn)
    _migrate_cases_archive_links(conn)
    _migrate_laborers_owner_columns(conn)
    _migrate_laborers_relation_column(conn)
    _migrate_employers_owner_columns(conn)
    _migrate_employers_detail_columns(conn)
    _migrate_evidence_storage_columns(conn)
    _migrate_evidence_and_measures_fk_targets(conn)
    _migrate_evidence_graph_tables(conn)
    _migrate_evidence_revisions_table(conn)
    _migrate_evidence_files_table(conn)
    conn.commit()


def _migrate_evidence_and_measures_fk_targets(conn: sqlite3.Connection) -> None:
    """
    Fix broken foreign keys referencing the temporary table `cases_old`.

    During some migrations SQLite may update FK metadata to `cases_old`, and subsequent rebuilds
    may not restore them back to `cases`. This breaks evidence insertion with:
    `no such table: main.cases_old`.
    """
    cur = conn.cursor()
    try:
        def fk_targets_cases_old(table_name: str) -> bool:
            cur.execute(f"PRAGMA foreign_key_list({table_name})")
            rows = cur.fetchall() or []
            return any((row[2] == "cases_old") for row in rows)

        need_evidence = fk_targets_cases_old("evidence")
        need_measures = fk_targets_cases_old("handling_measures")
        if not (need_evidence or need_measures):
            return

        conn.execute("PRAGMA foreign_keys = OFF")

        if need_evidence:
            # Preserve all existing columns (including ocr_text/file_path if present).
            cur.execute("PRAGMA table_info(evidence)")
            old_cols = [r[1] for r in cur.fetchall()]

            conn.execute("ALTER TABLE evidence RENAME TO evidence_old_casesfk")
            _create_evidence_table(conn)  # recreates with FK -> cases
            _migrate_evidence_storage_columns(conn)

            cur.execute("PRAGMA table_info(evidence)")
            new_cols = [r[1] for r in cur.fetchall()]
            copy_cols = [c for c in new_cols if c in old_cols]
            cols_sql = ", ".join(copy_cols)

            conn.execute(
                f"INSERT INTO evidence ({cols_sql}) SELECT {cols_sql} FROM evidence_old_casesfk"
            )
            conn.execute("DROP TABLE evidence_old_casesfk")

        if need_measures:
            cur.execute("PRAGMA table_info(handling_measures)")
            old_cols = [r[1] for r in cur.fetchall()]

            conn.execute(
                "ALTER TABLE handling_measures RENAME TO handling_measures_old_casesfk"
            )
            _create_handling_measures_table(conn)  # recreates with FK -> cases

            cur.execute("PRAGMA table_info(handling_measures)")
            new_cols = [r[1] for r in cur.fetchall()]
            copy_cols = [c for c in new_cols if c in old_cols]
            cols_sql = ", ".join(copy_cols)

            conn.execute(
                f"INSERT INTO handling_measures ({cols_sql}) SELECT {cols_sql} FROM handling_measures_old_casesfk"
            )
            conn.execute("DROP TABLE handling_measures_old_casesfk")

    finally:
        try:
            conn.execute("PRAGMA foreign_keys = ON")
        except Exception:
            # Best-effort: foreign_keys might already be ON or connection is closing.
            pass
        cur.close()


def _create_users_table(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS users (
            user_id INTEGER PRIMARY KEY AUTOINCREMENT,
            phone TEXT UNIQUE
                CHECK (phone IS NULL OR (length(phone) = 11 AND phone GLOB '[0-9]*')),
            email TEXT UNIQUE,
            name TEXT NOT NULL,
            gender TEXT NOT NULL,
            job TEXT NOT NULL,
            id_card TEXT UNIQUE,
            age INTEGER CHECK (age IS NULL OR (age >= 0 AND age <= 130)),
            region TEXT,
            home_addr TEXT,
            work_addr TEXT,
            school TEXT,
            birth_date TEXT,
            ethnicity TEXT,
            postal_code TEXT,
            landline_phone TEXT,
            role TEXT NOT NULL DEFAULT 'user'
                CHECK (role IN ('user', 'lawyer', 'admin')),
            real_name_verified INTEGER NOT NULL DEFAULT 0
                CHECK (real_name_verified IN (0, 1)),
            password_hash TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'disabled', 'locked')),
            last_login_at TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
        );
        """
    )


def _migrate_users_if_needed(conn: sqlite3.Connection) -> None:
    """Migrate legacy users table (phone as PK) to latest schema."""
    cur = conn.cursor()
    try:
        cur.execute("PRAGMA table_info(users)")
        columns = cur.fetchall()
        if not columns:
            return

        col_names = {col[1] for col in columns}
        phone_col = next((col for col in columns if col[1] == "phone"), None)

        # Legacy schema: phone is PK and new fields do not exist.
        needs_rebuild = (
            "user_id" not in col_names
            or "role" not in col_names
            or "real_name_verified" not in col_names
            or "password_hash" not in col_names
            or "status" not in col_names
            or "last_login_at" not in col_names
            or (phone_col is not None and phone_col[5] == 1)
            or (phone_col is not None and phone_col[3] == 1)
        )

        if not needs_rebuild:
            return

        conn.executescript(
            """
            ALTER TABLE users RENAME TO users_old;

            CREATE TABLE users (
                user_id INTEGER PRIMARY KEY AUTOINCREMENT,
                phone TEXT UNIQUE
                    CHECK (phone IS NULL OR (length(phone) = 11 AND phone GLOB '[0-9]*')),
                email TEXT UNIQUE,
                name TEXT NOT NULL,
                gender TEXT NOT NULL,
                job TEXT NOT NULL,
                id_card TEXT UNIQUE,
                age INTEGER CHECK (age IS NULL OR (age >= 0 AND age <= 130)),
                region TEXT,
                home_addr TEXT,
                work_addr TEXT,
                school TEXT,
                birth_date TEXT,
                ethnicity TEXT,
                postal_code TEXT,
                landline_phone TEXT,
                role TEXT NOT NULL DEFAULT 'user'
                    CHECK (role IN ('user', 'lawyer', 'admin')),
                real_name_verified INTEGER NOT NULL DEFAULT 0
                    CHECK (real_name_verified IN (0, 1)),
                password_hash TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'disabled', 'locked')),
                last_login_at TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
            );

            INSERT INTO users (
                phone, email, name, gender, job, id_card, age, region, home_addr, work_addr,
                school, birth_date, ethnicity, postal_code, landline_phone, created_at, updated_at
            )
            SELECT
                phone, email, name, gender, job, id_card, age,
                NULL AS region,
                home_addr,
                work_addr,
                NULL AS school,
                NULL AS birth_date,
                NULL AS ethnicity,
                NULL AS postal_code,
                NULL AS landline_phone,
                created_at,
                updated_at
            FROM users_old;

            DROP TABLE users_old;
            """
        )
    finally:
        cur.close()


def _migrate_users_profile_columns(conn: sqlite3.Connection) -> None:
    """Add optional profile columns for existing user tables."""
    cur = conn.cursor()
    try:
        cur.execute("PRAGMA table_info(users)")
        columns = {row[1] for row in (cur.fetchall() or [])}
        if not columns:
            return

        if "region" not in columns:
            conn.execute("ALTER TABLE users ADD COLUMN region TEXT")

        if "school" not in columns:
            conn.execute("ALTER TABLE users ADD COLUMN school TEXT")

        if "birth_date" not in columns:
            conn.execute("ALTER TABLE users ADD COLUMN birth_date TEXT")

        if "ethnicity" not in columns:
            conn.execute("ALTER TABLE users ADD COLUMN ethnicity TEXT")

        if "postal_code" not in columns:
            conn.execute("ALTER TABLE users ADD COLUMN postal_code TEXT")

        if "landline_phone" not in columns:
            conn.execute("ALTER TABLE users ADD COLUMN landline_phone TEXT")
    finally:
        cur.close()


def _create_users_indexes(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE INDEX IF NOT EXISTS idx_users_name ON users(name);
        CREATE INDEX IF NOT EXISTS idx_users_job ON users(job);
        CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
        CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
        """
    )


def _create_auth_tokens_table(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS auth_tokens (
            token TEXT PRIMARY KEY NOT NULL,
            user_id INTEGER NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
            FOREIGN KEY (user_id) REFERENCES users(user_id)
        );
        CREATE INDEX IF NOT EXISTS idx_auth_tokens_user_id ON auth_tokens(user_id);
        """
    )


def _create_conversations_table(conn: sqlite3.Connection) -> None:
    """
    会话表（设计图中的「会话消息表」实为会话维度元数据）。
    图中 LastMessageTime 与释义「最后一条消息 ID」不一致，此处用 last_message_id 存消息 ID。
    """
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS conversations (
            conversation_id TEXT PRIMARY KEY NOT NULL,
            title TEXT,
            user_id INTEGER NOT NULL,
            is_deleted INTEGER NOT NULL DEFAULT 0
                CHECK (is_deleted IN (0, 1)),
            created_time TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
            updated_time TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
            last_message_id TEXT,
            FOREIGN KEY (user_id) REFERENCES users(user_id)
        );
        CREATE INDEX IF NOT EXISTS idx_conversations_user_id
            ON conversations(user_id);
        CREATE INDEX IF NOT EXISTS idx_conversations_updated_time
            ON conversations(updated_time);
        CREATE INDEX IF NOT EXISTS idx_conversations_is_deleted
            ON conversations(is_deleted);
        """
    )


def _create_messages_table(conn: sqlite3.Connection) -> None:
    """消息表：隶属于会话，支持回复链与多媒体字段。"""
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS messages (
            message_id TEXT PRIMARY KEY NOT NULL,
            conversation_id TEXT NOT NULL,
            user_id INTEGER NOT NULL,
            message_type TEXT NOT NULL CHECK (
                message_type IN ('文本', '图片', '语音', '视频', '文件')
            ),
            content TEXT,
            file_url TEXT,
            file_size INTEGER CHECK (file_size IS NULL OR file_size >= 0),
            duration REAL CHECK (duration IS NULL OR duration >= 0),
            thumb_url TEXT,
            extra_data TEXT,
            reply_to_id TEXT,
            sequence_num INTEGER NOT NULL,
            is_deleted INTEGER NOT NULL DEFAULT 0
                CHECK (is_deleted IN (0, 1)),
            deleted_time TEXT,
            send_time TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
            FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id),
            FOREIGN KEY (user_id) REFERENCES users(user_id),
            FOREIGN KEY (reply_to_id) REFERENCES messages(message_id)
        );
        CREATE INDEX IF NOT EXISTS idx_messages_conversation_id
            ON messages(conversation_id);
        CREATE INDEX IF NOT EXISTS idx_messages_conversation_sequence
            ON messages(conversation_id, sequence_num);
        CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id);
        CREATE INDEX IF NOT EXISTS idx_messages_send_time ON messages(send_time);
        CREATE INDEX IF NOT EXISTS idx_messages_reply_to_id ON messages(reply_to_id);
        """
    )


def _create_consult_faqs_table(conn: sqlite3.Connection) -> None:
    """法律咨询场景常见问题解答（Q/A 标题 + 详情）。"""
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS consult_faqs (
            faq_id INTEGER PRIMARY KEY AUTOINCREMENT,
            query TEXT NOT NULL,
            query_detail TEXT NOT NULL DEFAULT '',
            answer TEXT NOT NULL,
            answer_detail TEXT NOT NULL DEFAULT '',
            sort_order INTEGER NOT NULL DEFAULT 0,
            is_active INTEGER NOT NULL DEFAULT 1
                CHECK (is_active IN (0, 1)),
            created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
        );
        CREATE INDEX IF NOT EXISTS idx_consult_faqs_active_order
            ON consult_faqs(is_active, sort_order, faq_id);
        """
    )


def _create_characters_table(conn: sqlite3.Connection) -> None:
    """人物表：案件申请人/被申请人引用 character_id。"""
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS characters (
            character_id TEXT PRIMARY KEY NOT NULL,
            phone TEXT
                CHECK (phone IS NULL OR (length(phone) = 11 AND phone GLOB '[0-9]*')),
            email TEXT,
            name TEXT NOT NULL,
            gender TEXT,
            job TEXT,
            id_card TEXT,
            age INTEGER CHECK (age IS NULL OR (age >= 0 AND age <= 130)),
            home_addr TEXT,
            work_addr TEXT NOT NULL DEFAULT '无'
        );
        CREATE INDEX IF NOT EXISTS idx_characters_name ON characters(name);
        """
    )


def _create_laborers_table(conn: sqlite3.Connection) -> None:
    """
    劳动者实体：字段直接对齐「个人中心」基础资料（profile 页面 payload）。
    说明：该表作为主体实体层，与登录账号 users 可选关联（user_id 唯一）。
    """
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS laborers (
            laborer_id TEXT PRIMARY KEY NOT NULL,
            owner_user_id INTEGER NOT NULL,
            user_id INTEGER UNIQUE,
            name TEXT,
            relation_to_me TEXT,
            gender TEXT,
            birth_date TEXT,
            ethnicity TEXT,
            phone TEXT,
            landline_phone TEXT,
            email TEXT,
            postal_code TEXT,
            id_card TEXT,
            region TEXT,
            home_addr TEXT,
            occupation TEXT,
            school TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
            FOREIGN KEY (owner_user_id) REFERENCES users(user_id),
            FOREIGN KEY (user_id) REFERENCES users(user_id)
        );
        """
    )


def _create_employers_table(conn: sqlite3.Connection) -> None:
    """
    用人单位实体：字段取「文书生成」中“被投诉人/被投诉单位”相关字段的并集。
    字段命名保持与前端表单/生成 payload 一致（respondent*）。
    """
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS employers (
            employer_id TEXT PRIMARY KEY NOT NULL,
            owner_user_id INTEGER NOT NULL,
            respondent TEXT,
            respondentRegisteredAddress TEXT,
            respondentBusinessRegion TEXT,
            respondentBusinessProvince TEXT,
            respondentBusinessCity TEXT,
            respondentBusinessDistrict TEXT,
            respondentBusinessDetail TEXT,
            respondentLegalRepresentative TEXT,
            respondentContactName TEXT,
            respondentContactJobTitle TEXT,
            respondentContactPhone TEXT,
            respondentPostalCode TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
            FOREIGN KEY (owner_user_id) REFERENCES users(user_id)
        );
        """
    )


def _create_cases_table(conn: sqlite3.Connection) -> None:
    """案件表；同时为 evidence.related_case_id 提供外键目标。"""
    _ensure_cases_schema(conn)


def _cases_indexes_ddl() -> str:
    return """
        CREATE INDEX IF NOT EXISTS idx_cases_applicant_id ON cases(applicant_id);
        CREATE INDEX IF NOT EXISTS idx_cases_respondent_id ON cases(respondent_id);
        CREATE INDEX IF NOT EXISTS idx_cases_stage ON cases(stage);
        """


def _cases_full_ddl() -> str:
    return (
        """
        CREATE TABLE IF NOT EXISTS cases (
            case_id TEXT PRIMARY KEY NOT NULL,
            build_time TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
            reason TEXT,
            case_time TEXT,
            details TEXT,
            request TEXT,
            applicant_id TEXT NOT NULL,
            respondent_id TEXT NOT NULL,
            stage TEXT CHECK (
                stage IS NULL OR stage IN (
                    '暂存', '审核', '协商', '调解', '行政投诉', '仲裁', '诉讼'
                )
            ),
            measure TEXT,
            emergency_degree TEXT CHECK (
                emergency_degree IS NULL OR emergency_degree IN ('低', '中', '高')
            ),
            laborer_id TEXT,
            employer_id TEXT,
            FOREIGN KEY (applicant_id) REFERENCES characters(character_id),
            FOREIGN KEY (respondent_id) REFERENCES characters(character_id),
            FOREIGN KEY (laborer_id) REFERENCES laborers(laborer_id),
            FOREIGN KEY (employer_id) REFERENCES employers(employer_id)
        );
        """
        + _cases_indexes_ddl()
    )


def _migrate_cases_archive_links(conn: sqlite3.Connection) -> None:
    """为案件补齐 laborer_id / employer_id 两个关联列（用于档案衔接）。"""
    cur = conn.cursor()
    try:
        cur.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='cases'"
        )
        if not cur.fetchone():
            return
        cur.execute("PRAGMA table_info(cases)")
        col_names = {row[1] for row in cur.fetchall()}
        if "laborer_id" not in col_names:
            cur.execute("ALTER TABLE cases ADD COLUMN laborer_id TEXT")
        if "employer_id" not in col_names:
            cur.execute("ALTER TABLE cases ADD COLUMN employer_id TEXT")
        conn.executescript(
            """
            CREATE INDEX IF NOT EXISTS idx_cases_laborer_id ON cases(laborer_id);
            CREATE INDEX IF NOT EXISTS idx_cases_employer_id ON cases(employer_id);
            """
        )
    finally:
        cur.close()


def _migrate_laborers_owner_columns(conn: sqlite3.Connection) -> None:
    """旧表 laborers 若缺少 owner_user_id，则补齐并回填。"""
    cur = conn.cursor()
    try:
        cur.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='laborers'"
        )
        if not cur.fetchone():
            return
        cur.execute("PRAGMA table_info(laborers)")
        col_names = {row[1] for row in cur.fetchall()}
        if "owner_user_id" not in col_names:
            cur.execute("ALTER TABLE laborers ADD COLUMN owner_user_id INTEGER")
            cur.execute(
                """
                UPDATE laborers
                SET owner_user_id = COALESCE(owner_user_id, user_id, (
                    SELECT user_id FROM users ORDER BY user_id ASC LIMIT 1
                ))
                WHERE owner_user_id IS NULL
                """
            )
        conn.executescript(
            """
            CREATE INDEX IF NOT EXISTS idx_laborers_owner_user_id ON laborers(owner_user_id);
            CREATE INDEX IF NOT EXISTS idx_laborers_user_id ON laborers(user_id);
            CREATE INDEX IF NOT EXISTS idx_laborers_name ON laborers(name);
            """
        )
    finally:
        cur.close()


def _migrate_laborers_relation_column(conn: sqlite3.Connection) -> None:
    """当事人与本人关系（用于后续知识图谱的人际关系建模）。"""
    cur = conn.cursor()
    try:
        cur.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='laborers'"
        )
        if not cur.fetchone():
            return
        cur.execute("PRAGMA table_info(laborers)")
        col_names = {row[1] for row in cur.fetchall()}
        if "relation_to_me" not in col_names:
            cur.execute("ALTER TABLE laborers ADD COLUMN relation_to_me TEXT")
    finally:
        cur.close()


def _migrate_employers_owner_columns(conn: sqlite3.Connection) -> None:
    """旧表 employers 若缺少 owner_user_id，则补齐并回填。"""
    cur = conn.cursor()
    try:
        cur.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='employers'"
        )
        if not cur.fetchone():
            return
        cur.execute("PRAGMA table_info(employers)")
        col_names = {row[1] for row in cur.fetchall()}
        if "owner_user_id" not in col_names:
            cur.execute("ALTER TABLE employers ADD COLUMN owner_user_id INTEGER")
            cur.execute(
                """
                UPDATE employers
                SET owner_user_id = COALESCE(owner_user_id, (
                    SELECT user_id FROM users ORDER BY user_id ASC LIMIT 1
                ))
                WHERE owner_user_id IS NULL
                """
            )
        conn.executescript(
            """
            CREATE INDEX IF NOT EXISTS idx_employers_owner_user_id ON employers(owner_user_id);
            CREATE INDEX IF NOT EXISTS idx_employers_respondent ON employers(respondent);
            """
        )
    finally:
        cur.close()


def _migrate_employers_detail_columns(conn: sqlite3.Connection) -> None:
    """补齐用人单位档案扩展字段，供文书生成精准回填。"""
    cur = conn.cursor()
    try:
        cur.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='employers'"
        )
        if not cur.fetchone():
            return
        cur.execute("PRAGMA table_info(employers)")
        col_names = {row[1] for row in cur.fetchall()}
        if "respondentBusinessDetail" not in col_names:
            cur.execute("ALTER TABLE employers ADD COLUMN respondentBusinessDetail TEXT")
    finally:
        cur.close()


def _migrate_cases_integer_applicant_to_characters(conn: sqlite3.Connection) -> None:
    """旧版 applicant_id/respondent_id 为 INTEGER 且指向 users 时，迁移为人物表 TEXT 外键。"""
    cur = conn.cursor()
    try:
        conn.execute("PRAGMA foreign_keys = OFF")
        conn.execute("ALTER TABLE cases RENAME TO cases_old")

        cur.execute(
            """
            INSERT OR IGNORE INTO characters (
                character_id, phone, email, name, gender, job, id_card, age,
                home_addr, work_addr
            )
            SELECT
                CAST(u.user_id AS TEXT),
                u.phone,
                u.email,
                u.name,
                u.gender,
                u.job,
                u.id_card,
                u.age,
                u.home_addr,
                COALESCE(NULLIF(TRIM(u.work_addr), ''), '无')
            FROM users u
            WHERE CAST(u.user_id AS TEXT) IN (
                SELECT CAST(applicant_id AS TEXT) FROM cases_old
                UNION
                SELECT CAST(respondent_id AS TEXT) FROM cases_old
            )
            """
        )

        cur.execute(
            """
            SELECT DISTINCT CAST(applicant_id AS TEXT) FROM cases_old
            UNION
            SELECT DISTINCT CAST(respondent_id AS TEXT) FROM cases_old
            """
        )
        needed = {row[0] for row in cur.fetchall()}
        cur.execute("SELECT character_id FROM characters")
        have = {row[0] for row in cur.fetchall()}
        for cid in needed - have:
            cur.execute(
                """
                INSERT INTO characters(character_id, name, work_addr)
                VALUES (?, '未知', '无')
                """,
                (cid,),
            )

        conn.executescript(
            """
            CREATE TABLE cases (
                case_id TEXT PRIMARY KEY NOT NULL,
                build_time TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
                reason TEXT,
                case_time TEXT,
                details TEXT,
                request TEXT,
                applicant_id TEXT NOT NULL,
                respondent_id TEXT NOT NULL,
                stage TEXT CHECK (
                    stage IS NULL OR stage IN (
                        '暂存', '审核', '协商', '调解', '行政投诉', '仲裁', '诉讼'
                    )
                ),
                measure TEXT,
                emergency_degree TEXT CHECK (
                    emergency_degree IS NULL OR emergency_degree IN ('低', '中', '高')
                ),
                FOREIGN KEY (applicant_id) REFERENCES characters(character_id),
                FOREIGN KEY (respondent_id) REFERENCES characters(character_id)
            );
            """
            + _cases_indexes_ddl()
        )
        cur.execute(
            """
            INSERT INTO cases (
                case_id, build_time, reason, case_time, details, request,
                applicant_id, respondent_id, stage, measure, emergency_degree
            )
            SELECT
                case_id,
                build_time,
                reason,
                case_time,
                details,
                request,
                CAST(applicant_id AS TEXT),
                CAST(respondent_id AS TEXT),
                stage,
                measure,
                emergency_degree
            FROM cases_old
            """
        )
        conn.execute("DROP TABLE cases_old")
        conn.execute("PRAGMA foreign_keys = ON")
    finally:
        cur.close()


def _ensure_cases_schema(conn: sqlite3.Connection) -> None:
    cur = conn.cursor()
    try:
        cur.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='cases'"
        )
        if not cur.fetchone():
            conn.executescript(_cases_full_ddl())
            return

        cur.execute("PRAGMA table_info(cases)")
        info_rows = cur.fetchall()
        col_names = {row[1] for row in info_rows}
        col_types = {row[1]: (row[2] or "") for row in info_rows}

        if "build_time" in col_names and "applicant_id" in col_names:
            if col_types.get("applicant_id", "").upper() == "INTEGER":
                _migrate_cases_integer_applicant_to_characters(conn)
            else:
                conn.executescript(_cases_indexes_ddl())
            return

        # Legacy: 仅含 case_id 的旧表，重建为完整案件表并保留已有 case_id。
        cur.execute("SELECT COUNT(*) FROM users")
        user_count = cur.fetchone()[0]
        if user_count == 0:
            conn.execute("PRAGMA foreign_keys = OFF")
            conn.execute("ALTER TABLE cases RENAME TO cases_old")
            cur.execute(
                """
                INSERT OR IGNORE INTO characters(character_id, name, work_addr)
                VALUES ('_legacy_placeholder', '迁移占位', '无')
                """
            )
            conn.executescript(_cases_full_ddl())
            cur.execute(
                """
                INSERT INTO cases (
                    case_id, build_time, reason, case_time, details, request,
                    applicant_id, respondent_id, stage, measure, emergency_degree
                )
                SELECT
                    case_id,
                    datetime('now', 'localtime'),
                    NULL, NULL, NULL, NULL,
                    '_legacy_placeholder', '_legacy_placeholder',
                    NULL, NULL, NULL
                FROM cases_old
                """
            )
            conn.execute("DROP TABLE cases_old")
            conn.execute("PRAGMA foreign_keys = ON")
            return

        cur.execute("SELECT MIN(user_id) FROM users")
        placeholder_uid = cur.fetchone()[0]
        cid = str(placeholder_uid)

        cur.execute(
            """
            INSERT OR IGNORE INTO characters(
                character_id, phone, email, name, gender, job, id_card, age,
                home_addr, work_addr
            )
            SELECT
                CAST(user_id AS TEXT),
                phone,
                email,
                name,
                gender,
                job,
                id_card,
                age,
                home_addr,
                COALESCE(NULLIF(TRIM(work_addr), ''), '无')
            FROM users WHERE user_id = ?
            """,
            (placeholder_uid,),
        )

        conn.execute("PRAGMA foreign_keys = OFF")
        conn.execute("ALTER TABLE cases RENAME TO cases_old")
        conn.executescript(_cases_full_ddl())
        cur.execute(
            """
            INSERT INTO cases (
                case_id, build_time, reason, case_time, details, request,
                applicant_id, respondent_id, stage, measure, emergency_degree
            )
            SELECT
                case_id,
                datetime('now', 'localtime'),
                NULL, NULL, NULL, NULL,
                ?, ?,
                NULL, NULL, NULL
            FROM cases_old
            """,
            (cid, cid),
        )
        conn.execute("DROP TABLE cases_old")
        conn.execute("PRAGMA foreign_keys = ON")
    finally:
        cur.close()


def _create_evidence_table(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS evidence (
            evidence_id TEXT PRIMARY KEY NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            evidence_type TEXT NOT NULL,
            source TEXT,
            submitter TEXT NOT NULL,
            submission_date TEXT NOT NULL,
            related_case_id TEXT NOT NULL,
            related_location TEXT,
            related_time TEXT,
            current_status TEXT,
            physical_info TEXT,
            note TEXT,
            FOREIGN KEY (related_case_id) REFERENCES cases(case_id)
        );
        CREATE INDEX IF NOT EXISTS idx_evidence_related_case_id
            ON evidence(related_case_id);
        """
    )


def _create_handling_measures_table(conn: sqlite3.Connection) -> None:
    """处理措施表：协商/调解/行政投诉/仲裁/诉讼等具体行为记录。"""
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS handling_measures (
            measure_id TEXT PRIMARY KEY NOT NULL,
            measure_name TEXT NOT NULL,
            case_id TEXT NOT NULL,
            status TEXT NOT NULL,
            result TEXT,
            FOREIGN KEY (case_id) REFERENCES cases(case_id)
        );
        CREATE INDEX IF NOT EXISTS idx_handling_measures_case_id
            ON handling_measures(case_id);
        """
    )


def _migrate_cases_owner_user_id(conn: sqlite3.Connection) -> None:
    """案件归属用户（维权行动与本人账户绑定）。"""
    cur = conn.cursor()
    try:
        cur.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='cases'"
        )
        if not cur.fetchone():
            return
        cur.execute("PRAGMA table_info(cases)")
        col_names = {row[1] for row in cur.fetchall()}
        if "owner_user_id" not in col_names:
            cur.execute("ALTER TABLE cases ADD COLUMN owner_user_id INTEGER")
            cur.execute(
                """
                UPDATE cases SET owner_user_id = (
                    SELECT user_id FROM users ORDER BY user_id ASC LIMIT 1
                )
                WHERE owner_user_id IS NULL
                AND EXISTS (SELECT 1 FROM users LIMIT 1)
                """
            )
        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_cases_owner_user_id "
            "ON cases(owner_user_id)"
        )
    finally:
        cur.close()


def _migrate_evidence_revisions_table(conn: sqlite3.Connection) -> None:
    """证据修订与附件历史版本（补传替换、信息修订）。"""
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS evidence_revisions (
            revision_id TEXT PRIMARY KEY NOT NULL,
            evidence_id TEXT NOT NULL,
            case_id TEXT NOT NULL,
            archived_at TEXT NOT NULL,
            change_kind TEXT NOT NULL,
            superseded_file_path TEXT,
            snapshot_json TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_evidence_revisions_evidence
            ON evidence_revisions(evidence_id);
        CREATE INDEX IF NOT EXISTS idx_evidence_revisions_case
            ON evidence_revisions(case_id);
        """
    )


def _migrate_evidence_storage_columns(conn: sqlite3.Connection) -> None:
    """证据 OCR 全文与保存路径。"""
    cur = conn.cursor()
    try:
        cur.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='evidence'"
        )
        if not cur.fetchone():
            return
        cur.execute("PRAGMA table_info(evidence)")
        col_names = {row[1] for row in cur.fetchall()}
        if "ocr_text" not in col_names:
            cur.execute("ALTER TABLE evidence ADD COLUMN ocr_text TEXT")
        if "file_path" not in col_names:
            cur.execute("ALTER TABLE evidence ADD COLUMN file_path TEXT")
        if "graph_scanned_at" not in col_names:
            cur.execute("ALTER TABLE evidence ADD COLUMN graph_scanned_at TEXT")
        if "graph_content_hash" not in col_names:
            cur.execute("ALTER TABLE evidence ADD COLUMN graph_content_hash TEXT")
    finally:
        cur.close()


def _migrate_evidence_files_table(conn: sqlite3.Connection) -> None:
    """证据多附件：evidence(1) -> evidence_files(N)。"""
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS evidence_files (
            file_id TEXT PRIMARY KEY NOT NULL,
            evidence_id TEXT NOT NULL,
            case_id TEXT NOT NULL,
            file_path TEXT NOT NULL,
            original_filename TEXT,
            mime_type TEXT,
            file_size INTEGER,
            is_primary INTEGER NOT NULL DEFAULT 0,
            uploaded_at TEXT NOT NULL,
            FOREIGN KEY (evidence_id) REFERENCES evidence(evidence_id),
            FOREIGN KEY (case_id) REFERENCES cases(case_id)
        );
        CREATE INDEX IF NOT EXISTS idx_evidence_files_evidence
            ON evidence_files(evidence_id, uploaded_at DESC);
        CREATE INDEX IF NOT EXISTS idx_evidence_files_case
            ON evidence_files(case_id, uploaded_at DESC);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_evidence_files_primary
            ON evidence_files(evidence_id)
            WHERE is_primary = 1;
        """
    )
    cur = conn.cursor()
    try:
        # 兼容历史数据：将 evidence.file_path 回填为首个主附件（幂等）。
        cur.execute(
            """
            SELECT e.evidence_id, e.related_case_id, e.file_path
            FROM evidence e
            WHERE COALESCE(TRIM(e.file_path), '') <> ''
              AND NOT EXISTS (
                  SELECT 1 FROM evidence_files ef
                  WHERE ef.evidence_id = e.evidence_id
              )
            """
        )
        rows = cur.fetchall() or []
        for row in rows:
            cur.execute(
                """
                INSERT INTO evidence_files (
                    file_id, evidence_id, case_id, file_path, original_filename,
                    mime_type, file_size, is_primary, uploaded_at
                )
                VALUES (?, ?, ?, ?, ?, NULL, NULL, 1, datetime('now', 'localtime'))
                """,
                (
                    row[0] + "-legacy-file",
                    row[0],
                    row[1],
                    row[2],
                    None,
                ),
            )
    finally:
        cur.close()


def _migrate_evidence_graph_tables(conn: sqlite3.Connection) -> None:
    """证据关系网：结点、边、来源、扫描状态。"""
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS evidence_graph_nodes (
            node_id TEXT PRIMARY KEY NOT NULL,
            case_id TEXT NOT NULL,
            stable_key TEXT NOT NULL,
            dedupe_key TEXT NOT NULL,
            label TEXT NOT NULL,
            kind TEXT NOT NULL,
            extra_json TEXT,
            FOREIGN KEY (case_id) REFERENCES cases(case_id)
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_evgraph_nodes_case_stable
            ON evidence_graph_nodes(case_id, stable_key);
        CREATE INDEX IF NOT EXISTS idx_evgraph_nodes_case_dedupe
            ON evidence_graph_nodes(case_id, dedupe_key);

        CREATE TABLE IF NOT EXISTS evidence_graph_edges (
            edge_id TEXT PRIMARY KEY NOT NULL,
            case_id TEXT NOT NULL,
            from_node_id TEXT NOT NULL,
            to_node_id TEXT NOT NULL,
            relation TEXT NOT NULL,
            label TEXT,
            source_ref TEXT NOT NULL,
            FOREIGN KEY (case_id) REFERENCES cases(case_id)
        );
        CREATE INDEX IF NOT EXISTS idx_evgraph_edges_case ON evidence_graph_edges(case_id);
        CREATE INDEX IF NOT EXISTS idx_evgraph_edges_source ON evidence_graph_edges(case_id, source_ref);

        CREATE TABLE IF NOT EXISTS evidence_graph_node_sources (
            node_id TEXT NOT NULL,
            case_id TEXT NOT NULL,
            source_ref TEXT NOT NULL,
            PRIMARY KEY (node_id, source_ref),
            FOREIGN KEY (node_id) REFERENCES evidence_graph_nodes(node_id)
        );
        CREATE INDEX IF NOT EXISTS idx_evgraph_ns_case ON evidence_graph_node_sources(case_id);

        CREATE TABLE IF NOT EXISTS case_graph_scan_state (
            case_id TEXT NOT NULL,
            source_key TEXT NOT NULL,
            content_hash TEXT NOT NULL,
            scanned_at TEXT NOT NULL,
            PRIMARY KEY (case_id, source_key),
            FOREIGN KEY (case_id) REFERENCES cases(case_id)
        );
        """
    )
