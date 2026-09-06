import configparser
import os
import shlex
import shutil
from contextlib import contextmanager
from pathlib import Path
from tempfile import TemporaryDirectory

import boto3
import botocore.session

from client.config import REGION, ROOT, certificate_path, private_key_path


def helper_command(lab: dict) -> list[str]:
  """Build the official helper command for the Seoul CreateSession endpoint."""
  helper = shutil.which(
    str(os.environ.get("SIGNING_HELPER", ROOT / "runtime/bin/aws_signing_helper"))
  )
  if not helper:
    raise ValueError("Run python -m scripts.install_helper or set SIGNING_HELPER")
  return [
    helper,
    "credential-process",
    "--certificate",
    str(certificate_path()),
    "--private-key",
    str(private_key_path()),
    "--trust-anchor-arn",
    lab["trust_anchor_arn"],
    "--profile-arn",
    lab["profile_arn"],
    "--role-arn",
    lab["role_arn"],
    "--region",
    REGION,
    "--endpoint",
    f"https://rolesanywhere.{REGION}.amazonaws.com",
    "--session-duration",
    "3600",
  ]


def write_profile(path: Path, command: list[str]) -> None:
  """Write a private AWS configuration containing command paths and public ARNs."""
  profile = configparser.RawConfigParser()
  profile["profile lab-ra"] = {"region": REGION, "credential_process": shlex.join(command)}
  with path.open("x") as output:
    path.chmod(0o600)
    profile.write(output)


def process_session(path: Path) -> boto3.Session:
  """Select an isolated process provider instead of ambient keys, SSO or IMDS."""
  core = botocore.session.Session(profile="lab-ra")
  core.set_config_variable("config_file", str(path))
  core.set_config_variable("credentials_file", str(path.parent / "no-credentials"))
  session = boto3.Session(botocore_session=core)
  credentials = session.get_credentials()
  if credentials is None or credentials.method != "custom-process":
    raise RuntimeError("The credential_process provider was not selected")
  print("CREDENTIAL_PROVIDER_OK custom-process", flush=True)
  return session


@contextmanager
def certificate_session(command: list[str]):
  """Keep the process provider alive so boto3 can refresh credentials before expiry."""
  with TemporaryDirectory(prefix="roles-anywhere-") as directory:
    path = Path(directory) / "config"
    write_profile(path, command)
    yield process_session(path)
