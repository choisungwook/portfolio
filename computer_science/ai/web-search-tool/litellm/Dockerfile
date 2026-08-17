ARG LITELLM_BASE_IMAGE=ghcr.io/berriai/litellm:main-latest
FROM ${LITELLM_BASE_IMAGE}

RUN /app/.venv/bin/python -m ensurepip \
  && /app/.venv/bin/python -m pip install --no-cache-dir "boto3[crt]"
