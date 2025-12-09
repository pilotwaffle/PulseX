terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket = "pulsex-terraform-state"
    key    = "infrastructure/terraform.tfstate"
    region = "us-east-1"

    dynamodb_table = "terraform-locks"
    encrypt        = true
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "PulseX"
      Environment = var.environment
      ManagedBy   = "Terraform"
    }
  }
}

# VPC Configuration
module "vpc" {
  source = "./modules/vpc"

  name_prefix           = "pulsex"
  environment           = var.environment
  cidr_block           = var.vpc_cidr
  availability_zones   = var.availability_zones
  public_subnet_cidrs  = var.public_subnet_cidrs
  private_subnet_cidrs = var.private_subnet_cidrs
}

# ECS Cluster
module "ecs_cluster" {
  source = "./modules/ecs"

  name_prefix = "pulsex"
  environment = var.environment
  vpc_id      = module.vpc.vpc_id
  subnet_ids  = module.vpc.private_subnet_ids

  desired_count = var.app_desired_count
  min_capacity  = var.app_min_capacity
  max_capacity  = var.app_max_capacity

  container_image = var.container_image
  container_port  = var.container_port

  cpu    = var.container_cpu
  memory = var.container_memory

  # Secrets
  database_url     = var.database_url
  redis_url        = var.redis_url
  jwt_secret       = var.jwt_secret
  aws_access_key   = var.aws_access_key_id
  aws_secret_key   = var.aws_secret_access_key
  s3_bucket        = var.s3_bucket

  # Target groups
  alb_target_group_arn = module.load_balancer.target_group_arn
}

# RDS PostgreSQL
module "rds" {
  source = "./modules/rds"

  name_prefix        = "pulsex"
  environment        = var.environment
  vpc_id             = module.vpc.vpc_id
  subnet_ids         = module.vpc.database_subnet_ids

  database_name      = var.database_name
  database_username  = var.database_username
  database_password  = var.database_password

  instance_class     = var.db_instance_class
  allocated_storage  = var.db_allocated_storage
  multi_az           = var.db_multi_az
  backup_retention   = var.db_backup_retention

  # Read replicas for scalability
  read_replica_count = var.read_replica_count
}

# ElastiCache Redis
module "redis" {
  source = "./modules/redis"

  name_prefix = "pulsex"
  environment = var.environment
  vpc_id      = module.vpc.vpc_id
  subnet_ids  = module.vpc.private_subnet_ids

  node_type          = var.redis_node_type
  num_cache_nodes    = var.redis_num_nodes
  automatic_failover = var.redis_automatic_failover
  encryption_at_rest = var.redis_encryption_at_rest

  auth_token = var.redis_auth_token
}

# Application Load Balancer
module "load_balancer" {
  source = "./modules/alb"

  name_prefix = "pulsex"
  environment = var.environment
  vpc_id      = module.vpc.vpc_id
  subnet_ids  = module.vpc.public_subnet_ids

  certificate_arn = var.ssl_certificate_arn
}

# S3 Buckets
module "s3" {
  source = "./modules/s3"

  name_prefix = "pulsex"
  environment = var.environment

  # Enable versioning and encryption
  versioning_enabled = true
  encryption_enabled = true

  # Lifecycle policies
  lifecycle_transition_days = var.s3_lifecycle_transition_days
  lifecycle_expiration_days = var.s3_lifecycle_expiration_days
}

# CloudFront CDN
module "cloudfront" {
  source = "./modules/cloudfront"

  name_prefix      = "pulsex"
  environment      = var.environment
  s3_bucket_domain = module.s3.bucket_domain_name

  certificate_arn = var.cloudfront_ssl_certificate_arn

  # Security headers
  security_headers_enabled = true

  # Caching
  default_ttl = var.cloudfront_default_ttl
  max_ttl     = var.cloudfront_max_ttl
}

# Monitoring and Alerting
module "monitoring" {
  source = "./modules/monitoring"

  name_prefix      = "pulsex"
  environment      = var.environment
  alb_arn          = module.load_balancer.alb_arn
  ecs_cluster_arn  = module.ecs_cluster.cluster_arn
  rds_instance_arn = module.rds.instance_arn
  redis_cluster_id = module.redis.cluster_id

  # Alert endpoints
  slack_webhook_url = var.slack_webhook_url
  email_alerts     = var.email_alerts
}

# Security
module "security" {
  source = "./modules/security"

  name_prefix = "pulsex"
  environment = var.environment
  vpc_id      = module.vpc.vpc_id

  alb_arn          = module.load_balancer.alb_arn
  cloudfront_arn   = module.cloudfront.distribution_arn
  s3_bucket_arn    = module.s3.bucket_arn
  ecs_cluster_arn  = module.ecs_cluster.cluster_arn
  rds_instance_arn = module.rds.instance_arn

  # WAF configuration
  waf_enabled          = var.waf_enabled
  waf_rate_limit       = var.waf_rate_limit
  waf_block_ip_lists   = var.waf_block_ip_lists

  # Secrets Manager
  secrets_enabled = true
}