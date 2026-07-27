FROM debian:bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
       gcc libc6-dev strace netcat-openbsd procps coreutils \
  && rm -rf /var/lib/apt/lists/*

COPY src/fileserver.c /src/fileserver.c
RUN gcc -O2 -Wall -o /usr/local/bin/fileserver /src/fileserver.c

COPY scripts/ /lab/scripts/
RUN chmod +x /lab/scripts/*.sh

WORKDIR /lab
