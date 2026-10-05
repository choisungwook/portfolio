variable "foundation_state_path" {
  description = "workload 디렉터리 기준 foundation local state 경로"
  type        = string
  default     = "../foundation/terraform.tfstate"
}

variable "github_repository" {
  description = "배포 스크립트가 있는 GitHub owner/repository"
  type        = string

  validation {
    condition     = can(regex("^[^/ ]+/[^/ ]+$", var.github_repository))
    error_message = "owner/repository 형식으로 지정하세요."
  }
}

variable "github_branch" {
  description = "배포 소스 branch"
  type        = string
  default     = "main"
}

variable "source_directory" {
  description = "GitHub 저장소 root 기준 핸즈온 디렉터리. 단독 저장소는 ."
  type        = string
  default     = "."

  validation {
    condition     = can(regex("^(\\.|[A-Za-z0-9_-]+(/[A-Za-z0-9_-]+)*)$", var.source_directory))
    error_message = "source_directory는 . 또는 저장소 안의 상대 디렉터리여야 합니다."
  }
}

variable "bootstrap_image_tag" {
  description = "최초 Service 생성에만 사용하는 ECR 이미지 태그"
  type        = string
  default     = "v1"
}

variable "desired_count" {
  description = "서비스별 task 수"
  type        = number
  default     = 1

  validation {
    condition     = var.desired_count >= 1 && floor(var.desired_count) == var.desired_count
    error_message = "배포 안정화 검증을 위해 desired_count는 1 이상 정수여야 합니다."
  }
}

variable "github_default_branch" {
  description = "issue_comment 워크플로가 실행되는 저장소 기본 branch"
  type        = string
  default     = "main"
}

variable "existing_github_oidc_provider_arn" {
  description = "계정에 이미 있는 GitHub OIDC provider ARN. null이면 새로 생성"
  type        = string
  default     = null
}
