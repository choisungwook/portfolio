"""책의 Recipe 8.1 step 2.

step 1에서 만든 model_test_results.json을 읽어서, judge 모델이 1~10점 매김.
judge 모델은 OPENAI_MODEL(기본 gpt-4.1-nano)을 그대로 쓴다.
원본 책은 gpt-4o를 judge로 썼지만 비용 절감을 위해 동일 nano 모델로 채점.
"""
import json
import os
from pathlib import Path

import openai
from dotenv import load_dotenv

load_dotenv()


def load_results():
  with open("model_test_results.json", "r", encoding="utf-8") as f:
    return json.load(f)


def evaluate_response(client, judge_model, result):
  prompt = (
    "Rate this network engineering response 1-10:\n\n"
    f"Question: {result['question']}\n"
    f"Response: {result['response']}\n\n"
    "Score based on accuracy and usefulness.\n"
    "Format: SCORE: X - brief reason"
  )
  try:
    response = client.chat.completions.create(
      model=judge_model,
      messages=[{"role": "user", "content": prompt}],
      max_tokens=100,
      temperature=0.1,
    )
    eval_text = response.choices[0].message.content or ""
    if "SCORE:" in eval_text:
      score_part = eval_text.split("SCORE:")[1].split("-")[0].strip()
      score = float(score_part)
      explanation = eval_text.split("-", 1)[1].strip() if "-" in eval_text else ""
      return score, explanation
    return 5.0, "Could not parse score"
  except Exception as e:
    print(f"Error: {e}")
    return 5.0, "Evaluation failed"


def main():
  judge_model = os.environ.get("OPENAI_MODEL", "gpt-4.1-nano")
  client = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

  results = load_results()
  print(f"Evaluating {len(results)} responses with judge={judge_model}...")
  evaluations = []
  for result in results:
    print(f"  {result['model']:<20} {result['question_id']}")
    score, explanation = evaluate_response(client, judge_model, result)
    evaluations.append({
      "question_id": result["question_id"],
      "model": result["model"],
      "category": result["category"],
      "score": score,
      "explanation": explanation,
    })

  out = Path("response_evaluations.json")
  with out.open("w", encoding="utf-8") as f:
    json.dump(evaluations, f, indent=2, ensure_ascii=False)
  print(f"Done! -> {out.resolve()}")


if __name__ == "__main__":
  main()
