#!/usr/bin/env python3
"""Render an interactive HTML budget dashboard (week/fortnight/month granularity,
running-average comparison, category drill-in) from a transaction CSV.

Usage:
    python3 interactive_dashboard.py <transactions.csv> [--config config.json] [--out interactive.html]

All aggregation happens client-side in vanilla JS against embedded transaction
data, so granularity/period navigation doesn't require re-running Python.
The output HTML embeds real numbers - gitignored, never committed.
"""
import argparse
import json
from pathlib import Path

from classify import load_config, load_transactions, classify_row
from dashboard import (
    LIFESTYLE_EXCLUDE, LIVING_EXCLUDE, FULL_MONTHS,
    suggested_cap, PALETTE_CSS, money, render_fund_card, render_table,
)


def build_export(rows, config):
    spend_txns = []
    income_txns = []
    fund_totals = {k: {"label": f["label"], "contributions": 0.0, "spend_against": 0.0} for k, f in config["sinking_funds"].items()}
    interest_income_total = 0.0
    big_events = []
    uncategorised_total = 0.0
    uncategorised_count = 0
    monthly_totals_by_cat = {}

    for row in rows:
        amount = float(row["amount"])
        date = row["transaction_date"]
        category_name = row.get("category_name", "")
        budget_category = row.get("budget_category", "")
        bucket, fund_key = classify_row(row, config)

        if bucket == "interest_income":
            interest_income_total += amount
        elif bucket == "sinking_fund_contribution":
            if amount < 0:
                fund_totals[fund_key]["contributions"] += -amount
        elif bucket == "big_one_off_event":
            big_events.append({"date": date, "description": row["description"], "amount": amount, "account": row["account_name"]})
        elif bucket == "income":
            income_txns.append({"date": date, "amount": amount})
        elif bucket == "spend":
            spend_amt = -amount if amount < 0 else 0
            if spend_amt == 0:
                continue
            if category_name == "Uncategorised":
                uncategorised_total += spend_amt
                uncategorised_count += 1
            for fkey, fund in config["sinking_funds"].items():
                if category_name in fund["spend_category_names"]:
                    fund_totals[fkey]["spend_against"] += spend_amt
            is_lifestyle = budget_category == "lifestyle" and category_name not in LIFESTYLE_EXCLUDE
            is_living = budget_category == "living" and category_name not in LIVING_EXCLUDE
            if is_lifestyle or is_living:
                spend_txns.append({"date": date, "category": category_name, "group": "lifestyle" if is_lifestyle else "living", "amount": spend_amt})
                monthly_totals_by_cat.setdefault(category_name, {}).setdefault(date[:7], 0.0)
                monthly_totals_by_cat[category_name][date[:7]] += spend_amt

    overrides = config.get("category_cap_overrides", {})
    caps = {}
    for cat, months in monthly_totals_by_cat.items():
        cap, is_override = suggested_cap(months, overrides, cat)
        if cap > 0:
            caps[cat] = {"amount": cap, "override": is_override}

    return {
        "spend_txns": spend_txns,
        "income_txns": income_txns,
        "caps": caps,
        "fund_totals": fund_totals,
        "big_events": sorted(big_events, key=lambda e: e["date"]),
        "uncategorised_total": uncategorised_total,
        "uncategorised_count": uncategorised_count,
        "interest_income_total": interest_income_total,
    }


EXTRA_CSS = """
.controls { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 4px; }
.seg { display: inline-flex; background: var(--surface-1); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
.seg button { border: none; background: transparent; color: var(--text-secondary); padding: 7px 14px; font-size: 13px; cursor: pointer; font-family: inherit; }
.seg button.active { background: var(--series-1); color: white; }
.nav-btn { border: 1px solid var(--border); background: var(--surface-1); color: var(--text-primary); border-radius: 8px; width: 30px; height: 30px; cursor: pointer; font-size: 14px; }
.nav-btn:disabled { opacity: 0.35; cursor: default; }
.period-label { font-size: 14px; font-weight: 600; min-width: 190px; text-align: center; }
.overview-note { font-size: 12px; color: var(--muted); margin: 0 0 20px; }
.combo-chart { width: 100%; height: 90px; display: block; overflow: visible; }
.combo-bar { fill: var(--series-1); }
.combo-bar.good { fill: var(--good); }
.combo-bar.warning { fill: var(--warning); }
.combo-bar.critical { fill: var(--critical); }
.combo-avg-line { stroke: var(--text-secondary); stroke-width: 2px; fill: none; }
.combo-avg-dot { fill: var(--text-secondary); }
.combo-cap-line { stroke: var(--muted); stroke-width: 1.5px; stroke-dasharray: 4 3; }
.legend-row { display: flex; gap: 16px; font-size: 12px; color: var(--text-secondary); margin: 6px 0 18px; align-items: center; }
.legend-key { display: inline-flex; align-items: center; gap: 6px; }
.legend-swatch { width: 12px; height: 12px; border-radius: 3px; display: inline-block; }
.legend-line { width: 14px; height: 2px; display: inline-block; }
.tooltip { position: fixed; background: var(--text-primary); color: var(--surface-1); font-size: 12px; padding: 6px 9px; border-radius: 6px; pointer-events: none; opacity: 0; transition: opacity 0.08s; z-index: 10; white-space: nowrap; }
.badge { display: inline-block; font-size: 11px; padding: 2px 8px; border-radius: 10px; font-weight: 600; }
.badge.good { background: rgba(12,163,12,0.15); color: var(--good); }
.badge.warning { background: rgba(250,178,25,0.18); color: #a86a00; }
.badge.critical { background: rgba(208,59,59,0.15); color: var(--critical); }
@media (prefers-color-scheme: dark) { .badge.warning { color: var(--warning); } }
.overall-chart-wrap { position: relative; }
"""


def render_html(export, period_label):
    fund_cards = [render_fund_card(f) for f in export["fund_totals"].values()]
    big_event_rows = [[e["date"], e["description"][:60], money(e["amount"]), e["account"]] for e in export["big_events"]]

    uncategorised_callout = ""
    if export["uncategorised_total"] > 0:
        uncategorised_callout = f"""<div class="callout">
  <strong>{money(export['uncategorised_total'])}</strong> across <strong>{export['uncategorised_count']}</strong> transactions
  is sitting in "Uncategorised" &mdash; not reflected in any category below.
</div>"""

    data_json = json.dumps({
        "spend_txns": export["spend_txns"],
        "income_txns": export["income_txns"],
        "caps": export["caps"],
    })

    return f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Household budget dashboard</title>
<style>{PALETTE_CSS}{EXTRA_CSS}</style></head>
<body class="viz-root" data-palette="categorical">
<h1>Household budget dashboard</h1>
<p class="subtitle">{period_label} &middot; generated locally, not committed to git</p>

<div class="controls">
  <div class="seg" id="gran-seg">
    <button data-gran="week">Week</button>
    <button data-gran="fortnight">Fortnight</button>
    <button data-gran="month" class="active">Month</button>
  </div>
  <button class="nav-btn" id="prev-btn">&larr;</button>
  <span class="period-label" id="period-label"></span>
  <button class="nav-btn" id="next-btn">&rarr;</button>
</div>
<p class="overview-note">Caps are prorated from each category's monthly target using a 30.44-day average month. Running average = trailing 3 periods at the selected granularity.</p>

<h2>Overview &mdash; selected period</h2>
<div class="stat-row" id="overview-tiles"></div>

{uncategorised_callout}

<h2>Income vs spend &mdash; last periods</h2>
<div class="card overall-chart-wrap">
  <div id="overall-chart"></div>
  <div class="legend-row">
    <span class="legend-key"><span class="legend-swatch" style="background:var(--good)"></span>Income</span>
    <span class="legend-key"><span class="legend-swatch" style="background:var(--series-1)"></span>Spend</span>
  </div>
</div>

<h2>Discretionary &amp; lifestyle &mdash; actual vs cap vs running average</h2>
<div class="grid" id="lifestyle-grid"></div>

<h2>Essential &amp; living costs &mdash; actual vs running average</h2>
<div class="grid" id="living-grid"></div>

<h2>Sinking funds &amp; goals (whole period)</h2>
<div class="grid">{''.join(fund_cards)}</div>

<h2>Big one-off events (excluded from budget above)</h2>
{render_table(["Date", "Description", "Amount", "Account"], big_event_rows)}

<footer>Categories grouped using the bank's own living/lifestyle tags as a first pass &mdash; a custom taxonomy is a later step.</footer>
<div class="tooltip" id="tooltip"></div>

<script>
const DATA = {data_json};
const tooltip = document.getElementById('tooltip');

function showTip(evt, html) {{
  tooltip.innerHTML = html;
  tooltip.style.opacity = 1;
  tooltip.style.left = (evt.clientX + 14) + 'px';
  tooltip.style.top = (evt.clientY - 10) + 'px';
}}
function hideTip() {{ tooltip.style.opacity = 0; }}

function parseDate(s) {{ return new Date(s + 'T00:00:00'); }}
function addDays(d, n) {{ const r = new Date(d); r.setDate(r.getDate() + n); return r; }}
function fmtShort(d) {{ return d.toLocaleDateString('en-AU', {{ day: 'numeric', month: 'short' }}); }}
function startOfWeek(d) {{ const day = (d.getDay() + 6) % 7; return addDays(d, -day); }}
function money(v) {{ return '$' + Math.round(v).toLocaleString('en-AU'); }}

const allDates = [...DATA.spend_txns, ...DATA.income_txns].map(t => parseDate(t.date));
const dataStart = new Date(Math.min(...allDates));
const dataEnd = new Date(Math.max(...allDates));

function buildPeriods(granularity) {{
  const periods = [];
  if (granularity === 'month') {{
    let cursor = new Date(dataStart.getFullYear(), dataStart.getMonth(), 1);
    while (cursor <= dataEnd) {{
      const end = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
      periods.push({{ start: new Date(cursor), end, label: cursor.toLocaleDateString('en-AU', {{ month: 'short', year: 'numeric' }}), days: end.getDate() }});
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }}
  }} else {{
    const step = granularity === 'week' ? 7 : 14;
    let cursor = startOfWeek(dataStart);
    while (cursor <= dataEnd) {{
      const end = addDays(cursor, step - 1);
      periods.push({{ start: new Date(cursor), end, label: fmtShort(cursor) + ' - ' + fmtShort(end), days: step }});
      cursor = addDays(cursor, step);
    }}
  }}
  return periods;
}}

function sumInRange(txns, start, end, filterFn) {{
  let total = 0;
  for (const t of txns) {{
    const d = parseDate(t.date);
    if (d >= start && d <= end && (!filterFn || filterFn(t))) total += t.amount;
  }}
  return total;
}}

let granularity = 'month';
let periods = buildPeriods(granularity);
let periodIdx = periods.length - 1;

function categoryList(group) {{
  const set = new Set();
  for (const t of DATA.spend_txns) if (t.group === group) set.add(t.category);
  return [...set].sort((a, b) => {{
    const totalA = DATA.spend_txns.filter(t => t.category === a).reduce((s, t) => s + t.amount, 0);
    const totalB = DATA.spend_txns.filter(t => t.category === b).reduce((s, t) => s + t.amount, 0);
    return totalB - totalA;
  }});
}}
const lifestyleCats = categoryList('lifestyle');
const livingCats = categoryList('living').slice(0, 6);

function seriesForCategory(cat, upToIdx, count) {{
  const lo = Math.max(0, upToIdx - count + 1);
  const slice = periods.slice(lo, upToIdx + 1);
  return slice.map((p, i) => {{
    const absIdx = lo + i;
    const actual = sumInRange(DATA.spend_txns, p.start, p.end, t => t.category === cat);
    const trailStart = Math.max(0, absIdx - 3);
    const trail = periods.slice(trailStart, absIdx).map(pp => sumInRange(DATA.spend_txns, pp.start, pp.end, t => t.category === cat));
    const runAvg = trail.length ? trail.reduce((a, b) => a + b, 0) / trail.length : actual;
    return {{ period: p, actual, runAvg }};
  }});
}}

function statusFor(actual, cap) {{
  if (!cap) return 'good';
  const ratio = actual / cap;
  if (ratio <= 1.0) return 'good';
  if (ratio <= 1.15) return 'warning';
  return 'critical';
}}

function comboChart(points, capAmount, height=90) {{
  const w = 100, h = height, padB = 16, padT = 6;
  const plotH = h - padB - padT;
  const maxV = Math.max(capAmount || 0, ...points.map(p => p.actual), ...points.map(p => p.runAvg), 1);
  const bw = (w / points.length) * 0.55;
  const gap = (w / points.length);
  let bars = '', lineD = '', dots = '';
  points.forEach((p, i) => {{
    const cx = gap * i + gap / 2;
    const barH = (p.actual / maxV) * plotH;
    const status = statusFor(p.actual, capAmount);
    const y = h - padB - barH;
    bars += `<rect class="combo-bar ${{status}}" x="${{(cx - bw/2).toFixed(1)}}" y="${{y.toFixed(1)}}" width="${{bw.toFixed(1)}}" height="${{Math.max(barH,1).toFixed(1)}}" rx="2" data-label="${{p.period.label}}" data-actual="${{p.actual.toFixed(0)}}"></rect>`;
    const ly = h - padB - (p.runAvg / maxV) * plotH;
    lineD += (i === 0 ? 'M' : 'L') + cx.toFixed(1) + ' ' + ly.toFixed(1) + ' ';
    dots += `<circle class="combo-avg-dot" cx="${{cx.toFixed(1)}}" cy="${{ly.toFixed(1)}}" r="1.6"></circle>`;
  }});
  let capLine = '';
  if (capAmount) {{
    const cy = h - padB - (capAmount / maxV) * plotH;
    capLine = `<line class="combo-cap-line" x1="0" y1="${{cy.toFixed(1)}}" x2="${{w}}" y2="${{cy.toFixed(1)}}"></line>`;
  }}
  return `<svg class="combo-chart" viewBox="0 0 ${{w}} ${{h}}" preserveAspectRatio="none">${{bars}}${{capLine}}<path class="combo-avg-line" d="${{lineD.trim()}}"></path>${{dots}}</svg>`;
}}

function attachBarTooltips(container) {{
  container.querySelectorAll('rect.combo-bar').forEach(rect => {{
    rect.addEventListener('mousemove', e => showTip(e, `<strong>${{rect.dataset.label}}</strong><br>${{money(+rect.dataset.actual)}}`));
    rect.addEventListener('mouseleave', hideTip);
  }});
}}

function renderCategoryCard(cat, group, showCap) {{
  const points = seriesForCategory(cat, periodIdx, 6);
  const current = points[points.length - 1];
  const capInfo = DATA.caps[cat];
  const capAmount = showCap && capInfo ? capInfo.amount * (current.period.days / 30.44) : 0;
  const status = showCap ? statusFor(current.actual, capAmount) : 'good';
  const div = document.createElement('div');
  div.className = 'card';
  const capLine = showCap && capAmount ? `<div class="card-sub">cap this period: ${{money(capAmount)}}</div>` : '';
  const startLabel = fmtShort(points[0].period.start);
  const endLabel = fmtShort(points[points.length - 1].period.end);
  div.innerHTML = `
    <div class="card-title">${{cat}} <span class="badge ${{status}}">${{status}}</span></div>
    <div class="card-sub">this period: ${{money(current.actual)}} &middot; running avg ${{money(current.runAvg)}}</div>
    ${{comboChart(points, capAmount)}}
    <div class="meter-caption"><span>${{startLabel}}</span><span>${{endLabel}}</span></div>
    ${{capLine}}
  `;
  attachBarTooltips(div);
  return div;
}}

function renderOverallChart() {{
  const count = Math.min(periods.length, 10);
  const lo = Math.max(0, periodIdx - count + 1);
  const slice = periods.slice(lo, periodIdx + 1);
  const spend = slice.map(p => sumInRange(DATA.spend_txns, p.start, p.end));
  const income = slice.map(p => sumInRange(DATA.income_txns, p.start, p.end));
  const w = 100, h = 160, padB = 20, padT = 10;
  const plotH = h - padB - padT;
  const maxV = Math.max(...spend, ...income, 1);
  const gap = w / slice.length;
  const pt = (v, i) => {{
    const cx = gap * i + gap / 2;
    const cy = h - padB - (v / maxV) * plotH;
    return [cx, cy];
  }};
  let spendD = '', incomeD = '', spendDots = '', incomeDots = '';
  slice.forEach((p, i) => {{
    const [sx, sy] = pt(spend[i], i);
    const [ix, iy] = pt(income[i], i);
    spendD += (i === 0 ? 'M' : 'L') + sx.toFixed(1) + ' ' + sy.toFixed(1) + ' ';
    incomeD += (i === 0 ? 'M' : 'L') + ix.toFixed(1) + ' ' + iy.toFixed(1) + ' ';
    spendDots += `<circle class="hover-dot" data-kind="Spend" data-label="${{p.label}}" data-v="${{spend[i].toFixed(0)}}" cx="${{sx.toFixed(1)}}" cy="${{sy.toFixed(1)}}" r="2.4" fill="var(--series-1)"></circle>`;
    incomeDots += `<circle class="hover-dot" data-kind="Income" data-label="${{p.label}}" data-v="${{income[i].toFixed(0)}}" cx="${{ix.toFixed(1)}}" cy="${{iy.toFixed(1)}}" r="2.4" fill="var(--good)"></circle>`;
  }});
  const svg = `<svg class="combo-chart" style="height:150px" viewBox="0 0 ${{w}} ${{h}}" preserveAspectRatio="none">
    <path class="combo-avg-line" style="stroke:var(--series-1)" d="${{spendD.trim()}}"></path>
    <path class="combo-avg-line" style="stroke:var(--good)" d="${{incomeD.trim()}}"></path>
    ${{spendDots}}${{incomeDots}}
  </svg>`;
  // Labels are plain HTML (not SVG <text>) so they aren't warped by the
  // non-uniform viewBox stretch (preserveAspectRatio="none").
  const labelsHtml = `<div style="display:flex;">${{slice.map(p => `<div style="flex:1;text-align:center;font-size:11px;color:var(--muted);">${{p.label.split(' - ')[0].replace(' 2026', '')}}</div>`).join('')}}</div>`;
  const wrap = document.getElementById('overall-chart');
  wrap.innerHTML = svg + labelsHtml;
  wrap.querySelectorAll('.hover-dot').forEach(dot => {{
    dot.addEventListener('mousemove', e => showTip(e, `<strong>${{dot.dataset.label}}</strong><br>${{dot.dataset.kind}}: ${{money(+dot.dataset.v)}}`));
    dot.addEventListener('mouseleave', hideTip);
  }});
}}

function render() {{
  const p = periods[periodIdx];
  document.getElementById('period-label').textContent = p.label;
  document.getElementById('prev-btn').disabled = periodIdx === 0;
  document.getElementById('next-btn').disabled = periodIdx === periods.length - 1;

  const spend = sumInRange(DATA.spend_txns, p.start, p.end);
  const income = sumInRange(DATA.income_txns, p.start, p.end);
  document.getElementById('overview-tiles').innerHTML = `
    <div class="card"><div class="stat-label">Income</div><div class="stat-value">${{money(income)}}</div></div>
    <div class="card"><div class="stat-label">Spend</div><div class="stat-value">${{money(spend)}}</div></div>
    <div class="card"><div class="stat-label">Net</div><div class="stat-value">${{money(income - spend)}}</div></div>
  `;

  renderOverallChart();

  const lg = document.getElementById('lifestyle-grid');
  lg.innerHTML = '';
  lifestyleCats.forEach(cat => lg.appendChild(renderCategoryCard(cat, 'lifestyle', true)));

  const lvg = document.getElementById('living-grid');
  lvg.innerHTML = '';
  livingCats.forEach(cat => lvg.appendChild(renderCategoryCard(cat, 'living', false)));
}}

document.getElementById('gran-seg').addEventListener('click', e => {{
  const btn = e.target.closest('button');
  if (!btn) return;
  granularity = btn.dataset.gran;
  document.querySelectorAll('#gran-seg button').forEach(b => b.classList.toggle('active', b === btn));
  periods = buildPeriods(granularity);
  periodIdx = periods.length - 1;
  render();
}});
document.getElementById('prev-btn').addEventListener('click', () => {{ if (periodIdx > 0) {{ periodIdx--; render(); }} }});
document.getElementById('next-btn').addEventListener('click', () => {{ if (periodIdx < periods.length - 1) {{ periodIdx++; render(); }} }});

render();
</script>
</body></html>"""


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("csv_path")
    parser.add_argument("--config", default=str(Path(__file__).parent / "config.json"))
    parser.add_argument("--out", default=str(Path(__file__).parent / "data" / "interactive.html"))
    args = parser.parse_args()

    config = load_config(args.config)
    rows = load_transactions(args.csv_path)
    export = build_export(rows, config)

    dates = sorted(r["transaction_date"] for r in rows if r.get("transaction_date"))
    period_label = f"{dates[0]} to {dates[-1]}" if dates else ""

    html = render_html(export, period_label)
    Path(args.out).write_text(html)
    print(f"Wrote {args.out}")


if __name__ == "__main__":
    main()
