"""Client for the reader change log.

The reader delivers changes in pages of ten rows ordered by a monotonic
sequence number. A deleted document arrives with id None.
"""
from dataclasses import dataclass
from typing import Any, Iterator

import httpx

from .config import Config
from .errors import ReaderError

REQUEST_TIMEOUT_SECONDS = 30.0


@dataclass(frozen=True)
class Change:
  """One row of the reader change log."""

  seq: int
  document_id: str
  deleted: bool
  title: str
  url: str
  body: str
  tags: list[str]
  location: str
  created_at: str


def parse_change(row: dict[str, Any]) -> Change:
  """Convert one JSON row into a Change; a missing id marks a deletion."""
  try:
    return Change(
      seq=int(row["seq"]),
      document_id=str(row["document_id"]),
      deleted=row.get("id") is None,
      title=str(row.get("title") or ""),
      url=str(row.get("normalized_url") or ""),
      body=str(row.get("body") or ""),
      tags=[str(tag) for tag in row.get("tags") or []],
      location=str(row.get("location") or ""),
      created_at=str(row.get("created_at") or ""),
    )
  except (KeyError, TypeError, ValueError) as error:
    raise ReaderError(f"unexpected change row: {row!r}") from error


class ReaderClient:
  """Reads the change log with a read-only token."""

  def __init__(self, config: Config, client: httpx.Client | None = None) -> None:
    self.base_url = config.reader_url
    self.client = client or httpx.Client(timeout=REQUEST_TIMEOUT_SECONDS)
    self.headers = {"authorization": f"Bearer {config.reader_token}"}

  def page(self, after: int) -> tuple[list[Change], int, bool]:
    """Fetch one page of changes after the given sequence number.

    Returns:
      (changes, next_seq, has_more)
    """
    response = self.client.get(f"{self.base_url}/automation/changes", params={"after": after}, headers=self.headers)
    if response.status_code != 200:
      raise ReaderError(f"reader answered {response.status_code} for changes after {after}")
    payload = response.json()
    changes = [parse_change(row) for row in payload.get("changes", [])]
    return changes, int(payload.get("next", after)), bool(payload.get("has_more"))

  def iter_pages(self, after: int) -> Iterator[tuple[list[Change], int]]:
    """Yield pages until the reader reports no more changes."""
    while True:
      changes, next_seq, has_more = self.page(after)
      if not changes:
        return
      yield changes, next_seq
      after = next_seq
      if not has_more:
        return
