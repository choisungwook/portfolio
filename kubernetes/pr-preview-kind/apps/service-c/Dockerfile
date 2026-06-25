FROM ghcr.io/astral-sh/uv:0.7.13-python3.12-bookworm

WORKDIR /app

COPY pyproject.toml ./
RUN uv pip install --system fastapi==0.115.14 httpx==0.28.1 "uvicorn[standard]==0.35.0"

COPY service_c ./service_c

EXPOSE 8080

CMD ["uvicorn", "service_c.main:app", "--host", "0.0.0.0", "--port", "8080"]
