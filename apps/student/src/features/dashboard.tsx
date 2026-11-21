"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Bookmark, CalendarDays, Clock3, MapPin, Megaphone, Search } from "lucide-react";
import { Button } from "@launchpad/ui";
import { isProfileComplete, readStudentDashboard, useIdentity, workflowError, type StudentDashboardData } from "@launchpad/supabase";
import { AstronautDoodle } from "../components/space-doodles";

const eventDate = (value: string) => new Date(value).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
const eventTime = (value: string) => new Date(value).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

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

  const firstName = profile?.full_name?.trim().split(/\s+/)[0];
  const featured = data?.upcomingEvents[0];

  return <div className="reference-dashboard">
    <section className="reference-intro" aria-labelledby="dashboard-greeting">
      <div className="reference-intro-copy"><span className="reference-kicker">YOUR TECHSPACE UNIVERSE</span><h1 id="dashboard-greeting">Hey, <span>{firstName || "Explorer"}!</span></h1><p>Discover events, build, learn<br />and be a part of TechSpace.</p></div>
      <AstronautDoodle scene="coding" className="reference-intro-art" priority />
    </section>

    <Link className="reference-search" href="/events"><Search size={23} aria-hidden="true" /><span>Search events, workshops, hackathons...</span><ArrowRight size={19} aria-hidden="true" /></Link>

    {!isProfileComplete(profile) && <section className="reference-profile-alert" role="status"><div><strong>Finish your profile to join events</strong><p>Complete your student details once to register immediately. These details are self-declared.</p></div><Button asChild><Link href="/profile">Complete profile <ArrowRight size={16} /></Link></Button></section>}

    {loading ? <div className="reference-state" role="status">Loading your dashboard…</div> : error ? <div className="reference-state"><p role="alert">{error}</p><Button variant="outline" onClick={() => setVersion((value) => value + 1)}>Retry</Button></div> : data && <>
      {featured ? <section className="reference-featured" aria-labelledby="featured-event-title"><div className="reference-featured-copy"><span className="reference-featured-pill">Upcoming event</span><h2 id="featured-event-title">{featured.title}</h2><ul className="reference-event-meta"><li><CalendarDays size={18} aria-hidden="true" />{eventDate(featured.starts_at)}</li><li><Clock3 size={18} aria-hidden="true" />{eventTime(featured.starts_at)} – {eventTime(featured.ends_at)}</li><li><MapPin size={18} aria-hidden="true" />{featured.venue}</li></ul><Button asChild><Link href={`/events/${featured.id}`}>View event <ArrowRight size={19} /></Link></Button></div><AstronautDoodle scene="rocket" className="reference-featured-art" /></section> : <section className="reference-featured reference-featured-empty"><div><span className="reference-featured-pill">YOUR NEXT ADVENTURE</span><h2>More moments are on the way.</h2><p>Published TechSpace events will appear here.</p><Button asChild><Link href="/events">Explore events <ArrowRight size={18} /></Link></Button></div><AstronautDoodle scene="rocket" className="reference-featured-art" /></section>}

      <section className="reference-list-section" aria-labelledby="upcoming-title"><div className="reference-section-heading"><h2 id="upcoming-title">Upcoming Events</h2><Link href="/events">View all <ArrowRight size={19} /></Link></div>{data.upcomingEvents.length > 1 ? <div className="reference-small-grid">{data.upcomingEvents.slice(1, 3).map((event) => <Link className="reference-small-card" href={`/events/${event.id}`} key={event.id}><span className="reference-small-icon"><CalendarDays size={24} aria-hidden="true" /></span><span className="reference-small-copy"><strong>{event.title}</strong><small><CalendarDays size={15} aria-hidden="true" />{eventDate(event.starts_at)}</small></span><ArrowRight className="reference-small-arrow" size={20} aria-hidden="true" /></Link>)}</div> : <p className="reference-empty-copy">No other upcoming events yet.</p>}</section>

      <section className="reference-list-section" aria-labelledby="my-events-title"><div className="reference-section-heading"><h2 id="my-events-title">My Events</h2><Link href="/my-events">View all <ArrowRight size={19} /></Link></div>{data.registrations.length ? <div className="reference-small-grid">{data.registrations.slice(0, 2).map((registration) => <Link className="reference-small-card" href={registration.event ? `/events/${registration.event.id}` : "/my-events"} key={registration.registration_id}><span className="reference-small-icon"><Bookmark size={24} aria-hidden="true" /></span><span className="reference-small-copy"><strong>{registration.event?.title || "Event record"}</strong><small>{registration.checked_in ? "Checked in" : "Registered · View QR pass"}</small></span><ArrowRight className="reference-small-arrow" size={20} aria-hidden="true" /></Link>)}</div> : <p className="reference-empty-copy">Your registered events and QR passes will appear here.</p>}</section>

      <section className="reference-list-section" aria-labelledby="announcements-title"><div className="reference-section-heading"><h2 id="announcements-title">Announcements</h2><Link href="/announcements">View all <ArrowRight size={19} /></Link></div>{data.recentAnnouncements.length ? <Link className="reference-notice-card" href="/announcements"><span className="reference-small-icon"><Megaphone size={24} aria-hidden="true" /></span><span><strong>{data.recentAnnouncements[0].title}</strong><small>{data.recentAnnouncements[0].body}</small></span><ArrowRight size={20} aria-hidden="true" /></Link> : <p className="reference-empty-copy">No announcements yet. Club updates will appear here.</p>}</section>
    </>}
  </div>;
}
