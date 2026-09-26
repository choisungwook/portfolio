FROM ubuntu:24.04

RUN apt-get update \
  && apt-get install -y --no-install-recommends cryptsetup-bin e2fsprogs xxd \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /lab
