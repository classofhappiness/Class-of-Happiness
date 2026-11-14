"""S12: resolve_alert ownership check + parent_links.parent_user_id column. Offline (fake Supabase). Run from backend/:
    python3 -m pytest tests/test_resolve_alert.py
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import pytest
from fastapi import HTTPException
import server as S


class _Table:
    def __init__(self, db, name):
        self.db, self.name, self.f, self.mode, self.payload, self.cols = db, name, {}, "select", None, None
    def select(self, cols="*"): self.cols = cols; self.db.selects.append((self.name, cols)); return self
    def eq(self, k, v): self.f[k] = v; return self
    def update(self, d): self.mode, self.payload = "update", d; return self
    def execute(self):
        if self.name == "parent_links" and self.cols and "parent_id" in self.cols.replace("parent_user_id", ""):
            raise RuntimeError("column parent_links.parent_id does not exist")      # like the real table
        rows = self.db.rows.get(self.name, [])
        hit = [r for r in rows if all(r.get(k) == v for k, v in self.f.items())]
        if self.mode == "update":
            for r in hit: r.update(self.payload)
            self.db.updates.append((self.name, self.f.get("id"), self.payload))
        return type("R", (), {"data": [dict(r) for r in hit]})()


class _DB:
    def __init__(self): self.rows, self.selects, self.updates = {}, [], []
    def table(self, name): return _Table(self, name)


@pytest.fixture
def db(monkeypatch):
    d = _DB()
    d.rows["student_alerts"] = [
        {"id": "al-mine", "student_id": "stu-mine", "classroom_id": "cls-mine", "resolved": False},
        {"id": "al-other", "student_id": "stu-other", "classroom_id": "cls-other", "resolved": False},
        {"id": "al-home", "student_id": "fm-1", "classroom_id": None, "resolved": False},
    ]
    d.rows["family_members"] = [{"id": "fm-1", "user_id": "parent1"}]
    monkeypatch.setattr(S, "supabase", d)
    async def cls_ok(user, classroom_id, data=None): return classroom_id == "cls-mine" and user["user_id"] == "teacher1"
    async def stu_ok(user, student_id, data=None): return student_id == "stu-mine" and user["user_id"] in ("teacher1", "linkedparent")
    monkeypatch.setattr(S, "_is_authorized_for_classroom", cls_ok)
    monkeypatch.setattr(S, "_is_authorized_for_student", stu_ok)
    return d


def call(monkeypatch, user_id, role, alert_id):
    async def user(_r): return {"user_id": user_id, "role": role}
    monkeypatch.setattr(S, "get_current_user", user)
    return asyncio.run(S.resolve_alert(alert_id, object()))


def test_teacher_resolves_an_alert_in_their_own_classroom(db, monkeypatch):
    assert call(monkeypatch, "teacher1", "teacher", "al-mine")["ok"] is True
    assert db.rows["student_alerts"][0]["resolved"] is True and db.rows["student_alerts"][0]["resolved_by"] == "teacher1"


def test_linked_parent_resolves_their_childs_alert(db, monkeypatch):
    db.rows["student_alerts"][0]["classroom_id"] = None
    assert call(monkeypatch, "linkedparent", "parent", "al-mine")["ok"] is True


def test_home_alert_stored_against_a_family_member_id_belongs_to_that_parent(db, monkeypatch):
    assert call(monkeypatch, "parent1", "parent", "al-home")["ok"] is True


def test_someone_elses_alert_is_403_and_unchanged(db, monkeypatch):
    for uid, role in (("teacher1", "teacher"), ("parent1", "parent"), ("stranger", "school_admin")):
        with pytest.raises(HTTPException) as e:
            call(monkeypatch, uid, role, "al-other")
        assert e.value.status_code == 403
    assert db.rows["student_alerts"][1]["resolved"] is False and db.updates == []


def test_unknown_alert_is_404_and_superadmin_may_resolve_any(db, monkeypatch):
    with pytest.raises(HTTPException) as e:
        call(monkeypatch, "teacher1", "teacher", "nope")
    assert e.value.status_code == 404
    assert call(monkeypatch, "root", "superadmin", "al-other")["ok"] is True


def test_authorization_lookup_failure_is_logged_and_not_a_silent_allow(db, monkeypatch, caplog):
    async def boom(*a, **k): raise RuntimeError("db down")
    monkeypatch.setattr(S, "_is_authorized_for_student", boom)
    monkeypatch.setattr(S, "_is_authorized_for_classroom", boom)
    with pytest.raises(HTTPException) as e:
        call(monkeypatch, "teacher1", "teacher", "al-mine")
    assert e.value.status_code == 500 and db.updates == []
    assert "authorization check failed" in caplog.text


def test_parent_links_lookups_use_parent_user_id(db, monkeypatch):
    db.rows["parent_links"] = [{"student_id": "stu-mine", "parent_user_id": "linkedparent"}]
    assert S._resolve_parent_user_ids_sync("stu-mine") == {"linkedparent"}
    assert not any(t == "parent_links" and "parent_id" in c.replace("parent_user_id", "") for t, c in db.selects)
