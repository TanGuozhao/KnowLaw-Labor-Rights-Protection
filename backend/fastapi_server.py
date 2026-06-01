from fastapi import FastAPI
from fastapi.middleware.wsgi import WSGIMiddleware
import uvicorn

from server import app as flask_app
from database import initialize_database

app = FastAPI(title="LabelHelp API", version="1.0.0")
app.mount("/", WSGIMiddleware(flask_app))


def run_server() -> None:
  initialize_database()
  uvicorn.run(app, host="0.0.0.0", port=8080)


if __name__ == "__main__":
  run_server()
