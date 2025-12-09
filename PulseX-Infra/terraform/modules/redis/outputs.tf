output "cluster_id" {
  description = "Redis cluster ID"
  value       = aws_elasticache_replication_group.main.id
}

output "cluster_arn" {
  description = "Redis cluster ARN"
  value       = aws_elasticache_replication_group.main.arn
}

output "primary_endpoint_address" {
  description = "Redis primary endpoint address"
  value       = aws_elasticache_replication_group.main.primary_endpoint_address
}

output "primary_endpoint_port" {
  description = "Redis primary endpoint port"
  value       = aws_elasticache_replication_group.main.port
}

output "reader_endpoint_address" {
  description = "Redis reader endpoint address"
  value       = aws_elasticache_replication_group.main.reader_endpoint_address
}

output "reader_endpoint_port" {
  description = "Redis reader endpoint port"
  value       = aws_elasticache_replication_group.main.reader_endpoint_port
}

output "cache_nodes" {
  description = "List of cache node information"
  value = aws_elasticache_replication_group.main.cache_nodes
}

output "cluster_members" {
  description = "List of cluster members"
  value = aws_elasticache_replication_group.main.cluster_members
}

output "node_type" {
  description = "Redis node type"
  value       = aws_elasticache_replication_group.main.node_type
}

output "engine" {
  description = "Redis engine"
  value       = aws_elasticache_replication_group.main.engine
}

output "engine_version" {
  description = "Redis engine version"
  value       = aws_elasticache_replication_group.main.engine_version
}

output "num_cache_clusters" {
  description = "Number of cache clusters"
  value       = aws_elasticache_replication_group.main.num_cache_clusters
}

output "automatic_failover_enabled" {
  description = "Whether automatic failover is enabled"
  value       = aws_elasticache_replication_group.main.automatic_failover_enabled
}

output "transit_encryption_enabled" {
  description = "Whether transit encryption is enabled"
  value       = aws_elasticache_replication_group.main.transit_encryption_enabled
}

output "at_rest_encryption_enabled" {
  description = "Whether encryption at rest is enabled"
  value       = aws_elasticache_replication_group.main.at_rest_encryption_enabled
}

output "snapshot_retention_limit" {
  description = "Snapshot retention limit in days"
  value       = aws_elasticache_replication_group.main.snapshot_retention_limit
}

output "maintenance_window" {
  description = "Maintenance window"
  value       = aws_elasticache_replication_group.main.maintenance_window
}

output "snapshot_window" {
  description = "Snapshot window"
  value       = aws_elasticache_replication_group.main.snapshot_window
}

output "security_group_id" {
  description = "Security group ID"
  value       = aws_security_group.redis.id
}

output "subnet_group_name" {
  description = "Subnet group name"
  value       = aws_elasticache_subnet_group.main.name
}

output "parameter_group_name" {
  description = "Parameter group name"
  value       = aws_elasticache_parameter_group.main.name
}

output "log_group_name" {
  description = "CloudWatch log group name"
  value       = aws_cloudwatch_log_group.redis_slow.name
}

output "redis_credentials_secret_arn" {
  description = "ARN of the Redis credentials secret"
  value       = aws_secretsmanager_secret.redis_credentials.arn
}

output "redis_credentials_secret_name" {
  description = "Name of the Redis credentials secret"
  value       = aws_secretsmanager_secret.redis_credentials.name
}

output "redis_connection_url" {
  description = "Redis connection URL"
  value       = "redis://:***@${aws_elasticache_replication_group.main.primary_endpoint_address}:${aws_elasticache_replication_group.main.port}/0"
  sensitive   = true
}

output "redis_reader_connection_url" {
  description = "Redis reader connection URL"
  value       = "redis://:***@${aws_elasticache_replication_group.main.reader_endpoint_address}:${aws_elasticache_replication_group.main.reader_endpoint_port}/0"
  sensitive   = true
}

output "iam_policy_arn" {
  description = "IAM policy ARN for Redis access"
  value       = aws_iam_policy.redis_access.arn
}

output "cloudwatch_alarm_arns" {
  description = "List of CloudWatch alarm ARNs"
  value = [
    aws_cloudwatch_metric_alarm.cpu_utilization.arn,
    aws_cloudwatch_metric_alarm.memory_utilization.arn,
    aws_cloudwatch_metric_alarm.evictions.arn,
    aws_cloudwatch_metric_alarm.cache_hits.arn,
    aws_cloudwatch_metric_alarm.cache_misses.arn,
    aws_cloudwatch_metric_alarm.swap_usage.arn
  ]
}