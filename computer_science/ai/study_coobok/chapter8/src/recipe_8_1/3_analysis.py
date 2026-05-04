"""책의 Recipe 8.1 step 3.

step 2 채점 결과를 모델별/카테고리별로 평균 내고 요약을 출력한다.
원본 책의 cost 표는 nano급 가격이 빠르게 바뀌므로 환경변수로 받는다.
가격을 안 주면 비용 분석 섹션은 건너뛴다.
"""
import json
import os
from pathlib import Path


def load_evaluations():
  with open("response_evaluations.json", "r", encoding="utf-8") as f:
    return json.load(f)


def parse_costs(raw):
  """`gpt-4.1-nano:0.0001,gpt-4o-mini:0.00015` 형태 파싱."""
  if not raw:
    return {}
  out = {}
  for chunk in raw.split(","):
    if ":" not in chunk:
      continue
    name, price = chunk.split(":", 1)
    try:
      out[name.strip()] = float(price.strip())
    except ValueError:
      continue
  return out


def analyze_results(evaluations, costs):
  print("MODEL PERFORMANCE ANALYSIS")
  print("=" * 40)

  model_scores = {}
  for ev in evaluations:
    model_scores.setdefault(ev["model"], []).append(ev["score"])

  print("\nOVERALL SCORES:")
  ranking = []
  for model, scores in model_scores.items():
    avg = sum(scores) / len(scores)
    ranking.append((model, avg))
    print(f"{model:<20} Average: {avg:.1f}/10")
  ranking.sort(key=lambda x: x[1], reverse=True)

  print("\nBY CATEGORY:")
  categories = {}
  for ev in evaluations:
    categories.setdefault(ev["category"], {}).setdefault(ev["model"], []).append(ev["score"])
  for category, models in categories.items():
    print(f"\n{category.title()}:")
    for model, scores in models.items():
      print(f"  {model}: {sum(scores) / len(scores):.1f}")

  best_model, best_score = ranking[0]
  print("\nRECOMMENDATION:")
  print(f"{best_model} performs best with {best_score:.1f}/10")

  if costs:
    print("\nCOST vs PERFORMANCE (USD per 1K tokens):")
    for model, score in ranking:
      if model in costs:
        cost = costs[model]
        value = score / (cost * 1000) if cost > 0 else float("inf")
        print(f"  {model:<20} score={score:.1f}  ${cost:.5f}  value={value:.0f}")
  else:
    print("\n(MODEL_COSTS env not set — skipping cost analysis)")

  return best_model


def main():
  costs = parse_costs(os.environ.get("MODEL_COSTS", ""))
  evaluations = load_evaluations()
  best_model = analyze_results(evaluations, costs)

  summary = {"best_model": best_model}
  out = Path("model_summary.json")
  with out.open("w", encoding="utf-8") as f:
    json.dump(summary, f, indent=2, ensure_ascii=False)
  print(f"\nSummary saved -> {out.resolve()}")


if __name__ == "__main__":
  main()
