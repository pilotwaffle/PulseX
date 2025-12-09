-- Seed Data for PulseX Daily Briefing App
-- Development and testing environment data
-- Version: 1.0.0

-- First, clear existing seed data (in development)
TRUNCATE TABLE analytics_events CASCADE;
TRUNCATE TABLE audit_logs CASCADE;
TRUNCATE TABLE notification_tokens CASCADE;
TRUNCATE TABLE saved_cards CASCADE;
TRUNCATE TABLE user_feedback CASCADE;
TRUNCATE TABLE briefings CASCADE;
TRUNCATE TABLE sessions CASCADE;
TRUNCATE TABLE users CASCADE;

-- ============================================================================
-- 1. SAMPLE USERS
-- ============================================================================

-- Insert sample users with diverse preferences
INSERT INTO users (id, email, username, password_hash, first_name, last_name, status, preferences, interests, onboarding_step, last_login_at, last_active_at) VALUES
-- Power user
('550e8400-e29b-41d4-a716-446655440001', 'sarah.johnson@example.com', 'sarahj', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPjVQ4JyQJ3WS', 'Sarah', 'Johnson', 'active',
'{"timezone": "America/New_York", "theme": "dark", "language": "en", "notifications": {"email": true, "push": true, "briefing_time": "07:00"}, "content_preferences": {"max_cards": 8, "preferred_sources": ["Reuters", "Bloomberg", "TechCrunch"], "topics": ["technology", "finance", "startups"]}}',
'["technology", "finance", "startups", "AI", "cryptocurrency"]', 5, NOW() - INTERVAL '2 hours', NOW() - INTERVAL '1 hour'),

-- Casual user
('550e8400-e29b-41d4-a716-446655440002', 'mike.chen@example.com', 'mikec', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPjVQ4JyQJ3WS', 'Mike', 'Chen', 'active',
'{"timezone": "America/Los_Angeles", "theme": "light", "language": "en", "notifications": {"email": false, "push": true, "briefing_time": "08:00"}, "content_preferences": {"max_cards": 6, "preferred_sources": ["BBC", "CNN"], "topics": ["world news", "sports"]}}',
'["world news", "sports", "travel", "food"]', 4, NOW() - INTERVAL '6 hours', NOW() - INTERVAL '3 hours'),

-- New user onboarding
('550e8400-e29b-41d4-a716-446655440003', 'emma.wilson@example.com', 'emmaw', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPjVQ4JyQJ3WS', 'Emma', 'Wilson', 'onboarding',
'{"timezone": "Europe/London", "theme": "light", "language": "en", "notifications": {"email": true, "push": false}, "content_preferences": {"max_cards": 5}}',
'["fashion", "lifestyle", "wellness"]', 2, NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day'),

-- Inactive user
('550e8400-e29b-41d4-a716-446655440004', 'alex.thompson@example.com', 'alext', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPjVQ4JyQJ3WS', 'Alex', 'Thompson', 'inactive',
'{"timezone": "America/Chicago", "theme": "dark", "language": "en"}',
'["gaming", "entertainment", "movies"]', 5, NOW() - INTERVAL '30 days', NOW() - INTERVAL '30 days'),

-- Business user
('550e8400-e29b-41d4-a716-446655440005', 'david.kumar@example.com', 'davidk', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPjVQ4JyQJ3WS', 'David', 'Kumar', 'active',
'{"timezone": "Asia/Singapore", "theme": "light", "language": "en", "notifications": {"email": true, "push": true, "briefing_time": "06:30"}, "content_preferences": {"max_cards": 10, "preferred_sources": ["Financial Times", "Wall Street Journal", "Harvard Business Review"], "topics": ["business", "economics", "leadership"]}}',
'["business", "economics", "leadership", "management", "innovation"]', 5, NOW() - INTERVAL '4 hours', NOW() - INTERVAL '2 hours');

-- ============================================================================
-- 2. SAMPLE BRIEFINGS
-- ============================================================================

-- Today's briefings for each active user
INSERT INTO briefings (id, user_id, title, subtitle, briefing_date, status, cards, summary, metadata, view_count, read_time_seconds, completion_rate, published_at) VALUES

-- Sarah's briefing (technology focus)
('b1a2b3c4-1234-5678-90ab-123456789001', '550e8400-e29b-41d4-a716-446655440001',
'Tech Tuesday: AI Advances & Market Updates', 'Your daily dose of technology and financial news', CURRENT_DATE, 'published',
'[
  {
    "id": "card_001",
    "type": "news",
    "title": "OpenAI Announces GPT-5 Breakthrough",
    "summary": "Major breakthrough in AI capabilities announced today with significant improvements in reasoning and accuracy.",
    "content": "OpenAI has revealed its latest AI model showing unprecedented performance across multiple benchmarks...",
    "source": "TechCrunch",
    "url": "https://techcrunch.com/openai-gpt5",
    "published_at": "2024-12-08T09:00:00Z",
    "read_time": 3,
    "category": "AI",
    "priority": "high",
    "images": [{"url": "https://example.com/ai-image.jpg", "alt": "AI Technology"}]
  },
  {
    "id": "card_002",
    "type": "market",
    "title": "Tech Stocks Rally on AI Optimism",
    "summary": "Major tech companies see significant gains following AI breakthrough announcement.",
    "content": "NVIDIA, Microsoft, and other tech giants reported strong market performance...",
    "source": "Bloomberg",
    "url": "https://bloomberg.com/tech-stocks",
    "published_at": "2024-12-08T10:30:00Z",
    "read_time": 2,
    "category": "finance",
    "priority": "high",
    "data": {"nvda": "+5.2%", "msft": "+3.8%"}
  },
  {
    "id": "card_003",
    "type": "startup",
    "title": "YC Demo Day Highlights",
    "summary": "Top startups from Y Combinator showcase innovative solutions across various sectors.",
    "content": "This batch featured groundbreaking companies in healthcare, fintech, and climate tech...",
    "source": "YC News",
    "url": "https://news.ycombinator.com",
    "published_at": "2024-12-08T08:15:00Z",
    "read_time": 4,
    "category": "startups",
    "priority": "medium"
  }
]',
'{
  "total_cards": 3,
  "estimated_read_time": 9,
  "categories": ["AI", "finance", "startups"],
  "personalization_score": 0.92
}',
'{
  "generation_model": "claude-3.5-sonnet",
  "generation_time_ms": 2340,
  "sources_used": ["TechCrunch", "Bloomberg", "YC News"],
  "personalization_algorithm": "collaborative_filtering_v2"
}',
5, 180, 75.0, NOW() - INTERVAL '3 hours'),

-- Mike's briefing (general interest)
('b1a2b3c4-1234-5678-90ab-123456789002', '550e8400-e29b-41d4-a716-446655440002',
'Daily Brief: World News & Sports', 'Top stories from around the globe', CURRENT_DATE, 'published',
'[
  {
    "id": "card_004",
    "type": "news",
    "title": "Global Climate Summit Reaches Agreement",
    "summary": "World leaders commit to ambitious new climate targets at international summit.",
    "content": "In a landmark agreement, participating nations have pledged to reduce carbon emissions...",
    "source": "BBC",
    "url": "https://bbc.com/climate-summit",
    "published_at": "2024-12-08T07:00:00Z",
    "read_time": 3,
    "category": "world news",
    "priority": "high"
  },
  {
    "id": "card_005",
    "type": "sports",
    "title": "Underdog Victory in Championship Final",
    "summary": "Surprising comeback leads to historic win in season finale.",
    "content": "In a stunning turn of events, the underdog team claimed victory...",
    "source": "ESPN",
    "url": "https://espn.com/championship",
    "published_at": "2024-12-08T11:00:00Z",
    "read_time": 2,
    "category": "sports",
    "priority": "medium"
  }
]',
'{
  "total_cards": 2,
  "estimated_read_time": 5,
  "categories": ["world news", "sports"],
  "personalization_score": 0.78
}',
'{
  "generation_model": "claude-3.5-sonnet",
  "generation_time_ms": 1890,
  "sources_used": ["BBC", "ESPN"],
  "personalization_algorithm": "content_based_v1"
}',
3, 120, 60.0, NOW() - INTERVAL '2 hours'),

-- David's briefing (business focus)
('b1a2b3c4-1234-5678-90ab-123456789003', '550e8400-e29b-41d4-a716-446655440005',
'Business Intelligence: Markets & Leadership', 'Strategic insights for business leaders', CURRENT_DATE, 'published',
'[
  {
    "id": "card_006",
    "type": "business",
    "title": "Fed Announces Rate Decision Impact",
    "summary": "Federal Reserve decision sends ripples through global markets.",
    "content": "The Federal Reserve maintained interest rates steady, signaling confidence in economic recovery...",
    "source": "Financial Times",
    "url": "https://ft.com/fed-decision",
    "published_at": "2024-12-08T08:30:00Z",
    "read_time": 4,
    "category": "economics",
    "priority": "high",
    "data": {"interest_rate": "5.25-5.50%", "market_reaction": "positive"}
  },
  {
    "id": "card_007",
    "type": "leadership",
    "title": "CEO Roundtable: Innovation Strategies",
    "summary": "Top executives share insights on fostering innovation in large organizations.",
    "content": "In an exclusive roundtable, CEOs from Fortune 500 companies discussed their approaches...",
    "source": "Harvard Business Review",
    "url": "https://hbr.org/ceo-innovation",
    "published_at": "2024-12-08T06:00:00Z",
    "read_time": 6,
    "category": "leadership",
    "priority": "high"
  }
]',
'{
  "total_cards": 2,
  "estimated_read_time": 10,
  "categories": ["economics", "leadership"],
  "personalization_score": 0.95
}',
'{
  "generation_model": "claude-3.5-sonnet",
  "generation_time_ms": 2650,
  "sources_used": ["Financial Times", "Harvard Business Review"],
  "personalization_algorithm": "hybrid_v3"
}',
8, 300, 90.0, NOW() - INTERVAL '1 hour');

-- Historical briefings (yesterday and last week)
INSERT INTO briefings (id, user_id, title, subtitle, briefing_date, status, cards, metadata, view_count, read_time_seconds, completion_rate, published_at) VALUES
-- Yesterday's briefings
('b1a2b3c4-1234-5678-90ab-123456789010', '550e8400-e29b-41d4-a716-446655440001', 'Monday Market Analysis', 'Weekly market recap and outlook', CURRENT_DATE - INTERVAL '1 day', 'published',
'[{"id": "card_010", "type": "market", "title": "Weekly Market Performance", "summary": "Markets showed mixed results last week.", "read_time": 3}]',
'{"generation_model": "claude-3.5-sonnet", "generation_time_ms": 1800}', 2, 90, 50.0, NOW() - INTERVAL '1 day'),

('b1a2b3c4-1234-5678-90ab-123456789011', '550e8400-e29b-41d4-a716-446655440002', 'Sunday Sports Highlights', 'Weekend sports recap', CURRENT_DATE - INTERVAL '1 day', 'published',
'[{"id": "card_011", "type": "sports", "title": "Weekend Game Results", "summary": "Major league results from the weekend.", "read_time": 2}]',
'{"generation_model": "claude-3.5-sonnet", "generation_time_ms": 1500}', 4, 80, 100.0, NOW() - INTERVAL '1 day'),

-- Last week's briefings
('b1a2b3c4-1234-5678-90ab-123456789020', '550e8400-e29b-41d4-a716-446655440001', 'Tech Weekly Roundup', 'Best tech stories of the week', CURRENT_DATE - INTERVAL '7 days', 'published',
'[{"id": "card_020", "type": "news", "title": "Top Tech Stories This Week", "summary": "Highlights from technology sector.", "read_time": 5}]',
'{"generation_model": "claude-3.5-sonnet", "generation_time_ms": 2100}', 8, 240, 80.0, NOW() - INTERVAL '7 days');

-- ============================================================================
-- 3. USER FEEDBACK
-- ============================================================================

INSERT INTO user_feedback (id, user_id, briefing_id, card_id, feedback_type, topic, weight, reason, device_info) VALUES
-- Sarah's feedback (power user)
('f1a2b3c4-1234-5678-90ab-123456789001', '550e8400-e29b-41d4-a716-446655440001', 'b1a2b3c4-1234-5678-90ab-123456789001', 'card_001', 'like', 'AI', 1.2, 'Very relevant to my interests', '{"platform": "ios", "version": "1.2.0"}'),
('f1a2b3c4-1234-5678-90ab-123456789002', '550e8400-e29b-41d4-a716-446655440001', 'b1a2b3c4-1234-5678-90ab-123456789001', 'card_002', 'like', 'finance', 1.0, 'Good market analysis', '{"platform": "ios", "version": "1.2.0"}'),
('f1a2b3c4-1234-5678-90ab-123456789003', '550e8400-e29b-41d4-a716-446655440001', 'b1a2b3c4-1234-5678-90ab-123456789001', 'card_003', 'save', 'startups', 1.5, 'Want to reference this later', '{"platform": "ios", "version": "1.2.0"}'),

-- Mike's feedback (casual user)
('f1a2b3c4-1234-5678-90ab-123456789004', '550e8400-e29b-41d4-a716-446655440002', 'b1a2b3c4-1234-5678-90ab-123456789002', 'card_004', 'like', 'world news', 0.8, 'Important global issue', '{"platform": "android", "version": "1.1.5"}'),
('f1a2b3c4-1234-5678-90ab-123456789005', '550e8400-e29b-41d4-a716-446655440002', 'b1a2b3c4-1234-5678-90ab-123456789002', 'card_005', 'dislike', 'sports', 0.5, 'Not interested in this sport', '{"platform": "android", "version": "1.1.5"}'),

-- David's feedback (business user)
('f1a2b3c4-1234-5678-90ab-123456789006', '550e8400-e29b-41d4-a716-446655440005', 'b1a2b3c4-1234-5678-90ab-123456789003', 'card_006', 'share', 'economics', 1.3, 'Share with team', '{"platform": "web", "version": "1.2.1"}'),
('f1a2b3c4-1234-5678-90ab-123456789007', '550e8400-e29b-41d4-a716-446655440005', 'b1a2b3c4-1234-5678-90ab-123456789003', 'card_007', 'like', 'leadership', 1.4, 'Excellent insights', '{"platform": "web", "version": "1.2.1"}');

-- ============================================================================
-- 4. SAVED CARDS
-- ============================================================================

INSERT INTO saved_cards (id, user_id, briefing_id, card_id, card_content, card_title, card_summary, tags, category, saved_at, last_accessed_at) VALUES
-- Sarah's saved cards
('s1a2b3c4-1234-5678-90ab-123456789001', '550e8400-e29b-41d4-a716-446655440001', 'b1a2b3c4-1234-5678-90ab-123456789001', 'card_003',
'{"id": "card_003", "type": "startup", "title": "YC Demo Day Highlights", "summary": "Top startups from Y Combinator showcase innovative solutions", "source": "YC News", "url": "https://news.ycombinator.com", "category": "startups"}',
'YC Demo Day Highlights', 'Top startups from Y Combinator showcase innovative solutions across various sectors',
'["startups", "YC", "innovation", "investment"]', 'startups', NOW() - INTERVAL '6 hours', NOW() - INTERVAL '2 hours'),

-- Mike's saved cards
('s1a2b3c4-1234-5678-90ab-123456789002', '550e8400-e29b-41d4-a716-446655440002', 'b1a2b3c4-1234-5678-90ab-123456789002', 'card_004',
'{"id": "card_004", "type": "news", "title": "Global Climate Summit Reaches Agreement", "summary": "World leaders commit to ambitious new climate targets", "source": "BBC", "url": "https://bbc.com/climate-summit", "category": "world news"}',
'Global Climate Summit Reaches Agreement', 'World leaders commit to ambitious new climate targets at international summit',
'["climate", "environment", "policy", "global"]', 'environment', NOW() - INTERVAL '5 hours', NOW() - INTERVAL '1 hour'),

-- David's saved cards
('s1a2b3c4-1234-5678-90ab-123456789003', '550e8400-e29b-41d4-a716-446655440005', 'b1a2b3c4-1234-5678-90ab-123456789003', 'card_007',
'{"id": "card_007", "type": "leadership", "title": "CEO Roundtable: Innovation Strategies", "summary": "Top executives share insights on fostering innovation", "source": "Harvard Business Review", "url": "https://hbr.org/ceo-innovation", "category": "leadership"}',
'CEO Roundtable: Innovation Strategies', 'Top executives share insights on fostering innovation in large organizations',
'["leadership", "innovation", "strategy", "management"]', 'leadership', NOW() - INTERVAL '4 hours', NOW() - INTERVAL '30 minutes');

-- ============================================================================
-- 5. NOTIFICATION TOKENS
-- ============================================================================

INSERT INTO notification_tokens (id, user_id, token, platform, device_id, app_version, is_active, last_used_at, created_at) VALUES
-- Sarah's devices
('n1a2b3c4-1234-5678-90ab-123456789001', '550e8400-e29b-41d4-a716-446655440001', 'ios_token_sarah_iphone', 'ios', 'device_sarah_iphone', '1.2.0', TRUE, NOW() - INTERVAL '1 hour', NOW() - INTERVAL '30 days'),
('n1a2b3c4-1234-5678-90ab-123456789002', '550e8400-e29b-41d4-a716-446655440001', 'web_token_sarah_laptop', 'web', 'device_sarah_laptop', '1.2.1', TRUE, NOW() - INTERVAL '3 hours', NOW() - INTERVAL '15 days'),

-- Mike's devices
('n1a2b3c4-1234-5678-90ab-123456789003', '550e8400-e29b-41d4-a716-446655440002', 'android_token_mike_phone', 'android', 'device_mike_phone', '1.1.5', TRUE, NOW() - INTERVAL '5 hours', NOW() - INTERVAL '20 days'),

-- David's devices
('n1a2b3c4-1234-5678-90ab-123456789004', '550e8400-e29b-41d4-a716-446655440005', 'web_token_david_work', 'web', 'device_david_work', '1.2.1', TRUE, NOW() - INTERVAL '2 hours', NOW() - INTERVAL '10 days');

-- ============================================================================
-- 6. SESSIONS
-- ============================================================================

INSERT INTO sessions (id, user_id, session_token, device_fingerprint, device_info, is_active, last_activity_at, created_at, expires_at) VALUES
-- Active sessions
('ss1a2b3c4-1234-5678-90ab-123456789001', '550e8400-e29b-41d4-a716-446655440001', 'session_token_sarah_iphone', 'fp_sarah_iphone', '{"platform": "ios", "model": "iPhone 15", "os_version": "17.1"}', TRUE, NOW() - INTERVAL '30 minutes', NOW() - INTERVAL '4 hours', NOW() + INTERVAL '24 hours'),
('ss1a2b3c4-1234-5678-90ab-123456789002', '550e8400-e29b-41d4-a716-446655440002', 'session_token_mike_android', 'fp_mike_android', '{"platform": "android", "model": "Pixel 8", "os_version": "14"}', TRUE, NOW() - INTERVAL '2 hours', NOW() - INTERVAL '8 hours', NOW() + INTERVAL '16 hours'),
('ss1a2b3c4-1234-5678-90ab-123456789003', '550e8400-e29b-41d4-a716-446655440005', 'session_token_david_web', 'fp_david_web', '{"platform": "web", "browser": "Chrome", "version": "119"}', TRUE, NOW() - INTERVAL '1 hour', NOW() - INTERVAL '3 hours', NOW() + INTERVAL '21 hours'),

-- Expired sessions
('ss1a2b3c4-1234-5678-90ab-123456789004', '550e8400-e29b-41d4-a716-446655440001', 'session_token_sarah_old', 'fp_sarah_tablet', '{"platform": "ios", "model": "iPad"}', FALSE, NOW() - INTERVAL '2 days', NOW() - INTERVAL '5 days', NOW() - INTERVAL '1 day');

-- ============================================================================
-- 7. AUDIT LOGS
-- ============================================================================

INSERT INTO audit_logs (id, user_id, action, table_name, record_id, old_values, new_values, ip_address, user_agent, created_at) VALUES
-- User actions
('a1a2b3c4-1234-5678-90ab-123456789001', '550e8400-e29b-41d4-a716-446655440001', 'create', 'users', '550e8400-e29b-41d4-a716-446655440001', NULL, '{"email": "sarah.johnson@example.com", "status": "onboarding"}', '192.168.1.100', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X)', NOW() - INTERVAL '30 days'),
('a1a2b3c4-1234-5678-90ab-123456789002', '550e8400-e29b-41d4-a716-446655440001', 'update', 'users', '550e8400-e29b-41d4-a716-446655440001', '{"status": "onboarding"}', '{"status": "active", "onboarding_step": 5}', '192.168.1.100', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X)', NOW() - INTERVAL '29 days'),

-- Briefing actions
('a1a2b3c4-1234-5678-90ab-123456789003', '550e8400-e29b-41d4-a716-446655440001', 'create', 'briefings', 'b1a2b3c4-1234-5678-90ab-123456789001', NULL, '{"title": "Tech Tuesday: AI Advances", "status": "draft"}', '192.168.1.100', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X)', NOW() - INTERVAL '1 day'),
('a1a2b3c4-1234-5678-90ab-123456789004', '550e8400-e29b-41d4-a716-446655440001', 'update', 'briefings', 'b1a2b3c4-1234-5678-90ab-123456789001', '{"status": "draft"}', '{"status": "published"}', '192.168.1.100', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X)', NOW() - INTERVAL '3 hours'),

-- Feedback actions
('a1a2b3c4-1234-5678-90ab-123456789005', '550e8400-e29b-41d4-a716-446655440001', 'create', 'user_feedback', 'f1a2b3c4-1234-5678-90ab-123456789001', NULL, '{"feedback_type": "like", "weight": 1.2}', '192.168.1.100', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X)', NOW() - INTERVAL '6 hours');

-- ============================================================================
-- 8. ANALYTICS EVENTS
-- ============================================================================

INSERT INTO analytics_events (id, user_id, session_id, event_type, event_name, properties, duration_ms, created_at) VALUES
-- App usage events
('e1a2b3c4-1234-5678-90ab-123456789001', '550e8400-e29b-41d4-a716-446655440001', 'ss1a2b3c4-1234-5678-90ab-123456789001', 'app_open', 'app_launched', '{"source": "push_notification", "time_of_day": "07:30"}', NULL, NOW() - INTERVAL '4 hours'),
('e1a2b3c4-1234-5678-90ab-123456789002', '550e8400-e29b-41d4-a716-446655440001', 'ss1a2b3c4-1234-5678-90ab-123456789001', 'briefing_view', 'briefing_opened', '{"briefing_id": "b1a2b3c4-1234-5678-90ab-123456789001", "cards_count": 3}', 150, NOW() - INTERVAL '3.5 hours'),
('e1a2b3c4-1234-5678-90ab-123456789003', '550e8400-e29b-41d4-a716-446655440001', 'ss1a2b3c4-1234-5678-90ab-123456789001', 'card_interaction', 'card_liked', '{"card_id": "card_001", "feedback_type": "like"}', 50, NOW() - INTERVAL '3 hours'),
('e1a2b3c4-1234-5678-90ab-123456789004', '550e8400-e29b-41d4-a716-446655440001', 'ss1a2b3c4-1234-5678-90ab-123456789001', 'card_interaction', 'card_saved', '{"card_id": "card_003", "feedback_type": "save"}', 75, NOW() - INTERVAL '2.5 hours'),

-- Mike's events
('e1a2b3c4-1234-5678-90ab-123456789005', '550e8400-e29b-41d4-a716-446655440002', 'ss1a2b3c4-1234-5678-90ab-123456789002', 'app_open', 'app_launched', '{"source": "direct", "time_of_day": "08:15"}', NULL, NOW() - INTERVAL '8 hours'),
('e1a2b3c4-1234-5678-90ab-123456789006', '550e8400-e29b-41d4-a716-446655440002', 'ss1a2b3c4-1234-5678-90ab-123456789002', 'briefing_view', 'briefing_completed', '{"briefing_id": "b1a2b3c4-1234-5678-90ab-123456789002", "completion_rate": 100}', 300, NOW() - INTERVAL '6 hours'),

-- Performance events
('e1a2b3c4-1234-5678-90ab-123456789007', NULL, NULL, 'performance', 'briefing_generation', '{"user_id": "550e8400-e29b-41d4-a716-446655440001", "cards_generated": 3, "model": "claude-3.5-sonnet"}', 2340, NOW() - INTERVAL '1 day'),
('e1a2b3c4-1234-5678-90ab-123456789008', NULL, NULL, 'performance', 'personalization', '{"algorithm": "collaborative_filtering_v2", "personalization_score": 0.92}', 450, NOW() - INTERVAL '1 day');

-- Output summary statistics
DO $$
DECLARE
    user_count INTEGER;
    briefing_count INTEGER;
    feedback_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO user_count FROM users;
    SELECT COUNT(*) INTO briefing_count FROM briefings;
    SELECT COUNT(*) INTO feedback_count FROM user_feedback;

    RAISE NOTICE 'Seed data loaded successfully:';
    RAISE NOTICE 'Users: %', user_count;
    RAISE NOTICE 'Briefings: %', briefing_count;
    RAISE NOTICE 'Feedback entries: %', feedback_count;
END $$;