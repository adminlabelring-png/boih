import { useState } from "react";
import { Link } from "react-router-dom";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { markLeadSubmitted } from "@/components/LeadCaptureDialog";
import { useSeo } from "@/hooks/use-seo";
import { LogoMark } from "@/components/Logo";

// The homepage, built to the "Labelring Homepage Redesign" design: its own
// header and footer (no app nav), Inter, and the design's colours. Pilot
// sign-ups go to early_access_signups like the early-access form did, so
// they still reach Odoo.

const PILOT_CATEGORIES = ["Skincare", "Makeup", "Fragrance", "Sun care", "Haircare", "Other"] as const;

const pilotSchema = z.object({
  name: z.string().trim().min(1, "Please enter your name").max(100),
  email: z.string().trim().email("Please enter a valid email").max(255),
  company: z.string().trim().min(1, "Please enter your brand or company").max(200),
  product_category: z.enum(PILOT_CATEGORIES),
});

const labelStyle = { display: "block", fontSize: "15px", fontWeight: "600", marginBottom: "6px" } as const;
const fieldStyle = {
  width: "100%",
  boxSizing: "border-box",
  minHeight: "48px",
  padding: "12px 14px",
  border: "1px solid #6F847E",
  borderRadius: "8px",
  fontSize: "16px",
  fontFamily: "inherit",
  background: "#FFFFFF",
  color: "#14201D",
} as const;
const errorStyle = { margin: "6px 0 0", fontSize: "14px", color: "#B3261E" } as const;

const PilotForm = () => {
  const [values, setValues] = useState({ name: "", email: "", company: "", product_category: "Skincare" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [state, setState] = useState<"form" | "done" | "error">("form");
  const set = (k: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setValues((v) => ({ ...v, [k]: e.target.value }));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = pilotSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrors({});
    setSubmitting(true);
    const { name, email, company, product_category } = parsed.data;
    const { error } = await supabase.from("early_access_signups").insert([{ name, email, company, product_category }]);
    setSubmitting(false);
    if (error) {
      setState("error");
      return;
    }
    markLeadSubmitted();
    setState("done");
  };

  if (state === "done") {
    return (
      <div role="status" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <p style={{ margin: "0", fontSize: "21px", fontWeight: "600" }}>Thanks, we have your details.</p>
        <p style={{ margin: "0", fontSize: "16px", color: "#4A5A56" }}>
          We will email you to pick a time for a 30-minute chat.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
      <div>
        <label htmlFor="pilot-name" style={labelStyle}>Your name</label>
        <input id="pilot-name" type="text" autoComplete="name" maxLength={100} value={values.name} onChange={set("name")} style={fieldStyle} />
        {errors.name && <p style={errorStyle}>{errors.name}</p>}
      </div>
      <div>
        <label htmlFor="pilot-email" style={labelStyle}>Work email</label>
        <input id="pilot-email" type="email" autoComplete="email" maxLength={255} value={values.email} onChange={set("email")} style={fieldStyle} />
        {errors.email && <p style={errorStyle}>{errors.email}</p>}
      </div>
      <div>
        <label htmlFor="pilot-company" style={labelStyle}>Brand or company</label>
        <input id="pilot-company" type="text" autoComplete="organization" maxLength={200} value={values.company} onChange={set("company")} style={fieldStyle} />
        {errors.company && <p style={errorStyle}>{errors.company}</p>}
      </div>
      <div>
        <label htmlFor="pilot-category" style={labelStyle}>Product category</label>
        <select id="pilot-category" value={values.product_category} onChange={set("product_category")} style={fieldStyle}>
          {PILOT_CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        disabled={submitting}
        style={{ background: "#0F6B5C", color: "#FFFFFF", border: "0", borderRadius: "10px", minHeight: "52px", fontSize: "17px", fontWeight: "600", fontFamily: "inherit", cursor: submitting ? "wait" : "pointer", opacity: submitting ? 0.8 : 1 }}
      >
        {submitting ? "Sending…" : "Book a 30-minute slot"}
      </button>
      {state === "error" && (
        <p role="alert" style={errorStyle}>Something went wrong. Please try again in a moment.</p>
      )}
      <p style={{ margin: "0", fontSize: "13px", color: "#4A5A56" }}>By continuing you agree that Labelring may use your details to contact you about the pilot. We handle your data under UK GDPR.</p>
    </form>
  );
};

const LandingPage = () => {
  useSeo({
    title: "Labelring | Cosmetics Label Compliance",
    description:
      "Labelling and paperwork for UK cosmetics brands. Check a label you already have, or start a new one, against UK and EU cosmetics rules.",
    path: "/",
  });

  return (
    <div className="lr-home" style={{ width: "100%", background: "#FFFFFF", color: "#14201D", fontFamily: "'Inter', system-ui, sans-serif", fontSize: "17px", lineHeight: "1.55" }}>
      {/* The site's heading font and letter forms don't apply here. */}
      <style>{`.lr-home{font-feature-settings:normal}.lr-home h1,.lr-home h2,.lr-home h3{font-family:inherit;letter-spacing:normal}.lr-home a{color:#0F6B5C}.lr-home a:hover{color:#0A4D42}`}</style>
        {/* HEADER */}
        <header style={{ borderBottom: "1px solid #D9E2DF", background: "#FFFFFF" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "12px 24px", boxSizing: "border-box", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "12px 24px" }}>
        <Link to="/" style={{ fontWeight: "700", fontSize: "24px", letterSpacing: "-0.02em", color: "#14201D", textDecoration: "none", minHeight: "44px", display: "inline-flex", alignItems: "center", gap: "10px" }}><LogoMark className="h-7 w-7 shrink-0" />Labelring</Link>
        <nav style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 20px" }}>
        <Link to="/scan" style={{ color: "#14201D", textDecoration: "none", fontWeight: "500", minHeight: "44px", display: "inline-flex", alignItems: "center" }}>Scan</Link>
        <Link to="/generate" style={{ color: "#14201D", textDecoration: "none", fontWeight: "500", minHeight: "44px", display: "inline-flex", alignItems: "center" }}>Generate</Link>
        <Link to="/insights" style={{ color: "#14201D", textDecoration: "none", fontWeight: "500", minHeight: "44px", display: "inline-flex", alignItems: "center" }}>Insights</Link>
        <Link to="/account" style={{ color: "#14201D", textDecoration: "none", fontWeight: "500", minHeight: "44px", display: "inline-flex", alignItems: "center" }}>Account</Link>
        </nav>
        <a href="#pilot" style={{ background: "#0F6B5C", color: "#FFFFFF", textDecoration: "none", fontWeight: "600", fontSize: "16px", padding: "0 20px", minHeight: "44px", borderRadius: "8px", display: "inline-flex", alignItems: "center", boxSizing: "border-box" }}>Book a 30-minute slot</a>
        </div>
        </header>

        <main>

        {/* HERO */}
        <section style={{ padding: "80px 0 72px" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 24px", boxSizing: "border-box", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "48px" }}>
        <div style={{ flex: "1 1 460px", minWidth: "0" }}>
        <p style={{ margin: "0 0 16px", fontSize: "14px", fontWeight: "600", letterSpacing: "0.08em", textTransform: "uppercase", color: "#0F6B5C" }}>Pilot open · UK &amp; EU cosmetics</p>
        <h1 style={{ margin: "0 0 20px", fontSize: "clamp(36px, 5vw, 58px)", lineHeight: "1.06", letterSpacing: "-0.03em", fontWeight: "700", color: "#14201D" }}>Labelling and paperwork for UK cosmetics brands.</h1>
        <p style={{ margin: "0 0 32px", fontSize: "20px", color: "#4A5A56", maxWidth: "560px" }}>Check a label you already have, or start a new one, against UK and EU cosmetics rules. Label checks and label generation are live. Product Information Files come next.</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
        <Link to="/scan" style={{ background: "#0F6B5C", color: "#FFFFFF", textDecoration: "none", fontWeight: "600", padding: "0 24px", minHeight: "52px", borderRadius: "10px", display: "inline-flex", alignItems: "center", boxSizing: "border-box" }}>Scan my label</Link>
        <a href="#pilot" style={{ background: "#FFFFFF", color: "#0F6B5C", textDecoration: "none", fontWeight: "600", padding: "0 24px", minHeight: "52px", borderRadius: "10px", border: "1.5px solid #0F6B5C", display: "inline-flex", alignItems: "center", boxSizing: "border-box" }}>Book a 30-minute slot</a>
        </div>
        </div>
        <div style={{ flex: "1 1 460px", minWidth: "0", background: "#F3F7F6", border: "1px solid #D9E2DF", borderRadius: "20px", padding: "28px", boxSizing: "border-box" }}>
        <div style={{ background: "#FFFFFF", border: "1px solid #D9E2DF", borderRadius: "14px", padding: "24px", boxSizing: "border-box" }}>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "baseline", gap: "8px" }}>
        <div>
        <p style={{ margin: "0", fontSize: "13px", fontWeight: "600", letterSpacing: "0.08em", textTransform: "uppercase", color: "#4A5A56" }}>Example label check</p>
        <p style={{ margin: "4px 0 0", fontSize: "20px", fontWeight: "600" }}>30 ml face serum</p>
        </div>
        <p style={{ margin: "0", fontSize: "15px", color: "#4A5A56" }}><strong style={{ color: "#14201D" }}>3 of 5</strong> checks met</p>
        </div>
        <div style={{ marginTop: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", padding: "14px 0", borderTop: "1px solid #E5ECEA" }}><span style={{ fontSize: "16px" }}>Responsible Person address</span><span style={{ fontSize: "13px", fontWeight: "600", color: "#0A4D42", background: "#E3F1EE", borderRadius: "999px", padding: "4px 12px", whiteSpace: "nowrap" }}>Meets rule</span></div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", padding: "14px 0", borderTop: "1px solid #E5ECEA" }}><span style={{ fontSize: "16px" }}>Fragrance allergens (EU 2026)</span><span style={{ fontSize: "13px", fontWeight: "600", color: "#0A4D42", background: "#E3F1EE", borderRadius: "999px", padding: "4px 12px", whiteSpace: "nowrap" }}>Meets rule</span></div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", padding: "14px 0", borderTop: "1px solid #E5ECEA" }}><span style={{ fontSize: "16px" }}>PAO / date of minimum durability</span><span style={{ fontSize: "13px", fontWeight: "600", color: "#8A3F00", background: "#FFF1E0", borderRadius: "999px", padding: "4px 12px", whiteSpace: "nowrap" }}>Action needed</span></div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", padding: "14px 0", borderTop: "1px solid #E5ECEA" }}><span style={{ fontSize: "16px" }}>Nominal content</span><span style={{ fontSize: "13px", fontWeight: "600", color: "#0A4D42", background: "#E3F1EE", borderRadius: "999px", padding: "4px 12px", whiteSpace: "nowrap" }}>Meets rule</span></div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", padding: "14px 0", borderTop: "1px solid #E5ECEA" }}><span style={{ fontSize: "16px" }}>INCI ingredient list</span><span style={{ fontSize: "13px", fontWeight: "600", color: "#8A3F00", background: "#FFF1E0", borderRadius: "999px", padding: "4px 12px", whiteSpace: "nowrap" }}>Action needed</span></div>
        </div>
        </div>
        </div>
        </div>
        </section>

        {/* PROOF STRIP */}
        <section style={{ borderTop: "1px solid #D9E2DF", borderBottom: "1px solid #D9E2DF", background: "#FFFFFF" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "36px 24px", boxSizing: "border-box", display: "flex", flexWrap: "wrap", gap: "32px" }}>
        <div style={{ flex: "1 1 220px", minWidth: "0" }}><p style={{ margin: "0", fontSize: "24px", lineHeight: "1.25", fontWeight: "700", letterSpacing: "-0.02em", color: "#0F6B5C" }}>Great Britain, Northern Ireland and the EU</p><p style={{ margin: "6px 0 0", fontSize: "15px", color: "#4A5A56" }}>One product record for all three markets</p></div>
        <div style={{ flex: "1 1 220px", minWidth: "0" }}><p style={{ margin: "0", fontSize: "34px", fontWeight: "700", letterSpacing: "-0.02em", color: "#0F6B5C" }}>Minutes</p><p style={{ margin: "6px 0 0", fontSize: "15px", color: "#4A5A56" }}>To scan a label and see what needs action</p></div>
        <div style={{ flex: "1 1 220px", minWidth: "0" }}><p style={{ margin: "0", fontSize: "34px", fontWeight: "700", letterSpacing: "-0.02em", color: "#0F6B5C" }}>Free</p><p style={{ margin: "6px 0 0", fontSize: "15px", color: "#4A5A56" }}>During the pilot, with onboarding and a label audit</p></div>
        <div style={{ flex: "1 1 220px", minWidth: "0" }}><p style={{ margin: "0", fontSize: "34px", fontWeight: "700", letterSpacing: "-0.02em", color: "#0F6B5C" }}>3</p><p style={{ margin: "6px 0 0", fontSize: "15px", color: "#4A5A56" }}>Pilot places open for UK cosmetics brands</p></div>
        </div>
        </section>

        {/* WHAT LABELRING DOES */}
        <section style={{ padding: "88px 0", background: "#FFFFFF" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 24px", boxSizing: "border-box" }}>
        <p style={{ margin: "0 0 12px", fontSize: "14px", fontWeight: "600", letterSpacing: "0.08em", textTransform: "uppercase", color: "#0F6B5C" }}>What Labelring does</p>
        <h2 style={{ margin: "0 0 16px", fontSize: "clamp(30px, 4vw, 42px)", lineHeight: "1.12", letterSpacing: "-0.02em", fontWeight: "700" }}>Six parts of cosmetics compliance, in one place.</h2>
        <p style={{ margin: "0 0 48px", fontSize: "19px", color: "#4A5A56", maxWidth: "680px" }}>Four are live today. Two are coming soon.</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "20px" }}>

        <div style={{ flex: "1 1 340px", minWidth: "0", boxSizing: "border-box", border: "1px solid #D9E2DF", borderRadius: "14px", padding: "28px", display: "flex", flexDirection: "column", gap: "12px" }}>
        <p style={{ margin: "0", fontSize: "13px", fontWeight: "600", letterSpacing: "0.08em", textTransform: "uppercase", color: "#0F6B5C" }}>Scan</p>
        <h3 style={{ margin: "0", fontSize: "21px", fontWeight: "600", lineHeight: "1.3" }}>Upload a label. See what needs fixing.</h3>
        <p style={{ margin: "0", fontSize: "16px", color: "#4A5A56" }}>Upload a JPG, PNG or PDF and get a result for each check, before you print.</p>
        <Link to="/scan" style={{ color: "#0F6B5C", fontWeight: "600", textDecoration: "none", marginTop: "auto", minHeight: "44px", display: "inline-flex", alignItems: "center" }}>Scan my label &rarr;</Link>
        </div>

        <div style={{ flex: "1 1 340px", minWidth: "0", boxSizing: "border-box", border: "1px solid #D9E2DF", borderRadius: "14px", padding: "28px", display: "flex", flexDirection: "column", gap: "12px" }}>
        <p style={{ margin: "0", fontSize: "13px", fontWeight: "600", letterSpacing: "0.08em", textTransform: "uppercase", color: "#0F6B5C" }}>Generate</p>
        <h3 style={{ margin: "0", fontSize: "21px", fontWeight: "600", lineHeight: "1.3" }}>Start a new label with the rules built in.</h3>
        <p style={{ margin: "0", fontSize: "16px", color: "#4A5A56" }}>Build a label for Great Britain, Northern Ireland or the EU from one product record.</p>
        <Link to="/generate" style={{ color: "#0F6B5C", fontWeight: "600", textDecoration: "none", marginTop: "auto", minHeight: "44px", display: "inline-flex", alignItems: "center" }}>Generate a label &rarr;</Link>
        </div>

        <div style={{ flex: "1 1 340px", minWidth: "0", boxSizing: "border-box", border: "1px solid #D9E2DF", borderRadius: "14px", padding: "28px", display: "flex", flexDirection: "column", gap: "12px" }}>
        <p style={{ margin: "0", fontSize: "13px", fontWeight: "600", letterSpacing: "0.08em", textTransform: "uppercase", color: "#0F6B5C" }}>Responsible Person</p>
        <h3 style={{ margin: "0", fontSize: "21px", fontWeight: "600", lineHeight: "1.3" }}>Make sure the right address is on your label.</h3>
        <p style={{ margin: "0", fontSize: "16px", color: "#4A5A56" }}>Checks the Responsible Person details that UK and EU cosmetics labels need.</p>
        <Link to="/insights/blog-cosmetics-responsible-person-uk" style={{ color: "#0F6B5C", fontWeight: "600", textDecoration: "none", marginTop: "auto", minHeight: "44px", display: "inline-flex", alignItems: "center" }}>Read the guide &rarr;</Link>
        </div>

        <div style={{ flex: "1 1 340px", minWidth: "0", boxSizing: "border-box", border: "1px solid #D9E2DF", borderRadius: "14px", padding: "28px", display: "flex", flexDirection: "column", gap: "12px" }}>
        <p style={{ margin: "0", fontSize: "13px", fontWeight: "600", letterSpacing: "0.08em", textTransform: "uppercase", color: "#0F6B5C" }}>Allergens and CMR</p>
        <h3 style={{ margin: "0", fontSize: "21px", fontWeight: "600", lineHeight: "1.3" }}>Catch restricted substances early.</h3>
        <p style={{ margin: "0", fontSize: "16px", color: "#4A5A56" }}>Flags fragrance allergens under the EU 2026 update, plus CMR and other restricted substances.</p>
        <a href="#changes" style={{ color: "#0F6B5C", fontWeight: "600", textDecoration: "none", marginTop: "auto", minHeight: "44px", display: "inline-flex", alignItems: "center" }}>See what is changing &rarr;</a>
        </div>

        <div style={{ flex: "1 1 340px", minWidth: "0", boxSizing: "border-box", border: "1px solid #D9E2DF", borderRadius: "14px", padding: "28px", display: "flex", flexDirection: "column", gap: "12px", background: "#F8FAF9" }}>
        <p style={{ margin: "0", fontSize: "13px", fontWeight: "600", letterSpacing: "0.08em", textTransform: "uppercase", color: "#0F6B5C" }}>Product Information File <span style={{ display: "inline-block", fontSize: "12px", fontWeight: "600", color: "#8A3F00", background: "#FFF1E0", borderRadius: "999px", padding: "3px 10px", marginLeft: "8px", textTransform: "none", letterSpacing: "0" }}>Coming soon</span></p>
        <h3 style={{ margin: "0", fontSize: "21px", fontWeight: "600", lineHeight: "1.3" }}>Build your PIF from the data you already have.</h3>
        <p style={{ margin: "0", fontSize: "16px", color: "#4A5A56" }}>Enter product data once. Labelring flags what is missing and assembles the file.</p>
        <Link to="/insights/blog-cosmetic-product-information-file" style={{ color: "#0F6B5C", fontWeight: "600", textDecoration: "none", marginTop: "auto", minHeight: "44px", display: "inline-flex", alignItems: "center" }}>What goes in a PIF &rarr;</Link>
        </div>

        <div style={{ flex: "1 1 340px", minWidth: "0", boxSizing: "border-box", border: "1px solid #D9E2DF", borderRadius: "14px", padding: "28px", display: "flex", flexDirection: "column", gap: "12px", background: "#F8FAF9" }}>
        <p style={{ margin: "0", fontSize: "13px", fontWeight: "600", letterSpacing: "0.08em", textTransform: "uppercase", color: "#0F6B5C" }}>Partners <span style={{ display: "inline-block", fontSize: "12px", fontWeight: "600", color: "#8A3F00", background: "#FFF1E0", borderRadius: "999px", padding: "3px 10px", marginLeft: "8px", textTransform: "none", letterSpacing: "0" }}>Coming soon</span></p>
        <h3 style={{ margin: "0", fontSize: "21px", fontWeight: "600", lineHeight: "1.3" }}>Get introduced to safety assessors and labs.</h3>
        <p style={{ margin: "0", fontSize: "16px", color: "#4A5A56" }}>They do the regulated work. Labelring handles the data and the paperwork around it.</p>
        <a href="#pilot" style={{ color: "#0F6B5C", fontWeight: "600", textDecoration: "none", marginTop: "auto", minHeight: "44px", display: "inline-flex", alignItems: "center" }}>Join the pilot &rarr;</a>
        </div>

        </div>
        </div>
        </section>

        {/* WHERE TO START */}
        <section style={{ padding: "88px 0", background: "#F3F7F6" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 24px", boxSizing: "border-box" }}>
        <p style={{ margin: "0 0 12px", fontSize: "14px", fontWeight: "600", letterSpacing: "0.08em", textTransform: "uppercase", color: "#0F6B5C" }}>Where to start</p>
        <h2 style={{ margin: "0 0 48px", fontSize: "clamp(30px, 4vw, 42px)", lineHeight: "1.12", letterSpacing: "-0.02em", fontWeight: "700" }}>Pick the step that fits where you are.</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "20px" }}>
        <div style={{ flex: "1 1 340px", minWidth: "0", boxSizing: "border-box", background: "#FFFFFF", border: "1px solid #D9E2DF", borderRadius: "14px", padding: "32px", display: "flex", flexDirection: "column", gap: "12px" }}>
        <p style={{ margin: "0", fontSize: "44px", fontWeight: "700", letterSpacing: "-0.03em", color: "#0F6B5C", lineHeight: "1" }}>01</p>
        <h3 style={{ margin: "0", fontSize: "24px", fontWeight: "600" }}>Check</h3>
        <p style={{ margin: "0", fontSize: "16px", color: "#4A5A56" }}>Scan a label you already have and see what needs action.</p>
        <Link to="/scan" style={{ color: "#0F6B5C", fontWeight: "600", textDecoration: "none", marginTop: "auto", minHeight: "44px", display: "inline-flex", alignItems: "center" }}>Scan my label &rarr;</Link>
        </div>
        <div style={{ flex: "1 1 340px", minWidth: "0", boxSizing: "border-box", background: "#FFFFFF", border: "1px solid #D9E2DF", borderRadius: "14px", padding: "32px", display: "flex", flexDirection: "column", gap: "12px" }}>
        <p style={{ margin: "0", fontSize: "44px", fontWeight: "700", letterSpacing: "-0.03em", color: "#0F6B5C", lineHeight: "1" }}>02</p>
        <h3 style={{ margin: "0", fontSize: "24px", fontWeight: "600" }}>Build</h3>
        <p style={{ margin: "0", fontSize: "16px", color: "#4A5A56" }}>Starting a new product? Generate a label with the rules built in.</p>
        <Link to="/generate" style={{ color: "#0F6B5C", fontWeight: "600", textDecoration: "none", marginTop: "auto", minHeight: "44px", display: "inline-flex", alignItems: "center" }}>Generate a label &rarr;</Link>
        </div>
        <div style={{ flex: "1 1 340px", minWidth: "0", boxSizing: "border-box", background: "#FFFFFF", border: "1px solid #D9E2DF", borderRadius: "14px", padding: "32px", display: "flex", flexDirection: "column", gap: "12px" }}>
        <p style={{ margin: "0", fontSize: "44px", fontWeight: "700", letterSpacing: "-0.03em", color: "#0F6B5C", lineHeight: "1" }}>03</p>
        <h3 style={{ margin: "0", fontSize: "24px", fontWeight: "600" }}>Pilot</h3>
        <p style={{ margin: "0", fontSize: "16px", color: "#4A5A56" }}>Join three brands testing Labelring for free, with onboarding and a label audit.</p>
        <a href="#pilot" style={{ color: "#0F6B5C", fontWeight: "600", textDecoration: "none", marginTop: "auto", minHeight: "44px", display: "inline-flex", alignItems: "center" }}>Book a 30-minute slot &rarr;</a>
        </div>
        </div>
        </div>
        </section>

        {/* WHO IT'S FOR */}
        <section style={{ padding: "88px 0", background: "#FFFFFF" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 24px", boxSizing: "border-box" }}>
        <p style={{ margin: "0 0 12px", fontSize: "14px", fontWeight: "600", letterSpacing: "0.08em", textTransform: "uppercase", color: "#0F6B5C" }}>Who it is for</p>
        <h2 style={{ margin: "0 0 16px", fontSize: "clamp(30px, 4vw, 42px)", lineHeight: "1.12", letterSpacing: "-0.02em", fontWeight: "700" }}>Built for brands that sell cosmetics in the UK and EU.</h2>
        <p style={{ margin: "0 0 48px", fontSize: "19px", color: "#4A5A56", maxWidth: "680px" }}>Choose your product type and the checks adapt.</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "20px" }}>
        <div style={{ flex: "1 1 250px", minWidth: "0", boxSizing: "border-box", border: "1px solid #D9E2DF", borderRadius: "14px", padding: "28px", display: "flex", flexDirection: "column", gap: "10px" }}>
        <p style={{ margin: "0", fontSize: "13px", fontWeight: "700", color: "#0F6B5C" }}>01</p>
        <h3 style={{ margin: "0", fontSize: "21px", fontWeight: "600" }}>Skincare</h3>
        <p style={{ margin: "0", fontSize: "16px", color: "#4A5A56" }}>Serums, creams and cleansers, with allergens and restricted substances checked.</p>
        <Link to="/insights/blog-cosmetic-product-information-file" style={{ color: "#0F6B5C", fontWeight: "600", textDecoration: "none", marginTop: "auto", minHeight: "44px", display: "inline-flex", alignItems: "center" }}>Read the PIF guide &rarr;</Link>
        </div>
        <div style={{ flex: "1 1 250px", minWidth: "0", boxSizing: "border-box", border: "1px solid #D9E2DF", borderRadius: "14px", padding: "28px", display: "flex", flexDirection: "column", gap: "10px" }}>
        <p style={{ margin: "0", fontSize: "13px", fontWeight: "700", color: "#0F6B5C" }}>02</p>
        <h3 style={{ margin: "0", fontSize: "21px", fontWeight: "600" }}>Makeup</h3>
        <p style={{ margin: "0", fontSize: "16px", color: "#4A5A56" }}>Eye, lip and face products each have their own label rules.</p>
        <Link to="/insights/do-i-need-a-responsible-person-on-my-cosmetic-label-here-s-exactly-what-it-means" style={{ color: "#0F6B5C", fontWeight: "600", textDecoration: "none", marginTop: "auto", minHeight: "44px", display: "inline-flex", alignItems: "center" }}>Do you need an RP? &rarr;</Link>
        </div>
        <div style={{ flex: "1 1 250px", minWidth: "0", boxSizing: "border-box", border: "1px solid #D9E2DF", borderRadius: "14px", padding: "28px", display: "flex", flexDirection: "column", gap: "10px" }}>
        <p style={{ margin: "0", fontSize: "13px", fontWeight: "700", color: "#0F6B5C" }}>03</p>
        <h3 style={{ margin: "0", fontSize: "21px", fontWeight: "600" }}>Fragrance</h3>
        <p style={{ margin: "0", fontSize: "16px", color: "#4A5A56" }}>EU fragrance allergen rules are changing. Check your labels against them.</p>
        <a href="#changes" style={{ color: "#0F6B5C", fontWeight: "600", textDecoration: "none", marginTop: "auto", minHeight: "44px", display: "inline-flex", alignItems: "center" }}>See what is changing &rarr;</a>
        </div>
        <div style={{ flex: "1 1 250px", minWidth: "0", boxSizing: "border-box", border: "1px solid #D9E2DF", borderRadius: "14px", padding: "28px", display: "flex", flexDirection: "column", gap: "10px" }}>
        <p style={{ margin: "0", fontSize: "13px", fontWeight: "700", color: "#0F6B5C" }}>04</p>
        <h3 style={{ margin: "0", fontSize: "21px", fontWeight: "600" }}>Sun care</h3>
        <p style={{ margin: "0", fontSize: "16px", color: "#4A5A56" }}>Sunscreen needs a Responsible Person like any other cosmetic product.</p>
        <Link to="/insights/do-i-need-a-responsible-person-on-my-cosmetic-label-here-s-exactly-what-it-means" style={{ color: "#0F6B5C", fontWeight: "600", textDecoration: "none", marginTop: "auto", minHeight: "44px", display: "inline-flex", alignItems: "center" }}>Read the guide &rarr;</Link>
        </div>
        </div>
        <div style={{ marginTop: "36px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 24px" }}>
        <span style={{ fontSize: "15px", fontWeight: "600", color: "#14201D" }}>Guides:</span>
        <Link to="/insights/blog-uk-cosmetics-regulations-guide" style={{ fontSize: "15px", minHeight: "44px", display: "inline-flex", alignItems: "center" }}>UK cosmetics regulations for founders</Link>
        <Link to="/insights/blog-cosmetics-responsible-person-uk" style={{ fontSize: "15px", minHeight: "44px", display: "inline-flex", alignItems: "center" }}>What is a Responsible Person?</Link>
        <Link to="/insights/who-can-be-the-responsible-person-for-a-uk-cosmetic-product" style={{ fontSize: "15px", minHeight: "44px", display: "inline-flex", alignItems: "center" }}>Who can be the Responsible Person?</Link>
        <Link to="/insights/starting-a-new-brand-in-the-uk-do-these-5-things-before-you-touch-your-label" style={{ fontSize: "15px", minHeight: "44px", display: "inline-flex", alignItems: "center" }}>Starting a new brand</Link>
        </div>
        </div>
        </section>

        {/* HOW A CHECK WORKS */}
        <section style={{ padding: "88px 0", background: "#F3F7F6" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 24px", boxSizing: "border-box", display: "flex", flexWrap: "wrap", gap: "56px", alignItems: "flex-start" }}>
        <div style={{ flex: "1 1 460px", minWidth: "0" }}>
        <p style={{ margin: "0 0 12px", fontSize: "14px", fontWeight: "600", letterSpacing: "0.08em", textTransform: "uppercase", color: "#0F6B5C" }}>How it works</p>
        <h2 style={{ margin: "0 0 32px", fontSize: "clamp(30px, 4vw, 42px)", lineHeight: "1.12", letterSpacing: "-0.02em", fontWeight: "700" }}>From label to print in three steps.</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
        <div style={{ display: "flex", gap: "20px", alignItems: "flex-start" }}><p style={{ margin: "0", flex: "0 0 auto", width: "44px", height: "44px", borderRadius: "999px", background: "#0F6B5C", color: "#FFFFFF", fontWeight: "700", display: "flex", alignItems: "center", justifyContent: "center" }}>1</p><div><h3 style={{ margin: "0 0 4px", fontSize: "20px", fontWeight: "600" }}>Upload your label</h3><p style={{ margin: "0", fontSize: "16px", color: "#4A5A56" }}>Choose where you will sell it, your role and the product type. Then upload an image or PDF.</p></div></div>
        <div style={{ display: "flex", gap: "20px", alignItems: "flex-start" }}><p style={{ margin: "0", flex: "0 0 auto", width: "44px", height: "44px", borderRadius: "999px", background: "#0F6B5C", color: "#FFFFFF", fontWeight: "700", display: "flex", alignItems: "center", justifyContent: "center" }}>2</p><div><h3 style={{ margin: "0 0 4px", fontSize: "20px", fontWeight: "600" }}>See what needs action</h3><p style={{ margin: "0", fontSize: "16px", color: "#4A5A56" }}>Each check shows as met or needing action, so you know what to fix.</p></div></div>
        <div style={{ display: "flex", gap: "20px", alignItems: "flex-start" }}><p style={{ margin: "0", flex: "0 0 auto", width: "44px", height: "44px", borderRadius: "999px", background: "#0F6B5C", color: "#FFFFFF", fontWeight: "700", display: "flex", alignItems: "center", justifyContent: "center" }}>3</p><div><h3 style={{ margin: "0 0 4px", fontSize: "20px", fontWeight: "600" }}>Fix it and print with confidence</h3><p style={{ margin: "0", fontSize: "16px", color: "#4A5A56" }}>Update your label, scan again, and send it to print.</p></div></div>
        </div>
        <div style={{ margin: "32px 0 0", maxWidth: "520px", background: "#FFFFFF", border: "1px solid #D9E2DF", borderRadius: "14px", padding: "24px", boxSizing: "border-box" }}>
        <p style={{ margin: "0 0 8px", fontSize: "13px", fontWeight: "600", letterSpacing: "0.08em", textTransform: "uppercase", color: "#0F6B5C" }}>The Labelring rulebook</p>
        <h3 style={{ margin: "0 0 8px", fontSize: "20px", fontWeight: "600" }}>Every check runs on the same set of rules.</h3>
        <p style={{ margin: "0", fontSize: "16px", color: "#4A5A56" }}>Labelring maintains a rulebook of UK and EU cosmetics rules, drawn from the official sources listed below. Every label you scan or generate is checked against it.</p>
        </div>
        <p style={{ margin: "24px 0 0", fontSize: "15px", color: "#4A5A56", maxWidth: "520px" }}>Labelring does not replace legal or safety experts. Qualified assessors and labs do the regulated work. Labelring handles the data and the paperwork.</p>
        </div>
        <div style={{ flex: "1 1 420px", minWidth: "0", background: "#FFFFFF", border: "1px solid #D9E2DF", borderRadius: "20px", padding: "32px", boxSizing: "border-box" }}>
        <p style={{ margin: "0 0 20px", fontSize: "13px", fontWeight: "600", letterSpacing: "0.08em", textTransform: "uppercase", color: "#4A5A56" }}>Where Labelring sits</p>
        <div style={{ border: "1px solid #D9E2DF", borderRadius: "12px", padding: "16px 20px", fontSize: "16px", fontWeight: "500" }}>Your product information</div>
        <p aria-hidden="true" style={{ margin: "6px 0", textAlign: "center", color: "#0F6B5C", fontWeight: "700" }}>&darr;</p>
        <div style={{ background: "#0F6B5C", color: "#FFFFFF", borderRadius: "12px", padding: "16px 20px", fontSize: "16px", fontWeight: "600" }}>Labelring: checks, label and data pack</div>
        <p aria-hidden="true" style={{ margin: "6px 0", textAlign: "center", color: "#0F6B5C", fontWeight: "700" }}>&darr;</p>
        <div style={{ border: "1px solid #D9E2DF", borderRadius: "12px", padding: "16px 20px", fontSize: "16px", fontWeight: "500" }}>Safety assessor and Responsible Person <span style={{ display: "inline-block", fontSize: "12px", fontWeight: "600", color: "#8A3F00", background: "#FFF1E0", borderRadius: "999px", padding: "3px 10px", marginLeft: "6px" }}>Data pack coming soon</span></div>
        <p aria-hidden="true" style={{ margin: "6px 0", textAlign: "center", color: "#0F6B5C", fontWeight: "700" }}>&darr;</p>
        <div style={{ border: "1px solid #D9E2DF", borderRadius: "12px", padding: "16px 20px", fontSize: "16px", fontWeight: "500" }}>Government notification: SCPN (UK) and CPNP (EU)</div>
        </div>
        </div>
        </section>

        {/* WHAT IS CHANGING */}
        <section id="changes" style={{ padding: "88px 0", background: "#FFFFFF" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 24px", boxSizing: "border-box" }}>
        <p style={{ margin: "0 0 12px", fontSize: "14px", fontWeight: "600", letterSpacing: "0.08em", textTransform: "uppercase", color: "#0F6B5C" }}>What is changing</p>
        <h2 style={{ margin: "0 0 48px", fontSize: "clamp(30px, 4vw, 42px)", lineHeight: "1.12", letterSpacing: "-0.02em", fontWeight: "700" }}>The rules are moving in 2026.</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "20px" }}>
        <div style={{ flex: "1 1 340px", minWidth: "0", boxSizing: "border-box", border: "1px solid #D9E2DF", borderRadius: "14px", padding: "28px", display: "flex", flexDirection: "column", gap: "10px" }}>
        <p style={{ margin: "0", fontSize: "14px", fontWeight: "600", color: "#8A3F00" }}>From July 2026</p>
        <h3 style={{ margin: "0", fontSize: "21px", fontWeight: "600", lineHeight: "1.3" }}>Formaldehyde and CMR substance bans</h3>
        <p style={{ margin: "0", fontSize: "16px", color: "#4A5A56" }}>New bans on formaldehyde and CMR substances start from July 2026. Labelring flags them.</p>
        </div>
        <div style={{ flex: "1 1 340px", minWidth: "0", boxSizing: "border-box", border: "1px solid #D9E2DF", borderRadius: "14px", padding: "28px", display: "flex", flexDirection: "column", gap: "10px" }}>
        <p style={{ margin: "0", fontSize: "14px", fontWeight: "600", color: "#0A4D42" }}>In force</p>
        <h3 style={{ margin: "0", fontSize: "21px", fontWeight: "600", lineHeight: "1.3" }}>EU allergen labelling update</h3>
        <p style={{ margin: "0", fontSize: "16px", color: "#4A5A56" }}>More fragrance allergens must be named on labels sold in the EU.</p>
        </div>
        <div style={{ flex: "1 1 340px", minWidth: "0", boxSizing: "border-box", border: "1px solid #D9E2DF", borderRadius: "14px", padding: "28px", display: "flex", flexDirection: "column", gap: "10px" }}>
        <p style={{ margin: "0", fontSize: "14px", fontWeight: "600", color: "#8A3F00" }}>Phasing in, 2026 to 2030</p>
        <h3 style={{ margin: "0", fontSize: "21px", fontWeight: "600", lineHeight: "1.3" }}>UK Cosmetics Regulation and the Responsible Person</h3>
        <p style={{ margin: "0", fontSize: "16px", color: "#4A5A56" }}>Check the Responsible Person details on your label.</p>
        <Link to="/insights/blog-uk-cosmetics-regulations-guide" style={{ color: "#0F6B5C", fontWeight: "600", textDecoration: "none", marginTop: "auto", minHeight: "44px", display: "inline-flex", alignItems: "center" }}>Read the guide &rarr;</Link>
        </div>
        </div>
        <p style={{ margin: "28px 0 0", fontSize: "15px", color: "#4A5A56" }}>Dates come from the official sources below. Check them for your own products.</p>
        </div>
        </section>

        {/* SOURCES */}
        <section style={{ padding: "56px 0", background: "#F3F7F6", borderTop: "1px solid #D9E2DF", borderBottom: "1px solid #D9E2DF" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 24px", boxSizing: "border-box", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px 28px" }}>
        <p style={{ margin: "0", fontSize: "18px", fontWeight: "600", flex: "1 1 280px" }}>Built on the official rules, not guesswork.</p>
        <div style={{ flex: "2 1 480px", display: "flex", flexWrap: "wrap", gap: "4px 24px" }}>
        <a href="https://www.legislation.gov.uk/eur/2009/1223/contents" style={{ fontSize: "15px", minHeight: "44px", display: "inline-flex", alignItems: "center" }}>GB legislation</a>
        <a href="https://www.gov.uk/guidance/making-cosmetic-products-available-to-consumers-in-great-britain" style={{ fontSize: "15px", minHeight: "44px", display: "inline-flex", alignItems: "center" }}>OPSS guidance</a>
        <a href="https://eur-lex.europa.eu/eli/reg/2009/1223/oj" style={{ fontSize: "15px", minHeight: "44px", display: "inline-flex", alignItems: "center" }}>EUR-Lex</a>
        <a href="https://echa.europa.eu/" style={{ fontSize: "15px", minHeight: "44px", display: "inline-flex", alignItems: "center" }}>ECHA</a>
        </div>
        </div>
        </section>

        {/* PILOT */}
        <section id="pilot" style={{ padding: "96px 0", background: "#FFFFFF" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 24px", boxSizing: "border-box", display: "flex", flexWrap: "wrap", gap: "56px", alignItems: "flex-start" }}>
        <div style={{ flex: "1 1 440px", minWidth: "0" }}>
        <p style={{ margin: "0 0 12px", fontSize: "14px", fontWeight: "600", letterSpacing: "0.08em", textTransform: "uppercase", color: "#0F6B5C" }}>Join the pilot</p>
        <h2 style={{ margin: "0 0 16px", fontSize: "clamp(30px, 4vw, 42px)", lineHeight: "1.12", letterSpacing: "-0.02em", fontWeight: "700" }}>Be one of the first three brands.</h2>
        <p style={{ margin: "0 0 32px", fontSize: "19px", color: "#4A5A56", maxWidth: "520px" }}>We are looking for three UK cosmetics brands to try Labelring. It is free for now. You get onboarding support and an audit of your existing labels. In return, we ask for honest feedback.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        <div style={{ display: "flex", gap: "16px", alignItems: "center" }}><p style={{ margin: "0", flex: "0 0 auto", width: "40px", height: "40px", borderRadius: "999px", background: "#E3F1EE", color: "#0A4D42", fontWeight: "700", display: "flex", alignItems: "center", justifyContent: "center" }}>1</p><p style={{ margin: "0", fontSize: "17px", fontWeight: "500" }}>Your details</p></div>
        <div style={{ display: "flex", gap: "16px", alignItems: "center" }}><p style={{ margin: "0", flex: "0 0 auto", width: "40px", height: "40px", borderRadius: "999px", background: "#E3F1EE", color: "#0A4D42", fontWeight: "700", display: "flex", alignItems: "center", justifyContent: "center" }}>2</p><p style={{ margin: "0", fontSize: "17px", fontWeight: "500" }}>Pick a time for a 30-minute chat</p></div>
        <div style={{ display: "flex", gap: "16px", alignItems: "center" }}><p style={{ margin: "0", flex: "0 0 auto", width: "40px", height: "40px", borderRadius: "999px", background: "#E3F1EE", color: "#0A4D42", fontWeight: "700", display: "flex", alignItems: "center", justifyContent: "center" }}>3</p><p style={{ margin: "0", fontSize: "17px", fontWeight: "500" }}>Confirmation by email</p></div>
        </div>
        </div>
        <div style={{ flex: "1 1 420px", minWidth: "0", background: "#F3F7F6", border: "1px solid #D9E2DF", borderRadius: "20px", padding: "32px", boxSizing: "border-box" }}>
        <PilotForm />
        </div>
        </div>
        </section>

        </main>

        {/* FOOTER */}
        <footer style={{ background: "#14201D", color: "#E6EEEC", padding: "64px 0 40px" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 24px", boxSizing: "border-box" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "48px" }}>
        <div style={{ flex: "2 1 320px", minWidth: "0" }}>
        <p style={{ margin: "0 0 12px", fontSize: "24px", fontWeight: "700", letterSpacing: "-0.02em", color: "#FFFFFF" }}>Labelring</p>
        <p style={{ margin: "0 0 16px", fontSize: "16px", color: "#A9BDB8", maxWidth: "380px" }}>Labelling and paperwork for UK cosmetics brands. Built in the UK.</p>
        <p style={{ margin: "0", fontSize: "14px", color: "#A9BDB8" }}>Labelring Ltd, registered in England and Wales, company no. 16816508</p>
        </div>
        <div style={{ flex: "1 1 160px", minWidth: "0" }}>
        <p style={{ margin: "0 0 8px", fontSize: "14px", fontWeight: "600", color: "#FFFFFF" }}>Product</p>
        <div style={{ display: "flex", flexDirection: "column" }}>
        <Link to="/scan" style={{ color: "#BFE3DA", textDecoration: "none", fontSize: "15px", minHeight: "44px", display: "inline-flex", alignItems: "center" }}>Scan</Link>
        <Link to="/generate" style={{ color: "#BFE3DA", textDecoration: "none", fontSize: "15px", minHeight: "44px", display: "inline-flex", alignItems: "center" }}>Generate</Link>
        <Link to="/insights" style={{ color: "#BFE3DA", textDecoration: "none", fontSize: "15px", minHeight: "44px", display: "inline-flex", alignItems: "center" }}>Insights</Link>
        <Link to="/account" style={{ color: "#BFE3DA", textDecoration: "none", fontSize: "15px", minHeight: "44px", display: "inline-flex", alignItems: "center" }}>Account</Link>
        </div>
        </div>
        <div style={{ flex: "1 1 160px", minWidth: "0" }}>
        <p style={{ margin: "0 0 8px", fontSize: "14px", fontWeight: "600", color: "#FFFFFF" }}>Guides</p>
        <div style={{ display: "flex", flexDirection: "column" }}>
        <Link to="/insights/blog-cosmetic-product-information-file" style={{ color: "#BFE3DA", textDecoration: "none", fontSize: "15px", minHeight: "44px", display: "inline-flex", alignItems: "center" }}>Product Information File</Link>
        <Link to="/insights/blog-cosmetics-responsible-person-uk" style={{ color: "#BFE3DA", textDecoration: "none", fontSize: "15px", minHeight: "44px", display: "inline-flex", alignItems: "center" }}>Responsible Person</Link>
        <Link to="/insights/blog-uk-cosmetics-regulations-guide" style={{ color: "#BFE3DA", textDecoration: "none", fontSize: "15px", minHeight: "44px", display: "inline-flex", alignItems: "center" }}>UK cosmetics regulations</Link>
        </div>
        </div>
        <div style={{ flex: "1 1 160px", minWidth: "0" }}>
        <p style={{ margin: "0 0 8px", fontSize: "14px", fontWeight: "600", color: "#FFFFFF" }}>Follow</p>
        <div style={{ display: "flex", flexDirection: "column" }}>
        <a href="https://www.linkedin.com/company/labelring/posts/?feedView=all" style={{ color: "#BFE3DA", textDecoration: "none", fontSize: "15px", minHeight: "44px", display: "inline-flex", alignItems: "center" }}>LinkedIn</a>
        <a href="https://www.instagram.com/labelring/" style={{ color: "#BFE3DA", textDecoration: "none", fontSize: "15px", minHeight: "44px", display: "inline-flex", alignItems: "center" }}>Instagram</a>
        </div>
        </div>
        </div>
        <p style={{ margin: "48px 0 0", paddingTop: "24px", borderTop: "1px solid #2E3F3B", fontSize: "14px", color: "#A9BDB8" }}>© 2026 Labelring Ltd · Built in the UK · Compliant with UK GDPR</p>
        </div>
        </footer>
    </div>
  );
};

export default LandingPage;
