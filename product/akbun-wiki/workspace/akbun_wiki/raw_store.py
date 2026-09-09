"""Raw mirror: one markdown file per reader document.

graphify reads this directory. The frontmatter carries the metadata an
LLM needs to cite the source; the body is the reader's extracted text.
"""
import json
from pathlib import Path

from .reader_client import Change


def raw_path(raw_dir: Path, document_id: str) -> Path:
  """File for a document; the id never changes, so neither does the path."""
  return raw_dir / f"{document_id}.md"


def render_document(change: Change) -> str:
  """Markdown with YAML frontmatter for one document."""
  frontmatter = "\n".join([
    "---",
    f"title: {json.dumps(change.title, ensure_ascii=False)}",
    f"url: {json.dumps(change.url)}",
    f"tags: {json.dumps(change.tags, ensure_ascii=False)}",
    f"location: {change.location}",
    f"saved_at: {change.created_at}",
    f"reader_id: {change.document_id}",
    "---",
  ])
  return f"{frontmatter}\n\n# {change.title}\n\n{change.body.strip()}\n"


def apply_change(raw_dir: Path, change: Change) -> bool:
  """Write or delete the file for one change.

  Returns:
    True when the directory content changed.
  """
  raw_dir.mkdir(parents=True, exist_ok=True)
  path = raw_path(raw_dir, change.document_id)
  if change.deleted:
    return remove_file(path)
  return write_if_different(path, render_document(change))


def remove_file(path: Path) -> bool:
  """Delete a file when present."""
  if not path.exists():
    return False
  path.unlink()
  return True


def write_if_different(path: Path, content: str) -> bool:
  """Atomically write content unless the file already holds it."""
  if path.exists() and path.read_text(encoding="utf-8") == content:
    return False
  temporary = path.with_suffix(".md.tmp")
  temporary.write_text(content, encoding="utf-8")
  temporary.replace(path)
  return True
