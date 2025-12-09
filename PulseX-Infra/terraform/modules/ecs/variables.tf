variable "name_prefix" {
  description = "Prefix for resource names"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "vpc_id" {
  description = "ID of the VPC"
  type        = string
}

variable "subnet_ids" {
  description = "List of subnet IDs for ECS tasks"
  type        = list(string)
}

variable "container_image" {
  description = "Docker image for the application"
  type        = string
}

variable "container_port" {
  description = "Port that the container listens on"
  type        = number
}

variable "cpu" {
  description = "CPU units to allocate to container"
  type        = number
}

variable "memory" {
  description = "Memory to allocate to container"
  type        = number
}

variable "desired_count" {
  description = "Desired number of ECS tasks"
  type        = number
}

variable "min_capacity" {
  description = "Minimum number of ECS tasks"
  type        = number
}

variable "max_capacity" {
  description = "Maximum number of ECS tasks"
  type        = number
}

variable "alb_target_group_arn" {
  description = "ARN of the Application Load Balancer target group"
  type        = string
}

# Secrets
variable "database_url" {
  description = "ARN of the database URL secret"
  type        = string
}

variable "redis_url" {
  description = "ARN of the Redis URL secret"
  type        = string
}

variable "jwt_secret" {
  description = "ARN of the JWT secret"
  type        = string
}

variable "aws_access_key" {
  description = "ARN of the AWS access key secret"
  type        = string
}

variable "aws_secret_key" {
  description = "ARN of the AWS secret key secret"
  type        = string
}

variable "s3_bucket" {
  description = "S3 bucket name for assets"
  type        = string
}