// A paper card that frames one chart (Bars, Donut, Split, Spark from components/dash/Charts) with a title,
// an optional period tag, an optional headline figure and a foot line. The charts carry their own aria-labels.
import { cx } from "./rich";

/** ChartCard({ title, period, figure, figureTitle, featured, children, foot, level }) */
export default function ChartCard({ title, period, figure, figureTitle, featured, children, foot, level = 3, className }) {
  const H = `h${level}`;
  return (
    <section className={cx("ui-chart", featured && "ui-chart--featured", className)}>
      <div className="ui-chart__head">
        <H className="ui-chart__title">{title}</H>
        {period && <span className="ui-chart__period">{period}</span>}
      </div>
      {figure != null && <p className={cx("ui-chart__fig", featured && "ui-foil")} title={figureTitle}>{figure}</p>}
      <div className="ui-chart__body">{children}</div>
      {foot && <div className="ui-chart__foot">{foot}</div>}
    </section>
  );
}
