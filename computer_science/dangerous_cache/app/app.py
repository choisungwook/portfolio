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
  data = request.get_json()
  username = data.get("username", "")
  password = data.get("password", "")

  if username in USERS and USERS[username] == password:
    resp = make_response(jsonify({"message": "Login successful", "username": username}))
    resp.set_cookie("session_user", username, max_age=3600, httponly=False)
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
