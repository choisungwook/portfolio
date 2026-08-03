"""Order service: accepts orders, reserves stock, charges payment."""

import os

from fastapi import FastAPI, HTTPException

from clients import InventoryClient, PaymentClient
from events import publish

app = FastAPI()
payment = PaymentClient(os.environ.get("PAYMENT_SERVICE_URL", "http://payment-service:8080"))
inventory = InventoryClient(os.environ.get("INVENTORY_SERVICE_URL", "http://inventory-service:8080"))

ORDERS: dict[str, dict] = {}


@app.post("/orders")
def create_order(body: dict):
  """Reserve stock, charge the card, then confirm the order."""
  order_id = body["order_id"]
  if not inventory.reserve(body["sku"], body["quantity"]):
    raise HTTPException(status_code=409, detail="out of stock")
  try:
    charge = payment.charge(order_id, body["amount"])
  except Exception as exc:
    inventory.release(body["sku"], body["quantity"])
    raise HTTPException(status_code=500, detail=f"payment failed: {exc}")
  ORDERS[order_id] = {"status": "confirmed", "charge_id": charge["charge_id"]}
  publish("order.completed", {"order_id": order_id})
  return ORDERS[order_id]


@app.get("/orders/{order_id}")
def get_order(order_id: str):
  """Look up one order."""
  if order_id not in ORDERS:
    raise HTTPException(status_code=404, detail="unknown order")
  return ORDERS[order_id]
