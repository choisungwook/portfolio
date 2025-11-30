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

# PITR Related Variables
variable "backup_retention_period" {
  description = "The number of days to retain automated backups (1-35 days). Required for PITR."
  type        = number
  default     = 7
  validation {
    condition     = var.backup_retention_period >= 1 && var.backup_retention_period <= 35
    error_message = "Backup retention period must be between 1 and 35 days."
  }
}

variable "preferred_backup_window" {
  description = "The daily time range during which automated backups are created (UTC). Format: hh24:mi-hh24:mi"
  type        = string
  default     = "03:00-04:00"
}

variable "preferred_maintenance_window" {
  description = "The weekly time range during which system maintenance can occur (UTC). Format: ddd:hh24:mi-ddd:hh24:mi"
  type        = string
  default     = "mon:04:00-mon:05:00"
}

variable "enabled_cloudwatch_logs_exports" {
  description = "List of log types to export to CloudWatch Logs. Valid values: audit, error, general, slowquery"
  type        = list(string)
  default     = ["audit", "error", "general", "slowquery"]
}

variable "copy_tags_to_snapshot" {
  description = "Copy all cluster tags to snapshots"
  type        = bool
  default     = true
}

variable "deletion_protection" {
  description = "Enable deletion protection for the cluster"
  type        = bool
  default     = false
}

variable "skip_final_snapshot" {
  description = "Skip final snapshot when destroying the cluster"
  type        = bool
  default     = true
}

variable "final_snapshot_identifier_prefix" {
  description = "Prefix for the final snapshot identifier"
  type        = string
  default     = "pitr-final-snapshot"
}
