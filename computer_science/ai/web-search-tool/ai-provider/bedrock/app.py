"""Call Bedrock Nova Web Grounding through LiteLLM."""

import os

from openai import OpenAI


def request_search(client: OpenAI, question: str):
  return client.chat.completions.create(
    model="bedrock-provider-search",
    messages=[{"role": "user", "content": question}],
    web_search_options={},
  )


def citation_urls(message) -> list[str]:
  fields = message.provider_specific_fields or {}
  citations = fields.get("citationsContent", [])
  return [
    citation["location"]["web"]["url"]
    for content in citations
    for citation in content.get("citations", [])
    if citation.get("location", {}).get("web", {}).get("url")
  ]


def main() -> None:
  client = OpenAI(
    base_url=os.getenv("LITELLM_BASE_URL", "http://localhost:4000/v1"),
    api_key=os.getenv("LITELLM_MASTER_KEY", "sk-local-web-search"),
  )
  response = request_search(
    client,
    os.getenv("QUESTION", "오늘은 몇 월 며칠이고 서울 날씨는 어때요? 출처 URL과 함께 답하세요."),
  )
  message = response.choices[0].message
  print(message.content)
  urls = citation_urls(message)
  if urls:
    print("\nSources:")
    print("\n".join(f"- {url}" for url in urls))


if __name__ == "__main__":
  main()
