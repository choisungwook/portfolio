"""
OpenFeature + flagd 예제

OpenFeature는 feature flag의 업계 표준 API입니다 (CNCF 프로젝트).
flagd는 OpenFeature와 함께 사용하는 경량 feature flag 서버입니다.

장점:
- 벤더 종속성 없음 (LaunchDarkly, Split 등 어떤 백엔드든 교체 가능)
- 표준화된 API로 코드 일관성 유지
- flagd는 설정 파일 변경 시 실시간 반영 (hot reload)
"""

from flask import Flask, jsonify
from openfeature import api
from openfeature.contrib.provider.flagd import FlagdProvider

app = Flask(__name__)

# OpenFeature 초기화: flagd 서버에 연결
api.set_provider(FlagdProvider(
    host="flagd",
    port=8013,
))
client = api.get_client()


@app.route("/")
def index():
    flags = {
        "new-checkout-flow": client.get_boolean_value("new-checkout-flow", default_value=False),
        "max-items-in-cart": client.get_integer_value("max-items-in-cart", default_value=10),
        "banner-message": client.get_string_value("banner-message", default_value=""),
    }
    return jsonify({
        "message": "OpenFeature + flagd 예제",
        "active_flags": flags,
    })


@app.route("/checkout")
def checkout():
    # boolean flag: 새로운 결제 플로우 사용 여부
    use_new_checkout = client.get_boolean_value(
        "new-checkout-flow",
        default_value=False,
    )

    # integer flag: 장바구니 최대 아이템 수
    max_items = client.get_integer_value(
        "max-items-in-cart",
        default_value=10,
    )

    if use_new_checkout:
        return jsonify({
            "checkout_version": "v2",
            "message": "새로운 결제 플로우를 사용합니다",
            "max_items": max_items,
            "features": ["one-click-pay", "saved-address", "gift-wrapping"],
        })
    else:
        return jsonify({
            "checkout_version": "v1",
            "message": "기존 결제 플로우를 사용합니다",
            "max_items": max_items,
            "features": ["standard-pay"],
        })


@app.route("/banner")
def banner():
    # string flag: 배너 메시지
    message = client.get_string_value(
        "banner-message",
        default_value="",
    )

    if message:
        return jsonify({"show_banner": True, "message": message})
    else:
        return jsonify({"show_banner": False})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
