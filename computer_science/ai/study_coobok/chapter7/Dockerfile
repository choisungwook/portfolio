FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_LINK_MODE=copy

RUN pip install --no-cache-dir uv

WORKDIR /app

COPY pyproject.toml ./
RUN uv sync 2>/dev/null || uv sync

COPY src ./src

EXPOSE 8000

# 실행 버전은 docker-compose.yml의 command에서 선택한다.
# 예: uv run python src/main_v1.py
CMD ["uv", "run", "python", "src/main_v4.py"]
