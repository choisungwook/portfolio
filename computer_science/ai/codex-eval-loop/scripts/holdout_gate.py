from judge import ROOT, evaluate


def main() -> int:
  result = evaluate(ROOT / "cases" / "holdout.json")
  print(f"HOLDOUT: {result.passed}/{result.total} passed")
  return 0 if result.is_success else 1


if __name__ == "__main__":
  raise SystemExit(main())
