"""A child's helper list never shows the same strategy twice (same lowercase name + colour), and prefers the
child-specific row over family-level / parent-assigned / school-wide copies. Offline: a tiny in-memory Supabase fake.
    python3 -m pytest tests/test_strategy_dedupe.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import pytest
import server as S


class _Q:
    def __init__(self, rows): self.rows, self.f = rows, []
    def select(self, *_a, **_k): return self
    def eq(self, k, v): self.f.append(lambda r: r.get(k) == v); return self
    def in_(self, k, vs): self.f.append(lambda r: r.get(k) in list(vs)); return self
    def is_(self, k, v): self.f.append(lambda r: (r.get(k) is None) if v == "null" else r.get(k) == v); return self
    def execute(self):
        return type("R", (), {"data": [dict(r) for r in self.rows if all(f(r) for f in self.f)]})()


class _DB:
    def __init__(self, **tables): self.t = tables
    def table(self, name): return _Q(self.t.get(name, []))


TEACHER = {"user_id": "t1", "role": "teacher"}


def row(id, name, colour="yellow", created="2026-11-01T10:00:00", **kw):
    return {"id": id, "student_id": "stu1", "user_id": "t1", "name": name, "feeling_colour": colour,
            "is_active": True, "is_shared": True, "created_at": created, **kw}


def resolve(monkeypatch, helpers=(), assigned=(), school=(), colour="yellow", include_inactive=False, user=TEACHER):
    monkeypatch.setattr(S, "supabase", _DB(custom_helpers=list(helpers), family_assigned_strategies=list(assigned)))
    monkeypatch.setattr(S, "_student_school_admin_id", lambda sid: "sa1")
    monkeypatch.setattr(S, "_fetch_school_strategies_sync", lambda *_a, **_k: [dict(x) for x in school])
    return S._resolve_student_strategies_sync(user, "stu1", colour, include_inactive)


def school_item(name, colour="yellow"):
    return {"id": f"school_{name}", "name": name, "description": "", "icon": "star", "feeling_colour": colour, "zone": colour, "strategy_type": "student", "source": "school"}


def assigned_row(name, zone="yellow"):
    return {"id": "fa1", "student_id": "stu1", "parent_user_id": "p1", "strategy_name": name, "strategy_description": "", "zone": zone,
            "share_with_teacher": True, "is_active": True}


def test_child_specific_row_beats_the_family_assigned_and_school_copies(monkeypatch):
    out = resolve(monkeypatch, helpers=[row("h1", "Calm corner")], assigned=[assigned_row("calm corner")], school=[school_item("CALM CORNER")])
    assert [(i["_kind"], i["id"]) for i in out] == [("custom_student", "h1")]


def test_name_match_ignores_case_and_surrounding_spaces(monkeypatch):
    out = resolve(monkeypatch, helpers=[row("h1", "yellow test"), row("h2", "  Yellow Test ", created="2026-11-02T10:00:00")])
    assert [i["id"] for i in out] == ["h1"]                        # same kind: the oldest row survives


def test_same_name_in_a_different_colour_is_not_a_duplicate(monkeypatch):
    out = resolve(monkeypatch, helpers=[row("h1", "Breathe", "yellow"), row("h2", "Breathe", "blue")], colour=None)
    assert sorted(i["id"] for i in out) == ["h1", "h2"]


def test_different_names_are_all_kept_and_order_is_preserved(monkeypatch):
    out = resolve(monkeypatch, helpers=[row("h1", "A"), row("h2", "B")], school=[school_item("C")])
    assert [i["name"] for i in out] == ["A", "B", "C"]


def test_school_wide_copy_is_dropped_only_when_a_child_row_has_the_same_name(monkeypatch):
    out = resolve(monkeypatch, school=[school_item("Calm room"), school_item("Walk")], helpers=[row("h1", "calm room")])
    assert sorted(i["name"] for i in out) == ["Walk", "calm room"]


def test_management_views_keep_every_row_so_a_duplicate_can_still_be_deleted(monkeypatch):
    out = resolve(monkeypatch, helpers=[row("h1", "Same"), row("h2", "Same")], include_inactive=True)
    assert sorted(i["id"] for i in out) == ["h1", "h2"]


def test_collapse_keeps_items_without_a_name():
    items = [{"id": "a", "name": "", "feeling_colour": "red", "_kind": "custom_student"}, {"id": "b", "name": None, "feeling_colour": "red", "_kind": "custom_student"}]
    assert S._collapse_same_strategies(items) == items
