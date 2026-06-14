ARG NOTESMD_CLI_VERSION=0.3.6

FROM --platform=linux/amd64 nikolaik/python-nodejs:python3.14-nodejs24@sha256:7cb039cee978768dc35930cfce14156ff5b4f829661ca575c5677f085e400c60 AS base-amd64
FROM base-amd64 AS runtime-amd64
ARG NOTESMD_CLI_VERSION
ADD --checksum=sha256:e9c484adca59d46365d27a52a6a2e82f2c50b932457bef86e4972c73ccc209c2 https://github.com/Yakitrak/notesmd-cli/releases/download/v${NOTESMD_CLI_VERSION}/notesmd-cli_${NOTESMD_CLI_VERSION}_linux_amd64.tar.gz /tmp/notesmd-cli.tar.gz
RUN tar -xzf /tmp/notesmd-cli.tar.gz -C /usr/local/bin notesmd-cli \
  && chmod +x /usr/local/bin/notesmd-cli \
  && rm -f /tmp/notesmd-cli.tar.gz

FROM --platform=linux/arm64 nikolaik/python-nodejs:python3.14-nodejs24@sha256:8e496af1e388bddb5d3c05bdec2ba84f6b0e38a7bfc9dbaa6517bfe276469bc2 AS base-arm64
FROM base-arm64 AS runtime-arm64
ARG NOTESMD_CLI_VERSION
ADD --checksum=sha256:2a7d662816859a1b8f0ad25ebaadeafd7e284b0173b85ec547cb6c7b18603366 https://github.com/Yakitrak/notesmd-cli/releases/download/v${NOTESMD_CLI_VERSION}/notesmd-cli_${NOTESMD_CLI_VERSION}_linux_arm64.tar.gz /tmp/notesmd-cli.tar.gz
RUN tar -xzf /tmp/notesmd-cli.tar.gz -C /usr/local/bin notesmd-cli \
  && chmod +x /usr/local/bin/notesmd-cli \
  && rm -f /tmp/notesmd-cli.tar.gz

ARG TARGETARCH
FROM runtime-${TARGETARCH}

ARG GRAPHIFYY_VERSION=0.8.39

ENV PIP_NO_CACHE_DIR=1
ENV PYTHONDONTWRITEBYTECODE=1

LABEL org.opencontainers.image.base.name="nikolaik/python-nodejs:python3.14-nodejs24"
LABEL org.opencontainers.image.base.digest.linux-amd64="sha256:7cb039cee978768dc35930cfce14156ff5b4f829661ca575c5677f085e400c60"
LABEL org.opencontainers.image.base.digest.linux-arm64="sha256:8e496af1e388bddb5d3c05bdec2ba84f6b0e38a7bfc9dbaa6517bfe276469bc2"
LABEL org.opencontainers.image.description="nikolaik/python-nodejs base with graphify and notesmd-cli"

COPY obsidian /usr/local/bin/obsidian

RUN python -m pip install --root-user-action=ignore --no-cache-dir --no-compile "graphifyy==${GRAPHIFYY_VERSION}" \
  && npm cache clean --force \
  && rm -rf /root/.cache /root/.npm /tmp/* \
  && chmod +x /usr/local/bin/obsidian \
  && command -v notesmd-cli \
  && command -v obsidian \
  && command -v graphify
