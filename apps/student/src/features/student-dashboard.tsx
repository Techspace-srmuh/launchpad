"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, CalendarDays, Clock3, Compass, MapPin, Megaphone, ScanQrCode, Ticket } from "lucide-react";
import { Button } from "@launchpad/ui";
import { readStudentDashboard, useIdentity, workflowError, type EventRecord, type StudentDashboardData, type StudentRegisteredEvent } from "@launchpad/supabase";
import { AstronautDoodle } from "../components/space-doodles";

const eventDate = (value: string) => new Date(value).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
const eventTime = (value: string) => new Date(value).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
const shortDate = (value: string) => new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

function DashboardSection({ title, href, children }: { title: string; href: string; children: ReactNode }) {
  return <section className="student-section" aria-label={title}><div className="student-section-heading"><h2>{title}</h2><Link href={href}>View all <ArrowRight size={16} aria-hidden="true" /></Link></div>{children}</section>;
}

function EventCard({ event, registration }: { event: EventRecord; registration?: StudentRegisteredEvent }) {
  const past = Date.parse(event.ends_at) < Date.now();
  const label = registration ? past ? registration.checked_in ? "Attended" : "Event ended" : registration.checked_in ? "Checked in" : "Registered" : "Upcoming";
  const href = registration && !past ? `/my-events/${event.id}/pass` : `/events/${event.id}`;
  return <Link className="student-dashboard-card" href={href} aria-label={`${event.title}, ${label}. ${registration && !past ? "View QR pass" : "View event"}`}>
    <span className="student-card-icon"><Ticket size={19} aria-hidden="true" /></span>
    <span className="student-dashboard-card-copy"><strong>{event.title}</strong><small>{eventDate(event.starts_at)} · {event.venue}</small><small className="student-card-state">{label}{registration && !past && !registration.checked_in ? " · View QR pass" : ""}</small></span>
    <ArrowRight className="student-card-arrow" size={17} aria-hidden="true" />
  </Link>;
}

function FeaturedEvent({ event, registration }: { event: EventRecord | null; registration?: StudentRegisteredEvent }) {
  if (!event) return <section className="student-featured" aria-labelledby="featured-title"><div className="student-featured-copy"><span className="student-featured-kicker">WHAT'S NEXT</span><h2 id="featured-title">Your next moment starts here.</h2><p>No upcoming events have been published yet. Explore the event calendar when new activities arrive.</p><div className="student-featured-actions"><Link href="/events">Explore events <ArrowRight size={16} /></Link></div></div><AstronautDoodle scene="rocket" className="student-featured-art" /></section>;
  return <section className="student-featured" aria-labelledby="featured-title"><div className="student-featured-copy"><span className="student-featured-kicker">{registration ? registration.checked_in ? "YOU'RE CHECKED IN" : "YOU'RE GOING" : "UPCOMING EVENT"}</span><h2 id="featured-title">{event.title}</h2><ul className="student-featured-meta"><li><CalendarDays size={16} aria-hidden="true" />{eventDate(event.starts_at)}</li><li><Clock3 size={16} aria-hidden="true" />{eventTime(event.starts_at)} – {eventTime(event.ends_at)}</li><li><MapPin size={16} aria-hidden="true" />{event.venue}</li></ul><div className="student-featured-actions">{registration ? <><Link href={`/my-events/${event.id}/pass`}>View QR pass <ScanQrCode size={16} /></Link><Link href={`/events/${event.id}`}>Event details <ArrowRight size={16} /></Link></> : <Link href={`/events/${event.id}`}>View event <ArrowRight size={16} /></Link>}</div></div><AstronautDoodle scene="rocket" className="student-featured-art" /></section>;
}

export function StudentDashboard() {
  const { client, session, profile } = useIdentity();
  const [data, setData] = useState<StudentDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    if (!client || !session) return;
    setLoading(true);
    setError("");
    void readStudentDashboard(client, session.user.id)
      .then((result) => { if (active) setData(result); })
      .catch((failure: unknown) => { if (active) setError(workflowError(failure)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [client, session, version]);

  const now = Date.now();
  const firstName = profile?.full_name?.trim().split(/\s+/)[0] || "Explorer";
  const nextRegistration = data?.registrations.filter((item) => item.event && Date.parse(item.event.ends_at) >= now).sort((a, b) => Date.parse(a.event!.starts_at) - Date.parse(b.event!.starts_at))[0];
  const featured = nextRegistration?.event ?? data?.upcomingEvents[0] ?? null;
  const upcoming = data?.upcomingEvents.filter((event) => event.id !== featured?.id).slice(0, 2) ?? [];
  const myEvents = data?.registrations.filter((item) => item.event && item.event.id !== nextRegistration?.event?.id).slice(0, 2) ?? [];

  return <div className="student-dashboard">
    <section className="student-dashboard-intro" aria-labelledby="dashboard-greeting"><div><span className="reference-kicker">YOUR TECHSPACE UNIVERSE</span><h1 id="dashboard-greeting">Hey, <span>{firstName}!</span></h1><p>Here&apos;s what&apos;s happening around TechSpace.</p></div><AstronautDoodle scene="coding" className="student-dashboard-intro-art" priority /></section>

    {loading ? <div className="student-dashboard-skeleton" role="status" aria-label="Loading dashboard"><span /><span /><span className="sr-only">Loading your events and announcements.</span></div> : error ? <div className="student-dashboard-error"><p role="alert">Your dashboard could not be loaded. {error}</p><Button variant="outline" onClick={() => setVersion((value) => value + 1)}>Try again</Button></div> : data && <>
      <div className="student-dashboard-main"><FeaturedEvent event={featured} registration={nextRegistration} /><section className="student-next-panel" aria-label="Your next step"><span>YOUR NEXT STEP</span>{nextRegistration?.event ? <><h2>{nextRegistration.checked_in ? "You're checked in." : "Your pass is ready."}</h2><p>{nextRegistration.checked_in ? `Attendance has been recorded for ${nextRegistration.event.title}. Explore the materials shared for this event.` : `Keep your QR pass ready for ${nextRegistration.event.title}. You can open it here when it's time to attend.`}</p><Link href={nextRegistration.checked_in ? `/events/${nextRegistration.event.id}/materials` : `/my-events/${nextRegistration.event.id}/pass`}>{nextRegistration.checked_in ? "View event materials" : "Open QR pass"} <ArrowRight size={17} /></Link></> : data.registrations.length ? <><h2>Keep your events close.</h2><p>Your previous registrations are available in My Events, including attendance details.</p><Link href="/my-events">See My Events <ArrowRight size={17} /></Link></> : <><h2>Find something worth joining.</h2><p>Explore upcoming workshops, talks, and community events. Your registrations will appear here.</p><Link href="/events#event-search">Explore events <ArrowRight size={17} /></Link></>}</section></div>

      <DashboardSection title="Upcoming Events" href="/events">{upcoming.length ? <div className="student-dashboard-grid">{upcoming.map((event) => <EventCard event={event} key={event.id} />)}</div> : <div className="student-empty"><Compass size={20} aria-hidden="true" /><span>{featured ? "More events will appear here as they're published." : "No upcoming events yet."} <Link href="/events">Explore all events</Link></span></div>}</DashboardSection>

      {data.registrations.length > 0 && <DashboardSection title="My Events" href="/my-events">{myEvents.length ? <div className="student-dashboard-grid">{myEvents.map((item) => item.event && <EventCard event={item.event} registration={item} key={item.registration_id} />)}</div> : <div className="student-empty"><Ticket size={20} aria-hidden="true" /><span>Your next event and QR pass are above. <Link href="/my-events">See all registrations</Link></span></div>}</DashboardSection>}

      <DashboardSection title="Announcements" href="/announcements">{data.recentAnnouncements.length ? <div className="student-dashboard-grid">{data.recentAnnouncements.slice(0, 2).map((item) => <Link key={item.id} className="student-dashboard-notice" href={`/announcements#announcement-${item.id}`}><span className="student-card-icon"><Megaphone size={18} aria-hidden="true" /></span><span><strong>{item.title}</strong><small>{item.body}</small><time dateTime={item.published_at}>{shortDate(item.published_at)}</time></span><ArrowRight size={17} aria-hidden="true" /></Link>)}</div> : <div className="student-empty"><Megaphone size={20} aria-hidden="true" /><span>Club updates and event announcements will appear here.</span></div>}</DashboardSection>
    </>}
  </div>;
}
