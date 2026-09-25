#!/usr/bin/env python3
"""Build-gate smoke test (item 14).

Logs in as one account per role (teacher/parent/school_admin/superadmin), hits every GET
endpoint that role's real app/portal screens actually call, and asserts each responds 200 in
under 500ms. Exits non-zero if anything fails, so this is safe to wire into a build/CI gate.

"Logging in" here mints a real session_token row directly via the Supabase service-role
client rather than driving the interactive email/password/PIN/OTP flow - school_admin and
superadmin require a second factor (PIN or an emailed one-time code) that a non-interactive
script has no way to satisfy, and teacher/parent's own real login is itself just "get a
session for this account" underneath. This exercises the exact same session_token auth path
every real request uses (see backend/server.py's _get_current_user_sync) without needing a
live inbox - just a direct, honest way to get a token for each account.

Credentials (which real account to test as, per role) come from env:
    SMOKE_TEACHER_EMAIL, SMOKE_PARENT_EMAIL, SMOKE_SCHOOL_ADMIN_EMAIL, SMOKE_SUPERADMIN_EMAIL
Also required: SUPABASE_URL, SUPABASE_SERVICE_KEY (to resolve the email -> user_id and mint/
clean up the session), and optionally BACKEND_URL (defaults to the production API).

Usage:
    SMOKE_TEACHER_EMAIL=... SMOKE_PARENT_EMAIL=... SMOKE_SCHOOL_ADMIN_EMAIL=... \\
    SMOKE_SUPERADMIN_EMAIL=... python3 scripts/smoke.py
"""
import os
import sys
import time
import uuid
from datetime import datetime, timedelta, timezone

import requests
from dotenv import load_dotenv
from supabase import create_client

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(ROOT, "backend", ".env"))

BACKEND_URL = os.environ.get("BACKEND_URL", "https://class-of-happiness-production.up.railway.app")
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY")
TIMEOUT_MS = 500

# Real, representative GET endpoints each role's actual app/portal screens call today
# (confirmed live against backend/server.py while building this) - not literally every GET
# endpoint in the file (300+), which would make this too slow and too brittle to run before
# every build; this is the "is the app's real hot path healthy" gate, not full API coverage.
ROLE_ENDPOINTS = {
    "teacher": [
        "/api/auth/me",
        "/api/teacher-checkins?days=7",
        "/api/admin/teacher-strategies?strategy_type=teacher",
        "/api/support-requests",
        "/api/features",
    ],
    "parent": [
        "/api/auth/me",
        "/api/parent/children",
        "/api/family/members",
        "/api/parent/available-students",
        "/api/resources",
    ],
    "school_admin": [
        "/api/auth/me",
        "/api/school-admin/analytics",
        "/api/schools/my-school",
        "/api/school/invite-code",
        "/api/school-admin/wellbeing-support-requests",
        "/api/school-admin/school-strategies?strategy_type=student",
        "/api/school-admin/teacher-wellbeing",
    ],
    "superadmin": [
        "/api/auth/me",
        "/api/admin/school-profiles",
        "/api/admin/users?limit=200",
        "/api/admin/school-codes",
        "/api/admin/wellbeing-alerts",
        "/api/admin/school-features",
    ],
}

ROLE_EMAIL_ENV = {
    "teacher": "SMOKE_TEACHER_EMAIL",
    "parent": "SMOKE_PARENT_EMAIL",
    "school_admin": "SMOKE_SCHOOL_ADMIN_EMAIL",
    "superadmin": "SMOKE_SUPERADMIN_EMAIL",
}


def mint_session(sb, user_id: str) -> str:
    token = uuid.uuid4().hex + uuid.uuid4().hex
    sb.table("user_sessions").insert({
        "session_token": token,
        "user_id": user_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat(),
    }).execute()
    return token


def main() -> int:
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        print("FATAL: SUPABASE_URL / SUPABASE_SERVICE_KEY not set (needed to mint test sessions).")
        return 2

    sb = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    missing_env = [env for env in ROLE_EMAIL_ENV.values() if not os.environ.get(env)]
    if missing_env:
        print(f"FATAL: missing env vars: {', '.join(missing_env)}")
        return 2

    rows = []
    minted_tokens = []
    overall_ok = True

    for role, email_env in ROLE_EMAIL_ENV.items():
        email = os.environ[email_env]
        user_r = sb.table("users").select("user_id,role").eq("email", email).execute()
        if not user_r.data:
            print(f"FATAL: no user found for {role} ({email_env}={email})")
            return 2
        user_row = user_r.data[0]
        if user_row.get("role") != role:
            print(f"WARNING: {email} has role={user_row.get('role')!r}, expected {role!r} - testing anyway")

        token = mint_session(sb, user_row["user_id"])
        minted_tokens.append(token)
        headers = {"Authorization": f"Bearer {token}"}

        for path in ROLE_ENDPOINTS[role]:
            url = f"{BACKEND_URL}{path}"
            start = time.monotonic()
            try:
                resp = requests.get(url, headers=headers, timeout=10)
                status = resp.status_code
            except requests.RequestException as e:
                status = None
                resp = None
            duration_ms = (time.monotonic() - start) * 1000
            ok = status == 200 and duration_ms < TIMEOUT_MS
            overall_ok = overall_ok and ok
            rows.append((role, path, status, duration_ms, ok))

    # Cleanup - never leave smoke-test sessions lying around in a shared DB.
    for token in minted_tokens:
        try:
            sb.table("user_sessions").delete().eq("session_token", token).execute()
        except Exception:
            pass

    # Print table.
    print(f"{'ROLE':<13} {'ENDPOINT':<58} {'STATUS':<7} {'MS':<8} RESULT")
    print("-" * 100)
    for role, path, status, duration_ms, ok in rows:
        status_str = str(status) if status is not None else "ERR"
        print(f"{role:<13} {path:<58} {status_str:<7} {duration_ms:<8.1f} {'PASS' if ok else 'FAIL'}")

    passed = sum(1 for r in rows if r[4])
    print("-" * 100)
    print(f"{passed}/{len(rows)} passed (200 + <{TIMEOUT_MS}ms)")

    return 0 if overall_ok else 1


if __name__ == "__main__":
    sys.exit(main())
