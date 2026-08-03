"""Prompt building and JSON extraction."""

import pytest

from akbun_agent_analysiscode.errors import ResponseParseError
from akbun_agent_analysiscode.prompts import (
  build_ask_prompt,
  build_learn_prompt,
  build_transcript_prompt,
  extract_json,
  next_prompt,
)


def test_learn_prompt_names_service_and_schema():
  prompt = build_learn_prompt("order", "takes orders")
  assert "order" in prompt
  assert "takes orders" in prompt
  assert "outbound_calls" in prompt
  assert "evidence" in prompt


def test_ask_prompt_embeds_log():
  prompt = build_ask_prompt("why 500?", "Timeout calling payment", "err.log")
  assert "why 500?" in prompt
  assert "Timeout calling payment" in prompt
  assert "err.log" in prompt


def test_ask_prompt_without_log_is_question():
  assert build_ask_prompt("why 500?") == "why 500?"


def test_extract_json_from_fenced_block():
  text = 'Here you go:\n```json\n{"language": "python"}\n```\nDone.'
  assert extract_json(text) == {"language": "python"}


def test_extract_json_from_plain_text():
  assert extract_json('prefix {"a": 1} suffix') == {"a": 1}


def test_extract_json_rejects_no_json():
  with pytest.raises(ResponseParseError, match="no JSON"):
    extract_json("I could not analyze the service.")


def test_extract_json_rejects_invalid_json():
  with pytest.raises(ResponseParseError, match="invalid JSON"):
    extract_json("{broken}")


def test_extract_json_rejects_non_object():
  with pytest.raises(ResponseParseError, match="not an object"):
    extract_json("```json\n[1, 2]\n```")


def test_next_prompt_first_turn_is_plain():
  assert next_prompt([], None, "hello") == "hello"


def test_next_prompt_with_resume_stays_plain():
  history = [("user", "a"), ("assistant", "b")]
  assert next_prompt(history, "session-1", "next") == "next"


def test_next_prompt_without_resume_replays_transcript():
  history = [("user", "orders fail"), ("assistant", "check payment")]
  prompt = next_prompt(history, None, "how?")
  assert prompt == build_transcript_prompt(history, "how?")
  assert "orders fail" in prompt
  assert "check payment" in prompt
  assert prompt.strip().endswith("answer the last user message.")
