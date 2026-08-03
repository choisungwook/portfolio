"""HTTP clients for the services the order service depends on."""

import httpx

TIMEOUT_SECONDS = 3.0


class PaymentClient:
  """Calls the payment service to charge a card."""

  def __init__(self, base_url: str):
    self.base_url = base_url

  def charge(self, order_id: str, amount: int) -> dict:
    """POST /payments on the payment service."""
    response = httpx.post(
      f"{self.base_url}/payments",
      json={"order_id": order_id, "amount": amount},
      timeout=TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    return response.json()


class InventoryClient:
  """Calls the inventory service to reserve and release stock."""

  def __init__(self, base_url: str):
    self.base_url = base_url

  def reserve(self, sku: str, quantity: int) -> bool:
    """POST /reserve on the inventory service."""
    response = httpx.post(
      f"{self.base_url}/reserve",
      json={"sku": sku, "quantity": quantity},
      timeout=TIMEOUT_SECONDS,
    )
    return response.status_code == 200

  def release(self, sku: str, quantity: int) -> None:
    """POST /release on the inventory service (compensation)."""
    httpx.post(
      f"{self.base_url}/release",
      json={"sku": sku, "quantity": quantity},
      timeout=TIMEOUT_SECONDS,
    )
