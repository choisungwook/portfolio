import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

DEFAULT_MODEL = "gpt-4.1-nano"
DEFAULT_DATA_DIR = Path(__file__).resolve().parents[2] / "mock_data"


@dataclass(frozen=True)
class Settings:
  api_key: str
  model: str
  data_dir: Path

  @classmethod
  def from_env(cls) -> "Settings":
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
      raise RuntimeError("OPENAI_API_KEY가 비어 있습니다. .env를 확인하세요.")
    model = os.environ.get("OPENAI_MODEL", DEFAULT_MODEL).strip() or DEFAULT_MODEL
    data_dir = Path(os.environ.get("DATA_DIR", DEFAULT_DATA_DIR))
    return cls(api_key=api_key, model=model, data_dir=data_dir)
