"""Entry point. `06_multimodel` is not a valid module name, so put this
directory on sys.path and import the `app` package from here."""

import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import uvicorn  # noqa: E402
from app.server import app  # noqa: E402,F401

if __name__ == "__main__":
  uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8001")))
