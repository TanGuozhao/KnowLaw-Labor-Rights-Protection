"""证据材料智能解析：独立大模型配置与调用入口，与 chat_service / contract_review 隔离。"""

from evidence_file_llm.analyze import analyze_evidence_document
from evidence_file_llm.text_extract import extract_text_from_bytes

__all__ = ["analyze_evidence_document", "extract_text_from_bytes"]
