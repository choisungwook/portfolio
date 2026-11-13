"""AgentCore Memory 호출을 모아 둔 모듈. 단기 메모리(event)와 장기 메모리(record)를 다룬다."""
import os
from datetime import datetime, timezone

import boto3

MEMORY_ID = os.environ["MEMORY_ID"]
SHORT_TERM_TURNS = int(os.getenv("SHORT_TERM_TURNS", "10"))
LONG_TERM_TOP_K = int(os.getenv("LONG_TERM_TOP_K", "3"))
PROMPT_NAMESPACES = ("facts", "preferences")

client = boto3.client("bedrock-agentcore", region_name=os.getenv("AWS_REGION", "ap-northeast-2"))


def actor_namespace(actor_id: str) -> str:
  """한 사용자의 장기 메모리가 모두 들어 있는 namespace 상위 경로."""
  return f"/actor/{actor_id}/"


def save_turn(actor_id: str, session_id: str, user_text: str, assistant_text: str) -> str:
  """질문과 답변 한 쌍을 event 하나로 단기 메모리에 저장하고 eventId를 돌려준다."""
  response = client.create_event(
    memoryId=MEMORY_ID,
    actorId=actor_id,
    sessionId=session_id,
    eventTimestamp=datetime.now(timezone.utc),
    payload=[
      {"conversational": {"role": "USER", "content": {"text": user_text}}},
      {"conversational": {"role": "ASSISTANT", "content": {"text": assistant_text}}},
    ],
  )
  return response["event"]["eventId"]


def list_events(actor_id: str, session_id: str) -> list[dict]:
  """채팅창(session) 하나의 event를 오래된 순서로 돌려준다."""
  events = []
  paginator = client.get_paginator("list_events")
  for page in paginator.paginate(memoryId=MEMORY_ID, actorId=actor_id, sessionId=session_id, includePayloads=True):
    events.extend(page["events"])
  return sorted(events, key=lambda event: event["eventTimestamp"])


def load_history(actor_id: str, session_id: str) -> list[dict]:
  """최근 SHORT_TERM_TURNS개 event만 읽어 OpenAI messages 형식으로 바꾼다.

  ListEvents는 최신순이라 첫 페이지만 읽으면 된다. 전부 읽으면 읽은 event 수만큼 과금된다.
  TOOL, OTHER 메시지는 tool_call_id가 없어 OpenAI 형식으로 넣을 수 없으므로 뺀다.
  """
  response = client.list_events(
    memoryId=MEMORY_ID, actorId=actor_id, sessionId=session_id, includePayloads=True, maxResults=SHORT_TERM_TURNS,
  )
  messages = []
  for event in sorted(response["events"], key=lambda event: event["eventTimestamp"]):
    for item in event["payload"]:
      turn = item.get("conversational")
      if turn and turn["role"] in ("USER", "ASSISTANT"):
        messages.append({"role": turn["role"].lower(), "content": turn["content"]["text"]})
  return messages


def search_long_term(actor_id: str, query: str) -> list[dict]:
  """사실(facts)과 선호(preferences) namespace에서 질문과 가까운 record를 의미 검색한다.

  요약(summaries)은 채팅창마다 길게 쌓여 topK를 차지하고 작은 모델을 흔들어서 프롬프트에는 넣지 않는다.
  """
  records = []
  for kind in PROMPT_NAMESPACES:
    response = client.retrieve_memory_records(
      memoryId=MEMORY_ID,
      namespace=f"{actor_namespace(actor_id)}{kind}/",
      searchCriteria={"searchQuery": query[:10000], "topK": LONG_TERM_TOP_K},
    )
    records.extend(to_record(summary) for summary in response["memoryRecordSummaries"])
  return records


def list_long_term(actor_id: str) -> list[dict]:
  """사용자의 장기 메모리 record를 검색 없이 전부 돌려준다."""
  records = []
  paginator = client.get_paginator("list_memory_records")
  for page in paginator.paginate(memoryId=MEMORY_ID, namespacePath=actor_namespace(actor_id)):
    records.extend(to_record(summary) for summary in page["memoryRecordSummaries"])
  return records


def list_sessions(actor_id: str) -> list[dict]:
  """사용자의 채팅창(session) 목록을 최근 순서로 돌려준다."""
  sessions = []
  paginator = client.get_paginator("list_sessions")
  for page in paginator.paginate(memoryId=MEMORY_ID, actorId=actor_id):
    sessions.extend(page["sessionSummaries"])
  sessions.sort(key=lambda session: session["createdAt"], reverse=True)
  return [{"session_id": s["sessionId"], "created_at": s["createdAt"].isoformat()} for s in sessions]


def to_record(summary: dict) -> dict:
  """API 응답의 record 요약을 화면과 프롬프트에 쓰기 좋은 형태로 줄인다."""
  return {
    "id": summary["memoryRecordId"],
    "strategy_id": summary["memoryStrategyId"],
    "namespaces": summary["namespaces"],
    "text": summary["content"]["text"],
    "score": summary.get("score"),
    "created_at": summary["createdAt"].isoformat(),
  }
