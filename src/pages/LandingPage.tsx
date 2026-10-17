import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Sparkles,
  CheckCircle2,
  ShieldCheck,
  ScanLine,
  Printer,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import ComparisonTable from "@/components/landing/ComparisonTable";
import RegulationCards from "@/components/landing/RegulationCards";
import EarlyAccessForm from "@/components/landing/EarlyAccessForm";
import LandingFooter from "@/components/landing/LandingFooter";
import HeroCheckCard from "@/components/landing/HeroCheckCard";
import Framework from "@/components/landing/Framework";
import ComplianceSources from "@/components/landing/ComplianceSources";
import { useSeo } from "@/hooks/use-seo";

const cosmeticsChecks = [
  "UK Cosmetics Regulation & EU rules",
  "Responsible Person & CMR substance checks",
  "Fragrance allergens & claims",
  "One product record, a version per market (GB, NI, EU)",
];

const howItWorks = [
  {
    icon: ScanLine,
    title: "1. Scan or start a label",
    body: "Upload photos of your current label, or start a new one in the label builder.",
  },
  {
    icon: ShieldCheck,
    title: "2. See what needs action",
    body: "Every check is marked: action needed, couldn't check, or meets the rule, with the fix and the legal source.",
  },
  {
    icon: Printer,
    title: "3. Print with confidence",
    body: "Get a print-ready label for each market, then hand it to your Responsible Person for sign-off.",
  },
];

const LandingPage = () => {
  useSeo({
    title: "Labelring | Cosmetics Label Compliance",
    description:
      "Check your cosmetics label against UK and EU cosmetics rules, or generate a new one: Responsible Person, ingredients, fragrance allergens, CMR substances and warnings.",
    path: "/",
  });

  return (
    <div className="space-y-14 pb-4">
      {/* HERO */}
      <section className="relative overflow-hidden rounded-2xl border bg-card">
        <div
          className="absolute inset-0 opacity-60 pointer-events-none"
          style={{
            background:
              "radial-gradient(1200px 400px at 20% -10%, hsl(var(--accent)) 0%, transparent 60%), radial-gradient(800px 300px at 100% 0%, hsl(var(--muted)) 0%, transparent 55%)",
          }}
        />
        <div className="relative grid grid-cols-1 lg:grid-cols-5 gap-8 p-8 md:p-12">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="lg:col-span-3 space-y-6"
          >
            <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border bg-background text-muted-foreground">
              <Sparkles className="h-3 w-3" /> Early access · UK & EU cosmetics 2026
            </span>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight leading-[1.05]">
              Check your cosmetics label before the regulator does
            </h1>
            <p className="text-lg text-muted-foreground max-w-xl leading-relaxed">
              Scan your label or generate a new one, checked against UK and EU cosmetics rules, in minutes.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Link to="/scan">
                <Button size="lg" className="gap-2">
                  Scan my label
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link to="/generate">
                <Button variant="outline" size="lg" className="gap-2">
                  Generate a label
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <a href="#early-access">
                <Button variant="ghost" size="lg" className="gap-1">
                  Request early access <ArrowRight className="h-4 w-4" />
                </Button>
              </a>
            </div>

            <div className="flex flex-wrap gap-4 pt-2 text-xs text-muted-foreground">
              {["UK Cosmetics Regulation", "EU allergen update", "Responsible Person checks", "CMR & restricted substances"].map((t) => (
                <span key={t} className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-[hsl(var(--risk-low))]" /> {t}
                </span>
              ))}
            </div>
          </motion.div>

          {/* Mock compliance card */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="lg:col-span-2"
          >
            <HeroCheckCard />
          </motion.div>
        </div>
      </section>

      {/* PROBLEM / COMPARISON */}
      <section className="space-y-5">
        <div className="max-w-2xl">
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight">
            Cosmetics labelling is getting harder, and more expensive to get wrong.
          </h2>
        </div>
        <ComparisonTable />
      </section>

      {/* WHO IT'S FOR */}
      <section className="space-y-5">
        <div className="max-w-2xl">
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight">
            Built for cosmetics brands, with FMCG on the way.
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="rounded-xl border-2 border-primary bg-primary/5 p-6 space-y-4"
          >
            <div className="text-3xl">💄</div>
            <h3 className="font-semibold text-base">Cosmetics & Wellness</h3>
            <ul className="space-y-2">
              {cosmeticsChecks.map((c) => (
                <li key={c} className="flex items-start gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-primary" /> {c}
                </li>
              ))}
            </ul>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Skincare, haircare, makeup, fragrance and solid-format products. Exporting to the EU? Each market gets its
              own version with the right Responsible Person and language.
            </p>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.05 }}
            className="rounded-xl border border-dashed bg-muted/30 p-6 space-y-4 text-muted-foreground"
          >
            <span className="inline-block text-[11px] font-medium px-2 py-0.5 rounded-full border bg-background">Coming soon</span>
            <h3 className="font-semibold text-base text-foreground/80">Food & FMCG</h3>
            <p className="text-sm leading-relaxed">Allergens, nutrition, HFSS, EPR recycling labels.</p>
            <a href="#early-access" className="inline-flex items-center gap-1 text-sm font-medium text-foreground hover:underline underline-offset-2">
              Join early access to be first in line <ArrowRight className="h-3.5 w-3.5" />
            </a>
          </motion.div>
        </div>
      </section>

      {/* REGULATION WAVES */}
      <section className="space-y-5">
        <div className="max-w-2xl">
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight">
            The regulatory changes cosmetics brands face.
          </h2>
        </div>
        <RegulationCards />
      </section>

      {/* HOW IT WORKS */}
      <section id="how-it-works" className="space-y-5">
        <div className="max-w-2xl">
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight">How Labelring works</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {howItWorks.map((s, i) => (
            <motion.div
              key={s.title}
              initial={{ opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05 }}
              className="rounded-xl border bg-card p-6 space-y-3"
            >
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <s.icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="font-semibold">{s.title}</h3>
              <p className="text-sm text-muted-foreground">{s.body}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* FRAMEWORK */}
      <section className="space-y-5">
        <div className="max-w-2xl">
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Where Labelring sits</h2>
        </div>
        <Framework />
      </section>

      {/* SOURCES */}
      <section className="space-y-5">
        <div className="max-w-2xl">
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Where our compliance info comes from</h2>
        </div>
        <ComplianceSources />
      </section>

      {/* EARLY ACCESS */}
      <section id="early-access" className="space-y-5">
        <div className="max-w-2xl">
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight">
            Join the brands getting compliant before the deadline.
          </h2>
          <p className="text-muted-foreground mt-3 leading-relaxed">
            We're working with a small group of UK cosmetics brands ahead of public launch. Early access includes free onboarding support and a compliance audit of your existing labels.
          </p>
        </div>
        <EarlyAccessForm />
      </section>

      <LandingFooter />
    </div>
  );
};

export default LandingPage;
