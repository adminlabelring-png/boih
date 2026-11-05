import { Link, NavLink } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { LogoMark } from "@/components/Logo";
import { cn } from "@/lib/utils";

const links = [
  { to: "/scan", label: "Scan" },
  { to: "/generate", label: "Generate" },
  { to: "/insights", label: "Insights" },
  { to: "/account", label: "Account" },
];

// The site header on every public page, the homepage included: logo on the
// left (it is the way home), a frosted-glass pill of links in the middle and
// the pilot button on the right. On phones the links live in the bottom tab
// bar, so only the logo and the button show here.
const SiteHeader = () => (
  <header className="sticky top-0 z-40 bg-white/70 backdrop-blur-md">
    <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-3 px-4 py-3 md:px-6">
      <Link
        to="/"
        aria-label="Labelring home"
        className="inline-flex min-h-[44px] shrink-0 items-center gap-2 text-xl font-bold tracking-[-0.02em] text-[#14201D] no-underline md:gap-2.5 md:text-2xl"
      >
        <LogoMark className="h-6 w-6 shrink-0 md:h-7 md:w-7" />
        Labelring
      </Link>

      <nav
        aria-label="Main"
        className="hidden items-center gap-1.5 rounded-full border border-[#D9E2DF] bg-[#F3F7F6]/70 p-1.5 shadow-[0_6px_24px_-10px_rgba(20,32,29,0.18),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-xl md:flex"
      >
        {links.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            className={({ isActive }) =>
              cn(
                "inline-flex h-10 items-center rounded-full px-5 text-[15px] font-medium no-underline transition-colors",
                "shadow-[0_1px_2px_rgba(20,32,29,0.06),0_0_14px_rgba(255,255,255,0.95),inset_0_0_0_1px_rgba(255,255,255,0.9)]",
                isActive
                  ? "bg-[#E3F1EE] text-[#0A4D42]"
                  : "bg-gradient-to-b from-white to-[#F7FAF9] text-[#14201D] hover:text-[#0F6B5C]",
              )
            }
          >
            {l.label}
          </NavLink>
        ))}
      </nav>

      <Link
        to="/#pilot"
        className="group inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-[#0F6B5C] pl-4 pr-1.5 text-sm font-semibold text-white no-underline shadow-[0_6px_18px_-8px_rgba(15,107,92,0.7)] transition-colors hover:bg-[#0A4D42] hover:text-white md:pl-5 md:text-[15px]"
      >
        Book a 30-minute slot
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/20 transition-transform group-hover:translate-x-0.5">
          <ArrowRight className="h-4 w-4" />
        </span>
      </Link>
    </div>
  </header>
);

export default SiteHeader;
