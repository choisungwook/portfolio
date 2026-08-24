from judge import ROOT, evaluate, failure_report


def main() -> int:
  result = evaluate(ROOT / "cases" / "train.json")
  print(failure_report(result))
  return 0 if result.is_success else 1


if __name__ == "__main__":
  raise SystemExit(main())
