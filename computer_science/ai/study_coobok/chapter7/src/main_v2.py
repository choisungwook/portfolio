"""Network AI v2 - 책 ch07 main_v2.py 의도: device_type 별 system prompt 분기 + /devices 엔드포인트.

리팩토링 포인트:
- system prompt 빌드를 build_system_prompt 함수로 분리. 책은 ask 안에 if/elif 사슬.
- 지원 장비 목록을 SUPPORTED_DEVICES 상수로 묶음.
- pydantic 응답 모델 사용.
"""
import os

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI
from openai import OpenAI
from pydantic import BaseModel

load_dotenv()

MODEL = os.getenv("OPENAI_MODEL", "gpt-4.1-nano")
SUPPORTED_DEVICES = ["cisco", "juniper", "arista", "palo alto", "generic"]

DEVICE_HINTS = {
  "cisco": "Focus on Cisco IOS/IOS-XE commands and syntax. Provide specific 'show' and 'configure' commands.",
  "juniper": "Focus on Junos commands and syntax. Use 'show' and 'set' command formats.",
  "arista": "Focus on Arista EOS commands and syntax. Use EOS-specific features and commands.",
  "palo alto": "Focus on Palo Alto firewall commands and web interface guidance.",
}

app = FastAPI(title="Network AI v2")
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))


class QuestionRequest(BaseModel):
  question: str
  device_type: str = "generic"


class AnswerResponse(BaseModel):
  answer: str
  device_type: str


def build_system_prompt(device_type: str) -> str:
  hint = DEVICE_HINTS.get(device_type.lower(), "Provide vendor-neutral network guidance.")
  return f"You are a network engineer assistant. {hint} Give concise, practical answers with specific commands when relevant."


@app.post("/ask", response_model=AnswerResponse)
def ask(req: QuestionRequest) -> AnswerResponse:
  response = client.chat.completions.create(
    model=MODEL,
    messages=[
      {"role": "system", "content": build_system_prompt(req.device_type)},
      {"role": "user", "content": req.question},
    ],
    max_tokens=300,
  )
  return AnswerResponse(
    answer=response.choices[0].message.content or "",
    device_type=req.device_type,
  )


@app.get("/devices")
def devices() -> dict:
  return {
    "supported_devices": SUPPORTED_DEVICES,
    "usage": "POST /ask with {question, device_type} where device_type is one of supported_devices",
  }


if __name__ == "__main__":
  uvicorn.run(app, host="0.0.0.0", port=8000)
