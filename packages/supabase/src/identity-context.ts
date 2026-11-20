"use client";

import { createContext, useContext } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import type { ProfileRecord } from "./workflows";

export interface Identity {
  client: SupabaseClient | null;
  session: Session | null;
  profile: ProfileRecord | null;
  isAdmin: boolean;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
}

export const IdentityContext = createContext<Identity | null>(null);

export function useIdentity(): Identity {
  const identity = useContext(IdentityContext);
  if (!identity) throw new Error("IdentityProvider is required.");
  return identity;
}
