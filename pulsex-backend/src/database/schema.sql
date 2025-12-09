-- PulseX Daily Briefing Database Schema
-- PostgreSQL Schema for the Daily Briefing Application

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone_number VARCHAR(20),
    avatar_url TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User preferences table
CREATE TABLE IF NOT EXISTS user_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    preferred_topics JSONB NOT NULL DEFAULT '["technology", "business", "science"]'::jsonb,
    briefing_time VARCHAR(5) NOT NULL DEFAULT '09:00',
    timezone VARCHAR(50) NOT NULL DEFAULT 'UTC',
    language VARCHAR(10) NOT NULL DEFAULT 'en',
    notification_preferences JSONB NOT NULL DEFAULT '{
        "pushEnabled": true,
        "emailEnabled": false,
        "categories": {
            "news": true,
            "crypto": true,
            "stocks": true,
            "tech": true
        }
    }'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Device tokens table for push notifications
CREATE TABLE IF NOT EXISTS device_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL,
    device_type VARCHAR(10) NOT NULL CHECK (device_type IN ('ios', 'android')),
    device_info JSONB,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Daily briefings table
CREATE TABLE IF NOT EXISTS daily_briefings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    summary TEXT NOT NULL,
    topics JSONB NOT NULL DEFAULT '[]'::jsonb,
    sources JSONB NOT NULL DEFAULT '[]'::jsonb,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_read BOOLEAN DEFAULT false,
    read_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, date)
);

-- Feedback table
CREATE TABLE IF NOT EXISTS feedback (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    briefing_id UUID NOT NULL REFERENCES daily_briefings(id) ON DELETE CASCADE,
    card_id TEXT NOT NULL,
    type VARCHAR(10) NOT NULL CHECK (type IN ('like', 'dislike')),
    topic VARCHAR(100) NOT NULL,
    reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Saved cards table
CREATE TABLE IF NOT EXISTS saved_cards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    briefing_id UUID NOT NULL REFERENCES daily_briefings(id) ON DELETE CASCADE,
    card_id TEXT NOT NULL,
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    tags JSONB NOT NULL DEFAULT '[]'::jsonb,
    saved_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Notification logs table
CREATE TABLE IF NOT EXISTS notification_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    data JSONB,
    success_count INTEGER DEFAULT 0,
    failure_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Analytics events table
CREATE TABLE IF NOT EXISTS analytics_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL,
    event_data JSONB,
    session_id VARCHAR(255),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance

-- Users table indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);

-- User preferences indexes
CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON user_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_user_preferences_topics ON user_preferences USING GIN(preferred_topics);

-- Device tokens indexes
CREATE INDEX IF NOT EXISTS idx_device_tokens_user_id ON device_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_device_tokens_active ON device_tokens(is_active);
CREATE INDEX IF NOT EXISTS idx_device_tokens_token ON device_tokens(token);
CREATE INDEX IF NOT EXISTS idx_device_tokens_user_active ON device_tokens(user_id, is_active);

-- Daily briefings indexes
CREATE INDEX IF NOT EXISTS idx_daily_briefings_user_id ON daily_briefings(user_id);
CREATE INDEX IF NOT EXISTS idx_daily_briefings_date ON daily_briefings(date);
CREATE INDEX IF NOT EXISTS idx_daily_briefings_user_date ON daily_briefings(user_id, date);
CREATE INDEX IF NOT EXISTS idx_daily_briefings_created_at ON daily_briefings(created_at);
CREATE INDEX IF NOT EXISTS idx_daily_briefings_is_read ON daily_briefings(is_read);
CREATE INDEX IF NOT EXISTS idx_daily_briefings_topics ON daily_briefings USING GIN(topics);

-- Feedback indexes
CREATE INDEX IF NOT EXISTS idx_feedback_user_id ON feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_feedback_briefing_id ON feedback(briefing_id);
CREATE INDEX IF NOT EXISTS idx_feedback_type ON feedback(type);
CREATE INDEX IF NOT EXISTS idx_feedback_topic ON feedback(topic);
CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON feedback(created_at);
CREATE INDEX IF NOT EXISTS idx_feedback_user_topic ON feedback(user_id, topic);

-- Saved cards indexes
CREATE INDEX IF NOT EXISTS idx_saved_cards_user_id ON saved_cards(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_cards_briefing_id ON saved_cards(briefing_id);
CREATE INDEX IF NOT EXISTS idx_saved_cards_saved_at ON saved_cards(saved_at);
CREATE INDEX IF NOT EXISTS idx_saved_cards_tags ON saved_cards USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_saved_cards_user_saved_at ON saved_cards(user_id, saved_at);

-- Notification logs indexes
CREATE INDEX IF NOT EXISTS idx_notification_logs_user_id ON notification_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_logs_created_at ON notification_logs(created_at);

-- Analytics events indexes
CREATE INDEX IF NOT EXISTS idx_analytics_events_user_id ON analytics_events(user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_type ON analytics_events(event_type);
CREATE INDEX IF NOT EXISTS idx_analytics_events_timestamp ON analytics_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_analytics_events_session_id ON analytics_events(session_id);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at columns
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_preferences_updated_at BEFORE UPDATE ON user_preferences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_device_tokens_updated_at BEFORE UPDATE ON device_tokens
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_daily_briefings_updated_at BEFORE UPDATE ON daily_briefings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create partial indexes for better performance on large tables
CREATE INDEX IF NOT EXISTS idx_daily_briefings_unread ON daily_briefings(user_id, date) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_device_tokens_user_active ON device_tokens(user_id) WHERE is_active = true;

-- Insert sample data (optional - remove for production)
INSERT INTO users (email, password_hash, first_name, last_name) VALUES
('demo@pullex.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj6hsxq9w5KS', 'Demo', 'User')
ON CONFLICT (email) DO NOTHING;

-- Create default preferences for demo user
INSERT INTO user_preferences (user_id, preferred_topics, briefing_time, timezone, language) VALUES
((SELECT id FROM users WHERE email = 'demo@pullex.com'), '["technology", "business", "science"]', '09:00', 'UTC', 'en')
ON CONFLICT DO NOTHING;

-- Create stored procedures for common operations

-- Function to get user statistics
CREATE OR REPLACE FUNCTION get_user_statistics(p_user_id UUID)
RETURNS TABLE(
    total_briefings BIGINT,
    read_briefings BIGINT,
    saved_cards BIGINT,
    total_feedback BIGINT,
    liked_feedback BIGINT,
    registration_date TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        (SELECT COUNT(*) FROM daily_briefings WHERE user_id = p_user_id),
        (SELECT COUNT(*) FROM daily_briefings WHERE user_id = p_user_id AND is_read = true),
        (SELECT COUNT(*) FROM saved_cards WHERE user_id = p_user_id),
        (SELECT COUNT(*) FROM feedback WHERE user_id = p_user_id),
        (SELECT COUNT(*) FROM feedback WHERE user_id = p_user_id AND type = 'like'),
        (SELECT created_at FROM users WHERE id = p_user_id);
END;
$$ LANGUAGE plpgsql;

-- Function to cleanup old analytics data (older than 1 year)
CREATE OR REPLACE FUNCTION cleanup_old_analytics()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM analytics_events
    WHERE timestamp < NOW() - INTERVAL '1 year';

    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to get top performing topics
CREATE OR REPLACE FUNCTION get_top_topics(p_limit INTEGER DEFAULT 10)
RETURNS TABLE(
    topic VARCHAR(100),
    like_count BIGINT,
    dislike_count BIGINT,
    total_feedback BIGINT,
    like_rate NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        f.topic,
        COUNT(*) FILTER (WHERE f.type = 'like') as like_count,
        COUNT(*) FILTER (WHERE f.type = 'dislike') as dislike_count,
        COUNT(*) as total_feedback,
        ROUND(
            (COUNT(*) FILTER (WHERE f.type = 'like')::NUMERIC / COUNT(*)) * 100, 2
        ) as like_rate
    FROM feedback f
    WHERE f.created_at >= NOW() - INTERVAL '30 days'
    GROUP BY f.topic
    ORDER BY total_feedback DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;