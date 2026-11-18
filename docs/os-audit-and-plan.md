# Colatch Connect: audit and build plan for the creator-economy operating system

18 Nov 2026. Based on the code in `maliwadyogeshkumar00/colatch-app` (branch chain hardening → screens-v2, PR #5), the live app at colatch-app.vercel.app and the prototype at colatch-connect.pages.dev.

## 1. What actually exists today

There are three different things, and they are easy to confuse.

| | What it is | Real data? | Live? |
|---|---|---|---|
| **Live app** (colatch-app.vercel.app) | Celebrity matcher + a static Connect page (`/connect`, plain HTML). Deployed from branch `wireframe-v1`. | Matcher yes; `/connect` is static | Yes |
| **Prototype** (colatch-connect.pages.dev) | One HTML file, 3 views (Team, Brand, Creator), invented sample data, clicks stored in the viewer's browser only | No, all sample | Yes |
| **Connect app in code** (PR #5) | Next.js 14 + Postgres (Neon). 66 pages and endpoints, 37 tables, 37 server libraries; 94 unit, 53 integration and 40 browser tests (110 unit with the new Money Flow tests) | Yes, real database | **No.** PR #5 is not merged; the hardening chain is not in `main` either |

`main` is stale (last commits 17 Aug 2026, 109 files behind `wireframe-v1`). Production has been deployed from branches, not from `main`.

## 2. Audit of the real Connect app (PR #5)

### Works (backed by database and tests)
- Three separate logins: team (roles owner / admin / finance / shortlist / viewer), creator, brand. PBKDF2 passwords, signed cookies, sign-out-everywhere, login throttling, password reset, email verification.
- Creators table, creator profile, media kit (`/m/[handle]`), audience self-reported, other platforms, lookalike search.
- Public brief form (`/brief`) → campaign → applications → shortlist link for the client → approve/pass → deal.
- Deal room: statement of work, draft upload and revisions, go-live, tracked link, messages with contact-detail scrubbing, gifting shipments, usage-rights expiry.
- Money: append-only ledger in paise, a record only when a person confirms a real transfer; disputes; finance export.
- Colatch Score with explained parts (every point traced to a verified event).
- Audit log, notification outbox (email via Resend when configured), daily scheduled job, signed outgoing webhooks.

### Partial
- **Brief builder**: one public form with 20 fields. Missing: objective/KPIs, platforms, tiers, engagement floor, audience demographics, per-deliverable counts, whitelisting, approval/publication deadlines, gifting, budget per creator, payment terms, attachments, drafts, templates, duplicate, private invites, proposals and comparison, AI brief assistant.
- **Brand workspace**: home, settings, shortlist links, receipts. No discovery, no team members, no multiple brands per company, no invoices, no analytics/ROI.
- **Creator workspace**: home, profile, applications, deals, earnings, score, pitch, settings. No calendar, deliverables board, invoices, tax documents, opportunity matching by availability, appeal of score.
- **Negotiation**: messages exist, but no structured offers, counter-offers or agreed-terms record.
- **Social data**: Instagram code exists (`lib/net/meta.ts`) but is not connected (needs a Meta app). Metrics today are manual or self-reported and should be labelled that way everywhere.

### Only in the prototype (visual, sample data)
Wallet, inbox across deals, content library with approve/request changes, reports and leaderboard, invoices, calendar, earnings wallet activity, 8–9 item navigation per role.

### Missing
Agencies (brand-side, creator-side, hybrid); Relationship Manager role and workspace; tickets with SLA; organisations and team members for brands; multi-currency, countries, time zones, languages; contract templates and e-signature; payment gateway, escrow, milestone and partial payments, refunds, chargebacks; configurable commission rules; Campaign DNA; Relationship Graph; Creator Passport; Deal Health; notification preferences.

### Duplicated
- Three account tables (`team_users`, `brand_accounts`, `creator_accounts`) each with their own password and session code. Adding agencies and RMs as a 4th and 5th copy would be the wrong move.
- Three money paths: `quote()` in `deal.ts`, `priceDeal()` in `pricing.ts`, and page-level arithmetic. All must go through one engine.

### Technically fragile
- **Shared database**: Vercel previews and production use the same Neon database; opening a preview runs schema migrations on live data.
- SQL is written SQLite-style (`datetime('now','-365 days')`) and translated to Postgres at run time (`lib/net/sql.js`), a leftover from the original Cloudflare D1 build.
- `main` is out of date; there is no single source of truth for production.

### Poor user experience
- Brands cannot sign in and find creators themselves; most work flows through the team.
- Creators cannot see a clear deal timeline or a calendar in the real app.
- Six screens still carry known design debt (CRM board, team top bar, rail, phone tables, form-heavy rows, long edit forms).

### Blocks international scaling
- Money is INR-only (`*_paise` columns, ₹ formatting, lakh/crore everywhere).
- GST 18% and TDS are written into the pricing code; countries and their taxes are not a concept.
- Single time zone (IST) dates; English-only interface.
- No tenant model: a brand is one login, not an organisation.

### Financial and legal risks
- **Fees partly hard-coded**: base fee is a setting (15% default), but loyalty floor 10%, repeat rate 12%, rush 5% and GST 18% are in code.
- The prototype shows a "wallet" with a withdraw button. Colatch must not present held money as a wallet or as safeguarded funds until a licensed payment partner holds it (RBI rules for payment aggregators / escrow in India; equivalent rules elsewhere).
- TDS section and rate are still for the CA to confirm (the code labels the creator take-home as an estimate).
- Creator data from social platforms must come only through official APIs; self-reported numbers must be labelled.
- Privacy: GDPR, India DPDP Act and US state laws need a deletion/export workflow; none exists yet.

## 3. The five differentiators: how each becomes a real feature

Each one is built on data the platform already records, and each says what it does not know.

### 3.1 Colatch Money Flow (revenue infrastructure) — **first version built**
One engine computes every split: brand payment → platform fee → agency commissions → taxes → creator earnings.
- Built in this branch: `lib/net/moneyflow.ts` with 16 tests. Integer minor units in any of 29 currencies; rates as basis points from settings or signed agreements, never from code; agreement > account > country > default; refuses double charging and agency fees on direct deals; tax charges (GST/VAT) and withholdings (TDS) as their own lines; every line explains itself; the books always balance (property-tested over thousands of combinations).
- Next: commission rules table + admin screen, then move `quote()`/`priceDeal()` onto it, then a ledger with currency and party columns, then a payment provider.

### 3.2 Colatch Relationship Graph
A network of brands ↔ creators ↔ agencies ↔ campaigns ↔ relationship managers.
- Data: every deal, application, message and rating already links two parties. A view (`relationship_edges`) aggregates them: deals together, money, last contact, average rating, disputes.
- UI: a force-directed map with filters (by brand, creator, agency, period), plus "worked with / never worked with / went badly" panels. Visible only for accounts the viewer is allowed to see.

### 3.3 Creator Passport (creator retention)
A creator's portable professional identity they control.
- Content: verified metrics (only from connected platforms), Colatch-verified collaborations (paid deals with brand sign-off), portfolio, Colatch Score with its parts, brand references the brand agreed to share.
- Every field labelled Verified / Self-reported / Estimated. Creator chooses what each link shows; links can be revoked. Builds on the existing media kit.

### 3.4 Relationship Manager Intelligence (operational advantage)
Rules over live data that flag accounts at risk before anyone complains:
- brand silent to a creator for 72h; creator past a draft or go-live date; payment past the agreed date; agency with several overdue campaigns; repeated complaints about one creator; brand with no campaign in 90 days.
- Each flag carries the evidence, a suggested next action and an AI-drafted message. The RM decides; nothing sensitive is automatic. The daily job and dashboard "needs attention" queue already exist and become its base.

### 3.5 Campaign DNA (every campaign makes the next smarter)
A structured record written when a deal settles: objective, creator, audience fit, price, deliverables, views vs estimate, engagement, on-time, communication, brand rating, creator rating, paid in full.
- Answers: who performed for similar briefs, what budget to expect, which formats worked, who delivers on time, which pairings to repeat or avoid.
- Campaign Memory: "a campaign like our best last quarter, younger audience, Germany" → a draft brief built from that record, with every suggestion linked to the campaigns it came from. When there are too few comparable campaigns, it says so instead of guessing.

## 4. Five experiences: target shape

| Experience | Navigation (first release) |
|---|---|
| Team / Platform | Overview, Lifecycle board, Brands, Creators, Agencies, RMs, Campaigns, Deals, Money & commissions, Disputes & tickets, Verification & fraud, Analytics, Settings (countries, currencies, rules), Audit log |
| Brand | Home, Discover, Campaigns, Create brief, Shortlists, Relationships, Inbox, Negotiations, Deals & contracts, Approvals, Gifting, Payments & invoices, Analytics & ROI, Reports, Brand assets, Settings |
| Creator | Home, Opportunities, Invitations, Applications, Deals, Negotiations, Messages, Calendar, Deliverables, Earnings, Invoices & tax, Passport & media kit, Analytics, Reviews, Score, Settings |
| Agency (brand-side, creator-side, hybrid) | Home, Clients or Roster, Campaigns, Discover / Opportunities, Proposals, Negotiations, Deals, Approvals, Commissions, Invoices & statements, Reports, Team, Settings |
| Relationship Manager | My day, Accounts, Needs attention, Tickets, Inbox (external + internal notes), Campaigns at risk, Follow-ups, Meetings, Templates |

## 5. Architecture changes (additive, nothing removed)

1. **One identity, many memberships.** New `users` (login) + `organisations` (brand, brand-group, agency, Colatch) + `memberships` (user × org × role) + `representations` (agency × creator, signed authorisation, revocable by the creator). Existing three account tables are migrated into it with their passwords intact.
2. **Permissions** by role and by resource (every query scoped to the viewer's organisations). Roles: super admin, ops admin, relationship manager, brand owner/admin/member, agency owner/manager/member, creator, creator representative.
3. **Money**: `commission_rules`, `agreements`, a ledger with `currency`, `amount_minor`, `from_party`, `to_party`, `flow_id`; Money Flow engine is the only place that splits money.
4. **Campaign lifecycle**: the 18 stages in the brief, per campaign and per creator deal.
5. **Global**: country, currency and time zone on organisations, users and campaigns; dates stored UTC and shown in the viewer's zone; tax rules per country from settings.
6. **Separate databases** for development, preview and production (Neon branches) before any of this is merged.

## 6. Build sequence

| Phase | What | Needs from you |
|---|---|---|
| 0 | Separate Neon branch for previews; make `hardening` the production branch; merge PR #5 | Approve DB split and merge |
| 1 | Money Flow into the app: rules table, admin screen, pricing moved onto the engine | Commission defaults per deal type |
| 2 | Identity, organisations, memberships, permissions; brand teams | — |
| 3 | Brief builder v2 (all fields, drafts, templates, invites, proposals, AI assistant) and brand discovery | — |
| 4 | Agencies (both types) with authorised representation | Agency commercial model |
| 5 | Relationship Manager workspace, tickets with SLA, RM Intelligence | SLA targets |
| 6 | Negotiation with offer history; contracts + e-signature | E-sign provider (e.g. Leegality/Digio for India, DocuSign/Dropbox Sign globally) |
| 7 | Payments: provider, escrow where legal, payouts, invoices, refunds | Payment partner, CA/legal sign-off |
| 8 | Campaign DNA, Relationship Graph, Creator Passport, Deal Health | Enough completed campaigns |
| 9 | Multi-currency, localisation, privacy workflows, launch-readiness testing | Legal review per market |

A feature is "done" only when the user can do it, the database stores it, permissions are enforced and tests cover it.

## 7. Competitor research

The 17 Nov benchmark covers 25 platforms on 49 features (64%, joint 2nd). It did not score agency workflows, relationship management or multi-party commission transparency in depth, which are the core of this brief. Those three dimensions get a fresh, sourced pass against the 20 platforms listed in the brief before Phase 4 starts, so the "unique" claims are checked rather than assumed.
