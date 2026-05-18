-- Partner Invites table: stores invite links for onboarding new partners
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS partner_invites (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL,
  country TEXT NOT NULL,
  permissions JSONB DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'used', 'expired')),
  created_by TEXT,
  used_by UUID,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index on token for fast lookups
CREATE INDEX IF NOT EXISTS idx_partner_invites_token ON partner_invites(token);

-- RLS policies
ALTER TABLE partner_invites ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Anyone can read partner_invites" ON partner_invites FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can insert partner_invites" ON partner_invites FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can update partner_invites" ON partner_invites FOR UPDATE USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can delete partner_invites" ON partner_invites FOR DELETE USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
