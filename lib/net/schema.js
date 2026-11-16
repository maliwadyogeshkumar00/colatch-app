// Postgres schema for Colatch Connect network (ported from the D1 build). Run once, idempotent.
export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS creators (
  id TEXT PRIMARY KEY,
  handle TEXT UNIQUE NOT NULL,
  name TEXT,
  niche TEXT,
  city TEXT,
  state TEXT,
  language TEXT,
  gender TEXT,
  skills TEXT,
  bio_pitch TEXT,
  portfolio_links TEXT,
  open_to_barter INTEGER NOT NULL DEFAULT 0,
  quality_score INTEGER,
  verified INTEGER NOT NULL DEFAULT 0,
  followers INTEGER,
  following INTEGER,
  media_count INTEGER,
  avg_likes DOUBLE PRECISION,
  avg_comments DOUBLE PRECISION,
  avg_views DOUBLE PRECISION,
  engagement_rate DOUBLE PRECISION,
  bio TEXT,
  profile_pic TEXT,
  website TEXT,
  email TEXT,
  phone TEXT,
  rate_reel INTEGER,
  rate_story INTEGER,
  rate_post INTEGER,
  tier TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  tags TEXT,
  notes TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  last_synced_at TEXT,
  created_at TEXT NOT NULL DEFAULT (to_char(now() at time zone 'utc','YYYY-MM-DD HH24:MI:SS')),
  updated_at TEXT NOT NULL DEFAULT (to_char(now() at time zone 'utc','YYYY-MM-DD HH24:MI:SS')),
  verify_code TEXT,
  owner_verified INTEGER NOT NULL DEFAULT 0,
  upi_id TEXT,
  pan_name TEXT,
  pan_last4 TEXT,
  gstin TEXT
)`,
  `CREATE TABLE IF NOT EXISTS creator_deals (
  id TEXT PRIMARY KEY,
  creator_id TEXT NOT NULL,
  campaign_id TEXT,
  brand TEXT,
  deliverable TEXT,
  stage TEXT NOT NULL DEFAULT 'shortlisted',
  fee INTEGER,
  expected_views INTEGER,
  actual_views INTEGER,
  post_url TEXT,
  go_live_date TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (to_char(now() at time zone 'utc','YYYY-MM-DD HH24:MI:SS')),
  updated_at TEXT NOT NULL DEFAULT (to_char(now() at time zone 'utc','YYYY-MM-DD HH24:MI:SS')),
  application_id TEXT,
  pay_status TEXT NOT NULL DEFAULT 'unfunded',
  funded_at TEXT,
  paid_at TEXT,
  utr TEXT,
  tds_amount INTEGER,
  sow_accepted_at TEXT,
  revisions_included INTEGER NOT NULL DEFAULT 2,
  revisions_used INTEGER NOT NULL DEFAULT 0,
  draft_url TEXT,
  draft_status TEXT NOT NULL DEFAULT 'none',
  draft_submitted_at TEXT,
  auto_approve_at TEXT,
  checklist_json TEXT,
  live_at TEXT,
  track_code TEXT,
  clicks INTEGER NOT NULL DEFAULT 0,
  orders INTEGER,
  likes INTEGER,
  comments INTEGER,
  market_rate INTEGER,
  reward_value INTEGER,
  sales_value INTEGER,
  brand_signoff_at TEXT,
  proof_public INTEGER NOT NULL DEFAULT 0
)`,
  `CREATE TABLE IF NOT EXISTS profile_reviews (
  id TEXT PRIMARY KEY,
  creator_id TEXT,
  handle TEXT NOT NULL,
  score INTEGER,
  summary TEXT,
  report_json TEXT,
  engine TEXT,
  created_at TEXT NOT NULL DEFAULT (to_char(now() at time zone 'utc','YYYY-MM-DD HH24:MI:SS'))
)`,
  `CREATE TABLE IF NOT EXISTS creator_accounts (
  id TEXT PRIMARY KEY,
  creator_id TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (to_char(now() at time zone 'utc','YYYY-MM-DD HH24:MI:SS')),
  last_login_at TEXT
)`,
  `CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  brand TEXT,
  brief TEXT,
  raw_brief TEXT,
  deliverables TEXT,
  talent_types TEXT,
  niche TEXT,
  city TEXT,
  languages TEXT,
  gender TEXT,
  min_followers INTEGER,
  max_followers INTEGER,
  creators_needed INTEGER,
  budget_note TEXT,
  budget_total INTEGER,
  deadline TEXT,
  shoot_date TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  source TEXT NOT NULL DEFAULT 'team',
  client_name TEXT,
  client_company TEXT,
  client_email TEXT,
  client_phone TEXT,
  ai_notes TEXT,
  is_open INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (to_char(now() at time zone 'utc','YYYY-MM-DD HH24:MI:SS')),
  pay_type TEXT NOT NULL DEFAULT 'cash',
  revisions INTEGER NOT NULL DEFAULT 2,
  usage_rights TEXT,
  payment_days INTEGER NOT NULL DEFAULT 30,
  share_token TEXT,
  mandatories TEXT,
  exclusions TEXT,
  brand_url TEXT,
  promised_cpv DOUBLE PRECISION,
  shortlist_due TEXT,
  approve_hours INTEGER NOT NULL DEFAULT 72,
  brand_category TEXT,
  reward_value INTEGER,
  commission_pct DOUBLE PRECISION,
  funded INTEGER NOT NULL DEFAULT 0,
  ref_code TEXT
)`,
  `CREATE TABLE IF NOT EXISTS campaign_applications (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  creator_id TEXT,
  handle TEXT NOT NULL,
  name TEXT,
  email TEXT,
  phone TEXT,
  city TEXT,
  followers INTEGER,
  rate_quote INTEGER,
  pitch TEXT,
  match_score INTEGER,
  match_reasons TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  created_at TEXT NOT NULL DEFAULT (to_char(now() at time zone 'utc','YYYY-MM-DD HH24:MI:SS')),
  client_decision TEXT,
  client_note TEXT,
  team_note TEXT,
  reject_reason TEXT
)`,
  `CREATE TABLE IF NOT EXISTS ig_automations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  "trigger" TEXT NOT NULL DEFAULT 'comment',
  keywords TEXT NOT NULL,
  media_id TEXT,
  comment_reply TEXT,
  dm_message TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  fired INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (to_char(now() at time zone 'utc','YYYY-MM-DD HH24:MI:SS'))
)`,
  `CREATE TABLE IF NOT EXISTS ig_events (
  id TEXT PRIMARY KEY,
  automation_id TEXT,
  kind TEXT,
  from_username TEXT,
  text TEXT,
  result TEXT,
  created_at TEXT NOT NULL DEFAULT (to_char(now() at time zone 'utc','YYYY-MM-DD HH24:MI:SS'))
)`,
  `CREATE TABLE IF NOT EXISTS deal_events (
  id TEXT PRIMARY KEY,
  deal_id TEXT NOT NULL,
  actor TEXT NOT NULL,
  kind TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (to_char(now() at time zone 'utc','YYYY-MM-DD HH24:MI:SS'))
)`,
  `CREATE TABLE IF NOT EXISTS ratings (
  id TEXT PRIMARY KEY,
  deal_id TEXT NOT NULL,
  by_side TEXT NOT NULL,
  stars INTEGER NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (to_char(now() at time zone 'utc','YYYY-MM-DD HH24:MI:SS'))
)`,
  `CREATE TABLE IF NOT EXISTS referral_codes (
  code TEXT PRIMARY KEY,
  owner_type TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  owner_name TEXT,
  created_at TEXT NOT NULL DEFAULT (to_char(now() at time zone 'utc','YYYY-MM-DD HH24:MI:SS'))
)`,
  `CREATE TABLE IF NOT EXISTS referrals (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  referred_type TEXT NOT NULL,
  referred_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (to_char(now() at time zone 'utc','YYYY-MM-DD HH24:MI:SS'))
)`,
  `CREATE TABLE IF NOT EXISTS referral_earnings (
  id TEXT PRIMARY KEY,
  referral_id TEXT NOT NULL,
  deal_id TEXT,
  owner_type TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  kind TEXT NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (to_char(now() at time zone 'utc','YYYY-MM-DD HH24:MI:SS'))
)`,
  `CREATE TABLE IF NOT EXISTS team_users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  created_at TEXT NOT NULL DEFAULT (to_char(now() at time zone 'utc','YYYY-MM-DD HH24:MI:SS')),
  last_login_at TEXT
)`,
  `CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
)`,
  `CREATE INDEX IF NOT EXISTS idx_creators_niche ON creators(niche)`,
  `CREATE INDEX IF NOT EXISTS idx_creators_city ON creators(city)`,
  `CREATE INDEX IF NOT EXISTS idx_creators_followers ON creators(followers)`,
  `CREATE INDEX IF NOT EXISTS idx_deals_creator ON creator_deals(creator_id)`,
  `CREATE INDEX IF NOT EXISTS idx_deals_stage ON creator_deals(stage)`,
  `CREATE INDEX IF NOT EXISTS idx_reviews_handle ON profile_reviews(handle)`,
  `CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status)`,
  `CREATE INDEX IF NOT EXISTS idx_apps_campaign ON campaign_applications(campaign_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_apps_unique ON campaign_applications(campaign_id, handle)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_deals_track ON creator_deals(track_code)`,
  `CREATE INDEX IF NOT EXISTS idx_events_deal ON deal_events(deal_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_ratings_once ON ratings(deal_id, by_side)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_refcode_owner ON referral_codes(owner_type, owner_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_referred_once ON referrals(referred_type, referred_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_earning_once ON referral_earnings(referral_id, deal_id, reason)`
];

// v2 — growth layer: creator pitches (reverse briefs). ALTERs use IF NOT EXISTS so re-running is safe.
SCHEMA.push(
  `CREATE TABLE IF NOT EXISTS creator_pitches (
  id TEXT PRIMARY KEY,
  creator_id TEXT NOT NULL,
  title TEXT NOT NULL,
  idea TEXT NOT NULL,
  category TEXT,
  format TEXT,
  occasion TEXT,
  price INTEGER,
  status TEXT NOT NULL DEFAULT 'live',
  requests INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (to_char(now() at time zone 'utc','YYYY-MM-DD HH24:MI:SS'))
)`,
  `CREATE INDEX IF NOT EXISTS idx_pitches_status ON creator_pitches(status)`,
  `ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS pitch_id TEXT`,
  `ALTER TABLE creators ADD COLUMN IF NOT EXISTS show_earnings INTEGER NOT NULL DEFAULT 0`
);

// v3 — "Build first" batch from the 100-feature plan.
SCHEMA.push(
  `ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS featured_until TEXT`,
  `ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS rush INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS brand_verified INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS held_reason TEXT`,
  `ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS brief_score INTEGER`,
  `CREATE TABLE IF NOT EXISTS bypass_reports (
  id TEXT PRIMARY KEY,
  deal_id TEXT,
  campaign_id TEXT,
  reporter_side TEXT NOT NULL,
  reporter_id TEXT,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL DEFAULT (to_char(now() at time zone 'utc','YYYY-MM-DD HH24:MI:SS'))
)`,
  `CREATE TABLE IF NOT EXISTS brand_roster (
  id TEXT PRIMARY KEY,
  brand_email TEXT NOT NULL,
  creator_id TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (to_char(now() at time zone 'utc','YYYY-MM-DD HH24:MI:SS'))
)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_roster_once ON brand_roster(brand_email, creator_id)`
);

// ---------------------------------------------------------------------------------------------
// Versioned migrations (v4 onward). Each runs once, inside a transaction, in order.
// Never edit a migration that has shipped; add a new one.
export const MIGRATIONS = [
  {
    version: 4,
    note: "Production hardening: roles, session revocation, login throttling, password resets, audit log, finance ledger, notification outbox, integrity constraints",
    statements: [
      // Team roles: owner > admin > finance / shortlist > viewer. The first account keeps full rights.
      `UPDATE team_users SET role='owner' WHERE id = (SELECT id FROM team_users ORDER BY created_at ASC LIMIT 1) AND role='admin'`,
      `ALTER TABLE team_users ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 1`,
      `ALTER TABLE team_users ADD COLUMN IF NOT EXISTS disabled_at TEXT`,
      `ALTER TABLE creator_accounts ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 1`,
      `ALTER TABLE creator_accounts ADD COLUMN IF NOT EXISTS email_verified_at TEXT`,
      `CREATE TABLE IF NOT EXISTS login_attempts (
        id BIGSERIAL PRIMARY KEY,
        key TEXT NOT NULL,
        ok INTEGER NOT NULL DEFAULT 0,
        at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`,
      `CREATE INDEX IF NOT EXISTS idx_login_attempts_key_at ON login_attempts(key, at)`,
      `CREATE TABLE IF NOT EXISTS password_resets (
        token_hash TEXT PRIMARY KEY,
        user_kind TEXT NOT NULL CHECK (user_kind IN ('creator','team')),
        user_id TEXT NOT NULL,
        created_by TEXT,
        expires_at TIMESTAMPTZ NOT NULL,
        used_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS audit_log (
        id BIGSERIAL PRIMARY KEY,
        at TIMESTAMPTZ NOT NULL DEFAULT now(),
        actor_kind TEXT NOT NULL,
        actor_id TEXT,
        action TEXT NOT NULL,
        entity TEXT,
        entity_id TEXT,
        detail JSONB
      )`,
      `CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity, entity_id)`,
      // Money: append-only ledger in paise. A record exists only when a person confirmed a real transfer.
      `CREATE TABLE IF NOT EXISTS finance_ledger (
        id BIGSERIAL PRIMARY KEY,
        at TIMESTAMPTZ NOT NULL DEFAULT now(),
        kind TEXT NOT NULL CHECK (kind IN ('brand_payment_received','creator_payout_sent','brand_refund_sent','referral_payout_sent','adjustment')),
        campaign_id TEXT,
        deal_id TEXT,
        amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
        tds_paise BIGINT NOT NULL DEFAULT 0 CHECK (tds_paise >= 0),
        utr TEXT,
        method TEXT,
        note TEXT,
        actor_id TEXT NOT NULL,
        idempotency_key TEXT NOT NULL UNIQUE
      )`,
      `CREATE INDEX IF NOT EXISTS idx_ledger_deal ON finance_ledger(deal_id)`,
      `CREATE INDEX IF NOT EXISTS idx_ledger_campaign ON finance_ledger(campaign_id)`,
      // One payout and one brand payment per deal; the same bank reference can't be used twice.
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_one_payout ON finance_ledger(deal_id) WHERE kind='creator_payout_sent'`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_one_funding ON finance_ledger(deal_id) WHERE kind='brand_payment_received' AND deal_id IS NOT NULL`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_utr ON finance_ledger(kind, utr) WHERE utr IS NOT NULL AND utr <> ''`,
      `CREATE OR REPLACE FUNCTION ledger_append_only() RETURNS trigger AS $$
       BEGIN RAISE EXCEPTION 'finance_ledger is append-only'; END; $$ LANGUAGE plpgsql`,
      `DROP TRIGGER IF EXISTS trg_ledger_append_only ON finance_ledger`,
      `CREATE TRIGGER trg_ledger_append_only BEFORE UPDATE OR DELETE ON finance_ledger FOR EACH ROW EXECUTE FUNCTION ledger_append_only()`,
      // Notification outbox. Nothing is marked sent unless the provider accepted it.
      `CREATE TABLE IF NOT EXISTS notifications (
        id BIGSERIAL PRIMARY KEY,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        channel TEXT NOT NULL CHECK (channel IN ('email','whatsapp')),
        to_kind TEXT NOT NULL,
        to_id TEXT,
        to_address TEXT,
        template TEXT NOT NULL,
        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        dedupe_key TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','failed','not_configured','skipped')),
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        sent_at TIMESTAMPTZ
      )`,
      `CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status, created_at)`,
      // Integrity: one deal per application, one application per creator per campaign.
      // Created only if existing rows already satisfy it; otherwise the live site keeps running and
      // the conflict is listed under app_settings 'migration_warnings' for the team to resolve by hand.
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM creator_deals WHERE application_id IS NOT NULL GROUP BY application_id HAVING COUNT(*) > 1) THEN CREATE UNIQUE INDEX IF NOT EXISTS idx_deals_one_per_application ON creator_deals(application_id) WHERE application_id IS NOT NULL; ELSE INSERT INTO app_settings (key, value) VALUES ('migration_warnings', 'duplicates block idx_deals_one_per_application') ON CONFLICT (key) DO UPDATE SET value = app_settings.value || '; duplicates block idx_deals_one_per_application'; END IF; END $$`,
      // Created only if existing rows already satisfy it; otherwise the live site keeps running and
      // the conflict is listed under app_settings 'migration_warnings' for the team to resolve by hand.
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM campaign_applications WHERE creator_id IS NOT NULL GROUP BY campaign_id, creator_id HAVING COUNT(*) > 1) THEN CREATE UNIQUE INDEX IF NOT EXISTS idx_apps_one_per_creator ON campaign_applications(campaign_id, creator_id) WHERE creator_id IS NOT NULL; ELSE INSERT INTO app_settings (key, value) VALUES ('migration_warnings', 'duplicates block idx_apps_one_per_creator') ON CONFLICT (key) DO UPDATE SET value = app_settings.value || '; duplicates block idx_apps_one_per_creator'; END IF; END $$`,
      // One off-platform report per deal per side, ever, so a bounty can't be earned twice on one deal.
      // Created only if existing rows already satisfy it; otherwise the live site keeps running and
      // the conflict is listed under app_settings 'migration_warnings' for the team to resolve by hand.
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM bypass_reports WHERE deal_id IS NOT NULL GROUP BY deal_id, reporter_side HAVING COUNT(*) > 1) THEN CREATE UNIQUE INDEX IF NOT EXISTS idx_bypass_once ON bypass_reports(deal_id, reporter_side) WHERE deal_id IS NOT NULL; ELSE INSERT INTO app_settings (key, value) VALUES ('migration_warnings', 'duplicates block idx_bypass_once') ON CONFLICT (key) DO UPDATE SET value = app_settings.value || '; duplicates block idx_bypass_once'; END IF; END $$`,
      // Prices are frozen when the brand pays, so receipts and reports never change afterwards.
      `ALTER TABLE creator_deals ADD COLUMN IF NOT EXISTS fee_pct NUMERIC(5,2)`,
      `ALTER TABLE creator_deals ADD COLUMN IF NOT EXISTS brand_paid_paise BIGINT`,
      // Someone joining with the handle of a creator Colatch already imported gets a pending claim:
      // no access to that creator's deals or payout details until the team verifies ownership.
      `ALTER TABLE creator_accounts ADD COLUMN IF NOT EXISTS claim_status TEXT NOT NULL DEFAULT 'own'`,
      `ALTER TABLE creator_accounts ADD COLUMN IF NOT EXISTS claim_verified_by TEXT`,
      `CREATE INDEX IF NOT EXISTS idx_deals_campaign ON creator_deals(campaign_id)`,
      `CREATE INDEX IF NOT EXISTS idx_apps_creator ON campaign_applications(creator_id)`,
      `CREATE INDEX IF NOT EXISTS idx_campaigns_token ON campaigns(share_token)`,
      `CREATE INDEX IF NOT EXISTS idx_earnings_owner ON referral_earnings(owner_type, owner_id)`,
    ],
  },
  {
    version: 5,
    note: "Brand accounts, email verification, disputes, creator uploads, app error log. Additive only: nothing dropped or rewritten.",
    statements: [
      `CREATE TABLE IF NOT EXISTS brand_accounts (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        name TEXT,
        company TEXT,
        phone TEXT,
        website TEXT,
        gstin TEXT,
        session_version INTEGER NOT NULL DEFAULT 1,
        email_verified_at TIMESTAMPTZ,
        verified_by TEXT,
        disabled_at TIMESTAMPTZ,
        last_login_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`,
      `ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS brand_account_id TEXT`,
      `CREATE INDEX IF NOT EXISTS idx_campaigns_brand_account ON campaigns(brand_account_id)`,
      `CREATE INDEX IF NOT EXISTS idx_campaigns_client_email ON campaigns(LOWER(client_email))`,
      // Password resets now also serve brand accounts.
      `ALTER TABLE password_resets DROP CONSTRAINT IF EXISTS password_resets_user_kind_check`,
      `ALTER TABLE password_resets ADD CONSTRAINT password_resets_user_kind_check CHECK (user_kind IN ('creator','team','brand'))`,
      // One-time email verification links (only the hash is stored).
      `CREATE TABLE IF NOT EXISTS email_verifications (
        token_hash TEXT PRIMARY KEY,
        user_kind TEXT NOT NULL CHECK (user_kind IN ('creator','brand')),
        user_id TEXT NOT NULL,
        email TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        used_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`,
      // Disputes on a deal, raised by creator, brand or team; resolved by the team with a written outcome.
      `CREATE TABLE IF NOT EXISTS disputes (
        id TEXT PRIMARY KEY,
        deal_id TEXT NOT NULL,
        raised_by_kind TEXT NOT NULL CHECK (raised_by_kind IN ('creator','brand','team')),
        raised_by_id TEXT,
        reason TEXT NOT NULL,
        detail TEXT,
        status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','rejected')),
        resolution TEXT,
        resolved_by TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        resolved_at TIMESTAMPTZ
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_dispute_one_open ON disputes(deal_id, raised_by_kind) WHERE status = 'open'`,
      // Files creators upload for their portfolio (stored in Vercel Blob when it is configured).
      `CREATE TABLE IF NOT EXISTS creator_media (
        id TEXT PRIMARY KEY,
        creator_id TEXT NOT NULL,
        url TEXT NOT NULL,
        content_type TEXT NOT NULL,
        bytes INTEGER NOT NULL,
        caption TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`,
      `CREATE INDEX IF NOT EXISTS idx_creator_media_creator ON creator_media(creator_id)`,
      // Server errors, so problems are visible to the team instead of only in hosting logs.
      `CREATE TABLE IF NOT EXISTS app_errors (
        id BIGSERIAL PRIMARY KEY,
        at TIMESTAMPTZ NOT NULL DEFAULT now(),
        source TEXT NOT NULL,
        message TEXT NOT NULL,
        digest TEXT,
        detail JSONB
      )`,
      `CREATE INDEX IF NOT EXISTS idx_app_errors_at ON app_errors(at)`,
    ],
  },
];
