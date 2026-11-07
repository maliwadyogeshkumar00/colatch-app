import "../net.css";
import Brand from "./_ui/Brand";

export const dynamic = "force-dynamic";

export default function NetLayout({ children }) {
  return (
    <div className="net">
      <Brand />
      {children}
    </div>
  );
}
