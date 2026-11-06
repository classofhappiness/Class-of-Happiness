import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from datetime import datetime, timezone, timedelta
from timeparse import fromiso, fromiso_or_none

UTC = timezone.utc

def test_fraction_lengths():
    base = "2026-11-05T14:05:31"
    for digits, micro in (("", 0), ("7", 700000), ("75", 750000), ("750", 750000), ("7501", 750100),
                          ("75013", 750130), ("750138", 750138), ("7501389", 750138)):
        for tz in ("+00:00", "Z", "+0000", "+00"):
            s = base + ("." + digits if digits else "") + tz
            assert fromiso(s) == datetime(2026, 11, 5, 14, 5, 31, micro, tzinfo=UTC), s

def test_3_5_and_6_digit_fractions_explicit():
    assert fromiso("2026-11-05T14:05:31.123+00:00").microsecond == 123000
    assert fromiso("2026-11-05T14:05:31.75013+00:00").microsecond == 750130   # the bug: 5 digits on Python < 3.11
    assert fromiso("2026-11-05T14:05:31.750138Z").microsecond == 750138

def test_other_offsets_and_forms():
    assert fromiso("2026-11-05T14:05:31+01:00") == datetime(2026, 11, 5, 13, 5, 31, tzinfo=UTC)
    assert fromiso("2026-11-05 14:05:31.5-05:30") == datetime(2026, 11, 5, 19, 35, 31, 500000, tzinfo=UTC)
    assert fromiso("2026-11-05T14:05:31") == datetime(2026, 11, 5, 14, 5, 31, tzinfo=UTC)   # no tz = UTC
    assert fromiso("2026-11-05T14:05") == datetime(2026, 11, 5, 14, 5, tzinfo=UTC)
    assert fromiso("2026-11-05") == datetime(2026, 11, 5, tzinfo=UTC)
    assert fromiso(datetime(2026, 11, 5, 1, 2, 3)) == datetime(2026, 11, 5, 1, 2, 3, tzinfo=UTC)

def test_result_is_aware_and_comparable():
    assert fromiso("2026-11-05T14:05:31.75013+00:00") < datetime.now(UTC) + timedelta(days=3650)

def test_garbage_raises_and_or_none():
    for bad in ("", "junk", "2026-13-45T00:00:00Z", "2026-11-05T25:00:00Z", None, "2026-11-05T14:05:31.+00:00"):
        try:
            fromiso(bad)
            assert False, bad
        except ValueError:
            pass
        assert fromiso_or_none(bad) is None

if __name__ == "__main__":
    for n, f in list(globals().items()):
        if n.startswith("test_"):
            f(); print("ok", n)
