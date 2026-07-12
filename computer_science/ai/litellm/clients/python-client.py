"""LiteLLM gateway를 경유해 LLM을 부르는 최소 python client.

openai SDK를 그대로 쓰되 base_url만 gateway로 돌린다. OpenAI로 나가지 않고
localhost:4000의 gateway를 지나며, 거기서 건 인증·한도·감사·라우팅이 그대로 적용된다.

실행:
  LITELLM_KEY=sk-... uv run --with openai python python-client.py
"""

import os

from openai import OpenAI

GATEWAY_URL = "http://localhost:4000/v1"


def ask(prompt: str, model: str = "gpt") -> str:
  """gateway를 경유해 한 번 묻고 응답 텍스트를 돌려준다.

  model은 provider 이름이 아니라 gateway 별칭이다. gpt를 gemini로 바꾸면
  client 코드 수정 없이 Google로 나간다.
  """
  client = OpenAI(base_url=GATEWAY_URL, api_key=os.environ["LITELLM_KEY"])
  response = client.chat.completions.create(
    model=model,
    messages=[{"role": "user", "content": prompt}],
  )
  return response.choices[0].message.content


if __name__ == "__main__":
  print(ask("gateway를 경유해 응답하는지 한 문장으로 답해줘"))
