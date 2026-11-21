"use client";

import "../onboarding-theme.css";
import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Bell, CalendarDays, Compass, Orbit } from "lucide-react";
import { Button } from "@launchpad/ui";
import { AstronautDoodle } from "../components/space-doodles";

const steps = [
  { label: "Welcome", eyebrow: "YOUR TECHSPACE UNIVERSE", title: <>Your next<br />idea starts here.</>, body: "Launchpad brings TechSpace events and updates together, so you can spend less time searching and more time making things happen.", icon: Orbit, scene: "coding" },
  { label: "Discover & Join", eyebrow: "FIND YOUR NEXT THING", title: <>Discover. Join.<br />Make it yours.</>, body: "Explore published workshops, talks, and hackathons. Open an event to see its details, then register while registration is open.", icon: Compass, scene: "rocket" },
  { label: "Participate & Grow", eyebrow: "STAY IN THE LOOP", title: <>Show up and<br />keep exploring.</>, body: "Find your registrations and event QR passes, read club announcements, and open shared event materials. Certificates are planned for Release 2.", icon: CalendarDays, scene: "flag" },
] as const;

export function OnboardingPage() {
  const [step, setStep] = useState(0);
  const current = steps[step];
  const Icon = current.icon;
  return <main className="welcome-page" aria-labelledby="welcome-title">
    <Link href="/" className="welcome-brand"><span className="welcome-brand-mark"><AstronautDoodle scene="planet" /></span><span><strong>TechSpace</strong><small>Launchpad</small></span></Link>
    <section className="welcome-card">
      <div className="welcome-art-panel"><span className="welcome-art-orbit" aria-hidden="true" /><AstronautDoodle scene={current.scene} className="welcome-astronaut" priority /><span className="welcome-art-caption">YOUR UNIVERSE. YOUR EVENTS.</span></div>
      <div className="welcome-copy">
        <div className="welcome-progress" aria-label={`Step ${step + 1} of ${steps.length}`}><span>0{step + 1} <span className="welcome-progress-divider">/</span> 0{steps.length}</span><div className="welcome-progress-track" aria-hidden="true"><span style={{ width: `${((step + 1) / steps.length) * 100}%` }} /></div></div>
        <div className="welcome-step-label"><Icon size={17} aria-hidden="true" /> {current.label}</div>
        <span className="eyebrow">{current.eyebrow}</span>
        <h1 id="welcome-title">{current.title}</h1>
        <p className="welcome-body">{current.body}</p>
        <div className="welcome-actions">
          {step > 0 && <Button className="welcome-back" variant="outline" onClick={() => setStep((value) => value - 1)} aria-label="Previous step"><ArrowLeft aria-hidden="true" /></Button>}
          {step < steps.length - 1 ? <Button className="welcome-primary" onClick={() => setStep((value) => value + 1)}>Next <ArrowRight aria-hidden="true" /></Button> : <Button className="welcome-primary" asChild><Link href="/account">Get started <ArrowRight aria-hidden="true" /></Link></Button>}
          <Button className="welcome-skip" variant="ghost" asChild><Link href="/account">Skip <span className="sr-only">introduction and go to account</span></Link></Button>
        </div>
        <p className="welcome-account-note"><Bell size={15} aria-hidden="true" /> Sign in with Google to get started. Personal Gmail and university accounts are welcome.</p>
      </div>
    </section>
    <footer className="welcome-footer"><Link href="/">Back to Launchpad home</Link><span>Made for the TechSpace community</span></footer>
  </main>;
}
