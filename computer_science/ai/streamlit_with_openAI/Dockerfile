FROM python:3.12-slim

ENV UV_LINK_MODE=copy \
    UV_COMPILE_BYTECODE=1 \
    PATH="/app/.venv/bin:${PATH}"

COPY --from=ghcr.io/astral-sh/uv:0.7.16 /uv /uvx /usr/local/bin/

WORKDIR /app

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

COPY src ./src

EXPOSE 8501

ARG APP=src/v4_chat.py
ENV APP=${APP}

CMD ["sh", "-c", "streamlit run ${APP} --server.address=0.0.0.0 --server.port=8501 --server.headless=true"]
