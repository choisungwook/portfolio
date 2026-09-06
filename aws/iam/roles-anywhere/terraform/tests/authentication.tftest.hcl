mock_provider "aws" {
  mock_resource "aws_iam_role" {
    defaults = { arn = "arn:aws:iam::123456789012:role/ra-handson-client" }
  }
  mock_resource "aws_rolesanywhere_trust_anchor" {
    defaults = { arn = "arn:aws:rolesanywhere:ap-northeast-2:123456789012:trust-anchor/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" }
  }
  mock_resource "aws_bedrockagentcore_memory" {
    defaults = { arn = "arn:aws:bedrock-agentcore:ap-northeast-2:123456789012:memory/test_memory-1234567890" }
  }
  mock_data "aws_caller_identity" {
    defaults = { account_id = "123456789012" }
  }
}
variables {
  ca_certificate_path = "../tests/fixtures/mock-ca.txt"
}
run "first_plan" {
  command = plan
  assert {
    condition     = aws_rolesanywhere_profile.lab.duration_seconds <= aws_iam_role.client.max_session_duration
    error_message = "Profile duration must fit within the role maximum."
  }
}
run "certificate_and_permission_boundary" {
  command = apply
  assert {
    condition     = jsondecode(aws_iam_role.client.assume_role_policy).Statement[0].Condition.StringEquals["aws:PrincipalTag/x509Subject/CN"] == "memory-client"
    error_message = "A certificate from the trusted CA with another CN must not match this role trust."
  }
  assert {
    condition     = toset(jsondecode(aws_iam_role_policy.memory.policy).Statement[0].Action) == toset(["bedrock-agentcore:CreateEvent", "bedrock-agentcore:GetEvent", "bedrock-agentcore:DeleteEvent"])
    error_message = "The runtime role may only perform the three event operations."
  }
}
run "reject_empty_subject" {
  command = plan
  variables { certificate_common_name = "" }
  expect_failures = [var.certificate_common_name]
}
