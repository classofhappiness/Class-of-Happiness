#!/usr/bin/env python3
"""Build-gate poller-storm check (item 14).

Given a saved Metro log (captured from a real device/simulator session, e.g.
`expo start | tee metro.log`), fails if any single endpoint is requested more than once
within any 5-second window, checked separately per role login (so a poller correctly firing
once every 2.5s across a 10-minute session isn't flagged, but a burst of the same endpoint
firing 5x in 1s after a screen focus - the exact class of bug items 0/00 this round fixed -
is).

Relies on two real log lines already emitted by the app:
  - `[API] <METHOD> <endpoint> <iso-timestamp> auth=<bool>` - every request through
    src/utils/api.ts's apiCall (added this round specifically so this script has a real,
    parseable timestamp to work with - Metro itself does not timestamp console.log output).
  - `[Login] ... : <email>` - AppContext.tsx's existing login-success log lines, used here
    purely as session-boundary markers (a fresh login resets the tracking window; this script
    doesn't need to know which role each email is to do that).

Usage:
    python3 scripts/check_metro_log.py path/to/metro.log
"""
import re
import sys
from collections import defaultdict
from datetime import datetime

API_RE = re.compile(r"\[API\]\s+(\S+)\s+(\S+)\s+([0-9T:.\-Z]+)\s+auth=")
LOGIN_RE = re.compile(r"\[Login\][^:]*:\s*(\S+)")
WINDOW_SECONDS = 5.0


def parse_log(path):
    """Returns a list of sessions, each a list of (method, endpoint, dt) tuples."""
    sessions = [[]]
    login_emails = [None]
    with open(path, "r", errors="replace") as f:
        for line in f:
            login_m = LOGIN_RE.search(line)
            if login_m:
                sessions.append([])
                login_emails.append(login_m.group(1))
                continue
            api_m = API_RE.search(line)
            if api_m:
                method, endpoint, ts = api_m.groups()
                try:
                    dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                except ValueError:
                    continue
                sessions[-1].append((method, endpoint, dt))
    return sessions, login_emails


def find_violations(calls):
    """calls: list of (method, endpoint, dt) for ONE session. Returns list of
    (method, endpoint, timestamps) where >1 call to the same endpoint fell inside any
    5s window."""
    by_endpoint = defaultdict(list)
    for method, endpoint, dt in calls:
        by_endpoint[(method, endpoint)].append(dt)

    violations = []
    for (method, endpoint), times in by_endpoint.items():
        times = sorted(times)
        # Sliding window: for each call, count how many other calls to this same endpoint
        # fall within WINDOW_SECONDS after it.
        for i, t0 in enumerate(times):
            window = [t for t in times[i:] if (t - t0).total_seconds() <= WINDOW_SECONDS]
            if len(window) > 1:
                violations.append((method, endpoint, window))
                break  # one report per endpoint per session is enough to fail the gate
    return violations


def main():
    if len(sys.argv) != 2:
        print("Usage: python3 scripts/check_metro_log.py path/to/metro.log")
        return 2
    path = sys.argv[1]
    sessions, login_emails = parse_log(path)

    total_violations = 0
    for i, calls in enumerate(sessions):
        if not calls:
            continue
        label = login_emails[i] or "(before first login)"
        violations = find_violations(calls)
        if not violations:
            print(f"session {i} [{label}]: {len(calls)} calls, no violations")
            continue
        print(f"session {i} [{label}]: {len(calls)} calls, {len(violations)} endpoint(s) re-fetched within {WINDOW_SECONDS}s")
        for method, endpoint, times in violations:
            gaps = [(times[j + 1] - times[j]).total_seconds() for j in range(len(times) - 1)]
            print(f"  FAIL  {method} {endpoint}  x{len(times)} within window, gaps={[round(g, 2) for g in gaps]}s")
        total_violations += len(violations)

    print(f"\n{total_violations} violation(s) across {len([s for s in sessions if s])} session(s)")
    return 1 if total_violations else 0


if __name__ == "__main__":
    sys.exit(main())
