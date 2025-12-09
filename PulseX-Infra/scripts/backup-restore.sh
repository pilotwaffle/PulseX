#!/bin/bash

# PulseX Backup and Restore Script
# Handles database and Redis backups/restores

set -e

# Configuration
ENVIRONMENT=${1:-development}
BACKUP_TYPE=${2:-database}
OPERATION=${3:-backup}
REGION=${4:-us-east-1}
PROJECT_NAME="pulsex"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

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

# Function to backup database
backup_database() {
    log_info "Starting database backup for $ENVIRONMENT environment..."

    # Get database details from Terraform outputs
    cd "$(dirname "$0")/../terraform"
    terraform workspace select $ENVIRONMENT

    DB_ENDPOINT=$(terraform output -raw rds_instance_endpoint)
    DB_NAME=$(terraform output -raw database_name)
    DB_USER=$(terraform output -raw database_username)

    # Get database password from Secrets Manager
    DB_PASSWORD=$(aws secretsmanager get-secret-value \
        --secret-id "${PROJECT_NAME}-${ENVIRONMENT}-db-password" \
        --query 'SecretString' \
        --output text | jq -r '.password')

    # Create backup filename
    BACKUP_FILE="${PROJECT_NAME}_${ENVIRONMENT}_db_${TIMESTAMP}.sql.gz"

    # Perform database backup
    log_info "Creating database backup..."
    PGPASSWORD="$DB_PASSWORD" pg_dump \
        -h "$DB_ENDPOINT" \
        -U "$DB_USER" \
        -d "$DB_NAME" \
        --no-password \
        --verbose \
        --clean \
        --if-exists \
        --format=custom \
        --compress=9 \
        -f "/tmp/$BACKUP_FILE"

    # Upload to S3
    S3_BUCKET="${PROJECT_NAME}-${ENVIRONMENT}-backups"
    aws s3 cp "/tmp/$BACKUP_FILE" "s3://$S3_BUCKET/database/"

    # Clean up local file
    rm -f "/tmp/$BACKUP_FILE"

    log_success "Database backup completed: s3://$S3_BUCKET/database/$BACKUP_FILE"

    # Update backup metadata
    echo "{
        \"backup_type\": \"database\",
        \"environment\": \"$ENVIRONMENT\",
        \"timestamp\": \"$TIMESTAMP\",
        \"file\": \"database/$BACKUP_FILE\",
        \"size_bytes\": $(aws s3 ls "s3://$S3_BUCKET/database/$BACKUP_FILE" --summarize --human-readable | tail -1 | awk '{print $3}')
    }" | aws s3 cp - "s3://$S3_BUCKET/metadata/db_backup_${TIMESTAMP}.json"
}

# Function to restore database
restore_database() {
    local BACKUP_FILE=${4:-}

    if [ -z "$BACKUP_FILE" ]; then
        log_error "Backup file must be specified for restore operation"
        echo "Usage: $0 <environment> database restore <backup_file>"
        exit 1
    fi

    log_info "Starting database restore from $BACKUP_FILE..."

    # Get database details from Terraform outputs
    cd "$(dirname "$0")/../terraform"
    terraform workspace select $ENVIRONMENT

    DB_ENDPOINT=$(terraform output -raw rds_instance_endpoint)
    DB_NAME=$(terraform output -raw database_name)
    DB_USER=$(terraform output -raw database_username)

    # Get database password from Secrets Manager
    DB_PASSWORD=$(aws secretsmanager get-secret-value \
        --secret-id "${PROJECT_NAME}-${ENVIRONMENT}-db-password" \
        --query 'SecretString' \
        --output text | jq -r '.password')

    # Download backup from S3
    S3_BUCKET="${PROJECT_NAME}-${ENVIRONMENT}-backups"
    aws s3 cp "s3://$S3_BUCKET/$BACKUP_FILE" "/tmp/restore_backup.sql.gz"

    # Create backup before restore (safety measure)
    log_warning "Creating safety backup before restore..."
    backup_database

    # Restore database
    log_info "Restoring database..."
    PGPASSWORD="$DB_PASSWORD" pg_restore \
        -h "$DB_ENDPOINT" \
        -U "$DB_USER" \
        -d "$DB_NAME" \
        --no-password \
        --verbose \
        --clean \
        --if-exists \
        "/tmp/restore_backup.sql.gz"

    # Clean up local file
    rm -f "/tmp/restore_backup.sql.gz"

    log_success "Database restore completed successfully"
}

# Function to backup Redis
backup_redis() {
    log_info "Starting Redis backup for $ENVIRONMENT environment..."

    # Get Redis details from Terraform outputs
    cd "$(dirname "$0")/../terraform"
    terraform workspace select $ENVIRONMENT

    REDIS_ENDPOINT=$(terraform output -raw redis_endpoint)
    REDIS_AUTH_TOKEN=$(aws secretsmanager get-secret-value \
        --secret-id "${PROJECT_NAME}-${ENVIRONMENT}-redis-auth-token" \
        --query 'SecretString' \
        --output text)

    # Create backup directory
    BACKUP_DIR="/tmp/redis_backup_${TIMESTAMP}"
    mkdir -p "$BACKUP_DIR"

    # Connect to Redis and create backup
    log_info "Creating Redis backup..."
    redis-cli -h "$REDIS_ENDPOINT" -a "$REDIS_AUTH_TOKEN" --rdb "$BACKUP_DIR/dump.rdb"

    # Create compressed archive
    BACKUP_FILE="${PROJECT_NAME}_${ENVIRONMENT}_redis_${TIMESTAMP}.tar.gz"
    tar -czf "/tmp/$BACKUP_FILE" -C "/tmp" "redis_backup_${TIMESTAMP}"

    # Upload to S3
    S3_BUCKET="${PROJECT_NAME}-${ENVIRONMENT}-backups"
    aws s3 cp "/tmp/$BACKUP_FILE" "s3://$S3_BUCKET/redis/"

    # Clean up local files
    rm -rf "$BACKUP_DIR" "/tmp/$BACKUP_FILE"

    log_success "Redis backup completed: s3://$S3_BUCKET/redis/$BACKUP_FILE"

    # Update backup metadata
    echo "{
        \"backup_type\": \"redis\",
        \"environment\": \"$ENVIRONMENT\",
        \"timestamp\": \"$TIMESTAMP\",
        \"file\": \"redis/$BACKUP_FILE\",
        \"size_bytes\": $(aws s3 ls "s3://$S3_BUCKET/redis/$BACKUP_FILE" --summarize --human-readable | tail -1 | awk '{print $3}')
    }" | aws s3 cp - "s3://$S3_BUCKET/metadata/redis_backup_${TIMESTAMP}.json"
}

# Function to restore Redis
restore_redis() {
    local BACKUP_FILE=${4:-}

    if [ -z "$BACKUP_FILE" ]; then
        log_error "Backup file must be specified for restore operation"
        echo "Usage: $0 <environment> redis restore <backup_file>"
        exit 1
    fi

    log_info "Starting Redis restore from $BACKUP_FILE..."

    # Get Redis details from Terraform outputs
    cd "$(dirname "$0")/../terraform"
    terraform workspace select $ENVIRONMENT

    REDIS_ENDPOINT=$(terraform output -raw redis_endpoint)
    REDIS_AUTH_TOKEN=$(aws secretsmanager get-secret-value \
        --secret-id "${PROJECT_NAME}-${ENVIRONMENT}-redis-auth-token" \
        --query 'SecretString' \
        --output text)

    # Download backup from S3
    S3_BUCKET="${PROJECT_NAME}-${ENVIRONMENT}-backups"
    aws s3 cp "s3://$S3_BUCKET/$BACKUP_FILE" "/tmp/redis_restore.tar.gz"

    # Extract backup
    mkdir -p "/tmp/redis_restore"
    tar -xzf "/tmp/redis_restore.tar.gz" -C "/tmp"

    # Find the dump file
    DUMP_FILE=$(find /tmp/redis_restore_* -name "dump.rdb" | head -1)

    if [ -z "$DUMP_FILE" ]; then
        log_error "Redis dump file not found in backup"
        exit 1
    fi

    # Create safety backup before restore
    log_warning "Creating safety backup before restore..."
    backup_redis

    # Restore Redis
    log_info "Restoring Redis..."
    redis-cli -h "$REDIS_ENDPOINT" -a "$REDIS_AUTH_TOKEN" FLUSHALL
    redis-cli -h "$REDIS_ENDPOINT" -a "$REDIS_AUTH_TOKEN" --rdb "$DUMP_FILE"

    # Clean up local files
    rm -rf "/tmp/redis_restore" "/tmp/redis_restore.tar.gz"

    log_success "Redis restore completed successfully"
}

# Function to list backups
list_backups() {
    local BACKUP_TYPE=${2:-all}

    log_info "Listing backups for $ENVIRONMENT environment..."

    S3_BUCKET="${PROJECT_NAME}-${ENVIRONMENT}-backups"

    case $BACKUP_TYPE in
        database)
            aws s3 ls "s3://$S3_BUCKET/database/" --human-readable
            ;;
        redis)
            aws s3 ls "s3://$S3_BUCKET/redis/" --human-readable
            ;;
        all)
            log_info "Database backups:"
            aws s3 ls "s3://$S3_BUCKET/database/" --human-readable
            echo ""
            log_info "Redis backups:"
            aws s3 ls "s3://$S3_BUCKET/redis/" --human-readable
            ;;
        *)
            log_error "Invalid backup type. Must be: database, redis, or all"
            exit 1
            ;;
    esac
}

# Function to cleanup old backups
cleanup_backups() {
    local RETENTION_DAYS=${2:-30}

    log_info "Cleaning up backups older than $RETENTION_DAYS days..."

    S3_BUCKET="${PROJECT_NAME}-${ENVIRONMENT}-backups"

    # Delete old database backups
    aws s3 ls "s3://$S3_BUCKET/database/" | \
    while read -r line; do
        CREATE_DATE=$(echo "$line" | awk '{print $1" "$2}')
        FILE=$(echo "$line" | awk '{print $4}')

        AGE_DAYS=$(( ($(date +%s) - $(date -d"$CREATE_DATE" +%s)) / 86400 ))

        if [ $AGE_DAYS -gt $RETENTION_DAYS ]; then
            log_info "Deleting old database backup: $FILE"
            aws s3 rm "s3://$S3_BUCKET/database/$FILE"
        fi
    done

    # Delete old Redis backups
    aws s3 ls "s3://$S3_BUCKET/redis/" | \
    while read -r line; do
        CREATE_DATE=$(echo "$line" | awk '{print $1" "$2}')
        FILE=$(echo "$line" | awk '{print $4}')

        AGE_DAYS=$(( ($(date +%s) - $(date -d"$CREATE_DATE" +%s)) / 86400 ))

        if [ $AGE_DAYS -gt $RETENTION_DAYS ]; then
            log_info "Deleting old Redis backup: $FILE"
            aws s3 rm "s3://$S3_BUCKET/redis/$FILE"
        fi
    done

    log_success "Backup cleanup completed"
}

# Main function
main() {
    log_info "Starting backup/restore operation..."

    case "$BACKUP_TYPE" in
        database)
            case "$OPERATION" in
                backup)
                    backup_database
                    ;;
                restore)
                    restore_database "$@"
                    ;;
                *)
                    log_error "Invalid operation for database backup. Must be: backup or restore"
                    exit 1
                    ;;
            esac
            ;;
        redis)
            case "$OPERATION" in
                backup)
                    backup_redis
                    ;;
                restore)
                    restore_redis "$@"
                    ;;
                *)
                    log_error "Invalid operation for Redis backup. Must be: backup or restore"
                    exit 1
                    ;;
            esac
            ;;
        list)
            list_backups "$@"
            ;;
        cleanup)
            cleanup_backups "$@"
            ;;
        *)
            log_error "Invalid backup type. Must be: database, redis, list, or cleanup"
            echo "Usage: $0 <environment> <type> <operation> [options]"
            echo "  Types: database, redis, list, cleanup"
            echo "  Operations for database/redis: backup, restore"
            echo "  Examples:"
            echo "    $0 development database backup"
            echo "    $0 production database restore database/pulsex_prod_db_20231208_120000.sql.gz"
            echo "    $0 staging redis backup"
            echo "    $0 production list"
            echo "    $0 production cleanup 30"
            exit 1
            ;;
    esac
}

# Run main function with all arguments
main "$@"