FROM python:3.14.8-slim-bookworm

ARG IMAGE_VERSION
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
WORKDIR /app
COPY server.py /app/server.py
RUN test -n "$IMAGE_VERSION" && printf '%s\n' "$IMAGE_VERSION" > /app/image-version.txt
USER 65534:65534
EXPOSE 8080
CMD ["python", "/app/server.py"]
