# VPC Outputs
output "vpc_id" {
  description = "ID of the VPC"
  value       = module.vpc.vpc_id
}

output "public_subnet_ids" {
  description = "IDs of the public subnets"
  value       = module.vpc.public_subnet_ids
}

output "private_subnet_ids" {
  description = "IDs of the private subnets"
  value       = module.vpc.private_subnet_ids
}

# ECS Outputs
output "ecs_cluster_arn" {
  description = "ARN of the ECS cluster"
  value       = module.ecs_cluster.cluster_arn
}

output "ecs_service_name" {
  description = "Name of the ECS service"
  value       = module.ecs_cluster.service_name
}

output "task_definition_arn" {
  description = "ARN of the task definition"
  value       = module.ecs_cluster.task_definition_arn
}

# Load Balancer Outputs
output "alb_dns_name" {
  description = "DNS name of the load balancer"
  value       = module.load_balancer.alb_dns_name
}

output "alb_url" {
  description = "URL of the load balancer"
  value       = "https://${module.load_balancer.alb_dns_name}"
}

output "target_group_arn" {
  description = "ARN of the target group"
  value       = module.load_balancer.target_group_arn
}

# Database Outputs
output "rds_instance_arn" {
  description = "ARN of the RDS instance"
  value       = module.rds.instance_arn
}

output "rds_instance_endpoint" {
  description = "Endpoint of the RDS instance"
  value       = module.rds.instance_endpoint
  sensitive   = true
}

output "rds_read_replica_endpoints" {
  description = "Endpoints of read replicas"
  value       = module.rds.read_replica_endpoints
  sensitive   = true
}

# Redis Outputs
output "redis_cluster_id" {
  description = "ID of the Redis cluster"
  value       = module.redis.cluster_id
}

output "redis_endpoint" {
  description = "Endpoint of the Redis cluster"
  value       = module.redis.endpoint
  sensitive   = true
}

# S3 Outputs
output "s3_bucket_name" {
  description = "Name of the S3 bucket"
  value       = module.s3.bucket_name
}

output "s3_bucket_arn" {
  description = "ARN of the S3 bucket"
  value       = module.s3.bucket_arn
}

output "s3_bucket_domain_name" {
  description = "Domain name of the S3 bucket"
  value       = module.s3.bucket_domain_name
}

# CloudFront Outputs
output "cloudfront_distribution_id" {
  description = "ID of the CloudFront distribution"
  value       = module.cloudfront.distribution_id
}

output "cloudfront_distribution_arn" {
  description = "ARN of the CloudFront distribution"
  value       = module.cloudfront.distribution_arn
}

output "cloudfront_domain_name" {
  description = "Domain name of the CloudFront distribution"
  value       = module.cloudfront.domain_name
}

output "cloudfront_url" {
  description = "URL of the CloudFront distribution"
  value       = "https://${module.cloudfront.domain_name}"
}

# Security Outputs
output "waf_web_acl_arn" {
  description = "ARN of the WAF Web ACL"
  value       = module.security.waf_web_acl_arn
}

# Monitoring Outputs
output "cloudwatch_log_group_arn" {
  description = "ARN of the CloudWatch log group"
  value       = module.monitoring.cloudwatch_log_group_arn
}

output "sns_topic_arn" {
  description = "ARN of the SNS topic for alerts"
  value       = module.monitoring.sns_topic_arn
}

# Combined Application URL
output "app_url" {
  description = "Full URL of the application"
  value       = "https://${module.cloudfront.domain_name}"
}