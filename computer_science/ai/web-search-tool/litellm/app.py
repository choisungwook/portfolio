"""Run a LiteLLM-owned web-search interception request."""

import argparse
import os

from openai import OpenAI

MODEL_GROUPS = {
  "qwen": "local-tool-model",
  "bedrock": "bedrock-nova-micro",
}

LITELLM_WEB_SEARCH_TOOL = {
  "type": "function",
  "function": {
    "name": "litellm_web_search",
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


def parse_model_argument() -> str:
  """Map a user-facing model name to a LiteLLM model group."""
  parser = argparse.ArgumentParser()
  parser.add_argument("--model", choices=MODEL_GROUPS, default="qwen")
  arguments = parser.parse_args()
  return MODEL_GROUPS[arguments.model]


def main() -> None:
  """Send one request and let LiteLLM execute the complete tool loop."""
  client = OpenAI(
    base_url=os.getenv("LITELLM_BASE_URL", "http://localhost:4000/v1"),
    api_key=os.getenv("LITELLM_MASTER_KEY", "sk-local-web-search"),
  )
  response = client.chat.completions.create(
    model=parse_model_argument(),
    messages=[
      {
        "role": "user",
        "content": os.getenv(
          "QUESTION", "오늘은 몇 월 며칠이고 서울 날씨는 어때요? 출처 URL과 함께 답하세요."
        ),
      }
    ],
    tools=[LITELLM_WEB_SEARCH_TOOL],
    tool_choice={"type": "function", "function": {"name": "litellm_web_search"}},
  )
  print(response.choices[0].message.content)


if __name__ == "__main__":
  main()
