from pathlib import Path

from openai import OpenAI

from config_cache import load_json_config


CONFIG_PATH = Path(__file__).resolve().parent / "config" / "llm_config.json"


def load_llm_config() -> dict:
    try:
        return load_json_config(CONFIG_PATH)
    except FileNotFoundError as exc:
        raise FileNotFoundError(f"LLM config not found: {CONFIG_PATH}") from exc


def chat_completion(messages: list[dict], *, max_tokens: int | None = None) -> str:
    config = load_llm_config()
    api_key = config.get("api_key", "").strip()
    base_url = config.get("base_url", "https://api.hunyuan.cloud.tencent.com/v1")
    model = config.get("model", "hunyuan-turbos-latest")
    enable_enhancement = bool(config.get("enable_enhancement", True))

    if not api_key or api_key == "REPLACE_WITH_HUNYUAN_API_KEY":
        raise ValueError("请先在 backend/config/llm_config.json 中填写有效的 api_key")

    client = OpenAI(api_key=api_key, base_url=base_url)
    kwargs: dict = {
        "model": model,
        "messages": messages,
        "extra_body": {"enable_enhancement": enable_enhancement},
    }
    if max_tokens is not None:
        kwargs["max_tokens"] = max_tokens
    completion = client.chat.completions.create(**kwargs)

    return completion.choices[0].message.content or ""
