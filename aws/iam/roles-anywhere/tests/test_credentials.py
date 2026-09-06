import json
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from botocore.exceptions import CredentialRetrievalError

from run import certificate_session


def test_process_provider_overrides_ambient_keys_refreshes_and_cleans_config(tmp_path, monkeypatch):
  monkeypatch.setenv("AWS_ACCESS_KEY_ID", "ambient-wrong")
  monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "ambient-secret")
  counter = tmp_path / "counter"
  helper = tmp_path / "fake helper.py"
  helper.write_text(
    "import json\nfrom pathlib import Path\nfrom datetime import datetime, UTC, timedelta\n"
    f"p = Path({str(counter)!r})\nn = int(p.read_text()) + 1 if p.exists() else 1\n"
    "p.write_text(str(n))\n"
    "print(json.dumps({'Version': 1, 'AccessKeyId': 'ASIAFAKE' + str(n), "
    "'SecretAccessKey': 'fake-secret', 'SessionToken': 'fake-token', "
    "'Expiration': (datetime.now(UTC) + timedelta(hours=1)).isoformat()}))\n"
  )
  with certificate_session([sys.executable, str(helper)]) as session:
    credentials = session.get_credentials()
    assert credentials.method == "custom-process"
    assert credentials.get_frozen_credentials().access_key == "ASIAFAKE1"
    credentials._expiry_time = datetime.now(UTC) + timedelta(seconds=30)
    assert credentials.get_frozen_credentials().access_key == "ASIAFAKE2"
    assert counter.read_text() == "2"
    path = Path(session._session.get_config_variable("config_file"))
    assert path.stat().st_mode & 0o777 == 0o600
  assert not path.exists()


def test_failed_helper_does_not_fall_back_to_environment_credentials(tmp_path, monkeypatch):
  monkeypatch.setenv("AWS_ACCESS_KEY_ID", "ambient-wrong")
  monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "ambient-secret")
  helper = tmp_path / "denied.py"
  helper.write_text("import sys\nsys.stderr.write('AccessDeniedException')\nsys.exit(1)\n")
  with (
    pytest.raises(CredentialRetrievalError, match="AccessDeniedException"),
    certificate_session([sys.executable, str(helper)]),
  ):
    pytest.fail("A denied certificate must not fall back to another identity")


def test_temporary_credentials_are_not_printed(tmp_path, capsys):
  helper = tmp_path / "helper.py"
  response = {
    "Version": 1,
    "AccessKeyId": "ASIAEXAMPLE",
    "SecretAccessKey": "must-not-be-printed",
    "SessionToken": "secret-token",
    "Expiration": (datetime.now(UTC) + timedelta(hours=1)).isoformat(),
  }
  helper.write_text(f"print({json.dumps(json.dumps(response))})")
  with certificate_session([sys.executable, str(helper)]):
    pass
  output = capsys.readouterr()
  assert "must-not-be-printed" not in output.out + output.err
  assert "secret-token" not in output.out + output.err
