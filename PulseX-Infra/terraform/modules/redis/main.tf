# ElastiCache Redis Module

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# Security Group for Redis
resource "aws_security_group" "redis" {
  name_prefix = "${var.name_prefix}-${var.environment}-redis"
  description = "Security group for Redis cluster"
  vpc_id      = var.vpc_id

  # Redis access from ECS tasks
  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [var.ecs_security_group_id]
    description     = "Redis access from ECS"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name        = "${var.name_prefix}-${var.environment}-redis-sg"
    Environment = var.environment
    Project     = var.name_prefix
  }
}

# Random auth token for Redis
resource "random_password" "redis_auth_token" {
  length  = 64
  special = false
}

# Subnet Group for Redis
resource "aws_elasticache_subnet_group" "main" {
  name       = "${var.name_prefix}-${var.environment}-redis-subnet-group"
  subnet_ids = var.subnet_ids

  tags = {
    Name        = "${var.name_prefix}-${var.environment}-redis-subnet-group"
    Environment = var.environment
    Project     = var.name_prefix
  }
}

# Redis Parameter Group
resource "aws_elasticache_parameter_group" "main" {
  family = "redis7.x"

  description = "Parameter group for ${var.name_prefix} ${var.environment} Redis cluster"

  parameters {
    name  = "maxmemory-policy"
    value = "allkeys-lru"
  }

  parameters {
    name  = "notify-keyspace-events"
    value = "Ex"
  }

  parameters {
    name  = "slowlog-log-slower-than"
    value = "10000"
  }

  parameters {
    name  = "slowlog-max-len"
    value = "128"
  }

  tags = {
    Name        = "${var.name_prefix}-${var.environment}-redis-params"
    Environment = var.environment
    Project     = var.name_prefix
  }
}

# Redis Cluster Configuration
resource "aws_elasticache_replication_group" "main" {
  replication_group_id       = "${var.name_prefix}-${var.environment}-redis"
  description                = "Redis cluster for ${var.name_prefix} ${var.environment}"

  # Node configuration
  node_type                   = var.node_type
  port                        = 6379
  parameter_group_name        = aws_elasticache_parameter_group.main.name

  # Cluster configuration
  subnet_group_name           = aws_elasticache_subnet_group.main.name
  security_group_ids          = [aws_security_group.redis.id]

  # High availability
  num_cache_clusters         = var.num_cache_clusters
  automatic_failover_enabled = var.automatic_failover
  multi_az_enabled           = var.multi_az_enabled

  # Security
  auth_token                 = random_password.redis_auth_token.result
  at_rest_encryption_enabled = var.encryption_at_rest
  transit_encryption_enabled = true
  authToken = var.auth_token != "" ? var.auth_token : random_password.redis_auth_token.result

  # Backup and maintenance
  snapshot_retention_limit = var.snapshot_retention_limit
  snapshot_window         = var.snapshot_window
  maintenance_window      = var.maintenance_window

  # Engine version
  engine            = "redis"
  engine_version    = var.engine_version

  # Logging
  log_delivery_configuration {
    destination      = aws_cloudwatch_log_group.redis_slow.name
    destination_type = "cloudwatch-logs"
    log_format       = "json"
    log_type         = "slow-log"
  }

  tags = {
    Name        = "${var.name_prefix}-${var.environment}-redis"
    Environment = var.environment
    Project     = var.name_prefix
  }

  lifecycle {
    ignore_changes = [num_cache_clusters]
  }
}

# CloudWatch Log Group for Redis slow logs
resource "aws_cloudwatch_log_group" "redis_slow" {
  name              = "/aws/elasticache/redis/${var.name_prefix}-${var.environment}/slow-log"
  retention_in_days = var.log_retention_days

  tags = {
    Name        = "${var.name_prefix}-${var.environment}-redis-slow-log"
    Environment = var.environment
    Project     = var.name_prefix
  }
}

# Store Redis credentials in AWS Secrets Manager
resource "aws_secretsmanager_secret" "redis_credentials" {
  name = "${var.name_prefix}/${var.environment}/redis/credentials"

  description = "Redis credentials for ${var.name_prefix} ${var.environment}"

  tags = {
    Name        = "${var.name_prefix}-${var.environment}-redis-credentials"
    Environment = var.environment
    Project     = var.name_prefix
  }
}

resource "aws_secretsmanager_secret_version" "redis_credentials" {
  secret_id = aws_secretsmanager_secret.redis_credentials.id

  secret_string = jsonencode({
    host      = aws_elasticache_replication_group.main.primary_endpoint_address
    port      = aws_elasticache_replication_group.main.port
    password  = var.auth_token != "" ? var.auth_token : random_password.redis_auth_token.result
    cluster_id = aws_elasticache_replication_group.main.replication_group_id
    url       = "redis://:${var.auth_token != "" ? var.auth_token : random_password.redis_auth_token.result}@${aws_elasticache_replication_group.main.primary_endpoint_address}:${aws_elasticache_replication_group.main.port}/0"
  })
}

# CloudWatch alarms for Redis
resource "aws_cloudwatch_metric_alarm" "cpu_utilization" {
  alarm_name          = "${var.name_prefix}-${var.environment}-redis-high-cpu"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ElastiCache"
  period              = "300"
  statistic           = "Average"
  threshold           = "75"
  alarm_description   = "This metric monitors Redis CPU utilization"
  alarm_actions       = var.alarm_sns_topic_arn

  dimensions = {
    CacheClusterId = element(split("-", aws_elasticache_replication_group.main.replication_group_id), length(split("-", aws_elasticache_replication_group.main.replication_group_id)) - 1)
  }

  tags = {
    Name        = "${var.name_prefix}-${var.environment}-redis-high-cpu"
    Environment = var.environment
    Project     = var.name_prefix
  }
}

resource "aws_cloudwatch_metric_alarm" "memory_utilization" {
  alarm_name          = "${var.name_prefix}-${var.environment}-redis-high-memory"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "BytesUsedForCache"
  namespace           = "AWS/ElastiCache"
  period              = "300"
  statistic           = "Average"
  threshold           = "10737418240"  # 10GB in bytes
  alarm_description   = "This metric monitors Redis memory usage"
  alarm_actions       = var.alarm_sns_topic_arn

  dimensions = {
    CacheClusterId = element(split("-", aws_elasticache_replication_group.main.replication_group_id), length(split("-", aws_elasticache_replication_group.main.replication_group_id)) - 1)
  }

  tags = {
    Name        = "${var.name_prefix}-${var.environment}-redis-high-memory"
    Environment = var.environment
    Project     = var.name_prefix
  }
}

resource "aws_cloudwatch_metric_alarm" "evictions" {
  alarm_name          = "${var.name_prefix}-${var.environment}-redis-evictions"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "Evictions"
  namespace           = "AWS/ElastiCache"
  period              = "300"
  statistic           = "Sum"
  threshold           = "0"
  alarm_description   = "This metric monitors Redis key evictions"
  alarm_actions       = var.alarm_sns_topic_arn

  dimensions = {
    CacheClusterId = element(split("-", aws_elasticache_replication_group.main.replication_group_id), length(split("-", aws_elasticache_replication_group.main.replication_group_id)) - 1)
  }

  tags = {
    Name        = "${var.name_prefix}-${var.environment}-redis-evictions"
    Environment = var.environment
    Project     = var.name_prefix
  }
}

resource "aws_cloudwatch_metric_alarm" "cache_hits" {
  alarm_name          = "${var.name_prefix}-${var.environment}-redis-low-hit-rate"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = "3"
  metric_name         = "CacheHits"
  namespace           = "AWS/ElastiCache"
  period              = "300"
  statistic           = "Sum"
  threshold           = "100"
  treat_missing_data = "notBreaching"
  alarm_description   = "This metric monitors Redis cache hit rate"
  alarm_actions       = var.alarm_sns_topic_arn

  dimensions = {
    CacheClusterId = element(split("-", aws_elasticache_replication_group.main.replication_group_id), length(split("-", aws_elasticache_replication_group.main.replication_group_id)) - 1)
  }

  tags = {
    Name        = "${var.name_prefix}-${var.environment}-redis-low-hit-rate"
    Environment = var.environment
    Project     = var.name_prefix
  }
}

resource "aws_cloudwatch_metric_alarm" "cache_misses" {
  alarm_name          = "${var.name_prefix}-${var.environment}-redis-high-miss-rate"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "3"
  metric_name         = "CacheMisses"
  namespace           = "AWS/ElastiCache"
  period              = "300"
  statistic           = "Sum"
  threshold           = "500"
  alarm_description   = "This metric monitors Redis cache miss rate"
  alarm_actions       = var.alarm_sns_topic_arn

  dimensions = {
    CacheClusterId = element(split("-", aws_elasticache_replication_group.main.replication_group_id), length(split("-", aws_elasticache_replication_group.main.replication_group_id)) - 1)
  }

  tags = {
    Name        = "${var.name_prefix}-${var.environment}-redis-high-miss-rate"
    Environment = var.environment
    Project     = var.name_prefix
  }
}

resource "aws_cloudwatch_metric_alarm" "swap_usage" {
  alarm_name          = "${var.name_prefix}-${var.environment}-redis-swap-usage"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "SwapUsage"
  namespace           = "AWS/ElastiCache"
  period              = "300"
  statistic           = "Average"
  threshold           = "104857600"  # 100MB in bytes
  alarm_description   = "This metric monitors Redis swap usage"
  alarm_actions       = var.alarm_sns_topic_arn

  dimensions = {
    CacheClusterId = element(split("-", aws_elasticache_replication_group.main.replication_group_id), length(split("-", aws_elasticache_replication_group.main.replication_group_id)) - 1)
  }

  tags = {
    Name        = "${var.name_prefix}-${var.environment}-redis-swap-usage"
    Environment = var.environment
    Project     = var.name_prefix
  }
}

# IAM Policy for accessing Redis
resource "aws_iam_policy" "redis_access" {
  name        = "${var.name_prefix}-${var.environment}-redis-access"
  description = "Policy for accessing Redis cluster and credentials"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "elasticache:Describe*",
          "elasticache:List*"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = [aws_secretsmanager_secret.redis_credentials.arn]
      }
    ]
  })

  tags = {
    Name        = "${var.name_prefix}-${var.environment}-redis-access"
    Environment = var.environment
    Project     = var.name_prefix
  }
}