variable "env" {
  description = "계정 이름. 리소스 이름과 metric의 account label에 들어간다"
  type        = string
}

variable "project_name" {
  type = string
}

variable "aws_region" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "subnet_ids" {
  type = list(string)
}

variable "allowed_cidr" {
  description = "ALB에 접근할 수 있는 CIDR. 실습자의 IP만 연다"
  type        = string
}

variable "replicas" {
  description = "LiteLLM task 수"
  type        = number
}

variable "litellm_image" {
  type = string
}

variable "collector_image" {
  type = string
}

variable "postgres_image" {
  type = string
}

variable "loadgen_image" {
  type = string
}

variable "loadgen_count" {
  description = "부하 생성기 task 수. 0이면 트래픽을 보내지 않는다"
  type        = number
}

variable "litellm_master_key" {
  type      = string
  sensitive = true
}

variable "db_password" {
  type      = string
  sensitive = true
}

variable "litellm_config" {
  description = "LiteLLM config.yaml 내용"
  type        = string
}

variable "loadgen_script" {
  description = "local/loadgen/loadgen.py 내용"
  type        = string
}

variable "scrape_interval" {
  type = string
}

variable "log_retention_days" {
  type = number
}

variable "container_insights" {
  description = "ECS Container Insights. disabled, enabled, enhanced 중 하나"
  type        = string
}

variable "cpu_architecture" {
  type = string
}

variable "remote_write_selfhosted_endpoint" {
  description = "방안 3. 중앙 VictoriaMetrics의 remote write URL. null이면 보내지 않는다"
  type        = string
  default     = null
}

variable "remote_write_amp" {
  description = "방안 4. AMP remote write URL과 수집기가 assume할 모니터링 계정 role. null이면 보내지 않는다"
  type = object({
    endpoint = string
    role_arn = string
  })
  default = null
}
