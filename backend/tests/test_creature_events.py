"""Creature stats Phase 2: server-side creature_checkin / creature_stage / creature_complete events.
Offline: a small recording fake stands in for Supabase and the event thread pool runs inline. Run from backend/:
    python3 -m pytest tests/test_creature_events.py
"""
import asyncio
import inspect
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import pytest
import server as S


class _Table:
    def __init__(self, db, name):
        self.db, self.name, self.f, self.mode, self.payload = db, name, {}, "select", None
    def eq(self, k, v): self.f[k] = v; return self
    def in_(self, *_a): return self
    def __getattr__(self, _n): return lambda *a, **k: self           # select/order/limit/gte/lte/is_/... are no-ops here
    def insert(self, d): self.mode, self.payload = "insert", d; return self
    def update(self, d): self.mode, self.payload = "update", d; return self
    def execute(self):
        rows = self.db.rows.setdefault(self.name, [])
        if self.mode == "insert":
            if self.name in self.db.fail_insert:
                raise RuntimeError("column does not exist")
            row = {"id": f"{self.name}-{len(rows) + 1}", **self.payload}       # like the real tables, rows get an id
            rows.append(row); self.db.inserts.setdefault(self.name, []).append(dict(row))
            return type("R", (), {"data": [dict(row)]})()
        hit = [r for r in rows if all(r.get(k) == v for k, v in self.f.items())]
        if self.mode == "update":
            for r in hit: r.update(self.payload)
        return type("R", (), {"data": [dict(r) for r in hit]})()


class _DB:
    def __init__(self): self.rows, self.inserts, self.fail_insert = {}, {}, set()
    def table(self, name): return _Table(self, name)
    def events(self): return self.inserts.get("engagement_events", [])


class _Inline:
    def submit(self, fn, *a): fn(*a)


@pytest.fixture
def db(monkeypatch):
    d = _DB()
    d.rows["students"] = [{"id": "stu1", "user_id": "acct1", "classroom_id": "cls1", "name": "Real Name", "active_creatures": {}}]
    monkeypatch.setattr(S, "supabase", d)
    monkeypatch.setattr(S, "_creature_event_pool", _Inline())
    monkeypatch.setattr(S, "_creature_event_warned", False)
    monkeypatch.setattr(S, "_student_school_admin_id", lambda sid: "sa1")
    async def user(_r): return {"user_id": "acct1", "role": "teacher"}
    async def ok(*_a): return True
    monkeypatch.setattr(S, "get_current_user", user)
    monkeypatch.setattr(S, "_is_authorized_for_student", ok)
    monkeypatch.setattr(S, "_is_shop_enabled_for_student", lambda *_a: True)
    return d


def checkin(student="stu1", **kw):
    req = S.AddPointsRequest(points_type=kw.pop("points_type", "checkin"), zone=kw.pop("zone", "green"), **kw)
    return asyncio.run(S.add_points(student, req, object()))


def test_event_payload_is_ids_only_and_carries_country_derivation_ids(db):
    S._log_creature_event_sync("stu1", "creature_checkin", "leaf_friend", colour="green")
    [e] = db.events()
    assert e["event_type"] == "creature_checkin" and e["creature_id"] == "leaf_friend" and e["colour"] == "green"
    assert e["classroom_id"] == "cls1" and e["user_id"] == "acct1" and e["school_admin_id"] == "sa1" and e["student_id"] == "stu1"
    assert "Real Name" not in str(e) and not any("name" in k for k in e)           # no names anywhere in the payload


def test_real_checkin_logs_one_event_against_the_creature_that_got_it(db):
    checkin(checkin_log_id="log1")
    [e] = db.events()
    assert (e["event_type"], e["creature_id"], e["colour"]) == ("creature_checkin", "leaf_friend", "green")


def test_community_creature_checkin_logs_the_community_id(db, monkeypatch):
    db.rows["students"][0]["active_creatures"] = {"green": "sub-abc"}
    db.rows["creature_submissions"] = [{"id": "sub-abc", "status": "approved", "visibility_scope": "classroom"}]
    monkeypatch.setattr(S, "_progress_community_creature", lambda sid, cid: {
        "id": cid, "name": "X", "emotion_colour": "green", "stage1_url": None, "stage2_url": None, "stage3_url": None, "stage4_url": None,
        "current_stage": 0, "eligible_stage": 0, "evolution_ready": False, "evolved": False, "is_complete": False, "total_checkins": 1})
    checkin(checkin_log_id="log1")
    assert [(e["event_type"], e["creature_id"]) for e in db.events()] == [("creature_checkin", "sub-abc")]


def test_repeated_checkin_and_strategy_or_comment_topups_log_nothing(db):
    checkin(checkin_log_id="log1")
    assert len(db.events()) == 1
    checkin(checkin_log_id="log1")                                    # same check-in submitted again
    checkin(points_type="strategy", strategy_count=1)
    checkin(points_type="comment")
    assert len(db.events()) == 1


def test_shop_off_auto_evolve_logs_stage_and_completion_only_at_the_last_stage(db, monkeypatch):
    monkeypatch.setattr(S, "_is_shop_enabled_for_student", lambda *_a: False)
    db.rows["student_rewards"] = [{"student_id": "stu1", "creature_points": {"leaf_friend": 20}, "creature_stages": {"leaf_friend": 0},
                                   "total_points_earned": 20, "streak_days": 0, "last_checkin_date": None}]
    out = checkin(checkin_log_id="log1")
    assert out["evolved"] is True
    kinds = [(e["event_type"], e.get("stage")) for e in db.events()]
    assert ("creature_checkin", None) in kinds and ("creature_stage", out["current_stage"]) in kinds
    assert not any(k == "creature_complete" for k, _ in kinds)         # not the last stage yet
    # now a check-in that reaches the last stage
    db.inserts.clear()
    db.rows["student_rewards"][0].update({"creature_points": {"leaf_friend": 119}, "creature_stages": {"leaf_friend": 2}})
    out = checkin(checkin_log_id="log2")
    assert out["current_stage"] == 3
    assert [(e["event_type"], e.get("stage")) for e in db.events() if e["event_type"] != "creature_checkin"] == [("creature_stage", 3), ("creature_complete", 3)]


def test_shop_on_check_in_that_only_makes_evolution_ready_logs_no_stage_event(db):
    db.rows["student_rewards"] = [{"student_id": "stu1", "creature_points": {"leaf_friend": 119}, "creature_stages": {"leaf_friend": 2},
                                   "total_points_earned": 0, "streak_days": 0, "last_checkin_date": None}]
    out = checkin(checkin_log_id="log1")
    assert out["evolution_ready"] is True and out["evolved"] is False
    assert [e["event_type"] for e in db.events()] == ["creature_checkin"]


def test_explicit_evolve_of_a_default_creature_logs_stage_and_completion(db):
    db.rows["student_rewards"] = [{"student_id": "stu1", "creature_points": {"aqua_buddy": 60}, "creature_stages": {"aqua_buddy": 0}}]
    asyncio.run(S.evolve_creature("stu1", S.EvolveRequest(creature_id="aqua_buddy"), object()))
    [e] = db.events()
    assert (e["event_type"], e["creature_id"], e["colour"], e["stage"]) == ("creature_stage", "aqua_buddy", "blue", 2)
    db.inserts.clear()
    db.rows["student_rewards"][0].update({"creature_points": {"aqua_buddy": 120}, "creature_stages": {"aqua_buddy": 2}})
    asyncio.run(S.evolve_creature("stu1", S.EvolveRequest(creature_id="aqua_buddy"), object()))
    assert [(e["event_type"], e["stage"]) for e in db.events()] == [("creature_stage", 3), ("creature_complete", 3)]


def test_community_stage_unlock_logs_stage_and_completion_at_stage_4(db):
    db.rows["creature_submissions"] = [{"id": "sub1", "creature_name": "Petal", "emotion_colour": "blue", "stage4_url": "u", "global_uses": 0}]
    S._commit_community_evolution("stu1", "sub1", 2)
    assert [(e["event_type"], e["creature_id"], e["colour"], e["stage"]) for e in db.events()] == [("creature_stage", "sub1", "blue", 2)]
    db.inserts.clear()
    S._commit_community_evolution("stu1", "sub1", 4)
    assert [(e["event_type"], e["stage"]) for e in db.events()] == [("creature_stage", 4), ("creature_complete", 4)]


def test_logging_failure_never_breaks_or_slows_the_user_action(db, monkeypatch):
    db.fail_insert.add("engagement_events")                           # e.g. the new columns do not exist yet
    out = checkin(checkin_log_id="log1")                              # the check-in itself still succeeds
    assert out["points_added"] >= 0 and db.events() == []
    class Boom:
        def submit(self, *a): raise RuntimeError("pool down")
    monkeypatch.setattr(S, "_creature_event_pool", Boom())
    S._log_creature_event("stu1", "creature_checkin", "leaf_friend")   # does not raise
    assert checkin(checkin_log_id="log2")["points_added"] >= 0


def test_the_real_pool_does_not_run_the_work_on_the_request_thread(monkeypatch):
    import threading
    seen = []
    monkeypatch.setattr(S, "_log_creature_event_sync", lambda *a, **k: seen.append(threading.current_thread().name))
    S._log_creature_event("stu1", "creature_checkin", "leaf_friend")
    S._creature_event_pool.shutdown(wait=True)
    assert seen and seen[0].startswith("creature-event")
    monkeypatch.setattr(S, "_creature_event_pool", S.ThreadPoolExecutor(max_workers=2, thread_name_prefix="creature-event"))


def test_clients_cannot_write_these_events_through_the_public_log_endpoint():
    assert not set(S.CREATURE_EVENT_TYPES) & set(S.ENGAGEMENT_EVENT_TYPES)
