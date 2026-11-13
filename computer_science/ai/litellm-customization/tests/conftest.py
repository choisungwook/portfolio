"""단계별 테스트가 공유하는 config 로더."""

import sys
from pathlib import Path

import yaml

WORKSPACE = Path(__file__).parent.parent
CONFIG_DIR = WORKSPACE / "config"
sys.path.insert(0, str(WORKSPACE / "scripts"))


def load_config(name: str) -> dict:
  """config/ 아래 YAML 파일을 dict로 읽는다.

  Args:
    name: config 파일 이름. 예: "1-basic.yaml"

  Returns:
    YAML을 파싱한 dict
  """
  return yaml.safe_load((CONFIG_DIR / name).read_text())
