"""Run real parallel database transactions against MAIN; remove only our fixtures.

Usage from repository root:
  python supabase/main/supabase/tests/concurrency.py

Requires an authenticated Supabase CLI with MAIN linked. This writes short-lived
synthetic records in the linked project, then cleans them in finally. Each worker
uses a real authenticated HTTP RPC request, not a mocked lock.
"""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Barrier
from datetime import datetime, timedelta, timezone
import json
import secrets
import shutil
import subprocess
import tempfile
import uuid
import urllib.request
import urllib.error


ROOT = Path(__file__).resolve().parents[4]
CLI = shutil.which("supabase")
if CLI is None:
    raise SystemExit("Supabase CLI is required.")
PROJECT = ROOT / "supabase/main/supabase/.temp/project-ref"
if PROJECT.read_text().strip() != "amagfwugfinplxhkauig":
    raise SystemExit("Refusing test: MAIN project link does not match.")


def query(sql):
    with tempfile.NamedTemporaryFile(mode="w", suffix=".sql", encoding="utf-8", delete=False) as file:
        file.write(sql)
        target = Path(file.name)
    try:
        result = subprocess.run(
            [CLI, "db", "query", "--linked", "--workdir", "supabase/main", "--file", str(target)],
            cwd=ROOT, capture_output=True, text=True, timeout=90,
        )
        if result.returncode:
            # Only these expected backend errors are surfaced. Arbitrary rows or
            # connection information are never printed by the harness.
            errors = [code for code in ["EVENT_FULL", "ALREADY_REGISTERED", "CAPACITY_BELOW_REGISTRATIONS"]
                      if code in result.stderr + result.stdout]
            if errors:
                return {"error": errors[0]}
            raise RuntimeError("Unexpected database command failure; no query data displayed.")
        data = json.loads(result.stdout)
        return {"rows": data.get("rows", data) if isinstance(data, dict) else data}
    finally:
        target.unlink(missing_ok=True)


env = {}
for line in (ROOT / 'apps/student/.env.local').read_text(encoding='utf-8-sig').splitlines():
    if '=' in line and not line.lstrip().startswith('#'):
        key, value = line.split('=', 1)
        env[key.strip()] = value.strip().strip('"').strip("'")
BASE = env['NEXT_PUBLIC_MAIN_SUPABASE_URL'].rstrip('/')
if BASE != 'https://amagfwugfinplxhkauig.supabase.co':
    raise SystemExit('Refusing test: browser URL does not match MAIN.')
PUBLIC_KEY = env['NEXT_PUBLIC_MAIN_SUPABASE_PUBLISHABLE_KEY']


def http(path, body, token=None):
    headers = {'apikey': PUBLIC_KEY, 'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    request = urllib.request.Request(BASE + path, data=json.dumps(body).encode(), headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            payload = response.read()
            return {'rows': json.loads(payload) if payload else None}
    except urllib.error.HTTPError as error:
        details = json.loads(error.read())
        message = details.get('message', '')
        for expected in ['EVENT_FULL', 'ALREADY_REGISTERED', 'CAPACITY_BELOW_REGISTRATIONS', 'ADMIN_REQUIRED']:
            if expected in message:
                return {'error': expected}
        raise RuntimeError('Unexpected authenticated HTTP request failure; response withheld.') from None


def parallel(statements):
    barrier = Barrier(len(statements))

    def worker(request):
        barrier.wait(timeout=30)
        path, body, token = request
        return http(path, body, token)

    with ThreadPoolExecutor(max_workers=len(statements)) as pool:
        return list(pool.map(worker, statements))


users = [str(uuid.uuid4()) for _ in range(6)]
admin = str(uuid.uuid4())
events = [str(uuid.uuid4()) for _ in range(3)]
all_users = users + [admin]
user_list = ",".join("'" + user + "'::uuid" for user in all_users)
event_list = ",".join("'" + event + "'::uuid" for event in events)
password = secrets.token_hex(32)
emails = {user: user + '@launchpad-test.invalid' for user in all_users}
try:
    setup = "begin; "
    for user in all_users:
        setup += ("insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,"
                  "raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new) "
                  f"values ('00000000-0000-0000-0000-000000000000','{user}','authenticated','authenticated','{emails[user]}',"
                  f"extensions.crypt('{password}',extensions.gen_salt('bf')),now(),"
                  "'{\"provider\":\"email\",\"providers\":[\"email\"]}','{}',now(),now(),'','','',''); "
                  "insert into auth.identities(user_id,provider_id,identity_data,provider,created_at,updated_at) "
                  f"values ('{user}','{user}','{{\"sub\":\"{user}\",\"email\":\"{emails[user]}\",\"email_verified\":true}}','email',now(),now()); ")
    for user in users:
        setup += (f"insert into public.profiles(user_id,full_name,roll_number,department,academic_year,verification_status,course,branch,section,mobile_number) "
                  f"values ('{user}','Concurrency test','{user.replace('-', '').upper()}','Test',1,'unverified','B.Tech','CSE','A','9876543210'); ")
    setup += f"insert into public.admin_users(user_id) values ('{admin}'); "
    for index, event in enumerate(events):
        capacity = [1, 10, 2][index]
        setup += ("insert into public.events(id,title,description,starts_at,ends_at,venue,registration_opens_at,"
                  f"registration_closes_at,capacity,status,created_by) values ('{event}','Concurrency fixture',"
                  "'Synthetic test event',now()+interval '2 days',now()+interval '3 days','Test',"
                  f"now()-interval '1 day',now()+interval '1 day',{capacity},'published','{admin}'); ")
    query(setup + "commit; select true as ready;")
    tokens = {user: http('/auth/v1/token?grant_type=password', {'email': emails[user], 'password': password})['rows']['access_token']
              for user in all_users}
    register = '/rest/v1/rpc/register_for_event'

    results = parallel([(register, {'p_event_id': events[0]}, tokens[user]) for user in users])
    assert sum("rows" in result for result in results) == 1, "Final seat accepted more than one registration"
    assert sum(result.get("error") == "EVENT_FULL" for result in results) == 5
    print("PASS: six concurrent final-seat requests -> one registration, five EVENT_FULL responses.", flush=True)

    results = parallel([(register, {'p_event_id': events[1]}, tokens[users[0]]) for _ in users])
    assert sum("rows" in result for result in results) == 1, "Concurrent duplicate request accepted"
    assert sum(result.get("error") == "ALREADY_REGISTERED" for result in results) == 5
    print("PASS: six concurrent same-student requests -> one registration, five ALREADY_REGISTERED responses.", flush=True)

    now = datetime.now(timezone.utc)
    edit = {'id': events[2], 'title': 'Concurrent capacity edit', 'description': 'Synthetic test event',
            'venue': 'Test', 'capacity': 1, 'status': 'published',
            'starts_at': (now + timedelta(days=2)).isoformat(), 'ends_at': (now + timedelta(days=3)).isoformat(),
            'registration_opens_at': (now - timedelta(days=1)).isoformat(),
            'registration_closes_at': (now + timedelta(days=1)).isoformat()}
    capacity_edit = ('/rest/v1/rpc/admin_save_event', {'p_event': edit}, tokens[admin])
    results = parallel([capacity_edit] + [(register, {'p_event_id': events[2]}, tokens[user]) for user in users])
    assert all("rows" in result or result.get("error") in {"EVENT_FULL", "CAPACITY_BELOW_REGISTRATIONS"} for result in results)
    final = query("select e.capacity,count(r.id)::integer as registrations from public.events e "
                  f"left join public.registrations r on r.event_id=e.id where e.id='{events[2]}' group by e.id;")["rows"][0]
    assert 0 < final["registrations"] <= final["capacity"], "Capacity edit raced past registration lock"
    print("PASS: admin capacity edit raced with six registrations; committed count stayed within committed capacity.", flush=True)

    # Both callers are admins before the race. The lock must recheck authority
    # after waiting, so the winner cannot be revoked by the now-revoked caller.
    assert 'rows' in http('/rest/v1/rpc/admin_set_access', {
        'p_email': emails[users[0]], 'p_active': True, 'p_reason': 'Synthetic concurrency peer',
    }, tokens[admin])
    results = parallel([
        ('/rest/v1/rpc/admin_set_access', {'p_email': emails[users[0]], 'p_active': False, 'p_reason': 'Synthetic revocation race'}, tokens[admin]),
        ('/rest/v1/rpc/admin_set_access', {'p_email': emails[admin], 'p_active': False, 'p_reason': 'Synthetic revocation race'}, tokens[users[0]]),
    ])
    assert sum('rows' in result for result in results) == 1
    assert sum(result.get('error') == 'ADMIN_REQUIRED' for result in results) == 1
    remaining = query(f"select count(*)::integer as active from public.admin_users where active and user_id in ('{admin}','{users[0]}');")['rows'][0]
    assert remaining['active'] == 1, 'Concurrent revocations removed all admins'
    print('PASS: simultaneous cross-admin revocations left one active admin; revoked caller was denied.', flush=True)
finally:
    query("begin; "
          f"delete from public.registrations where event_id in ({event_list}); "
          f"delete from public.events where id in ({event_list}); "
          f"delete from public.admin_email_access where user_id in ({user_list}); "
          f"delete from public.admin_users where user_id in ({user_list}); "
          f"delete from public.profiles where user_id in ({user_list}); "
          f"delete from public.audit_logs where actor_id in ({user_list}) or entity_id in ({user_list},{event_list}); "
          f"delete from auth.users where id in ({user_list}); "
          "commit; select true as cleaned;")
    print("Synthetic concurrency fixtures removed.")
