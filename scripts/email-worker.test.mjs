import { describe, expect, it, vi } from "vitest";
import nodemailer from "nodemailer";
import { classifySendError, readEmailConfig, runEmailBatch } from "./email-worker.mjs";

function setup({ count = 12, sendError, finishError, leased = true } = {}) {
  let sequence = 0;
  const rpc = vi.fn(async (name) => {
    if (name === "email_worker_batch") return leased;
    if (name === "email_worker_claim") return sequence < count ? [{ id: `job-${sequence++}`, recipient: "student@example.test", subject: "Hello Harsh", body: "Selected for TechSprint" }] : [];
    if (name === "email_worker_finish" && finishError) throw new Error("DB response lost");
    return null;
  });
  const transport = { sendMail: vi.fn(async () => { if (sendError) throw sendError; return { accepted: ["student@example.test"] }; }) };
  return { rpc, transport, sender: "officialtechspaceclub@gmail.com", pause: vi.fn(async () => {}) };
}

describe("email worker", () => {
  it("sends at most ten separate messages per batch, without CC/BCC", async () => {
    const options = setup();
    expect(await runEmailBatch(options)).toEqual({ processed: 10, busy: false });
    expect(options.transport.sendMail).toHaveBeenCalledTimes(10);
    for (const [mail] of options.transport.sendMail.mock.calls) {
      expect(mail.to).toEqual({ address: "student@example.test" });
      expect(mail.cc).toBeUndefined(); expect(mail.bcc).toBeUndefined();
      expect(mail.disableFileAccess).toBe(true); expect(mail.disableUrlAccess).toBe(true);
    }
  });
  it("does not implement a daily cap across batches", async () => {
    const options = setup({ count: 250 });
    for (let i = 0; i < 25; i++) await runEmailBatch(options);
    expect(options.transport.sendMail).toHaveBeenCalledTimes(250);
  });
  it("does not send while another worker holds the lease", async () => {
    const options = setup({ leased: false });
    expect((await runEmailBatch(options)).busy).toBe(true);
    expect(options.transport.sendMail).not.toHaveBeenCalled();
  });
  it("pauses after Gmail quota response and acknowledges the pause", async () => {
    const options = setup({ sendError: { responseCode: 550, response: "550 5.4.5 Daily user sending limit exceeded" } });
    await runEmailBatch(options);
    expect(options.transport.sendMail).toHaveBeenCalledTimes(1);
    expect(options.rpc).toHaveBeenCalledWith("email_worker_finish", expect.objectContaining({ p_outcome: "quota" }));
  });
  it("pauses on authentication failure", async () => {
    const options = setup({ sendError: { code: "EAUTH", responseCode: 535 } });
    await runEmailBatch(options);
    expect(options.transport.sendMail).toHaveBeenCalledTimes(1);
    expect(options.rpc).toHaveBeenCalledWith("email_worker_finish", expect.objectContaining({ p_outcome: "auth" }));
  });
  it("does not pause everyone for a recipient's full mailbox", () => {
    expect(classifySendError({ responseCode: 552, response: "552 5.2.2 Recipient quota exceeded" }).outcome).toBe("failed");
  });
  it("stops after a lost database acknowledgement, rather than resending", async () => {
    const options = setup({ finishError: true });
    await expect(runEmailBatch(options)).rejects.toThrow("DB response lost");
    expect(options.transport.sendMail).toHaveBeenCalledTimes(1);
    expect(options.rpc).toHaveBeenLastCalledWith("email_worker_release", expect.any(Object));
  });
  it.each([
    [{ responseCode: 421 }, "retry"], [{ responseCode: 550 }, "failed"],
    [{ code: "EDNS" }, "retry"], [{ code: "ETIMEDOUT", command: "CONN" }, "retry"],
    [{ code: "ETIMEDOUT", command: "DATA" }, "unknown"], [{ code: "ECONNRESET" }, "unknown"],
  ])("classifies safe retries versus uncertain acceptance: %j", (error, outcome) => {
    expect(classifySendError(error).outcome).toBe(outcome);
  });
  it("does not claim a job when shutting down", async () => {
    const options = setup();
    await runEmailBatch({ ...options, stopping: () => true });
    expect(options.transport.sendMail).not.toHaveBeenCalled();
  });
  it("creates a real plain-text MIME message without fetching template URLs", async () => {
    const mail = await nodemailer.createTransport({ streamTransport: true, buffer: true }).sendMail({
      from: "officialtechspaceclub@gmail.com", to: { address: "student@example.test" },
      subject: "Welcome Harsh", text: "Hello Harsh,\nYou are selected. <script> stays text.",
      disableFileAccess: true, disableUrlAccess: true,
    });
    expect(mail.message.toString()).toContain("Content-Type: text/plain");
    expect(mail.envelope.to).toEqual(["student@example.test"]);
  });
  it("requires server-only configuration and the approved sender", () => {
    expect(() => readEmailConfig({})).toThrow("MAIN_SUPABASE_URL");
    expect(() => readEmailConfig({ MAIN_SUPABASE_URL: "https://example.supabase.co", MAIN_SUPABASE_SERVICE_ROLE_KEY: "test", GMAIL_USER: "other@gmail.com" })).toThrow("authorized club");
    const config = readEmailConfig({ MAIN_SUPABASE_URL: "https://example.supabase.co", MAIN_SUPABASE_SERVICE_ROLE_KEY: "test", GMAIL_USER: "officialtechspaceclub@gmail.com", GMAIL_APP_PASSWORD: "abcd efgh ijkl mnop" });
    expect(config.pass).toBe("abcdefghijklmnop");
  });
});
