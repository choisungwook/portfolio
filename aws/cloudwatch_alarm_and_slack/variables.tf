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

# --- VPC Variables (for AWS VPC Module) ---
variable "vpc_name" {
  description = "Name of the VPC"
  type        = string
  default     = "cloudwatch-alarm-vpc"
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "vpc_azs" {
  description = "Availability zones for VPC subnets. Should be in the selected AWS region."
  type        = list(string)
  # Example for ap-northeast-2: ["ap-northeast-2a", "ap-northeast-2c"]
  # Ensure these AZs are available in your var.aws_region
}

variable "vpc_private_subnets" {
  description = "CIDR blocks for private subnets. Must have the same number of elements as vpc_azs."
  type        = list(string)
  # Example: ["10.0.1.0/24", "10.0.2.0/24"]
}

variable "vpc_public_subnets" {
  description = "CIDR blocks for public subnets. Must have the same number of elements as vpc_azs."
  type        = list(string)
  # Example: ["10.0.101.0/24", "10.0.102.0/24"]
}

variable "vpc_enable_nat_gateway" {
  description = "Enable NAT gateway for private subnets to allow outbound internet access."
  type        = bool
  default     = true
}

variable "vpc_single_nat_gateway" {
  description = "Use a single NAT gateway instead of one per AZ. Recommended for cost saving in dev/test."
  type        = bool
  default     = true
}

variable "sysbench_ec2_instance_type" {
  description = "EC2 instance type for running sysbench"
  type        = string
  default     = "t3.medium"
}
