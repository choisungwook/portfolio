FROM python:3.12-slim

WORKDIR /app

COPY pyproject.toml uv.lock ./
COPY src ./src

RUN pip install --no-cache-dir uv \
  && uv sync --frozen --no-dev

ENV PATH="/app/.venv/bin:${PATH}" \
  PYTHONUNBUFFERED=1

EXPOSE 8000

CMD ["uvicorn", "sse_fastapi_handson.main:app", "--host", "0.0.0.0", "--port", "8000"]
