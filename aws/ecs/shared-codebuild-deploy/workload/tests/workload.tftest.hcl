mock_provider "aws" {
  mock_data "aws_ecr_image" {
    defaults = { image_digest = "sha256:1111111111111111111111111111111111111111111111111111111111111111" }
  }
  mock_data "aws_caller_identity" {
    defaults = { account_id = "123456789012" }
  }
}

override_data {
  target = data.terraform_remote_state.foundation
  values = {
    outputs = {
      lab = {
        aws_region             = "ap-northeast-2"
        project_name           = "ecs-shared-build"
        account_id             = "123456789012"
        cluster_name           = "ecs-shared-build-cluster"
        cluster_arn            = "arn:aws:ecs:ap-northeast-2:123456789012:cluster/ecs-shared-build-cluster"
        service_names          = ["hello-alpha", "hello-beta"]
        public_subnet_ids      = ["subnet-11111111", "subnet-22222222"]
        security_group_id      = "sg-11111111"
        repository_name        = "ecs-shared-build-hello"
        repository_url         = "123456789012.dkr.ecr.ap-northeast-2.amazonaws.com/ecs-shared-build-hello"
        task_role_arn          = "arn:aws:iam::123456789012:role/ecs-shared-build-task"
        execution_role_arn     = "arn:aws:iam::123456789012:role/ecs-shared-build-execution"
        codebuild_role_arn     = "arn:aws:iam::123456789012:role/ecs-shared-build-codebuild"
        codepipeline_role_arn  = "arn:aws:iam::123456789012:role/ecs-shared-build-codepipeline"
        codebuild_project_name = "ecs-shared-build-deploy"
        codebuild_log_group    = "/aws/codebuild/ecs-shared-build-deploy"
        service_log_groups = {
          hello-alpha = "/ecs/ecs-shared-build/hello-alpha"
          hello-beta  = "/ecs/ecs-shared-build/hello-beta"
        }
        connection_arn  = "arn:aws:codeconnections:ap-northeast-2:123456789012:connection/example"
        artifact_bucket = "ecs-shared-build-artifacts"
      }
    }
  }
}

variables {
  github_repository = "example-owner/ecs-deploy-lab"
}

run "shared_project_and_service_routing" {
  command = plan

  assert {
    condition = (
      length(aws_codepipeline.service_deployment) == 2 &&
      alltrue([for pipeline in aws_codepipeline.service_deployment : pipeline.stage[1].action[0].configuration.ProjectName == aws_codebuild_project.shared_deployer.name])
    )
    error_message = "Pipeline 2개가 동일한 CodeBuild project를 호출해야 합니다."
  }
  assert {
    condition = alltrue([for name, pipeline in aws_codepipeline.service_deployment :
      [for environment in jsondecode(pipeline.stage[1].action[0].configuration.EnvironmentVariables) : environment.value if environment.name == "SERVICE_NAME"] == [name]
    ])
    error_message = "각 Pipeline이 고정된 대상 서비스만 전달해야 합니다."
  }
  assert {
    condition = alltrue([for pipeline in aws_codepipeline.service_deployment :
      pipeline.pipeline_type == "V2" && pipeline.execution_mode == "QUEUED" &&
      pipeline.stage[0].action[0].configuration.DetectChanges == "false" &&
      pipeline.stage[0].action[0].configuration.OutputArtifactFormat == "CODEBUILD_CLONE_REF" &&
      length(pipeline.stage[1].action[0].output_artifacts) == 0 &&
      length(pipeline.stage[1].action[0].configuration.EnvironmentVariables) <= 1000
    ])
    error_message = "Pipeline 실행, clone 참조 소스, 출력 아티팩트와 환경변수 길이 계약 위반입니다."
  }
  assert {
    condition = alltrue([for definition in aws_ecs_task_definition.hello_service :
      strcontains(jsondecode(definition.container_definitions)[0].image, "@sha256:") &&
      jsondecode(definition.container_definitions)[0].name == "hello"
    ]) && !aws_codebuild_project.shared_deployer.environment[0].privileged_mode
    error_message = "이미지는 digest로 고정하고 Docker privileged 빌드를 사용하지 않습니다."
  }
  assert {
    condition = alltrue([for service in aws_ecs_service.hello_service :
      service.deployment_circuit_breaker[0].enable && service.deployment_circuit_breaker[0].rollback &&
      service.network_configuration[0].assign_public_ip
    ])
    error_message = "ECS rollback과 public IP가 활성화되어야 합니다."
  }
}

run "image_tag_is_pipeline_input" {
  command = plan

  assert {
    condition = alltrue([for pipeline in aws_codepipeline.service_deployment :
      one(pipeline.variable).name == "IMAGE_TAG" && one(pipeline.variable).default_value == null
    ])
    error_message = "IMAGE_TAG는 기본값 없는 필수 실행 변수여야 합니다."
  }
}
