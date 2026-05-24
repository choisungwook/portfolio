import csv
import io
import json
import logging
import os
import uuid
from typing import Optional

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from openai import OpenAI
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

QDRANT_ENDPOINT = os.getenv("QDRANT_ENDPOINT", "http://localhost:6333")
QDRANT_COLLECTION = os.getenv("QDRANT_COLLECTION", "catalog")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-5-nano")
OPENAI_EMBEDDING_MODEL = os.getenv("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small")
EMBEDDING_DIMENSIONS = int(os.getenv("OPENAI_EMBEDDING_DIMENSIONS", "1536"))

app = FastAPI()
openai_client = OpenAI()
user_sessions: dict[str, list[dict[str, str]]] = {}


class PromptModel(BaseModel):
  prompt: str
  session_id: Optional[str] = None


class LoadDataModel(BaseModel):
  url: str


def generate_embedding(text: str) -> list[float]:
  response = openai_client.embeddings.create(
    model=OPENAI_EMBEDDING_MODEL,
    input=text,
    dimensions=EMBEDDING_DIMENSIONS,
  )
  return response.data[0].embedding


def get_session_history(session_id: str) -> list[dict[str, str]]:
  if session_id not in user_sessions:
    user_sessions[session_id] = []

  return user_sessions[session_id]


def qdrant_request(method: str, path: str, payload: dict | None = None) -> dict:
  url = f"{QDRANT_ENDPOINT}{path}"
  with httpx.Client(timeout=30) as client:
    response = client.request(method, url, json=payload)

  response.raise_for_status()
  return response.json()


def recreate_catalog_collection() -> None:
  qdrant_request(
    "PUT",
    f"/collections/{QDRANT_COLLECTION}",
    {
      "vectors": {
        "size": EMBEDDING_DIMENSIONS,
        "distance": "Cosine",
      }
    },
  )


def build_payload_text(payload: dict) -> str:
  if "page_content" in payload:
    return str(payload["page_content"])

  return json.dumps(payload, ensure_ascii=False)


def search_catalog(prompt: str, top_k: int = 5) -> list[str]:
  result = qdrant_request(
    "POST",
    f"/collections/{QDRANT_COLLECTION}/points/search",
    {
      "vector": generate_embedding(prompt),
      "limit": top_k,
      "with_payload": True,
      "with_vector": False,
    },
  )
  points = result.get("result", [])
  return [build_payload_text(point["payload"]) for point in points if point.get("payload")]


def build_history_text(history: list[dict[str, str]]) -> str:
  if not history:
    return "No previous conversation."

  recent_history = history[-6:]
  return "\n".join(f"{item['role']}: {item['content']}" for item in recent_history)


def generate_response(prompt: str, context: list[str], history: list[dict[str, str]]) -> str:
  context_text = "\n\n".join(context)
  user_input = (
    "Conversation history:\n"
    f"{build_history_text(history)}\n\n"
    "Retrieved catalog context:\n"
    f"{context_text}\n\n"
    "Question:\n"
    f"{prompt}"
  )
  response = openai_client.responses.create(
    model=OPENAI_MODEL,
    instructions=(
      "You are a shopping assistant. Answer only from the retrieved catalog context. "
      "If the context does not contain enough information, say you do not know. "
      "Use 3 to 5 concise sentences."
    ),
    input=user_input,
  )
  return response.output_text


@app.post("/load_data")
async def load_data(request: LoadDataModel):
  try:
    async with httpx.AsyncClient(timeout=30) as client:
      response = await client.get(request.url)

    if response.status_code != 200:
      raise HTTPException(status_code=400, detail="Unable to download file from the URL")

    reader = csv.DictReader(io.StringIO(response.text))
    points = []

    for row in reader:
      payload_text = "\n".join(f"{key}: {value}" for key, value in row.items())
      points.append(
        {
          "id": str(uuid.uuid5(uuid.NAMESPACE_URL, payload_text)),
          "payload": {"page_content": payload_text, "metadata": {}},
          "vector": generate_embedding(payload_text),
        }
      )

    recreate_catalog_collection()
    qdrant_request(
      "PUT",
      f"/collections/{QDRANT_COLLECTION}/points?wait=true",
      {"points": points},
    )

    return JSONResponse({"message": "Document ingested successfully!"}, status_code=200)

  except HTTPException:
    raise
  except Exception as error:
    logger.exception("Unexpected error while loading data")
    raise HTTPException(status_code=500, detail=str(error)) from error


@app.post("/generate")
async def generate_answer(prompt_model: PromptModel):
  try:
    prompt = prompt_model.prompt
    session_id = prompt_model.session_id or str(uuid.uuid4())

    if not prompt:
      raise HTTPException(status_code=400, detail="Prompt is required")

    history = get_session_history(session_id)
    context = search_catalog(prompt)
    result = generate_response(prompt, context, history)

    history.append({"role": "user", "content": prompt})
    history.append({"role": "assistant", "content": result})

    return JSONResponse({"response": result, "session_id": session_id}, status_code=200)

  except HTTPException:
    raise
  except Exception as error:
    logger.exception("Unexpected error while generating a response")
    raise HTTPException(status_code=500, detail=str(error)) from error
