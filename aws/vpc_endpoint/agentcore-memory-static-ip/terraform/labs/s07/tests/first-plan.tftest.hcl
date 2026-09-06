mock_provider "aws" {
  mock_data "aws_subnet" {
    defaults = { vpc_id = "vpc-00000000000000001", availability_zone = "ap-northeast-2a" }
  }
  mock_data "aws_vpc_endpoint_service" {
    defaults = { availability_zones = ["ap-northeast-2a"] }
  }
  mock_data "aws_route53_zone" {
    defaults = { private_zone = false }
  }
}
variables {
  project_name          = "memory-s07"
  vpc_id                = "vpc-00000000000000001"
  subnets               = { ap-northeast-2a = "subnet-00000000000000001" }
  client_cidrs          = ["0.0.0.0/0"]
  trusted_principal_arn = "arn:aws:iam::123456789012:role/TestClient"

  proxy_domain        = "s07-proxy.example.com"
  acm_certificate_arn = "arn:aws:acm:ap-northeast-2:123456789012:certificate/test"
  nlb_private_ips     = {}
}
run "first_plan_without_existing_endpoint_enis" {
  command = plan
  assert {
    condition     = sort(keys(module.services.lab.services)) == sort(["memory", "sts"])
    error_message = "Only the required credential service and Memory should be provisioned."
  }
  assert {
    condition     = output.lab.proxy_url == "https://s07-proxy.example.com:443"
    error_message = "The SDK and helper must share the TLS proxy endpoint."
  }
}
