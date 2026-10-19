import { useState } from "react";
import { z } from "zod";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

import { LEAD_CATEGORIES } from "@/lib/categories";
import LeadCategoryOptions from "@/components/LeadCategoryOptions";
import { markLeadSubmitted } from "@/components/LeadCaptureDialog";

const schema = z.object({
  name: z.string().trim().min(1, "Please enter your name").max(100),
  email: z.string().trim().email("Please enter a valid email").max(255),
  company: z.string().trim().min(1, "Please enter your company").max(200),
  product_category: z.enum(LEAD_CATEGORIES as unknown as [string, ...string[]]),
});

const EarlyAccessForm = () => {
  const [values, setValues] = useState<{
    name: string;
    email: string;
    company: string;
    product_category: string | undefined;
  }>({
    name: "",
    email: "",
    company: "",
    product_category: undefined,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        fieldErrors[issue.path[0] as string] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    setSubmitting(true);
    const { error } = await supabase.from("early_access_signups").insert([{
      name: parsed.data.name,
      email: parsed.data.email,
      company: parsed.data.company,
      product_category: parsed.data.product_category,
    }]);
    setSubmitting(false);
    if (error) {
      toast({
        title: "Something went wrong",
        description: "Please try again in a moment.",
        variant: "destructive",
      });
      return;
    }
    markLeadSubmitted();
    setDone(true);
    toast({
      title: "You're on the list",
      description: "We'll be in touch with early access details soon.",
    });
  };

  if (done) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center space-y-3">
        <div className="mx-auto h-12 w-12 rounded-full bg-[hsl(var(--risk-low-bg))] flex items-center justify-center">
          <CheckCircle2 className="h-6 w-6 text-[hsl(var(--risk-low))]" />
        </div>
        <h3 className="font-semibold text-lg">Thanks, you're on the list.</h3>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto">
          We'll reach out with onboarding details and a compliance audit of your existing labels.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="rounded-xl border bg-card p-6 md:p-8 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            value={values.name}
            onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
            maxLength={100}
            required
          />
          {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={values.email}
            onChange={(e) => setValues((v) => ({ ...v, email: e.target.value }))}
            maxLength={255}
            required
          />
          {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="company">Company</Label>
          <Input
            id="company"
            value={values.company}
            onChange={(e) => setValues((v) => ({ ...v, company: e.target.value }))}
            maxLength={200}
            required
          />
          {errors.company && <p className="text-xs text-destructive">{errors.company}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="product_category">Product category</Label>
          <Select
            value={values.product_category}
            onValueChange={(v) => setValues((s) => ({ ...s, product_category: v }))}
          >
            <SelectTrigger id="product_category">
              <SelectValue placeholder="Select a category" />
            </SelectTrigger>
            <SelectContent>
              <LeadCategoryOptions />
            </SelectContent>
          </Select>
          {errors.product_category && (
            <p className="text-xs text-destructive">Please pick a category</p>
          )}
        </div>
      </div>
      <Button type="submit" size="lg" disabled={submitting} className="w-full md:w-auto">
        {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
        Request early access
      </Button>
      <p className="text-[11px] text-muted-foreground">
        We'll only use your details to contact you about Labelring early access.
      </p>
    </form>
  );
};

export default EarlyAccessForm;
