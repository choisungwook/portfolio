variable "region" {
  description = "AWS region"
  type        = string
  default     = "ap-northeast-2"
}

variable "rds_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t4g.medium"
}

variable "aurora_mysql_engine_version" {
  description = "Aurora MySQL engine version"
  type        = string
  default     = "8.0.mysql_aurora.3.10.0"
}

variable "aurora_postgres_engine_version" {
  description = "Aurora PostgreSQL engine version"
  type        = string
  default     = "16.8"
}

variable "create_mysql_rds" {
  description = "Whether to create MySQL RDS cluster"
  type        = bool
  default     = true
}

variable "create_postgres_rds" {
  description = "Whether to create PostgreSQL RDS cluster"
  type        = bool
  default     = true
}
