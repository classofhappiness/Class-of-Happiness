"""Resource audience (target_audience) is a real server-side restriction, decided by the caller's ROLE and never by the
?audience= query parameter. Offline: a tiny in-memory Supabase fake. Run from backend/:
    python3 -m pytest tests/test_resource_audience.py
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import pytest
from fastapi import HTTPException
import server as S


class _Q:
    def __init__(self, rows): self.rows, self.f = rows, []
    def select(self, *_a, **_k): return self
    def eq(self, k, v): self.f.append(lambda r: r.get(k) == v); return self
    def order(self, *_a, **_k): return self
    def in_(self, k, vs): self.f.append(lambda r: r.get(k) in list(vs)); return self
    def insert(self, row): self.rows.append(dict(row)); return self
    def update(self, _data): return self
    def execute(self):
        return type("R", (), {"data": [dict(r) for r in self.rows if all(f(r) for f in self.f)]})()


class _DB:
    def __init__(self, **tables): self.t = tables
    def table(self, name): return _Q(self.t.get(name, []))


class _Req:
    def __init__(self, body=None, query=None): self._b, self.query_params = body or {}, query or {}
    async def json(self): return self._b


PARENT = {"user_id": "p1", "role": "parent"}
TEACHER = {"user_id": "t1", "role": "teacher"}
SCHOOL_ADMIN = {"user_id": "sa1", "role": "school_admin"}
SUPER = {"user_id": "su1", "role": "superadmin"}


def res(id, audience, **kw):
    return {"id": id, "title": id, "description": "", "content_type": "pdf", "content": "data:application/pdf;base64,AAAA",
            "pdf_filename": f"{id}.pdf", "topic": "leader_online", "category": "leader_online", "target_audience": audience,
            "order_index": 0, "is_global": True, "is_active": True, "created_at": "2026-11-01T00:00:00", "user_id": "owner",
            "created_by": "owner", "week_number": 1, "school_admin_id": None, **kw}


ROWS = [res("T", "teachers"), res("P", "parents"), res("B", "both"), res("N", None), res("E", "")]


@pytest.fixture
def api(monkeypatch):
    state = {"user": PARENT}
    monkeypatch.setattr(S, "supabase", _DB(resources=[dict(r) for r in ROWS], teacher_resource_ratings=[],
                                           resource_previews=[{"resource_id": r["id"], "page_order": 1, "image": "x"} for r in ROWS]))
    async def _user(_request): return state["user"]
    monkeypatch.setattr(S, "get_current_user", _user)
    monkeypatch.setattr(S, "_resolve_caller_school_admin_ids", lambda u: set())
    monkeypatch.setattr(S, "_resources_lock_applies", lambda u: False)

    class A:
        def as_(self, user): state["user"] = user; return self
        def ids(self, out): return sorted(r["id"] for r in out)
        def list_resources(self): return asyncio.run(S.get_resources(_Req()))
        def list_teacher(self, audience=None): return asyncio.run(S.get_teacher_resources(_Req(), None, audience))
        def get(self, rid): return asyncio.run(S.get_resource(rid, _Req()))
        def get_teacher(self, rid): return asyncio.run(S.get_teacher_resource(rid, _Req()))
        def download(self, rid): return asyncio.run(S.download_resource_pdf(rid, _Req()))
        def previews(self, rid): return asyncio.run(S.get_resource_previews(rid, _Req()))
        def parent_list(self): return asyncio.run(S.get_parent_resources(_Req(), None))
        def rate(self, rid): return asyncio.run(S.rate_teacher_resource(rid, _Req({"rating": 5})))
        def ratings(self, rid): return asyncio.run(S.get_teacher_resource_ratings(rid, _Req()))
    return A()


def status(fn, *a):
    try:
        fn(*a)
        return 200
    except HTTPException as e:
        return e.status_code


SINGLE_ITEM_ROUTES = ["get", "get_teacher", "download", "previews"]


# ---------- the role helper ----------
@pytest.mark.parametrize("user,allowed", [
    (PARENT, {"parents", "both"}), (TEACHER, {"teachers", "both"}), (SCHOOL_ADMIN, {"teachers", "both"}),
    (SUPER, None), ({"user_id": "k", "role": "kiosk"}, {"both"})])
def test_audiences_by_role(user, allowed):
    assert S._audiences_visible_to(user) == allowed


@pytest.mark.parametrize("user", [PARENT, TEACHER, SCHOOL_ADMIN])
def test_query_parameter_is_ignored_for_everyone_but_superadmin(user):
    assert S._audiences_visible_to(user, "teachers") == S._audiences_visible_to(user)
    assert S._audiences_visible_to(user, "parents") == S._audiences_visible_to(user)


def test_superadmin_may_narrow_with_the_parameter():
    assert S._audiences_visible_to(SUPER, "parents") == {"parents", "both"}
    assert S._audiences_visible_to(SUPER, "teachers") == {"teachers", "both"}
    assert S._audiences_visible_to(SUPER, "anything-else") is None


# ---------- lists ----------
def test_parent_cannot_list_a_teachers_item(api):
    api.as_(PARENT)
    assert api.ids(api.list_resources()) == ["B", "E", "N", "P"]
    assert api.ids(api.list_teacher()) == ["B", "E", "N", "P"]


def test_teacher_cannot_see_a_parents_item(api):
    api.as_(TEACHER)
    assert api.ids(api.list_resources()) == ["B", "E", "N", "T"]
    assert api.ids(api.list_teacher()) == ["B", "E", "N", "T"]


def test_school_admin_follows_the_teacher_rule(api):
    api.as_(SCHOOL_ADMIN)
    assert api.ids(api.list_teacher()) == ["B", "E", "N", "T"]


def test_both_is_visible_to_both_and_null_and_blank_stay_visible_to_everyone(api):
    for user in (PARENT, TEACHER, SCHOOL_ADMIN, SUPER):
        api.as_(user)
        for ids in (api.ids(api.list_resources()), api.ids(api.list_teacher())):
            assert {"B", "N", "E"} <= set(ids), user["role"]


def test_superadmin_sees_everything(api):
    api.as_(SUPER)
    assert api.ids(api.list_resources()) == ["B", "E", "N", "P", "T"]
    assert api.ids(api.list_teacher()) == ["B", "E", "N", "P", "T"]


def test_audience_query_parameter_cannot_widen_a_parent_or_teacher_list(api):
    api.as_(PARENT)
    assert "T" not in api.ids(api.list_teacher("teachers"))        # a parent asking for the teachers view
    assert "P" in api.ids(api.list_teacher("teachers"))
    api.as_(TEACHER)
    assert "P" not in api.ids(api.list_teacher("parents"))         # a teacher asking for the parents view
    assert "T" in api.ids(api.list_teacher("parents"))


def test_superadmin_can_still_filter_with_the_parameter(api):
    api.as_(SUPER)
    assert api.ids(api.list_teacher("parents")) == ["B", "E", "N", "P"]
    assert api.ids(api.list_teacher("teachers")) == ["B", "E", "N", "T"]


# ---------- single-item routes: not allowed looks exactly like missing ----------
@pytest.mark.parametrize("route", SINGLE_ITEM_ROUTES)
def test_parent_cannot_open_or_download_a_teachers_item(api, route):
    api.as_(PARENT)
    assert status(getattr(api, route), "T") == 404
    assert status(getattr(api, route), "does-not-exist") == 404     # the very same answer as a missing item
    assert status(getattr(api, route), "P") == 200
    assert status(getattr(api, route), "B") == 200


@pytest.mark.parametrize("route", SINGLE_ITEM_ROUTES)
def test_teacher_cannot_open_or_download_a_parents_item(api, route):
    api.as_(TEACHER)
    assert status(getattr(api, route), "P") == 404
    assert status(getattr(api, route), "T") == 200
    assert status(getattr(api, route), "B") == 200


@pytest.mark.parametrize("route", SINGLE_ITEM_ROUTES)
def test_null_audience_item_opens_for_everyone_and_superadmin_opens_anything(api, route):
    for user in (PARENT, TEACHER):
        api.as_(user)
        assert status(getattr(api, route), "N") == 200
        assert status(getattr(api, route), "E") == 200
    api.as_(SUPER)
    for rid in ("T", "P", "B", "N"):
        assert status(getattr(api, route), rid) == 200


def test_the_404_for_a_hidden_item_matches_the_404_for_a_missing_one(api):
    api.as_(PARENT)
    with pytest.raises(HTTPException) as hidden:
        api.get("T")
    with pytest.raises(HTTPException) as missing:
        api.get("nope")
    assert (hidden.value.status_code, hidden.value.detail) == (missing.value.status_code, missing.value.detail)


def test_an_uploader_still_sees_their_own_parents_item(api):
    S.supabase.t["resources"].append(res("MINE", "parents", user_id="t1", created_by="t1", is_global=False))
    api.as_(TEACHER)
    assert "MINE" in api.ids(api.list_teacher())
    assert status(api.get, "MINE") == 200


# ---------- writes: only the plural forms are accepted ----------
@pytest.mark.parametrize("v", ["teachers", "parents", "both"])
def test_clean_audience_accepts_the_three_plural_values(v):
    assert S._clean_audience(v) == v


@pytest.mark.parametrize("v", ["teacher", "parent", "admin", "Teachers", " parents", "all", "everyone", 5, ["both"]])
def test_singular_and_unknown_values_are_rejected_with_a_clear_message(v):
    with pytest.raises(HTTPException) as e:
        S._clean_audience(v, "both")
    assert e.value.status_code == 400 and "teachers, parents, both" in e.value.detail


def test_missing_value_uses_the_default_or_is_an_error_when_there_is_none():
    assert S._clean_audience(None, "both") == "both" and S._clean_audience("", "teachers") == "teachers"
    with pytest.raises(HTTPException):
        S._clean_audience(None)


@pytest.mark.parametrize("bad", ["teacher", "parent", "admin"])
def test_create_endpoints_reject_singular_values_and_write_nothing(api, bad):
    api.as_(SUPER)
    before = len(S.supabase.t["resources"])
    body = {"title": "x", "content_type": "link", "content": "https://example.com", "target_audience": bad}
    for fn in (S.create_teacher_resource, S.create_admin_resource):
        with pytest.raises(HTTPException) as e:
            asyncio.run(fn(_Req(body)))
        assert e.value.status_code == 400
    assert len(S.supabase.t["resources"]) == before


def test_update_endpoints_reject_singular_values(api):
    api.as_(SUPER)
    for fn in (S.update_teacher_resource, S.update_resource):
        with pytest.raises(HTTPException) as e:
            asyncio.run(fn("B", _Req({"target_audience": "parent"})))
        assert e.value.status_code == 400


# ---------- GET /parent/resources follows the caller's role too ----------
def test_a_teacher_calling_parent_resources_cannot_see_a_parents_item(api):
    api.as_(TEACHER)
    assert api.ids(api.parent_list()) == ["B", "E", "N", "T"]


def test_parent_resources_still_shows_a_parent_parents_and_both_but_not_teachers(api):
    api.as_(PARENT)
    assert api.ids(api.parent_list()) == ["B", "E", "N", "P"]


def test_superadmin_calling_parent_resources_sees_everything(api):
    api.as_(SUPER)
    assert api.ids(api.parent_list()) == ["B", "E", "N", "P", "T"]


# ---------- rating routes: same read check, same 404 ----------
@pytest.mark.parametrize("route", ["rate", "ratings"])
def test_a_parent_cannot_rate_or_read_ratings_of_a_teachers_item(api, route):
    api.as_(PARENT)
    assert status(getattr(api, route), "T") == 404
    assert status(getattr(api, route), "does-not-exist") == 404      # the very same answer as a missing item


@pytest.mark.parametrize("route", ["rate", "ratings"])
def test_a_teacher_cannot_rate_or_read_ratings_of_a_parents_item(api, route):
    api.as_(TEACHER)
    assert status(getattr(api, route), "P") == 404


@pytest.mark.parametrize("route", ["rate", "ratings"])
def test_rating_still_works_for_items_the_caller_may_see(api, route):
    api.as_(PARENT)
    for rid in ("P", "B", "N"):
        assert status(getattr(api, route), rid) == 200
    api.as_(TEACHER)
    for rid in ("T", "B", "N"):
        assert status(getattr(api, route), rid) == 200
    api.as_(SUPER)
    assert status(getattr(api, route), "P") == 200


def test_a_hidden_item_is_not_rated(api):
    api.as_(PARENT)
    before = len(S.supabase.t["teacher_resource_ratings"])
    assert status(api.rate, "T") == 404
    assert len(S.supabase.t["teacher_resource_ratings"]) == before
