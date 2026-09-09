"""Pull reader changes into the raw mirror and record the last applied seq."""
from dataclasses import dataclass

from .config import Config
from .index_store import IndexStore, now
from .raw_store import apply_change
from .reader_client import ReaderClient

STATE_SEQ = "reader_seq"


@dataclass(frozen=True)
class SyncResult:
  """What one sync run did."""

  applied: int
  changed_files: int
  last_seq: int


def sync_reader(config: Config, store: IndexStore, client: ReaderClient) -> SyncResult:
  """Apply every change after the stored seq, one page per transaction of state.

  The seq is saved only after a whole page is on disk, so an interrupted run
  re-applies that page and nothing is skipped.
  """
  after = int(store.get_state(STATE_SEQ, "0"))
  applied = 0
  changed = 0
  for changes, next_seq in client.iter_pages(after):
    changed += sum(apply_change(config.raw_dir, change) for change in changes)
    applied += len(changes)
    store.set_state(STATE_SEQ, str(next_seq))
    after = next_seq
  store.set_state("synced_at", now())
  return SyncResult(applied=applied, changed_files=changed, last_seq=after)
