"""GET /admin/creatures/starters: superadmin only, counts only, test accounts left out. Offline (fake Supabase). Run from backend/:
    python3 -m pytest tests/test_starter_creature_stats.py
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import pytest
from fastapi import HTTPException
import server as S


class _Table:
    def __init__(self, db, name): self.db, self.name = db, name
    def select(self, cols="*"): return self
    def range(self, a, b): self.a, self.b = a, b; return self
    def execute(self):
        rows = self.db.rows.get(self.name, [])
        return type("R", (), {"data": [dict(r) for r in rows[self.a:self.b + 1]]})()


class _DB:
    def __init__(self): self.rows = {}
    def table(self, name): return _Table(self, name)


def reward(sid, active, stages, points):
    return {"student_id": sid, "current_creature_id": active, "creature_stages": stages, "creature_points": points}


@pytest.fixture
def db(monkeypatch):
    d = _DB()
    d.rows["users"] = [
        {"user_id": "teacherA", "role": "teacher"},
        {"user_id": "root", "role": "superadmin"},
        {"user_id": "user_1c63245ecbf5", "role": "teacher"},            # tester account (excluded)
        {"user_id": "user_0e4a05d60288", "role": "teacher"},            # demo teacher (excluded)
        {"user_id": "44bf76b1-c0ee-49d5-bc68-3e47bb5cf8b3", "role": "school_admin"},
    ]
    d.rows["classrooms"] = [{"id": "cls-demo", "user_id": "user_0e4a05d60288"}]
    d.rows["students"] = [
        {"id": "s1", "user_id": "teacherA", "classroom_id": None},
        {"id": "s2", "user_id": "teacherA", "classroom_id": None},
        {"id": "s3", "user_id": "teacherA", "classroom_id": None},
        {"id": "s4", "user_id": "teacherA", "classroom_id": None},
        {"id": "t1", "user_id": "user_1c63245ecbf5", "classroom_id": None},        # tester's child
        {"id": "t2", "user_id": None, "classroom_id": "cls-demo"},                 # child reached through the demo teacher's classroom
        {"id": "t3", "user_id": "44bf76b1-c0ee-49d5-bc68-3e47bb5cf8b3", "classroom_id": None},
        {"id": "r1", "user_id": "root", "classroom_id": None},                     # superadmin-owned
        {"id": "g1", "user_id": "gone-user", "classroom_id": None},                # owner no longer exists
    ]
    zero = {"aqua_buddy": 0, "leaf_friend": 0, "spark_pal": 0, "blaze_heart": 0}
    d.rows["student_rewards"] = [
        # s1: aqua at stage 0 with 30 points (ready for stage 1), growing it now
        reward("s1", "aqua_buddy", dict(zero), {"aqua_buddy": 30}),
        # s2: aqua finished at stage 3, leaf at stage 1 with 60 points (ready for stage 2), growing leaf now
        reward("s2", "leaf_friend", {**zero, "aqua_buddy": 3, "leaf_friend": 1}, {"aqua_buddy": 130, "leaf_friend": 60}),
        # s3: aqua stage 2 with 100 points (not ready: needs 120), growing blaze now with no points yet
        reward("s3", "blaze_heart", {**zero, "aqua_buddy": 2}, {"aqua_buddy": 100}),
        # s4: nothing started anywhere except the active creature (spark), 0 points
        reward("s4", "spark_pal", dict(zero), {}),
        # every row below must be ignored
        reward("t1", "aqua_buddy", {**zero, "aqua_buddy": 3}, {"aqua_buddy": 500}),
        reward("t2", "aqua_buddy", {**zero, "aqua_buddy": 3}, {"aqua_buddy": 500}),
        reward("t3", "aqua_buddy", {**zero, "aqua_buddy": 3}, {"aqua_buddy": 500}),
        reward("r1", "aqua_buddy", {**zero, "aqua_buddy": 3}, {"aqua_buddy": 500}),
        reward("g1", "aqua_buddy", {**zero, "aqua_buddy": 3}, {"aqua_buddy": 500}),
    ]
    monkeypatch.setattr(S, "supabase", d)
    return d


def call(monkeypatch, role):
    async def user(_r): return {"user_id": "u", "role": role}
    monkeypatch.setattr(S, "get_current_user", user)
    return asyncio.run(S.admin_starter_creatures(object()))


@pytest.mark.parametrize("role", ["teacher", "parent", "school_admin"])
def test_non_superadmin_gets_403(db, monkeypatch, role):
    with pytest.raises(HTTPException) as e:
        call(monkeypatch, role)
    assert e.value.status_code == 403


def test_unauthenticated_gets_403(db, monkeypatch):
    async def nobody(_r): return None
    monkeypatch.setattr(S, "get_current_user", nobody)
    with pytest.raises(HTTPException) as e:
        asyncio.run(S.admin_starter_creatures(object()))
    assert e.value.status_code == 403


def test_test_accounts_superadmin_and_unknown_owners_are_left_out(db, monkeypatch):
    assert call(monkeypatch, "superadmin")["children"] == 4          # s1..s4 only


def test_counts_on_the_fixture(db, monkeypatch):
    c = call(monkeypatch, "superadmin")["creatures"]
    assert c["aqua_buddy"] == {"started": 3, "stage_counts": [1, 0, 1, 1], "finished": 1, "active": 1, "ready_to_evolve": 1}
    assert c["leaf_friend"] == {"started": 1, "stage_counts": [0, 1, 0, 0], "finished": 0, "active": 1, "ready_to_evolve": 1}
    assert c["blaze_heart"] == {"started": 1, "stage_counts": [1, 0, 0, 0], "finished": 0, "active": 1, "ready_to_evolve": 0}
    assert c["spark_pal"] == {"started": 1, "stage_counts": [1, 0, 0, 0], "finished": 0, "active": 1, "ready_to_evolve": 0}


def test_response_holds_counts_only(db, monkeypatch):
    out = call(monkeypatch, "superadmin")
    assert set(out) == {"children", "creatures"}
    assert set(out["creatures"]) == {"aqua_buddy", "leaf_friend", "blaze_heart", "spark_pal"}
    text = repr(out)
    assert "s1" not in text and "teacherA" not in text


def test_excluded_list_has_the_three_accounts():
    assert S.STATS_EXCLUDED_USER_IDS == {"user_1c63245ecbf5", "44bf76b1-c0ee-49d5-bc68-3e47bb5cf8b3", "user_0e4a05d60288"}


def test_json_string_maps_and_odd_values_do_not_crash(monkeypatch):
    rows = [{"student_id": "x", "current_creature_id": None, "creature_stages": '{"aqua_buddy": 2}', "creature_points": "not json"}]
    out = S._starter_stats_from_rows(rows, {"x": "teacherA"}, {"teacherA": "teacher"})
    assert out["creatures"]["aqua_buddy"]["stage_counts"] == [0, 0, 1, 0]
    assert out["creatures"]["aqua_buddy"]["ready_to_evolve"] == 0
