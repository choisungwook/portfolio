"""Network AI v1 - 책 ch07 main_v1.py 의도: FastAPI 1개 엔드포인트로 LLM 호출.

리팩토링 포인트:
- pydantic 응답 모델(AnswerResponse) 사용. 책은 dict 반환.
- 모델명을 .env(OPENAI_MODEL)에서 읽음. 책은 하드코딩.
"""
import os

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI
from openai import OpenAI
from pydantic import BaseModel

load_dotenv()

MODEL = os.getenv("OPENAI_MODEL", "gpt-4.1-nano")

app = FastAPI(title="Network AI v1")
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))


class QuestionRequest(BaseModel):
  question: str


class AnswerResponse(BaseModel):
  answer: str


@app.post("/ask", response_model=AnswerResponse)
def ask(req: QuestionRequest) -> AnswerResponse:
  response = client.chat.completions.create(
    model=MODEL,
    messages=[
      {
        "role": "system",
        "content": "You are a network engineer assistant. Give concise, practical answers about network troubleshooting, configuration, and performance issues.",
      },
      {"role": "user", "content": req.question},
    ],
    max_tokens=300,
  )
  return AnswerResponse(answer=response.choices[0].message.content or "")


if __name__ == "__main__":
  uvicorn.run(app, host="0.0.0.0", port=8000)
