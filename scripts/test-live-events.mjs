import { execFile } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { parseEnv, promisify } from "node:util";

const run = promisify(execFile);
const root = resolve(import.meta.dirname, "..");
const env = parseEnv(await readFile(join(root, "apps/student/.env.local"), "utf8"));
const projectRef = (await readFile(join(root, "supabase/main/supabase/.temp/project-ref"), "utf8")).trim();
if (projectRef !== "amagfwugfinplxhkauig" || new URL(env.VITE_MAIN_SUPABASE_URL).hostname !== `${projectRef}.supabase.co`) {
  throw new Error("Live tests require the explicitly linked Launchpad MAIN project and matching browser configuration.");
}

// A unique namespace and explicit IDs limit cleanup to this run's fixtures.
const runId = randomUUID().replaceAll("-", "");
const password = randomBytes(32).toString("hex");
const accounts = Object.fromEntries(["admin", "student", "other", "unverified"].map((role) => [role, {
  id: randomUUID(), email: `launchpad-test-${role}-${runId}@example.test`, password,
}]));
const fixture = { accounts, eventTitle: `Launchpad integration ${runId}`, eventId: randomUUID() };
await mkdir(join(root, ".supabase"), { recursive: true });
const directory = await mkdtemp(join(root, ".supabase", "live-test-"));
async function query(sql, label) {
  const file = join(directory, `${label}.sql`);
  await writeFile(file, sql, { mode: 0o600 });
  try {
    await run("supabase", ["db", "query", "--linked", "--workdir", "supabase/main", "--file", file], { cwd: root, maxBuffer: 1024 * 1024 });
  } catch {
    // Query failures can echo SQL. Keep fixture passwords and JWTs out of logs.
    throw new Error(`${label} failed; credentials and SQL output withheld.`);
  } finally {
    await rm(file, { force: true });
  }
}

let failed = false;
try {
  await query(`begin;
${Object.entries(accounts).map(([role, account], index) => `
insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new)
values ('00000000-0000-0000-0000-000000000000','${account.id}','authenticated','authenticated','${account.email}',extensions.crypt('${password}',extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now(),'','','','');
insert into auth.identities (id,user_id,provider_id,identity_data,provider,created_at,updated_at)
values ('${randomUUID()}','${account.id}','${account.id}','{"sub":"${account.id}","email":"${account.email}","email_verified":true}','email',now(),now());
insert into public.profiles(user_id,full_name,roll_number,department,academic_year,verification_status)
values ('${account.id}','Integration ${role}','TEST${runId.toUpperCase()}${index}','Computer Science',2,'${role === "unverified" ? "unverified" : "verified"}');`).join("\n")}
insert into public.admin_users(user_id,active) values ('${accounts.admin.id}',true);
commit;`, "seed");
  console.log("Temporary live test accounts created. Running real browser and API workflows.");
  const childEnv = { ...process.env, ...env, LAUNCHPAD_LIVE_FIXTURE: JSON.stringify(fixture) };
  try {
    const result = await run(process.execPath, [join(root, "node_modules/@playwright/test/cli.js"), "test", "--config", "playwright.live.config.ts"], {
      cwd: root, env: childEnv, maxBuffer: 4 * 1024 * 1024,
    });
    console.log(result.stdout.replaceAll(password, "[redacted]"));
  } catch (error) {
    console.error(String(error.stdout ?? "Live browser tests failed.").replaceAll(password, "[redacted]"));
    failed = true;
  }
} finally {
  try {
    // Events created through the UI retain the fixture admin as created_by.
    await query(`begin;
delete from public.registrations where user_id in (${Object.values(accounts).map(({ id }) => `'${id}'`).join(",")});
delete from public.audit_logs where entity_id in (select id from public.events where created_by='${accounts.admin.id}');
delete from public.events where created_by='${accounts.admin.id}';
delete from public.admin_users where user_id='${accounts.admin.id}';
delete from public.profiles where user_id in (${Object.values(accounts).map(({ id }) => `'${id}'`).join(",")});
delete from public.audit_logs where actor_id in (${Object.values(accounts).map(({ id }) => `'${id}'`).join(",")}) or entity_id in (${Object.values(accounts).map(({ id }) => `'${id}'`).join(",")});
delete from auth.users where id in (${Object.values(accounts).map(({ id }) => `'${id}'`).join(",")});
commit;`, "cleanup");
    console.log("Temporary live test accounts and event data removed.");
  } catch (error) {
    console.error(error.message);
    console.error(`Cleanup required for test namespace ${runId}; no unrelated records are targeted.`);
    failed = true;
  }
  if (directory.startsWith(join(root, ".supabase", "live-test-"))) {
    await rm(directory, { recursive: true, force: true });
  } else {
    console.error("Unexpected cleanup directory; removal skipped.");
    failed = true;
  }
}
if (failed) process.exitCode = 1;
