import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";

export function readEmailConfig(env) {
  const url = env.MAIN_SUPABASE_URL;
  if (!url || !/^https:\/\/[^/]+\.supabase\.co\/?$/.test(url)) throw new Error("Set MAIN_SUPABASE_URL to the MAIN project HTTPS URL.");
  if (!env.MAIN_SUPABASE_SERVICE_ROLE_KEY) throw new Error("Set MAIN_SUPABASE_SERVICE_ROLE_KEY in the worker environment only.");
  const user = env.GMAIL_USER?.trim().toLowerCase();
  if (user !== "officialtechspaceclub@gmail.com") throw new Error("GMAIL_USER must be the authorized club Gmail account.");
  const pass = env.GMAIL_APP_PASSWORD?.replaceAll(/\s/g, "");
  if (!pass || !/^[a-zA-Z0-9]{16}$/.test(pass)) throw new Error("Set a 16-character Gmail app password; never use the account password.");
  return { url, key: env.MAIN_SUPABASE_SERVICE_ROLE_KEY, user, pass };
}

// Log only stable categories, never SMTP response strings (which contain PII).
export function classifySendError(error) {
  const response = String(error?.response ?? "");
  if (/5\.4\.5|daily.*(?:limit|quota)|sending.*(?:limit|quota)/i.test(response)) return { outcome: "quota", code: "GMAIL_QUOTA" };
  if (error?.code === "EAUTH") return { outcome: "auth", code: "GMAIL_AUTH" };
  const responseCode = Number(error?.responseCode);
  // A negative SMTP reply is definite: the message was not accepted.
  if (responseCode >= 400 && responseCode < 500) return { outcome: "retry", code: "SMTP_TEMPORARY_REJECTION" };
  if (responseCode >= 500 && responseCode < 600) return { outcome: "failed", code: "SMTP_PERMANENT_REJECTION" };
  // Failures before the message submission stage are safe to retry.
  if (error?.code === "EDNS" || ["CONN", "EHLO", "STARTTLS", "AUTH", "MAIL FROM", "RCPT TO"].includes(error?.command)) {
    return { outcome: "retry", code: "SMTP_CONNECTION_FAILURE" };
  }
  return { outcome: "unknown", code: "SMTP_ACCEPTANCE_UNCERTAIN" };
}

export async function runEmailBatch({ rpc, transport, sender, pause = delay, stopping = () => false }) {
  const token = randomUUID();
  if (!await rpc("email_worker_batch", { p_token: token })) return { processed: 0, busy: true };
  let processed = 0;
  try {
    for (let index = 0; index < 10 && !stopping(); index++) {
      const jobs = await rpc("email_worker_claim", { p_token: token });
      const job = jobs?.[0];
      if (!job) break;
      let outcome;
      try {
        const info = await transport.sendMail({
          from: { name: "TechSpace Club", address: sender },
          to: { address: job.recipient }, // Exactly one recipient. No CC/BCC.
          subject: job.subject,
          text: job.body,
          messageId: `<launchpad-${job.id}@gmail.com>`,
          disableFileAccess: true,
          disableUrlAccess: true,
          signal: AbortSignal.timeout(60000),
        });
        outcome = info.accepted?.length === 1
          ? { outcome: "accepted", code: null }
          : { outcome: "failed", code: "RECIPIENT_REJECTED" };
      } catch (error) { outcome = classifySendError(error); }
      // Keep acknowledgement failures outside the SMTP catch. If this fails,
      // stop; the lease later becomes unknown rather than resending blindly.
      await rpc("email_worker_finish", { p_token: token, p_job_id: job.id, p_outcome: outcome.outcome, p_error: outcome.code });
      processed++;
      if (["quota", "auth"].includes(outcome.outcome)) break;
      if (index < 9 && !stopping()) await pause(1000);
    }
    return { processed, busy: false };
  } finally { await rpc("email_worker_release", { p_token: token }); }
}

export async function main(args = process.argv.slice(2), env = process.env) {
  if (args.length !== 1 || !["--once", "--loop", "--verify"].includes(args[0])) throw new Error("Choose --verify, --once or --loop.");
  const config = readEmailConfig(env);
  const client = createClient(config.url, config.key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15000) }) },
  });
  const transport = nodemailer.createTransport({
    service: "gmail", auth: { user: config.user, pass: config.pass },
    connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000,
    logger: false, debug: false,
  });
  const rpc = async (name, values) => {
    const { data, error } = await client.rpc(name, values);
    if (error) throw new Error("Email queue request failed; check MAIN migrations and worker credentials.");
    return data;
  };
  let stop = false;
  const onStop = () => { stop = true; };
  process.once("SIGINT", onStop);
  process.once("SIGTERM", onStop);
  try {
    await transport.verify();
    if (args[0] === "--verify") { console.log("Gmail SMTP authentication succeeded. No email sent."); return; }
    do {
      const result = await runEmailBatch({ rpc, transport, sender: config.user, stopping: () => stop });
      console.log(`Email batch: ${result.processed} processed${result.busy ? "; waiting for queue or provider cooldown" : ""}.`);
      if (args[0] !== "--loop" || stop) break;
      // Short sleeps allow graceful shutdown without claiming more jobs.
      for (let i = 0; i < 12 && !stop; i++) await delay(5000);
    } while (!stop);
  } finally {
    transport.close();
    process.removeListener("SIGINT", onStop);
    process.removeListener("SIGTERM", onStop);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    console.error("Email worker stopped. Check configuration, Gmail access and database connectivity. SMTP responses and credentials withheld.");
    process.exitCode = 1;
  });
}
