# System Health — SuperAdmin Tab

Detailed plan for the **System Health** tab: what to show, which charts to use, and how to wire data.

---

## 1. Overview / Status Summary (top of page)

| Block | Description | Chart / UI |
|-------|-------------|-----------|
| **Overall status** | Single badge: Healthy / Degraded / Down | Status pill + short message |
| **API status** | Backend reachable (e.g. `/health` ping) | Green/red indicator + last check time |
| **Database status** | Supabase connectivity (e.g. one simple query) | Green/red indicator + latency (ms) |
| **Uptime** | Process or server uptime (if available) | Plain text e.g. "14d 6h" |

**Layout:** One horizontal strip of 4 small cards with icons (Activity, Server, Database, Clock).

---

## 2. Server & API Health

| Metric | Description | Chart type | Data shape |
|--------|-------------|------------|------------|
| **API latency (ms)** | Response time of a health/ping endpoint over time | **Line chart** (time on X, ms on Y) | `[{ time, latency }]` |
| **API availability** | Success vs failure of health checks (e.g. every 1 min) | **Area or line** (success rate % or count) | `[{ time, success, failed }]` |
| **Requests per minute** | Count of requests to API (if you have a simple counter or log aggregation) | **Bar chart** or **line** (time buckets) | `[{ time, count }]` |

**Layout:** One card "API health" with a **line chart** (latency over last 24h or 7d) and optional small **bar chart** (requests per hour).

---

## 3. Resource Metrics (server / process)

| Metric | Description | Chart type | Data shape |
|--------|-------------|------------|------------|
| **CPU usage (%)** | Process or host CPU (if exposed; else mock for UI) | **Line chart** over time | `[{ time, cpu }]` |
| **Memory usage (%)** | Node process or host memory (if exposed) | **Line chart** over time | `[{ time, memory }]` |
| **Disk / storage** | Optional: free space or DB size growth | **Line** or single **gauge** | `[{ time, usedPercent }]` or one number |

**Layout:** One card "Resource usage" with **two lines** (CPU, Memory) in a single **LineChart** (same X axis, two Y series). Optional second card for disk with one **line** or a **radial/bar** gauge.

---

## 4. Database Health

| Metric | Description | Chart type | Data shape |
|--------|-------------|------------|------------|
| **Query latency (ms)** | Avg or p95 of a simple "SELECT 1" or count query over time | **Line chart** | `[{ time, latency }]` |
| **Connection pool** | Active vs idle connections (if Supabase/client exposes it) | **Stacked area** or **bar** | `[{ time, active, idle }]` |
| **Errors** | DB errors per time bucket (from logs or client) | **Bar chart** (count per hour) | `[{ time, errors }]` |

**Layout:** One card "Database" with **line chart** (query latency) and optional **bar chart** (errors).

---

## 5. Request & Error Metrics (application layer)

| Metric | Description | Chart type | Data shape |
|--------|-------------|------------|------------|
| **HTTP status distribution** | 2xx / 4xx / 5xx over time | **Stacked area** or **stacked bar** | `[{ time, ok, clientError, serverError }]` |
| **Error rate (%)** | 5xx or (4xx+5xx) / total per bucket | **Line chart** | `[{ time, errorRate }]` |
| **Slow requests** | Count of requests above a threshold (e.g. > 1s) | **Line** or **bar** | `[{ time, count }]` |

**Layout:** One card "Requests & errors" with **line** (error rate) + **stacked bar** (status distribution by hour).

---

## 6. Platform Activity (optional but useful)

| Metric | Description | Chart type | Data shape |
|--------|-------------|------------|------------|
| **Logins per day** | From Logs table (ActionType = Login) grouped by day | **Bar chart** | `[{ date, logins }]` |
| **Actions per day** | Create/Update/Delete etc. from Logs | **Line chart** (multiple series) or **bar** | `[{ date, creates, updates, deletes }]` |
| **Active users (last 24h)** | Distinct actors in Logs in last 24h | Single **number** or **sparkline** | number or `[{ hour, count }]` |

**Layout:** One card "Platform activity" with **bar chart** (logins per day) and **line** (actions over time).

---

## 7. Alerts & Incidents (optional)

| Block | Description | Chart / UI |
|-------|-------------|------------|
| **Active alerts** | List of triggered rules (e.g. CPU > 80%, error rate > 5%) | Table or list with time and message |
| **Recent incidents** | Downtime or degradation windows (if you store them) | Timeline or table |

**Layout:** One card "Alerts" (table) and optional "Incidents" (timeline).

---

## 8. Chart Library & Implementation Notes

- **Recharts** (already in project): use `LineChart`, `AreaChart`, `BarChart`, `ComposedChart`, `XAxis`, `YAxis`, `Tooltip`, `Legend`, `ResponsiveContainer`, `Cell` for colors.
- **Time axis:** X axis = time (last 24h or 7d), format with `tickFormatter` (e.g. "10:00", "Mon 12").
- **Colors:** Green = healthy, amber = warning, red = critical (e.g. latency > 500ms, CPU > 80%, error rate > 5%).
- **Refresh:** Poll a single endpoint e.g. `GET /api/admin/health` or `GET /api/admin/metrics` every 60s (or 5m for heavy data) to update numbers and chart data.
- **Backend:** Add `GET /api/admin/health` (or `/metrics`) that returns:
  - `status`, `apiLatency`, `dbLatency`, `uptime`
  - `series`: `{ cpu: [], memory: [], latency: [], requests: [], errors: [] }` for chart data (or return last 24h buckets from in-memory store / DB / external monitor).

---

## 9. Suggested Page Structure (order of sections)

1. **Status strip** — API, DB, uptime, overall.
2. **API health** — Line chart: latency over time; optional bar: requests/min.
3. **Resource usage** — Line chart: CPU + memory over time.
4. **Database** — Line chart: query latency; optional bar: errors.
5. **Requests & errors** — Line: error rate; stacked bar: 2xx/4xx/5xx.
6. **Platform activity** — Bar: logins per day; line: actions.
7. **Alerts** — Table of active alerts (if implemented).

---

## 10. Data Source Summary

| Section | Possible data source (backend) |
|---------|-------------------------------|
| API status | `GET /health` ping from frontend or cron; store last success/latency in memory or Redis |
| DB status | Supabase client: run `select 1` and measure time; store last result |
| CPU / memory | Node: `process.cpuUsage()`, `process.memoryUsage()`; or host metrics (e.g. Prometheus) if available |
| Latency / requests / errors | Middleware that records request count, status, duration per bucket (in-memory or DB); or use existing Logs table to derive counts |
| Logins / actions | Query `Logs` table by `ActionType`, `CreatedAt` grouped by day |

---

## 11. Implementation Tracking

| Item | Status | Backend | Frontend |
|------|--------|---------|----------|
| Status strip (API, DB, uptime) | Planned | `/api/admin/health` extended | Health.jsx |
| API latency line chart | Planned | Return `latencySeries[]` | LineChart |
| CPU / memory line chart | Planned | Return `cpuSeries[]`, `memorySeries[]` | LineChart |
| DB latency line chart | Planned | Return `dbLatencySeries[]` | LineChart |
| Error rate + status stacked bar | Planned | Return `requestSeries[]`, `errorRateSeries[]` | LineChart + BarChart |
| Logins / actions from Logs | Planned | Query Logs, return time buckets | BarChart, LineChart |
| Alerts table | Optional | Rules engine + store | Table |

This doc defines the full scope; implement in phases (e.g. status strip + one chart first, then add series and more charts).
