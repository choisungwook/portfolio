FROM mariadb:10.11
RUN apt-get update && apt-get install -y --no-install-recommends \
    iproute2 procps lsof && rm -rf /var/lib/apt/lists/*
