# ECS 배포용 이미지. buildx의 TARGETARCH로 arm64/amd64를 모두 지원한다.
FROM rust:1-bookworm AS build
WORKDIR /src
COPY Cargo.toml ./
COPY src ./src
RUN cargo build --release

FROM debian:bookworm-slim
ARG TERRAFORM_VERSION=1.15.8
ARG TARGETARCH
RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates curl unzip \
  && rm -rf /var/lib/apt/lists/*
RUN curl -fsSL "https://releases.hashicorp.com/terraform/${TERRAFORM_VERSION}/terraform_${TERRAFORM_VERSION}_linux_${TARGETARCH}.zip" -o /tmp/terraform.zip \
  && unzip /tmp/terraform.zip -d /usr/local/bin \
  && rm /tmp/terraform.zip
COPY --from=build /src/target/release/akbun-terraform-apply-remote /usr/local/bin/akbun-terraform-apply-remote
ENV ATR_DATA_DIR=/data
EXPOSE 4141
ENTRYPOINT ["akbun-terraform-apply-remote"]
