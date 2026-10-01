import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/lib/brand-context";

interface Member {
  user_id: string;
  email: string;
  role: string;
  created_at: string;
}

const TeamPage = () => {
  const { brand } = useBrand();
  const [members, setMembers] = useState<Member[] | null>(null);

  useEffect(() => {
    if (!brand) return;
    supabase.rpc("brand_member_list" as never, { p_brand: brand.id } as never).then(({ data, error }) => {
      if (error) toast.error(error.message);
      setMembers((data ?? []) as unknown as Member[]);
    });
  }, [brand]);

  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <h1 className="text-lg font-semibold">Team</h1>
        <p className="text-sm text-muted-foreground mt-0.5">People who can open {brand?.name ?? "this brand"}</p>
      </div>
      <div className="rounded-lg border bg-card divide-y">
        {members === null && <p className="p-4 text-sm text-muted-foreground">Loading…</p>}
        {members?.map((m) => (
          <div key={m.user_id} className="flex items-center justify-between p-4">
            <span className="text-sm">{m.email}</span>
            <span className="text-xs text-muted-foreground">
              {m.role === "owner" ? "Owner" : "Member"} · since {new Date(m.created_at).toLocaleDateString()}
            </span>
          </div>
        ))}
        {members?.length === 0 && <p className="p-4 text-sm text-muted-foreground">No members.</p>}
      </div>
      <p className="text-xs text-muted-foreground">Inviting teammates is coming next.</p>
    </div>
  );
};

export default TeamPage;
