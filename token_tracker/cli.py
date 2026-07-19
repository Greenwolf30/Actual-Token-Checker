"""CLI entrypoint: python -m token_tracker <query>"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from .analyze import analyze_token
from .report import format_json, format_pretty


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="token_tracker",
        description=(
            "Track a DexScreener token: market cap, estimated initial MC & ATH, "
            "socials, X sentiment, and a short narrative."
        ),
    )
    p.add_argument(
        "query",
        help="Token address, symbol, name, or chain:address (e.g. solana:DezX...)",
    )
    p.add_argument(
        "--chain",
        help="Prefer a chain id (solana, ethereum, base, bsc, robinhood, ...)",
        default=None,
    )
    p.add_argument(
        "--pair",
        dest="pair_address",
        help="Force a specific pair address",
        default=None,
    )
    p.add_argument(
        "--json",
        action="store_true",
        help="Emit machine-readable JSON",
    )
    p.add_argument(
        "-o",
        "--output",
        help="Write report to a file (in addition to stdout)",
        default=None,
    )
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    report = analyze_token(
        args.query,
        chain=args.chain,
        pair_address=args.pair_address,
    )
    text = format_json(report) if args.json else format_pretty(report)
    print(text)

    if args.output:
        path = Path(args.output)
        path.write_text(text, encoding="utf-8")
        print(f"\nWrote {path}", file=sys.stderr)

    return 0 if report.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
