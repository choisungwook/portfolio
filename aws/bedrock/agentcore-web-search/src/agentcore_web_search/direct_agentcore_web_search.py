import argparse
import json
import os

from openai import OpenAI
from openai.types.responses import Response, ResponseFunctionToolCall

from .agentcore_mcp_client import search_web

DEFAULT_REGION = "us-east-1"
DEFAULT_QUERY = "오늘 며칠이야? 그리고 서울의 날씨는?"
DEFAULT_MODEL = "gpt-5.6-luna"
MAX_TOOL_TURNS = 10
APP_LOG = "애플리케이션 > "
SEARCH_LOG = "search provider 응답 > "
MODEL_LOG = "AI모델 응답 > "
SNIPPET_LENGTH = 80
WEB_SEARCH_TOOL = {
  "type": "function",
  "name": "web_search",
  "description": "Search the public web for current information.",
  "parameters": {
    "type": "object",
    "properties": {"query": {"type": "string", "description": "The search query"}},
    "required": ["query"],
  },
}


def parse_args() -> argparse.Namespace:
  """Parse an optional AgentCore Web Search query."""
  parser = argparse.ArgumentParser()
  parser.add_argument("query", nargs="?", default=DEFAULT_QUERY)
  return parser.parse_args()


def preview(text: str) -> str:
  """Flatten a search snippet into one short line for the log."""
  return " ".join(text.split())[:SNIPPET_LENGTH]


def tool_choice(turn: int) -> dict[str, str] | str:
  """Force the search on the first turn only, then let the model decide."""
  if turn == 1:
    return {"type": "function", "name": WEB_SEARCH_TOOL["name"]}
  return "auto"


def run_tool_call(
  call: ResponseFunctionToolCall,
  gateway_url: str,
  region: str,
) -> dict[str, str]:
  """Run one web_search call on the Gateway and build its function_call_output."""
  query = json.loads(call.arguments)["query"]
  print(f"{MODEL_LOG}tool call {call.name}(query={query!r})")
  print(f"{APP_LOG}AgentCore Gateway 호출")
  results = search_web(gateway_url, query, region)
  print(f"{SEARCH_LOG}{len(results)}건")
  for item in results:
    print(f"{SEARCH_LOG}  [{item['title']}] {item['url']}")
    print(f"{SEARCH_LOG}  └ {preview(item.get('text', ''))}")
  return {
    "type": "function_call_output",
    "call_id": call.call_id,
    "output": json.dumps(results, ensure_ascii=False),
  }


def model_name() -> str:
  """Read the model name, dropping the openai/ prefix LiteLLM routing needs."""
  return os.getenv("OPENAI_MODEL", DEFAULT_MODEL).removeprefix("openai/")


def run_agent(
  client: OpenAI,
  query: str,
  gateway_url: str,
  region: str,
  model: str = DEFAULT_MODEL,
) -> Response:
  """Loop the model and the Gateway tool locally until the model answers."""
  items: list[dict] = [{"role": "user", "content": query}]
  for turn in range(1, MAX_TOOL_TURNS + 1):
    choice = tool_choice(turn)
    label = choice if isinstance(choice, str) else f"{choice['name']} 강제"
    print(f"{APP_LOG}모델 호출 {turn}회차 (tool_choice={label})")
    response = client.responses.create(
      model=model,
      input=items,
      tools=[WEB_SEARCH_TOOL],
      tool_choice=choice,
    )
    calls = [item for item in response.output if item.type == "function_call"]
    if not calls:
      print(f"{MODEL_LOG}{response.output_text}")
      return response
    # status is an output-only field, echoing it back is rejected as an unknown parameter.
    items += [item.model_dump(exclude={"status"}) for item in response.output]
    items += [run_tool_call(call, gateway_url, region) for call in calls]
  raise RuntimeError(f"도구 호출이 {MAX_TOOL_TURNS}회를 넘었다")


def main() -> None:
  """Run the same OpenAI Responses request with the search tool executed locally."""
  args = parse_args()
  region = os.getenv("AWS_REGION", DEFAULT_REGION)
  gateway_url = os.environ["AGENTCORE_GATEWAY_URL"]
  client = OpenAI()
  run_agent(client, args.query, gateway_url, region, model_name())


if __name__ == "__main__":
  main()
