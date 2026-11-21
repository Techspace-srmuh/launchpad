"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import jsQR from "jsqr";
import {
  readEvents,
  useIdentity,
  workflowError,
  type AdminAttendanceItem,
  type EventRecord,
} from "@launchpad/supabase";
import { Button } from "@launchpad/ui";

interface BarcodeDetectorInstance {
  detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue: string }>>;
}
declare const BarcodeDetector: {
  prototype: BarcodeDetectorInstance;
  new (options?: { formats: string[] }): BarcodeDetectorInstance;
  getSupportedFormats?: () => Promise<string[]>;
};

export function AttendanceScanner() {
  const { eventId } = useParams<{ eventId?: string }>();
  const { client } = useIdentity();
  const [event, setEvent] = useState<EventRecord | null>(null);
  const [attendanceList, setAttendanceList] = useState<AdminAttendanceItem[]>([]);
  const [page, setPage] = useState(0);
  const [people, setPeople] = useState<Record<string, { full_name: string; roll_number: string }>>({});
  const [startingCamera, setStartingCamera] = useState(false);
  const cameraGeneration = useRef(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);

  // Scanner state
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [scanResult, setScanResult] = useState<{ success: boolean; message: string } | null>(null);
  const [scanBusy, setScanBusy] = useState(false);

  // Correction state
  const [correctingId, setCorrectingId] = useState<string | null>(null);
  const [correctReason, setCorrectReason] = useState("");
  const [correctStatus, setCorrectStatus] = useState<boolean>(false);
  const [correctError, setCorrectError] = useState("");
  const [correctBusy, setCorrectBusy] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastScannedToken = useRef<string | null>(null);
  const scanLock = useRef(false);

  // Load event details and attendance list
  useEffect(() => {
    let active = true;
    if (!client || !eventId) return;

    setLoading(true);
    setError("");
    setCorrectingId(null);

    void (async () => {
      try {
        const [events, attRes] = await Promise.all([
          readEvents(client, false, eventId),
          client.rpc("admin_list_attendance", { p_event_id: eventId, p_offset: page * 100 }),
        ]);

        if (attRes.error) throw attRes.error;

        const rows = (attRes.data ?? []) as AdminAttendanceItem[];
        const ids = [...new Set(rows.map((row) => row.user_id))];
        const profiles = ids.length ? await client.from("profiles").select("user_id,full_name,roll_number").in("user_id", ids) : { data: [], error: null };
        if (profiles.error) throw profiles.error;
        if (active) {
          setPeople(Object.fromEntries((profiles.data ?? []).map((person) => [person.user_id, person])));
          setEvent(events[0] ?? null);
          setAttendanceList((attRes.data ?? []) as AdminAttendanceItem[]);
        }
      } catch (failure) {
        if (active) setError(workflowError(failure));
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [client, eventId, version, page]);

  // Handle camera stream cleanup
  const stopCamera = useCallback(() => {
    cameraGeneration.current += 1;
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setScanning(false);
    setStartingCamera(false);
  }, []);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera, eventId]);

  // Process a decoded QR token
  const handleDecodedToken = async (token: string) => {
    if (scanLock.current || !client || !eventId) return;
    if (lastScannedToken.current === token) return; // debounce same code in view

    const generation = cameraGeneration.current;
    scanLock.current = true;
    setScanBusy(true);
    setScanResult(null);

    try {
      const { data, error: rpcError } = await client.rpc("validate_check_in", {
        p_token: token,
        p_event_id: eventId,
      });

      if (generation !== cameraGeneration.current) return;
      if (rpcError) {
        setScanResult({ success: false, message: workflowError(rpcError) });
      } else if (data) {
        lastScannedToken.current = token;
        setScanResult({ success: true, message: "Check-in recorded successfully!" });
        setVersion((v) => v + 1); // refresh list
      }
    } catch (failure) {
      setScanResult({ success: false, message: workflowError(failure) });
    } finally {
      setScanBusy(false);
      setTimeout(() => {
        scanLock.current = false;
      }, 1500); // 1.5s delay before allowing another scan
    }
  };

  // Start camera
  const startCamera = async () => {
    setCameraError("");
    setScanResult(null);
    if (startingCamera || scanning) return;
    const generation = ++cameraGeneration.current;
    setStartingCamera(true);
    lastScannedToken.current = null;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError("Camera access is not supported in this browser or requires HTTPS.");
      setStartingCamera(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      if (generation !== cameraGeneration.current) { stream.getTracks().forEach((track) => track.stop()); return; }
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        if (generation !== cameraGeneration.current) return;
        setScanning(true);
        startScanLoop(generation);
      }
    } catch (err: unknown) {
      if (generation !== cameraGeneration.current) return;
      stopCamera();
      const msg = err instanceof Error ? err.name : String(err);
      if (msg === "NotAllowedError" || msg === "PermissionDeniedError") {
        setCameraError("Camera permission denied. Please allow camera access in your browser settings.");
      } else if (msg === "NotFoundError" || msg === "DevicesNotFoundError") {
        setCameraError("No camera device found on this system.");
      } else {
        setCameraError("Unable to access camera: " + (err instanceof Error ? err.message : String(err)));
      }
    } finally {
      if (generation === cameraGeneration.current) setStartingCamera(false);
    }
  };

  // Frame scan loop
  const startScanLoop = (generation: number) => {
    const hasBarcodeDetector = typeof BarcodeDetector !== "undefined";
    let detector: BarcodeDetectorInstance | null = null;
    if (hasBarcodeDetector) {
      try {
        detector = new BarcodeDetector({ formats: ["qr_code"] });
      } catch {
        detector = null;
      }
    }

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    const scanFrame = async () => {
      if (generation !== cameraGeneration.current) return;
      const video = videoRef.current;
      if (!video || video.readyState !== video.HAVE_ENOUGH_DATA) {
        animationFrameRef.current = requestAnimationFrame(scanFrame);
        return;
      }

      if (detector) {
        try {
          const barcodes = await detector.detect(video);
          if (generation !== cameraGeneration.current) return;
          if (barcodes.length > 0 && barcodes[0].rawValue) {
            void handleDecodedToken(barcodes[0].rawValue.trim());
          }
        } catch {
          // Fall back to canvas/jsQR on error
          if (generation === cameraGeneration.current) fallbackJsQR(video, canvas, ctx);
        }
      } else {
        fallbackJsQR(video, canvas, ctx);
      }

      if (generation === cameraGeneration.current) animationFrameRef.current = requestAnimationFrame(scanFrame);
    };

    const fallbackJsQR = (
      video: HTMLVideoElement,
      canvas: HTMLCanvasElement,
      ctx: CanvasRenderingContext2D | null
    ) => {
      if (!ctx) return;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height);
      if (code && code.data) {
        void handleDecodedToken(code.data.trim());
      }
    };

    animationFrameRef.current = requestAnimationFrame(scanFrame);
  };

  // Save manual attendance correction
  const handleCorrection = async (e: FormEvent) => {
    e.preventDefault();
    if (!client || !correctingId) return;

    setCorrectBusy(true);
    setCorrectError("");

    try {
      const { error: rpcError } = await client.rpc("admin_correct_attendance", {
        p_attendance_id: correctingId,
        p_checked_in: correctStatus,
        p_reason: correctReason.trim(),
      });
      if (rpcError) throw rpcError;

      setCorrectingId(null);
      setCorrectReason("");
      setVersion((v) => v + 1);
    } catch (failure) {
      setCorrectError(workflowError(failure));
    } finally {
      setCorrectBusy(false);
    }
  };

  if (loading && (!event || event.id !== eventId)) return <p role="status">Loading attendance data…</p>;
  if (!event) {
    return (
      <section className="workflow-panel">
        <h1>Event unavailable</h1>
        {error && <><p role="alert">{error}</p><Button variant="outline" onClick={() => setVersion((value) => value + 1)}>Retry attendance</Button></>}
        <Link href="/events">Back to events</Link>
      </section>
    );
  }

  const now = Date.now();
  const startsAt = Date.parse(event.starts_at);
  const endsAt = Date.parse(event.ends_at);
  const inWindow = now >= startsAt && now <= endsAt;

  return (
    <section className="workflow-section">
      <Link href="/events">Back to events</Link>
      <div className="workflow-heading">
        <div>
          <h1>Attendance check-in</h1>
          <p className="section-side-note">{event.title}</p>
        </div>
        <Button variant="outline" onClick={() => setVersion((v) => v + 1)}>
          Refresh records
        </Button>
      </div>

      {loading && <p role="status">Refreshing attendance data…</p>}
      {error && <p role="alert">{error}</p>}
      {!inWindow && (
        <div className="warning-panel" role="status">
          <strong>Check-in window notice</strong>
          <p>
            This event runs from {new Date(event.starts_at).toLocaleString()} to{" "}
            {new Date(event.ends_at).toLocaleString()}. Scans outside this window will be rejected by the backend.
          </p>
        </div>
      )}

      {/* QR Camera Scanner Panel */}
      <div className="workflow-panel">
        <h2>Live QR Scanner</h2>
        <p>
          Point your phone camera at the student’s event QR code. The server enforces matching event, active check-in window, and single check-in atomically.
        </p>

        {cameraError && <p role="alert">{cameraError}</p>}

        <div className="scanner-container">
          <div className="video-viewport" style={{ display: scanning ? "block" : "none" }}>
            <video
              ref={videoRef}
              playsInline
              muted
              style={{ width: "100%", maxWidth: "420px", borderRadius: "8px", background: "#000" }}
            />
          </div>

          <div className="workflow-actions">
            {!scanning ? (
              <Button disabled={startingCamera} onClick={() => void startCamera()}>{startingCamera ? "Starting camera…" : "Start camera scanner"}</Button>
            ) : (
              <Button variant="outline" onClick={stopCamera}>
                Stop camera
              </Button>
            )}
          </div>

          {scanBusy && <p role="status">Validating check-in…</p>}

          {scanResult && (
            <div
              className={`scan-result-card ${scanResult.success ? "scan-result-success" : "scan-result-error"}`}
              role={scanResult.success ? "status" : "alert"}
            >
              <strong>{scanResult.success ? "Check-in recorded" : "Scan rejected"}</strong>
              <p>{scanResult.message}</p>
            </div>
          )}
        </div>
      </div>

      {/* Attendance List Panel */}
      <div className="workflow-panel">
        <h2>Check-in records ({attendanceList.length} on this page)</h2>
        <p>Recorded check-ins for this event, 100 per page. Corrections are audited with mandatory reasons.</p>

        {!attendanceList.length ? (
          <p>No check-in records yet for this event.</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">Student</th>
                  <th scope="col">Registration number</th>
                  <th scope="col">Status</th>
                  <th scope="col">Time</th>
                  <th scope="col">Checked by</th>
                  <th scope="col">Correction</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {attendanceList.map((item) => (
                  <tr key={item.attendance_id}>
                    <td>{people[item.user_id]?.full_name ?? "Profile unavailable"}</td>
                    <td>{people[item.user_id]?.roll_number ?? "—"}</td>
                    <td>
                      <span className={`event-status ${item.checked_in ? "status-published" : "status-closed"}`}>
                        {item.checked_in ? "Checked in" : "Revoked"}
                      </span>
                    </td>
                    <td>{new Date(item.checked_at).toLocaleTimeString()}</td>
                    <td>Admin</td>
                    <td>
                      {item.correction_reason ? (
                        <span>
                          {item.correction_reason}{" "}
                          <small>({item.corrected_at ? new Date(item.corrected_at).toLocaleTimeString() : ""})</small>
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setCorrectingId(item.attendance_id);
                          setCorrectStatus(!item.checked_in);
                          setCorrectReason("");
                          setCorrectError("");
                        }}
                      >
                        {item.checked_in ? "Mark absent" : "Mark present"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {(page > 0 || attendanceList.length === 100) && <div className="workflow-actions">
        <Button variant="outline" disabled={loading || page === 0} onClick={() => setPage((value) => value - 1)}>Previous records</Button>
        <span>Page {page + 1}</span>
        <Button variant="outline" disabled={loading || attendanceList.length < 100} onClick={() => setPage((value) => value + 1)}>Next records</Button>
      </div>}

      {/* Correction Modal / Form */}
      {correctingId && (
        <div className="workflow-panel">
          <h3>Correct attendance record</h3>
          <p>
            Changing status to: <strong>{correctStatus ? "Present (Checked in)" : "Absent (Revoked)"}</strong>
          </p>
          <form className="workflow-form" onSubmit={(e) => void handleCorrection(e)}>
            <label>
              Audit reason (required, 3–500 characters)
              <textarea
                required
                minLength={3}
                maxLength={500}
                rows={3}
                placeholder="Explain the reason for this manual correction..."
                value={correctReason}
                onChange={(e) => setCorrectReason(e.target.value)}
              />
            </label>
            <div className="workflow-actions">
              <Button type="submit" disabled={correctBusy || correctReason.trim().length < 3}>
                {correctBusy ? "Saving…" : "Confirm correction"}
              </Button>
              <Button
                variant="outline"
                type="button"
                disabled={correctBusy}
                onClick={() => setCorrectingId(null)}
              >
                Cancel
              </Button>
            </div>
            {correctError && <p role="alert">{correctError}</p>}
          </form>
        </div>
      )}
    </section>
  );
}
