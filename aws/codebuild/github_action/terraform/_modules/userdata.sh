#!/bin/bash
set -e

NEXUS_ADMIN_PASSWORD="${nexus_admin_password}"
NEXUS_DATA_DIR="/opt/nexus-data"

log() {
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1"
}

log "Starting Nexus installation with Docker Compose..."

log "Installing Docker..."
dnf install -y docker

log "Starting Docker service..."
systemctl enable docker
systemctl start docker

log "Installing Docker Compose..."
DOCKER_COMPOSE_VERSION="v2.40.1"
curl -L "https://github.com/docker/compose/releases/download/$${DOCKER_COMPOSE_VERSION}/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose
ln -sf /usr/local/bin/docker-compose /usr/bin/docker-compose

log "Creating Nexus data directory..."
mkdir -p $NEXUS_DATA_DIR
chown -R 200:200 $NEXUS_DATA_DIR

log "Creating docker-compose.yml..."
cat > /opt/docker-compose.yml <<EOF
version: '3.8'

services:
  nexus:
    image: sonatype/nexus3:3.85.0
    container_name: nexus
    restart: unless-stopped
    ports:
      - "8081:8081"
    volumes:
      - nexus-data:/nexus-data
    environment:
      - INSTALL4J_ADD_VM_PARAMS=-Xms1024m -Xmx1024m -XX:MaxDirectMemorySize=1024m

volumes:
  nexus-data:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: $NEXUS_DATA_DIR
EOF

log "Starting Nexus with Docker Compose..."
cd /opt
docker-compose up -d

log "Waiting for Nexus to start..."
for i in {1..10}; do
  if docker exec nexus test -f /nexus-data/admin.password 2>/dev/null; then
    log "Nexus started successfully"
    break
  fi
  sleep 5
done

if ! docker exec nexus test -f /nexus-data/admin.password 2>/dev/null; then
  log "ERROR: Nexus did not start within expected time"
  docker-compose logs
  exit 1
fi

log "Waiting for Nexus API to be ready..."
for i in {1..60}; do
  if curl -s -f http://localhost:8081/ > /dev/null 2>&1; then
    log "Nexus API is ready"
    break
  fi
  sleep 5
done

log "Configuring admin password..."
INITIAL_PASSWORD=$(docker exec nexus cat /nexus-data/admin.password)

curl -u admin:$INITIAL_PASSWORD -X PUT \
  -H "Content-Type: text/plain" \
  -d "$NEXUS_ADMIN_PASSWORD" \
  http://localhost:8081/service/rest/v1/security/users/admin/change-password

# log "Disabling anonymous access..."
curl -u admin:$NEXUS_ADMIN_PASSWORD -X PUT \
  -H "Content-Type: application/json" \
  -d '{"enabled": false, "userId": "anonymous", "realmName": "NexusAuthorizingRealm"}' \
  http://localhost:8081/service/rest/v1/security/anonymous

log "Nexus installation and configuration completed successfully"
log "Nexus URL: http://localhost:8081"
log "Admin username: admin"
log "Admin password: [configured]"
log "Data directory: $NEXUS_DATA_DIR"
