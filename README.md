# can-crusher-web

Server + dashboard for the [Can Crusher](https://github.com/zpreator/pico) Pico 2 W
project. Runs on a LAN machine and becomes the source of truth for crush history and
stats; the Pico is a thin client that counts/displays/plays sounds locally and
asynchronously reports events here.

LAN-only. No auth on read endpoints. `POST /events` requires a shared-secret header.

## Endpoints

- `POST /events` — body: JSON array of `{type, delta, source_ts?, note?}`. Requires
  header `X-API-Key: <PICO_API_KEY>`.
- `GET /status` — `{count, last_event_at}`.
- `GET /events.json` — full event list (optional `?since=`, `?limit=`).
- `GET /` — the dashboard.
- `POST /admin/adjust` — `{"target": <int>}`, requires `X-API-Key`. Inserts a single
  corrective `manual` event so the stored total becomes `target`. Only affects the
  server's history — the Pico's own display doesn't update until it next reboots and
  re-seeds from `GET /status`.

## Run locally

```
cp .env.example .env   # set PICO_API_KEY
docker compose up -d --build
```

Serves on `:3000` inside the container (compose maps host `3000:3000`; adjust the
host side if that port is already taken on the machine you deploy to).

## Importing historical data

One-time, throwaway script — not a permanent code path:

```
docker compose exec can-crusher-web python migrations/import_csv.py /path/to/crushes_corrected.csv
```

Expects CSV header `timestamp,type,delta,note`. Copies `type`/`delta`/`note` as-is and
sets both `source_ts` and `event_time` to the CSV timestamp verbatim (this data has
already been through manual date correction, so the server's timestamp-resolution
rule is intentionally not re-applied to it).

## Notes

- SQLite file lives at `/data/can-crusher.db` inside the container (`./data` on the
  host via the compose volume).
- Duplicate events (Pico resends a batch whose response it never saw) are accepted
  as a known, low-stakes edge case — no idempotency key in v1.
