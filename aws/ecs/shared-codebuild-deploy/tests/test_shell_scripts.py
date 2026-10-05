import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
FOUNDATION = {
  "aws_region": "ap-northeast-2", "repository_name": "lab-hello",
  "repository_url": "123456789012.dkr.ecr.ap-northeast-2.amazonaws.com/lab-hello",
}

FAKE_AWS = """
import json
import os
import sys
from pathlib import Path
with Path(os.environ['FAKE_AWS_LOG']).open('a') as log:
  log.write(json.dumps(sys.argv[1:]) + '\\n')
if sys.argv[1:3] == ['ecr', 'get-login-password']:
  print('test-password')
elif sys.argv[1:3] == ['ecr', 'describe-images']:
  mode = os.environ.get('FAKE_IMAGE_MODE', 'present')
  if mode != 'present':
    code = 'ImageNotFoundException' if mode == 'absent' else mode
    print(f'An error occurred ({code}) when calling DescribeImages', file=sys.stderr)
    sys.exit(254)
  print('{}')
elif sys.argv[1:3] == ['codepipeline', 'start-pipeline-execution']:
  code = int(os.environ.get('FAKE_AWS_EXIT', '0'))
  print(json.dumps({'pipelineExecutionId': 'execution-123'}))
  sys.exit(code)
else:
  sys.exit(99)
"""

FAKE_DOCKER = """
import json
import os
import sys
from pathlib import Path
if sys.argv[1] == 'login':
  sys.stdin.read()
with Path(os.environ['FAKE_DOCKER_LOG']).open('a') as log:
  log.write(json.dumps(sys.argv[1:]) + '\\n')
"""


class ShellScriptsTest(unittest.TestCase):
  def setUp(self):
    self.temporary = tempfile.TemporaryDirectory()
    self.addCleanup(self.temporary.cleanup)
    self.directory = Path(self.temporary.name)
    self.aws_log = self.directory / "aws.jsonl"
    self.docker_log = self.directory / "docker.jsonl"
    self.environment = {
      **os.environ, "PATH": f"{self.directory}:{os.environ['PATH']}",
      "FAKE_AWS_LOG": str(self.aws_log), "FAKE_DOCKER_LOG": str(self.docker_log),
    }
    self.executable("aws", FAKE_AWS)
    self.executable("terraform", f"print({json.dumps(json.dumps(FOUNDATION))})")
    self.executable("docker", FAKE_DOCKER)

  def executable(self, name, body):
    target = self.directory / name
    target.write_text(f"#!{sys.executable}\n{body}\n")
    target.chmod(0o755)

  def run_script(self, name, *arguments, **environment):
    return subprocess.run(
      ["bash", str(SCRIPTS / name), *arguments], capture_output=True, text=True,
      timeout=10, env={**self.environment, **environment},
    )

  def test_pipeline_passes_only_image_tag(self):
    tag = "v1"
    result = self.run_script("start-pipeline.sh", "alpha-pipeline", tag)
    self.assertEqual(result.returncode, 0, result.stderr)
    arguments = json.loads(self.aws_log.read_text())
    variables = json.loads(arguments[arguments.index("--variables") + 1])
    self.assertEqual({item["name"]: item["value"] for item in variables}, {
      "IMAGE_TAG": tag,
    })
    self.assertNotIn("SERVICE_NAME", {item["name"] for item in variables})

  def test_invalid_inputs_fail_before_aws_call(self):
    for arguments in (("alpha",), ("alpha", "v1", "extra")):
      result = self.run_script("start-pipeline.sh", *arguments)
      self.assertNotEqual(result.returncode, 0)
      self.assertFalse(self.aws_log.exists())

  def test_pipeline_aws_failure_is_not_success(self):
    result = self.run_script("start-pipeline.sh", "alpha-pipeline", "v1", FAKE_AWS_EXIT="254")
    self.assertEqual(result.returncode, 254)

  def test_bootstrap_skips_existing_tags(self):
    result = self.run_script("bootstrap-images.sh")
    self.assertEqual(result.returncode, 0, result.stderr)
    calls = [json.loads(line) for line in self.docker_log.read_text().splitlines()]
    self.assertEqual(len(calls), 1)
    self.assertEqual(calls[0][0], "login")
    self.assertIn("v1 already exists", result.stdout)
    self.assertIn("v2 already exists", result.stdout)

  def test_bootstrap_builds_two_amd64_images_only_when_absent(self):
    result = self.run_script("bootstrap-images.sh", FAKE_IMAGE_MODE="absent")
    self.assertEqual(result.returncode, 0, result.stderr)
    calls = [json.loads(line) for line in self.docker_log.read_text().splitlines()]
    builds = [call for call in calls if call[:2] == ["buildx", "build"]]
    pushes = [call for call in calls if call[0] == "push"]
    self.assertEqual(len(builds), 2)
    self.assertEqual(len(pushes), 2)
    for tag, call in zip(("v1", "v2"), builds):
      self.assertIn("linux/amd64", call)
      self.assertIn(f"IMAGE_VERSION={tag}", call)

  def test_bootstrap_access_denied_never_builds_or_pushes(self):
    result = self.run_script("bootstrap-images.sh", FAKE_IMAGE_MODE="AccessDeniedException")
    self.assertNotEqual(result.returncode, 0)
    self.assertIn("AccessDeniedException", result.stderr)
    calls = [json.loads(line) for line in self.docker_log.read_text().splitlines()]
    self.assertEqual(len(calls), 1)


if __name__ == "__main__":
  unittest.main()
