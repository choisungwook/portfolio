#!/bin/bash
set -euo pipefail

yum update -y
yum install -y python3.11 python3.11-pip

mkdir -p /opt/app
cat > /opt/app/app.py << 'PYEOF'
from flask import Flask, request, make_response, jsonify
import os

app = Flask(__name__)

USERS = {
  "alice": "password123",
  "bob": "password456",
}

USER_PROFILES = {
  "alice": {
    "name": "Alice Kim",
    "email": "alice@example.com",
    "role": "Admin",
    "balance": "$15,230.00",
  },
  "bob": {
    "name": "Bob Park",
    "email": "bob@example.com",
    "role": "User",
    "balance": "$3,450.00",
  },
}


@app.route("/api/health")
def health():
  return jsonify({"status": "ok"})


@app.route("/api/login", methods=["POST"])
def login():
  data = request.get_json(silent=True)
  if not isinstance(data, dict):
    return jsonify({"error": "Invalid or missing JSON body"}), 400

  username = data.get("username", "")
  password = data.get("password", "")

  if not username or not password:
    return jsonify({"error": "Missing 'username' or 'password'"}), 400

  if username in USERS and USERS[username] == password:
    resp = make_response(jsonify({"message": "Login successful", "username": username}))
    resp.set_cookie("session_user", username, max_age=3600, httponly=True, samesite="Lax")
    return resp

  return jsonify({"error": "Invalid credentials"}), 401


@app.route("/api/profile")
def profile():
  username = request.cookies.get("session_user")

  if not username or username not in USER_PROFILES:
    return jsonify({"error": "Not authenticated"}), 401

  profile = USER_PROFILES[username]
  resp = make_response(jsonify(profile))
  resp.headers["Cache-Control"] = "public, max-age=60"
  return resp


@app.route("/api/logout", methods=["POST"])
def logout():
  resp = make_response(jsonify({"message": "Logged out"}))
  resp.delete_cookie("session_user")
  return resp


if __name__ == "__main__":
  app.run(host="0.0.0.0", port=5000)
PYEOF

cat > /opt/app/requirements.txt << 'REQEOF'
flask==3.1.0
gunicorn==23.0.0
REQEOF

pip3.11 install -r /opt/app/requirements.txt

cat > /etc/systemd/system/flask-app.service << 'SVCEOF'
[Unit]
Description=Flask Cache Demo App
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/app
ExecStart=/usr/local/bin/gunicorn -w 2 -b 0.0.0.0:5000 app:app
Restart=always

[Install]
WantedBy=multi-user.target
SVCEOF

systemctl daemon-reload
systemctl enable flask-app
systemctl start flask-app
