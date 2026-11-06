import { useEffect, useLayoutEffect, useRef, useState } from "react";
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

// Compact once the page has scrolled past this, and open out again only
// back near the top (the gap stops it flickering at the threshold).
const COMPACT_AT = 40;
const EXPAND_AT = 8;
const FULL_WIDTH = 1200;
// When compact, the pilot button is just its round arrow (h-11 square).
const COMPACT_CTA = 44;
// Icon, its left padding, the gaps, the capsule padding and border.
const CAPSULE_EXTRA = 28 + 8 + 12 * 2 + 8 * 2 + 2;

const useCompact = () => {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const y = window.scrollY;
      setCompact((was) => (was ? y > EXPAND_AT : y > COMPACT_AT));
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
  return compact;
};

// The site header on every public page, the homepage included: logo on the
// left (it is the way home), a frosted-glass pill of links in the middle and
// the pilot button on the right. On scrolling down, the name fades, and the
// logo and the button (now just its arrow) slide in to join the pill as
// one floating capsule; it
// opens out again at the top of the page. On phones the links live in the
// bottom tab bar, so only the logo and the button show here.
const SiteHeader = () => {
  const compact = useCompact();
  const navRef = useRef<HTMLElement>(null);
  const [capsuleWidth, setCapsuleWidth] = useState<number | null>(null);

  // The capsule's width is measured so it can be animated (fit-content can't).
  useLayoutEffect(() => {
    const measure = () => {
      const nav = navRef.current?.offsetWidth ?? 0;
      setCapsuleWidth(nav ? nav + COMPACT_CTA + CAPSULE_EXTRA : null);
    };
    measure();
    window.addEventListener("resize", measure);
    document.fonts?.ready.then(measure).catch(() => {});
    return () => window.removeEventListener("resize", measure);
  }, []);

  const motion = "transition-all duration-300 ease-out motion-reduce:transition-none";

  return (
    <header
      className={cn(
        "sticky top-0 z-40",
        motion,
        compact ? "bg-transparent md:pt-3" : "bg-white/70 backdrop-blur-md",
        compact && "max-md:bg-white/90 max-md:backdrop-blur-lg max-md:shadow-[0_1px_0_rgba(20,32,29,0.06)]",
      )}
    >
      <div
        style={compact && capsuleWidth ? { maxWidth: capsuleWidth } : { maxWidth: FULL_WIDTH }}
        className={cn(
          "mx-auto flex items-center justify-between gap-3 border border-transparent",
          motion,
          compact
            ? "px-4 py-2 md:rounded-full md:border-[#D9E2DF] md:bg-white/75 md:px-2 md:py-1.5 md:shadow-[0_12px_32px_-12px_rgba(20,32,29,0.25),inset_0_1px_0_rgba(255,255,255,0.9)] md:backdrop-blur-xl"
            : "px-4 py-3 md:px-6",
        )}
      >
        <Link
          to="/"
          aria-label="Labelring home"
          className={cn(
            "inline-flex min-h-[44px] shrink-0 items-center text-xl font-bold tracking-[-0.02em] text-[#14201D] no-underline md:text-2xl",
            compact ? "md:pl-2" : "",
          )}
        >
          <LogoMark className="h-6 w-6 shrink-0 md:h-7 md:w-7" />
          <span
            aria-hidden={compact}
            className={cn(
              "overflow-hidden whitespace-nowrap",
              motion,
              compact ? "max-w-0 pl-0 opacity-0" : "max-w-[10rem] pl-2 opacity-100 md:pl-2.5",
            )}
          >
            Labelring
          </span>
        </Link>

        <nav
          ref={navRef}
          aria-label="Main"
          className={cn(
            "hidden items-center gap-1.5 rounded-full border p-1.5 md:flex",
            motion,
            compact
              ? "border-transparent bg-transparent shadow-none"
              : "border-[#D9E2DF] bg-[#F3F7F6]/70 shadow-[0_6px_24px_-10px_rgba(20,32,29,0.18),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-xl",
          )}
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
          aria-label="Book a 30-minute slot"
          title={compact ? "Book a 30-minute slot" : undefined}
          className={cn(
            "group inline-flex h-11 shrink-0 items-center rounded-full bg-[#0F6B5C] text-sm font-semibold text-white no-underline shadow-[0_6px_18px_-8px_rgba(15,107,92,0.7)] hover:bg-[#0A4D42] hover:text-white md:text-[15px]",
            motion,
            compact ? "w-11 justify-center px-1.5" : "pl-4 pr-1.5 md:pl-5",
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              "overflow-hidden whitespace-nowrap",
              motion,
              compact ? "max-w-0 pr-0 opacity-0" : "max-w-[14rem] pr-2 opacity-100",
            )}
          >
            Book a 30-minute slot
          </span>
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/20 transition-transform group-hover:translate-x-0.5">
            <ArrowRight className="h-4 w-4" />
          </span>
        </Link>
      </div>
    </header>
  );
};

export default SiteHeader;
