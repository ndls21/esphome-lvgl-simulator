#!/usr/bin/env python3
"""Classify bank transaction exports into budget-relevant buckets.

Usage:
    python3 classify.py <transactions.csv> [--config config.json] [--json out.json]
"""
import argparse
import csv
import json
from collections import defaultdict
from pathlib import Path


def load_config(path):
    with open(path) as f:
        return json.load(f)


def load_transactions(csv_path):
    """Read the CSV and dedup by transaction_id (stable across re-exports)."""
    seen = {}
    with open(csv_path, newline="") as f:
        for row in csv.DictReader(f):
            seen[row["transaction_id"]] = row
    return list(seen.values())


def matches_any(text, keywords):
    text = (text or "").lower()
    return any(kw in text for kw in keywords)


def classify_row(row, config):
    """Return (bucket, fund_key_or_None) for a single transaction."""
    desc = f"{row.get('description', '')} {row.get('merchant_name', '')}"
    amount = float(row["amount"])
    category_name = row.get("category_name", "")

    # Sinking-fund keywords are the most specific signal (a purposefully
    # labeled transfer) so they take priority over generic own-name/transfer
    # matches, even though fund transfers often also mention the account
    # holder's name.
    for fund_key, fund in config["sinking_funds"].items():
        if matches_any(desc, fund["contribution_keywords"]):
            return "sinking_fund_contribution", fund_key

    if matches_any(desc, config["own_name_keywords"] + config["internal_transfer_keywords"]):
        return "internal_transfer", None

    if matches_any(desc, config["interest_income_keywords"]):
        return "interest_income", None

    if category_name == "Transfer Between Accounts":
        return "internal_transfer", None

    if abs(amount) >= config["big_event_threshold"] and matches_any(desc, config["big_event_keywords"]):
        return "big_one_off_event", None
    if abs(amount) >= config["big_event_threshold"] and category_name not in ("Salary/Regular Income",):
        return "big_one_off_event", None

    if row.get("credit_debit") == "credit":
        return "income", None

    return "spend", None


def aggregate(rows, config):
    summary = {
        "period": {"start": None, "end": None},
        "income_total": 0.0,
        "spend_total": 0.0,
        "spend_by_category": defaultdict(float),
        "sinking_funds": {
            key: {"label": f["label"], "contributions": 0.0, "spend_against": 0.0}
            for key, f in config["sinking_funds"].items()
        },
        "account_pockets": defaultdict(float),
        "big_events": [],
        "internal_transfer_net": 0.0,
        "interest_income_total": 0.0,
        "transaction_count": len(rows),
    }

    dates = [r["transaction_date"] for r in rows if r.get("transaction_date")]
    if dates:
        summary["period"]["start"] = min(dates)
        summary["period"]["end"] = max(dates)

    for row in rows:
        amount = float(row["amount"])
        category_name = row.get("category_name", "")
        bucket, fund_key = classify_row(row, config)

        summary["account_pockets"][row["account_number"]] += amount

        if bucket == "internal_transfer":
            summary["internal_transfer_net"] += amount
        elif bucket == "interest_income":
            summary["interest_income_total"] += amount
        elif bucket == "sinking_fund_contribution":
            # Only count the outgoing leg as a "contribution" - the matching
            # incoming leg on the destination account is the same movement,
            # not a second contribution, so it's excluded here but still
            # kept out of spend/income.
            if amount < 0:
                summary["sinking_funds"][fund_key]["contributions"] += -amount
        elif bucket == "big_one_off_event":
            summary["big_events"].append({
                "date": row["transaction_date"],
                "description": row["description"],
                "amount": amount,
                "account": row["account_name"],
            })
        elif bucket == "income":
            summary["income_total"] += amount
        elif bucket == "spend":
            summary["spend_total"] += -amount if amount < 0 else 0
            summary["spend_by_category"][category_name] += -amount if amount < 0 else 0

        # Track spend against sinking funds using the bank's own category tags,
        # independent of how the contribution transfer itself was classified.
        if bucket == "spend":
            for fund_key, fund in config["sinking_funds"].items():
                if category_name in fund["spend_category_names"]:
                    summary["sinking_funds"][fund_key]["spend_against"] += -amount if amount < 0 else 0

    return summary


def print_report(summary, config):
    p = summary["period"]
    print(f"Period: {p['start']} to {p['end']}  ({summary['transaction_count']} transactions)\n")

    print(f"Income (excl. transfers/big events): ${summary['income_total']:,.2f}")
    print(f"Spend  (excl. transfers/big events): ${summary['spend_total']:,.2f}")
    print(f"Interest income (bonus rates etc.):  ${summary['interest_income_total']:,.2f}")
    print(f"Internal/interest-arbitrage transfer net (should be ~0): ${summary['internal_transfer_net']:,.2f}\n")

    print("-- Spend by category --")
    for cat, total in sorted(summary["spend_by_category"].items(), key=lambda x: -x[1]):
        print(f"  {cat:<32} ${total:,.2f}")

    print("\n-- Sinking funds (contributions set aside vs. matched spend) --")
    for key, fund in summary["sinking_funds"].items():
        print(f"  {fund['label']:<24} contributed: ${fund['contributions']:,.2f}   spent against: ${fund['spend_against']:,.2f}")

    print("\n-- Account pockets (net flow this period) --")
    labels = config.get("account_pocket_labels", {})
    for acct, net in sorted(summary["account_pockets"].items(), key=lambda x: -abs(x[1])):
        label = labels.get(acct, "(unlabeled - please name this pocket in config.json)")
        print(f"  {acct:<16} {label:<45} net: ${net:,.2f}")

    print(f"\n-- Big one-off events (>= ${config['big_event_threshold']:,.0f}, excluded from budget) --")
    for evt in summary["big_events"]:
        print(f"  {evt['date']}  {evt['description'][:50]:<50} ${evt['amount']:,.2f}  [{evt['account']}]")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("csv_path")
    parser.add_argument("--config", default=str(Path(__file__).parent / "config.json"))
    parser.add_argument("--json", default=None, help="Optional path to write the summary as JSON")
    args = parser.parse_args()

    config = load_config(args.config)
    rows = load_transactions(args.csv_path)
    summary = aggregate(rows, config)
    print_report(summary, config)

    if args.json:
        out = dict(summary)
        out["spend_by_category"] = dict(out["spend_by_category"])
        out["account_pockets"] = dict(out["account_pockets"])
        with open(args.json, "w") as f:
            json.dump(out, f, indent=2)


if __name__ == "__main__":
    main()
