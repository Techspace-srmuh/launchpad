"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Bell, CalendarDays, LockKeyhole, Orbit, Plus } from "lucide-react";
import { Button } from "@launchpad/ui";
import {
  readAdminDashboard,
  useIdentity,
  workflowError,
  type AdminDashboardSummary,
} from "@launchpad/supabase";

const date = (value: string) => new Date(value).toLocaleString();

export function AdminDashboard() {
  const { client, session, isAdmin } = useIdentity();
  const [data, setData] = useState<AdminDashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    if (!client || !session || !isAdmin) return;
    setLoading(true);
    setError("");
    void readAdminDashboard(client)
      .then((res) => {
        if (active) setData(res);
      })
      .catch((err: unknown) => {
        if (active) setError(workflowError(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [client, session, isAdmin, version]);

  return (
    <section className="workflow-section">
      <div className="workflow-heading">
        <div>
          <span className="eyebrow"><Orbit size={14} /> CONTROL ROOM</span>
          <h1>Operations overview</h1>
          <p>
            Real-time event, registration, and attendance summaries across TechSpace Launchpad.
          </p>
        </div>
        <img className="dashboard-astronaut" src="/doodles/09_astronaut_presenting_analytics.png" alt="" aria-hidden="true" />
        <div className="workflow-actions">
          <Button asChild>
            <Link href="/events/new"><Plus size={16} /> New event</Link>
          </Button>
          <Button variant="outline" onClick={() => setVersion((v) => v + 1)}>
            Refresh summary
          </Button>
        </div>
      </div>

      {loading ? (
        <p role="status">Loading dashboard summary…</p>
      ) : error ? (
        <div className="workflow-panel">
          <p role="alert">{error}</p>
          <Button variant="outline" onClick={() => setVersion((v) => v + 1)}>
            Retry
          </Button>
        </div>
      ) : data ? (
        <>
          {/* Summary Metric Cards */}
          <div className="stat-grid">
            <article className="stat-card">
              <span className="stat-label">Total Events</span>
              <p className="stat-number">{data.total_events}</p>
              <span className="stat-sub">
                {data.published_events} published ({data.upcoming_events} upcoming)
              </span>
            </article>
            <article className="stat-card">
              <span className="stat-label">Upcoming Events</span>
              <p className="stat-number">{data.upcoming_events}</p>
              <span className="stat-sub">Published events starting in future</span>
            </article>
            <article className="stat-card">
              <span className="stat-label">Total Registrations</span>
              <p className="stat-number">{data.total_registrations}</p>
              <span className="stat-sub">Confirmed registrations across events</span>
            </article>
            <article className="stat-card">
              <span className="stat-label">Total Check-ins</span>
              <p className="stat-number">{data.total_check_ins}</p>
              <span className="stat-sub">Verified attendance check-ins</span>
            </article>
          </div>

          {/* Event & Attendance Management Summary */}
          <div className="workflow-panel">
            <div className="workflow-heading">
              <div>
                <h2>Events & attendance summary</h2>
                <p>Status, registration counts, and check-in numbers for recent events.</p>
              </div>
              <Link href="/events">Manage all events <ArrowRight size={14} /></Link>
            </div>

            {!data.events.length ? (
              <div>
                <p>No events have been created yet.</p>
                <Button asChild>
                  <Link href="/events/new">Create first event</Link>
                </Button>
              </div>
            ) : (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Event</th>
                      <th>Status</th>
                      <th>Schedule & Venue</th>
                      <th>Registrations</th>
                      <th>Check-ins</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.events.map((event) => (
                      <tr key={event.id}>
                        <td>
                          <strong>{event.title}</strong>
                        </td>
                        <td>
                          <span className="event-status">{event.status}</span>
                        </td>
                        <td>
                          <div>{date(event.starts_at)}</div>
                          <span className="stat-sub">{event.venue}</span>
                        </td>
                        <td>
                          <strong>{event.registration_count}</strong>
                          {event.capacity ? ` / ${event.capacity}` : " (no cap)"}
                        </td>
                        <td>
                          <span className="event-status status-present">
                            {event.attendance_count} present
                          </span>
                        </td>
                        <td>
                          <div className="workflow-actions">
                            <Link href={`/events/${event.id}/edit`}>Edit</Link>
                            <Link href={`/events/${event.id}/participants`}>Participants</Link>
                            <Link href={`/events/${event.id}/attendance`}>Scan</Link>
                            <Link href={`/events/${event.id}/export`}>Export</Link>
                            <Link href={`/events/${event.id}/materials`}>Materials</Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Recent Announcements */}
          <div className="workflow-panel">
            <div className="workflow-heading">
              <div>
                <h2>Recent announcements</h2>
                <p>Published notices for all students or specific event registrants.</p>
              </div>
              <Link href="/announcements">Manage announcements <ArrowRight size={14} /></Link>
            </div>

            {!data.recent_announcements.length ? (
              <p>No announcements published yet.</p>
            ) : (
              <div className="event-grid">
                {data.recent_announcements.map((ann) => (
                  <article key={ann.id} className="workflow-panel">
                    <span className="event-status">
                      {ann.audience === "all_students" ? "All students" : "Event registrants"}
                    </span>
                    <h3>{ann.title}</h3>
                    <p><time dateTime={ann.published_at}>{date(ann.published_at)}</time></p>
                    <p className="event-description">{ann.body}</p>
                    <div className="workflow-actions">
                      {ann.event_id && <Link href={`/events/${ann.event_id}/edit`}>View event</Link>}
                      {ann.link_url && (
                        <a href={ann.link_url} target="_blank" rel="noopener noreferrer">
                          Open link
                        </a>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>

          {/* Quick Actions Shortcuts */}
          <div className="workflow-panel">
            <h2>Management shortcuts</h2>
            <div className="workflow-actions">
              <Button asChild variant="outline">
                <Link href="/events/new"><Plus size={16} /> New event</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/events"><CalendarDays size={16} /> All events</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/admins"><LockKeyhole size={16} /> Manage admins</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/announcements"><Bell size={16} /> Announcements</Link>
              </Button>
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}
