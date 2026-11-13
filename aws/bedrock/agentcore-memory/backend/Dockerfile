FROM python:3.13-slim
COPY --from=ghcr.io/astral-sh/uv:0.11.17 /uv /bin/uv
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY app.py memory.py ./
ENV PATH="/app/.venv/bin:$PATH"
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
