# Bottlerocket은 AMI 이름 필터 대신 SSM public parameter로 최신 AMI를 조회한다
data "aws_ssm_parameter" "bottlerocket_ami" {
  name = "/aws/service/bottlerocket/${var.bottlerocket_variant}/${var.arch}/${var.bottlerocket_version}/image_id"
}

data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }

  filter {
    name   = "default-for-az"
    values = ["true"]
  }
}
