from pathlib import Path


ALLOWED_IMAGE_EXT = frozenset({".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"})
ALLOWED_IMAGE_MIME = frozenset(
    {"image/jpeg", "image/png", "image/webp", "image/gif", "image/bmp"}
)
ALLOWED_ATTACHMENT_EXT = frozenset(
    {
        ".jpg",
        ".jpeg",
        ".png",
        ".webp",
        ".gif",
        ".bmp",
        ".pdf",
        ".doc",
        ".docx",
        ".xls",
        ".xlsx",
        ".txt",
    }
)
ALLOWED_ATTACHMENT_MIME = frozenset(
    {
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/gif",
        "image/bmp",
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "text/plain",
    }
)


def allowed_evidence_image(filename: str, content_type: str) -> bool:
    ct = (content_type or "").split(";")[0].strip().lower()
    if ct in ALLOWED_IMAGE_MIME:
        return True
    return Path(filename or "").suffix.lower() in ALLOWED_IMAGE_EXT


def allowed_evidence_attachment(filename: str, content_type: str) -> bool:
    ct = (content_type or "").split(";")[0].strip().lower()
    if ct in ALLOWED_ATTACHMENT_MIME:
        return True
    return Path(filename or "").suffix.lower() in ALLOWED_ATTACHMENT_EXT


def resolve_file_abs_path(backend_root: Path, file_path: str) -> Path:
    root = (backend_root / "uploads").resolve()
    target = (root / str(file_path or "")).resolve()
    if root not in target.parents and target != root:
        raise ValueError("非法文件路径")
    return target
