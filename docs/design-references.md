# Colatch Connect — Reference Board (researched 2026-11-17)

Fixed visual system: Colatch Workspace (Pantone 669 jali sidebar, ivory paper, gold-foil accents,
Diodrum Light numerals, Inter body). The references below are for **structure**, never for look.

## Evidence notes (read first)
- **Dribbble:** dribbble.com pages render via JS. WebFetch returned empty bodies for shot pages,
  so Dribbble evidence is **search-result title + URL only**. The images were not inspected.
- **Behance:** search returned almost nothing current. The only gallery hit was
  behance.net/gallery/65796773 (2018), which is too old to use. Current "Behance-style" case studies
  surfaced on **Contra** instead, so those are listed in its place.
- **Pinterest:** no pin URLs came up in any search (dashboard, KPI, luxury purple/gold). This board has
  **zero Pinterest references**. Re-run the search in a logged-in browser if Pinterest is needed.
- **Shipping products:** fetched and read where noted with [read]. Rows marked [title] were seen
  only in search results.

---

## 1. Home dashboards (creator earnings / brand campaign home / ops desk)

**Principle.** Home answers three questions in order: where do I stand (2-4 numbers), what changed
(a delta vs. the previous period), and what do I do next (a queue of actions). Stripe deliberately keeps
home fixed and sparse, with no widget grid. Mercury puts the money position at the top level and pushes
controls one level down. Colour carries status only.

| # | Source | URL | Transferable pattern |
|---|---|---|---|
| 1 | Stripe (via 925 Studios) [read] | https://www.925studios.co/blog/stripe-dashboard-design-breakdown | Headline number, then previous-period figure in small text under it, then a monochrome sparkline. Colour is reserved for succeeded/failed/pending. Empty state keeps the same layout with zeros and one "first action" prompt. |
| 2 | Mercury Insights (Mar 2026) [read] | https://mercury.com/blog/introducing-insights | Snapshot of burn, runway and top categories. One filter change updates every chart and table. AI "notable change" callouts are clickable and open a question about that data. |
| 3 | Mercury (925 Studios) [read] | https://www.925studios.co/blog/mercury-design-breakdown | Hierarchy: balance, recent transactions and cash flow on L1; cards, permissions and wires on L2. Red and yellow are used only for errors and warnings. |
| 4 | Linear mobile redesign (Oct 2025) [read] | https://linear.app/changelog/2025-10-16-mobile-app-redesign | Bottom toolbar for the core workflows, plus one persistent create CTA at the top of every screen. This is the model for the creator phone home. |
| 5 | Dribbble "Monetly – Mpowering Creators Dashboard" [title] | https://dribbble.com/shots/25410719-Monetly-Mpowering-Creators-Dashboard | Creator-earnings home concept. Use it as the mood check for "money first" on the creator side. |
| 6 | Collabstr creator side [title] | https://collabstr.com/creator | The marketplace creator landing is framed as "get paid", so earnings is the hero. |

**Do**
- Do lead with 3-4 KPIs, each with a delta and its comparison window ("vs last 30 days").
- Do follow the KPIs with an **Action queue** (approve 3 deliverables, 2 payouts pending), then recent activity.
- Do keep one primary CTA per screen. On the creator phone it is sticky ("Submit deliverable" / "Accept offer").

**Don't**
- Don't use a configurable widget grid. Stripe argues that an opinionated fixed layout is better.
- Don't use green for "up". Use the good/bad colour for that metric (falling dispute rate is good).
- Don't open on more than about 6 cards. Promote "the vital few" (SaaSUI guidance below).

**Specs**
- KPI strip: **max 4 tiles** on desktop, **2x2** on phone. Numeral 32-40px Diodrum Light; delta 12px.
- Phone home order: hero earnings card (about 180px) → action queue (max 3 items + "see all") → campaigns carousel.
- Desktop ops home: 12-col grid, main 8 / aside 4. The aside holds "Needs you today" and system alerts.

---

## 2. Collection / list pages (campaigns, creator finder, CRM kanban, finance ledger)

**Principle.** A list page is a workbench: summary strip → filter bar → data → optional insight panel.
The table runs edge to edge with no card chrome. Filters are visible chips, not hidden modals. Every
row has one status badge and one obvious next action.

| # | Source | URL | Transferable pattern |
|---|---|---|---|
| 1 | Shopify resource-index template [read] | https://shopify.dev/docs/api/app-home/patterns/templates/resource-index | Header with a primary action plus secondary actions (export/import). The table cell with a thumbnail links to the detail page. Numeric columns are right-aligned (`format="numeric"`). Status uses a badge. Paginate above 100 rows. The empty state replaces the table rather than sitting inside it. |
| 2 | Attio layout patterns [read] | https://nadesign.pages.dev/references/attio-layout-patterns/ | Table is edge to edge with a hover-revealed checkbox and a footer with the count and column sums. Kanban cards show an avatar, a title and 2-3 fields, with no resting shadow. Row preview opens a 400-600px drawer with `?record=id` and "Open full page". |
| 3 | Attio kanban docs [title] | https://attio.com/help/reference/managing-your-data/views/create-and-manage-kanban-views | Kanban is just a *view* of the same list, grouped by a status attribute. Table and Kanban toggle on the same data. |
| 4 | Dribbble "Netfina – Financial Management – Table View" [title] | https://dribbble.com/shots/23498019-Netfina-Financial-Management-Table-View | Finance-ledger table reference for the Colatch money desk. |
| 5 | SaaSUI filtering & sorting patterns [title] | https://www.saasui.design/blog/saas-filtering-sorting-ux-patterns | Applied filters shown as removable chips, with saved views. |
| 6 | Contra "Simplifying influencer marketing data at Qoruz" (Indian influencer platform) [title] | https://contra.com/p/bBkMAFBX-simplifying-influencer-marketing-data-at-qoruz | Closest market analogue for a creator-finder table with dense metrics. |

**Do**
- Do build the filter bar as: search (left) · 3-5 chip filters · "More filters" · view toggle (Table/Board) · saved views.
- Do let the row action open a **drawer** first (preview), with "Open full page" as the escalation.
- Do put column sums in the footer for the ledger (Total paid, Total pending) using Diodrum numerals.

**Don't**
- Don't wrap tables in a card with a shadow. Use a hairline gold-on-ivory border at most.
- Don't hide active filters inside a popover, because people lose track of why rows are missing.
- Don't show the insight panel when it is empty. Collapse it to a 48px rail.

**Specs**
- Row **52px** (comfortable, brand/creator) / **40px** (ops density toggle). Header 12px medium, muted, uppercase tracking +2%.
- Insight side panel **320px** fixed. Drawer **480px** (record preview); beyond 800px, use a page.
- Phone: **table → cards** (avatar, name, 1 status badge, 1 money figure, chevron). Kanban becomes stage tabs with a horizontal swipe.

---

## 3. Record / detail pages (deal room, creator profile, campaign, client shortlist, receipt)

**Principle.** The header says **what this is, what state it is in, and what happens next**. A status
rail (stepper) turns a deal into a visible journey. The main column is for work (content, deliverables,
chat). The aside is for facts (status, money, people, metadata). Collabstr's escrow flow is the money
model: funded → submitted → review/revision → approve = auto-release → logged receipt.

| # | Source | URL | Transferable pattern |
|---|---|---|---|
| 1 | Shopify details template (v2.0) [read] | https://shopify.dev/docs/api/app-home/v2.0/patterns/templates/details | Breadcrumb back to the index. Primary column holds editable sections; aside holds status badge, summary and notes. Section header slots: heading / subheading / accessory (count) / supplemental (status) / actions. Destructive actions go through a confirm modal. A Save Bar appears on unsaved changes. |
| 2 | Collabstr Approve & Pay [read] | https://collabstr.com/features/approve-and-pay/ | Escrow at order time, fee shown before confirm. Deliverable review offers **Request revision** or **Approve (1 click → payment auto-released)**. Every step is logged with a downloadable receipt. This is the deal-room spine. |
| 3 | Attio record page [read] | https://nadesign.pages.dev/references/attio-layout-patterns/ | Split layout: scrolling activity on the left, a flat property panel on the right with Details/Comments tabs. Properties are edited inline with no modal. The label column is fixed at 120-140px. |
| 4 | Collabstr chat & negotiate [title] | https://collabstr.com/features/chat-and-negotiate/ | Negotiation, offer and hire happen in one thread. The deal room's main column is the conversation plus deliverables. |
| 5 | CreatorIQ creator profiles [title — page body did not describe layout] | https://www.creatoriq.com/whats-new-in-creatoriq/creator-profiles | "Instant snapshot of creators and their partnership history." The creator record should lead with history with *this* brand. |
| 6 | Dribbble "Detail Panel design" [title] | https://dribbble.com/shots/24856165-Detail-Panel-design | Side detail-panel composition reference. |

**Do**
- Do order the header as: breadcrumb → title + status badge → **StatusRail** (5-6 steps max) → primary CTA right-aligned.
- Do follow it with a KPI strip of 3 tiles (Fee · Due date · Deliverables x/y), then main 8 / aside 4.
- Do make the client shortlist page a card grid with **Approve / Pass** on each card and a sticky bottom "x of y approved · Send to Colatch" bar.

**Don't**
- Don't use tabs for things that need to be seen together (status + money). Those go in the aside.
- Don't let the stepper show more than 6 nodes. Collapse "revision" loops into a counter badge on the Review node.
- Don't make the receipt a page full of form fields. Print layout: brand mark, parties, line items, total in Diodrum, gold rule.

**Specs**
- Status rail: 28px nodes, 2px connector. States are done (gold fill), current (purple ring + label bold), upcoming (muted), blocked (red ring).
- Aside 320px. Each AsideCard has a 14px medium title and 12px labels in a fixed 128px label column.
- Phone: the rail becomes a single "Step 3 of 5 · In review" line with a progress bar. The aside stacks *above* main as a collapsible "Summary".

---

## 4. Form pages (signup/onboarding, login, long profile, brief creation, settings)

**Principle.** Forms should feel like being onboarded into a members' club. A split screen gives the
brand an editorial panel. A live preview shows the result of each answer (the creator media card, the brief
as the creator will see it). A summary rail keeps long forms honest. Split a form only along real seams.

| # | Source | URL | Transferable pattern |
|---|---|---|---|
| 1 | SaaSUI multi-step wizard patterns [read] | https://www.saasui.design/blog/saas-multi-step-form-wizard-ux-patterns | Name each step. Put easy steps first. Progress should reflect effort. Validate on Next, inline. Back is lossless. Allow jumps only to reached steps. Save and resume. A review step comes before anything irreversible. 3-4 related fields stay on one screen. |
| 2 | Attio "focus view" [read] | https://nadesign.pages.dev/references/attio-layout-patterns/ | Multi-step flow takes over the main pane with the sidebar still visible. Two 48px header rows (close + breadcrumb, then stepper). Sticky bottom action bar. |
| 3 | CreatorIQ new Campaigns setup [read] | https://www.creatoriq.com/whats-new-in-creatoriq/smarter-campaigns | Brief creation runs Goals → Tracking (hashtags/keywords, exclusions) → Options (modules on/off), all refinable later in Settings. This is the model for the Colatch brief builder. |
| 4 | Collabstr post a campaign [title] | https://collabstr.com/features/post-campaigns/ | Brief is posted and creators apply, so the brief form must preview as the creator-facing card. |
| 5 | Untitled UI "Sign up split" [title] | https://www.untitledui.com/react/components/sign-up-pages/signup-split-mockup | Split-screen signup: form on one side, mockup/editorial panel on the other. |
| 6 | SaaSFrame wizard pattern library [title] | https://www.saasframe.io/patterns/wizard?60e91b22_page=1 | Live screenshots of shipping wizards for step-chrome comparison. |

**Do**
- Do give desktop signup/login a 5/7 split. The left side is the jali purple editorial panel (testimonial, celebrity count, gold numeral); the right side is the form on ivory.
- Do put creators arriving from WhatsApp **straight into step 1 with the phone prefilled**, using OTP. Never send them to a landing page first.
- Do give the brief builder a stepper plus a **LivePreview** of the creator-facing brief card on the right.

**Don't**
- Don't use one-field-per-step wizards. Don't build a 12-step creator signup. Use 3-4 named steps.
- Don't validate only at the end. Don't wipe a step on Back.
- Don't let the editorial panel appear on phone. It shrinks to a 72px purple header band with the logo.

**Specs**
- Form column max-width **480px**. Inputs **48px** high (phone 52px). Label→input 6px, field 16px, section 24px (8px grid).
- Stepper: 3-5 named steps. Sticky bottom bar with Back (ghost) and Continue (gold primary), plus "Save & finish later".
- Settings: left section nav 220px plus a 640px content column. Save Bar appears only when the form is dirty.

---

## 5. Insight pages (earnings charts, creator score/tier, marketplace health, system health)

**Principle.** Insight pages explain *why* the number moved. Structure: global date range → KPI strip
(each card a doorway) → one hero chart → breakdown table → callouts that point at anomalies. Filters
update everything at once. Design the zero, no-data and error states explicitly.

| # | Source | URL | Transferable pattern |
|---|---|---|---|
| 1 | SaaSUI KPI card patterns [read] | https://www.saasui.design/blog/saas-metric-kpi-card-ux-patterns | Every value has a comparison. Direction is separate from sentiment colour. Axis-less sparkline. Comparison window is in plain words and follows the global range. The card links to detail. Skeleton, true zero, "no data yet" and error+retry are all distinct states. |
| 2 | Mercury Insights [read] | https://mercury.com/blog/introducing-insights | Money in / money out tabs. Compare by category, counterparty and period. Anomaly callouts are clickable and lead to a question. This is the model for creator earnings and the ops "marketplace health" page. |
| 3 | Stripe home [read] | https://www.925studios.co/blog/stripe-dashboard-design-breakdown | Previous-period figure directly under the current one. No chart grid on home; full charts live one click deeper. |
| 4 | Linear UI refresh (Mar 2026) [read] | https://linear.app/changelog/2026-03-12-ui-refresh | Sidebar slightly dimmed so content carries emphasis. Headers and view controls are identical across every page type. |
| 5 | Vercel new dashboard (Feb 2026) [read] | https://vercel.com/try/new-dashboard | Same tab set across projects and teams. Collapsible sidebar for full-screen analysis. Use it for the system-health page shell. |
| 6 | Dribbble "Finance tracker / Case study" [title] | https://dribbble.com/shots/21903841--Finance-tracker-Case-study | Earnings-over-time chart composition reference. |

**Do**
- Do use one global DateRange in the PageHeader that drives all cards and charts.
- Do present creator score/tier as a ring or meter with the next-tier threshold ("₹42k to Gold"), and list 3 levers that raise it.
- Do show system health as a row of service pills (OK / Degraded / Down) followed by an incident timeline. Green should almost never be seen.

**Don't**
- Don't put more than 1 hero chart and 2 secondary charts on a page. Don't use pie charts for over 5 categories.
- Don't show a flat zero when the data is still syncing. Show "Syncing · updated 8h ago".
- Don't use gold as a data series colour. Gold is for accents and the "you are here" marker only.

**Specs**
- Hero ChartCard 320px tall desktop / 220px phone. Secondary charts half width at 240px.
- Max 4 KPI tiles. Sparklines 24px tall, 12-30 points, no axes.
- Phone: charts go full-bleed inside the card, the legend moves below, and tap shows a tooltip (no hover).

---

## Colatch translation — components (build in Colatch tokens)

Global grid: 12 col, 24px gutter, page padding 32px (desktop) / 16px (phone). Sidebar 248px (collapsed 64px).
The aside is 320px everywhere. Breakpoints are 768 / 1200. Base unit 8px.

1. **PageHeader**: breadcrumb (12px muted) → H1 (Inter 24/600) + StatusBadge → right-side actions
   (1 gold primary, up to 2 ghost secondaries, overflow menu). Optional slot for the DateRange and a view toggle. 72px tall;
   it sticks with a hairline gold bottom rule on scroll. On phone the title is 20px and actions collapse to one primary plus a kebab menu.
2. **KpiStrip**: 2-4 StatCards in an even grid. A 5th card is not allowed and goes to an insight page instead. 2x2 on phone.
   Gap 16px. The strip never scrolls horizontally.
3. **StatCard (with sparkline)**: label 12px uppercase muted; value Diodrum Light 36px (phone 28px); delta pill
   (arrow + %; colour follows sentiment) + "vs prev 30d"; sparkline 24px, purple stroke at 60%. Whole card is a link.
   States: skeleton, zero, syncing, error+retry. Padding 20px, radius 12px, ivory surface, 1px border.
4. **ChartCard**: header (title 14/600, DateRange-inherited caption, segment tabs) → chart 320px → optional footer
   with "View breakdown". The series palette is purples plus one neutral. Gold marks only "today/target". Tooltip on hover/tap.
5. **FilterBar**: search (240px) · up to 5 chip filters · "More" · saved-views dropdown · Table/Board toggle · count
   "128 creators". Applied filters show as removable chips with "Clear all". Sticky under the PageHeader. On phone: search
   plus a "Filters (3)" button that opens a bottom sheet.
6. **DataTable → Cards on phone**: edge-to-edge, 52px rows (40px dense for ops), 12px header, numbers right-aligned
   in Diodrum tabular. Hover shows a checkbox and a row actions menu, and the row opens a 480px Drawer. Footer has the count and sums.
   Below 768px each row renders as a card: avatar 40, name, 1 badge, 1 amount, chevron. Bulk actions move to a sticky bottom bar.
7. **StatusRail**: 3-6 nodes (28px) plus labels and dates. States are done (gold fill + check), current (purple ring),
   upcoming (muted), blocked (red ring + reason). Revision loops show as a "x2" badge. On phone it becomes a "Step 3 of 5 · In review" line
   plus a 4px progress bar. The same rail model is used for deals, campaigns, payouts and onboarding.
8. **AsideCard**: 320px column card. 14/600 title plus an optional accessory (count/status). Rows use a 128px label column with
   the value beside it, edited inline. Variants: Money (fee, escrow, payout ETA, receipt link), People, Next step (one CTA), Notes.
   On phone the cards stack above main as a collapsible "Summary".
9. **EmptyState**: replaces the table or section, never sits inside it. Jali-pattern illustration at 20% opacity, a 18/600 headline
   that states the benefit, one sentence, 1 primary and 1 "Learn more". Distinct copy for "no results for filters" (with a Clear filters button)
   versus "nothing yet".
10. **SplitAuth**: desktop 5/7 split. The left side is the Pantone 669 jali panel with the gold logo, one Diodrum stat ("1,200+ celebrities")
   and a rotating testimonial. The right side is ivory with a 480px form. Phone uses a 72px purple header band. Creator WhatsApp
   deep links prefill the phone number and go straight to OTP. Login is a single field plus OTP, with no password by default.
11. **FormStepper**: 3-5 named steps in a horizontal stepper (desktop) or "Step 2 of 4" plus a bar (phone). Validation runs on Continue,
   Back is lossless, and steps can be jumped to only once reached. A sticky bottom bar has Back, "Save & finish later" and Continue (gold).
   A Review step comes before submitting a brief or payment.
12. **LivePreview**: 400px right panel (desktop) rendering the real output, such as the creator media card or the
   brief card as creators see it, updating per keystroke with a "Preview as: Creator / Brand" switch. On phone it is a "Preview"
   pill that opens a full-screen sheet.
13. **Drawer** (supporting): 480px, Esc/outside click closes it, URL `?record=id`, "Open full page" in the header.
14. **ActionQueue** (supporting, home): up to 3 rows, each with an icon, a sentence, an amount/date and one button. "See all" leads to a filtered list.
