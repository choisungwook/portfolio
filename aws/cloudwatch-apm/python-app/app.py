import logging
import random
import time

from flask import Flask, jsonify, request

app = Flask(__name__)
logging.basicConfig(level=logging.INFO)

PRODUCTS = [
    {"id": 1, "name": "Keyboard", "price": 89000},
    {"id": 2, "name": "Mouse", "price": 45000},
    {"id": 3, "name": "Monitor", "price": 350000},
]

orders = []


@app.route("/products", methods=["GET"])
def get_products():
    time.sleep(random.uniform(0.01, 0.05))
    return jsonify(PRODUCTS)


@app.route("/products/<int:product_id>", methods=["GET"])
def get_product(product_id):
    time.sleep(random.uniform(0.01, 0.05))
    product = next((p for p in PRODUCTS if p["id"] == product_id), None)
    if product is None:
        return jsonify({"error": "Product not found"}), 404
    return jsonify(product)


@app.route("/orders", methods=["GET"])
def get_orders():
    return jsonify(orders)


@app.route("/orders", methods=["POST"])
def create_order():
    data = request.get_json()
    product_id = data.get("product_id")
    quantity = data.get("quantity", 1)

    product = next((p for p in PRODUCTS if p["id"] == product_id), None)
    if product is None:
        return jsonify({"error": "Product not found"}), 404

    time.sleep(random.uniform(0.02, 0.1))

    order = {
        "id": len(orders) + 1,
        "product_id": product_id,
        "product_name": product["name"],
        "quantity": quantity,
        "total_price": product["price"] * quantity,
    }
    orders.append(order)
    return jsonify(order), 201


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "healthy"})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, use_reloader=False)
