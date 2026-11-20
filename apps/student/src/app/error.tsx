"use client";

import { Button } from "@launchpad/ui";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <section className="workflow-panel"><h1>This page could not be loaded</h1><p>Please try again.</p><Button onClick={reset}>Retry</Button></section>;
}
