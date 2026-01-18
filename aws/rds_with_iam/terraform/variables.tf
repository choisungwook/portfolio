variable "region" {
  description = "AWS region"
  type        = string
  default     = "ap-northeast-2"
}

variable "project_name" {
  description = "Project name for resource naming"
  type        = string
}

variable "db_master_username" {
  description = "Master username for RDS (PostgreSQL: admin is reserved, use postgres)"
  type        = string
  default     = "postgres"
}

variable "db_master_password" {
  description = "Master password for RDS"
  type        = string
  sensitive   = true
}

variable "db_name" {
  description = "Database name"
  type        = string
  default     = "demo"
}

variable "ec2_instance_type" {
  description = "EC2 instance type"
  type        = string
  default     = "t4g.medium"
}

variable "aurora_instance_class" {
  description = "Aurora instance class"
  type        = string
  default     = "db.t4g.medium"
}

variable "aurora_mysql_engine_version" {
  description = "Aurora MySQL engine version"
  type        = string
  default     = "8.0.mysql_aurora.3.10.3"
}

variable "aurora_postgres_engine_version" {
  description = "Aurora PostgreSQL engine version"
  type        = string
  default     = "16.6"
}
