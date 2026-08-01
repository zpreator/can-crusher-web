"""One-time import of historical crush data from CanCrusher/crushes_corrected.csv.

Throwaway script, not a permanent code path. CSV header:
timestamp,type,delta,note

Per spec: this data has already been through one round of manual date
correction, so event_time = source_ts = the CSV timestamp verbatim -- the
timestamp resolution rule in timestamps.py is NOT re-applied here.

Usage: python migrations/import_csv.py path/to/crushes_corrected.csv
"""
import csv
import sys
from datetime import datetime

sys.path.insert(0, "/app")
from db import get_conn, init_db  # noqa: E402
from timestamps import utcnow_iso  # noqa: E402

TS_FORMATS = ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%dT%H:%M:%S")


def normalize_ts(raw):
    for fmt in TS_FORMATS:
        try:
            return datetime.strptime(raw.strip(), fmt).strftime("%Y-%m-%dT%H:%M:%SZ")
        except ValueError:
            continue
    raise ValueError(f"unrecognized timestamp format: {raw!r}")


def main(csv_path):
    init_db()
    imported_at = utcnow_iso()

    with open(csv_path, newline="") as f, get_conn() as conn:
        reader = csv.DictReader(f)
        n = 0
        for row in reader:
            event_time = normalize_ts(row["timestamp"])
            conn.execute(
                "INSERT INTO events (received_at, source_ts, event_time, type, delta, note) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (
                    imported_at,
                    event_time,
                    event_time,
                    row["type"].strip(),
                    int(row["delta"]),
                    row.get("note", "").strip(),
                ),
            )
            n += 1
        conn.commit()

    print(f"Imported {n} rows from {csv_path}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("usage: python migrations/import_csv.py path/to/crushes_corrected.csv")
        sys.exit(1)
    main(sys.argv[1])
