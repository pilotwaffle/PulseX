output "instance_arn" {
  description = "ARN of the RDS instance"
  value       = aws_db_instance.main.arn
}

output "instance_id" {
  description = "ID of the RDS instance"
  value       = aws_db_instance.main.id
}

output "instance_endpoint" {
  description = "RDS instance endpoint"
  value       = aws_db_instance.main.endpoint
}

output "instance_hosted_zone_id" {
  description = "The Route53 hosted zone ID"
  value       = aws_db_instance.main.hosted_zone_id
}

output "instance_port" {
  description = "Database port"
  value       = aws_db_instance.main.port
}

output "instance_status" {
  description = "RDS instance status"
  value       = aws_db_instance.main.status
}

output "instance_resource_id" {
  description = "RDS instance resource ID"
  value       = aws_db_instance.main.resource_id
}

output "instance_username" {
  description = "Database username"
  value       = aws_db_instance.main.username
}

output "instance_engine" {
  description = "Database engine"
  value       = aws_db_instance.main.engine
}

output "instance_engine_version" {
  description = "Database engine version"
  value       = aws_db_instance.main.engine_version
}

output "instance_class" {
  description = "Database instance class"
  value       = aws_db_instance.main.instance_class
}

output "instance_allocated_storage" {
  description = "Allocated storage in GB"
  value       = aws_db_instance.main.allocated_storage
}

output "instance_storage_encrypted" {
  description = "Whether the storage is encrypted"
  value       = aws_db_instance.main.storage_encrypted
}

output "instance_multi_az" {
  description = "Whether Multi-AZ is enabled"
  value       = aws_db_instance.main.multi_az
}

output "read_replica_ids" {
  description = "List of read replica IDs"
  value       = aws_db_instance.read_replica[*].id
}

output "read_replica_endpoints" {
  description = "List of read replica endpoints"
  value       = aws_db_instance.read_replica[*].endpoint
}

output "db_subnet_group_id" {
  description = "DB subnet group ID"
  value       = aws_db_subnet_group.main.id
}

output "db_parameter_group_id" {
  description = "DB parameter group ID"
  value       = aws_db_parameter_group.main.id
}

output "db_option_group_id" {
  description = "DB option group ID"
  value       = aws_db_option_group.main.id
}

output "security_group_id" {
  description = "Security group ID"
  value       = aws_security_group.rds.id
}

output "database_name" {
  description = "Database name"
  value       = aws_db_instance.main.db_name
}

output "database_credentials_secret_arn" {
  description = "ARN of the database credentials secret"
  value       = aws_secretsmanager_secret.db_credentials.arn
}

output "database_credentials_secret_name" {
  description = "Name of the database credentials secret"
  value       = aws_secretsmanager_secret.db_credentials.name
}

output "database_connection_url" {
  description = "Database connection URL"
  value       = "postgresql://${aws_db_instance.main.username}:***@${aws_db_instance.main.endpoint}:${aws_db_instance.main.port}/${aws_db_instance.main.db_name}"
  sensitive   = true
}

output "monitoring_role_arn" {
  description = "ARN of the RDS enhanced monitoring role"
  value       = aws_iam_role.rds_enhanced_monitoring.arn
}

output "db_migration_role_arn" {
  description = "ARN of the database migration role"
  value       = aws_iam_role.db_migration.arn
}

output "cloudwatch_alarm_arns" {
  description = "List of CloudWatch alarm ARNs"
  value = [
    aws_cloudwatch_metric_alarm.cpu_utilization.arn,
    aws_cloudwatch_metric_alarm.memory_utilization.arn,
    aws_cloudwatch_metric_alarm.database_connections.arn,
    aws_cloudwatch_metric_alarm.read_latency.arn,
    aws_cloudwatch_metric_alarm.write_latency.arn
  ]
}