import platform

import pytest

from install_helper import install


def test_unsupported_platform_fails_with_supported_list(tmp_path, monkeypatch):
  monkeypatch.setattr(platform, "system", lambda: "Plan9")
  monkeypatch.setattr(platform, "machine", lambda: "mips")
  with pytest.raises(ValueError, match="Plan9/mips.*supported: Darwin/arm64"):
    install(tmp_path / "helper")
