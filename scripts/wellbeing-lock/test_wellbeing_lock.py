#!/usr/bin/env python3
"""Wellbeing-lock tests (parent "My Wellbeing" + teacher check-in), build 22.

Runs the REAL endpoint code, extracted verbatim out of backend/server.py by AST, against an
in-memory stand-in for Supabase. Nothing here is a re-implementation: change a function body
in server.py and this script runs the changed text, or fails loudly if the function is gone.

That is deliberate rather than ideal. Driving the live endpoints instead would need the
wellbeing_locks migration applied and a reachable backend, and would write to the production
database. What this DOES cover is every branch that decides whether someone gets in: hashing,
the one-word rule, the 5-tries/15-minute lockout, which proof each reset path accepts, scope
ownership, and that no PIN or hint answer ever reaches a log. What it does NOT cover is the
HTTP/auth plumbing around them (FastAPI routing, get_current_user, real Supabase semantics)
or any of the on-device UI - those still need a real pass on a real build.

    python3 scripts/wellbeing-lock/test_wellbeing_lock.py

Needs fastapi importable (for HTTPException). No network, no database, no credentials. The
test identities are the TEST accounts only - jono@gmail.com (parent), jono+teacher@gmail.com
(teacher) - and are local fakes: this script never reaches a real account.
"""
import os

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SERVER_PY = os.path.join(REPO_ROOT, 'backend', 'server.py')

import ast, asyncio, io, json, re as _re, sys, types, logging
from datetime import datetime, timezone, timedelta
from fastapi import HTTPException

SRC = open(SERVER_PY).read()
tree = ast.parse(SRC)

WANT_FUNCS = {
    'hash_password', 'verify_password',
    '_wellbeing_normalise_answer', '_wellbeing_answer_is_one_word',
    '_wellbeing_scope_owner_ok', '_wellbeing_lock_get', '_wellbeing_locked_seconds',
    '_wellbeing_guard_lockout', '_wellbeing_register_failure', '_wellbeing_clear_failures',
    '_wellbeing_require_scope',
    'get_wellbeing_lock', 'set_wellbeing_lock', 'add_wellbeing_lock_hint',
    'verify_wellbeing_lock', 'reset_wellbeing_lock', 'migrate_wellbeing_lock',
}
WANT_ASSIGN = {'WELLBEING_HINT_PROMPTS', 'WELLBEING_PIN_PATTERN', 'WELLBEING_MAX_ATTEMPTS',
               'WELLBEING_LOCKOUT_MINUTES'}

picked, seen = [], set()
for node in tree.body:
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name in WANT_FUNCS:
        node.decorator_list = []          # drop @api_router.* so these are plain callables
        picked.append(node); seen.add(node.name)
    elif isinstance(node, ast.Assign):
        for tgt in node.targets:
            if isinstance(tgt, ast.Name) and tgt.id in WANT_ASSIGN:
                picked.append(node); seen.add(tgt.id)

missing = (WANT_FUNCS | WANT_ASSIGN) - seen
assert not missing, f"not found in server.py: {missing}"
print(f"extracted {len(picked)} real definitions from server.py; none missing")

# ---- stubs -----------------------------------------------------------------
class Table:
    def __init__(self, store, name): self.store, self.name, self.filters, self._payload, self._op = store, name, {}, None, None
    def select(self, *a, **k): self._op = 'select'; return self
    def insert(self, payload): self._op, self._payload = 'insert', payload; return self
    def update(self, payload): self._op, self._payload = 'update', payload; return self
    def eq(self, col, val): self.filters[col] = val; return self
    def execute(self):
        if self.name not in self.store: raise RuntimeError(f'relation "{self.name}" does not exist')
        rows = self.store[self.name]
        if self._op == 'insert':
            rows.append(dict(self._payload)); return types.SimpleNamespace(data=[dict(self._payload)])
        match = [r for r in rows if all(r.get(c) == v for c, v in self.filters.items())]
        if self._op == 'update':
            for r in match: r.update(self._payload)
            return types.SimpleNamespace(data=match)
        return types.SimpleNamespace(data=[dict(r) for r in match])

class Supa:
    def __init__(self): self.store = {'family_members': [], 'wellbeing_locks': []}
    def table(self, name): return Table(self.store, name)

supabase = Supa()
CURRENT_USER = {}
async def get_current_user(request): return CURRENT_USER or None

ns = {
    're': _re, 'datetime': datetime, 'timezone': timezone, 'timedelta': timedelta,
    'HTTPException': HTTPException, 'logger': logging.getLogger('harness'),
    'supabase': supabase, 'get_current_user': get_current_user,
    'hashlib': __import__('hashlib'), 'secrets': __import__('secrets'),
    'Request': object, 'Optional': None,
}
exec(compile(ast.Module(body=picked, type_ignores=[]), '<server.py-extract>', 'exec'), ns)


PASS, FAIL = [], []

def check(name, cond, detail=''):
    (PASS if cond else FAIL).append(name)
    print(f"  {'PASS' if cond else 'FAIL'}  {name}" + (f"   [{detail}]" if detail and not cond else ''))

class Req:
    def __init__(self, body=None): self._b = body or {}
    async def json(self): return self._b

_UNSET = object()
_CURRENT = {'user': None}

def call(fn, scope, body=None, user=_UNSET):
    """Returns (result, None) or (None, HTTPException). user=None means "no session";
    omitting it reuses whoever was set last."""
    if user is not _UNSET:
        _CURRENT['user'] = user
    ns['get_current_user'] = lambda request: _ret(_CURRENT['user'])
    try:
        return (asyncio.run(ns[fn](scope, Req(body))), None)
    except HTTPException as e:
        return (None, e)

async def _ret(u): return u or None

# ---- TEST accounts ---------------------------------------------------------
PARENT = {"user_id": "u-parent-test", "email": "jono@gmail.com", "role": "parent",
          "portal_password": ns['hash_password']("ParentTestPw1")}
TEACHER = {"user_id": "u-teacher-test", "email": "jono+teacher@gmail.com", "role": "teacher",
           "portal_password": ns['hash_password']("TeacherTestPw1")}
OAUTH_ONLY = {"user_id": "u-oauth-test", "email": "jono+oauth@gmail.com", "role": "parent"}

supabase.store['family_members'] = [
    {"id": "fm-self-parent", "user_id": "u-parent-test"},
    {"id": "fm-someone-else", "user_id": "u-other-account"},
]
PSCOPE = "family:fm-self-parent"

print("\n=== 0. Migration not run yet (table absent) ===")
saved = supabase.store.pop('wellbeing_locks')
r, e = call('get_wellbeing_lock', PSCOPE, user=PARENT)
check("GET degrades to storage=unavailable, does not 500", e is None and r['storage'] == 'unavailable', repr(e))
check("...and reports no lock rather than locking the screen", e is None and r['configured'] is False)
r, e = call('set_wellbeing_lock', PSCOPE, {"pin": "1234", "hint_prompt": "pet", "hint_answer": "Rex"}, user=PARENT)
check("SET returns 503 wellbeing_storage_unavailable", e is not None and e.status_code == 503 and e.detail == 'wellbeing_storage_unavailable', repr(e))
supabase.store['wellbeing_locks'] = saved

print("\n=== 1. PARENT (jono@gmail.com) - first-time setup, item 1 ===")
r, e = call('get_wellbeing_lock', PSCOPE, user=PARENT)
check("fresh lock: configured=False", e is None and r['configured'] is False)
r, e = call('set_wellbeing_lock', PSCOPE, {"pin": "123", "hint_prompt": "pet", "hint_answer": "Rex"}, user=PARENT)
check("3-digit PIN rejected", e is not None and e.detail == 'wellbeing_pin_format')
r, e = call('set_wellbeing_lock', PSCOPE, {"pin": "1234", "hint_prompt": "mothers_maiden_name", "hint_answer": "Rex"}, user=PARENT)
check("prompt outside the three rejected", e is not None and e.detail == 'wellbeing_hint_prompt_invalid')
r, e = call('set_wellbeing_lock', PSCOPE, {"pin": "1234", "hint_prompt": "pet", "hint_answer": "Rex the dog"}, user=PARENT)
check("multi-word answer rejected (ONE word)", e is not None and e.detail == 'wellbeing_hint_answer_invalid')
r, e = call('set_wellbeing_lock', PSCOPE, {"pin": "1234", "hint_prompt": "pet", "hint_answer": "  Rex "}, user=PARENT)
check("set with prompt 'pet' + answer '  Rex ' accepted", e is None and r['status'] == 'ok', repr(e))

row = supabase.store['wellbeing_locks'][0]
check("PIN not stored in plain text", row['pin_hash'] != '1234' and '1234' not in row['pin_hash'])
check("answer not stored in plain text (trimmed/lowercased or otherwise)",
      all(x not in json.dumps(row).lower() for x in ['"rex"', ':rex', 'rex,']) and 'rex' not in row['hint_hash'])
check("answer hash is salted (salt:hash shape, same as admin_pin_hash)", row['hint_hash'].count(':') == 1)
check("two identical answers would not share a hash (random salt)",
      ns['hash_password']('rex') != ns['hash_password']('rex'))

print("\n=== 2. What the client can see (item 1: prompt only, never the answer) ===")
r, e = call('get_wellbeing_lock', PSCOPE, user=PARENT)
payload = json.dumps(r).lower()
check("configured=True, hint_prompt='pet' returned", r['hint_prompt'] == 'pet' and r['configured'] is True)
check("needs_hint=False (a hint exists)", r['needs_hint'] is False)
check("response carries NO hash of any kind", 'hash' not in payload)
check("response carries NO answer", 'rex' not in payload)

print("\n=== 3. Unlock + wrong-PIN throttling ===")
r, e = call('verify_wellbeing_lock', PSCOPE, {"pin": "9999"}, user=PARENT)
check("wrong PIN -> 401 with tries remaining", e is not None and e.status_code == 401 and e.detail == 'wellbeing_wrong_pin|4', repr(e))
r, e = call('verify_wellbeing_lock', PSCOPE, {"pin": "1234"}, user=PARENT)
check("correct PIN unlocks", e is None and r['status'] == 'ok', repr(e))
check("a successful unlock clears the failure count", supabase.store['wellbeing_locks'][0]['failed_attempts'] == 0)

print("\n=== 4. Forgotten PIN: wrong answers, 5 tries then 15 minutes (item 2) ===")
details = []
for i in range(5):
    r, e = call('reset_wellbeing_lock', PSCOPE, {"new_pin": "4321", "hint_answer": "wrong"}, user=PARENT)
    details.append(e.detail if e else 'NO-ERROR')
check("tries 1-4 report 3,2,1,0 remaining", details[:4] == ['wellbeing_wrong_answer|4', 'wellbeing_wrong_answer|3', 'wellbeing_wrong_answer|2', 'wellbeing_wrong_answer|1'], str(details))
check("5th wrong answer is the last one", details[4] == 'wellbeing_wrong_answer|0', str(details))
r, e = call('reset_wellbeing_lock', PSCOPE, {"new_pin": "4321", "hint_answer": "Rex"}, user=PARENT)
check("6th attempt locked out with 429 even though the answer is CORRECT",
      e is not None and e.status_code == 429 and e.detail.startswith('wellbeing_locked|'), repr(e))
secs = int(e.detail.split('|')[1])
check(f"lockout is ~15 minutes (got {secs}s)", 14 * 60 <= secs <= 15 * 60)
r, e = call('verify_wellbeing_lock', PSCOPE, {"pin": "1234"}, user=PARENT)
check("the lockout also blocks plain PIN entry (shared counter)", e is not None and e.status_code == 429)

print("\n=== 5. After the lockout expires: real reset (items 2 + 4) ===")
supabase.store['wellbeing_locks'][0]['locked_until'] = (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()
r, e = call('reset_wellbeing_lock', PSCOPE, {"new_pin": "4321", "hint_answer": "REX"}, user=PARENT)
check("answer matches case-insensitively ('REX' for 'Rex')", e is None and r['status'] == 'ok', repr(e))
r, e = call('verify_wellbeing_lock', PSCOPE, {"pin": "4321"}, user=PARENT)
check("new PIN works", e is None, repr(e))
r, e = call('verify_wellbeing_lock', PSCOPE, {"pin": "1234"}, user=PARENT)
check("old PIN no longer works", e is not None and e.status_code == 401)
r, e = call('reset_wellbeing_lock', PSCOPE, {"new_pin": "5555", "account_password": "ParentTestPw1"}, user=PARENT)
check("account password NOT accepted as a reset proof once a hint exists (item 4)",
      e is not None and e.status_code == 401 and e.detail.startswith('wellbeing_wrong_answer'), repr(e))

print("\n=== 6. Changing a PIN you know (no reset) ===")
supabase.store['wellbeing_locks'][0].update({'failed_attempts': 0, 'locked_until': None})
r, e = call('set_wellbeing_lock', PSCOPE, {"pin": "1111", "hint_prompt": "place", "hint_answer": "Lisbon"}, user=PARENT)
check("changing the PIN without the current one is refused", e is not None and e.status_code == 401, repr(e))
supabase.store['wellbeing_locks'][0].update({'failed_attempts': 0, 'locked_until': None})
r, e = call('set_wellbeing_lock', PSCOPE, {"pin": "1111", "current_pin": "4321", "hint_prompt": "place", "hint_answer": "Lisbon"}, user=PARENT)
check("changing it WITH the current PIN works, new prompt stored", e is None and r['hint_prompt'] == 'place', repr(e))

print("\n=== 7. Scope ownership ===")
r, e = call('get_wellbeing_lock', "family:fm-someone-else", user=PARENT)
check("another account's family member -> 404, not someone else's lock", e is not None and e.status_code == 404, repr(e))
r, e = call('get_wellbeing_lock', "family:", user=PARENT)
check("empty member id -> 404", e is not None and e.status_code == 404)
r, e = call('get_wellbeing_lock', "nonsense", user=PARENT)
check("unknown scope -> 404", e is not None and e.status_code == 404)
r, e = call('get_wellbeing_lock', PSCOPE, user=None)
check("no session -> 401", e is not None and e.status_code == 401, repr(e))

print("\n=== 8. TEACHER (jono+teacher@gmail.com) - legacy lock, no hint (item 3) ===")
supabase.store['wellbeing_locks'].append({
    "user_id": "u-teacher-test", "scope": "teacher",
    "pin_hash": ns['hash_password']("7777"),   # the PIN they already use
    "hint_prompt": None, "hint_hash": None,    # ...and no hint, because none existed before
    "failed_attempts": 0, "locked_until": None,
})
r, e = call('get_wellbeing_lock', "teacher", user=TEACHER)
check("legacy lock reports needs_hint=True", e is None and r['needs_hint'] is True, repr(e))
check("...and can_use_account_password=True (this account has one)", r['can_use_account_password'] is True)
r, e = call('reset_wellbeing_lock', "teacher", {"new_pin": "8888", "hint_answer": "anything"}, user=TEACHER)
check("hint reset is closed while no hint exists (falls to account password)",
      e is not None and e.detail.startswith('wellbeing_wrong_account_password'), repr(e))
r, e = call('reset_wellbeing_lock', "teacher", {"new_pin": "8888", "account_password": "WrongPw"}, user=TEACHER)
check("wrong account password -> 401 and counts a try", e is not None and e.detail == 'wellbeing_wrong_account_password|3', repr(e))
r, e = call('reset_wellbeing_lock', "teacher", {"new_pin": "8888", "account_password": "TeacherTestPw1",
                                                "hint_prompt": "hobby", "hint_answer_new": "Running"}, user=TEACHER)
check("correct account password resets the PIN (item 3 bridge)", e is None and r['status'] == 'ok', repr(e))
check("...and the account is no longer hintless", r['hint_prompt'] == 'hobby')
r, e = call('verify_wellbeing_lock', "teacher", {"pin": "8888"}, user=TEACHER)
check("new teacher PIN works", e is None, repr(e))
r, e = call('get_wellbeing_lock', "teacher", user=TEACHER)
check("needs_hint now False", r['needs_hint'] is False)

print("\n=== 9. add-hint after unlocking with the PIN they know (item 3's prompt) ===")
supabase.store['wellbeing_locks'].append({
    "user_id": "u-oauth-test", "scope": "teacher", "pin_hash": ns['hash_password']("2468"),
    "hint_prompt": None, "hint_hash": None, "failed_attempts": 0, "locked_until": None,
})
r, e = call('verify_wellbeing_lock', "teacher", {"pin": "2468"}, user=OAUTH_ONLY)
check("unlock reports needs_hint so the app can prompt right there", e is None and r['needs_hint'] is True, repr(e))
r, e = call('add_wellbeing_lock_hint', "teacher", {"current_pin": "0000", "hint_prompt": "pet", "hint_answer": "Bella"}, user=OAUTH_ONLY)
check("add-hint with the WRONG current PIN refused", e is not None and e.status_code == 401, repr(e))
r, e = call('add_wellbeing_lock_hint', "teacher", {"current_pin": "2468", "hint_prompt": "pet", "hint_answer": "Bella"}, user=OAUTH_ONLY)
check("add-hint with the correct current PIN accepted", e is None and r['hint_prompt'] == 'pet', repr(e))

print("\n=== 10. OAuth-only account with no hint AND no account password ===")
supabase.store['wellbeing_locks'] = [r for r in supabase.store['wellbeing_locks'] if r['user_id'] != 'u-oauth-test']
supabase.store['wellbeing_locks'].append({
    "user_id": "u-oauth-test", "scope": "teacher", "pin_hash": ns['hash_password']("2468"),
    "hint_prompt": None, "hint_hash": None, "failed_attempts": 0, "locked_until": None,
})
r, e = call('get_wellbeing_lock', "teacher", user=OAUTH_ONLY)
check("can_use_account_password=False (Google sign-in, no portal password)", r['can_use_account_password'] is False)
r, e = call('reset_wellbeing_lock', "teacher", {"new_pin": "1357", "account_password": "whatever"}, user=OAUTH_ONLY)
check("reset refused with 409 wellbeing_needs_account_password, not a free reset",
      e is not None and e.status_code == 409 and e.detail == 'wellbeing_needs_account_password', repr(e))

print("\n=== 11. Nothing logs the answer (item 5) ===")
buf = io.StringIO()
h = logging.StreamHandler(buf); logging.getLogger('harness').addHandler(h)
logging.getLogger('harness').setLevel(logging.DEBUG)
supabase.store['wellbeing_locks'][0].update({'failed_attempts': 0, 'locked_until': None})
for _ in range(6):
    call('reset_wellbeing_lock', PSCOPE, {"new_pin": "4321", "hint_answer": "SecretWord"}, user=PARENT)
call('verify_wellbeing_lock', PSCOPE, {"pin": "0001"}, user=PARENT)
logs = buf.getvalue()
check("'SecretWord' never reaches the log", 'secretword' not in logs.lower(), logs[:200])
check("no PIN value in the log", '0001' not in logs, logs[:200])

print("\n=== 12. Migrating a pre-build-22 device-local PIN (item 3, first half) ===")
supabase.store['wellbeing_locks'] = [r for r in supabase.store['wellbeing_locks'] if r['user_id'] != 'u-oauth-test']
r, e = call('migrate_wellbeing_lock', "teacher", {"pin": "246"}, user=OAUTH_ONLY)
check("migrate rejects a non-4-digit PIN", e is not None and e.detail == 'wellbeing_pin_format', repr(e))
r, e = call('migrate_wellbeing_lock', "teacher", {"pin": "2468"}, user=OAUTH_ONLY)
check("migrate creates a hintless server lock", e is None and r['status'] == 'ok' and r['needs_hint'] is True, repr(e))
row = [x for x in supabase.store['wellbeing_locks'] if x['user_id'] == 'u-oauth-test'][0]
check("...storing a HASH, not the PIN", row['pin_hash'] != '2468' and '2468' not in row['pin_hash'])
check("...and no hint yet", row['hint_hash'] is None)
r, e = call('verify_wellbeing_lock', "teacher", {"pin": "2468"}, user=OAUTH_ONLY)
check("the migrated PIN unlocks against the server", e is None, repr(e))
check("...and still reports needs_hint so the app can prompt", r['needs_hint'] is True)

print("\n=== 13. migrate never overwrites an existing lock ===")
row['hint_prompt'] = 'pet'; row['hint_hash'] = ns['hash_password']('bella')
r, e = call('migrate_wellbeing_lock', "teacher", {"pin": "0000"}, user=OAUTH_ONLY)
check("second migrate is a no-op, not an overwrite", e is None and r['status'] == 'already_migrated', repr(e))
row = [x for x in supabase.store['wellbeing_locks'] if x['user_id'] == 'u-oauth-test'][0]
check("...the real PIN still works (not replaced by '0000')", ns['verify_password']('2468', row['pin_hash']))
check("...and the hint it had was not dropped", row['hint_hash'] is not None)

print("\n=== 14. Declining the hint leaves a working lock, not a dead end ===")
# The app's "Not Now" path: the lock is already on the server, no hint, and the account
# password bridge is what reset uses until a hint is added.
supabase.store['wellbeing_locks'] = [x for x in supabase.store['wellbeing_locks'] if x['user_id'] != 'u-teacher-test']
r, e = call('migrate_wellbeing_lock', "teacher", {"pin": "7777"}, user=TEACHER)
check("migrate, then decline the hint", e is None, repr(e))
r, e = call('verify_wellbeing_lock', "teacher", {"pin": "7777"}, user=TEACHER)
check("the PIN still unlocks afterwards (no loop, no lockout)", e is None, repr(e))
r, e = call('get_wellbeing_lock', "teacher", user=TEACHER)
check("reset falls back to the account password", r['needs_hint'] is True and r['can_use_account_password'] is True)
r, e = call('reset_wellbeing_lock', "teacher", {"new_pin": "6666", "account_password": "TeacherTestPw1"}, user=TEACHER)
check("...and that reset genuinely works", e is None, repr(e))

print(f"\n{'='*64}\n{len(PASS)} passed, {len(FAIL)} failed")
if FAIL:
    print("FAILED: " + "; ".join(FAIL)); sys.exit(1)
