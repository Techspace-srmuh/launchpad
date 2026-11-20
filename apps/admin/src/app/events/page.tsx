import { AdminEvents } from "../../features/events";
import { AccessGate } from "../../features/account";
import { Suspense } from "react";

export default function Page() { return <Suspense fallback={<p role="status">Loading events…</p>}><AccessGate admin><AdminEvents /></AccessGate></Suspense>; }
