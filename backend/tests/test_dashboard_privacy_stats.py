"""Superadmin dashboard (/admin/stats) privacy rules: groups under 5 are suppressed on the server, distinct children (not check-ins)
decide whether a helper is shown, test accounts are left out of every number, no names. Offline (fake Supabase). Run from backend/:
    python3 -m pytest tests/test_dashboard_privacy_stats.py
"""
import asyncio
import inspect
import os
import re
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import pytest
import server as S


# ---------- pure rules ----------
@pytest.mark.parametrize("n,out", [(0, "fewer than 5"), (1, "fewer than 5"), (4, "fewer than 5"), (5, 5), (130, 130), ("no data yet", "no data yet")])
def test_suppress(n, out):
    assert S._suppress(n) == out


def test_top_helper_counts_distinct_children_not_checkins():
    one_kid_many_times = [("kid1", ["b6"])] * 50          # 50 check-ins, one child
    assert S._top_helper(one_kid_many_times) is None
    four = [(f"k{i}", ["b6"]) for i in range(4)]
    assert S._top_helper(four) is None                                # 4 children: still under 5
    five = four + [("k4", ["b6"])]
    name, n = S._top_helper(five)
    assert n == 5 and name == S.STRATEGY_NAME_MAP["b6"]


def test_top_helper_picks_the_one_with_most_children_and_never_names_custom_strategies():
    rows = [(f"k{i}", ["b6", "9f1c2d3e-1111-2222-3333-444455556666"]) for i in range(8)]
    rows += [(f"j{i}", ["b2"]) for i in range(5)]
    name, n = S._top_helper(rows)
    assert n == 8 and name == S.STRATEGY_NAME_MAP["b6"]
    only_custom = [(f"k{i}", ["9f1c2d3e-1111-2222-3333-444455556666"]) for i in range(9)]
    assert S._top_helper(only_custom) is None                          # a custom strategy is somebody's own wording


def test_helper_share_needs_five_children_and_shows_n():
    assert S._helper_share([("a", True), ("b", False)]) is None
    rows = [(f"k{i}", i % 2 == 0) for i in range(6)]
    assert S._helper_share(rows) == (50, 6)
    many_one_child = [("k1", True)] * 100
    assert S._helper_share(many_one_child) is None


# ---------- fake database ----------
class _Table:
    def __init__(self, db, name): self.db, self.name, self.f = db, name, []; self.cols = "*"; self.cnt = False; self.rng = None
    def select(self, cols="*", count=None): self.cols, self.cnt = cols, bool(count); return self
    def eq(self, k, v): self.f.append(lambda r: r.get(k) == v); return self
    def neq(self, k, v): self.f.append(lambda r: r.get(k) != v); return self
    def in_(self, k, vs): vs = set(vs); self.f.append(lambda r: r.get(k) in vs); return self
    def gte(self, k, v): self.f.append(lambda r: (r.get(k) or "") >= v); return self
    def lte(self, k, v): self.f.append(lambda r: (r.get(k) or "") <= v); return self
    def is_(self, k, v): self.f.append(lambda r: r.get(k) is None); return self
    @property
    def not_(self): return self
    def order(self, *a, **k): return self
    def limit(self, n): return self
    def range(self, a, b): self.rng = (a, b); return self
    def execute(self):
        rows = [r for r in self.db.rows.get(self.name, []) if all(f(r) for f in self.f)]
        total = len(rows)
        if self.rng: rows = rows[self.rng[0]:self.rng[1] + 1]
        out = type("R", (), {})()
        out.data = [dict(r) for r in rows]
        out.count = total if self.cnt else None
        return out


class _DB:
    def __init__(self): self.rows = {}; self.names_requested = []
    def table(self, name): return _Table(self, name)


TEST_TEACHER = "user_0e4a05d60288"
MONTH_AGO = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()


@pytest.fixture
def db(monkeypatch):
    d = _DB()
    d.rows["users"] = [{"user_id": "root", "role": "superadmin"}, {"user_id": "t1", "role": "teacher"}, {"user_id": "t2", "role": "teacher"},
                       {"user_id": TEST_TEACHER, "role": "teacher"}, {"user_id": "user_1c63245ecbf5", "role": "teacher"},
                       {"user_id": "44bf76b1-c0ee-49d5-bc68-3e47bb5cf8b3", "role": "school_admin"},
                       {"user_id": "p1", "role": "parent"}, {"user_id": "p2", "role": "parent"}]
    d.rows["classrooms"] = [{"id": "c-test", "user_id": TEST_TEACHER}, {"id": "c-real", "user_id": "t1"}]
    d.rows["students"] = ([{"id": f"r{i}", "user_id": "t1", "classroom_id": "c-real"} for i in range(6)] +
                          [{"id": f"x{i}", "user_id": None, "classroom_id": "c-test"} for i in range(10)])   # 10 demo children
    d.rows["family_members"] = [{"id": "fm-real", "user_id": "p1"}, {"id": "fm-test", "user_id": "user_1c63245ecbf5"}]
    recent = (datetime.now(timezone.utc) - timedelta(days=2)).isoformat()
    logs = []
    for i in range(6):   # six real children, each with a b6 check-in
        logs.append({"student_id": f"r{i}", "family_member_id": None, "feeling_colour": "blue", "helpers_selected": ["b6"], "logged_by": "student", "timestamp": recent})
    logs.append({"student_id": "r0", "family_member_id": None, "feeling_colour": "red", "helpers_selected": [], "logged_by": "student", "timestamp": recent})
    for i in range(10):  # demo children, many check-ins with another helper: must not count
        logs.append({"student_id": f"x{i}", "family_member_id": None, "feeling_colour": "green", "helpers_selected": ["b2"], "logged_by": "parent", "timestamp": recent})
    d.rows["feeling_logs"] = logs
    d.rows["family_zone_logs"] = [{"user_id": "p1"}] * 3 + [{"user_id": "user_1c63245ecbf5"}] * 40
    d.rows["parent_links"] = [{"parent_user_id": "p1", "student_id": "r0"}, {"parent_user_id": "p2", "student_id": "r1"},
                              {"parent_user_id": TEST_TEACHER, "student_id": "r2"}, {"parent_user_id": "p3", "student_id": "x1"}]
    d.rows["creature_unlocks"] = [{"student_id": "r1", "real_student_id": "r1"}, {"student_id": "x1", "real_student_id": "x1"}]
    d.rows["student_rewards"] = [{"student_id": f"r{i}", "current_creature_id": "aqua_buddy", "creature_stages": {"aqua_buddy": 1}, "creature_points": {"aqua_buddy": 30}} for i in range(6)] + \
                                [{"student_id": f"x{i}", "current_creature_id": "aqua_buddy", "creature_stages": {"aqua_buddy": 3}, "creature_points": {"aqua_buddy": 200}} for i in range(10)]
    monkeypatch.setattr(S, "supabase", d)
    return d


def stats(monkeypatch, role="superadmin"):
    async def user(_r): return {"user_id": "root", "role": role}
    monkeypatch.setattr(S, "get_current_user", user)
    return asyncio.run(S.get_admin_stats(object(), days=7))


def test_home_checkins_and_linked_families_are_suppressed_under_five(db, monkeypatch):
    out = S._platform_privacy_stats_sync(*S._stats_excluded_children_sync(), MONTH_AGO)
    assert out["home_checkins_total"] == "fewer than 5"    # 3 real family logs; the 10 demo parent logs and 40 tester logs are left out
    assert out["linked_families"] == "fewer than 5"        # p1 and p2 only: demo teacher's link, the demo child's link are left out


def test_home_checkins_counted_once_over_five(db, monkeypatch):
    db.rows["family_zone_logs"] += [{"user_id": "p2"}] * 4
    out = S._platform_privacy_stats_sync(*S._stats_excluded_children_sync(), MONTH_AGO)
    assert out["home_checkins_total"] == 7                 # 3 + 4, still none of the test accounts' 50


def test_test_accounts_are_left_out_of_helper_numbers(db, monkeypatch):
    out = S._platform_privacy_stats_sync(*S._stats_excluded_children_sync(), MONTH_AGO)
    assert out["top_strategy"] == S.STRATEGY_NAME_MAP["b6"]     # the demo children's "b2" never shows
    assert out["helper_chosen_share"] == "86% of 7 check-ins"               # 6 of 7 real check-ins had a helper


def test_helper_numbers_say_why_when_suppressed(db, monkeypatch):
    db.rows["feeling_logs"] = [l for l in db.rows["feeling_logs"] if l["student_id"] in ("r0", "r1", "r2")]
    out = S._platform_privacy_stats_sync(*S._stats_excluded_children_sync(), MONTH_AGO)
    assert out["top_strategy"] == "fewer than 5 children" and out["helper_chosen_share"] == "fewer than 5 children"
    db.rows["feeling_logs"] = []
    out = S._platform_privacy_stats_sync(*S._stats_excluded_children_sync(), MONTH_AGO)
    assert out["top_strategy"] == "no data yet" and out["helper_chosen_share"] == "no data yet"


def test_starter_creatures_started_is_suppressed_and_excludes_demo_children(db, monkeypatch):
    out = S._platform_privacy_stats_sync(*S._stats_excluded_children_sync(), MONTH_AGO)
    assert out["starter_creatures_started"] == 6           # 6 real children on aqua_buddy; the 10 demo children are left out
    db.rows["student_rewards"] = db.rows["student_rewards"][:3]
    out = S._platform_privacy_stats_sync(*S._stats_excluded_children_sync(), MONTH_AGO)
    assert out["starter_creatures_started"] == "fewer than 5"


def test_admin_stats_excludes_test_accounts_from_every_count(db, monkeypatch):
    out = stats(monkeypatch)
    assert out["total_students"] == 6                      # 16 children; 10 are in the demo teacher's classroom
    assert out["total_users"] == 5                         # 8 accounts minus the three test and demo ones
    assert out["total_teachers"] == 2                      # t1, t2 (the demo teacher, tester and demo admin are left out)
    assert out["total_checkins"] == 7                      # the 10 demo-child check-ins are left out
    assert out["total_creatures"] == 1                     # community creatures only; the demo child's unlock is left out
    assert out["home_checkins_total"] == "fewer than 5"
    assert out["linked_families"] == "fewer than 5"
    assert out["top_strategy"] == S.STRATEGY_NAME_MAP["b6"]
    assert out["helper_chosen_share"] == "86% of 7 check-ins"
    assert out["starter_creatures_started"] == 6


def test_admin_stats_placeholders_say_something_and_invent_nothing(db, monkeypatch):
    out = stats(monkeypatch)
    assert out["avg_checkins_to_evolve"] == "Not enough data yet"
    assert out["top_teacher_strategy"] == "Not enough teachers yet"
    for k in ("home_checkins_total", "linked_families", "top_strategy", "top_teacher_strategy", "avg_checkins_to_evolve",
              "helper_chosen_share", "starter_creatures_started"):
        assert out[k] not in ("—", "-", None, 0, "")


def test_a_school_admin_view_does_not_get_platform_numbers(db, monkeypatch):
    db.rows["users"].append({"user_id": "sa1", "role": "school_admin"})
    async def user(_r): return {"user_id": "sa1", "role": "school_admin", "school_name": "X"}
    monkeypatch.setattr(S, "get_current_user", user)
    out = asyncio.run(S.get_admin_stats(object(), days=7))
    assert out["home_checkins_total"] == "no data yet" and out["linked_families"] == "no data yet"


def test_no_names_or_ids_in_the_response(db, monkeypatch):
    text = repr(stats(monkeypatch))
    for banned in ("student_name", "user_0e4a05d60288", "user_1c63245ecbf5", "fm-real", "'r0'", "'x1'"):
        assert banned not in text, banned


def test_student_name_is_never_selected_from_student_alerts_in_stats_code():
    src = inspect.getsource(S)
    for m in re.finditer(r'table\("student_alerts"\)\.select\(("[^"]*")', src):
        cols = m.group(1)
        assert "student_name" not in cols, cols


def test_debug_dump_still_returns_alerts_without_names(db, monkeypatch):
    db.rows["student_alerts"] = [{"id": "a1", "student_id": "r0", "alert_type": "zone_alert", "created_at": "2026-11-10", "resolved": False, "student_name": "SHOULD NOT APPEAR"}]
    db.rows["classrooms"] = db.rows.get("classrooms", [])
    async def user(_r): return {"user_id": "root", "role": "superadmin"}
    monkeypatch.setattr(S, "get_current_user", user)
    class T2(_Table):
        def execute(self):
            r = super().execute()
            if self.name == "student_alerts":      # a real select only returns the columns asked for
                wanted = [c.strip() for c in self.cols.split(",")]
                r.data = [{k: v for k, v in row.items() if k in wanted} for row in r.data]
            return r
    db.table = lambda name: T2(db, name)
    out = asyncio.run(S.debug_student_classrooms(object()))
    assert "error" not in out and len(out["recent_alerts"]) == 1
    assert "student_name" not in out["recent_alerts"][0]


def test_support_requests_last_30_days_suppressed_excluding_test_accounts(db, monkeypatch):
    recent = (datetime.now(timezone.utc) - timedelta(days=3)).isoformat()
    old = (datetime.now(timezone.utc) - timedelta(days=60)).isoformat()
    db.rows["support_requests"] = [{"student_id": "r0", "requested_by": "t1", "created_at": recent}] * 3 + \
                                  [{"student_id": "x1", "requested_by": TEST_TEACHER, "created_at": recent}] * 9 + \
                                  [{"student_id": "r1", "requested_by": "t1", "created_at": old}] * 9
    assert stats(monkeypatch)["support_requests"] == "fewer than 5"        # 3 real in the window; 9 demo and 9 too old are left out
    db.rows["support_requests"] += [{"student_id": "r2", "requested_by": "t1", "created_at": recent}] * 4
    assert stats(monkeypatch)["support_requests"] == 7


def test_support_requests_is_never_a_hardcoded_zero(db, monkeypatch):
    assert stats(monkeypatch)["support_requests"] == "fewer than 5"        # no requests at all: not a bare 0
