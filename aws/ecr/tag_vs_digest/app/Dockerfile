FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim

ARG IMAGE_REVISION=unknown
LABEL org.opencontainers.image.revision=$IMAGE_REVISION

WORKDIR /app

COPY requirements.txt .
RUN uv pip install --system --no-cache -r requirements.txt

COPY main.py .

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
