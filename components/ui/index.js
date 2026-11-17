// Colatch Connect UI kit: shared, presentational, server-safe components for every screen.
// Usage: import { PageHeader, KpiStrip, DataTable } from "@/components/ui";  Docs: components/ui/README.md
// Styles live in app/net.css between `/* === ui kit === */` and `/* end ui kit */` (classes prefixed ui-).
export { default as PageHeader, Crumbs, HeadStats } from "./PageHeader";
export { default as KpiStrip, Trend } from "./KpiStrip";
export { default as ChartCard } from "./ChartCard";
export { FilterBar, FilterChips } from "./Filters";
export { default as DataTable, Cell, Figure } from "./DataTable";
export { default as StatusRail } from "./StatusRail";
export { Grid, Section, Card, AsideCard } from "./Layout";
export { default as EmptyState, InlineState } from "./EmptyState";
export { default as SplitAuth } from "./SplitAuth";
export { FormSteps, SummaryRail } from "./FormSteps";
export { Pill, Tag, Tags, Avatar, initialsOf } from "./Bits";
export { default as Pager, paginate, pageHref } from "./Pager";
export { rich, plain } from "./rich";
// The dashboard charts, re-exported so pages import everything from one place.
export { Bars, Donut, Spark, Split, ringColor } from "@/components/dash/Charts";
