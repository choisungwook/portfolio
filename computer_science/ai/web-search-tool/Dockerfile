FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim

WORKDIR /workspace

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

COPY . .

ENV PATH="/workspace/.venv/bin:${PATH}"
