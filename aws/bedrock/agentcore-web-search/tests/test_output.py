from types import SimpleNamespace
from typing import cast

import pytest
from openai.types.responses import Response

from agentcore_web_search.output import print_response


def test_print_response(capsys: pytest.CaptureFixture[str]) -> None:
  search = SimpleNamespace(
    type="web_search_call",
    action=SimpleNamespace(type="search", queries=["AWS re:Invent 2025"]),
  )
  citation = SimpleNamespace(
    type="url_citation",
    title="AWS News",
    url="https://example.com",
  )
  content = SimpleNamespace(
    type="output_text",
    text="Answer",
    annotations=[citation],
  )
  message = SimpleNamespace(type="message", content=[content])
  response = cast(Response, SimpleNamespace(output=[search, message]))

  print_response(response)

  captured = capsys.readouterr()
  assert "Retrieval steps: 1" in captured.out
  assert "search: ['AWS re:Invent 2025']" in captured.out
  assert "Answer" in captured.out
  assert "[AWS News] https://example.com" in captured.out
