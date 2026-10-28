import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Product Information File: what Labelring does for a brand's PIF and what
// stays with labs and qualified safety assessors.

type Step = { title: string; detail: string; cost: string; labelring: string; who: "automated" | "partner" };

const steps: Step[] = [
  {
    title: "Collect product data",
    detail: "INCI, claims, packaging, process",
    cost: "Staff time, typically 1 to 3 weeks",
    labelring: "Scan or enter it once. Labelring structures it for the PIF.",
    who: "automated",
  },
  {
    title: "Find what's missing",
    detail: "Gaps in data, labels and claims",
    cost: "Usually inside a consultant's fee",
    labelring: "Flags every missing item automatically. You fix it in the platform.",
    who: "automated",
  },
  {
    title: "Build the PIF",
    detail: "The full compliance file",
    cost: "Bundled consultant services start around £250 + VAT per product",
    labelring: "Generates the PIF from your completed data.",
    who: "automated",
  },
  {
    title: "Lab testing",
    detail: "Stability and preservative efficacy",
    cost: "Quoted by the lab; varies by product",
    labelring: "Introduces you to a testing lab. Results feed back into your PIF.",
    who: "partner",
  },
  {
    title: "Safety assessment",
    detail: "CPSR Part B, signed by a qualified assessor",
    cost: "£180 to £700 per product",
    labelring: "Introduces you to an assessor and sends them a complete file.",
    who: "partner",
  },
  {
    title: "UK notification (SCPN)",
    detail: "Submitted by your Responsible Person",
    cost: "£19 government fee plus £50 to £150 service fee",
    labelring: "Prepares the notification data for your Responsible Person.",
    who: "partner",
  },
];

const howItWorks = [
  "Enter or scan your product data.",
  "Fix anything Labelring flags.",
  "Get your PIF.",
  "Get introduced to a lab or safety assessor when you're ready.",
];

const WhoBadge = ({ who }: { who: Step["who"] }) => (
  <span
    className={cn(
      "inline-flex shrink-0 items-center rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wider",
      who === "automated" ? "bg-primary text-primary-foreground" : "border border-foreground/30 text-foreground/70"
    )}
  >
    {who === "automated" ? "Automated" : "Partner"}
  </span>
);

const StepNumber = ({ n, who }: { n: number; who: Step["who"] }) => (
  <span
    className={cn(
      "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold",
      who === "automated" ? "bg-primary text-primary-foreground" : "bg-foreground/80 text-background"
    )}
  >
    {n}
  </span>
);

// The six PIF steps: a table on wide screens, cards on a phone.
const PifSteps = () => (
  <div className="rounded-2xl border bg-muted/30 p-4 md:p-6 space-y-3">
    <div className="hidden md:grid grid-cols-[auto_2.2fr_1.6fr_2fr_auto] gap-6 px-[17px] text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      <span className="w-10" aria-hidden />
      <span>Step</span>
      <span>Typical UK cost</span>
      <span>What Labelring does</span>
      <span className="w-28" aria-hidden />
    </div>
    <ol className="space-y-3">
      {steps.map((s, i) => (
        <li key={s.title} className="rounded-xl border bg-card p-4">
          <div className="flex items-start gap-4 md:grid md:grid-cols-[auto_2.2fr_1.6fr_2fr_auto] md:items-center md:gap-6">
            <StepNumber n={i + 1} who={s.who} />
            <div className="min-w-0 flex-1 space-y-2 md:contents">
              <div className="flex items-start justify-between gap-3 md:block">
                <div>
                  <p className="font-semibold">{s.title}</p>
                  <p className="text-sm text-muted-foreground">{s.detail}</p>
                </div>
                <span className="md:hidden">
                  <WhoBadge who={s.who} />
                </span>
              </div>
              <p className="text-sm">
                <span className="md:hidden text-muted-foreground">Typical UK cost: </span>
                {s.cost}
              </p>
              <p className="text-sm">
                <span className="md:hidden text-muted-foreground">Labelring: </span>
                {s.labelring}
              </p>
              <span className="hidden md:flex w-28 justify-end">
                <WhoBadge who={s.who} />
              </span>
            </div>
          </div>
        </li>
      ))}
    </ol>
  </div>
);

const PifSection = () => (
  <section id="product-information-file" className="space-y-8">
    <div className="max-w-3xl space-y-3">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">UK cosmetics compliance</p>
      <h2 className="text-2xl md:text-3xl font-bold tracking-tight">
        Get your Product Information File built in minutes, not weeks
      </h2>
      <p className="text-muted-foreground leading-relaxed">
        Labelring helps UK beauty, skincare and cosmetics brands prepare their Product Information File (PIF) without
        weeks of chasing data and emailing consultants.
      </p>
    </div>

    <div className="space-y-3">
      <p className="max-w-3xl text-sm text-muted-foreground leading-relaxed">
        Labelring automates the data collection and paperwork. Qualified assessors and labs still do the regulated work,
        and we connect you to them.
      </p>
      <PifSteps />
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="rounded-xl border bg-card p-6 space-y-3">
        <h3 className="text-lg font-semibold">What we do, and what we don't</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Labelring handles the data and the paperwork. Testing and safety sign-off are carried out by independent labs
          and qualified safety assessors, as UK law requires. We never replace them. We make their job faster and your
          file cleaner.
        </p>
      </div>
      <div className="rounded-xl border bg-card p-6 space-y-3">
        <h3 className="text-lg font-semibold">How it works</h3>
        <ol className="space-y-2">
          {howItWorks.map((step, i) => (
            <li key={step} className="flex items-start gap-3 text-sm">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
                {i + 1}
              </span>
              <span className="pt-0.5">{step}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>

    <div className="flex flex-wrap items-center gap-3">
      <a href="#early-access">
        <Button size="lg" className="gap-2">
          Get early access <ArrowRight className="h-4 w-4" />
        </Button>
      </a>
      <Link to="/scan">
        <Button variant="outline" size="lg" className="gap-2">
          Scan my label <ArrowRight className="h-4 w-4" />
        </Button>
      </Link>
    </div>
  </section>
);

export default PifSection;
