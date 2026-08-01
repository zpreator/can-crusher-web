(function () {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";
  const CRUSH_GOAL = 500;
  const MARGIN = { top: 16, right: 14, bottom: 26, left: 34 };
  const VB_W = 640;
  const VB_H = 220;

  const tooltip = document.getElementById("tooltip");

  function showTooltip(html, clientX, clientY) {
    tooltip.innerHTML = html;
    tooltip.classList.add("visible");
    positionTooltip(clientX, clientY);
  }
  function positionTooltip(clientX, clientY) {
    const pad = 14;
    let left = clientX + pad;
    let top = clientY + pad;
    const rect = tooltip.getBoundingClientRect();
    if (left + rect.width > window.innerWidth - 8) left = clientX - rect.width - pad;
    if (top + rect.height > window.innerHeight - 8) top = clientY - rect.height - pad;
    tooltip.style.left = left + "px";
    tooltip.style.top = top + "px";
  }
  function hideTooltip() {
    tooltip.classList.remove("visible");
  }

  function svgEl(tag, attrs) {
    const node = document.createElementNS(SVG_NS, tag);
    if (attrs) {
      for (const k in attrs) node.setAttribute(k, attrs[k]);
    }
    return node;
  }

  function niceMax(max) {
    if (max <= 0) return 1;
    const exp = Math.floor(Math.log10(max));
    const base = Math.pow(10, exp);
    const norm = max / base;
    let niceNorm;
    if (norm <= 1) niceNorm = 1;
    else if (norm <= 2) niceNorm = 2;
    else if (norm <= 5) niceNorm = 5;
    else niceNorm = 10;
    return niceNorm * base;
  }

  function roundedTopBarPath(x, yTop, width, yBase, r) {
    const h = yBase - yTop;
    if (h < 1) return `M ${x} ${yBase} L ${x + width} ${yBase}`;
    r = Math.min(r, width / 2, h);
    return [
      `M ${x} ${yBase}`,
      `L ${x} ${yTop + r}`,
      `Q ${x} ${yTop} ${x + r} ${yTop}`,
      `L ${x + width - r} ${yTop}`,
      `Q ${x + width} ${yTop} ${x + width} ${yTop + r}`,
      `L ${x + width} ${yBase}`,
      "Z",
    ].join(" ");
  }

  function emptyState(container, message) {
    container.innerHTML = "";
    const div = document.createElement("div");
    div.style.cssText =
      "height:160px;display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:13px;";
    div.textContent = message;
    container.appendChild(div);
  }

  // ---- bar chart -----------------------------------------------------

  function renderBarChart(container, { labels, values, colorVar, valueFmt, tooltipLabelFmt }) {
    container.innerHTML = "";
    if (!values.length) return emptyState(container, "No data yet");

    const svg = svgEl("svg", {
      class: "chart",
      viewBox: `0 0 ${VB_W} ${VB_H}`,
      role: "img",
    });

    const plotW = VB_W - MARGIN.left - MARGIN.right;
    const plotH = VB_H - MARGIN.top - MARGIN.bottom;
    const maxVal = niceMax(Math.max(...values, 1));
    const yBase = MARGIN.top + plotH;
    const color = `var(${colorVar})`;

    // gridlines + y ticks
    const ticks = 4;
    for (let i = 0; i <= ticks; i++) {
      const v = (maxVal / ticks) * i;
      const y = yBase - (v / maxVal) * plotH;
      svg.appendChild(
        svgEl("line", { x1: MARGIN.left, x2: VB_W - MARGIN.right, y1: y, y2: y, class: "gridline" })
      );
      const label = svgEl("text", { x: MARGIN.left - 6, y: y + 3, class: "axis-label", "text-anchor": "end" });
      label.textContent = Math.round(v);
      svg.appendChild(label);
    }
    svg.appendChild(svgEl("line", { x1: MARGIN.left, x2: VB_W - MARGIN.right, y1: yBase, y2: yBase, class: "baseline" }));

    const n = values.length;
    const band = plotW / n;
    const barW = Math.min(24, band - 8);

    values.forEach((v, i) => {
      const cx = MARGIN.left + band * i + band / 2;
      const x = cx - barW / 2;
      const barH = (v / maxVal) * plotH;
      const yTop = yBase - barH;

      const hit = svgEl("rect", {
        x: MARGIN.left + band * i,
        y: MARGIN.top,
        width: band,
        height: plotH,
        fill: "transparent",
      });

      const bar = svgEl("path", { d: roundedTopBarPath(x, yTop, barW, yBase, 4), fill: color });

      hit.addEventListener("pointerenter", onHover);
      hit.addEventListener("pointermove", onHover);
      hit.addEventListener("pointerleave", () => {
        bar.style.opacity = "1";
        hideTooltip();
      });
      function onHover(evt) {
        bar.style.opacity = "0.8";
        const lbl = tooltipLabelFmt ? tooltipLabelFmt(labels[i], i) : labels[i];
        showTooltip(
          `<div>${lbl}</div><div class="t-value">${valueFmt ? valueFmt(v) : v}</div>`,
          evt.clientX,
          evt.clientY
        );
      }

      svg.appendChild(bar);
      svg.appendChild(hit);

      const label = svgEl("text", {
        x: cx,
        y: yBase + 16,
        class: "axis-label",
        "text-anchor": "middle",
      });
      label.textContent = labels[i];
      svg.appendChild(label);
    });

    container.appendChild(svg);
  }

  // ---- line / area chart ----------------------------------------------

  function renderLineChart(container, { points, colorVar, xFormat, yFormat, yTooltipFormat, goalLine }) {
    container.innerHTML = "";
    if (!points.length) return emptyState(container, "No data yet");

    const svg = svgEl("svg", { class: "chart", viewBox: `0 0 ${VB_W} ${VB_H}`, role: "img" });

    const plotW = VB_W - MARGIN.left - MARGIN.right;
    const plotH = VB_H - MARGIN.top - MARGIN.bottom;
    const xMin = points[0].x;
    const xMax = points[points.length - 1].x;
    const xRange = Math.max(xMax - xMin, 1);
    let yMax = niceMax(Math.max(...points.map((p) => p.y), 1));
    if (goalLine && goalLine.value > yMax) yMax = niceMax(goalLine.value);
    const yBase = MARGIN.top + plotH;
    const color = `var(${colorVar})`;

    const xAt = (x) => MARGIN.left + ((x - xMin) / xRange) * plotW;
    const yAt = (y) => yBase - (y / yMax) * plotH;

    const ticks = 4;
    for (let i = 0; i <= ticks; i++) {
      const v = (yMax / ticks) * i;
      const y = yAt(v);
      svg.appendChild(
        svgEl("line", { x1: MARGIN.left, x2: VB_W - MARGIN.right, y1: y, y2: y, class: "gridline" })
      );
      const label = svgEl("text", { x: MARGIN.left - 6, y: y + 3, class: "axis-label", "text-anchor": "end" });
      label.textContent = yFormat ? yFormat(v) : Math.round(v);
      svg.appendChild(label);
    }
    svg.appendChild(svgEl("line", { x1: MARGIN.left, x2: VB_W - MARGIN.right, y1: yBase, y2: yBase, class: "baseline" }));

    if (goalLine) {
      const gy = yAt(goalLine.value);
      svg.appendChild(
        svgEl("line", {
          x1: MARGIN.left,
          x2: VB_W - MARGIN.right,
          y1: gy,
          y2: gy,
          stroke: "var(--text-muted)",
          "stroke-width": 1,
          "stroke-dasharray": "4 3",
        })
      );
      const lbl = svgEl("text", { x: VB_W - MARGIN.right, y: gy - 4, class: "axis-label", "text-anchor": "end" });
      lbl.textContent = goalLine.label;
      svg.appendChild(lbl);
    }

    const linePts = points.map((p) => `${xAt(p.x)},${yAt(p.y)}`).join(" ");
    const areaPts = `${xAt(xMin)},${yBase} ${linePts} ${xAt(xMax)},${yBase}`;

    svg.appendChild(svgEl("polygon", { points: areaPts, fill: color, opacity: "0.1", stroke: "none" }));
    svg.appendChild(
      svgEl("polyline", {
        points: linePts,
        fill: "none",
        stroke: color,
        "stroke-width": 2,
        "stroke-linejoin": "round",
        "stroke-linecap": "round",
      })
    );

    // x-axis labels (first, middle, last)
    [0, Math.floor(points.length / 2), points.length - 1].forEach((idx, i) => {
      const p = points[idx];
      const anchor = i === 0 ? "start" : i === 2 ? "end" : "middle";
      const label = svgEl("text", { x: xAt(p.x), y: yBase + 16, class: "axis-label", "text-anchor": anchor });
      label.textContent = xFormat ? xFormat(p.x) : new Date(p.x).toLocaleDateString();
      svg.appendChild(label);
    });

    const crosshair = svgEl("line", {
      x1: 0, x2: 0, y1: MARGIN.top, y2: yBase,
      stroke: "var(--text-muted)", "stroke-width": 1, opacity: 0,
    });
    const marker = svgEl("circle", { r: 4, fill: color, stroke: "var(--surface-1)", "stroke-width": 2, opacity: 0 });
    svg.appendChild(crosshair);
    svg.appendChild(marker);

    const overlay = svgEl("rect", {
      x: MARGIN.left, y: MARGIN.top, width: plotW, height: plotH, fill: "transparent",
    });
    overlay.addEventListener("pointermove", (evt) => {
      const rect = svg.getBoundingClientRect();
      const scale = VB_W / rect.width;
      const svgX = (evt.clientX - rect.left) * scale;
      const frac = Math.min(1, Math.max(0, (svgX - MARGIN.left) / plotW));
      const targetX = xMin + frac * xRange;
      let idx = 0;
      let best = Infinity;
      for (let i = 0; i < points.length; i++) {
        const d = Math.abs(points[i].x - targetX);
        if (d < best) { best = d; idx = i; }
      }
      const p = points[idx];
      const px = xAt(p.x);
      const py = yAt(p.y);
      crosshair.setAttribute("x1", px);
      crosshair.setAttribute("x2", px);
      crosshair.setAttribute("opacity", 1);
      marker.setAttribute("cx", px);
      marker.setAttribute("cy", py);
      marker.setAttribute("opacity", 1);
      const dateLbl = xFormat ? xFormat(p.x) : new Date(p.x).toLocaleString();
      const valLbl = yTooltipFormat ? yTooltipFormat(p.y) : p.y;
      showTooltip(`<div>${dateLbl}</div><div class="t-value">${valLbl}</div>`, evt.clientX, evt.clientY);
    });
    overlay.addEventListener("pointerleave", () => {
      crosshair.setAttribute("opacity", 0);
      marker.setAttribute("opacity", 0);
      hideTooltip();
    });
    svg.appendChild(overlay);

    container.appendChild(svg);
  }

  // ---- data helpers -----------------------------------------------------

  function isReed(e) { return e.type === "reed"; }

  function localDateKey(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function startOfDay(d) {
    const c = new Date(d);
    c.setHours(0, 0, 0, 0);
    return c;
  }

  const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  function mondayIndex(jsDay) { return (jsDay + 6) % 7; } // JS: 0=Sun..6=Sat -> 0=Mon..6=Sun

  function computeThisWeek(events) {
    const today = startOfDay(new Date());
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      days.push(d);
    }
    const sums = new Map(days.map((d) => [localDateKey(d), 0]));
    events.filter(isReed).forEach((e) => {
      const key = localDateKey(new Date(e.event_time));
      if (sums.has(key)) sums.set(key, sums.get(key) + e.delta);
    });
    return {
      labels: days.map((d) => d.toLocaleDateString(undefined, { weekday: "short" })),
      values: days.map((d) => sums.get(localDateKey(d))),
      tooltipLabels: days.map((d) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" })),
    };
  }

  function computeWeekdayAvg(events) {
    const reed = events.filter(isReed);
    if (!reed.length) return { labels: WEEKDAY_LABELS, values: WEEKDAY_LABELS.map(() => 0) };

    const sums = new Array(7).fill(0);
    reed.forEach((e) => {
      const d = new Date(e.event_time);
      sums[mondayIndex(d.getDay())] += e.delta;
    });

    let earliest = startOfDay(new Date(reed[0].event_time));
    reed.forEach((e) => {
      const d = startOfDay(new Date(e.event_time));
      if (d < earliest) earliest = d;
    });
    const today = startOfDay(new Date());

    const dayCounts = new Array(7).fill(0);
    for (let d = new Date(earliest); d <= today; d.setDate(d.getDate() + 1)) {
      dayCounts[mondayIndex(d.getDay())]++;
    }

    const values = sums.map((s, i) => (dayCounts[i] ? s / dayCounts[i] : 0));
    return { labels: WEEKDAY_LABELS, values };
  }

  function gaussianKde(sampleDays, evalPoints) {
    const n = sampleDays.length;
    const mean = sampleDays.reduce((a, b) => a + b, 0) / n;
    const variance = sampleDays.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(n - 1, 1);
    const sd = Math.sqrt(variance);
    let h = 1.06 * sd * Math.pow(n, -1 / 5);
    if (!h || h < 0.5) h = 0.5;

    return evalPoints.map((x) => {
      let sum = 0;
      for (let i = 0; i < n; i++) {
        const u = (x - sampleDays[i]) / h;
        sum += Math.exp(-0.5 * u * u);
      }
      const density = sum / (n * h * Math.sqrt(2 * Math.PI));
      return density * n; // rescale to ~crushes/day instead of a unit-area density
    });
  }

  function computeKde(events, months) {
    const now = new Date();
    const windowStart = new Date(now);
    windowStart.setMonth(windowStart.getMonth() - months);

    const reed = events
      .filter(isReed)
      .map((e) => new Date(e.event_time))
      .filter((d) => d >= windowStart && d <= now);

    if (!reed.length) return [];

    const dayMs = 86400000;
    const t0 = windowStart.getTime();
    const sampleDays = reed.map((d) => (d.getTime() - t0) / dayMs);

    const gridN = 200;
    const evalDays = Array.from({ length: gridN }, (_, i) => (i / (gridN - 1)) * ((now - windowStart) / dayMs));
    const densities = gaussianKde(sampleDays, evalDays);

    return evalDays.map((d, i) => ({ x: t0 + d * dayMs, y: Math.max(densities[i], 0) }));
  }

  function computeCumulative(events) {
    const reed = events.filter(isReed).slice().sort((a, b) => new Date(a.event_time) - new Date(b.event_time));
    let running = 0;
    return reed.map((e) => {
      running += e.delta;
      return { x: new Date(e.event_time).getTime(), y: running };
    });
  }

  function computeStreaks(events) {
    const dateSet = new Set(events.filter(isReed).map((e) => localDateKey(new Date(e.event_time))));
    if (!dateSet.size) return { current: 0, longest: 0 };

    let longest = 0;
    let running = 0;
    const sorted = Array.from(dateSet).sort();
    let prev = null;
    sorted.forEach((key) => {
      const d = new Date(key + "T00:00:00");
      if (prev && (d - prev) / 86400000 === 1) {
        running++;
      } else {
        running = 1;
      }
      longest = Math.max(longest, running);
      prev = d;
    });

    const today = startOfDay(new Date());
    let current = 0;
    let cursor = dateSet.has(localDateKey(today)) ? today : new Date(today.getTime() - 86400000);
    if (dateSet.has(localDateKey(cursor))) {
      while (dateSet.has(localDateKey(cursor))) {
        current++;
        cursor = new Date(cursor.getTime() - 86400000);
      }
    }
    return { current, longest };
  }

  // ---- boot ---------------------------------------------------------

  let allEvents = [];
  let kdeMonths = 1;

  async function fetchJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    return res.json();
  }

  function renderAll() {
    const week = computeThisWeek(allEvents);
    renderBarChart(document.getElementById("chart-week"), {
      labels: week.labels,
      values: week.values,
      colorVar: "--series-1",
      valueFmt: (v) => `${v} crushed`,
      tooltipLabelFmt: (_, i) => week.tooltipLabels[i],
    });

    const weekday = computeWeekdayAvg(allEvents);
    renderBarChart(document.getElementById("chart-weekday"), {
      labels: weekday.labels,
      values: weekday.values.map((v) => Math.round(v * 100) / 100),
      colorVar: "--series-3",
      valueFmt: (v) => `${v.toFixed(2)} / day avg`,
    });

    const kde = computeKde(allEvents, kdeMonths);
    renderLineChart(document.getElementById("chart-kde"), {
      points: kde,
      colorVar: "--series-1",
      xFormat: (t) => new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      yFormat: (v) => v.toFixed(1),
      yTooltipFormat: (v) => `${v.toFixed(2)} crushes/day (smoothed)`,
    });

    const cumulative = computeCumulative(allEvents);
    renderLineChart(document.getElementById("chart-cumulative"), {
      points: cumulative,
      colorVar: "--series-2",
      xFormat: (t) => new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "2-digit" }),
      yFormat: (v) => Math.round(v),
      yTooltipFormat: (v) => `${v} cans`,
      goalLine: { value: CRUSH_GOAL, label: `Goal: ${CRUSH_GOAL}` },
    });

    const streaks = computeStreaks(allEvents);
    document.getElementById("tile-streak").textContent = `${streaks.current} day${streaks.current === 1 ? "" : "s"}`;
    document.getElementById("tile-longest-streak").textContent = `${streaks.longest} day${streaks.longest === 1 ? "" : "s"}`;

    renderEventsTable(allEvents);
  }

  function renderEventsTable(events) {
    const tbody = document.getElementById("events-tbody");
    tbody.innerHTML = "";
    const sorted = events.slice().sort((a, b) => new Date(b.event_time) - new Date(a.event_time)).slice(0, 500);
    sorted.forEach((e) => {
      const tr = document.createElement("tr");

      const tTime = document.createElement("td");
      tTime.textContent = new Date(e.event_time).toLocaleString();
      tr.appendChild(tTime);

      const tType = document.createElement("td");
      tType.textContent = e.type;
      tType.className = e.type === "manual" ? "tag-manual" : "tag-reed";
      tr.appendChild(tType);

      const tDelta = document.createElement("td");
      tDelta.textContent = (e.delta > 0 ? "+" : "") + e.delta;
      tr.appendChild(tDelta);

      const tNote = document.createElement("td");
      tNote.textContent = e.note || "";
      tr.appendChild(tNote);

      tbody.appendChild(tr);
    });
  }

  async function load() {
    try {
      const [status, events] = await Promise.all([fetchJSON("/status"), fetchJSON("/events.json")]);
      allEvents = events;

      document.getElementById("tile-count").textContent = status.count;
      document.getElementById("tile-count-hint").textContent = `${Math.max(CRUSH_GOAL - status.count, 0)} to go until ${CRUSH_GOAL}`;
      document.getElementById("tile-last").textContent = status.last_event_at
        ? new Date(status.last_event_at).toLocaleString()
        : "never";

      renderAll();
    } catch (err) {
      console.error("Failed to load can-crusher data", err);
      document.getElementById("tile-count").textContent = "err";
    }
  }

  document.getElementById("kde-range").addEventListener("click", (evt) => {
    const btn = evt.target.closest("button[data-months]");
    if (!btn) return;
    document.querySelectorAll("#kde-range button").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    kdeMonths = Number(btn.dataset.months);
    const kde = computeKde(allEvents, kdeMonths);
    renderLineChart(document.getElementById("chart-kde"), {
      points: kde,
      colorVar: "--series-1",
      xFormat: (t) => new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      yFormat: (v) => v.toFixed(1),
      yTooltipFormat: (v) => `${v.toFixed(2)} crushes/day (smoothed)`,
    });
  });

  const adminStatus = document.getElementById("admin-status");
  async function adminAdjust(target) {
    const key = document.getElementById("admin-key").value;
    if (!key) {
      adminStatus.textContent = "Enter the API key first.";
      return;
    }
    adminStatus.textContent = "Working...";
    try {
      const res = await fetch("/admin/adjust", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Key": key },
        body: JSON.stringify({ target }),
      });
      const body = await res.json();
      if (!res.ok) {
        adminStatus.textContent = `Error: ${body.error || res.status}`;
        return;
      }
      adminStatus.textContent = `Done. Server count is now ${body.count}.`;
      load();
    } catch (err) {
      adminStatus.textContent = `Request failed: ${err.message}`;
    }
  }
  document.getElementById("admin-set-btn").addEventListener("click", () => {
    const val = Number(document.getElementById("admin-target").value);
    if (!Number.isInteger(val)) {
      adminStatus.textContent = "Enter a whole number.";
      return;
    }
    adminAdjust(val);
  });
  document.getElementById("admin-reset-btn").addEventListener("click", () => adminAdjust(0));

  load();
})();
