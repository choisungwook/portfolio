from io import BytesIO

import pytest

from scripts.install_helper import install


def test_invalid_download_never_installs_executable(tmp_path, monkeypatch):
  monkeypatch.setattr(
    "scripts.install_helper.urllib.request.urlopen", lambda *args, **kwargs: BytesIO(b"tampered")
  )
  destination = tmp_path / "helper"
  with pytest.raises(ValueError, match="SHA256 mismatch"):
    install(destination)
  assert not destination.exists()


def test_existing_unexpected_binary_is_not_overwritten(tmp_path):
  destination = tmp_path / "helper"
  destination.write_bytes(b"another-version")
  with pytest.raises(ValueError, match="Existing helper differs"):
    install(destination)
  assert destination.read_bytes() == b"another-version"
