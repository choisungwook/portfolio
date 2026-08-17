"""Run a client-owned web-search tool loop through LiteLLM."""

import argparse
import json
import os

from openai import OpenAI

from web_search import search_web

MODEL_GROUPS = {
  "qwen": "local-tool-model",
  "bedrock": "bedrock-nova-micro",
}
MAX_TOOL_ROUNDS = 3

WEB_SEARCH_TOOL = {
  "type": "function",
  "function": {
    "name": "web_search",
    "description": "Search the public web for current information and source URLs.",
    "strict": True,
    "parameters": {
      "type": "object",
      "properties": {"query": {"type": "string"}},
      "required": ["query"],
      "additionalProperties": False,
    },
  },
}


def create_client() -> OpenAI:
  """Create an OpenAI-compatible client pointed at LiteLLM."""
  return OpenAI(
    base_url=os.getenv("LITELLM_BASE_URL", "http://localhost:4000/v1"),
    api_key=os.getenv("LITELLM_MASTER_KEY", "sk-local-web-search"),
  )


def parse_model_argument() -> str:
  """Map a user-facing model name to a LiteLLM model group."""
  parser = argparse.ArgumentParser()
  parser.add_argument("--model", choices=MODEL_GROUPS, default="qwen")
  arguments = parser.parse_args()
  return MODEL_GROUPS[arguments.model]


def request_search(client: OpenAI, model: str, messages):
  """Ask the model to emit one structured web-search request."""
  return client.chat.completions.create(
    model=model,
    messages=messages,
    tools=[WEB_SEARCH_TOOL],
    tool_choice={"type": "function", "function": {"name": "web_search"}},
  )


def request_answer(client: OpenAI, model: str, messages):
  """Continue the conversation after client-executed tool results."""
  return client.chat.completions.create(model=model, messages=messages, tools=[WEB_SEARCH_TOOL])


def append_tool_results(messages, assistant_message, search_url: str) -> None:
  """Execute every requested web search and append its result messages."""
  messages.append(assistant_message.model_dump(exclude_none=True))
  for tool_call in assistant_message.tool_calls:
    if tool_call.function.name != "web_search":
      raise ValueError(f"Unsupported tool: {tool_call.function.name}")
    query = json.loads(tool_call.function.arguments)["query"]
    results = search_web(query, search_url)
    messages.append(
      {
        "role": "tool",
        "tool_call_id": tool_call.id,
        "content": json.dumps(results, ensure_ascii=False),
      }
    )


def main() -> None:
  """Execute the client-owned search scenario."""
  client = create_client()
  model = parse_model_argument()
  question = os.getenv(
    "QUESTION", "오늘은 몇 월 며칠이고 서울 날씨는 어때요? 출처 URL과 함께 답하세요."
  )
  search_url = os.getenv("SEARXNG_URL", "http://localhost:8080")
  messages = [{"role": "user", "content": question}]
  response = request_search(client, model, messages)

  for tool_round in range(MAX_TOOL_ROUNDS + 1):
    assistant_message = response.choices[0].message
    if not assistant_message.tool_calls:
      print(assistant_message.content)
      return
    if tool_round == MAX_TOOL_ROUNDS:
      break
    append_tool_results(messages, assistant_message, search_url)
    response = request_answer(client, model, messages)

  raise RuntimeError(f"Tool loop exceeded {MAX_TOOL_ROUNDS} rounds")


if __name__ == "__main__":
  main()
