"""One creature per emotion colour (per submitting account) applies to the free tier only.

Offline: a tiny fake Supabase stands in for creature_submissions and the school-coverage lookups are stubbed, so no
network and no data is touched. Run from backend/:  python3 -m pytest tests/test_creature_colour_limit.py
"""
import inspect
import os
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import pytest
import server as S

NOW = datetime.now(timezone.utc)


class _Q:
    def __init__(self, rows):
        self.rows, self.f = rows, {}

    def select(self, *_a, **_k): return self
    def eq(self, k, v): self.f[k] = ("eq", v); return self
    def in_(self, k, vs): self.f[k] = ("in", list(vs)); return self

    def execute(self):
        def ok(r):
            for k, (op, v) in self.f.items():
                if op == "eq" and r.get(k) != v: return False
                if op == "in" and r.get(k) not in v: return False
            return True
        return type("R", (), {"data": [r for r in self.rows if ok(r)]})()


class _FakeSupabase:
    def __init__(self, rows): self.rows = rows
    def table(self, name):
        assert name == "creature_submissions"
        return _Q(self.rows)


@pytest.fixture
def world(monkeypatch):
    rows = []
    monkeypatch.setattr(S, "supabase", _FakeSupabase(rows))
    monkeypatch.setattr(S, "_teacher_is_school_covered", lambda u: False)
    monkeypatch.setattr(S, "_parent_is_school_covered", lambda u: False)
    monkeypatch.setattr(S, "FULL_ACCESS_EMAILS", frozenset(S._DEFAULT_FULL_ACCESS_EMAILS))
    return rows


def user(uid, role, email, status="none", **extra):
    return {"user_id": uid, "role": role, "email": email, "subscription_status": status, **extra}


def submit(rows, u, colour, status="pending"):
    """What the endpoint does: the limit check, then (if it passes) the new row."""
    if S._creature_colour_limit_hit(u, colour):
        return False
    rows.append({"student_id": u["user_id"], "emotion_colour": colour, "status": status})
    return True


def test_free_teacher_blocked_on_second_creature_of_a_colour(world):
    t = user("u_ft", "teacher", "free.teacher@example.com")
    assert submit(world, t, "blue") is True
    assert submit(world, t, "blue") is False             # same colour again: blocked
    assert submit(world, t, "green") is True             # another colour is still fine


def test_approved_counts_too_but_rejected_does_not(world):
    t = user("u_ft", "teacher", "free.teacher@example.com")
    world.append({"student_id": "u_ft", "emotion_colour": "red", "status": "rejected"})
    assert submit(world, t, "red", status="approved") is True
    assert submit(world, t, "red") is False


def test_free_parent_blocked_on_second_creature_of_a_colour(world):
    p = user("u_fp", "parent", "free.parent@example.com")
    assert submit(world, p, "yellow") is True
    assert submit(world, p, "yellow") is False


def test_subscribed_teacher_allowed(world):
    t = user("u_pt", "teacher", "paid.teacher@example.com", status="active",
             subscription_plan="teacher", subscription_expires_at=(NOW + timedelta(days=200)).isoformat())
    assert submit(world, t, "blue") is True
    assert submit(world, t, "blue") is True
    assert submit(world, t, "blue") is True


def test_trial_teacher_allowed_but_expired_trial_blocked(world):
    live = user("u_tt", "teacher", "trial.teacher@example.com", status="trial",
                trial_started_at=(NOW - timedelta(days=2)).isoformat())
    assert submit(world, live, "blue") is True and submit(world, live, "blue") is True
    lapsed = user("u_et", "teacher", "lapsed.teacher@example.com", status="trial",
                  trial_started_at=(NOW - timedelta(days=400)).isoformat())
    assert submit(world, lapsed, "green") is True and submit(world, lapsed, "green") is False


def test_full_access_accounts_allowed_even_on_status_none(world):
    for i, em in enumerate(("jono@classofhappiness.com", "jono@gmail.com", "jono+teacher@gmail.com",
                            "schooladmindemo@classofhappiness.com", "pembrokeadmin@classofhappiness.com")):
        role = "school_admin" if "admin" in em else ("teacher" if "teacher" in em else "parent")
        u = user(f"u_fa{i}", role, em)                       # no plan at all
        assert submit(world, u, "blue") is True and submit(world, u, "blue") is True, em


def test_exempt_list_is_the_one_editable_list(world, monkeypatch):
    monkeypatch.setattr(S, "FULL_ACCESS_EMAILS", frozenset({"newtester@example.com"}))
    n = user("u_n1", "teacher", "newtester@example.com")
    assert submit(world, n, "blue") is True                  # exempt via the list
    j = user("u_j", "parent", "jono@gmail.com")              # no longer on the list -> free tier again
    assert submit(world, j, "blue") is True and submit(world, j, "blue") is False


def test_school_covered_teacher_allowed(world, monkeypatch):
    monkeypatch.setattr(S, "_teacher_is_school_covered", lambda u: True)
    t = user("u_st", "teacher", "covered.teacher@example.com")
    assert submit(world, t, "blue") is True and submit(world, t, "blue") is True


def test_limit_is_per_account(world):
    a, b = user("u_a", "teacher", "a@example.com"), user("u_b", "teacher", "b@example.com")
    assert submit(world, a, "blue") is True
    assert submit(world, b, "blue") is True                  # a different account is unaffected


def test_endpoint_uses_the_helper_and_keeps_the_free_cap_and_moderation(world):
    src = inspect.getsource(S.submit_creature)
    assert "_creature_colour_limit_hit(user, emotion)" in src
    assert 'eq("emotion_colour"' not in src                 # the raw per-colour query no longer lives in the endpoint
    assert "total_submitted >= 2" in src                     # the free 2-submission cap is untouched
    assert "_run_ai_moderation" in src and "requested_scope" in src and "_schedule_creature_normalisation" in src
