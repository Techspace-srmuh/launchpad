import { OnboardingPage } from "../../features/onboarding";

export default function Page() {
  return (
    <>
      <link
        rel="preload"
        href="/assets/onboarding/rocket-animation.mp4"
        as="video"
        type="video/mp4"
      />
      <OnboardingPage />
    </>
  );
}
