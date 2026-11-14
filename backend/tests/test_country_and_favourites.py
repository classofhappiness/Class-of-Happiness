"""Country at signup / one-time prompt / creature-submission country fix, and the Class favourites endpoints.
Offline (in-process fake Supabase). Run from backend/:  python3 -m pytest tests/test_country_and_favourites.py
"""
import asyncio
import os
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import pytest
from fastapi import HTTPException
import countries as C
import server as S


# ---------------------------------------------------------------- fake Supabase
class _Q:
    def __init__(self, db, name):
        self.cols = "*"
        self.db, self.name, self.eqs, self.ins, self.gte_, self.lt_, self.mode, self.payload, self.lim, self.order_ = db, name, {}, {}, {}, {}, "select", None, None, None
    def select(self, cols="*", **_k): self.cols = cols; return self
    def eq(self, k, v): self.eqs[k] = v; return self
    def in_(self, k, vs): self.ins[k] = set(vs); return self
    def gte(self, k, v): self.gte_[k] = v; return self
    def lt(self, k, v): self.lt_[k] = v; return self
    def order(self, k, **_k): self.order_ = k; return self
    def limit(self, n): self.lim = n; return self
    def range(self, a, b): return self
    def insert(self, d): self.mode, self.payload = "insert", d; return self
    def update(self, d): self.mode, self.payload = "update", d; return self
    def execute(self):
        if self.name in self.db.broken_cols and any(c in self.db.broken_cols[self.name] for c in ([*self.eqs] + list(self.payload or {}) + self.cols.split(","))):
            raise RuntimeError("column does not exist")
        rows = self.db.rows.setdefault(self.name, [])
        if self.mode == "insert":
            if self.db.fail_insert_cols & set(self.payload):
                raise RuntimeError("column does not exist")
            rows.append(dict(self.payload)); return type("R", (), {"data": [dict(self.payload)]})()
        hit = [r for r in rows if all(r.get(k) == v for k, v in self.eqs.items())
               and all(r.get(k) in vs for k, vs in self.ins.items())
               and all(str(r.get(k)) >= v for k, v in self.gte_.items())
               and all(str(r.get(k)) < v for k, v in self.lt_.items())]
        if self.mode == "update":
            for r in hit: r.update(self.payload)
        if self.order_: hit.sort(key=lambda r: str(r.get(self.order_)))
        if self.lim: hit = hit[:self.lim]
        return type("R", (), {"data": [dict(r) for r in hit]})()


class _DB:
    def __init__(self): self.rows, self.broken_cols, self.fail_insert_cols = {}, {}, set()
    def table(self, name): return _Q(self, name)


@pytest.fixture
def db(monkeypatch):
    d = _DB()
    monkeypatch.setattr(S, "supabase", d)
    monkeypatch.setattr(S, "_fetch_all_paginated", lambda table, fields, fn: fn(_Q(d, table)).execute().data)
    monkeypatch.setattr(S, "_auth_cache_evict_user", lambda uid: None)
    return d


class _Req:
    def __init__(self, body=None): self._b = body or {}
    async def json(self): return self._b


def as_user(monkeypatch, user):
    async def u(_r): return user
    monkeypatch.setattr(S, "get_current_user", u)


# ---------------------------------------------------------------- lookup
def test_lookup_names_codes_and_aliases():
    assert C.country_code_from_value("Australia") == "AU" and C.country_code_from_value(" portugal ") == "PT"
    assert C.country_code_from_value("pt") == "PT" and C.country_code_from_value("UK") == "GB"
    assert C.country_code_from_value("United States") == "US" and C.country_code_from_value("Czech Republic") == "CZ"
    for bad in (None, "", "XX", "none", "Narnia", "ZZ"):
        assert C.country_code_from_value(bad) is None
    assert len(C.ISO_COUNTRIES) == 195 and C.country_name("au") == "Australia"


def test_backend_list_matches_the_frontend_list():
    import re
    ts = open(os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "src", "constants", "countries.ts")).read()
    assert dict(re.findall(r"\{ code: '([A-Z]{2})', name: '([^']+)' \}", ts)) == C.ISO_COUNTRIES


# ---------------------------------------------------------------- the user's own country
def test_user_country_iso_precedence():
    assert S._user_country_iso({"country_code": "AU", "school_country": "Portugal"}) == "AU"
    assert S._user_country_iso({"school_country": "Australia"}) == "AU"
    assert S._user_country_iso({"country_code": "XX", "school_country": "Australia"}) is None      # chose "Prefer not to say"
    assert S._user_country_iso({"school_country": "Narnia"}) is None and S._user_country_iso({}) is None


def test_submission_country_order_and_pt_only_as_last_resort():
    assert S._submission_country("BR", {"country_code": "AU"}) == "BR"                 # explicit valid code from the app wins
    assert S._submission_country(None, {"country_code": "AU", "school_country": "Portugal"}) == "AU"
    assert S._submission_country(None, {"school_country": "Australia"}) == "AU"        # the bug: this used to be PT
    assert S._submission_country("Australia-ish junk", {"school_country": "Australia"}) == "AU"
    assert S._submission_country(None, {}) == "PT" and S._submission_country("", {"country_code": "XX"}) == "PT"


def test_submit_options_default_country_uses_the_user_country(monkeypatch):
    src = open(S.__file__).read()
    assert '"default_country": _user_country_iso(user) or "PT"' in src
    assert 'user.get("country")' not in src                                          # the nonexistent column is no longer read


def test_prompt_needed_matrix():
    need = S._country_prompt_needed
    assert need({"role": "parent"}) and need({"role": "teacher", "school_country": ""})
    assert not need({"role": "parent", "country_code": "PT"})
    assert not need({"role": "teacher", "school_country": "Australia"})               # already has one (old free text)
    assert not need({"role": "parent", "country_prompt_seen_at": "2026-11-12T00:00:00+00:00"})   # answered or dismissed once
    assert not need({"role": "parent", "country_code": "XX"})
    for role in ("school_admin", "superadmin", "admin", "student", None):
        assert not need({"role": role})


def test_public_user_exposes_the_flag_and_no_secrets():
    u = S._public_user({"user_id": "u", "role": "parent", "portal_password": "h"}, include_push_flag=False)
    assert u["country_prompt_needed"] is True and "portal_password" not in u
    assert S._public_user({"user_id": "u", "role": "parent", "country_code": "PT"}, include_push_flag=False)["country_prompt_needed"] is False


# ---------------------------------------------------------------- POST /auth/country
def test_set_country_saves_code_and_english_name(db, monkeypatch):
    db.rows["users"] = [{"user_id": "u1", "role": "parent"}]
    as_user(monkeypatch, db.rows["users"][0])
    out = asyncio.run(S.set_user_country(_Req({"country": "au"})))
    r = db.rows["users"][0]
    assert out["country_code"] == "AU" and r["country_code"] == "AU" and r["school_country"] == "Australia" and r["country_prompt_seen_at"]


def test_set_country_prefer_not_and_dismiss(db, monkeypatch):
    db.rows["users"] = [{"user_id": "u1", "role": "teacher"}]
    as_user(monkeypatch, db.rows["users"][0])
    asyncio.run(S.set_user_country(_Req({"country": "none"})))
    r = db.rows["users"][0]
    assert r["country_code"] == "XX" and r["country_prompt_seen_at"] and "school_country" not in r
    db.rows["users"] = [{"user_id": "u1", "role": "teacher"}]
    asyncio.run(S.set_user_country(_Req({"country": "dismiss"})))
    r = db.rows["users"][0]
    assert r["country_prompt_seen_at"] and "country_code" not in r


def test_set_country_rejects_unknown_and_never_touches_school_admin_name(db, monkeypatch):
    db.rows["users"] = [{"user_id": "u1", "role": "school_admin", "school_country": "Portugal"}]
    as_user(monkeypatch, db.rows["users"][0])
    with pytest.raises(HTTPException) as e:
        asyncio.run(S.set_user_country(_Req({"country": "Narnia"})))
    assert e.value.status_code == 400
    asyncio.run(S.set_user_country(_Req({"country": "AU"})))
    r = db.rows["users"][0]
    assert r["country_code"] == "AU" and r["school_country"] == "Portugal"


def test_set_country_requires_login(db, monkeypatch):
    as_user(monkeypatch, None)
    with pytest.raises(HTTPException) as e:
        asyncio.run(S.set_user_country(_Req({"country": "AU"})))
    assert e.value.status_code == 401


# ---------------------------------------------------------------- POST /auth/signup
def _signup(**extra):
    return asyncio.run(S.email_signup(_Req({"email": "a@b.co", "password": "longenough1", "name": "A", "role": "parent", **extra})))


@pytest.fixture
def signup_db(db, monkeypatch):
    monkeypatch.setattr(S, "_send_email_code", lambda *a, **k: (True, "ok"))
    return db


def test_signup_without_country_still_works_and_prompt_is_needed(signup_db):
    out = _signup()
    row = signup_db.rows["users"][0]
    assert "country_code" not in row and out["user"]["country_prompt_needed"] is True


def test_signup_with_country_stores_code_name_and_marks_prompt_done(signup_db):
    out = _signup(country="pt")
    row = signup_db.rows["users"][0]
    assert (row["country_code"], row["school_country"]) == ("PT", "Portugal") and row["country_prompt_seen_at"]
    assert out["user"]["country_prompt_needed"] is False


def test_signup_prefer_not_to_say_and_junk(signup_db):
    _signup(country="none")
    assert signup_db.rows["users"][0]["country_code"] == "XX" and "school_country" not in signup_db.rows["users"][0]
    signup_db.rows["users"].clear()
    _signup(country="Narnia")
    assert "country_code" not in signup_db.rows["users"][0]


def test_signup_survives_the_migration_not_being_applied(signup_db):
    signup_db.broken_cols["users"] = {"country_code"}
    out = _signup(country="AU")
    row = signup_db.rows["users"][0]
    assert "country_code" not in row and row["school_country"] == "Australia" and out["session_token"]


# ---------------------------------------------------------------- ranking (pure)
def ev(cid, n_students, per_student=1):
    return [(cid, f"{cid}-s{i}") for i in range(n_students) for _ in range(per_student)]


def test_ranking_needs_five_distinct_students_not_five_checkins():
    one_kid = [("a", "s1")] * 40                                                      # 40 check-ins by one child
    rows = S._rank_creature_favourites(one_kid + ev("b", 5) + ev("c", 6) + ev("d", 5), [])
    assert [r["creature_id"] for r in rows] == ["c", "b", "d"] or {r["creature_id"] for r in rows} == {"b", "c", "d"}
    assert "a" not in {r["creature_id"] for r in rows}


def test_ranking_orders_by_checkins_then_completions_then_id():
    ci = ev("a", 5, 3) + ev("b", 5, 3) + ev("c", 5, 3) + ev("d", 5, 2)
    done = [("b", "x1"), ("b", "x2"), ("c", "x3")]
    rows = S._rank_creature_favourites(ci, done)
    assert [r["creature_id"] for r in rows] == ["b", "c", "a", "d"]                   # same check-ins: more completions first, then id


def test_ranking_empty_under_three_and_capped_at_five():
    assert S._rank_creature_favourites(ev("a", 9) + ev("b", 9), []) == []
    seven = sum((ev(c, 5 + i) for i, c in enumerate("abcdefg")), [])
    rows = S._rank_creature_favourites(seven, [])
    assert len(rows) == 5 and rows[0]["creature_id"] == "g"
    assert len(S._rank_creature_favourites(ev("a", 9), [], min_creatures=1, limit=50)) == 1


# ---------------------------------------------------------------- data windows
NOW = datetime(2026, 12, 10, 12, tzinfo=timezone.utc)
def ts(days_ago): return (NOW - timedelta(days=days_ago)).isoformat()


def seed_windows(db):
    db.rows["students"] = [{"id": f"s{i}", "active_creatures": {"green": "leaf_friend"}} for i in range(6)]
    # first event 10 days ago: events cover days 10..0, feeling_logs cover days 30..10 only
    db.rows["engagement_events"] = (
        [{"event_type": "creature_checkin", "creature_id": "leaf_friend", "student_id": f"s{i}", "timestamp": ts(5)} for i in range(3)]
        + [{"event_type": "creature_checkin", "creature_id": "leaf_friend", "student_id": "s0", "timestamp": ts(10)}]
        + [{"event_type": "creature_complete", "creature_id": "leaf_friend", "student_id": "s1", "timestamp": ts(2)}])
    db.rows["feeling_logs"] = (
        [{"student_id": f"s{i}", "feeling_colour": "green", "timestamp": ts(20)} for i in range(6)]      # before events began: counted
        + [{"student_id": f"s{i}", "feeling_colour": "green", "timestamp": ts(5)} for i in range(6)]     # same days as events: NOT counted
        + [{"student_id": "s5", "feeling_colour": "green", "timestamp": ts(45)}])                         # outside the 30 days


def test_events_from_their_start_date_fallback_only_before_never_added(db):
    seed_windows(db)
    ci, done, start = S._fav_collect(NOW)
    assert start == ts(10)
    assert len(ci) == 4 + 6                                                        # 4 events + 6 pre-start logs; the 6 same-day logs are ignored
    assert sorted(s for _, s in ci).count("s0") == 3                               # 2 event rows + 1 fallback, no duplicate of the event day
    assert done == [("leaf_friend", "s1")]


def test_no_events_yet_uses_feeling_logs_for_the_whole_window(db):
    seed_windows(db); db.rows["engagement_events"] = []
    ci, _done, start = S._fav_collect(NOW)
    assert start is None and len(ci) == 12 and all(c == "leaf_friend" for c, _ in ci)   # 20 and 5 days ago, not the 45-day-old one


def test_fallback_uses_the_active_creature_for_that_colour_and_skips_unknowns(db):
    db.rows["students"] = [{"id": "a", "active_creatures": {"green": "sub-1"}}, {"id": "b", "active_creatures": {}}]
    db.rows["feeling_logs"] = [{"student_id": "a", "feeling_colour": "green", "timestamp": ts(3)},
                               {"student_id": "a", "feeling_colour": "blue", "timestamp": ts(3)},
                               {"student_id": "b", "feeling_colour": "green", "timestamp": ts(3)}]
    ci, _d, _s = S._fav_collect(NOW)
    assert ci == [("sub-1", "a")]


def test_unreadable_sources_just_mean_no_data(db):
    db.broken_cols["engagement_events"] = {"event_type"}
    ci, done, start = S._fav_collect(NOW)
    assert ci == [] and done == [] and start is None


# ---------------------------------------------------------------- endpoints
def rts(days_ago): return (datetime.now(timezone.utc) - timedelta(days=days_ago)).isoformat()


def make_ranked_db(db):
    db.rows["students"] = [{"id": f"s{i}", "active_creatures": {"green": "leaf_friend", "blue": "aqua_buddy", "red": "blaze_heart", "yellow": "sub-1"}} for i in range(6)]
    db.rows["feeling_logs"] = [{"student_id": f"s{i}", "feeling_colour": c, "timestamp": rts(3)} for i in range(6) for c in ("green", "blue", "red", "yellow")]
    db.rows["creature_submissions"] = [{"id": "sub-1", "creature_name": "Petal", "emotion_colour": "yellow",
                                         "stage1_url": "https://x.supabase.co/storage/v1/object/public/creature-images/creatures/a_stage1_abcd1234.png?v=4"}]


@pytest.fixture
def fresh_cache(monkeypatch):
    monkeypatch.setattr(S, "_fav_cache", {"at": None, "data": None})


def test_public_endpoint_returns_only_rank_id_name_picture(db, fresh_cache, monkeypatch):
    make_ranked_db(db); as_user(monkeypatch, {"user_id": "u", "role": "student"})
    out = asyncio.run(S.get_creature_favourites(_Req()))["favourites"]
    assert [r["rank"] for r in out] == [1, 2, 3, 4] and {r["creature_id"] for r in out} == {"leaf_friend", "aqua_buddy", "blaze_heart", "sub-1"}
    assert {k for r in out for k in r} == {"rank", "creature_id", "name", "colour", "thumb_url", "emoji", "is_default"}
    petal = next(r for r in out if r["creature_id"] == "sub-1")
    assert petal["name"] == "Petal" and petal["thumb_url"] and "_thumb" in petal["thumb_url"] and petal["is_default"] is False
    assert next(r for r in out if r["creature_id"] == "leaf_friend")["emoji"]
    assert "s0" not in str(out)                                                      # no student ids anywhere


def test_public_endpoint_empty_when_too_few_qualify(db, fresh_cache, monkeypatch):
    make_ranked_db(db); db.rows["feeling_logs"] = [l for l in db.rows["feeling_logs"] if l["feeling_colour"] in ("green", "blue")]
    as_user(monkeypatch, {"user_id": "u", "role": "student"})
    assert asyncio.run(S.get_creature_favourites(_Req())) == {"favourites": []}


def test_public_endpoint_is_cached_for_an_hour_and_failures_are_not(db, fresh_cache, monkeypatch):
    make_ranked_db(db); as_user(monkeypatch, {"user_id": "u", "role": "student"})
    calls = []
    real = S._compute_creature_favourites
    monkeypatch.setattr(S, "_compute_creature_favourites", lambda: (calls.append(1), real())[1])
    asyncio.run(S.get_creature_favourites(_Req())); asyncio.run(S.get_creature_favourites(_Req()))
    assert len(calls) == 1
    S._fav_cache["at"] -= S.FAV_CACHE_SECONDS + 1                                    # an hour later it recomputes
    asyncio.run(S.get_creature_favourites(_Req()))
    assert len(calls) == 2
    monkeypatch.setattr(S, "_fav_cache", {"at": None, "data": None})
    monkeypatch.setattr(S, "_compute_creature_favourites", lambda: 1 / 0)
    assert asyncio.run(S.get_creature_favourites(_Req())) == {"favourites": []} and S._fav_cache["data"] is None


def test_public_endpoint_requires_login(db, fresh_cache, monkeypatch):
    as_user(monkeypatch, None)
    with pytest.raises(HTTPException) as e:
        asyncio.run(S.get_creature_favourites(_Req()))
    assert e.value.status_code == 401


def test_admin_top_is_superadmin_only_and_has_counts(db, monkeypatch):
    make_ranked_db(db)
    for role in ("teacher", "school_admin", "parent"):
        as_user(monkeypatch, {"user_id": "u", "role": role})
        with pytest.raises(HTTPException) as e:
            asyncio.run(S.admin_top_creatures(_Req()))
        assert e.value.status_code == 403
    as_user(monkeypatch, {"user_id": "u", "role": "superadmin"})
    out = asyncio.run(S.admin_top_creatures(_Req()))
    assert out["window_days"] == 30 and out["public_list_visible"] is True and len(out["rows"]) == 4
    r = out["rows"][0]
    assert r["checkins"] == 6 and r["students"] == 6 and r["rank"] == 1 and "name" in r and "completed" in r
