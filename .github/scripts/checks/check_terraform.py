"""Terraform 파일이 .claude/rule-details/terraform.md의 기계 판정 가능한 규칙을 지키는지 본다.

범용 보안 스캐너는 실습용 설정(allow-all 등)까지 잡아 소음이 커서, 이 저장소가 정한 규칙만 본다.
"""

import re

from common import REPO_ROOT, Report, parse_file_args

BLOCK_HEADER = re.compile(r'^\s*(resource|data)\s+"([^"]+)"\s+"([^"]+)"\s*\{', re.MULTILINE)
MEANINGLESS_NAMES = {"main", "this"}
FORBIDDEN_RESOURCES = {
  "aws_cloudfront_origin_access_identity": "OAI 대신 aws_cloudfront_origin_access_control(OAC)을 쓸 것",
  "aws_key_pair": "SSH key pair 대신 SSM Session Manager로 접속할 것",
}
REQUIRED_ARGUMENTS = {
  "aws_db_instance": ("storage_encrypted", "true"),
  "aws_rds_cluster": ("storage_encrypted", "true"),
  "aws_ebs_volume": ("encrypted", "true"),
}


def block_body(text: str, start: int) -> str:
  """start 위치의 여는 중괄호와 짝이 맞는 닫는 중괄호까지를 돌려준다."""
  depth = 0
  for index in range(start, len(text)):
    depth += {"{": 1, "}": -1}.get(text[index], 0)
    if depth == 0:
      return text[start : index + 1]
  return text[start:]


def has_argument(body: str, name: str, value: str) -> bool:
  """블록 안에 name = value 인자가 있는지 본다."""
  return re.search(rf"^\s*{name}\s*=\s*{value}\b", body, re.MULTILINE) is not None


def opens_ssh(resource_type: str, body: str) -> bool:
  """security group 규칙이 port 22 ingress를 여는지 본다."""
  if resource_type == "aws_vpc_security_group_ingress_rule":
    return has_argument(body, "from_port", "22")
  if resource_type == "aws_security_group_rule":
    return has_argument(body, "type", '"ingress"') and has_argument(body, "from_port", "22")
  ingress_blocks = re.findall(r"ingress\s*\{[^}]*\}", body) if resource_type == "aws_security_group" else []
  return any(has_argument(block, "from_port", "22") for block in ingress_blocks)


def check_resource(path: str, line: int, resource_type: str, body: str, report: Report) -> None:
  """resource 블록 하나에 규칙을 적용한다."""
  if resource_type in FORBIDDEN_RESOURCES:
    report.add(path, f"{resource_type}: {FORBIDDEN_RESOURCES[resource_type]}", line)
  if resource_type in REQUIRED_ARGUMENTS:
    name, value = REQUIRED_ARGUMENTS[resource_type]
    if not has_argument(body, name, value):
      report.add(path, f"{resource_type}에 {name} = {value}를 지정할 것. 암호화는 기본값임", line)
  if resource_type == "aws_instance" and "root_block_device" in body and not has_argument(body, "encrypted", "true"):
    report.add(path, "root_block_device에 encrypted = true를 지정할 것", line)
  if opens_ssh(resource_type, body):
    report.add(path, "port 22 ingress를 열지 말 것. EC2 접속은 SSM Session Manager를 씀", line)
  if has_argument(body, "engine", '"redis"'):
    report.add(path, 'ElastiCache 엔진은 engine = "valkey"를 쓸 것', line)


def check_file(path: str, report: Report) -> None:
  """파일 하나의 resource와 data 블록을 모두 검사한다."""
  text = (REPO_ROOT / path).read_text(encoding="utf-8", errors="replace")
  for found in BLOCK_HEADER.finditer(text):
    kind, resource_type, name = found.groups()
    line = text.count("\n", 0, found.start()) + 1
    if name in MEANINGLESS_NAMES:
      report.add(path, f'{kind} "{resource_type}" "{name}": 이름을 역할이 드러나게 바꿀 것. main과 this는 쓰지 않음', line)
    if kind == "resource":
      check_resource(path, line, resource_type, block_body(text, found.end() - 1), report)


def main() -> None:
  """인자로 받은 .tf 파일을 검사한다."""
  files, report = parse_file_args(__doc__)
  for path in files:
    if path.endswith(".tf") and (REPO_ROOT / path).is_file():
      check_file(path, report)
  report.exit()


if __name__ == "__main__":
  main()
