import { ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";

// Where Labelring sits between the brand and the regulated parties: it
// prepares the label (and, soon, the CPSR data pack); formulation review,
// legal sign-off and government submission stay with those parties.
const Box = ({
  title,
  body,
  highlight,
  badge,
}: {
  title: string;
  body: string;
  highlight?: boolean;
  badge?: string;
}) => (
  <div
    className={cn(
      "rounded-lg border px-3 py-2.5 text-center",
      highlight ? "border-primary bg-primary/10" : "bg-card"
    )}
  >
    <p className="text-sm font-semibold">{title}</p>
    <p className="text-xs text-muted-foreground mt-0.5">{body}</p>
    {badge && (
      <span className="inline-block mt-1.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full border bg-background text-muted-foreground">
        {badge}
      </span>
    )}
  </div>
);

const Arrow = () => (
  <div className="flex justify-center py-1 text-muted-foreground" aria-hidden="true">
    <ArrowDown className="h-4 w-4" />
  </div>
);

const Framework = () => (
  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
    <div className="space-y-4 text-muted-foreground leading-relaxed">
      <p>
        As a founder, I didn't want to build a platform that pretends to be your lawyer. Labelring handles the part
        that eats your time, getting your label right and, soon, your CPSR paperwork ready, so your Responsible
        Person and CPSR provider can do their job faster, not so you can skip them. Here's exactly where we fit.
      </p>
      <p>
        Labelring produces the compliant label, and soon the CPSR data pack, from the same product data. Everything
        after that, formulation review, legal sign-off and government submission, stays with external, regulated
        parties.
      </p>
    </div>
    <figure className="rounded-xl border bg-muted/20 p-4 sm:p-6">
      <figcaption className="sr-only">Labelring sits between the brand and the regulated parties</figcaption>
      <div className="mx-auto max-w-xs">
        <Box title="Brand" body="Uploads product info" />
        <Arrow />
        <Box title="Labelring" body="Scans, generates, assembles docs" highlight />
        <Arrow />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Box title="Compliant label" body="Print-ready, UK/EU" />
        </div>
        <div>
          <Box title="CPSR pack" body="Formulation, ingredients data" badge="Coming soon" />
          <Arrow />
          <Box title="CPSR provider" body="Checks formulation safety" />
          <Arrow />
          <Box title="Responsible Person" body="Named individual, legal sign-off" />
          <Arrow />
          <Box title="Government systems" body="SCPN (UK), CPNP (EU)" />
        </div>
      </div>
    </figure>
  </div>
);

export default Framework;
