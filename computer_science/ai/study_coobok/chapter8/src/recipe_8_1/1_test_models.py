"""책의 Recipe 8.1 step 1.

여러 모델을 같은 네트워킹 질문으로 호출해서 응답 raw를 JSON으로 저장.
이 Recipe의 핵심은 "같은 프롬프트를 여러 모델에 던져 점수를 비교"하는 것이라서,
모델은 반드시 2개 이상이어야 한다.

책은 gpt-3.5-turbo / gpt-4o-mini / gpt-4o 를 비교했지만, 2026년 시점의 가격대에 맞춰
기본 비교 대상을 cheap/mid 세 모델로 바꿨다. 다른 조합으로 비교하고 싶으면
EVAL_MODELS=gpt-4.1-nano,gpt-4o-mini 처럼 환경변수로 지정한다.
"""
import json
import os
import time
from pathlib import Path

import openai
from dotenv import load_dotenv

load_dotenv()

DEFAULT_MODELS = ["gpt-4.1-nano", "gpt-4o-mini", "gpt-4.1-mini"]

TEST_QUESTIONS = [
  {
    "id": "ospf_config",
    "question": "Configure OSPF area 0 on a Cisco router",
    "category": "configuration",
  },
  {
    "id": "bgp_troubleshoot",
    "question": "BGP neighbor stuck in Idle state. What to check?",
    "category": "troubleshooting",
  },
  {
    "id": "vlan_basic",
    "question": "Create VLAN 100 named Sales on a switch",
    "category": "configuration",
  },
]


def models_from_env():
  raw = os.environ.get("EVAL_MODELS", "").strip()
  if not raw:
    return DEFAULT_MODELS
  models = [m.strip() for m in raw.split(",") if m.strip()]
  if len(models) < 2:
    raise SystemExit(
      f"EVAL_MODELS 는 비교 대상 모델을 2개 이상 지정해야 한다 (받은 값: {raw!r}). "
      f"기본값을 쓰려면 EVAL_MODELS 를 비워두면 된다."
    )
  return models


def test_model(client, model_name):
  results = []
  print(f"Testing {model_name}...")
  for question in TEST_QUESTIONS:
    try:
      response = client.chat.completions.create(
        model=model_name,
        messages=[{"role": "user", "content": question["question"]}],
        max_tokens=200,
        temperature=0.1,
      )
      results.append({
        "question_id": question["id"],
        "question": question["question"],
        "category": question["category"],
        "model": model_name,
        "response": response.choices[0].message.content,
      })
      print(f"  ok  {question['id']}")
      time.sleep(0.5)
    except Exception as e:
      print(f"  fail {question['id']}: {e}")
  return results


def main():
  models = models_from_env()
  print(f"Comparing {len(models)} models: {', '.join(models)}\n")
  client = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

  all_results = []
  for model in models:
    all_results.extend(test_model(client, model))

  out = Path("model_test_results.json")
  with out.open("w", encoding="utf-8") as f:
    json.dump(all_results, f, indent=2, ensure_ascii=False)
  print(f"\nDone! {len(all_results)} responses -> {out.resolve()}")


if __name__ == "__main__":
  main()
