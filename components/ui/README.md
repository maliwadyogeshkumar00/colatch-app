# Colatch Connect UI kit (`components/ui`)

Shared, presentational components that turn every Connect screen into a dashboard-style page in the
Colatch Workspace design (Pantone 669 purple, 145 gold foil, ivory paper, Diodrum display over Inter).

```js
import { PageHeader, KpiStrip, FilterBar, FilterChips, DataTable, Grid, AsideCard } from "@/components/ui";
```

- **Server components.** No data fetching, no hooks, no client JS. Pass in data the page already loaded.
- **Styles** live in `app/net.css` between `/* === ui kit === */` and `/* end ui kit */`. Classes start with `ui-`.
  They use the design tokens only, follow light and dark mode (`prefers-color-scheme`), are built for 375px
  first, and respect reduced motion.
- **Colatch rules.** One gold-foil CTA (`.btn-foil`) per view. Use `featured` or `gold` on one figure at most.
  Status never uses red or green: use a `Pill` tone (shape + plum or gold shade + words).
- **Accessibility.** One `<h1>` per page (PageHeader or SplitAuth `intro`), then `Section` `<h2>`s, and card titles
  as `<h3>`. Charts carry `role="img"` and an aria-label. Focus stays visible, and targets on phones are 44px.
- **Title emphasis.** Any `title` string can use `<b>…</b>` (purple on light, gold on dark bands), `<em>…</em>`
  (gold foil) and `<br>`. The kit parses these into React nodes and never sets innerHTML, so the strings are safe.
  Entities such as `&amp;` are decoded. You can also pass a node.

---

## Components

### PageHeader
`{ eyebrow, title, sub, crumbs, actions, meta, variant = "plain" | "hero", id, children }`

The editorial header: a gold-rule eyebrow, a Diodrum light `<h1>` and a sub line.
- `crumbs`: `["Creator tools", "Open campaigns"]` or `[{ label, href }]`. The last item is the current page.
- `actions`: a node. In `plain` it goes on the right of the crumb row; in `hero` it goes under the sub line.
- `meta`: a node, or an array `[{ label, value, unit?, gold?, title? }]` that renders as `HeadStats`.
- `plain` is the ivory header for use inside TeamShell. Leave TeamShell's `title` prop out; its bar also hides
  automatically whenever `.ui-head` is a direct child of `.main`.
- `hero` is the dark 669 band with jali. On public, creator and brand pages, pass it to PublicShell
  (`hero={<PageHeader variant="hero" …/>}`) so it runs full width. Inside `.main` it becomes a rounded card.
```jsx
<TeamShell active="crm" email={me.email} role={me.role}>
  <PageHeader crumbs={["Creator network", "CRM"]} eyebrow="Deals" title="Every deal, <b>one board</b>."
    sub="…" actions={<a className="btn-foil" href="#new">+ New deal</a>} meta={[{ label: "Open", value: 36 }]} />
```
Also exported: `Crumbs({ crumbs })` and `HeadStats({ items, label })`.

### KpiStrip
`{ items: [{ label, value, unit?, foot?, trend?: { dir: "up"|"down"|"flat", text }, spark?: number[], sparkLabel?, href?, featured?, title? }], label }`

Shows 2 to 4 stat tiles: 2-up on phones and in one row from 768px. A number `value` is formatted in Indian grouping;
pass strings that are already formatted (`inrShort(n)`) for money. `featured` turns that tile's figure gold foil.
`spark` draws a mini `Spark`, and `href` makes the whole tile a link.
```jsx
<KpiStrip items={[{ label: "Waiting", value: n, href: "?tab=pending" },
  { label: "Fees booked", value: inrShort(total), featured: true, trend: { dir: "up", text: "12% vs last year" } },
  { label: "Briefs in", value: 9, spark: weekly }]} />
```
Also exported: `Trend({ dir, text })`.

### ChartCard
`{ title, period, figure, figureTitle, featured, children, foot, level = 3 }`

A paper card that frames one chart: `Bars`, `Donut`, `Split` or `Spark`, all re-exported from the kit.
```jsx
<ChartCard title="Fees booked" period="Nov ’26" figure={inrShort(fees.total)} foot="From accepted terms">
  <Bars months={fees.months} label="Creator fees per month" fmt={inrFull} />
</ChartCard>
```

### FilterBar + FilterChips
`FilterBar({ children, end, label })`
`FilterChips({ name, options: [{ value, label, count? }], current, hrefFor?, label? })`

Filters are plain links, so they work without JS. The page reads the choice from `searchParams`. The current
chip gets `aria-current="page"`. Chips wrap on phones and never scroll sideways. By default `hrefFor` builds
`?${name}=${value}`. Pass your own function to keep other params.
```jsx
<FilterBar end={<form method="get" role="search">…</form>}>
  <FilterChips name="tab" current={tab} options={[{ value: "all", label: "All", count: 9 }, …]} hrefFor={(v) => `?tab=${v}`} />
</FilterBar>
```

### DataTable (+ Cell, Figure)
`{ columns: [{ key, label, align?, num?, primary?, hidePhone?, labelHidden?, width?, render?(row, i), className? }], rows, rowHref?(row), rowKey?(row, i), empty?, caption?, label?, scroll? }`

- On desktop it is a paper card with a sticky header. `num` (or `align: "right"`) sets right-aligned tabular figures.
- On tablets the table scrolls sideways inside the card.
- On phones (≤640px) it uses the existing **`.tbl.stack`** card pattern from net.css; the kit reuses it rather than
  forking it. The first column is the card title (`td.first`), `primary` columns come next (`td.key`: status,
  amount, the row's action), and the rest follow as "label  value" lines from `data-label`. `hidePhone` drops a
  column on phones. `labelHidden` keeps a header for screen readers only (use it for an action column).
- `rowHref` makes the title cell a link that covers the row. Do not put other links in the first column. Buttons,
  selects and links in other cells stay clickable.
- `empty` takes `{ title, body, action }` (rendered as EmptyState) or a node.
- `scroll` is for 7+ column tables. The table always scrolls inside its card, and the header is then not sticky.
```jsx
<DataTable caption="Campaigns" rows={camps} rowHref={(k) => `/team/campaigns/${k.id}`} columns={[
  { key: "title", label: "Campaign", render: (k) => <Cell eyebrow={k.brand} title={k.title} sub={<Tags items={chips(k)} />} /> },
  { key: "status", label: "Status", primary: true, render: (k) => <Pill tone="wait">Waiting</Pill> },
  { key: "budget", label: "Budget", num: true, render: (k) => <Figure value={inr(k.budget_total)} note="incl. GST" /> }]}
  empty={{ title: "Nothing here yet.", body: "Paste a brief.", action: <a className="btn sm" href="#new">Paste a brief</a> }} />
```
`Cell({ eyebrow, title, sub })` is the title cell (small caps line, bold name, then tags or facts).
`Figure({ value, note, title })` is a Diodrum number with an optional note underneath.

### StatusRail
`{ steps: [{ label, state: "done"|"now"|"todo" }], note, eyebrow?, badge?, label = "Progress", bare? }`

A one-line progress rail: done steps are plum, the current step is gold and the rest are hairlines. It reuses the
`.drail` styles. The eyebrow defaults to "Step 3 of 8". `bare` drops the card. `DealRail` (`app/(net)/_ui`) now
renders through this component. It looks the same as before, and screen readers now hear each step's state.
```jsx
<StatusRail label="Brief progress" steps={[{ label: "Sent", state: "done" }, { label: "Shortlist", state: "now" }, { label: "Deal", state: "todo" }]}
  badge={<Pill tone="mine">Your move</Pill>} note="Shortlist due Friday." />
```

### Layout: Grid, Section, Card, AsideCard
- `Grid({ aside, children, asideFirst?, cols? })`: a main column plus a **340px aside** from 1081px. Below that it
  stacks, with the aside after the main column (or first with `asideFirst`). `cols={2|3|4}` gives equal columns
  instead: 2-up on tablets and 1-up on phones (`4` stays 2-up). Grids that follow each other get a 24px gap.
- `Section({ title, sub, actions, id, level = 2 })`: a heading row (gold dot, title, sub, actions) and its body.
  `id` is the anchor, and the heading gets `${id}-h`.
- `Card({ tone: "paper"|"night"|"gold", pad: true|false|"lg", as, label })`: `night` is dark 669 with jali and ivory
  text, and its links turn gold. `gold` is a gold-washed paper card.
- `AsideCard({ title, eyebrow, tone, foot, level = 2 })`: a compact card for the aside (small-caps eyebrow, title,
  body, foot links).
```jsx
<Grid aside={<AsideCard eyebrow="Insight" title="Where briefs stand"><Split … /></AsideCard>}>
  <Section id="list" title="Campaigns" sub="9 briefs">…</Section>
</Grid>
```

### EmptyState + InlineState
- `EmptyState({ title, body, action })`: a dashed outline, a glyph, a Diodrum title and an action.
- `InlineState({ kind: "loading"|"error"|"info", label?, children })`. Each kind has its own shape: a ring (it
  spins only when motion is allowed), a diamond with a plum bar, or a dotted circle. Each also has a bold label
  (default "Loading", "Couldn't finish" or "Note"). The roles are `status`, `alert` and `note`. None of them uses red.
```jsx
{dbErr && <InlineState kind="error" label="Database not reachable.">{dbErr}</InlineState>}
<EmptyState title="No deals yet." body="Approve a shortlist to create one." action={<a className="btn sm" href="/team/campaigns">Open campaigns</a>} />
```

### SplitAuth
`{ panel: { eyebrow, title, lede?, quote?: { text, source }, stats?: [{ value, label, gold? }] }, intro?: { eyebrow?, title, sub? }, top?, children }`

The Login design. On the left is a dark 669 editorial panel: an eyebrow, a big Diodrum headline whose `<em>`/`<b>`
phrase is gold foil, a lede, a pull-quote, two stats, jali and a gold glow. On the right is an ivory form column.
From 900px the two sit side by side. On phones a compact band (eyebrow, headline and stats) sits on top. Any
existing `<form>` works unchanged as children, including `form.panel.pad`, whose card chrome is dropped.
`intro.title` is the page `<h1>`. Render it inside **`<PublicShell flush>`**, which drops the centred `.wrap`, so it
runs edge to edge. On that page the header's gold "Join free" turns into an outline, so the submit button stays
the one gold CTA.
```jsx
<PublicShell path="/brand/login" mode="client" flush>
  <SplitAuth panel={{ eyebrow: "Colatch for brands", title: "Creators who <em>fit the brief</em>.", stats: […] }}
    intro={{ eyebrow: "Welcome back", title: "Log in to your <b>brand desk</b>." }}>{existingForm}</SplitAuth>
```

### FormSteps + SummaryRail
- `FormSteps({ steps: string[] | [{ label, href? }], current, label })`: a progress header for long forms.
  `current` is 0-based. Earlier steps read as done, and steps with an `href` link back. On phones it shows a
  "Step 2 of 4 · Creators" caption with the bars.
- `SummaryRail({ title, items: [{ label, value }], total?: { label, value }, children })`: a live summary card.
  It is sticky beside the form from 1081px (put it in `Grid aside`). Empty values show "Not set". If values must
  update as people type, mirror the fields in a small `'use client'` leaf; the rail itself stays server-rendered.
```jsx
<FormSteps steps={["Brief", "Creators", "Budget", "Review"]} current={1} />
<Grid aside={<SummaryRail items={[{ label: "City", value: f.city }]} total={{ label: "Budget", value: inrShort(b) }} />}>…</Grid>
```

### Pill, Tag, Tags, Avatar
- `Pill({ tone, title })`. Tones: `done` (check), `wait` (dotted ring), `off` (dash: closed, rejected),
  `mine` (triangle, solid plum: "your move"), `plum` (solid), `gold` (diamond: featured, money) and `quiet`
  (dot, the default). They map onto the existing `.pill` classes.
- `Tag({ children })` / `Tags({ items, max = 6 })`: ivory requirement and fact labels, with "+N" for the rest.
- `Avatar({ name, initials?, src?, size = 40, ring = true, label? })`: initials on one of three plum or gold
  gradients (chosen from the name) with the design's gold ring. It is decorative unless you pass `label`.
```jsx
<Pill tone="mine">Your move</Pill> <Tags items={["Mumbai", "Hindi", "50K+ followers"]} /> <Avatar name="Priya Sharma" />
```

Also exported: `Bars`, `Donut`, `Spark`, `Split` and `ringColor` (from `components/dash/Charts`), plus `rich(str)` and
`plain(str)`.

---

## The 5 page templates

| Template | Use for | Components, top to bottom |
|---|---|---|
| **Home** | team home, brand home, creator home | `PageHeader` (or the dashboard hero in `components/dash`), `KpiStrip` (one `featured`), `Grid cols={3}` of `ChartCard`s, `Grid aside`: `Section` + `DataTable` ("needs you") in main; `AsideCard`s (week, team, links) in aside |
| **Collection** | campaigns, creators, brands, deals, payouts, reports | `PageHeader plain` (crumbs, gold CTA in `actions`), `InlineState` for errors + Flash, `KpiStrip` from the loaded rows, `Grid aside`: `Section` → `FilterBar` + `FilterChips` → `DataTable` (with `empty`); aside: `AsideCard` insight (`Split`/`Donut`), share links, a `night` card |
| **Record** | a campaign, a deal, a creator, a brand | `PageHeader plain` (crumbs back to the collection, `meta` head stats, status `Pill`s in `children`), `StatusRail`, `Grid aside`: `Section`s with `Card`s / `DataTable`s (applicants, messages, ledger rows); aside: `AsideCard`s for facts, people (`Avatar`), next action |
| **Form** | new brief, profile, settings, signup | `PageHeader` (plain inside TeamShell; `hero` via PublicShell elsewhere), `FormSteps` for long forms, `Grid aside`: `Section` + `Card` holding the unchanged `<form>`; aside: `SummaryRail` (sticky). Auth screens: `PublicShell flush` + `SplitAuth` |
| **Insight** | marketplace health, finance, CPV, audit | `PageHeader` with `meta`, `KpiStrip` with `trend` + `spark`, `Grid cols={2|3}` of `ChartCard`s (`Bars`, `Donut`, `Split`), `Section` + `DataTable` for the breakdown, `AsideCard` notes on method and data sources |

The worked examples are `app/(net)/team/campaigns/page.jsx` (Collection) and `app/(net)/creator/login/page.jsx`
(SplitAuth). Copy their structure.

### Converting a page: checklist
1. Keep every query, server action, form field `name`, button text and route exactly as they are. Grep
   `tests/e2e` for the page's text and selectors first.
2. TeamShell pages: drop `title`/`eyebrow`/`actions` from `<TeamShell>` and render `<PageHeader>` as its first
   child. Pass `role={me.role}`.
3. Swap `.panel.kpi` grids for `KpiStrip`, `btn sm` tab rows for `FilterChips`, and `.opp` card lists or raw
   `<table class="tbl">` for `DataTable`. Swap `note bad` for `InlineState kind="error"`, except Flash
   (`.note.bad` is asserted in e2e).
4. Keep a single `.btn-foil` per view. Other actions use `btn plum`, `btn` or `btn sm`.
5. Check the page at 375px and 1440px, in light and dark mode, with no sideways scroll.
