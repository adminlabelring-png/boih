import { FlaskConical, ListChecks, UserCheck, QrCode, Recycle } from "lucide-react";
import { motion } from "framer-motion";

// Cosmetics changes first; the food-and-packaging ones (EPR, HFSS) sit in a
// greyed "Coming soon" card so they don't read as live for cosmetics brands.
const regulations = [
  {
    icon: FlaskConical,
    pill: "Phasing in 2025 to 2026",
    title: "Formaldehyde & CMR substance bans",
    body: "New restrictions on CMR substances and formaldehyde-releasing preservatives are taking effect. Labelring checks your ingredient list against the banned and restricted substance annexes and flags affected SKUs.",
  },
  {
    icon: ListChecks,
    pill: "From July 2026",
    title: "EU allergen labelling update",
    body: "The EU's expanded fragrance allergen list means more ingredients must be declared on products sold in the EU and Northern Ireland. Labelring checks your ingredient list against the new requirements.",
  },
  {
    icon: UserCheck,
    pill: "In force",
    title: "UK Cosmetics Regulation & Responsible Person",
    body: "Every product needs a named Responsible Person and compliant labelling. Labelring checks the fields that matter: Responsible Person, ingredients, warnings, batch, date marking and nominal content.",
  },
  {
    icon: QrCode,
    pill: "Phasing in 2026 to 2030",
    title: "EU Digital Product Passport",
    body: "Exporting to the EU will require a machine-readable product record. Labelring keeps your product data in one place, ready for a passport when your category is called up.",
  },
];

const RegulationCards = () => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
    {regulations.map((r, i) => (
      <motion.div
        key={r.title}
        initial={{ opacity: 0, y: 8 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ delay: i * 0.05 }}
        className="rounded-xl border bg-card p-6 space-y-3 border-l-2 border-l-primary"
      >
        <div className="flex items-center justify-between">
          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <r.icon className="h-4 w-4 text-primary" />
          </div>
          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-accent text-accent-foreground">
            {r.pill}
          </span>
        </div>
        <h3 className="font-semibold text-base">{r.title}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">{r.body}</p>
      </motion.div>
    ))}
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: regulations.length * 0.05 }}
      className="md:col-span-2 rounded-xl border border-dashed bg-muted/30 p-6 space-y-2 text-muted-foreground"
    >
      <div className="flex items-center justify-between">
        <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center">
          <Recycle className="h-4 w-4" />
        </div>
        <span className="text-[11px] font-medium px-2 py-0.5 rounded-full border bg-background">Coming soon</span>
      </div>
      <h3 className="font-semibold text-base">EPR & HFSS (Food & FMCG)</h3>
      <p className="text-sm leading-relaxed">
        Recycling labels and HFSS classification for food and packaged goods. Not part of the cosmetics checks yet.
      </p>
    </motion.div>
  </div>
);

export default RegulationCards;
