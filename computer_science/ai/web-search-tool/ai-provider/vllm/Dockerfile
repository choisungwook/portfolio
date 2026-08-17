ARG VLLM_BASE_IMAGE=vllm/vllm-openai-cpu:latest
FROM ${VLLM_BASE_IMAGE}

RUN /opt/venv/bin/python -m pip install --no-cache-dir "mcp>=1.29,<2"
