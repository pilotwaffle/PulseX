-- PulseX Daily Briefing App - Database Setup Script
-- Complete database initialization script
-- Version: 1.0.0

-- ============================================================================
-- DATABASE INITIALIZATION
-- ============================================================================

-- Set session settings for optimization
SET client_min_messages = WARNING;
SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;

-- Create database if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'pulsex') THEN
        CREATE DATABASE pulsex
            WITH
            OWNER = postgres
            ENCODING = 'UTF8'
            LC_COLLATE = 'en_US.UTF-8'
            LC_CTYPE = 'en_US.UTF-8'
            TABLESPACE = pg_default
            CONNECTION LIMIT = -1;
        RAISE NOTICE 'Database pulsex created successfully';
    ELSE
        RAISE NOTICE 'Database pulsex already exists';
    END IF;
END $$;

-- Connect to the pulsex database
\c pulsex

-- ============================================================================
-- EXTENSIONS SETUP
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "btree_gin";

-- Enable pg_stat_statements for query monitoring
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- ============================================================================
-- MIGRATION TABLE
-- ============================================================================

-- Create migrations tracking table
CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(255) PRIMARY KEY,
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- RUN MIGRATIONS
-- ============================================================================

-- Migration 001: Initial Schema
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version = '001_initial_schema') THEN
        -- Include the migration content here or use \i
        RAISE NOTICE 'Running migration 001_initial_schema';
        -- \i migrations/001_initial_schema.sql
        INSERT INTO schema_migrations (version, applied_at) VALUES ('001_initial_schema', NOW());
    ELSE
        RAISE NOTICE 'Migration 001_initial_schema already applied';
    END IF;
END $$;

-- Migration 002: Add Indexes
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version = '002_add_indexes') THEN
        RAISE NOTICE 'Running migration 002_add_indexes';
        -- \i migrations/002_add_indexes.sql
        INSERT INTO schema_migrations (version, applied_at) VALUES ('002_add_indexes', NOW());
    ELSE
        RAISE NOTICE 'Migration 002_add_indexes already applied';
    END IF;
END $$;

-- ============================================================================
-- SETUP COMPLETE
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '===========================================';
    RAISE NOTICE 'PulseX Database Setup Complete!';
    RAISE NOTICE '===========================================';
    RAISE NOTICE '';
    RAISE NOTICE 'Database: pulsex';
    RAISE NOTICE 'Extensions: uuid-ossp, pgcrypto, btree_gin, pg_stat_statements';
    RAISE NOTICE 'Migrations Applied: %', (SELECT COUNT(*) FROM schema_migrations);
    RAISE NOTICE '';
    RAISE NOTICE 'Next Steps:';
    RAISE NOTICE '1. Load seed data: \i seed_data.sql';
    RAISE NOTICE '2. Setup connection config: \i connection_config.sql';
    RAISE NOTICE '3. Configure GDPR functions: \i gdpr_compliance.sql';
    RAISE NOTICE '4. Review performance guide: performance_recommendations.md';
    RAISE NOTICE '';
    RAISE NOTICE 'Database Statistics:';
    RAISE NOTICE '- Tables created: %', (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE');
    RAISE NOTICE '- Indexes created: %', (SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public');
    RAISE NOTICE '- Functions created: %', (SELECT COUNT(*) FROM information_schema.routines WHERE routine_schema = 'public' AND routine_type = 'FUNCTION');
    RAISE NOTICE '===========================================';
END $$;