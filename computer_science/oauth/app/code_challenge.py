import os
import secrets
import hashlib
import base64
import httpx
from fastapi import FastAPI, Request
from fastapi.responses import RedirectResponse
from dotenv import load_dotenv

load_dotenv()
app = FastAPI()

CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
REDIRECT_URI = os.getenv("GOOGLE_REDIRECT_URI")

db = {}

def get_pkce():
  verifier = secrets.token_urlsafe(64)
  sha256_hash = hashlib.sha256(verifier.encode()).digest()
  challenge = base64.urlsafe_b64encode(sha256_hash).decode().replace('=', '')
  return verifier, challenge

@app.get("/login")
async def login():
  state = secrets.token_urlsafe(16)
  verifier, challenge = get_pkce()
  db["state"] = state
  db["verifier"] = verifier

  params = {
    "client_id": CLIENT_ID,
    "redirect_uri": REDIRECT_URI,
    "response_type": "code",
    "scope": "openid email profile",
    "state": state,
    "code_challenge": challenge,
    "code_challenge_method": "S256"
  }
  url = "https://accounts.google.com/o/oauth2/v2/auth"
  query = "&".join([f"{k}={v}" for k, v in params.items()])
  return RedirectResponse(f"{url}?{query}")

@app.get("/callback")
async def callback(request: Request):
  code = request.query_params.get("code")
  async with httpx.AsyncClient() as client:
    res = await client.post(
      "https://oauth2.googleapis.com/token",
      data={
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "code": code,
        "grant_type": "authorization_code",
        "redirect_uri": REDIRECT_URI,
        "code_verifier": db.get("verifier")
      }
    )
  return res.json()
