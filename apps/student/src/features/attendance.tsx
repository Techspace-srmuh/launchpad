"use client";

import { useEffect, useState } from "react";
import { useIdentity, workflowError, type AttendanceRecord } from "@launchpad/supabase";
import { Button } from "@launchpad/ui";

export function StudentEventQr({ eventId }: { eventId: string }) {
  const { client, session } = useIdentity();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [attendance, setAttendance] = useState<AttendanceRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    const controller = new AbortController();
    if (!client || !session || !eventId) return;

    setLoading(true);
    setError("");
    setImageUrl(null);
    setAttendance(null);

    void (async () => {
      try {
        // Fetch QR image with bearer token
        const res = await fetch(`/api/qr/${eventId}`, {
          signal: controller.signal,
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(errText || "Could not load QR code.");
        }

        const blob = await res.blob();
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);

        // Fetch attendance status
        const { data: attData, error: attError } = await client
          .from("attendance")
          .select("*")
          .eq("event_id", eventId)
          .eq("user_id", session.user.id)
          .maybeSingle();

        if (attError) throw attError;

        if (active) {
          setImageUrl(objectUrl);
          setAttendance(attData as AttendanceRecord | null);
        }
      } catch (failure) {
        if (active) setError(workflowError(failure));
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [client, session, eventId, version]);

  return (
    <div className="workflow-panel qr-attendance-card">
      <h2>Your event attendance QR</h2>
      <p>
        Present this private QR credential to an event admin at check-in. It is unique to this event and never reveals your registration number or personal details.
      </p>

      {loading ? (
        <p role="status">Loading your event QR…</p>
      ) : error ? (
        <div>
          <p role="alert">{error}</p>
          <Button variant="outline" onClick={() => setVersion((v) => v + 1)}>
            Retry QR
          </Button>
        </div>
      ) : (
        <div className="qr-container">
          {imageUrl && (
            <div className="qr-image-wrapper">
              <img
                src={imageUrl}
                alt="Your event check-in QR code"
                width={280}
                height={280}
                className="qr-image"
              />
            </div>
          )}
          <div className="attendance-status">
            {attendance && attendance.checked_in ? (
              <p className="status-badge status-badge-checked-in">
                ✓ Checked in at {new Date(attendance.checked_at).toLocaleTimeString()}
              </p>
            ) : attendance && !attendance.checked_in ? (
              <p className="status-badge status-badge-not-checked-in">
                Attendance updated: Not checked in
                {attendance.correction_reason && ` (${attendance.correction_reason})`}
              </p>
            ) : (
              <p className="status-badge status-badge-pending">
                Status: Registered · Awaiting check-in
              </p>
            )}
          </div>
          <Button variant="outline" onClick={() => setVersion((v) => v + 1)}>
            Refresh status
          </Button>
        </div>
      )}
    </div>
  );
}
