mock_provider "aws" {
  mock_data "aws_caller_identity" {
    defaults = { account_id = "123456789012" }
  }
  mock_data "aws_partition" {
    defaults = { partition = "aws" }
  }
  mock_data "aws_availability_zones" {
    defaults = { names = ["ap-northeast-2a", "ap-northeast-2c"] }
  }
}

variables {
  allowed_cidr = "203.0.113.10/32"
}

run "foundation_contract" {
  command = plan

  assert {
    condition     = aws_ecr_repository.hello_images.image_tag_mutability == "IMMUTABLE"
    error_message = "Bootstrap 이미지 태그 덮어쓰기는 허용하지 않습니다."
  }
  assert {
    condition     = length(module.lab_vpc.private_subnets) == 0 && length(module.lab_vpc.natgw_ids) == 0
    error_message = "private subnet과 NAT Gateway를 만들지 않습니다."
  }
  assert {
    condition     = aws_s3_bucket_versioning.pipeline_artifacts.versioning_configuration[0].status == "Enabled" && aws_s3_bucket_public_access_block.pipeline_artifacts.block_public_policy
    error_message = "아티팩트 버전 관리와 public access 차단이 필요합니다."
  }
  assert {
    condition     = one(aws_s3_bucket_server_side_encryption_configuration.pipeline_artifacts.rule).apply_server_side_encryption_by_default[0].sse_algorithm == "AES256"
    error_message = "아티팩트 암호화가 필요합니다."
  }
  assert {
    condition     = length(aws_cloudwatch_log_group.hello_services) == 2 && length(aws_codeconnections_connection.github_source) == 1
    error_message = "서비스 로그 2개와 신규 연결 1개가 필요합니다."
  }
  assert {
    condition     = length(toset([aws_iam_role.hello_task.name, aws_iam_role.hello_execution.name, aws_iam_role.deployment_build.name, aws_iam_role.service_pipeline.name])) == 4
    error_message = "Task, Execution, CodeBuild, CodePipeline 역할은 달라야 합니다."
  }
}

run "reuse_available_connection" {
  command = plan

  variables {
    existing_connection_arn = "arn:aws:codeconnections:ap-northeast-2:123456789012:connection/existing"
  }

  assert {
    condition     = length(aws_codeconnections_connection.github_source) == 0
    error_message = "기존 연결을 사용할 때 새 연결을 생성하면 안 됩니다."
  }
}
