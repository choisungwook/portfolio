"""Notification worker: emails customers when order events arrive."""

import json
import os
import smtplib

import redis

broker = redis.Redis.from_url(os.environ.get("BROKER_URL", "redis://broker:6379"))
SMTP_HOST = os.environ.get("SMTP_HOST", "mail.internal")

SUBSCRIBED_TOPICS = ["order.completed", "payment.captured"]


def send_email(subject: str, body: str) -> None:
  """Send one email through the internal SMTP relay."""
  with smtplib.SMTP(SMTP_HOST) as smtp:
    smtp.sendmail("noreply@shop.example", "customer@example.com", f"Subject: {subject}\n\n{body}")


def handle(topic: str, payload: dict) -> None:
  """Route one event to an email."""
  if topic == "order.completed":
    send_email("Order confirmed", f"Order {payload['order_id']} is confirmed.")
  elif topic == "payment.captured":
    send_email("Payment received", f"Charge {payload['charge_id']} was captured.")


def main() -> None:
  """Blocking subscribe loop."""
  channel = broker.pubsub()
  channel.subscribe(*SUBSCRIBED_TOPICS)
  for message in channel.listen():
    if message["type"] == "message":
      handle(message["channel"].decode(), json.loads(message["data"]))


if __name__ == "__main__":
  main()
