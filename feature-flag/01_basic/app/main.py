"""
기본 Feature Flag 예제

feature flag를 JSON 파일로 관리하는 가장 간단한 방법입니다.
배포 없이 JSON 파일만 수정하면 기능을 켜고 끌 수 있습니다.
"""

import json
from flask import Flask, jsonify

app = Flask(__name__)


def load_feature_flags():
    with open("feature_flags.json", "r") as f:
        return json.load(f)


@app.route("/")
def index():
    flags = load_feature_flags()
    return jsonify({
        "message": "Feature Flag 기본 예제",
        "active_flags": flags,
    })


@app.route("/checkout")
def checkout():
    flags = load_feature_flags()

    result = {"items_total": 15000}

    # feature flag: 새로운 할인 기능
    if flags.get("enable_discount", False):
        discount_rate = flags.get("discount_rate", 10)
        discount_amount = result["items_total"] * discount_rate / 100
        result["discount_rate"] = f"{discount_rate}%"
        result["discount_amount"] = discount_amount
        result["final_total"] = result["items_total"] - discount_amount
    else:
        result["final_total"] = result["items_total"]

    # feature flag: 새로운 결제 수단
    if flags.get("enable_new_payment", False):
        result["payment_methods"] = ["credit_card", "bank_transfer", "kakao_pay", "toss_pay"]
    else:
        result["payment_methods"] = ["credit_card", "bank_transfer"]

    return jsonify(result)


@app.route("/flags")
def get_flags():
    """현재 feature flag 상태를 확인하는 엔드포인트"""
    flags = load_feature_flags()
    return jsonify(flags)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
