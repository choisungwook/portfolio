FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir \
    tensorflow==2.19.0 \
    numpy \
    scipy \
    matplotlib \
    pandas
