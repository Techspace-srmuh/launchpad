"use client";

import "../onboarding-theme.css";
import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AstronautDoodle } from "../components/space-doodles";
import { OnboardingIllustration, type OnboardingScene } from "../components/onboarding-illustration";
import { RocketSweepHeading, SequentialDescription } from "../components/onboarding-typography";

interface StepConfig {
  headingLines: readonly string[];
  body: string;
  fallbackBodyLines: readonly string[];
  scene: OnboardingScene;
}

const steps: readonly StepConfig[] = [
  {
    headingLines: ["Welcome to", "Launchpad"],
    body: "Your campus gateway to events, learning and community at TechSpace.",
    fallbackBodyLines: [
      "Your campus gateway to events,",
      "learning and community at TechSpace.",
    ],
    scene: "coding",
  },
  {
    headingLines: ["Discover & Join"],
    body: "Find workshops, hackathons, talks and more, all in one place.",
    fallbackBodyLines: [
      "Find workshops, hackathons, talks",
      "and more, all in one place.",
    ],
    scene: "rocket",
  },
  {
    headingLines: ["Participate & Grow"],
    body: "Register, attend, access resources and get certified for your achievements.",
    fallbackBodyLines: [
      "Register, attend, access resources",
      "and get certified for your achievements.",
    ],
    scene: "flag",
  },
] as const;

export function LaunchpadBrand() {
  return (
    <Link href="/" className="onboarding-brand" aria-label="TechSpace Launchpad home">
      <AstronautDoodle scene="planet" />
      <span>
        <strong>TechSpace</strong>
        <span>Launchpad</span>
      </span>
    </Link>
  );
}

export function MoonHorizon() {
  return (
    <div className="onboarding-moon" aria-hidden="true">
      <span />
      <span />
      <span />
      <span />
    </div>
  );
}

export function OnboardingPage() {
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [animKey, setAnimKey] = useState(0);
  const [headingCompleted, setHeadingCompleted] = useState(false);

  const titleRef = useRef<HTMLHeadingElement>(null);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const current = steps[step];

  const showStep = useCallback(
    (next: number) => {
      if (next === step || next < 0 || next >= steps.length) return;
      setDirection(next > step ? 1 : -1);
      setStep(next);
      setHeadingCompleted(false);
      setAnimKey((prev) => prev + 1);
      requestAnimationFrame(() => titleRef.current?.focus({ preventScroll: true }));
    },
    [step]
  );

  const handleHeadingComplete = useCallback(() => {
    setHeadingCompleted(true);
  }, []);

  function handleTouchStart(e: React.TouchEvent) {
    if (e.touches.length !== 1) return;
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - touchStartX.current;
    const deltaY = touch.clientY - touchStartY.current;

    touchStartX.current = null;
    touchStartY.current = null;

    // Trigger swipe only when horizontal gesture is deliberate (> 50px)
    // and distinctly horizontal (1.4x dominant) so vertical scrolling is unaffected
    if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY) * 1.4) {
      if (deltaX < 0 && step < steps.length - 1) {
        showStep(step + 1);
      } else if (deltaX > 0 && step > 0) {
        showStep(step - 1);
      }
    }
  }

  const slideAnimClass =
    animKey === 0
      ? "onboarding-slide-enter-initial"
      : direction === 1
        ? "onboarding-slide-enter-right"
        : "onboarding-slide-enter-left";

  return (
    <section
      className={`onboarding-screen intro-screen intro-step-${step + 1}`}
      aria-labelledby="welcome-title"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* 1. Illustration Stage */}
      <div className={`intro-scene ${slideAnimClass}`}>
        <div
          className={`onboarding-slide-layer ${step === 0 ? "is-active" : "is-inactive"}`}
          aria-hidden={step !== 0}
        >
          <OnboardingIllustration scene="coding" priority={step === 0} />
        </div>
        <div
          className={`onboarding-slide-layer ${step === 1 ? "is-active" : "is-inactive"}`}
          aria-hidden={step !== 1}
        >
          <OnboardingIllustration scene="rocket" priority={step === 1} isActive={step === 1} />
        </div>
        <div
          className={`onboarding-slide-layer ${step === 2 ? "is-active" : "is-inactive"}`}
          aria-hidden={step !== 2}
        >
          <OnboardingIllustration scene="flag" priority={step === 2} />
        </div>
      </div>

      {/* Keep the animated heading and description together in natural flow. */}
      <div className="intro-copy">
        <div className="intro-heading-container" key={`heading-box-${animKey}`}>
          <RocketSweepHeading
            key={`heading-${animKey}`}
            lines={current.headingLines}
            hasRays={step === 0}
            titleRef={titleRef}
            onComplete={handleHeadingComplete}
          />
        </div>

        <div className="intro-description-container" key={`desc-box-${animKey}`}>
          <SequentialDescription
            key={`desc-${animKey}`}
            text={current.body}
            fallbackLines={current.fallbackBodyLines}
            canStart={headingCompleted}
          />
        </div>
      </div>

      {/* 4. Pagination Indicators */}
      <nav className="intro-pagination" aria-label="Introduction slides">
        {steps.map((item, index) => (
          <button
            key={item.scene}
            type="button"
            aria-label={`Go to slide ${index + 1}`}
            aria-current={step === index ? "step" : undefined}
            onClick={() => showStep(index)}
          >
            <span />
          </button>
        ))}
      </nav>

      {/* 5. Navigation Buttons */}
      <div className={`intro-actions ${step === 0 ? "intro-actions-welcome" : ""}`}>
        {step === 0 ? (
          <>
            <button type="button" className="onboarding-primary" onClick={() => showStep(1)}>
              Get Started <ArrowRight aria-hidden="true" />
            </button>
            <Link className="onboarding-secondary" href="/account">
              I already have an account
            </Link>
          </>
        ) : (
          <>
            <Link className="intro-skip" href="/account">
              Skip
            </Link>
            {step < steps.length - 1 ? (
              <button type="button" className="onboarding-primary" onClick={() => showStep(step + 1)}>
                Next <ArrowRight aria-hidden="true" />
              </button>
            ) : (
              <Link className="onboarding-primary" href="/account">
                Next <ArrowRight aria-hidden="true" />
              </Link>
            )}
          </>
        )}
      </div>
    </section>
  );
}
