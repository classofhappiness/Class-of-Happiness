"""One timestamp parser for every value read back from Supabase/PostgREST.

Postgres strips trailing zeros from the fractional seconds ('...:31.75013+00:00'), and
datetime.fromisoformat() before Python 3.11 only accepts 0, 3 or 6 fractional digits - anything
else raises ValueError. fromiso() accepts any fraction length (1+ digits, padded/cut to 6), a
trailing Z / +00 / +0000 / +00:00 (or any other offset), a 'T' or space separator, no timezone
(treated as UTC) and a bare date. Always returns a timezone-aware datetime, or raises ValueError.
"""
import re
from datetime import datetime, timezone

_TS_RE = re.compile(
    r"^(\d{4}-\d{2}-\d{2})"
    r"(?:[T ](\d{2}:\d{2})(?::(\d{2}))?(?:[.,](\d+))?)?"
    r"\s*(Z|z|[+-]\d{2}(?::?\d{2})?)?$"
)

def fromiso(value) -> datetime:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if value is None:
        raise ValueError("no timestamp")
    m = _TS_RE.match(str(value).strip())
    if not m:
        raise ValueError(f"unparseable timestamp: {str(value)[:40]!r}")
    date, hm, sec, frac, tz = m.groups()
    s = f"{date}T{hm or '00:00'}:{sec or '00'}"
    if frac:
        s += "." + (frac + "000000")[:6]
    if not tz or tz in ("Z", "z"):
        s += "+00:00"
    else:
        digits = tz[1:].replace(":", "")
        s += f"{tz[0]}{digits[:2]}:{digits[2:4] or '00'}"
    return datetime.fromisoformat(s)

def fromiso_or_none(value):
    """Aware datetime, or None when missing/unparseable."""
    try:
        return fromiso(value) if value else None
    except (ValueError, TypeError):
        return None
