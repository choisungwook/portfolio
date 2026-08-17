"""Call vLLM server-side web search through LiteLLM."""

import os

from openai import OpenAI


def request_search(client: OpenAI, question: str):
  return client.responses.create(
    model="vllm-provider-search",
    input=question,
    instructions=(
      "Call web_search_preview exactly once before answering. "
      "After the tool result arrives, do not call a tool again; answer with source URLs."
    ),
    tools=[
      {"type": "web_search_preview"},
      {
        "type": "function",
        "name": "web_search_preview",
        "description": "Search the public web for current information.",
        "parameters": {
          "type": "object",
          "properties": {"query": {"type": "string"}},
          "required": ["query"],
        },
      },
    ],
    tool_choice="auto",
    temperature=0,
  )


def main() -> None:
  client = OpenAI(
    base_url=os.getenv("LITELLM_BASE_URL", "http://localhost:4000/v1"),
    api_key=os.getenv("LITELLM_MASTER_KEY", "sk-local-web-search"),
  )
  response = request_search(
    client,
    os.getenv("QUESTION", "오늘은 몇 월 며칠이고 서울 날씨는 어때요? 출처 URL과 함께 답하세요."),
  )
  print(response.output_text)


if __name__ == "__main__":
  main()
