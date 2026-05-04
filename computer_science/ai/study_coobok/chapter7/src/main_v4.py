"""Network AI v4 - 책 ch07 main_v4.py 의도: HTML 폼 UI 추가(/, /web-ask).

리팩토링 포인트:
- HTML을 src/assets/index.html, src/assets/answer.html로 분리. 책은 main_v4.py 안에 f-string 인라인.
- Jinja2Templates로 렌더링. 책은 f-string 문자열 포맷팅.
- v3의 SQLAlchemy 2.0 + db_session 컨텍스트매니저, pydantic 응답 모델 그대로 유지.
"""
import os
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from typing import Iterator

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, Form, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from openai import OpenAI
from pydantic import BaseModel
from sqlalchemy import DateTime, Integer, String, create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker

load_dotenv()

MODEL = os.getenv("OPENAI_MODEL", "gpt-4.1-nano")
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./questions.db")
SUPPORTED_DEVICES = ["cisco", "juniper", "arista", "palo alto", "generic"]
ASSETS_DIR = Path(__file__).resolve().parent / "assets"

DEVICE_HINTS = {
  "cisco": "Focus on Cisco IOS/IOS-XE commands.",
  "juniper": "Focus on Junos commands.",
  "arista": "Focus on Arista EOS commands.",
  "palo alto": "Focus on Palo Alto firewall commands.",
}


class Base(DeclarativeBase):
  pass


class Question(Base):
  __tablename__ = "questions"

  id: Mapped[int] = mapped_column(Integer, primary_key=True)
  question: Mapped[str] = mapped_column(String(2000))
  answer: Mapped[str] = mapped_column(String(8000))
  device_type: Mapped[str] = mapped_column(String(64))
  timestamp: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


_connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=_connect_args, future=True)
Base.metadata.create_all(engine)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


@contextmanager
def db_session() -> Iterator[Session]:
  session = SessionLocal()
  try:
    yield session
    session.commit()
  except Exception:
    session.rollback()
    raise
  finally:
    session.close()


app = FastAPI(title="Network AI v4")
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
templates = Jinja2Templates(directory=ASSETS_DIR)


class QuestionRequest(BaseModel):
  question: str
  device_type: str = "generic"


class AnswerResponse(BaseModel):
  answer: str
  device_type: str


class HistoryItem(BaseModel):
  question: str
  answer: str
  device_type: str
  timestamp: datetime


def build_system_prompt(device_type: str) -> str:
  hint = DEVICE_HINTS.get(device_type.lower(), "Provide vendor-neutral network guidance.")
  return f"You are a network engineer assistant. {hint} Give concise, practical answers with specific commands."


def get_ai_answer(question: str, device_type: str) -> str:
  response = client.chat.completions.create(
    model=MODEL,
    messages=[
      {"role": "system", "content": build_system_prompt(device_type)},
      {"role": "user", "content": question},
    ],
    max_tokens=300,
  )
  return response.choices[0].message.content or ""


@app.get("/", response_class=HTMLResponse)
def index(request: Request) -> HTMLResponse:
  return templates.TemplateResponse(
    request,
    "index.html",
    {"supported_devices": SUPPORTED_DEVICES},
  )


@app.post("/web-ask", response_class=HTMLResponse)
def web_ask(request: Request,
            question: str = Form(...),
            device_type: str = Form("generic")) -> HTMLResponse:
  answer = get_ai_answer(question, device_type)
  with db_session() as session:
    session.add(Question(question=question, answer=answer, device_type=device_type))
  return templates.TemplateResponse(
    request,
    "answer.html",
    {"question": question, "answer": answer, "device_type": device_type},
  )


@app.post("/ask", response_model=AnswerResponse)
def ask(req: QuestionRequest) -> AnswerResponse:
  answer = get_ai_answer(req.question, req.device_type)
  with db_session() as session:
    session.add(Question(question=req.question, answer=answer, device_type=req.device_type))
  return AnswerResponse(answer=answer, device_type=req.device_type)


@app.get("/history", response_model=list[HistoryItem])
def history() -> list[HistoryItem]:
  with db_session() as session:
    rows = session.query(Question).order_by(Question.timestamp.desc()).limit(10).all()
    return [
      HistoryItem(
        question=r.question,
        answer=r.answer,
        device_type=r.device_type,
        timestamp=r.timestamp,
      )
      for r in rows
    ]


@app.get("/devices")
def devices() -> dict:
  return {
    "supported_devices": SUPPORTED_DEVICES,
    "usage": "POST /ask with {question, device_type} where device_type is one of supported_devices",
  }


if __name__ == "__main__":
  uvicorn.run(app, host="0.0.0.0", port=8000)
