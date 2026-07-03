FROM quay.io/centos/centos:stream9

RUN dnf -y install \
    bash \
    findutils \
    lsof \
    procps-ng \
    psmisc \
    python3 \
    which \
  && dnf clean all

WORKDIR /workspace
