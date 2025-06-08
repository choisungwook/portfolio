variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "ap-northeast-2"
}

variable "project_name" {
  description = "Name of the project"
  type        = string
  default     = "cloudwatch-alarm"
}

variable "environment_name" {
  description = "Name for the environment/service, used as a prefix for resource names"
  type        = string
  default     = "cloudwatch-alarm-demo"
}

variable "common_tags" {
  description = "Common tags to apply to all resources"
  type        = map(string)
  default = {
    Project = "cloudwatch-alarm"
    Name    = "cloudwatch-alarm-demo"
  }
}

variable "rds_cluster_identifier" {
  description = "Identifier for the RDS Aurora cluster"
  type        = string
  default     = "cloudwatch-alarm-demo"
}

variable "rds_db_port" {
  description = "Port for the RDS database"
  type        = number
  default     = 3306
}

variable "rds_engine" {
  description = "RDS engine type"
  type        = string
  default     = "aurora-mysql"
}

variable "rds_engine_version" {
  description = "RDS engine version for Aurora MySQL"
  type        = string
  default     = "8.0.mysql_aurora.3.06.0"
}

variable "rds_instance_class" {
  description = "Instance class for the RDS writer instance"
  type        = string
  default     = "db.t3.medium"
}

variable "rds_username" {
  description = "Username for the RDS database master user"
  type        = string
  sensitive   = true
}

variable "rds_password" {
  description = "Password for the RDS database master user"
  type        = string
  sensitive   = true
}

variable "rds_storage_type" {
  description = "Storage type for RDS, e.g., gp3"
  type        = string
  default     = "aurora" # For Aurora, storage is managed by the cluster; specific types like gp3 apply to RDS non-Aurora
}

variable "rds_storage_encrypted" {
  description = "Enable storage encryption for RDS"
  type        = bool
  default     = true
}

variable "lambda_function_name" {
  description = "Name for the Lambda function"
  type        = string
  default     = "cloudwatch-to-slack-notifier"
}

variable "lambda_runtime" {
  description = "Lambda function runtime"
  type        = string
  default     = "python3.12"
}

variable "lambda_handler" {
  description = "Lambda function handler"
  type        = string
  default     = "lambda_function.lambda_handler"
}

variable "slack_webhook_url" {
  description = "Slack Webhook URL to send notifications"
  type        = string
  sensitive   = true
}

variable "db_name" {
  description = "The name of the database to create in the Aurora cluster"
  type        = string
  default     = "demodb"
}

variable "sysbench_ec2_instance_type" {
  description = "EC2 instance type for running sysbench"
  type        = string
  default     = "t3.medium"
}

variable "eks_cluster_name" {
  type = string
}

variable "eks_version" {
  description = "EKS Version"
  type        = string
}

variable "oidc_provider_enabled" {
  description = "OIDC Provider Enabled"
  type        = bool
  default     = true
}

variable "endpoint_private_access" {
  description = "Endpoint Private Access"
  type        = bool
  default     = true
}

variable "endpoint_public_access" {
  description = "Endpoint Public Access"
  type        = bool
}

variable "managed_node_groups" {
  type = map(object({
    node_group_name = string
    instance_types  = list(string)
    capacity_type   = string
    release_version = optional(string)
    ami_id          = optional(string)
    ami_type        = optional(string)
    disk_size       = number
    desired_size    = number
    max_size        = number
    min_size        = number
    user_data       = optional(string)
    labels          = optional(map(string), {})
    taints = optional(list(object({
      key    = string
      value  = string
      effect = string
    })), [])
  }))
  # if you use EKS auto mode, you can set managed_node_groups = {}
  default = {}
}

variable "assume_role_arn" {
  type = string
}

variable "enable_amp" {
  type    = bool
  default = false
}

######################################################################
# VPC
######################################################################

variable "vpc_cidr" {
  description = "VPC CIDR"
  type        = string
  default     = "10.0.0.0/16"
}

variable "public_subnets" {
  description = "VPC public subnets"
  type = map(object({
    cidr = string
    az   = string
    tags = map(string)
  }))
  default = {
    "subnet_a1" = {
      cidr = "10.0.10.0/24",
      az   = "ap-northeast-2a",
      tags = {
        Name = "public-subnet-a1"
      }
    },
    "subnet_b1" = {
      cidr = "10.0.11.0/24",
      az   = "ap-northeast-2c",
      tags = {
        Name = "public-subnet-c1"
      }
    }
  }
}

variable "private_subnets" {
  description = "VPC private_subnets"
  type = map(object({
    cidr = string
    az   = string
    tags = map(string)
  }))
  default = {
    "subnet_a1" = {
      cidr = "10.0.100.0/24",
      az   = "ap-northeast-2a",
      tags = {
        Name = "private-subnet-a1"
      }
    },
    "subnet_b1" = {
      cidr = "10.0.101.0/24",
      az   = "ap-northeast-2c",
      tags = {
        Name = "private-subnet-c1"
      }
    }
  }
}

######################################################################
# EKS auto mode

# When using EKS Auto Mode compute_config.enabled, kubernetes_network_config.elastic_load_balancing.enabled, and storage_config.block_storage.enabled
# must *ALL be set to true.
# Likewise for disabling EKS Auto Mode, all three arguments must be set to false.
######################################################################

variable "auto_mode_enabled" {
  description = "Enable EKS Auto Mode"
  type        = bool
  default     = false
}

variable "cluster_compute_config" {
  description = "Configuration block for the cluster compute configuration"
  type        = any
  default     = {}
}
