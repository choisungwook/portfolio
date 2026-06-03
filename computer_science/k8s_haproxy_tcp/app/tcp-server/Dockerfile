FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim

WORKDIR /app

ENV PYTHONUNBUFFERED=1
ENV UV_LINK_MODE=copy

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

COPY tcp-server/server.py ./
RUN chmod -R a+rX /app

USER 65532:65532

EXPOSE 9090

CMD ["/app/.venv/bin/python", "server.py"]
