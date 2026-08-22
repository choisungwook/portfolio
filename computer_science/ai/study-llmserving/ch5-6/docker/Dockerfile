ARG VLLM_IMAGE=vllm/vllm-openai:v0.27.1-cu129
FROM ${VLLM_IMAGE}

RUN uv pip install --system \
    "fastapi>=0.116" \
    "httpx>=0.28" \
    "prometheus-client>=0.22" \
    "uvicorn>=0.35"

WORKDIR /workspace
ENTRYPOINT []
