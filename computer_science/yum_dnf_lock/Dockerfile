FROM amazonlinux:2023

RUN dnf -y install \
    findutils \
    lsof \
    procps-ng \
    psmisc \
    python3 \
    util-linux \
  && dnf clean all

RUN ln -sf /usr/bin/python3 /usr/local/bin/python

WORKDIR /lab

COPY scripts/ /lab/scripts/

RUN chmod +x /lab/scripts/*.sh

CMD ["sleep", "infinity"]
