"""
환경 변수 기반 Feature Flag 예제

환경 변수로 feature flag를 관리합니다.
쿠버네티스 ConfigMap이나 docker-compose의 environment로 설정할 수 있습니다.
"""

import os

from flask import Flask, jsonify

app = Flask(__name__)


def get_flag(name, default="false"):
    """환경 변수에서 feature flag 값을 가져옵니다."""
    value = os.environ.get(name, default).lower()
    return value in ("true", "1", "yes")


def get_flag_value(name, default=""):
    """환경 변수에서 feature flag 값(문자열)을 가져옵니다."""
    return os.environ.get(name, default)


@app.route("/")
def index():
    flags = {
        "ENABLE_DARK_MODE": get_flag("ENABLE_DARK_MODE"),
        "ENABLE_BETA_API": get_flag("ENABLE_BETA_API"),
        "API_VERSION": get_flag_value("API_VERSION", "v1"),
    }
    return jsonify({
        "message": "환경 변수 기반 Feature Flag 예제",
        "active_flags": flags,
    })


@app.route("/api/users")
def get_users():
    users = [
        {"id": 1, "name": "Alice"},
        {"id": 2, "name": "Bob"},
    ]

    # feature flag: 베타 API가 활성화되면 추가 필드를 반환
    if get_flag("ENABLE_BETA_API"):
        for user in users:
            user["profile_image"] = f"https://example.com/avatar/{user['id']}.png"
            user["last_login"] = "2026-02-27T10:00:00Z"

    api_version = get_flag_value("API_VERSION", "v1")
    return jsonify({
        "api_version": api_version,
        "users": users,
    })


@app.route("/ui/settings")
def ui_settings():
    """프론트엔드에 전달할 UI 설정"""
    return jsonify({
        "dark_mode_enabled": get_flag("ENABLE_DARK_MODE"),
        "beta_features_enabled": get_flag("ENABLE_BETA_API"),
    })


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
