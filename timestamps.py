"""Timestamp resolution rule for incoming Pico events.

The Pico's onboard clock has a documented history of resetting to
2021-01-01 on failed WiFi/NTP sync, so it cannot be trusted as the
timestamp authority. This module implements the resolution rule from
the spec: prefer the Pico's source_ts only when it looks sane and
recent; otherwise fall back to the server's own receive-time clock.
"""
from datetime import datetime, timezone, timedelta

SOURCE_TS_FORMAT = "%Y-%m-%d %H:%M:%S"
MAX_SKEW = timedelta(days=3)
MIN_SANE_YEAR = 2022


def utcnow_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_source_ts(source_ts):
    """Returns a naive UTC datetime, or None if unparseable/absent."""
    if not source_ts:
        return None
    try:
        return datetime.strptime(source_ts, SOURCE_TS_FORMAT)
    except (ValueError, TypeError):
        return None


def parse_iso(iso_str):
    return datetime.strptime(iso_str, "%Y-%m-%dT%H:%M:%SZ")


def add_note_flag(note, flag):
    flags = [f for f in (note or "").split(";") if f]
    if flag not in flags:
        flags.append(flag)
    return ";".join(flags)


def has_flag(note, flag):
    return flag in (note or "").split(";")


def resolve_event_time(source_ts, note, received_at_iso):
    """Returns (event_time_iso, resolved_note)."""
    received_at_dt = parse_iso(received_at_iso)
    src_dt = parse_source_ts(source_ts)

    if (
        src_dt is not None
        and not has_flag(note, "unsynced")
        and src_dt.year >= MIN_SANE_YEAR
        and abs(received_at_dt - src_dt) <= MAX_SKEW
    ):
        event_time = src_dt.strftime("%Y-%m-%dT%H:%M:%SZ")
        return event_time, (note or "")

    resolved_note = add_note_flag(note, "estimated_time")
    return received_at_iso, resolved_note
