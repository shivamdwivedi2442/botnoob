-- User Roles & Bot Enums
CREATE TYPE user_role AS ENUM ('user', 'employee', 'super_admin');
CREATE TYPE bot_platform AS ENUM ('telegram', 'discord');
CREATE TYPE bot_status AS ENUM ('active', 'paused', 'banned');

-- Users Table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role user_role DEFAULT 'user',
    plan_tier TEXT DEFAULT 'free_byok',
    is_banned BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Refresh Tokens Table (For Rotation & Revocation)
CREATE TABLE refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    token TEXT UNIQUE NOT NULL,
    revoked BOOLEAN DEFAULT false,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Bots Table (Telegram & Discord)
CREATE TABLE bots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name TEXT DEFAULT 'Untitled Bot',
    platform bot_platform NOT NULL,
    github_repo_url TEXT,
    encrypted_bot_token TEXT NOT NULL,
    encrypted_env_vars TEXT,
    custom_code TEXT,
    status bot_status DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Bot Collaborators Table
CREATE TABLE bot_collaborators (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bot_id UUID REFERENCES bots(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'editor',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(bot_id, user_id)
);

-- User AI Keys (BYOK & MCP) Table
CREATE TABLE user_ai_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL, -- 'openai', 'anthropic', 'google'
    encrypted_key TEXT NOT NULL,
    mcp_tokens JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Pricing Configs Table (Controlled by Super Admin)
CREATE TABLE pricing_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_name TEXT UNIQUE NOT NULL,
    price_monthly NUMERIC NOT NULL,
    max_bots INT NOT NULL DEFAULT 10,
    features JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Discount Coupons Table
CREATE TABLE discount_coupons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL,
    discount_percent NUMERIC NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true
);

-- Support Tickets Table
CREATE TABLE support_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    subject TEXT NOT NULL,
    message TEXT DEFAULT '',
    status TEXT DEFAULT 'open',
    priority TEXT DEFAULT 'medium',
    replies JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- SwiftUPI Transactions Table
CREATE TABLE swiftupi_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    amount NUMERIC NOT NULL,
    status TEXT DEFAULT 'pending',
    upi_id TEXT,
    transaction_ref TEXT UNIQUE,
    plan_name TEXT,
    gateway_payment_id TEXT,
    coupon_code TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Performance Indexes (B-Tree & Composite)
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id, revoked);
CREATE INDEX idx_bots_owner_id ON bots(owner_id);
CREATE INDEX idx_bots_status ON bots(status);
CREATE INDEX idx_bot_collaborators_bot_id ON bot_collaborators(bot_id);
CREATE INDEX idx_bot_collaborators_user_id ON bot_collaborators(user_id);
CREATE INDEX idx_user_ai_keys_user_id ON user_ai_keys(user_id);
CREATE INDEX idx_support_tickets_user_id ON support_tickets(user_id);
CREATE INDEX idx_support_tickets_status ON support_tickets(status);
CREATE INDEX idx_swiftupi_tx_user_status ON swiftupi_transactions(user_id, status);
CREATE INDEX idx_swiftupi_tx_gateway_payment ON swiftupi_transactions(gateway_payment_id);

-- Zero-Knowledge Employee View (Strictly hides encrypted_bot_token)
CREATE VIEW employee_bot_overview AS
SELECT 
    b.id AS bot_id,
    b.name AS bot_name,
    b.platform,
    b.status,
    b.created_at,
    u.email AS owner_email,
    u.plan_tier,
    u.is_banned
FROM bots b
JOIN users u ON b.owner_id = u.id;

-- Enable Row Level Security (RLS)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE bots ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_collaborators ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_ai_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE swiftupi_transactions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY user_read_own ON users FOR SELECT USING (auth.uid() = id);

CREATE POLICY owner_all_bots ON bots FOR ALL 
USING (owner_id = auth.uid());

CREATE POLICY collaborator_view_bots ON bots FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM bot_collaborators 
        WHERE bot_collaborators.bot_id = bots.id 
        AND bot_collaborators.user_id = auth.uid()
    )
);

CREATE POLICY owner_all_ai_keys ON user_ai_keys FOR ALL 
USING (user_id = auth.uid());

CREATE POLICY user_own_tickets ON support_tickets FOR ALL
USING (user_id = auth.uid());

CREATE POLICY user_view_own_tx ON swiftupi_transactions FOR SELECT
USING (user_id = auth.uid());

-- Seed Default Pricing Plans
INSERT INTO pricing_configs (plan_name, price_monthly, max_bots, features) VALUES
('free_byok', 0, 10, '{"byok": true, "mcp": true, "auto_sleep": true}'),
('byok_pro', 299, 25, '{"byok": true, "mcp": true, "uptime_24_7": true, "upi_webhooks": true}'),
('botnoob_ultra', 999, 100, '{"built_in_ai": true, "byok": true, "priority_cpu": true, "uptime_24_7": true}')
ON CONFLICT (plan_name) DO NOTHING;
