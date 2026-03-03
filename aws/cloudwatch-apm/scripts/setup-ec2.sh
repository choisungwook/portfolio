#!/bin/bash
set -euo pipefail

echo "=== CloudWatch APM Hands-on EC2 Setup ==="

# Install CloudWatch Agent
echo "[1/4] Installing CloudWatch Agent..."
sudo rpm -U https://amazoncloudwatch-agent.s3.amazonaws.com/amazon_linux/arm64/latest/amazon-cloudwatch-agent.rpm

# Configure CloudWatch Agent
echo "[2/4] Configuring CloudWatch Agent..."
sudo cp "$(dirname "$0")/../cloudwatch-agent/config.json" \
  /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json

# Start CloudWatch Agent
echo "[3/4] Starting CloudWatch Agent..."
sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
  -a fetch-config \
  -m ec2 \
  -s \
  -c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json

# Install Python dependencies
echo "[4/4] Installing Python dependencies..."
pip install -r "$(dirname "$0")/../python-app/requirements.txt"

# Download ADOT Java Agent
echo "[Bonus] Downloading ADOT Java Agent..."
sudo wget -q https://github.com/aws-observability/aws-otel-java-instrumentation/releases/latest/download/aws-opentelemetry-agent.jar \
  -O /opt/aws-opentelemetry-agent.jar

echo ""
echo "=== Setup Complete ==="
echo "CloudWatch Agent status:"
sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a status
echo ""
echo "Next steps:"
echo "  Python:      ./scripts/run-python.sh"
echo "  Spring Boot: ./scripts/run-springboot.sh"
