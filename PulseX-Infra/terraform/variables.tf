variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name"
  type        = string
  validation {
    condition     = contains(["development", "staging", "production"], var.environment)
    error_message = "Environment must be one of: development, staging, production."
  }
}

# VPC Configuration
variable "vpc_cidr" {
  description = "CIDR block for VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "availability_zones" {
  description = "List of availability zones"
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b", "us-east-1c"]
}

variable "public_subnet_cidrs" {
  description = "CIDR blocks for public subnets"
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
}

variable "private_subnet_cidrs" {
  description = "CIDR blocks for private subnets"
  type        = list(string)
  default     = ["10.0.11.0/24", "10.0.12.0/24", "10.0.13.0/24"]
}

# Application Configuration
variable "app_desired_count" {
  description = "Desired number of ECS tasks"
  type        = number
  default     = 3
}

variable "app_min_capacity" {
  description = "Minimum number of ECS tasks"
  type        = number
  default     = 2
}

variable "app_max_capacity" {
  description = "Maximum number of ECS tasks"
  type        = number
  default     = 20
}

variable "container_image" {
  description = "Docker image for the application"
  type        = string
}

variable "container_port" {
  description = "Port that the container listens on"
  type        = number
  default     = 3000
}

variable "container_cpu" {
  description = "CPU units to allocate to container"
  type        = number
  default     = 512
}

variable "container_memory" {
  description = "Memory to allocate to container"
  type        = number
  default     = 1024
}

# Database Configuration
variable "database_name" {
  description = "Name of the database"
  type        = string
  default     = "pulsex"
}

variable "database_username" {
  description = "Username for the database"
  type        = string
  default     = "pulsex_admin"
}

variable "database_password" {
  description = "Password for the database"
  type        = string
  sensitive   = true
}

variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.r6g.large"
}

variable "db_allocated_storage" {
  description = "Allocated storage for RDS (GB)"
  type        = number
  default     = 100
}

variable "db_multi_az" {
  description = "Enable Multi-AZ deployment"
  type        = bool
  default     = true
}

variable "db_backup_retention" {
  description = "Backup retention period in days"
  type        = number
  default     = 30
}

variable "read_replica_count" {
  description = "Number of read replicas"
  type        = number
  default     = 2
}

# Redis Configuration
variable "redis_node_type" {
  description = "ElastiCache node type"
  type        = string
  default     = "cache.r6g.large"
}

variable "redis_num_nodes" {
  description = "Number of Redis nodes"
  type        = number
  default     = 3
}

variable "redis_automatic_failover" {
  description = "Enable automatic failover"
  type        = bool
  default     = true
}

variable "redis_encryption_at_rest" {
  description = "Enable encryption at rest"
  type        = bool
  default     = true
}

variable "redis_auth_token" {
  description = "Auth token for Redis"
  type        = string
  sensitive   = true
}

# S3 Configuration
variable "s3_lifecycle_transition_days" {
  description = "Days to transition to Glacier"
  type        = number
  default     = 30
}

variable "s3_lifecycle_expiration_days" {
  description = "Days to expire objects"
  type        = number
  default     = 365
}

# CloudFront Configuration
variable "cloudfront_default_ttl" {
  description = "Default TTL for CloudFront"
  type        = number
  default     = 86400
}

variable "cloudfront_max_ttl" {
  description = "Maximum TTL for CloudFront"
  type        = number
  default     = 31536000
}

# SSL Configuration
variable "ssl_certificate_arn" {
  description = "ARN of SSL certificate for ALB"
  type        = string
}

variable "cloudfront_ssl_certificate_arn" {
  description = "ARN of SSL certificate for CloudFront"
  type        = string
}

# Security Configuration
variable "waf_enabled" {
  description = "Enable WAF"
  type        = bool
  default     = true
}

variable "waf_rate_limit" {
  description = "WAF rate limit (requests per 5 minutes)"
  type        = number
  default     = 2000
}

variable "waf_block_ip_lists" {
  description = "List of IP lists to block"
  type        = list(string)
  default     = []
}

# Monitoring
variable "slack_webhook_url" {
  description = "Slack webhook URL for notifications"
  type        = string
  sensitive   = true
}

variable "email_alerts" {
  description = "Email addresses for alerts"
  type        = list(string)
  default     = []
}

# Secrets (should be provided via environment variables or AWS Secrets Manager)
variable "database_url" {
  description = "Database connection URL"
  type        = string
  sensitive   = true
}

variable "redis_url" {
  description = "Redis connection URL"
  type        = string
  sensitive   = true
}

variable "jwt_secret" {
  description = "JWT secret key"
  type        = string
  sensitive   = true
}

variable "aws_access_key_id" {
  description = "AWS access key ID"
  type        = string
  sensitive   = true
}

variable "aws_secret_access_key" {
  description = "AWS secret access key"
  type        = string
  sensitive   = true
}

variable "s3_bucket" {
  description = "S3 bucket name for assets"
  type        = string
}