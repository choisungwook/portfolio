"""명령행 진입점. 기본은 GUI, --report는 텍스트 리포트 출력이다."""

from __future__ import annotations

import argparse
import sys


def main(argv: list[str] | None = None) -> None:
  """인자에 따라 GUI 또는 텍스트 리포트를 실행한다."""
  arg_parser = argparse.ArgumentParser(
    prog="hprof-oom-analyzer", description="JVM heap dump(hprof) OOM 분석 도구",
  )
  arg_parser.add_argument("hprof", nargs="?", help="분석할 hprof 파일 경로")
  arg_parser.add_argument("--report", action="store_true", help="GUI 없이 텍스트 리포트만 출력한다")
  args = arg_parser.parse_args(argv)
  if args.report:
    _print_report(arg_parser, args.hprof)
  else:
    from .gui import run_gui

    run_gui(args.hprof)


def _print_report(arg_parser: argparse.ArgumentParser, path: str | None) -> None:
  if not path:
    arg_parser.error("--report 모드에는 hprof 파일 경로가 필요하다")
  from .parser import parse_hprof
  from .report import render_report

  if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
  print(render_report(parse_hprof(path)))


if __name__ == "__main__":
  main()
