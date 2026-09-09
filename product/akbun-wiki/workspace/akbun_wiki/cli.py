"""Command line: sync, build, serve, and API key management."""
import argparse
import sys

from .builder import build_wiki
from .config import Config, load_config
from .errors import WikiError
from .index_store import IndexStore
from .reader_client import ReaderClient
from .sync import sync_reader


def build_parser() -> argparse.ArgumentParser:
  """Define every subcommand."""
  parser = argparse.ArgumentParser(prog="wiki", description="Mirror akbun-reader into a graphify wiki")
  commands = parser.add_subparsers(dest="command", required=True)
  commands.add_parser("sync", help="pull reader changes, then build when files changed")
  commands.add_parser("build", help="run graphify and reindex without syncing")
  serve = commands.add_parser("serve", help="start the API")
  serve.add_argument("--host", default="127.0.0.1")
  serve.add_argument("--port", type=int, default=8787)
  keys = commands.add_parser("keys", help="manage API keys").add_subparsers(dest="keys_command", required=True)
  create = keys.add_parser("create", help="issue a key; the secret prints once")
  create.add_argument("name")
  create.add_argument("--admin", action="store_true", help="allow POST /api/sync")
  keys.add_parser("list", help="list keys")
  keys.add_parser("revoke", help="revoke a key by id").add_argument("key_id")
  return parser


def command_sync(store: IndexStore, config: Config) -> None:
  """Sync and build when the mirror changed."""
  result = sync_reader(config, store, ReaderClient(config))
  print(f"applied {result.applied} changes, {result.changed_files} files changed, seq {result.last_seq}")
  if result.changed_files or not config.wiki_dir.is_dir():
    print(f"indexed {build_wiki(config, store)} articles")


def command_keys(args: argparse.Namespace, store: IndexStore) -> None:
  """Create, list, or revoke keys."""
  if args.keys_command == "create":
    key, secret = store.create_key(args.name, "admin" if args.admin else "read")
    print(f"{key.id} {key.role} {key.name}\n{secret}")
  elif args.keys_command == "list":
    for key in store.list_keys():
      print(f"{key.id} {key.role} {key.name} created {key.created_at} revoked {key.revoked_at or '-'}")
  elif not store.revoke_key(args.key_id):
    raise WikiError(f"no active key with id {args.key_id}")


def command_serve(args: argparse.Namespace, config: Config) -> None:
  """Run uvicorn with the app bound to this data directory."""
  import uvicorn

  from .api import create_app

  uvicorn.run(create_app(config), host=args.host, port=args.port)


def main(argv: list[str] | None = None) -> int:
  """Entry point; returns the exit code."""
  args = build_parser().parse_args(argv)
  try:
    config = load_config()
    store = IndexStore(config.database)
    if args.command == "sync":
      command_sync(store, config)
    elif args.command == "build":
      print(f"indexed {build_wiki(config, store)} articles")
    elif args.command == "keys":
      command_keys(args, store)
    elif args.command == "serve":
      command_serve(args, config)
  except WikiError as error:
    print(f"error: {error}", file=sys.stderr)
    return 1
  return 0


if __name__ == "__main__":
  sys.exit(main())
