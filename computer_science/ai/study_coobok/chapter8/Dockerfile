FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_LINK_MODE=copy

RUN pip install --no-cache-dir uv

WORKDIR /app

COPY pyproject.toml ./
COPY src ./src
RUN uv sync --frozen 2>/dev/null || uv sync

COPY mock_data ./mock_data

ENTRYPOINT ["uv", "run"]
CMD ["copilot"]
