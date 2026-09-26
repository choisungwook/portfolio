FROM debian:trixie-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends cryptsetup-bin python3 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /lab
COPY verity_tree.py /lab/verity_tree.py
