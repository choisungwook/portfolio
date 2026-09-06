mock_provider "aws" {
  mock_resource "aws_iam_role" {
    defaults = { arn = "arn:aws:iam::123456789012:role/memory-static-ip-client" }
  }
  mock_resource "aws_lb" {
    defaults = { arn = "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:loadbalancer/net/test/0000000000000000" }
  }
  mock_resource "aws_lb_target_group" {
    defaults = { arn = "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:targetgroup/test/0000000000000000" }
  }
  mock_data "aws_network_interface" {
    defaults = { private_ip = "10.0.1.10" }
  }
  mock_data "aws_vpc" {
    defaults = { id = "vpc-00000000000000001" }
  }
  mock_data "aws_subnet" {
    defaults = { id = "subnet-00000000000000001" }
  }
  mock_data "aws_vpc_endpoint_service" {
    defaults = { availability_zones = ["ap-northeast-2a", "ap-northeast-2c"] }
  }
}

variables {
  allowed_client_cidrs  = ["0.0.0.0/0"]
  trusted_principal_arn = "arn:aws:iam::123456789012:role/administrator"
  sts_alias_domain      = "s01-sts.example.com"
}

run "single_az_first_plan" {
  command = plan

  assert {
    condition     = length(aws_lb_target_group_attachment.endpoint) == 2
    error_message = "A first plan must resolve both target attachment keys before endpoint ENIs exist."
  }
  assert {
    condition = (
      length(aws_vpc_security_group_ingress_rule.client) == 1 &&
      aws_vpc_security_group_ingress_rule.client["0.0.0.0/0"].from_port == 443 &&
      aws_vpc_security_group_ingress_rule.client["0.0.0.0/0"].to_port == 443 &&
      aws_vpc_security_group_ingress_rule.client["0.0.0.0/0"].ip_protocol == "tcp"
    )
    error_message = "Public client ingress must allow all IPv4 clients on TCP 443 only."
  }
  assert {
    condition     = aws_vpc_security_group_ingress_rule.endpoint.cidr_ipv4 == null
    error_message = "Public NLB ingress must preserve the backend SG boundary."
  }
}

run "two_az_first_plan" {
  command = plan
  variables {
    availability_zones = ["ap-northeast-2a", "ap-northeast-2c"]
  }

  assert {
    condition     = length(aws_eip.nlb) == 4 && length(aws_lb_target_group_attachment.endpoint) == 4
    error_message = "Each service/AZ pair needs an EIP and an independently resolved ENI attachment."
  }
}

run "reject_unavailable_endpoint_az" {
  command = plan
  variables {
    availability_zones = ["ap-northeast-2d"]
  }
  expect_failures = [aws_vpc_endpoint.api]
}

run "reject_non_ipv4_ingress" {
  command = plan
  variables {
    allowed_client_cidrs = ["::/0"]
  }
  expect_failures = [var.allowed_client_cidrs]
}

run "existing_principal_identity" {
  command = apply

  assert {
    condition = (
      jsondecode(aws_iam_role.client.assume_role_policy).Statement[0].Principal.AWS == var.trusted_principal_arn &&
      jsondecode(aws_vpc_endpoint.api["sts"].policy).Statement[0].Principal == "*" &&
      jsondecode(aws_vpc_endpoint.api["memory"].policy).Statement[0].Principal.AWS == aws_iam_role.client.arn
    )
    error_message = "Role trust names the supplied principal; the PoC STS endpoint policy is open while Memory stays restricted to the client role."
  }
  assert {
    condition = (
      !issensitive(output.client_config) &&
      output.client_config.source_principal_arn == var.trusted_principal_arn
    )
    error_message = "Runtime config stays non-secret and names the client profile's principal; no key output exists."
  }
}

run "reject_session_arn" {
  command = plan
  variables {
    trusted_principal_arn = "arn:aws:sts::123456789012:assumed-role/administrator/session"
  }
  expect_failures = [var.trusted_principal_arn]
}
