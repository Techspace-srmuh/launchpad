"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { createBrowserClient } from "./client";
import type { BrowserConfig } from "./config";
import { workflowError, type ProfileRecord } from "./workflows";
import { IdentityContext } from "./identity-context";

export function IdentityProvider({ config, children }: { config: BrowserConfig | null; children: ReactNode }) {
  const client = useMemo(() => config ? createBrowserClient(config) : null, [config]);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(Boolean(client));
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const resolvedAccount = useRef<string | null>(null);

  useEffect(() => {
    if (!client) return;
    let active = true;
    const { data: listener } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (active) {
        if (nextSession && resolvedAccount.current !== nextSession.user.id) setLoading(true);
        setSession(nextSession); setVersion((value) => value + 1);
      }
    });
    void client.auth.getSession().then(({ data, error: authError }) => {
      if (!active) return;
      setSession(data.session);
      if (authError) setError("Your sign-in session could not be restored. Please try signing in again.");
      if (!data.session || authError) setLoading(false);
    }).catch(() => {
      if (active) {
        setError("Your sign-in session could not be restored. Please try signing in again.");
        setLoading(false);
      }
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, [client]);

  useEffect(() => {
    let active = true;
    if (!client || !session) {
      resolvedAccount.current = null;
      setProfile(null); setIsAdmin(false); setLoading(false); return;
    }
    // Keep the current form mounted during a same-account refresh so saved
    // feedback and in-progress edits survive. Account changes still clear it.
    if (resolvedAccount.current !== session.user.id) {
      setLoading(true);
      setProfile(null);
      setIsAdmin(false);
    }
    resolvedAccount.current = session.user.id;
    setError("");
    void Promise.all([
      client.from("profiles").select("*").eq("user_id", session.user.id).maybeSingle(),
      client.rpc("sync_admin_access"),
    ]).then(([profileResult, adminResult]) => {
      if (!active) return;
      if (profileResult.error || adminResult.error) setError(workflowError(profileResult.error || adminResult.error));
      else { setProfile(profileResult.data as ProfileRecord | null); setIsAdmin(adminResult.data === true); }
      setLoading(false);
    }).catch((failure: unknown) => { if (active) { setError(workflowError(failure)); setLoading(false); } });
    return () => { active = false; };
  }, [client, session, version]);

  const refresh = useCallback(async () => { setVersion((value) => value + 1); }, []);
  return <IdentityContext.Provider value={{ client, session, profile, isAdmin, loading, error, refresh }}>{children}</IdentityContext.Provider>;
}
