"""合同审查场景下的大模型调用（OpenAI SDK 兼容接口，可与腾讯混元等网关对接）。"""

from __future__ import annotations

from openai import OpenAI

from contract_review.llm_settings import load_contract_review_settings


def _build_client(cfg: dict) -> OpenAI:
    api_key = str(cfg.get("api_key", "")).strip()
    if not api_key or api_key == "REPLACE_WITH_HUNYUAN_API_KEY":
        raise ValueError(
            "请先在 backend/config/llm_config.json 中填写有效的 api_key（与法律咨询共用）。"
        )
    base_url = str(cfg.get("base_url") or "https://api.openai.com/v1").strip()
    return OpenAI(api_key=api_key, base_url=base_url)


def contract_review_chat(
    messages: list[dict[str, str]],
    *,
    temperature: float | None = None,
    max_tokens: int | None = None,
    model: str | None = None,
) -> str:
    """
    发送聊天补全请求。messages 为 OpenAI 格式的 role/content 列表。
    未传入的 temperature / max_tokens / model 取自合并后的合同审查配置。
    """
    cfg = load_contract_review_settings()
    client = _build_client(cfg)

    m = (model or str(cfg.get("model") or "").strip() or "hunyuan-turbos-latest").strip()
    temp = temperature if temperature is not None else cfg.get("temperature")
    mt = max_tokens if max_tokens is not None else cfg.get("max_tokens")

    kwargs: dict = {"model": m, "messages": messages}
    if temp is not None:
        kwargs["temperature"] = float(temp)
    if mt is not None:
        kwargs["max_tokens"] = int(mt)

    if "enable_enhancement" in cfg:
        kwargs["extra_body"] = {"enable_enhancement": bool(cfg.get("enable_enhancement"))}

    completion = client.chat.completions.create(**kwargs)
    return completion.choices[0].message.content or ""
