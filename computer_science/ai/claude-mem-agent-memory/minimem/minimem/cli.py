"""DB를 들여다보는 CLI.

사용: minimem <events|observations|context|search|observe> [인자]
"""

import argparse
import json

from minimem import db, search
from minimem.context import build_context
from minimem.observer import observe


def show_events(args: argparse.Namespace) -> None:
  """저장된 원본 이벤트를 크기와 함께 출력한다."""
  rows = db.connect().execute("SELECT * FROM events WHERE project = ? ORDER BY id", (args.project,)).fetchall()
  for r in rows:
    size = len(r["tool_input"]) + len(r["tool_output"])
    print(f"{r['id']}\t{r['tool_name']}\t{size} chars\tprocessed={r['processed']}\t{r['tool_input'][:60]}")


def show_observations(args: argparse.Namespace) -> None:
  """저장된 관찰 전체를 출력한다."""
  conn = db.connect()
  ids = [r["id"] for r in conn.execute("SELECT id FROM observations WHERE project = ? ORDER BY id", (args.project,))]
  print(search.get_observations(conn, ids) if ids else "관찰 없음")


def show_stats(args: argparse.Namespace) -> None:
  """원본 이벤트와 관찰의 크기를 비교한다."""
  conn = db.connect()
  raw = conn.execute("SELECT COUNT(*), COALESCE(SUM(LENGTH(tool_input) + LENGTH(tool_output)), 0) FROM events WHERE project = ?", (args.project,)).fetchone()
  obs = conn.execute(
    "SELECT COUNT(*), COALESCE(SUM(LENGTH(title) + LENGTH(facts) + LENGTH(narrative)), 0) FROM observations WHERE project = ?", (args.project,)
  ).fetchone()
  ctx = build_context(conn, args.project)
  print(json.dumps({"events": raw[0], "event_chars": raw[1], "observations": obs[0], "observation_chars": obs[1], "context_chars": len(ctx)}))


def build_parser() -> argparse.ArgumentParser:
  """하위 명령을 정의한다."""
  parser = argparse.ArgumentParser(prog="minimem")
  sub = parser.add_subparsers(dest="cmd", required=True)
  for name, func in (("events", show_events), ("observations", show_observations), ("stats", show_stats)):
    p = sub.add_parser(name)
    p.add_argument("project")
    p.set_defaults(func=func)
  p = sub.add_parser("context")
  p.add_argument("project")
  p.set_defaults(func=lambda a: print(build_context(db.connect(), a.project)))
  p = sub.add_parser("search")
  p.add_argument("project")
  p.add_argument("query")
  p.add_argument("--mode", choices=["and", "or"], default="or")
  p.set_defaults(func=lambda a: print(search.search(db.connect(), a.project, a.query, mode=a.mode)))
  p = sub.add_parser("observe")
  p.add_argument("session_id")
  p.set_defaults(func=lambda a: print(f"{observe(a.session_id)} observations"))
  return parser


def main() -> None:
  """CLI 진입점."""
  args = build_parser().parse_args()
  args.func(args)


if __name__ == "__main__":
  main()
