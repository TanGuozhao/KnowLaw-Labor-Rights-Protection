# Backend Quick Start

## 1) Install dependencies

```bash
pip install -r backend/requirements.txt
```

## 2) Configure model

Edit `backend/config/llm_config.json`:

- `api_key`: your Hunyuan API key
- `model`: model name (default `hunyuan-turbos-latest`)

If you want image/scanned-PDF OCR, also edit `backend/config/tencent_ocr_config.json`:

- `secret_id`: your Tencent Cloud SecretId
- `secret_key`: your Tencent Cloud SecretKey
- `region`: optional, can be left empty for OCR

## 3) Run API server

```bash
python backend/fastapi_server.py
```

Server address:

- `http://localhost:8080`
- health check: `GET /api/health`
- chat endpoint: `POST /api/chat`
