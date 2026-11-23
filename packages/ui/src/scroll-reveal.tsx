"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/** Progressive enhancement: content stays visible until it is observed. */
export function ScrollReveal() {
  const pathname = usePathname();
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const root = document.querySelector("main");
    if (!root) return;
    const selector = ".workflow-panel, .workflow-section > .workflow-heading, .stat-card, .tool-card, .student-section, .student-featured, .student-next-panel, .reference-small-card, .reference-notice-card, .student-event-card, .reference-featured, .reference-public-card, .reference-list-section, .welcome-row, .reference-intro, .profile-form-section, .profile-overview-card, .profile-overview-links, .profile-overview-account, .profile-setup-form, .sign-in-options, .event-detail-intro, .setup-heading, .config-card, .content-section, .email-delivery";
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("scroll-reveal-visible");
        observer.unobserve(entry.target);
      }
    }, { rootMargin: "0px 0px -32px 0px", threshold: 0.05 });
    const seen = new WeakSet<Element>();
    function collect() {
      root?.querySelectorAll(selector).forEach((element) => {
        if (seen.has(element)) return;
        seen.add(element);
        // Do not hide items already on screen while waiting for an observer callback.
        if (element.getBoundingClientRect().top > window.innerHeight - 24) {
          element.classList.add("scroll-reveal-pending");
          observer.observe(element);
        }
      });
    }
    collect();
    const mutations = new MutationObserver(collect);
    mutations.observe(root, { childList: true, subtree: true });
    return () => { mutations.disconnect(); observer.disconnect(); };
  }, [pathname]);
  return null;
}
