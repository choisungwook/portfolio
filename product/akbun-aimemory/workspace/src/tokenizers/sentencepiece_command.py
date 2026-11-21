"""Example command-adapter tokenizer for akbun-aimemory using Python sentencepiece.

Reads UTF-8 text from stdin and prints a JSON array of normalized subword tokens to stdout.

Usage in aimemory.config.json:
  {
    "tokenizer": {
      "type": "command",
      "command": "python3",
      "args": ["/path/to/sentencepiece_command.py", "--model", "/path/to/tokenizer.model"]
    }
  }
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
  """Parse command-line flags for the SentencePiece model file."""
  parser = argparse.ArgumentParser(description="Tokenize stdin text with a SentencePiece model.")
  parser.add_argument("--model", required=True, help="Path to a SentencePiece .model file (e.g. Gemma 3 or XLM-RoBERTa).")
  return parser.parse_args(argv)


def clean_pieces(pieces: list[str]) -> list[str]:
  """Strip SentencePiece metaspace prefixes and empty punctuation pieces."""
  tokens: list[str] = []
  for piece in pieces:
    token = piece.lstrip("\u2581").strip().lower()
    if token and any(ch.isalnum() for ch in token):
      tokens.append(token)
  return tokens


def tokenize_text(model_path: Path, text: str) -> list[str]:
  """Encode text with SentencePiece and return cleaned subword tokens."""
  import sentencepiece as spm  # type: ignore[import-not-found]

  processor = spm.SentencePieceProcessor()
  processor.load(str(model_path))
  pieces: list[str] = processor.encode(text, out_type=str)
  return clean_pieces(pieces)


def main() -> None:
  """Read text from stdin and write the JSON token array to stdout."""
  args = parse_args()
  text = sys.stdin.read()
  tokens = tokenize_text(Path(args.model), text)
  sys.stdout.write(json.dumps(tokens, ensure_ascii=False) + "\n")


if __name__ == "__main__":
  main()
