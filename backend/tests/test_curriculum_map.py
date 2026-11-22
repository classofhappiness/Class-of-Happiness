"""Curriculum map endpoints and curriculum_links validation. Offline: a tiny in-memory Supabase fake that RESPECTS the
selected columns, so a test can prove `content` (base64 PDF) is never requested or returned. Run from backend/:
    python3 -m pytest tests/test_curriculum_map.py
"""
import asyncio
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import pytest
from fastapi import HTTPException
import server as S

SELECTS = []


class _Q:
    def __init__(self, db, name): self.db, self.name, self.f, self.cols, self.rng, self.upd, self.ins = db, name, [], "*", None, None, None
    def select(self, cols="*", *_a, **_k):
        self.cols = cols; SELECTS.append((self.name, cols)); return self
    def eq(self, k, v): self.f.append(lambda r: r.get(k) == v); return self
    def order(self, *_a, **_k): return self
    def range(self, a, b): self.rng = (a, b); return self
    def in_(self, k, vs): self.f.append(lambda r: r.get(k) in list(vs)); return self
    def insert(self, row): self.ins = dict(row); return self
    def update(self, data): self.upd = dict(data); return self
    def execute(self):
        rows = self.db.t.setdefault(self.name, [])
        if self.name == "resources" and not self.db.has_links_column and ("curriculum_links" in self.cols or (self.ins and "curriculum_links" in self.ins) or (self.upd and "curriculum_links" in self.upd)):
            raise Exception("column resources.curriculum_links does not exist")
        if self.ins is not None:
            rows.append(self.ins); return type("R", (), {"data": [dict(self.ins)]})()
        hit = [r for r in rows if all(f(r) for f in self.f)]
        if self.upd is not None:
            for r in hit: r.update(self.upd)
        if self.rng: hit = hit[self.rng[0]:self.rng[1] + 1]
        if self.cols != "*":
            keep = [c.strip() for c in self.cols.split(",")]
            hit = [{k: r[k] for k in keep if k in r} for r in hit]
        return type("R", (), {"data": [dict(r) for r in hit]})()


class _DB:
    def __init__(self, has_links_column=True, **tables): self.t, self.has_links_column = tables, has_links_column
    def table(self, name): return _Q(self, name)


class _Req:
    def __init__(self, body=None): self._b, self.query_params = body or {}, {}
    async def json(self): return self._b


PARENT = {"user_id": "p1", "role": "parent"}
TEACHER = {"user_id": "t1", "role": "teacher"}
SCHOOL_ADMIN = {"user_id": "sa1", "role": "school_admin"}
ADMIN = {"user_id": "ad1", "role": "admin"}
SUPER = {"user_id": "su1", "role": "superadmin"}
KIOSK = {"user_id": "k1", "role": "kiosk"}


def L(*codes, fw="england_dfe", proposed=True): return {fw: [{"code": c, "proposed": proposed} for c in codes]}


def res(id, topic="leader_online", week=1, audience="both", school=None, links=None, **kw):
    return {"id": id, "title": f"Title {id}", "description": "d", "content_type": "pdf", "content": "data:application/pdf;base64,QUJD",
            "pdf_filename": f"{id}.pdf", "topic": topic, "category": topic, "target_audience": audience, "order_index": 0,
            "is_global": school is None, "is_active": True, "created_at": "2026-11-01T00:00:00", "user_id": "owner",
            "created_by": "owner", "week_number": week, "school_admin_id": school, "age_min": 5, "age_max": 11,
            "duration_minutes": 40, "grouping": None, "goal": None, "outcomes": None, "use_when": None,
            "curriculum_links": {} if links is None else links, **kw}


ROWS = [
    res("W1", week=1, links={**L("GW 3", "GW 4", proposed=False), **L("WB2", fw="wales")}),
    res("W3", week=3, links={**L("GW 5"), **L("Saúde", fw="portugal")}),                      # all proposed
    res("EMO5", topic="emotions_program", week=5, links=L("GW 3", proposed=False)),
    res("DOC", week=None, links={}),                                                              # no codes
    res("OTHERSCHOOL", school="other", links=L("GW 3")),
    res("MYSCHOOL", school="sa1", week=4, links=L("GW 4")),
    res("PARENTS", audience="parents", links=L("GW 3")),
    res("OFF", is_active=False, links=L("ZZZ 9")),
]
STATEMENTS = [
    {"framework": "england_dfe", "code": "GW 3", "statement": "How to talk about their emotions."},
    {"framework": "england_dfe", "code": "GW 4", "statement": ""},
    {"framework": "wales", "code": "WB2", "statement": None},
    {"framework": "england_dfe", "code": "NOT IN USE", "statement": "unused code"},
]


@pytest.fixture
def api(monkeypatch):
    SELECTS.clear()
    state = {"user": TEACHER, "lock": False}
    db = _DB(resources=[dict(r) for r in ROWS], curriculum_statements=[dict(r) for r in STATEMENTS])
    monkeypatch.setattr(S, "supabase", db)
    async def _user(_request): return state["user"]
    monkeypatch.setattr(S, "get_current_user", _user)
    monkeypatch.setattr(S, "_resolve_caller_school_admin_ids", lambda u: {"sa1"} if u.get("role") in ("school_admin", "teacher") else set())
    monkeypatch.setattr(S, "_resources_lock_applies", lambda u: state["lock"])
    monkeypatch.setattr(S, "_teacher_school_admin_id", lambda u: "sa1")
    monkeypatch.setattr(S, "_upload_limit_mb", lambda u: 10)

    class A:
        db_ = db
        def as_(self, user, lock=False): state["user"], state["lock"] = user, lock; return self
        def map(self): return asyncio.run(S.get_curriculum_map(_Req()))
        def statements(self): return asyncio.run(S.get_curriculum_statements(_Req()))
        def gaps(self): return asyncio.run(S.get_curriculum_gaps(_Req()))
        def put_teacher(self, rid, body): return asyncio.run(S.update_teacher_resource(rid, _Req(body)))
        def put(self, rid, body): return asyncio.run(S.update_resource(rid, _Req(body)))
        def post_teacher(self, body): return asyncio.run(S.create_teacher_resource(_Req({"title": "T", "content": "x", "content_type": "text", **body})))
        def post_admin(self, body): return asyncio.run(S.create_admin_resource(_Req({"title": "T", "content": "x", "content_type": "text", **body})))
        def stored(self, rid): return next(r for r in db.t["resources"] if r["id"] == rid)
    return A()


def code_of(fn, *a):
    try:
        fn(*a)
    except HTTPException as e:
        return e.status_code
    return 200


# ---------- access ----------
@pytest.mark.parametrize("who", [PARENT, KIOSK])
def test_parent_and_other_roles_get_403_on_all_three(api, who):
    api.as_(who)
    assert code_of(api.map) == 403 and code_of(api.statements) == 403 and code_of(api.gaps) == 403


@pytest.mark.parametrize("who", [TEACHER, SCHOOL_ADMIN, ADMIN, SUPER])
def test_read_roles_can_read_map_and_statements(api, who):
    api.as_(who)
    assert code_of(api.map) == 200 and code_of(api.statements) == 200


@pytest.mark.parametrize("who", [TEACHER, SCHOOL_ADMIN])
def test_gaps_is_admin_only(api, who):
    api.as_(who)
    assert code_of(api.gaps) == 403


@pytest.mark.parametrize("who", [ADMIN, SUPER])
def test_gaps_open_to_admin_and_superadmin(api, who):
    assert code_of(api.as_(who).gaps) == 200


def test_unauthenticated_is_401(api):
    api.as_(None)
    assert code_of(api.map) == 401 and code_of(api.statements) == 401 and code_of(api.gaps) == 401


# ---------- /curriculum-map ----------
def test_map_never_selects_or_returns_content(api):
    out = api.as_(SUPER).map()
    assert out
    for r in out:
        assert "content" not in r and "pdf_data" not in r and "pdf_filename" not in r
        assert "QUJD" not in json.dumps(r)
    for table, cols in SELECTS:
        if table == "resources":
            assert not re.search(r"(^|,)\s*(content|\*)\s*(,|$)", cols), cols
            assert "content" not in cols.replace("content_type", "")


def test_map_row_shape_and_every_framework_returned(api):
    out = {r["id"]: r for r in api.as_(SUPER).map()}
    r = out["W1"]
    assert set(r) == {"id", "title", "topic", "week_number", "audience", "age_min", "age_max", "minutes", "is_locked", "curriculum_links"}
    assert (r["title"], r["topic"], r["week_number"], r["audience"], r["age_min"], r["age_max"], r["minutes"]) == ("Title W1", "leader_online", 1, "both", 5, 11, 40)
    assert set(r["curriculum_links"]) == {"england_dfe", "wales"}          # all frameworks it has - no country filtering on the server
    assert out["DOC"]["curriculum_links"] == {}


def test_map_locked_flag_follows_the_resource_list_rule(api):
    out = {r["id"]: r for r in api.as_(TEACHER, lock=True).map()}
    assert out["W1"]["is_locked"] is False            # week 1 is free
    assert out["W3"]["is_locked"] is True             # week 3 of a paid programme, free tier
    assert out["DOC"]["is_locked"] is False           # no week = free
    assert out["EMO5"]["is_locked"] is False          # Emotions is fully free
    out = {r["id"]: r for r in api.as_(TEACHER, lock=False).map()}
    assert not any(r["is_locked"] for r in out.values())
    out = {r["id"]: r for r in api.as_(SUPER, lock=False).map()}
    assert not any(r["is_locked"] for r in out.values())


def test_map_visibility_matches_the_resource_lists(api):
    ids = {r["id"] for r in api.as_(TEACHER).map()}
    assert "OTHERSCHOOL" not in ids                   # another school's private resource
    assert "MYSCHOOL" in ids and "W1" in ids          # own school + global
    assert "PARENTS" not in ids                       # parents-only audience is not for teachers
    assert "OFF" not in ids                           # inactive
    ids = {r["id"] for r in api.as_(SUPER).map()}
    assert {"OTHERSCHOOL", "PARENTS"} <= ids and "OFF" not in ids


def test_map_before_migration_returns_rows_without_codes(api):
    api.db_.has_links_column = False
    out = api.as_(SUPER).map()
    assert out and all(r["curriculum_links"] == {} for r in out)


# ---------- /curriculum-statements ----------
def test_statements_only_for_codes_in_use(api):
    out = api.as_(TEACHER).statements()
    keys = {(r["framework"], r["code"]): r["statement"] for r in out}
    assert ("england_dfe", "NOT IN USE") not in keys and ("england_dfe", "ZZZ 9") not in keys      # unused / inactive-only
    assert keys[("england_dfe", "GW 3")] == "How to talk about their emotions."
    assert keys[("wales", "WB2")] is None
    assert ("portugal", "Saúde") in keys and keys[("portugal", "Saúde")] is None                      # in use, no text row at all
    assert all(set(r) == {"framework", "code", "statement"} for r in out)


# ---------- /curriculum-map/gaps ----------
def test_gaps_report(api):
    g = api.as_(SUPER).gaps()
    assert set(g["codes_without_statement"]) == set(S.CURRICULUM_FRAMEWORKS)
    assert g["codes_without_statement"]["england_dfe"] == ["GW 4", "GW 5"]      # GW 4 has blank text, GW 5 no row
    assert g["codes_without_statement"]["wales"] == ["WB2"] and g["codes_without_statement"]["portugal"] == ["Saúde"]
    assert [r["id"] for r in g["resources_without_codes"]] == ["DOC"]
    assert sorted(r["id"] for r in g["resources_with_only_proposed_codes"]) == ["MYSCHOOL", "OTHERSCHOOL", "PARENTS", "W3"]


# ---------- validation on POST / PUT ----------
BAD = [
    ({"scotlandd": [{"code": "X", "proposed": True}]}, 400),                    # unknown framework
    ({"england_dfe": [{"code": "x" * 41, "proposed": True}]}, 400),             # code too long
    ({"england_dfe": [{"code": "", "proposed": True}]}, 400),
    ({"england_dfe": ["GW 3"]}, 400),                                           # not {code, proposed}
    ({"england_dfe": {"code": "GW 3"}}, 400),                                   # not a list
    ({"england_dfe": [{"code": "GW 3", "proposed": "no"}]}, 400),               # proposed not a bool
    (["GW 3"], 400),
]


@pytest.mark.parametrize("links,status", BAD)
def test_bad_links_rejected_on_every_write_path(api, links, status):
    api.as_(SUPER)
    assert code_of(api.post_teacher, {"curriculum_links": links}) == status
    assert code_of(api.post_admin, {"curriculum_links": links}) == status
    assert code_of(api.put_teacher, "W1", {"curriculum_links": links}) == status
    assert code_of(api.put, "W1", {"curriculum_links": links}) == status
    assert api.stored("W1")["curriculum_links"] == ROWS[0]["curriculum_links"]            # nothing was written


def test_code_of_exactly_40_chars_is_accepted(api):
    api.as_(SUPER).put_teacher("W1", {"curriculum_links": L("x" * 40)})
    assert api.stored("W1")["curriculum_links"] == {"england_dfe": [{"code": "x" * 40, "proposed": True}]}


def test_all_nine_frameworks_accepted_and_empty_ones_dropped(api):
    links = {fw: [{"code": "A 1", "proposed": True}] for fw in S.CURRICULUM_FRAMEWORKS}
    links["wales"] = []
    api.as_(SUPER).put_teacher("W1", {"curriculum_links": links})
    got = api.stored("W1")["curriculum_links"]
    assert set(got) == set(S.CURRICULUM_FRAMEWORKS) - {"wales"}


def test_teacher_cannot_set_proposed_false_on_put_or_post(api):
    api.as_(SUPER)
    api.put_teacher("MYSCHOOL", {"curriculum_links": L("GW 4")})                  # superadmin resets to proposed
    api.as_(SCHOOL_ADMIN)
    assert code_of(api.put_teacher, "MYSCHOOL", {"curriculum_links": L("GW 4", proposed=False)}) == 403
    assert code_of(api.put, "MYSCHOOL", {"curriculum_links": L("GW 4", proposed=False)}) == 403
    assert code_of(api.post_teacher, {"curriculum_links": L("GW 4", proposed=False)}) == 403
    api.as_(TEACHER)
    assert code_of(api.post_teacher, {"curriculum_links": L("GW 4", proposed=False)}) == 403
    assert code_of(api.post_teacher, {"curriculum_links": L("GW 4", proposed=True)}) == 200   # a proposal is fine
    assert api.stored("MYSCHOOL")["curriculum_links"] == L("GW 4")                            # unchanged


@pytest.mark.parametrize("who", [ADMIN, SUPER])
def test_admin_can_confirm(api, who):
    api.as_(who).put_teacher("MYSCHOOL", {"curriculum_links": L("GW 5", proposed=False)})     # (global rows stay superadmin-only: existing rule)
    assert api.stored("MYSCHOOL")["curriculum_links"] == L("GW 5", proposed=False)
    assert code_of(api.post_teacher, {"curriculum_links": L("GW 9", proposed=False)}) == 200


def test_non_admin_may_resend_an_already_confirmed_code_but_not_confirm_a_new_one(api):
    api.as_(SUPER).put_teacher("MYSCHOOL", {"curriculum_links": L("GW 4", proposed=False)})
    api.as_(SCHOOL_ADMIN)
    assert code_of(api.put_teacher, "MYSCHOOL", {"title": "renamed", "curriculum_links": L("GW 4", proposed=False)}) == 200   # unchanged confirmed code
    assert code_of(api.put_teacher, "MYSCHOOL", {"curriculum_links": {**L("GW 4", proposed=False), **L("WB1", fw="wales", proposed=False)}}) == 403
    assert api.stored("MYSCHOOL")["curriculum_links"] == L("GW 4", proposed=False)


def test_writes_without_curriculum_links_are_unchanged(api):
    api.as_(SCHOOL_ADMIN)
    api.put_teacher("MYSCHOOL", {"title": "just a rename"})
    assert api.stored("MYSCHOOL")["title"] == "just a rename" and api.stored("MYSCHOOL")["curriculum_links"] == L("GW 4")
    out = api.post_teacher({})
    assert "curriculum_links" not in out                                      # absent key: the column is not even sent (works before the migration)
