FROM nvidia/cuda:12.8.1-runtime-ubuntu24.04

ENV DEBIAN_FRONTEND=noninteractive
ENV VIRTUAL_ENV=/opt/venv
ENV PATH="$VIRTUAL_ENV/bin:$PATH"
ENV PYTHONUNBUFFERED=1

RUN apt-get update \
  && apt-get install -y python3.12 python3.12-venv python3-pip \
  && rm -rf /var/lib/apt/lists/*

RUN python3.12 -m venv "$VIRTUAL_ENV" \
  && pip install --upgrade pip uv \
  && uv pip install --python "$VIRTUAL_ENV/bin/python" \
    torch \
    transformers \
    peft \
    accelerate \
    sentencepiece \
    protobuf \
    fastapi \
    uvicorn

WORKDIR /app

EXPOSE 80

COPY main.py /app/main.py

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "80"]
