import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Building2, LayoutDashboard, LogOut, Plus, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useSeo } from "@/hooks/use-seo";
import { useSession } from "@/hooks/use-session";
import { ACTIVE_BRAND_KEY } from "@/lib/brand-context";

// Brand accounts: create an account or sign in, then create a brand (or
// open one you already belong to). Brand members see their brand's saved
// labels and versions in the workspace.

interface MyBrand {
  id: string;
  name: string;
  default_market: string | null;
  role: string;
}

const MARKETS = [
  { value: "UK", label: "UK" },
  { value: "EU", label: "EU" },
  { value: "UK+EU", label: "UK and EU" },
];

const redirectTo = () => `${window.location.origin}${import.meta.env.BASE_URL}account`;

const errorText = (e: unknown) =>
  e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : "Something went wrong.";

const SignInForms = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<null | "confirm" | "reset">(null);

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) toast.error(error.message);
  };

  const signUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: redirectTo() },
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    // With email confirmation on, there's no session until the link is used.
    if (!data.session) setSent("confirm");
  };

  const reset = async () => {
    if (!email) return toast.error("Enter your email first.");
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: redirectTo() });
    setBusy(false);
    if (error) return toast.error(error.message);
    setSent("reset");
  };

  if (sent) {
    return (
      <Card className="p-6 space-y-2">
        <h1 className="text-xl font-semibold">Check your email</h1>
        <p className="text-sm text-muted-foreground">
          {sent === "confirm"
            ? `We've sent a link to ${email}. Open it to confirm your account, then come back here.`
            : `We've sent a password reset link to ${email}.`}
        </p>
      </Card>
    );
  }

  const fields = (autoComplete: string) => (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          autoComplete={autoComplete}
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
    </>
  );

  return (
    <Card className="p-6">
      <Tabs defaultValue="signin">
        <TabsList className="grid grid-cols-2 w-full mb-4">
          <TabsTrigger value="signin">Sign in</TabsTrigger>
          <TabsTrigger value="signup">Create account</TabsTrigger>
        </TabsList>
        <TabsContent value="signin">
          <form onSubmit={signIn} className="space-y-3">
            {fields("current-password")}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Working…" : "Sign in"}
            </Button>
            <button type="button" onClick={reset} className="text-xs text-muted-foreground hover:text-foreground">
              Forgot your password?
            </button>
          </form>
        </TabsContent>
        <TabsContent value="signup">
          <form onSubmit={signUp} className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Save your labels to your brand, keep every version and start new products from existing labels.
            </p>
            {fields("new-password")}
            <p className="text-[11px] text-muted-foreground">At least 8 characters.</p>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Working…" : "Create account"}
            </Button>
          </form>
        </TabsContent>
      </Tabs>
    </Card>
  );
};

const NewPasswordForm = ({ onDone }: { onDone: () => void }) => {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Password updated.");
    onDone();
  };
  return (
    <Card className="p-6">
      <form onSubmit={save} className="space-y-3">
        <h1 className="text-xl font-semibold">Choose a new password</h1>
        <Input type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Working…" : "Save password"}
        </Button>
      </form>
    </Card>
  );
};

const AccountPage = () => {
  useSeo({
    title: "Your account | Labelring",
    description: "Sign in to save your brand's labels and every version of them.",
    path: "/account",
    noindex: true,
  });
  const { session, loading } = useSession();
  const navigate = useNavigate();
  const [recovering, setRecovering] = useState(false);
  const [brands, setBrands] = useState<MyBrand[] | null>(null);
  const [name, setName] = useState("");
  const [market, setMarket] = useState("UK");
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setRecovering(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;
  useEffect(() => {
    if (!userId) {
      setBrands(null);
      return;
    }
    (async () => {
      const { data, error } = await supabase
        .from("brand_members" as never)
        .select("role, brands(id, name, default_market)")
        .eq("user_id", userId);
      if (error) {
        toast.error(error.message);
        setBrands([]);
        return;
      }
      const rows = (data ?? []) as unknown as { role: string; brands: Omit<MyBrand, "role"> | null }[];
      setBrands(rows.filter((r) => r.brands).map((r) => ({ ...r.brands!, role: r.role })));
    })();
  }, [userId]);

  const openBrand = (id: string, to = "/workspace") => {
    try {
      localStorage.setItem(ACTIVE_BRAND_KEY, id);
    } catch {
      // Private mode: the workspace falls back to the first brand.
    }
    navigate(to);
  };

  const createBrand = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const { data, error } = await supabase.rpc("create_brand" as never, { p_name: name, p_default_market: market } as never);
      if (error) throw error;
      toast.success(`${name} created.`);
      openBrand(data as unknown as string, "/workspace/labels");
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setCreating(false);
    }
  };

  if (loading) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="max-w-md mx-auto py-12 space-y-4">
      {recovering && session ? (
        <NewPasswordForm onDone={() => setRecovering(false)} />
      ) : !session ? (
        <SignInForms />
      ) : (
        <>
          <Card className="p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h1 className="text-xl font-semibold">Your brands</h1>
                <p className="text-sm text-muted-foreground">Signed in as {session.user.email}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => supabase.auth.signOut()}>
                <LogOut className="h-4 w-4 mr-1.5" /> Sign out
              </Button>
            </div>

            {brands === null ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <div className="space-y-2">
                {brands.map((b) => (
                  <div key={b.id} className="flex items-center gap-3 rounded-md border p-3">
                    <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{b.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {b.role === "owner" ? "Owner" : "Member"} · {b.default_market ?? "UK"}
                      </div>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => openBrand(b.id)}>
                      <LayoutDashboard className="h-4 w-4 mr-1.5" /> Open
                    </Button>
                  </div>
                ))}
                {brands.length === 0 && (
                  <p className="text-sm text-muted-foreground">Create your brand to start saving labels to it.</p>
                )}
              </div>
            )}

            {brands !== null && (brands.length === 0 || showCreate) ? (
              <form onSubmit={createBrand} className="space-y-3 border-t pt-4">
                <div className="space-y-1.5">
                  <Label htmlFor="brand-name">Brand name</Label>
                  <Input id="brand-name" required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="brand-market">Where you sell</Label>
                  <Select value={market} onValueChange={setMarket}>
                    <SelectTrigger id="brand-market">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MARKETS.map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" className="w-full" disabled={creating}>
                  {creating ? "Creating…" : "Create brand"}
                </Button>
              </form>
            ) : (
              brands !== null && (
                <Button variant="ghost" size="sm" onClick={() => setShowCreate(true)}>
                  <Plus className="h-4 w-4 mr-1.5" /> Add another brand
                </Button>
              )
            )}
          </Card>
          <Button asChild variant="outline" className="w-full">
            <Link to="/generate">
              <Sparkles className="h-4 w-4 mr-1.5" /> Create a label
            </Link>
          </Button>
        </>
      )}
    </div>
  );
};

export default AccountPage;
