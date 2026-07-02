#!/usr/bin/env python3
"""Render a self-contained HTML budget dashboard from a transaction CSV.

Usage:
    python3 dashboard.py <transactions.csv> [--config config.json] [--out dashboard.html]

The output HTML embeds real numbers from your data - it is written to a
gitignored location and is meant to be viewed locally / sent to you
directly, never committed.
"""
import argparse
import json
from collections import defaultdict
from pathlib import Path

from classify import load_config, load_transactions, classify_row

FULL_MONTHS = ["2026-04", "2026-05", "2026-06"]  # complete calendar months in the sample
CURRENT_MONTH = "2026-07"

LIFESTYLE_EXCLUDE = {"Travel/Holidays", "Uncategorised", "Transfer Between Accounts", "Transfer Out", "Transfer In"}
LIVING_EXCLUDE = {"Automotive", "Insurance", "Healthcare/Medical"}  # already covered by sinking funds


def month_key(date_str):
    return date_str[:7]


def build_dataset(rows, config):
    lifestyle_by_month = defaultdict(lambda: defaultdict(float))
    living_by_month = defaultdict(lambda: defaultdict(float))
    uncategorised_total = 0.0
    uncategorised_count = 0

    fund_totals = {k: {"label": f["label"], "contributions": 0.0, "spend_against": 0.0} for k, f in config["sinking_funds"].items()}
    income_total = 0.0
    spend_total = 0.0
    interest_income_total = 0.0
    big_events = []

    for row in rows:
        amount = float(row["amount"])
        category_name = row.get("category_name", "")
        budget_category = row.get("budget_category", "")
        mkey = month_key(row["transaction_date"])
        bucket, fund_key = classify_row(row, config)

        if bucket == "interest_income":
            interest_income_total += amount
        elif bucket == "sinking_fund_contribution":
            if amount < 0:
                fund_totals[fund_key]["contributions"] += -amount
        elif bucket == "big_one_off_event":
            big_events.append({"date": row["transaction_date"], "description": row["description"], "amount": amount, "account": row["account_name"]})
        elif bucket == "income":
            income_total += amount
        elif bucket == "spend":
            spend_amt = -amount if amount < 0 else 0
            if spend_amt == 0:
                continue
            spend_total += spend_amt

            if category_name == "Uncategorised":
                uncategorised_total += spend_amt
                uncategorised_count += 1

            for fkey, fund in config["sinking_funds"].items():
                if category_name in fund["spend_category_names"]:
                    fund_totals[fkey]["spend_against"] += spend_amt

            if budget_category == "lifestyle" and category_name not in LIFESTYLE_EXCLUDE:
                lifestyle_by_month[category_name][mkey] += spend_amt
            elif budget_category == "living" and category_name not in LIVING_EXCLUDE:
                living_by_month[category_name][mkey] += spend_amt

    return {
        "income_total": income_total,
        "spend_total": spend_total,
        "interest_income_total": interest_income_total,
        "net": income_total - spend_total,
        "uncategorised_total": uncategorised_total,
        "uncategorised_count": uncategorised_count,
        "fund_totals": fund_totals,
        "big_events": sorted(big_events, key=lambda e: e["date"]),
        "lifestyle_by_month": lifestyle_by_month,
        "living_by_month": living_by_month,
    }


def suggested_cap(monthly_totals, overrides, category_name):
    if category_name in overrides:
        return overrides[category_name], True
    full = [monthly_totals.get(m, 0.0) for m in FULL_MONTHS]
    full = [v for v in full if v > 0]
    if not full:
        return 0.0, False
    avg = sum(full) / len(full)
    return round(avg / 10) * 10, False


def status_for_ratio(ratio):
    if ratio <= 1.0:
        return "good"
    if ratio <= 1.15:
        return "warning"
    return "critical"


PALETTE_CSS = """
.viz-root {
  --surface-1: #fcfcfb; --page: #f9f9f7; --text-primary: #0b0b0b; --text-secondary: #52514e;
  --muted: #898781; --grid: #e1e0d9; --baseline: #c3c2b7; --border: rgba(11,11,11,0.10);
  --series-1: #2a78d6; --series-1-track: #cde2fb;
  --good: #0ca30c; --warning: #fab219; --serious: #ec835a; --critical: #d03b3b;
}
@media (prefers-color-scheme: dark) {
  .viz-root {
    --surface-1: #1a1a19; --page: #0d0d0d; --text-primary: #ffffff; --text-secondary: #c3c2b7;
    --muted: #898781; --grid: #2c2c2a; --baseline: #383835; --border: rgba(255,255,255,0.10);
    --series-1: #3987e5; --series-1-track: #184f95;
    --good: #0ca30c; --warning: #fab219; --serious: #ec835a; --critical: #d03b3b;
  }
}
* { box-sizing: border-box; }
.viz-root {
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  background: var(--page); color: var(--text-primary); margin: 0; padding: 32px;
}
h1 { font-size: 22px; margin: 0 0 4px; }
.subtitle { color: var(--text-secondary); font-size: 14px; margin: 0 0 28px; }
h2 { font-size: 15px; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.04em; margin: 36px 0 12px; }
.card { background: var(--surface-1); border: 1px solid var(--border); border-radius: 10px; padding: 16px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
.stat-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; }
.stat-label { font-size: 13px; color: var(--text-secondary); }
.stat-value { font-size: 28px; font-weight: 600; margin-top: 4px; }
.meter-track { height: 10px; border-radius: 5px; background: var(--grid); overflow: hidden; margin: 10px 0 6px; }
.meter-fill { height: 100%; border-radius: 5px; }
.meter-fill.good { background: var(--good); }
.meter-fill.warning { background: var(--warning); }
.meter-fill.critical { background: var(--critical); }
.meter-caption { font-size: 12px; color: var(--text-secondary); display: flex; justify-content: space-between; }
.trend-bars { display: flex; align-items: flex-end; gap: 6px; height: 64px; margin: 10px 0 4px; }
.trend-bar-col { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; }
.trend-bar { width: 100%; max-width: 24px; background: var(--series-1); border-radius: 4px 4px 0 0; }
.trend-bar-label { font-size: 10px; color: var(--muted); margin-top: 4px; }
.card-title { font-size: 14px; font-weight: 600; }
.card-sub { font-size: 12px; color: var(--text-secondary); }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--grid); }
th { color: var(--text-secondary); font-weight: 600; }
td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
details summary { cursor: pointer; font-size: 12px; color: var(--text-secondary); margin-top: 10px; }
.callout { background: var(--surface-1); border: 1px solid var(--border); border-left: 4px solid var(--warning); border-radius: 10px; padding: 16px; }
footer { margin-top: 40px; font-size: 12px; color: var(--muted); }
"""


def money(v):
    return f"${v:,.0f}"


def render_stat_tile(label, value):
    return f'<div class="card"><div class="stat-label">{label}</div><div class="stat-value">{money(value)}</div></div>'


def render_cap_card(category, actual, cap, is_override):
    if cap <= 0:
        return ""
    ratio = actual / cap
    status = status_for_ratio(ratio)
    pct = min(ratio, 1.0) * 100
    src = "manual target" if is_override else "suggested from your 3-month average"
    return f"""<div class="card">
  <div class="card-title">{category}</div>
  <div class="card-sub">June actual vs {src}</div>
  <div class="meter-track"><div class="meter-fill {status}" style="width:{pct:.0f}%"></div></div>
  <div class="meter-caption"><span>{money(actual)} spent</span><span>cap {money(cap)}</span></div>
</div>"""


def render_trend_card(category, monthly_totals):
    values = [monthly_totals.get(m, 0.0) for m in FULL_MONTHS]
    maxv = max(values) if any(values) else 1
    bars = ""
    for m, v in zip(FULL_MONTHS, values):
        h = max(4, (v / maxv) * 60) if maxv else 4
        bars += f'<div class="trend-bar-col"><div class="trend-bar" style="height:{h:.0f}px" title="{m}: {money(v)}"></div><div class="trend-bar-label">{m[-2:]}</div></div>'
    latest, first = values[-1], values[0]
    delta = latest - first
    arrow = "+" if delta >= 0 else "-"
    return f"""<div class="card">
  <div class="card-title">{category}</div>
  <div class="card-sub">Apr &rarr; Jun, {arrow}{money(abs(delta))}</div>
  <div class="trend-bars">{bars}</div>
</div>"""


def render_fund_card(fund):
    contributed, spent = fund["contributions"], fund["spend_against"]
    if spent > 0:
        ratio = contributed / spent
        status = status_for_ratio(1 / ratio) if ratio < 1 else "good"
        pct = min(ratio, 1.0) * 100
        caption = f'<div class="meter-caption"><span>{money(contributed)} set aside</span><span>{money(spent)} spent</span></div>'
    else:
        status, pct = "good", 100 if contributed > 0 else 0
        caption = f'<div class="meter-caption"><span>{money(contributed)} saved</span><span>no matched spend yet</span></div>'
    return f"""<div class="card">
  <div class="card-title">{fund['label']}</div>
  <div class="meter-track"><div class="meter-fill {status}" style="width:{pct:.0f}%"></div></div>
  {caption}
</div>"""


def render_table(headers, rows):
    th = "".join(f'<th class="num">{h}</th>' if i > 0 else f"<th>{h}</th>" for i, h in enumerate(headers))
    trs = ""
    for r in rows:
        tds = "".join(f'<td class="num">{c}</td>' if i > 0 else f"<td>{c}</td>" for i, c in enumerate(r))
        trs += f"<tr>{tds}</tr>"
    return f"<table><thead><tr>{th}</tr></thead><tbody>{trs}</tbody></table>"


def render_html(data, config, period_label):
    overrides = config.get("category_cap_overrides", {})

    lifestyle_cards, lifestyle_rows = [], []
    for cat, months in sorted(data["lifestyle_by_month"].items(), key=lambda kv: -sum(kv[1].values())):
        june_actual = months.get("2026-06", 0.0)
        cap, is_override = suggested_cap(months, overrides, cat)
        if cap > 0:
            lifestyle_cards.append(render_cap_card(cat, june_actual, cap, is_override))
        lifestyle_rows.append([cat, money(june_actual), money(cap)])

    living_cards, living_rows = [], []
    for cat, months in sorted(data["living_by_month"].items(), key=lambda kv: -sum(kv[1].values()))[:6]:
        living_cards.append(render_trend_card(cat, months))
        living_rows.append([cat] + [money(months.get(m, 0.0)) for m in FULL_MONTHS])

    fund_cards = [render_fund_card(f) for f in data["fund_totals"].values()]

    big_event_rows = [[e["date"], e["description"][:60], money(e["amount"]), e["account"]] for e in data["big_events"]]

    uncategorised_callout = ""
    if data["uncategorised_total"] > 0:
        uncategorised_callout = f"""<div class="callout">
  <strong>{money(data['uncategorised_total'])}</strong> across <strong>{data['uncategorised_count']}</strong> transactions
  is sitting in "Uncategorised" and isn't reflected in any category above &mdash; worth a categorisation pass.
</div>"""

    return f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Household budget dashboard</title>
<style>{PALETTE_CSS}</style></head>
<body class="viz-root" data-palette="categorical">
<h1>Household budget dashboard</h1>
<p class="subtitle">{period_label} &middot; generated locally, not committed to git</p>

<h2>Overview</h2>
<div class="stat-row">
  {render_stat_tile("Income (3mo)", data['income_total'])}
  {render_stat_tile("Spend (3mo)", data['spend_total'])}
  {render_stat_tile("Net", data['net'])}
  {render_stat_tile("Interest earned", data['interest_income_total'])}
</div>

{uncategorised_callout}

<h2>Discretionary &amp; lifestyle &mdash; vs monthly target</h2>
<div class="grid">{''.join(lifestyle_cards)}</div>
<details><summary>View as table</summary>{render_table(["Category", "June actual", "Suggested cap"], lifestyle_rows)}</details>

<h2>Essential &amp; living costs &mdash; trend (top categories)</h2>
<div class="grid">{''.join(living_cards)}</div>
<details><summary>View as table</summary>{render_table(["Category"] + FULL_MONTHS, living_rows)}</details>

<h2>Sinking funds &amp; goals</h2>
<div class="grid">{''.join(fund_cards)}</div>

<h2>Big one-off events (excluded from budget above)</h2>
{render_table(["Date", "Description", "Amount", "Account"], big_event_rows)}

<footer>Categories grouped using the bank's own living/lifestyle tags as a first pass &mdash; a custom taxonomy is a later step.</footer>
</body></html>"""


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("csv_path")
    parser.add_argument("--config", default=str(Path(__file__).parent / "config.json"))
    parser.add_argument("--out", default=str(Path(__file__).parent / "data" / "dashboard.html"))
    args = parser.parse_args()

    config = load_config(args.config)
    rows = load_transactions(args.csv_path)
    data = build_dataset(rows, config)

    dates = sorted(r["transaction_date"] for r in rows if r.get("transaction_date"))
    period_label = f"{dates[0]} to {dates[-1]}" if dates else ""

    html = render_html(data, config, period_label)
    Path(args.out).write_text(html)
    print(f"Wrote {args.out}")


if __name__ == "__main__":
    main()
