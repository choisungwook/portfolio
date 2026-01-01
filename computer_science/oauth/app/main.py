import os
import secrets
import httpx
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import RedirectResponse
from fastapi.templating import Jinja2Templates
from dotenv import load_dotenv

# .env 파일 로드
load_dotenv()

app = FastAPI()
templates = Jinja2Templates(directory="templates")

CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
REDIRECT_URI = os.getenv("GOOGLE_REDIRECT_URI")
AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"

internal_db = {"state": None}

@app.get("/")
async def index(request: Request):
  return templates.TemplateResponse("index.html", {"request": request})

@app.get("/login")
async def login():
  state = secrets.token_urlsafe(16)
  internal_db["state"] = state

  params = {
    "client_id": CLIENT_ID,
    "redirect_uri": REDIRECT_URI,
    "response_type": "code",
    "scope": "openid email profile",
    "state": state,
    "access_type": "offline",
    "prompt": "consent"
  }

  query_string = "&".join([f"{k}={v}" for k, v in params.items()])
  return RedirectResponse(f"{AUTH_URL}?{query_string}")

@app.get("/callback")
async def callback(request: Request):
  code = request.query_params.get("code")
  state = request.query_params.get("state")

  # 디버깅을 위한 출력
  print(f"DEBUG: Received Authorization Code: {code}")
  print(f"DEBUG: Received State: {state}")

  if state != internal_db.get("state"):
    raise HTTPException(status_code=400, detail="State mismatch")

  async with httpx.AsyncClient() as client:
    token_response = await client.post(
      TOKEN_URL,
      data={
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "code": code, # 이 code를 Google에 주고 토큰을 받음
        "grant_type": "authorization_code",
        "redirect_uri": REDIRECT_URI,
      }
    )

  tokens = token_response.json()

  # 결과 화면에도 code를 포함해서 반환
  return {
    "received_code": code,
    "access_token": tokens.get("access_token"),
    "id_token": tokens.get("id_token")
  }
