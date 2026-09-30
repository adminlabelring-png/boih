import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

/**
 * The signed-in session and whether it belongs to an admin (listed in
 * admin_users). Being signed in alone grants nothing: the database only
 * shows internal data to admins.
 */
export const useAdminSession = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const update = async (s: Session | null) => {
      let admin = false;
      if (s) {
        const { data, error } = await supabase.rpc("is_admin");
        admin = !error && data === true;
      }
      if (!active) return;
      setSession(s);
      setIsAdmin(admin);
      setLoading(false);
    };

    supabase.auth.getSession().then(({ data }) => update(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      // Don't query the database from inside the auth callback.
      setTimeout(() => update(s), 0);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { session, isAdmin, loading };
};
