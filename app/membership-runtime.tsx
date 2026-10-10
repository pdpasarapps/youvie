"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ReaderMembershipTier } from "@/lib/reader-membership";
import { synchronizeOfflineMembership } from "@/lib/offline-episodes";

const supabase = createClient();
const ReaderMembershipContext = createContext<{ tier: ReaderMembershipTier; ready: boolean; verified: boolean } | null>(null);

function shouldSilenceMembershipError(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return true;
  const code = error.code?.toLowerCase() ?? "";
  const message = (error.message ?? "").toLowerCase();
  return [
    "pgrst301",
    "42501",
    "row level security",
    "permission denied",
    "anonymous",
  ].some((needle) => code.includes(needle) || message.includes(needle));
}

export function useReaderMembership() {
  const context = useContext(ReaderMembershipContext);
  if (!context) throw new Error("useReaderMembership must be used inside ReaderMembershipRuntime.");
  return context;
}

export default function ReaderMembershipRuntime({ children }: { children: ReactNode }) {
  const [tier, setTier] = useState<ReaderMembershipTier>("free");
  const [ready, setReady] = useState(false);
  const [verified, setVerified] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    let active = true;
    const loadMembership = async (userId: string | undefined, sessionVerified = true) => {
      const currentRequest = ++requestId.current;
      setReady(false);
      setVerified(false);
      if (sessionVerified && active && currentRequest === requestId.current) {
        try {
          if (userId) localStorage.setItem("mu-komik:offline-current-user-id", userId);
          else localStorage.removeItem("mu-komik:offline-current-user-id");
        } catch (storageError) {
          console.error("Unable to update the offline reader account identity:", storageError);
        }
      }
      if (!userId) {
        if (active && currentRequest === requestId.current) {
          setTier("free");
          setVerified(sessionVerified);
          setReady(true);
        }
        return;
      }
      const { data, error } = await supabase
        .from("reader_memberships")
        .select("tier")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) {
        if (!shouldSilenceMembershipError(error)) {
          console.error("Unable to load reader membership:", error);
        }
        if (active && currentRequest === requestId.current) {
          setTier("free");
          setVerified(false);
        }
      } else if (active) {
        const loadedTier = data?.tier;
        if (currentRequest === requestId.current) {
          const verifiedTier = loadedTier === "premium" || loadedTier === "vip" ? loadedTier : "free";
          setTier(verifiedTier);
          setVerified(true);
          try {
            await synchronizeOfflineMembership(userId, verifiedTier);
          } catch (offlineError) {
            console.error("Unable to synchronize offline episode licenses with verified membership:", offlineError);
          }
        }
      }
      if (active && currentRequest === requestId.current) setReady(true);
    };

    const refreshCurrentSession = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) {
          console.error("Unable to check the reader session for membership:", error);
          void loadMembership(undefined, false);
          return;
        }
        void loadMembership(data.session?.user.id);
      } catch (error) {
        console.error("Unable to check the reader session for membership:", error);
        void loadMembership(undefined, false);
      }
    };
    void refreshCurrentSession();
    window.addEventListener("online", refreshCurrentSession);

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      window.setTimeout(() => void loadMembership(session?.user.id), 0);
    });
    return () => {
      active = false;
      window.removeEventListener("online", refreshCurrentSession);
      subscription.unsubscribe();
    };
  }, []);

  const context = useMemo(() => ({ tier, ready, verified }), [ready, tier, verified]);
  return <ReaderMembershipContext.Provider value={context}>{children}</ReaderMembershipContext.Provider>;
}
