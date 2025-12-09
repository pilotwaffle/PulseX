variable "name_prefix" {
  description = "Prefix for resource names"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "alb_arn" {
  description = "ARN of the Application Load Balancer"
  type        = string
}

variable "ecs_cluster_arn" {
  description = "ARN of the ECS cluster"
  type        = string
}

variable "rds_instance_arn" {
  description = "ARN of the RDS instance"
  type        = string
}

variable "redis_cluster_id" {
  description = "ID of the ElastiCache cluster"
  type        = string
}

variable "slack_webhook_url" {
  description = "Slack webhook URL for notifications"
  type        = string
  default     = ""
}

variable "email_alerts" {
  description = "List of email addresses for alerts"
  type        = list(string)
  default     = []
}