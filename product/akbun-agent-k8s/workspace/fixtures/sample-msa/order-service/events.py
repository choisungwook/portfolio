"""Event publishing to the shared message broker."""

import json
import os

import redis

broker = redis.Redis.from_url(os.environ.get("BROKER_URL", "redis://broker:6379"))


def publish(topic: str, payload: dict) -> None:
  """Publish one event to the broker."""
  broker.publish(topic, json.dumps(payload))
