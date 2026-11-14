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
               and all(r.get(k) is not None and str(r.get(k)) >= v for k, v in self.gte_.items())
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
def st(cid, n, prefix=None):
    return [(cid, f"{prefix or cid}-s{i}") for i in range(n)]


def test_ranking_needs_five_distinct_students_and_repeats_count_once():
    one_kid = [("a", "s1")] * 40                                                      # one child starting it 40 times
    rows = S._rank_creature_favourites(one_kid + st("b", 5) + st("c", 6) + st("d", 5) + st("e", 4), [])
    assert [r["creature_id"] for r in rows] == ["c", "b", "d"] and {r["creature_id"] for r in rows} == {"b", "c", "d"}
    assert all(r["students"] >= 5 for r in rows)


def test_starter_creatures_are_never_ranked():
    starters = sum((st(c, 30) for c in ("aqua_buddy", "leaf_friend", "spark_pal", "blaze_heart")), [])
    assert S._rank_creature_favourites(starters + st("x", 5) + st("y", 5), []) == []              # only 2 community creatures qualify
    rows = S._rank_creature_favourites(starters + st("x", 5) + st("y", 6) + st("z", 7), [])
    assert [r["creature_id"] for r in rows] == ["z", "y", "x"]


def test_ranking_orders_by_students_then_final_stage_then_id():
    starts = st("a", 6) + st("b", 6) + st("c", 6) + st("d", 8)
    done = [("b", "b-s0"), ("b", "b-s1"), ("c", "c-s0"), ("zzz", "q")]                  # completions of unknown creatures are ignored
    rows = S._rank_creature_favourites(starts, done)
    assert [r["creature_id"] for r in rows] == ["d", "b", "c", "a"]
    assert [r["completed"] for r in rows] == [0, 2, 1, 0]
    tie = S._rank_creature_favourites(st("m", 5) + st("k", 5) + st("p", 5), [])
    assert [r["creature_id"] for r in tie] == ["k", "m", "p"]                          # full tie: creature id


def test_ranking_empty_under_three_and_capped_at_five():
    assert S._rank_creature_favourites(st("a", 9) + st("b", 9), []) == []
    seven = sum((st(c, 5 + i) for i, c in enumerate("abcdefg")), [])
    rows = S._rank_creature_favourites(seven, [])
    assert len(rows) == 5 and rows[0]["creature_id"] == "g"
    assert len(S._rank_creature_favourites(st("a", 9), [], min_creatures=1, limit=50)) == 1


# ---------------------------------------------------------------- data (creature_unlocks)
NOW = datetime(2026, 12, 10, 12, tzinfo=timezone.utc)
def ts(days_ago): return (NOW - timedelta(days=days_ago)).isoformat()


def test_collect_uses_unlocks_in_the_last_30_days_by_real_student(db):
    db.rows["creature_unlocks"] = [
        {"creature_id": "c1", "real_student_id": "r1", "student_id": "owner", "unlocked_at": ts(3), "completed_at": None},
        {"creature_id": "c1", "real_student_id": "r1", "student_id": "owner", "unlocked_at": ts(2), "completed_at": ts(1)},   # same child again
        {"creature_id": "c1", "real_student_id": None, "student_id": "u9", "unlocked_at": ts(5), "completed_at": None},       # family member: falls back to the account
        {"creature_id": "c1", "real_student_id": "old", "student_id": "owner", "unlocked_at": ts(45), "completed_at": ts(40)}]  # outside the window
    starts, completions = S._fav_collect(NOW)
    assert sorted(s for _, s in starts) == ["r1", "r1", "u9"]
    assert completions == [("c1", "r1")]


def test_unreadable_unlocks_just_mean_no_data(db):
    db.broken_cols["creature_unlocks"] = {"unlocked_at"}
    assert S._fav_collect(NOW) == ([], [])


# ---------------------------------------------------------------- endpoints
def rts(days_ago): return (datetime.now(timezone.utc) - timedelta(days=days_ago)).isoformat()
IMG = "https://x.supabase.co/storage/v1/object/public/creature-images/creatures/%s_stage%d_abcd1234.png?v=4"


def make_ranked_db(db, creatures=("sub-1", "sub-2", "sub-3", "sub-4")):
    db.rows["creature_unlocks"] = [{"creature_id": c, "real_student_id": f"{c}-s{i}", "student_id": "owner", "unlocked_at": rts(3), "completed_at": rts(1) if i == 0 else None}
                                   for n, c in enumerate(creatures) for i in range(6 + n)]
    db.rows["creature_unlocks"] += [{"creature_id": "leaf_friend", "real_student_id": f"lf{i}", "student_id": "o", "unlocked_at": rts(2), "completed_at": None} for i in range(40)]
    db.rows["creature_submissions"] = [{"id": c, "creature_name": f"Name {c}", "emotion_colour": "yellow",
                                         "stage1_url": IMG % (c, 1), "stage4_url": IMG % (c, 4)} for c in creatures]


@pytest.fixture
def fresh_cache(monkeypatch):
    monkeypatch.setattr(S, "_fav_cache", {"at": None, "data": None})


def test_public_endpoint_payload_and_thumbnail(db, fresh_cache, monkeypatch):
    make_ranked_db(db); as_user(monkeypatch, {"user_id": "u", "role": "student"})
    out = asyncio.run(S.get_creature_favourites(_Req()))["favourites"]
    assert [r["creature_id"] for r in out] == ["sub-4", "sub-3", "sub-2", "sub-1"] and [r["rank"] for r in out] == [1, 2, 3, 4]
    assert {k for r in out for k in r} == {"rank", "creature_id", "name", "colour", "thumbnail_url"}     # no counts, no student data
    for r in out:
        assert r["thumbnail_url"].endswith(f"{r['creature_id']}_stage4_abcd1234_thumb.png?v=4")           # the fully evolved form's 200px image, cache-version forced
    assert "leaf_friend" not in str(out) and "-s0" not in str(out)                                      # starters excluded, no student ids


def test_thumbnail_url_gets_the_cache_version_even_if_the_stored_url_has_none(db, fresh_cache, monkeypatch):
    make_ranked_db(db)
    for c in db.rows["creature_submissions"]: c["stage4_url"] = c["stage4_url"].split("?")[0]
    as_user(monkeypatch, {"user_id": "u", "role": "student"})
    out = asyncio.run(S.get_creature_favourites(_Req()))["favourites"]
    assert all(r["thumbnail_url"].endswith("_stage4_abcd1234_thumb.png?v=4") for r in out)


@pytest.mark.parametrize("empty", [None, ""])
def test_thumbnail_falls_back_to_stage_1_only_when_stage_4_is_empty(db, fresh_cache, monkeypatch, empty):
    make_ranked_db(db)
    db.rows["creature_submissions"][0]["stage4_url"] = empty                       # creature sub-1 has no stage 4 picture
    as_user(monkeypatch, {"user_id": "u", "role": "student"})
    out = {r["creature_id"]: r["thumbnail_url"] for r in asyncio.run(S.get_creature_favourites(_Req()))["favourites"]}
    assert out["sub-1"].endswith("sub-1_stage1_abcd1234_thumb.png?v=4")
    assert all(out[c].endswith(f"{c}_stage4_abcd1234_thumb.png?v=4") for c in ("sub-2", "sub-3", "sub-4"))


def test_public_endpoint_empty_when_too_few_qualify(db, fresh_cache, monkeypatch):
    make_ranked_db(db, creatures=("sub-1", "sub-2")); as_user(monkeypatch, {"user_id": "u", "role": "student"})
    assert asyncio.run(S.get_creature_favourites(_Req())) == {"favourites": []}


def test_deleted_creature_is_skipped_and_can_drop_the_list_below_three(db, fresh_cache, monkeypatch):
    make_ranked_db(db, creatures=("sub-1", "sub-2", "sub-3")); db.rows["creature_submissions"].pop()
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


def test_admin_top_is_superadmin_only_and_matches_the_public_ranking_with_counts(db, monkeypatch):
    make_ranked_db(db)
    for role in ("teacher", "school_admin", "parent"):
        as_user(monkeypatch, {"user_id": "u", "role": role})
        with pytest.raises(HTTPException) as e:
            asyncio.run(S.admin_top_creatures(_Req()))
        assert e.value.status_code == 403
    as_user(monkeypatch, {"user_id": "u", "role": "superadmin"})
    out = asyncio.run(S.admin_top_creatures(_Req()))
    assert out["window_days"] == 30 and out["public_list_visible"] is True
    assert [r["creature_id"] for r in out["rows"]] == ["sub-4", "sub-3", "sub-2", "sub-1"]
    r = out["rows"][0]
    assert r["students"] == 9 and r["completed"] == 1 and r["rank"] == 1 and r["name"] == "Name sub-4"
    assert "checkins" not in r and not any(x["creature_id"] == "leaf_friend" for x in out["rows"])


def test_admin_top_shows_creatures_even_when_the_public_list_would_be_hidden(db, monkeypatch):
    make_ranked_db(db, creatures=("sub-1",)); as_user(monkeypatch, {"user_id": "u", "role": "superadmin"})
    out = asyncio.run(S.admin_top_creatures(_Req()))
    assert len(out["rows"]) == 1 and out["public_list_visible"] is False
