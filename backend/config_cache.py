"""JSON 配置文件：按文件 mtime 做进程内缓存，避免每次请求读盘。"""

from __future__ import annotations

import json
from pathlib import Path

_mtimes: dict[str, float] = {}
_cache: dict[str, dict] = {}


def load_json_config(path: Path) -> dict:
    resolved = path.resolve()
    key = str(resolved)
    if not resolved.exists():
        raise FileNotFoundError(f"Config not found: {resolved}")
    mtime = resolved.stat().st_mtime
    if key in _cache and _mtimes.get(key) == mtime:
        return _cache[key]
    with resolved.open("r", encoding="utf-8") as f:
        data = json.load(f)
    _cache[key] = data
    _mtimes[key] = mtime
    return data
