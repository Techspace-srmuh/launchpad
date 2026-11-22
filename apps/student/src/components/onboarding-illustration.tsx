"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

export type OnboardingScene = "coding" | "rocket" | "flag";

function StarSvg({ isYellow = true }: { isYellow?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className="onboarding-star-svg"
      aria-hidden="true"
    >
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

export function OnboardingStarAnimation({
  scene,
}: {
  scene: "coding" | "flag";
}) {
  return (
    <div
      className={`onboarding-stars-overlay onboarding-stars-${scene}`}
      aria-hidden="true"
    >
      <div className="onboarding-orbit-anchor">
        {[0, 2].map((index) => (
          <span
            key={index}
            className={`onboarding-orbit-star orbit-star-${index}`}
          >
            <StarSvg />
          </span>
        ))}
      </div>
      <span className="onboarding-blinking-star blinking-star-left">
        <StarSvg />
      </span>
      <span className="onboarding-blinking-star blinking-star-right">
        <StarSvg />
      </span>
    </div>
  );
}
const rocketPoster = "/doodles/02_astronaut_riding_rocket.png";

function RocketMedia({
  isActive,
  priority,
}: {
  isActive: boolean;
  priority: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let cancelled = false;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePlayback = () => {
      setPlaying(false);
      if (!isActive || motion.matches) {
        video.pause();
        return;
      }
      void video
        .play()
        .then(() => {
          if (
            !cancelled &&
            !motion.matches &&
            video.videoWidth > 0 &&
            video.videoHeight > 0
          )
            setPlaying(true);
        })
        .catch(() => {
          if (!cancelled) setPlaying(false);
        });
    };
    updatePlayback();
    motion.addEventListener("change", updatePlayback);
    return () => {
      cancelled = true;
      motion.removeEventListener("change", updatePlayback);
      video.pause();
    };
  }, [isActive]);

  return (
    <div className={`onboarding-rocket-media ${playing ? "is-playing" : ""}`}>
      <Image
        src={rocketPoster}
        alt=""
        width={285}
        height={267}
        priority={priority}
        className="onboarding-art-img onboarding-art-rocket"
      />
      <video
        ref={videoRef}
        src="/assets/onboarding/rocket-animation.mp4"
        poster={rocketPoster}
        loop
        muted
        playsInline
        preload="metadata"
        controls={false}
        className="onboarding-video"
        onPlaying={(event) => {
          const video = event.currentTarget;
          setPlaying(
            isActive &&
              !window.matchMedia("(prefers-reduced-motion: reduce)").matches &&
              video.videoWidth > 0 &&
              video.videoHeight > 0,
          );
        }}
        onError={() => setPlaying(false)}
        onWaiting={() => setPlaying(false)}
        onPause={() => setPlaying(false)}
        aria-label="Astronaut riding a rocket animation"
      />
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
  return (
    <div
      className={`onboarding-illustration-container onboarding-scene-${scene}`}
      aria-hidden="true"
    >
      <div className="onboarding-art-wrapper">
        {scene === "rocket" ? (
          <RocketMedia isActive={isActive} priority={priority} />
        ) : (
          <>
            <Image
              src={
                scene === "coding"
                  ? "/doodles/01_astronaut_coding_on_moon.png"
                  : "/doodles/03_astronaut_holding_flag.png"
              }
              alt=""
              width={scene === "coding" ? 331 : 298}
              height={scene === "coding" ? 270 : 287}
              priority={priority}
              className={`onboarding-art-img onboarding-art-${scene}`}
            />
            <OnboardingStarAnimation scene={scene} />
          </>
        )}
      </div>
    </div>
  );
}
