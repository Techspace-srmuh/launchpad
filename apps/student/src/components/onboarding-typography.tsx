"use client";

import Image from "next/image";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

export const ONBOARDING_TIMING = {
  HEADING_LINE_SLIDE_MS: 320,
  HEADING_LINE_STAGGER_MS: 320,
  DESC_START_DELAY_MS: 100,
  DESC_LINE_SLIDE_MS: 280,
  DESC_LINE_STAGGER_MS: 100,
  SLIDE_TRANSITION_DELAY_MS: 50,
} as const;

interface RocketSweepHeadingProps {
  lines: readonly string[];
  hasRays?: boolean;
  titleRef?: React.RefObject<HTMLHeadingElement | null>;
  onComplete?: () => void;
}

export function RocketSweepHeading({
  lines,
  hasRays = false,
  titleRef,
  onComplete,
}: RocketSweepHeadingProps) {
  const fullTitle = lines.join(" ");
  const [visibleLines, setVisibleLines] = useState<boolean[]>(() =>
    new Array(lines.length).fill(false),
  );
  const [raysVisible, setRaysVisible] = useState(false);

  useEffect(() => {
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReducedMotion) {
      setVisibleLines(new Array(lines.length).fill(true));
      if (hasRays) setRaysVisible(true);
      onComplete?.();
      return;
    }

    const timers: NodeJS.Timeout[] = [];

    // Step 1: Reveal heading lines sequentially
    lines.forEach((_, idx) => {
      const delay =
        ONBOARDING_TIMING.SLIDE_TRANSITION_DELAY_MS +
        idx * ONBOARDING_TIMING.HEADING_LINE_STAGGER_MS;

      const timer = setTimeout(() => {
        setVisibleLines((prev) => {
          const next = [...prev];
          next[idx] = true;
          return next;
        });

        // If this is the last line of Slide 1, fade in sunburst rays
        if (hasRays && idx === lines.length - 1) {
          const rayTimer = setTimeout(() => {
            setRaysVisible(true);
          }, 80);
          timers.push(rayTimer);
        }
      }, delay);

      timers.push(timer);
    });

    // Step 2: Trigger description lines after heading reveal has commenced
    const totalLinesTime =
      ONBOARDING_TIMING.SLIDE_TRANSITION_DELAY_MS +
      lines.length * ONBOARDING_TIMING.HEADING_LINE_STAGGER_MS;

    const descTriggerTimer = setTimeout(() => {
      onComplete?.();
    }, totalLinesTime + ONBOARDING_TIMING.DESC_START_DELAY_MS);
    timers.push(descTriggerTimer);

    return () => {
      timers.forEach(clearTimeout);
    };
  }, [hasRays, lines, onComplete]);

  return (
    <h1
      id="welcome-title"
      ref={titleRef}
      tabIndex={-1}
      className="intro-heading"
      aria-label={fullTitle}
    >
      {/* Accessible screen reader announcement */}
      <span className="sr-only">{fullTitle}</span>

      {/* Visual animated heading lines */}
      <span className="intro-heading-lines" aria-hidden="true">
        {lines.map((line, idx) => {
          const isRayLine = hasRays && idx === lines.length - 1;
          return (
            <span key={`${idx}-${line}`} className="heading-line-mask">
              <span
                className={`heading-line-content ${visibleLines[idx] ? "is-visible" : ""}`}
              >
                {line}
                {isRayLine && (
                  <span
                    className={`intro-rays ${raysVisible ? "is-visible" : ""}`}
                    aria-hidden="true"
                  >
                    <i />
                    <i />
                    <i />
                  </span>
                )}
              </span>
            </span>
          );
        })}
      </span>

      {/* Astronaut riding rocket illustration cruising across the heading */}
      <span className="heading-rocket-track" aria-hidden="true">
        <span className="heading-rocket">
          <Image
            src="/doodles/rocket_sweep_illustration.png"
            alt=""
            width={45}
            height={47}
            className="rocket-move-img"
            priority
          />
        </span>
      </span>
    </h1>
  );
}

interface SequentialDescriptionProps {
  text: string;
  fallbackLines: readonly string[];
  canStart: boolean;
}

export function SequentialDescription({
  text,
  fallbackLines,
  canStart,
}: SequentialDescriptionProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<string[]>([...fallbackLines]);
  const [visibleLines, setVisibleLines] = useState<boolean[]>(() =>
    new Array(fallbackLines.length).fill(false),
  );

  // Measure dynamic word wrapping on client for responsive devices
  useLayoutEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const measure = () => {
      const words = text.split(" ");

      const measureEl = document.createElement("div");
      measureEl.className = "intro-description intro-desc-measure";
      measureEl.style.position = "absolute";
      measureEl.style.visibility = "hidden";
      measureEl.style.pointerEvents = "none";
      measureEl.style.width = `${container.clientWidth || 320}px`;
      measureEl.style.left = "-9999px";

      words.forEach((word) => {
        const span = document.createElement("span");
        span.className = "desc-measure-word";
        span.textContent = `${word} `;
        measureEl.appendChild(span);
      });

      document.body.appendChild(measureEl);

      // Group words with identical offsetTop into visual lines
      const wordSpans = Array.from(measureEl.children) as HTMLElement[];
      const detectedLines: string[] = [];
      let currentLineWords: string[] = [];
      let currentTop = -1;

      wordSpans.forEach((span) => {
        const top = span.offsetTop;
        if (currentTop === -1 || Math.abs(top - currentTop) < 5) {
          currentLineWords.push(span.textContent?.trim() || "");
          if (currentTop === -1) currentTop = top;
        } else {
          detectedLines.push(currentLineWords.join(" "));
          currentLineWords = [span.textContent?.trim() || ""];
          currentTop = top;
        }
      });

      if (currentLineWords.length > 0) {
        detectedLines.push(currentLineWords.join(" "));
      }

      document.body.removeChild(measureEl);

      if (detectedLines.length > 0) {
        setLines((previous) =>
          previous.join("\n") === detectedLines.join("\n")
            ? previous
            : detectedLines,
        );
        setVisibleLines((previous) =>
          detectedLines.map(
            (_, index) => previous[index] ?? previous.every(Boolean),
          ),
        );
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, [text]);

  useEffect(() => {
    if (!canStart) return;

    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReducedMotion) {
      setVisibleLines(new Array(lines.length).fill(true));
      return;
    }

    const timers: NodeJS.Timeout[] = [];
    lines.forEach((_, idx) => {
      const timer = setTimeout(() => {
        setVisibleLines((prev) => {
          const next = [...prev];
          next[idx] = true;
          return next;
        });
      }, idx * ONBOARDING_TIMING.DESC_LINE_STAGGER_MS);
      timers.push(timer);
    });

    return () => {
      timers.forEach(clearTimeout);
    };
  }, [canStart, lines]);

  return (
    <div ref={containerRef} className="intro-description-wrapper">
      <p className="intro-description" aria-label={text}>
        {/* Screen reader accessible text */}
        <span className="sr-only">{text}</span>

        {/* Line-by-line visual reveal */}
        <span className="intro-desc-lines" aria-hidden="true">
          {lines.map((lineText, idx) => (
            <span key={`${idx}-${lineText}`} className="desc-line-mask">
              <span
                className={`desc-line-content ${visibleLines[idx] ? "is-visible" : ""}`}
              >
                {lineText}
              </span>
            </span>
          ))}
        </span>
      </p>
    </div>
  );
}
