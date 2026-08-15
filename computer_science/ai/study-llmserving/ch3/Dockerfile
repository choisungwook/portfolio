FROM ghcr.io/astral-sh/uv:0.11.17 AS uv
FROM python:3.13-slim

COPY --from=uv /uv /uvx /bin/

WORKDIR /app

ENV HF_HOME=/hf-cache \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/opt/venv

COPY pyproject.toml uv.lock ./
RUN uv sync --locked --no-dev --no-install-project

COPY . .

EXPOSE 8000 8001

CMD ["/opt/venv/bin/python", "02_basic/serving_v1.py"]
