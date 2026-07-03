FROM amazonlinux:2023

RUN dnf -y install procps-ng psmisc lsof && dnf clean all

WORKDIR /workspace

COPY scripts/ /workspace/scripts/

RUN chmod +x /workspace/scripts/*.sh /workspace/scripts/*.py

CMD ["/bin/bash"]
