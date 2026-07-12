locals {
  # 폐쇄망 운영에 필요한 interface endpoint. 각각이 없으면 무엇이 막히는지가 학습 포인트다.
  interface_endpoints = {
    ssm             = "com.amazonaws.${var.aws_region}.ssm"             # SSM Session Manager 접속
    ssmmessages     = "com.amazonaws.${var.aws_region}.ssmmessages"     # 세션 채널
    ec2messages     = "com.amazonaws.${var.aws_region}.ec2messages"     # SSM agent 통신
    ecr_api         = "com.amazonaws.${var.aws_region}.ecr.api"         # ECR 인증·매니페스트
    ecr_dkr         = "com.amazonaws.${var.aws_region}.ecr.dkr"         # ECR docker pull
    bedrock_runtime = "com.amazonaws.${var.aws_region}.bedrock-runtime" # Bedrock 모델 호출
  }
}

resource "aws_vpc_endpoint" "interface" {
  for_each = local.interface_endpoints

  vpc_id              = module.vpc.vpc_id
  service_name        = each.value
  vpc_endpoint_type   = "Interface"
  subnet_ids          = module.vpc.private_subnets
  security_group_ids  = [aws_security_group.endpoint.id]
  private_dns_enabled = true

  tags = {
    Name = "${var.project_name}-${each.key}"
  }
}

# S3만 gateway endpoint다. AL2023 dnf 저장소와 ECR image layer가 S3에 있어 폐쇄망 패키지 설치·pull에 필수다.
resource "aws_vpc_endpoint" "s3" {
  vpc_id            = module.vpc.vpc_id
  service_name      = "com.amazonaws.${var.aws_region}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = module.vpc.private_route_table_ids

  tags = {
    Name = "${var.project_name}-s3"
  }
}
