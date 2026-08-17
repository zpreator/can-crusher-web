import os

from flask import Flask, jsonify, request, render_template

from db import get_conn, init_db
from timestamps import resolve_event_time, utcnow_iso

API_KEY = os.environ.get("PICO_API_KEY", "")
VALID_TYPES = ("reed", "manual")

app = Flask(__name__)
init_db()


def require_api_key():
    key = request.headers.get("X-API-Key", "")
    return API_KEY and key == API_KEY


def validate_event(raw, index):
    """Returns (cleaned_dict, error_string_or_None)."""
    if not isinstance(raw, dict):
        return None, f"index {index}: not an object"

    ev_type = raw.get("type")
    if ev_type not in VALID_TYPES:
        return None, f"index {index}: invalid type"

    delta = raw.get("delta")
    if not isinstance(delta, int) or isinstance(delta, bool) or delta not in (1, -1):
        return None, f"index {index}: invalid delta"

    source_ts = raw.get("source_ts")
    if source_ts is not None and not isinstance(source_ts, str):
        return None, f"index {index}: invalid source_ts"

    note = raw.get("note", "")
    if not isinstance(note, str):
        return None, f"index {index}: invalid note"

    return {
        "type": ev_type,
        "delta": delta,
        "source_ts": source_ts,
        "note": note,
    }, None


@app.route("/events", methods=["POST"])
def post_events():
    if not require_api_key():
        return jsonify({"error": "unauthorized"}), 401

    body = request.get_json(silent=True)
    if not isinstance(body, list):
        return jsonify({"error": "body must be a JSON array"}), 400

    accepted = 0
    rejected = 0
    errors = []

    with get_conn() as conn:
        for i, raw in enumerate(body):
            cleaned, err = validate_event(raw, i)
            if err:
                rejected += 1
                errors.append(err)
                continue

            received_at = utcnow_iso()
            event_time, resolved_note = resolve_event_time(
                cleaned["source_ts"], cleaned["note"], received_at
            )

            conn.execute(
                "INSERT INTO events (received_at, source_ts, event_time, type, delta, note) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (
                    received_at,
                    cleaned["source_ts"],
                    event_time,
                    cleaned["type"],
                    cleaned["delta"],
                    resolved_note,
                ),
            )
            accepted += 1
        conn.commit()

        count = conn.execute(
            "SELECT COALESCE(SUM(delta), 0) AS total FROM events"
        ).fetchone()["total"]

    result = {"accepted": accepted, "rejected": rejected, "count": count}
    if errors:
        result["errors"] = errors
    return jsonify(result), 200


@app.route("/status", methods=["GET"])
def get_status():
    with get_conn() as conn:
        count = conn.execute(
            "SELECT COALESCE(SUM(delta), 0) AS total FROM events"
        ).fetchone()["total"]
        last = conn.execute(
            "SELECT event_time FROM events ORDER BY id DESC LIMIT 1"
        ).fetchone()

    last_event_at = last["event_time"] if last else None
    return jsonify({"count": count, "last_event_at": last_event_at})


@app.route("/events.json", methods=["GET"])
def get_events_json():
    since = request.args.get("since")
    limit = request.args.get("limit")

    query = "SELECT id, event_time, type, delta, note FROM events"
    params = []
    if since:
        query += " WHERE event_time >= ?"
        params.append(since)
    query += " ORDER BY event_time ASC"
    if limit:
        try:
            query += " LIMIT ?"
            params.append(int(limit))
        except ValueError:
            pass

    with get_conn() as conn:
        rows = conn.execute(query, params).fetchall()

    return jsonify([dict(r) for r in rows])


@app.route("/admin/adjust", methods=["POST"])
def admin_adjust():
    """Server-side-only reset/set-count control (see spec's scope cuts).

    Inserts a single corrective 'manual' event so the target count is
    reached. This only changes the server's stored total/history — the
    Pico's own physical counter/display is untouched until it next
    reboots and re-seeds itself from GET /status.
    """
    if not require_api_key():
        return jsonify({"error": "unauthorized"}), 401

    body = request.get_json(silent=True) or {}
    target = body.get("target")
    if not isinstance(target, int) or isinstance(target, bool):
        return jsonify({"error": "target must be an integer"}), 400

    with get_conn() as conn:
        current = conn.execute(
            "SELECT COALESCE(SUM(delta), 0) AS total FROM events"
        ).fetchone()["total"]
        adjustment = target - current

        received_at = utcnow_iso()
        if adjustment != 0:
            conn.execute(
                "INSERT INTO events (received_at, source_ts, event_time, type, delta, note) "
                "VALUES (?, NULL, ?, 'manual', ?, 'admin_adjust')",
                (received_at, received_at, adjustment),
            )
            conn.commit()

        count = conn.execute(
            "SELECT COALESCE(SUM(delta), 0) AS total FROM events"
        ).fetchone()["total"]

    return jsonify({"count": count})


def _asset_version(filename):
    path = os.path.join(app.static_folder, filename)
    try:
        return int(os.path.getmtime(path))
    except OSError:
        return 0


@app.route("/", methods=["GET"])
def dashboard():
    return render_template(
        "index.html",
        css_version=_asset_version("style.css"),
        js_version=_asset_version("dashboard.js"),
    )


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=3000, debug=False)
