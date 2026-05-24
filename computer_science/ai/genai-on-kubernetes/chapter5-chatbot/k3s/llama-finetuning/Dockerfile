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
    datasets \
    peft \
    accelerate \
    sentencepiece \
    protobuf

WORKDIR /app

COPY fine_tune.py /app/fine_tune.py

CMD ["python", "fine_tune.py"]
