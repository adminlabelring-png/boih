import { useState } from "react";
import { Link, Outlet } from "react-router-dom";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAdminSession } from "@/hooks/use-admin-session";
import { useIsMobile } from "@/hooks/use-mobile";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { BrandProvider, useBrand } from "@/lib/brand-context";
import { useSeo } from "@/hooks/use-seo";
import WorkspaceSidebar from "./WorkspaceSidebar";
import BrandSwitcher from "./BrandSwitcher";

const TopBar = ({ email }: { email: string }) => {
  const { brand } = useBrand();
  return (
    <header className="h-12 flex items-center justify-between px-4 md:px-6 border-b border-border bg-card shrink-0">
      <div className="text-sm font-medium text-muted-foreground hidden sm:block">
        {brand ? brand.name : "Loading…"} workspace
      </div>
      <div className="flex items-center gap-2 ml-auto">
        <BrandSwitcher />
        <div
          title={email}
          className="h-7 w-7 rounded-full bg-accent text-accent-foreground text-[11px] font-semibold inline-flex items-center justify-center uppercase"
        >
          {email.slice(0, 1) || "?"}
        </div>
      </div>
    </header>
  );
};

// Shown instead of the pages when there are no brands to show.
const NoBrands = () => (
  <div className="max-w-md rounded-lg border bg-card p-6 space-y-2">
    <h1 className="text-lg font-semibold">No brands yet</h1>
    <p className="text-sm text-muted-foreground">
      The workspace shows a brand's products, suppliers and label versions. Brands are added with brand accounts.
    </p>
  </div>
);

const Content = () => {
  const { brands, loading } = useBrand();
  if (!loading && brands.length === 0) return <NoBrands />;
  return <Outlet />;
};

const Shell = ({ email }: { email: string }) => {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  if (isMobile) {
    return (
      <div className="min-h-screen bg-muted/30 flex flex-col">
        <header className="sticky top-0 z-40 flex h-12 items-center gap-3 border-b bg-card px-4 shrink-0">
          <button onClick={() => setOpen(true)}><Menu className="h-5 w-5" /></button>
          <span className="text-sm font-semibold">Workspace</span>
          <div className="ml-auto"><BrandSwitcher /></div>
        </header>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="left" className="w-60 p-0">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <WorkspaceSidebar onNavigate={() => setOpen(false)} />
          </SheetContent>
        </Sheet>
        <main className="flex-1 p-4"><Content /></main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <WorkspaceSidebar />
      <div className="md:pl-60 flex flex-col min-h-screen">
        <TopBar email={email} />
        <main className="flex-1 p-6 lg:p-8 max-w-[1400px] w-full">
          <Content />
        </main>
      </div>
    </div>
  );
};

// Brands can't sign in yet, so the workspace is for Labelring admins only
// until brand accounts exist.
const WorkspaceLayout = () => {
  const { session, isAdmin, loading } = useAdminSession();
  // Internal app pages: keep them out of search results.
  useSeo({ title: "Workspace | Labelring", description: "Labelring workspace.", noindex: true });

  if (loading) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  if (!session || !isAdmin) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
        <div className="max-w-sm w-full rounded-lg border bg-card p-6 space-y-4">
          <div className="space-y-1">
            <h1 className="text-xl font-semibold">Workspace</h1>
            <p className="text-sm text-muted-foreground">
              {session
                ? `${session.user.email} isn't an admin account. The workspace opens to brands with brand accounts.`
                : "The workspace opens to brands with brand accounts. Labelring admins can sign in on the admin page."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {!session && (
              <Button asChild size="sm"><Link to="/admin/leads">Admin sign in</Link></Button>
            )}
            <Button asChild size="sm" variant="outline"><Link to="/scan">Scan a label</Link></Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <BrandProvider>
      <Shell email={session.user.email ?? ""} />
    </BrandProvider>
  );
};

export default WorkspaceLayout;
