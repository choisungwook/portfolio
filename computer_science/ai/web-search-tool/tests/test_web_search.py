from web_search import normalize_results


def test_normalize_results_limits_and_renames_content() -> None:
  payload = {
    "results": [
      {"title": "A", "url": "https://a.example", "content": "alpha"},
      {"title": "B", "url": "https://b.example", "content": "beta"},
    ]
  }

  assert normalize_results(payload, max_results=1) == [
    {"title": "A", "url": "https://a.example", "snippet": "alpha"}
  ]


def test_normalize_results_handles_missing_fields() -> None:
  assert normalize_results({"results": [{}]}) == [{"title": "", "url": "", "snippet": ""}]
