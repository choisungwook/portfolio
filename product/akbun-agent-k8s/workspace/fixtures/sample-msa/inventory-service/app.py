"""Inventory service: stock levels and reservations."""

from fastapi import FastAPI, HTTPException

app = FastAPI()

STOCK: dict[str, int] = {"sku-1": 10, "sku-2": 0}


@app.post("/reserve")
def reserve(body: dict):
  """Reserve stock for an order; 409 when not enough is left."""
  sku, quantity = body["sku"], body["quantity"]
  if STOCK.get(sku, 0) < quantity:
    raise HTTPException(status_code=409, detail="out of stock")
  STOCK[sku] -= quantity
  return {"sku": sku, "remaining": STOCK[sku]}


@app.post("/release")
def release(body: dict):
  """Return previously reserved stock (compensation from the order service)."""
  STOCK[body["sku"]] = STOCK.get(body["sku"], 0) + body["quantity"]
  return {"sku": body["sku"], "remaining": STOCK[body["sku"]]}


@app.get("/stock/{sku}")
def stock(sku: str):
  """Current stock level for one SKU."""
  return {"sku": sku, "remaining": STOCK.get(sku, 0)}
