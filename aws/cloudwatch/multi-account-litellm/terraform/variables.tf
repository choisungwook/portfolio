variable "aws_region" {
  type    = string
  default = "ap-northeast-2"
}

variable "project_name" {
  type    = string
  default = "litellm-mon"
}

variable "monitoring_profile" {
  description = "모니터링 계정의 AWS CLI profile"
  type        = string
}

variable "dev_profile" {
  description = "개발 계정의 AWS CLI profile"
  type        = string
}

variable "prod_profile" {
  description = "운영 계정의 AWS CLI profile"
  type        = string
}

variable "dev_replicas" {
  type    = number
  default = 1
}

variable "prod_replicas" {
  type    = number
  default = 2
}

variable "loadgen_count" {
  description = "계정마다 띄울 부하 생성기 task 수. 0이면 트래픽이 멈춘다"
  type        = number
  default     = 1
}

variable "cpu_architecture" {
  description = "Fargate task 아키텍처. ARM64(Graviton)가 같은 크기에서 약 20% 저렴하다"
  type        = string
  default     = "ARM64"
}

variable "litellm_image" {
  type    = string
  default = "ghcr.io/berriai/litellm:v1.102.1"
}

variable "collector_image" {
  type    = string
  default = "public.ecr.aws/aws-observability/aws-otel-collector:v0.50.0"
}

variable "postgres_image" {
  type    = string
  default = "public.ecr.aws/docker/library/postgres:16"
}

variable "loadgen_image" {
  type    = string
  default = "public.ecr.aws/docker/library/python:3.13-slim"
}

variable "victoriametrics_image" {
  type    = string
  default = "docker.io/victoriametrics/victoria-metrics:v1.152.0"
}

variable "grafana_image" {
  type    = string
  default = "docker.io/grafana/grafana:13.2.2"
}

variable "scrape_interval" {
  type    = string
  default = "30s"
}

variable "log_retention_days" {
  description = "LiteLLM 로그 보관 기간"
  type        = number
  default     = 90
}

variable "metrics_retention_days" {
  description = "방안 3·4 metric 보관 기간"
  type        = number
  default     = 90
}

variable "container_insights" {
  description = "ECS Container Insights. disabled, enabled, enhanced"
  type        = string
  default     = "disabled"
}

variable "enable_oam" {
  description = "방안 2. CloudWatch cross-account observability(sink·link)"
  type        = bool
  default     = false
}

variable "enable_selfhosted" {
  description = "방안 3. 모니터링 계정 ECS에 VictoriaMetrics + Grafana"
  type        = bool
  default     = false
}

variable "enable_amp" {
  description = "방안 4. Amazon Managed Service for Prometheus"
  type        = bool
  default     = false
}

variable "enable_amg" {
  description = "방안 4. Amazon Managed Grafana. IAM Identity Center가 켜져 있어야 한다"
  type        = bool
  default     = false
}
