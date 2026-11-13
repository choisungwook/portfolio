"""OpenAI Chat Completions 호환 백엔드. 모델은 Ollama, 대화 상태는 AgentCore Memory에 둔다.

클라이언트는 새 질문 하나만 보낸다. 이전 대화는 단기 메모리에서, 사용자에 대한 지식은 장기 메모리에서 백엔드가 채운다.
actor는 요청의 `user` 필드, 채팅창은 `X-Session-Id` 헤더로 구분한다.
"""
import asyncio
import json
import os
import re
import time
import uuid

import httpx
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse

import memory

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://host.docker.internal:11434/v1")
MODEL = os.getenv("MODEL", "qwen2.5:3b")
# actorId에 '/'가 들어가면 namespacePath가 다른 사용자의 하위 경로를 가리킬 수 있어 문자를 좁힌다
ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9_-]{0,63}$")

app = FastAPI()
http = httpx.AsyncClient(base_url=OLLAMA_BASE_URL, timeout=120)


def require_id(value: str, name: str) -> str:
  """actor, session ID 형식을 검사한다."""
  if not ID_PATTERN.match(value):
    raise HTTPException(400, f"{name}는 소문자, 숫자, -, _ 로 64자 이내여야 합니다")
  return value


def last_user_text(messages: list[dict]) -> str:
  """마지막 user 메시지의 텍스트. content가 파트 배열이면 text 파트를 이어 붙인다."""
  for message in reversed(messages):
    if message.get("role") != "user":
      continue
    content = message.get("content")
    if isinstance(content, list):
      content = "".join(part.get("text", "") for part in content if part.get("type") == "text")
    if content:
      return content
  raise HTTPException(400, "user 메시지가 없습니다")


def system_prompt(records: list[dict]) -> dict:
  """장기 메모리 검색 결과를 system 메시지로 만든다."""
  lines = "\n".join(f"- {record['text']}" for record in records) or "- (없음)"
  return {
    "role": "system",
    "content": "너는 비서다. 반드시 한국어로만 답한다. 아래는 이 사용자에 대해 이전 대화에서 기억한 내용이다. "
    "질문과 관련 있을 때만 활용하고, 없는 사실을 지어내지 마라.\n" + lines,
  }


def build_messages(actor_id: str, session_id: str, question: str) -> tuple[list[dict], dict]:
  """모델에 보낼 messages와 화면에 보여 줄 메모리 사용 내역을 만든다."""
  history = memory.load_history(actor_id, session_id)
  records = memory.search_long_term(actor_id, question)
  messages = [system_prompt(records), *history, {"role": "user", "content": question}]
  used = {"short_term_messages": len(history), "long_term_records": records}
  return messages, used


@app.get("/v1/models")
async def list_models() -> dict:
  """OpenAI 호환 모델 목록. 이 백엔드는 모델 하나만 노출한다."""
  return {"object": "list", "data": [{"id": MODEL, "object": "model", "owned_by": "ollama"}]}


@app.post("/v1/chat/completions")
async def chat_completions(request: Request, x_session_id: str | None = Header(default=None)):
  """마지막 user 메시지만 받아 메모리로 문맥을 채우고 Ollama에 넘긴다."""
  body = await request.json()
  actor_id = require_id(body.get("user") or "anonymous", "user")
  session_id = require_id(x_session_id or f"chat-{uuid.uuid4().hex[:12]}", "X-Session-Id")
  question = last_user_text(body.get("messages") or [])
  messages, used = await asyncio.to_thread(build_messages, actor_id, session_id, question)
  headers = {"X-Session-Id": session_id}
  if body.get("stream"):
    stream = relay_stream(actor_id, session_id, question, messages)
    return StreamingResponse(stream, media_type="text/event-stream", headers=headers)
  answer = await complete(messages)
  await asyncio.to_thread(memory.save_turn, actor_id, session_id, question, answer)
  return JSONResponse(completion_body(answer, used), headers=headers)


async def complete(messages: list[dict]) -> str:
  """Ollama의 OpenAI 호환 엔드포인트에서 답변 전체를 받는다."""
  response = await http.post("/chat/completions", json={"model": MODEL, "messages": messages})
  response.raise_for_status()
  return response.json()["choices"][0]["message"]["content"]


async def relay_stream(actor_id: str, session_id: str, question: str, messages: list[dict]):
  """Ollama SSE를 그대로 흘려보내고, 끝나면 모은 답변을 단기 메모리에 저장한다."""
  parts = []
  payload = {"model": MODEL, "messages": messages, "stream": True}
  async with http.stream("POST", "/chat/completions", json=payload) as response:
    response.raise_for_status()
    async for line in response.aiter_lines():
      if line.startswith("data: {"):
        delta = json.loads(line[6:])["choices"][0]["delta"]
        parts.append(delta.get("content") or "")
      if line:
        yield line + "\n\n"
  await asyncio.to_thread(memory.save_turn, actor_id, session_id, question, "".join(parts))


def completion_body(answer: str, used: dict) -> dict:
  """OpenAI chat.completion 응답. 표준 필드 밖의 memory는 OpenAI SDK가 무시한다."""
  return {
    "id": f"chatcmpl-{uuid.uuid4().hex}",
    "object": "chat.completion",
    "created": int(time.time()),
    "model": MODEL,
    "choices": [{"index": 0, "message": {"role": "assistant", "content": answer}, "finish_reason": "stop"}],
    "memory": used,
  }


@app.get("/memory/{actor_id}/sessions")
def sessions(actor_id: str) -> list[dict]:
  """사이드바에 그릴 채팅창 목록."""
  return memory.list_sessions(require_id(actor_id, "actor"))


@app.get("/memory/{actor_id}/sessions/{session_id}")
def session_messages(actor_id: str, session_id: str) -> list[dict]:
  """채팅창을 다시 열 때 그릴 전체 대화."""
  events = memory.list_events(require_id(actor_id, "actor"), require_id(session_id, "session"))
  return [
    {"role": item["conversational"]["role"].lower(), "content": item["conversational"]["content"]["text"]}
    for event in events
    for item in event["payload"]
    if "conversational" in item
  ]


@app.get("/memory/{actor_id}/records")
def records(actor_id: str) -> list[dict]:
  """오른쪽 패널에 그릴 장기 메모리 전체."""
  return memory.list_long_term(require_id(actor_id, "actor"))
