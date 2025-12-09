-- Migration 001: Initial Schema Setup
-- Creates the complete database structure for PulseX Daily Briefing App
-- Version: 1.0.0
-- Date: 2024-12-08

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "btree_gin";

-- Create custom types
CREATE TYPE user_status AS ENUM ('active', 'inactive', 'suspended', 'onboarding');
CREATE TYPE briefing_status AS ENUM ('draft', 'published', 'archived');
CREATE TYPE feedback_type AS ENUM ('like', 'dislike', 'save', 'share');
CREATE TYPE notification_platform AS ENUM ('ios', 'android', 'web');
CREATE TYPE audit_action AS ENUM ('create', 'read', 'update', 'delete', 'export');

-- Create users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(50) UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    phone VARCHAR(20),
    avatar_url TEXT,
    status user_status DEFAULT 'onboarding',
    email_verified BOOLEAN DEFAULT FALSE,
    phone_verified BOOLEAN DEFAULT FALSE,
    last_login_at TIMESTAMP WITH TIME ZONE,
    last_active_at TIMESTAMP WITH TIME ZONE,
    preferences JSONB DEFAULT '{}',
    interests JSONB DEFAULT '[]',
    onboarding_step INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT valid_email CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    CONSTRAINT valid_username CHECK (username ~* '^[a-zA-Z0-9_]{3,50}$')
);

-- Create briefings table
CREATE TABLE briefings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    subtitle TEXT,
    briefing_date DATE NOT NULL,
    status briefing_status DEFAULT 'draft',
    version INTEGER DEFAULT 1,
    cards JSONB NOT NULL DEFAULT '[]',
    summary JSONB,
    metadata JSONB DEFAULT '{}',
    view_count INTEGER DEFAULT 0,
    read_time_seconds INTEGER DEFAULT 0,
    completion_rate DECIMAL(5,2) DEFAULT 0.00,
    generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    published_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_user_daily_briefing UNIQUE(user_id, briefing_date),
    CONSTRAINT valid_briefing_date CHECK (briefing_date <= CURRENT_DATE),
    CONSTRAINT valid_completion_rate CHECK (completion_rate >= 0 AND completion_rate <= 100)
);

-- Create user_feedback table
CREATE TABLE user_feedback (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    briefing_id UUID REFERENCES briefings(id) ON DELETE CASCADE,
    card_id UUID,
    feedback_type feedback_type NOT NULL,
    topic VARCHAR(100),
    weight DECIMAL(3,2) DEFAULT 1.0,
    reason TEXT,
    session_id UUID,
    device_info JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create saved_cards table
CREATE TABLE saved_cards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    briefing_id UUID REFERENCES briefings(id) ON DELETE CASCADE,
    card_id UUID NOT NULL,
    card_content JSONB NOT NULL,
    card_title VARCHAR(255) NOT NULL,
    card_summary TEXT,
    tags JSONB DEFAULT '[]',
    category VARCHAR(100),
    saved_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_accessed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_user_saved_card UNIQUE(user_id, card_id),
    CONSTRAINT valid_tags CHECK (jsonb_array_length(tags) >= 0)
);

-- Create notification_tokens table
CREATE TABLE notification_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(512) NOT NULL,
    platform notification_platform NOT NULL,
    device_id VARCHAR(255),
    app_version VARCHAR(50),
    is_active BOOLEAN DEFAULT TRUE,
    last_used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_user_platform_device UNIQUE(user_id, platform, device_id)
);

-- Create audit_logs table
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action audit_action NOT NULL,
    table_name VARCHAR(100) NOT NULL,
    record_id UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    session_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
) WITH (fillfactor=90);

-- Create sessions table
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_token VARCHAR(255) UNIQUE NOT NULL,
    device_fingerprint VARCHAR(255),
    device_info JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT TRUE,
    last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT valid_expiry CHECK (expires_at > created_at)
);

-- Create analytics_events table
CREATE TABLE analytics_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
    event_type VARCHAR(100) NOT NULL,
    event_name VARCHAR(255) NOT NULL,
    properties JSONB DEFAULT '{}',
    duration_ms INTEGER,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
) WITH (fillfactor=90);

-- Create indexes (basic set - more indexes in 002_add_indexes.sql)
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_briefings_user_date ON briefings(user_id, briefing_date DESC);
CREATE INDEX idx_user_feedback_user_type ON user_feedback(user_id, feedback_type);
CREATE INDEX idx_saved_cards_user_id ON saved_cards(user_id, saved_at DESC);
CREATE INDEX idx_notification_tokens_user_active ON notification_tokens(user_id, is_active);
CREATE INDEX idx_audit_logs_user_action ON audit_logs(user_id, action);
CREATE INDEX idx_sessions_token ON sessions(session_token);
CREATE INDEX idx_analytics_events_type_name ON analytics_events(event_type, event_name);

-- Create utility functions
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_briefings_updated_at BEFORE UPDATE ON briefings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_notification_tokens_updated_at BEFORE UPDATE ON notification_tokens
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert migration record
INSERT INTO schema_migrations (version, applied_at) VALUES ('001_initial_schema', NOW()) ON CONFLICT DO NOTHING;