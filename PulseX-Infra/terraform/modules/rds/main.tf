# RDS PostgreSQL Database Module

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# Security Group for RDS
resource "aws_security_group" "rds" {
  name_prefix = "${var.name_prefix}-${var.environment}-rds"
  description = "Security group for RDS PostgreSQL"
  vpc_id      = var.vpc_id

  # PostgreSQL access from ECS tasks
  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [var.ecs_security_group_id]
    description     = "PostgreSQL access from ECS"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name        = "${var.name_prefix}-${var.environment}-rds-sg"
    Environment = var.environment
    Project     = var.name_prefix
  }
}

# Random password for database
resource "random_password" "db_password" {
  length           = 32
  special          = true
  override_special = "!#$%&()_[]{}<>:;"
}

# RDS Subnet Group
resource "aws_db_subnet_group" "main" {
  name       = "${var.name_prefix}-${var.environment}-db-subnet-group"
  subnet_ids = var.subnet_ids

  tags = {
    Name        = "${var.name_prefix}-${var.environment}-db-subnet-group"
    Environment = var.environment
    Project     = var.name_prefix
  }
}

# RDS Primary Instance
resource "aws_db_instance" "main" {
  identifier = "${var.name_prefix}-${var.environment}-db"

  # Database configuration
  engine         = "postgres"
  engine_version = "15.4"
  instance_class = var.instance_class

  # Storage
  allocated_storage     = var.allocated_storage
  storage_type          = "gp2"
  storage_encrypted     = true
  max_allocated_storage = var.max_allocated_storage

  # Database credentials
  db_name  = var.database_name
  username = var.database_username
  password = random_password.db_password.result

  # Network
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]

  # High availability
  multi_az = var.multi_az

  # Backup configuration
  backup_retention_period = var.backup_retention_period
  backup_window          = var.backup_window
  maintenance_window     = var.maintenance_window

  # Delete protection
  deletion_protection = var.deletion_protection
  skip_final_snapshot = var.skip_final_snapshot

  # Performance
  performance_insights_enabled          = var.performance_insights_enabled
  performance_insights_retention_period = var.performance_insights_retention_period

  # Monitoring
  monitoring_interval = var.monitoring_interval
  monitoring_role_arn = aws_iam_role.rds_enhanced_monitoring.arn

  # Tags
  tags = {
    Name        = "${var.name_prefix}-${var.environment}-db"
    Environment = var.environment
    Project     = var.name_prefix
  }
}

# RDS Read Replicas
resource "aws_db_instance" "read_replica" {
  count = var.read_replica_count

  identifier = "${var.name_prefix}-${var.environment}-db-read-replica-${count.index + 1}"

  # Configuration based on primary instance
  replicate_source_db = aws_db_instance.main.identifier
  instance_class      = var.read_replica_instance_class

  # Storage
  allocated_storage     = var.allocated_storage
  max_allocated_storage = var.max_allocated_storage

  # Monitoring
  monitoring_interval = var.monitoring_interval
  monitoring_role_arn = aws_iam_role.rds_enhanced_monitoring.arn

  # Tags
  tags = {
    Name        = "${var.name_prefix}-${var.environment}-db-read-replica-${count.index + 1}"
    Environment = var.environment
    Project     = var.name_prefix
    Type        = "ReadReplica"
  }
}

# IAM Role for RDS Enhanced Monitoring
resource "aws_iam_role" "rds_enhanced_monitoring" {
  name = "${var.name_prefix}-${var.environment}-rds-enhanced-monitoring"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "monitoring.rds.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name        = "${var.name_prefix}-${var.environment}-rds-enhanced-monitoring"
    Environment = var.environment
    Project     = var.name_prefix
  }
}

# IAM Policy for RDS Enhanced Monitoring
resource "aws_iam_role_policy_attachment" "rds_enhanced_monitoring" {
  role       = aws_iam_role.rds_enhanced_monitoring.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}

# Parameter Group
resource "aws_db_parameter_group" "main" {
  name   = "${var.name_prefix}-${var.environment}-db-params"
  family = "postgres15"

  parameters {
    name  = "log_min_duration_statement"
    value = "1000"
  }

  parameters {
    name  = "shared_preload_libraries"
    value = "pg_stat_statements"
  }

  parameters {
    name  = "log_statement"
    value = "all"
  }

  tags = {
    Name        = "${var.name_prefix}-${var.environment}-db-params"
    Environment = var.environment
    Project     = var.name_prefix
  }
}

# Option Group
resource "aws_db_option_group" "main" {
  name                 = "${var.name_prefix}-${var.environment}-db-options"
  option_group_description = "Option group for ${var.name_prefix} ${var.environment} database"
  engine_name         = "postgres"
  major_engine_version = "15"

  tags = {
    Name        = "${var.name_prefix}-${var.environment}-db-options"
    Environment = var.environment
    Project     = var.name_prefix
  }
}

# CloudWatch Log Exports
resource "aws_db_instance" "main_with_logs" {
  # Update main instance to export logs
  depends_on = [aws_db_instance.main]

  # This is handled by updating the main instance
  lifecycle {
    ignore_changes = [
      cloudwatch_logs_export_configuration
    ]
  }
}

# Store database credentials in AWS Secrets Manager
resource "aws_secretsmanager_secret" "db_credentials" {
  name = "${var.name_prefix}/${var.environment}/database/credentials"

  description = "Database credentials for ${var.name_prefix} ${var.environment}"

  tags = {
    Name        = "${var.name_prefix}-${var.environment}-db-credentials"
    Environment = var.environment
    Project     = var.name_prefix
  }
}

resource "aws_secretsmanager_secret_version" "db_credentials" {
  secret_id = aws_secretsmanager_secret.db_credentials.id

  secret_string = jsonencode({
    host     = aws_db_instance.main.endpoint
    port     = aws_db_instance.main.port
    dbname   = aws_db_instance.main.db_name
    username = aws_db_instance.main.username
    password = random_password.db_password.result
    url      = "postgresql://${aws_db_instance.main.username}:${random_password.db_password.result}@${aws_db_instance.main.endpoint}:${aws_db_instance.main.port}/${aws_db_instance.main.db_name}"
  })
}

# Database migration Lambda role
resource "aws_iam_role" "db_migration" {
  name = "${var.name_prefix}-${var.environment}-db-migration"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name        = "${var.name_prefix}-${var.environment}-db-migration"
    Environment = var.environment
    Project     = var.name_prefix
  }
}

resource "aws_iam_role_policy_attachment" "db_migration_basic" {
  role       = aws_iam_role.db_migration.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "db_migration_access" {
  name = "${var.name_prefix}-${var.environment}-db-migration-access"
  role = aws_iam_role.db_migration.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = [aws_secretsmanager_secret.db_credentials.arn]
      }
    ]
  })
}

# CloudWatch alarms for RDS
resource "aws_cloudwatch_metric_alarm" "cpu_utilization" {
  alarm_name          = "${var.name_prefix}-${var.environment}-rds-high-cpu"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/RDS"
  period              = "300"
  statistic           = "Average"
  threshold           = "80"
  alarm_description   = "This metric monitors RDS CPU utilization"
  alarm_actions       = var.alarm_sns_topic_arn

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.main.identifier
  }

  tags = {
    Name        = "${var.name_prefix}-${var.environment}-rds-high-cpu"
    Environment = var.environment
    Project     = var.name_prefix
  }
}

resource "aws_cloudwatch_metric_alarm" "memory_utilization" {
  alarm_name          = "${var.name_prefix}-${var.environment}-rds-high-memory"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "FreeableMemory"
  namespace           = "AWS/RDS"
  period              = "300"
  statistic           = "Average"
  threshold           = "100000000"  # 100MB in bytes
  alarm_description   = "This metric monitors RDS freeable memory"
  alarm_actions       = var.alarm_sns_topic_arn

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.main.identifier
  }

  tags = {
    Name        = "${var.name_prefix}-${var.environment}-rds-high-memory"
    Environment = var.environment
    Project     = var.name_prefix
  }
}

resource "aws_cloudwatch_metric_alarm" "database_connections" {
  alarm_name          = "${var.name_prefix}-${var.environment}-rds-high-connections"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "DatabaseConnections"
  namespace           = "AWS/RDS"
  period              = "300"
  statistic           = "Average"
  threshold           = "50"
  alarm_description   = "This metric monitors RDS database connections"
  alarm_actions       = var.alarm_sns_topic_arn

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.main.identifier
  }

  tags = {
    Name        = "${var.name_prefix}-${var.environment}-rds-high-connections"
    Environment = var.environment
    Project     = var.name_prefix
  }
}

resource "aws_cloudwatch_metric_alarm" "read_latency" {
  alarm_name          = "${var.name_prefix}-${var.environment}-rds-high-read-latency"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "ReadLatency"
  namespace           = "AWS/RDS"
  period              = "300"
  statistic           = "Average"
  threshold           = "0.1"  # 100ms
  alarm_description   = "This metric monitors RDS read latency"
  alarm_actions       = var.alarm_sns_topic_arn

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.main.identifier
  }

  tags = {
    Name        = "${var.name_prefix}-${var.environment}-rds-high-read-latency"
    Environment = var.environment
    Project     = var.name_prefix
  }
}

resource "aws_cloudwatch_metric_alarm" "write_latency" {
  alarm_name          = "${var.name_prefix}-${var.environment}-rds-high-write-latency"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "WriteLatency"
  namespace           = "AWS/RDS"
  period              = "300"
  statistic           = "Average"
  threshold           = "0.1"  # 100ms
  alarm_description   = "This metric monitors RDS write latency"
  alarm_actions       = var.alarm_sns_topic_arn

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.main.identifier
  }

  tags = {
    Name        = "${var.name_prefix}-${var.environment}-rds-high-write-latency"
    Environment = var.environment
    Project     = var.name_prefix
  }
}