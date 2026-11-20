import { execFile } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { parseEnv, promisify } from "node:util";

const run = promisify(execFile);
const root = resolve(import.meta.dirname, "..");
const env = parseEnv(await readFile(join(root, "apps/student/.env.local"), "utf8"));
const adminEnv = parseEnv(await readFile(join(root, "apps/admin/.env.local"), "utf8"));
const projectRef = (await readFile(join(root, "supabase/main/supabase/.temp/project-ref"), "utf8")).trim();
if (projectRef !== "amagfwugfinplxhkauig" || [env, adminEnv].some((value) =>
  new URL(value.NEXT_PUBLIC_MAIN_SUPABASE_URL).hostname !== `${projectRef}.supabase.co`)) {
  throw new Error("Tests require explicitly linked Launchpad MAIN and matching app configurations.");
}
const runId = randomUUID().replaceAll("-", "");
const password = randomBytes(32).toString("hex");
const account = (role) => ({ id: randomUUID(), email: `launchpad-materials-${role}-${runId}@example.test`, password });
const accounts = { admin: account("admin"), student: account("student"), revoked: account("revoked") };
const participants = Array.from({ length: 105 }, (_, index) => ({
  ...(index === 0 ? accounts.student : account(`participant-${index}`)),
  fullName: index === 0 ? '=SUM(1,2)' : index === 1 ? 'தமிழ், "Unicode"\nSecond line' : `Synthetic participant ${String(index).padStart(3, "0")}`,
  roll: `ME${runId.toUpperCase()}${String(index).padStart(3, "0")}`,
  department: index % 2 === 0 ? "Computer Science" : "Electronics", year: index % 3 + 1,
}));
const events = Object.fromEntries(["visible", "draft", "other"].map((kind) => [kind, {
  id: randomUUID(), title: `Materials/export ${kind} ${runId}`,
}]));
const fixture = { accounts, events, participants: participants.map(({ id, fullName, roll, department, year }) => ({ id, fullName, roll, department, year })) };
const q = (value) => `'${String(value).replaceAll("'", "''")}'`;
const userIds = [...Object.values(accounts), ...participants.slice(1)].map(({ id }) => q(id)).join(",");
const eventIds = Object.values(events).map(({ id }) => q(id)).join(",");
await mkdir(join(root, ".supabase"), { recursive: true });
const directory = await mkdtemp(join(root, ".supabase", "materials-export-"));
// This recovery manifest contains identifiers only, never passwords or tokens.
await writeFile(join(directory, "recovery.json"), JSON.stringify({
  projectRef, runId, userIds: [...Object.values(accounts), ...participants.slice(1)].map(({ id }) => id),
  eventIds: Object.values(events).map(({ id }) => id), fixtureAdminId: accounts.admin.id,
}, null, 2), { mode: 0o600 });
function diagnostic(error) {
  // Classify CLI output internally. Never echo raw SQL, passwords or connection strings.
  const output = `${error.stderr ?? ""}\n${error.stdout ?? ""}`;
  const connection = /failed to connect|connection.*(?:reset|refused|closed)|timeout|timed out|too many connections|SASL|circuit breaker|password authentication failed|tenant or user not found|failed to read response/i.test(output);
  const sqlstate = output.match(/SQLSTATE[\s:]+([A-Z0-9]{5})/i)?.[1];
  const constraint = output.match(/constraint "([a-zA-Z0-9_]+)"/)?.[1];
  return { category: connection ? "connection" : sqlstate ? "sql" : "cli", sqlstate, constraint };
}
async function query(sql, label) {
  const file = join(directory, `${label}.sql`);
  await writeFile(file, sql, { mode: 0o600 });
  let succeeded = false;
  try {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        await run("supabase", ["db", "query", "--linked", "--workdir", "supabase/main", "--file", file], { cwd: root, maxBuffer: 1024 * 1024 });
        succeeded = true;
        return;
      } catch (error) {
        const safe = diagnostic(error);
        if (label === "cleanup") {
          await writeFile(join(directory, "cleanup-error.json"), JSON.stringify({ ...safe, attempt, recordedAt: new Date().toISOString() }), { mode: 0o600 });
        }
        // Seed is never retried: a lost response after commit must not duplicate it.
        if (label === "cleanup" && safe.category === "connection" && attempt < 3) {
          console.error(`Cleanup connection attempt ${attempt} failed; retrying only this run's fixture cleanup.`);
          await new Promise((resolve) => setTimeout(resolve, attempt * 5000));
          continue;
        }
        throw new Error(`${label} failed (${safe.category}${safe.sqlstate ? ` SQLSTATE ${safe.sqlstate}` : ""}${safe.constraint ? ` constraint ${safe.constraint}` : ""}); credentials and raw output withheld.`);
      }
    }
  } finally {
    // Seed SQL holds passwords and is always removed. Failed cleanup SQL has no
    // credentials and stays beside its identifiers for a narrow recovery.
    if (label !== "cleanup" || succeeded) await rm(file, { force: true });
  }
}
let failed = false;
let cleanupSucceeded = false;
try {
  await query(`begin;
do $$ begin
  if to_regclass('public.event_materials') is null or to_regprocedure('public.admin_event_participant_export(uuid,text,integer,text,boolean)') is null then
    raise exception 'Apply materials/export migrations before running';
  end if;
end $$;
${[accounts.admin, accounts.revoked, ...participants].map((entry, index) => `
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new)
values('00000000-0000-0000-0000-000000000000',${q(entry.id)},'authenticated','authenticated',${q(entry.email)},extensions.crypt(${q(password)},extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now(),'','','','');
insert into auth.identities(id,user_id,provider_id,identity_data,provider,created_at,updated_at)
values(${q(randomUUID())},${q(entry.id)},${q(entry.id)},${q(JSON.stringify({ sub: entry.id, email: entry.email, email_verified: true }))},'email',now(),now());
insert into public.profiles(user_id,full_name,roll_number,department,academic_year,course,branch,section,mobile_number)
values(${q(entry.id)},${q(entry.fullName ?? "Synthetic admin")},${q(entry.roll ?? `ME${runId.toUpperCase()}A${index}`)},${q(entry.department ?? "Computer Science")},${entry.year ?? 2},'B.Tech','CSE','A','9876543210');`).join("\n")}
insert into public.admin_users(user_id,active) values(${q(accounts.admin.id)},true),(${q(accounts.revoked.id)},true);
${Object.entries(events).map(([kind, event]) => `insert into public.events(id,title,description,venue,starts_at,ends_at,registration_opens_at,registration_closes_at,capacity,status,created_by)
values(${q(event.id)},${q(event.title)},'Temporary integration fixture','Synthetic lab',now()+interval '48 hours',now()+interval '50 hours',now()-interval '2 hours',now()+interval '24 hours',200,${q(kind === "draft" ? "draft" : "published")},${q(accounts.admin.id)});`).join("\n")}
insert into public.registrations(event_id,user_id) values ${participants.map(({ id }) => `(${q(events.visible.id)},${q(id)})`).join(",")},(${q(events.other.id)},${q(accounts.student.id)});
commit;`, "seed");
  console.log("Synthetic fixtures created; using existing development servers.");
  try {
    const result = await run(process.execPath, [join(root, "node_modules/@playwright/test/cli.js"), "test", "--config", "playwright.materials-export.config.ts"], {
      cwd: root, env: { ...process.env, ...env, LAUNCHPAD_MATERIALS_EXPORT_FIXTURE: JSON.stringify(fixture) }, maxBuffer: 4 * 1024 * 1024,
    });
    console.log(result.stdout.replaceAll(password, "[redacted]"));
  } catch (error) {
    console.error(String(error.stdout ?? "Materials/export browser tests failed.").replaceAll(password, "[redacted]"));
    failed = true;
  }
} finally {
  try {
    await query(`begin;
delete from public.audit_logs where actor_id in (${userIds}) or entity_id in (${eventIds}) or entity_id in (select id from public.event_materials where event_id in (${eventIds}));
delete from public.event_materials where event_id in (${eventIds});
do $$ begin
  if to_regclass('public.attendance') is not null then
    execute 'delete from public.attendance where event_id in (${eventIds.replaceAll("'", "''")}) and user_id in (${userIds.replaceAll("'", "''")})';
  end if;
  if to_regclass('public.qr_credentials') is not null then
    execute 'delete from public.qr_credentials where event_id in (${eventIds.replaceAll("'", "''")})';
  end if;
end $$;
delete from public.registrations where event_id in (${eventIds}) and user_id in (${userIds});
delete from public.events where id in (${eventIds}) and created_by=${q(accounts.admin.id)};
delete from public.admin_email_access where user_id in (${userIds});
delete from public.admin_users where user_id in (${userIds});
delete from public.profiles where user_id in (${userIds});
delete from public.audit_logs where actor_id in (${userIds}) or entity_id in (${userIds},${eventIds});
delete from auth.users where id in (${userIds});
do $$ begin
  if exists(select 1 from auth.users where id in (${userIds}))
    or exists(select 1 from public.profiles where user_id in (${userIds}))
    or exists(select 1 from public.admin_users where user_id in (${userIds}))
    or exists(select 1 from public.admin_email_access where user_id in (${userIds}))
    or exists(select 1 from public.events where id in (${eventIds}))
    or exists(select 1 from public.event_materials where event_id in (${eventIds}))
    or exists(select 1 from public.registrations where event_id in (${eventIds}) or user_id in (${userIds}))
    or exists(select 1 from public.audit_logs where actor_id in (${userIds}) or entity_id in (${userIds},${eventIds})) then
    raise exception 'FIXTURE_CLEANUP_INCOMPLETE';
  end if;
end $$;
commit;`, "cleanup");
    cleanupSucceeded = true;
    console.log("Synthetic fixtures and audit records removed.");
  } catch (error) {
    console.error(error.message);
    console.error(`Cleanup required for namespace ${runId}; recovery identifiers and credential-free SQL retained at ${directory}. Unrelated records are never targeted.`);
    failed = true;
  }
  if (cleanupSucceeded) {
    if (directory.startsWith(join(root, ".supabase", "materials-export-"))) await rm(directory, { recursive: true, force: true });
    else { console.error("Unexpected cleanup directory; removal skipped."); failed = true; }
  }
}
if (failed) process.exitCode = 1;
