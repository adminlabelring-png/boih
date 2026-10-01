import { NavLink, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Logo from "@/components/Logo";

const links = [
  { to: "/", label: "Home", end: true },
  { to: "/scan", label: "Scan" },
  { to: "/generate", label: "Generate" },
  { to: "/insights", label: "Insights" },
  { to: "/account", label: "Account" },

];

const PillNav = () => {
  return (
    <nav className="fixed top-4 left-1/2 -translate-x-1/2 z-40 hidden md:flex items-center gap-1 rounded-full border border-border bg-card/80 backdrop-blur-md shadow-lg px-2 py-1.5">
      <Link to="/" className="flex items-center pl-3 pr-4 py-1.5 border-r border-border/60 mr-1">
        <Logo iconClassName="h-4 w-4" textClassName="text-sm" />
      </Link>
      <div className="flex items-center gap-0.5">
        {links.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.end}
            className={({ isActive }) =>
              `px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
                isActive
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
              }`
            }
          >
            {l.label}
          </NavLink>
        ))}
      </div>
      <a href="/#early-access" className="ml-1">
        <Button size="sm" className="rounded-full h-8 px-4">Get started</Button>
      </a>

    </nav>
  );
};

export default PillNav;
