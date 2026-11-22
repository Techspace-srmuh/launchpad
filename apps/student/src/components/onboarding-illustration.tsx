"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";

export type OnboardingScene = "coding" | "rocket" | "flag";

function StarSvg({ isYellow = true }: { isYellow?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="onboarding-star-svg" aria-hidden="true">
      <path
        d="M12 0 C12 7.5 13.5 12 24 12 C13.5 12 12 16.5 12 24 C12 16.5 10.5 12 0 12 C10.5 12 12 7.5 12 0 Z"
        fill={isYellow ? "var(--onboarding-yellow, #ffda00)" : "#111111"}
        stroke="#111111"
        strokeWidth={isYellow ? "1.6" : "0.5"}
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function OnboardingStarAnimation({ scene }: { scene: "coding" | "flag" }) {
  return (
    <div className={`onboarding-stars-overlay onboarding-stars-${scene}`} aria-hidden="true">
      <div className="onboarding-orbit-anchor">
        {[0, 2].map((index) => (
          <span key={index} className={`onboarding-orbit-star orbit-star-${index}`}>
            <StarSvg />
          </span>
        ))}
      </div>
      <span className="onboarding-blinking-star blinking-star-left"><StarSvg /></span>
      <span className="onboarding-blinking-star blinking-star-right"><StarSvg /></span>
    </div>
  );
}
export function OnboardingIllustration({
              scene,
              priority = false,
              isActive = true,
}: {
              scene: OnboardingScene;
            priority?: boolean;
            isActive?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
              if (!video || scene !== "rocket") return;

              // Preload video as soon as mounted so it's buffered before the user reaches Slide 2
              video.preload = "auto";
              video.load();
  }, [scene]);

  useEffect(() => {
    const video = videoRef.current;
              if (!video || scene !== "rocket") return;

              const prefersReducedMotion =
              typeof window !== "undefined" &&
              window.matchMedia("(prefers-reduced-motion: reduce)").matches;

              if (prefersReducedMotion) {
                video.pause();
              return;
    }

              if (isActive) {
      const playPromise = video.play();
              if (playPromise !== undefined) {
                playPromise.catch(() => {
                  // Handled inline autoplay
                });
      }
    } else {
                video.pause();
    }
  }, [isActive, scene]);

              return (
              <div className={`onboarding-illustration-container onboarding-scene-${scene}`} aria-hidden="true">
                <div className="onboarding-art-wrapper">
                  {scene === "coding" && (
                    <>
                      <Image
                        src="/doodles/01_astronaut_coding_on_moon.png"
                        alt=""
                        width={331}
                        height={270}
                        priority={priority}
                        className="onboarding-art-img onboarding-art-coding"
                      />
                      <OnboardingStarAnimation scene="coding" />
                    </>
                  )}

                  {scene === "rocket" && (
                    <video
                      ref={videoRef}
                      src="/assets/onboarding/rocket-animation.mp4"
                      autoPlay
                      loop
                      muted
                      playsInline
                      preload="auto"
                      controls={false}
                      className="onboarding-video"
                      aria-label="Astronaut riding a rocket animation"
                    >
                      <source src="/assets/onboarding/rocket-animation.mp4" type="video/mp4" />
                    </video>
                  )}

                  {scene === "flag" && (
                    <>
                      <Image
                        src="/doodles/03_astronaut_holding_flag.png"
                        alt=""
                        width={298}
                        height={287}
                        priority={priority}
                        className="onboarding-art-img onboarding-art-flag"
                      />
                      <OnboardingStarAnimation scene="flag" />
                    </>
                  )}
                </div>
              </div>
              );
}
