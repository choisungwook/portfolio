FROM docker.litellm.ai/berriai/litellm:main-latest

COPY ecs_litellm_config.yaml /app/config.yaml

CMD ["--config", "/app/config.yaml", "--port", "4000"]
