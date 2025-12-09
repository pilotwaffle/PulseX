#!/bin/bash

# PulseX Deployment Script
# This script handles the complete deployment process

set -e

# Configuration
ENVIRONMENT=${1:-development}
REGION=${2:-us-east-1}
PROJECT_NAME="pulsex"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TERRAFORM_DIR="$(dirname "$SCRIPT_DIR")/terraform"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."

    # Check if required tools are installed
    command -v terraform >/dev/null 2>&1 || { log_error "Terraform is required but not installed."; exit 1; }
    command -v aws >/dev/null 2>&1 || { log_error "AWS CLI is required but not installed."; exit 1; }
    command -v docker >/dev/null 2>&1 || { log_error "Docker is required but not installed."; exit 1; }
    command -v kubectl >/dev/null 2>&1 || { log_warning "kubectl is not installed. Kubernetes integration will be skipped."; }

    # Check AWS credentials
    if ! aws sts get-caller-identity >/dev/null 2>&1; then
        log_error "AWS credentials are not configured. Please run 'aws configure' or set up IAM role."
        exit 1
    fi

    log_success "Prerequisites check completed"
}

# Function to validate environment
validate_environment() {
    log_info "Validating environment: $ENVIRONMENT"

    if [[ ! "$ENVIRONMENT" =~ ^(development|staging|production)$ ]]; then
        log_error "Invalid environment. Must be one of: development, staging, production"
        exit 1
    fi

    # Set environment-specific variables
    case $ENVIRONMENT in
        development)
            DESIRED_COUNT=1
            MIN_CAPACITY=1
            MAX_CAPACITY=3
            DB_INSTANCE="db.t4g.medium"
            REDIS_NODES=1
            ;;
        staging)
            DESIRED_COUNT=2
            MIN_CAPACITY=2
            MAX_CAPACITY=5
            DB_INSTANCE="db.r6g.large"
            REDIS_NODES=2
            ;;
        production)
            DESIRED_COUNT=3
            MIN_CAPACITY=3
            MAX_CAPACITY=20
            DB_INSTANCE="db.r6g.2xlarge"
            REDIS_NODES=3
            ;;
    esac

    log_success "Environment validation completed"
}

# Function to build and push Docker image
build_and_push_image() {
    log_info "Building Docker image..."

    # Get the current Git commit hash
    COMMIT_HASH=$(git rev-parse --short HEAD)
    IMAGE_TAG="${ENVIRONMENT}-${COMMIT_HASH}"

    # Build the Docker image
    docker build -t "${PROJECT_NAME}:${IMAGE_TAG}" .

    # Tag the image for ECR
    ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
    ECR_REPO="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${PROJECT_NAME}"

    docker tag "${PROJECT_NAME}:${IMAGE_TAG}" "${ECR_REPO}:${IMAGE_TAG}"
    docker tag "${PROJECT_NAME}:${IMAGE_TAG}" "${ECR_REPO}:${ENVIRONMENT}-latest"

    # Push to ECR
    aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $ECR_REPO

    log_info "Pushing Docker image to ECR..."
    docker push "${ECR_REPO}:${IMAGE_TAG}"
    docker push "${ECR_REPO}:${ENVIRONMENT}-latest"

    export CONTAINER_IMAGE="${ECR_REPO}:${IMAGE_TAG}"
    log_success "Docker image built and pushed: $CONTAINER_IMAGE"
}

# Function to deploy infrastructure
deploy_infrastructure() {
    log_info "Deploying infrastructure with Terraform..."

    cd "$TERRAFORM_DIR"

    # Initialize Terraform
    terraform init

    # Select workspace
    terraform workspace select $ENVIRONMENT || terraform workspace new $ENVIRONMENT

    # Plan the deployment
    log_info "Creating Terraform plan..."
    terraform plan \
        -var="environment=$ENVIRONMENT" \
        -var="container_image=$CONTAINER_IMAGE" \
        -var="app_desired_count=$DESIRED_COUNT" \
        -var="app_min_capacity=$MIN_CAPACITY" \
        -var="app_max_capacity=$MAX_CAPACITY" \
        -var="db_instance_class=$DB_INSTANCE" \
        -var="redis_num_nodes=$REDIS_NODES" \
        -out="tfplan"

    # Apply the plan
    log_info "Applying Terraform plan..."
    terraform apply tfplan

    # Get outputs
    ALB_URL=$(terraform output -raw alb_url)
    APP_URL=$(terraform output -raw app_url)

    log_success "Infrastructure deployed successfully"
}

# Function to run database migrations
run_migrations() {
    log_info "Running database migrations..."

    # Get database connection details from Terraform outputs
    cd "$TERRAFORM_DIR"
    DATABASE_URL=$(terraform output -raw database_url)

    # Run migrations using the application's migration tool
    # This is a placeholder - adjust according to your migration system
    npm run migrate:up -- --url="$DATABASE_URL"

    log_success "Database migrations completed"
}

# Function to run health checks
run_health_checks() {
    log_info "Running health checks..."

    # Wait for the application to be ready
    log_info "Waiting for application to be ready..."

    MAX_ATTEMPTS=30
    ATTEMPT=1

    while [ $ATTEMPT -le $MAX_ATTEMPTS ]; do
        if curl -f "$ALB_URL/health" >/dev/null 2>&1; then
            log_success "Application is healthy and ready"
            break
        fi

        log_info "Attempt $ATTEMPT/$MAX_ATTEMPTS: Application not ready, waiting..."
        sleep 30
        ((ATTEMPT++))
    done

    if [ $ATTEMPT -gt $MAX_ATTEMPTS ]; then
        log_error "Application failed to become healthy after $MAX_ATTEMPTS attempts"
        exit 1
    fi
}

# Function to run smoke tests
run_smoke_tests() {
    log_info "Running smoke tests..."

    # Run a series of basic tests to verify the deployment
    curl -f "$ALB_URL/api/health" || { log_error "Health endpoint failed"; exit 1; }
    curl -f "$ALB_URL/api/version" || { log_error "Version endpoint failed"; exit 1; }

    # Add more smoke tests as needed

    log_success "Smoke tests passed"
}

# Function to notify team
notify_team() {
    log_info "Sending deployment notification..."

    # Send Slack notification (if webhook is configured)
    if [ ! -z "$SLACK_WEBHOOK_URL" ]; then
        curl -X POST -H 'Content-type: application/json' \
            --data "{\"text\":\"🚀 PulseX deployed to $ENVIRONMENT environment\nURL: $APP_URL\nCommit: $(git rev-parse --short HEAD)\"}" \
            "$SLACK_WEBHOOK_URL" || log_warning "Failed to send Slack notification"
    fi

    log_success "Team notification sent"
}

# Function to rollback deployment
rollback_deployment() {
    log_warning "Initiating rollback..."

    cd "$TERRAFORM_DIR"

    # Get the previous working image tag
    PREVIOUS_TAG=$(aws ecr describe-images \
        --repository-name $PROJECT_NAME \
        --query 'sort_by(imageDetails, &imagePushedAt)[-2].imageTags[0]' \
        --output text || echo "")

    if [ ! -z "$PREVIOUS_TAG" ]; then
        log_info "Rolling back to previous image: $PREVIOUS_TAG"

        # Update ECS service to use previous image
        aws ecs update-service \
            --cluster "${PROJECT_NAME}-${ENVIRONMENT}-cluster" \
            --service "${PROJECT_NAME}-${ENVIRONMENT}-service" \
            --force-new-deployment

        log_success "Rollback initiated"
    else
        log_error "No previous image found for rollback"
        exit 1
    fi
}

# Main deployment function
main() {
    log_info "Starting PulseX deployment to $ENVIRONMENT environment..."

    # Trap errors and cleanup
    trap 'log_error "Deployment failed at line $LINENO"' ERR

    # Execute deployment steps
    check_prerequisites
    validate_environment
    build_and_push_image
    deploy_infrastructure
    run_migrations
    run_health_checks
    run_smoke_tests
    notify_team

    log_success "🎉 Deployment completed successfully!"
    log_info "Application URL: $APP_URL"
    log_info "Load Balancer URL: $ALB_URL"
}

# Handle command line arguments
case "${1:-}" in
    "rollback")
        ENVIRONMENT="${2:-development}"
        validate_environment
        rollback_deployment
        ;;
    "status")
        ENVIRONMENT="${2:-development}"
        cd "$TERRAFORM_DIR"
        terraform workspace select $ENVIRONMENT
        terraform show
        ;;
    *)
        main "$@"
        ;;
esac