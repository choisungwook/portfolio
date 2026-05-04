"""Recipe 8.1 의 의도(여러 모델을 같은 질문으로 비교)를 보존한 단순화 버전.

원본은 gpt-3.5-turbo / gpt-4o-mini / gpt-4o 를 비교했지만,
2026년 시점에서 nano급 모델만 비교하기 때문에 모델 목록은 환경변수로 받는다.
"""
import json
import os
import sys
import time
from dataclasses import asdict, dataclass

from openai import OpenAI

from .config import Settings

QUESTIONS = [
  {"id": "ospf_config", "question": "Configure OSPF area 0 on a Cisco router",
   "category": "configuration"},
  {"id": "bgp_idle", "question": "BGP neighbor stuck in Idle state. What to check?",
   "category": "troubleshooting"},
  {"id": "vlan_basic", "question": "Create VLAN 100 named Sales on a switch",
   "category": "configuration"},
]


@dataclass
class ModelAnswer:
  model: str
  question_id: str
  category: str
  question: str
  response: str


@dataclass
class Evaluation:
  model: str
  question_id: str
  category: str
  score: float
  explanation: str


def run() -> int:
  try:
    settings = Settings.from_env()
  except Exception as e:
    print(f"[setup error] {e}", file=sys.stderr)
    return 1

  models = _models_to_compare(settings.model)
  client = OpenAI(api_key=settings.api_key)

  answers = _collect_answers(client, models)
  evaluations = _evaluate(client, settings.model, answers)
  _print_summary(evaluations)
  _save_artifacts(answers, evaluations)
  return 0


def _models_to_compare(default_model: str) -> list[str]:
  raw = os.environ.get("EVAL_MODELS", default_model)
  models = [m.strip() for m in raw.split(",") if m.strip()]
  return models or [default_model]


def _collect_answers(client: OpenAI, models: list[str]) -> list[ModelAnswer]:
  records: list[ModelAnswer] = []
  for model in models:
    print(f"==> testing {model}")
    for q in QUESTIONS:
      try:
        resp = client.chat.completions.create(
          model=model,
          messages=[{"role": "user", "content": q["question"]}],
          max_tokens=200,
          temperature=0.1,
        )
        records.append(ModelAnswer(
          model=model,
          question_id=q["id"],
          category=q["category"],
          question=q["question"],
          response=resp.choices[0].message.content or "",
        ))
        print(f"   ok   {q['id']}")
        time.sleep(0.5)
      except Exception as e:
        print(f"   fail {q['id']}: {e}", file=sys.stderr)
  return records


def _evaluate(client: OpenAI, judge_model: str,
              answers: list[ModelAnswer]) -> list[Evaluation]:
  results: list[Evaluation] = []
  for ans in answers:
    score, reason = _score_one(client, judge_model, ans)
    results.append(Evaluation(
      model=ans.model,
      question_id=ans.question_id,
      category=ans.category,
      score=score,
      explanation=reason,
    ))
  return results


def _score_one(client: OpenAI, judge_model: str, ans: ModelAnswer) -> tuple[float, str]:
  prompt = (
    "Rate this network engineering response 1-10 for accuracy and usefulness. "
    "Reply exactly: 'SCORE: X - reason'.\n\n"
    f"Question: {ans.question}\nResponse: {ans.response}"
  )
  try:
    resp = client.chat.completions.create(
      model=judge_model,
      messages=[{"role": "user", "content": prompt}],
      max_tokens=80,
      temperature=0,
    )
    text = (resp.choices[0].message.content or "").strip()
  except Exception as e:
    return 5.0, f"evaluation failed: {e}"

  if "SCORE:" not in text:
    return 5.0, f"unparsed: {text}"
  body = text.split("SCORE:", 1)[1]
  head, _, tail = body.partition("-")
  try:
    return float(head.strip()), tail.strip()
  except ValueError:
    return 5.0, f"unparsed: {text}"


def _print_summary(evaluations: list[Evaluation]) -> None:
  print("\n=== model performance ===")
  by_model: dict[str, list[float]] = {}
  for e in evaluations:
    by_model.setdefault(e.model, []).append(e.score)
  ranking = sorted(
    ((m, sum(s) / len(s)) for m, s in by_model.items()),
    key=lambda x: x[1],
    reverse=True,
  )
  for model, avg in ranking:
    print(f"  {model:<20} avg={avg:.2f}/10")
  if ranking:
    print(f"\nbest: {ranking[0][0]} ({ranking[0][1]:.2f}/10)")


def _save_artifacts(answers: list[ModelAnswer], evaluations: list[Evaluation]) -> None:
  with open("model_test_results.json", "w", encoding="utf-8") as f:
    json.dump([asdict(a) for a in answers], f, indent=2, ensure_ascii=False)
  with open("response_evaluations.json", "w", encoding="utf-8") as f:
    json.dump([asdict(e) for e in evaluations], f, indent=2, ensure_ascii=False)
  print("saved: model_test_results.json, response_evaluations.json")


if __name__ == "__main__":
  raise SystemExit(run())
