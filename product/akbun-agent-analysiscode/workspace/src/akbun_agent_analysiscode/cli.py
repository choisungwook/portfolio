"""Command line entry point: learn, ask, chat, status."""

import argparse
import sys
from pathlib import Path

from . import get_version
from .backends import get_backend
from .commands.ask import run_ask
from .commands.chat import run_chat
from .commands.learn import run_learn
from .commands.status import run_status
from .config import DEFAULT_CONFIG_NAME, AgentConfig, load_config
from .errors import AgentError


def main(argv: list[str] | None = None) -> int:
  """Parse arguments, dispatch to a subcommand, and map errors to exit codes."""
  args = build_parser().parse_args(argv)
  try:
    return args.func(args)
  except AgentError as exc:
    print(f"error: {exc}", file=sys.stderr)
    return 1
  except KeyboardInterrupt:
    return 130


def build_parser() -> argparse.ArgumentParser:
  """Define the CLI surface."""
  parser = argparse.ArgumentParser(
    prog="akbun-agent-analysiscode",
    description="Learn cross-service relationships from MSA source code and debug with them.",
  )
  parser.add_argument("--version", action="version", version=get_version())
  parser.add_argument(
    "--config",
    type=Path,
    default=Path(DEFAULT_CONFIG_NAME),
    help=f"project config file (default: ./{DEFAULT_CONFIG_NAME})",
  )
  parser.add_argument("--provider", choices=("claude", "codex"), help="override the config provider")
  parser.add_argument("--model", help="override the backend model")

  sub = parser.add_subparsers(required=True)

  learn = sub.add_parser("learn", help="analyze every registered service and build the knowledge graph")
  learn.set_defaults(func=_cmd_learn)

  ask = sub.add_parser("ask", help="one-shot debugging question")
  ask.add_argument("question")
  ask.add_argument("--log", type=Path, help="log file to attach to the question")
  ask.set_defaults(func=_cmd_ask)

  chat = sub.add_parser("chat", help="interactive debugging session")
  chat.set_defaults(func=_cmd_chat)

  status = sub.add_parser("status", help="show registered services and knowledge freshness")
  status.set_defaults(func=_cmd_status)

  return parser


def _cmd_learn(args: argparse.Namespace) -> int:
  config = load_config(args.config)
  return run_learn(config, _backend(args, config))


def _cmd_ask(args: argparse.Namespace) -> int:
  config = load_config(args.config)
  return run_ask(config, _backend(args, config), args.question, log_path=args.log)


def _cmd_chat(args: argparse.Namespace) -> int:
  config = load_config(args.config)
  return run_chat(config, _backend(args, config))


def _cmd_status(args: argparse.Namespace) -> int:
  return run_status(load_config(args.config))


def _backend(args: argparse.Namespace, config: AgentConfig):
  """CLI flags win over config for provider and model."""
  return get_backend(args.provider or config.provider, model=args.model or config.model)
