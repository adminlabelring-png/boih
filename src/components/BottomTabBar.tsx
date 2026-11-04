import { NavLink } from "react-router-dom";
import { ScanLine, Sparkles, BookOpen, UserRound } from "lucide-react";

const tabs = [
  { to: "/scan", icon: ScanLine, label: "Scan" },
  { to: "/generate", icon: Sparkles, label: "Generate" },
  { to: "/insights", icon: BookOpen, label: "Insights" },
  { to: "/account", icon: UserRound, label: "Account" },
];

const BottomTabBar = () => {
  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-card/95 backdrop-blur-md"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="grid grid-cols-4">

        {tabs.map((t) => (
          <li key={t.to}>
            <NavLink
              to={t.to}
                            className={({ isActive }) =>
                `flex flex-col items-center justify-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors ${
                  isActive ? "text-primary" : "text-muted-foreground"
                }`
              }
            >
              <t.icon className="h-5 w-5" />
              {t.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
};

export default BottomTabBar;
