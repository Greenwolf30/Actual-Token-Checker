"""
Build Actual Data Token Checker with PyInstaller (folder / onedir layout).

Usage:
  python build_exe.py

Output:
  dist/Actual Data Token Checker/Actual Data Token Checker.exe
  (plus _internal/)
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
ENTRY = ROOT / "desktop_app.py"
DIST = ROOT / "dist"
NAME = "Actual Data Token Checker"
PKG = ROOT / "token_tracker"


def main() -> int:
    if not ENTRY.exists():
        print(f"Missing {ENTRY}")
        return 1
    if not PKG.exists():
        print(f"Missing package {PKG}")
        return 1

    try:
        import PyInstaller  # noqa: F401
    except ImportError:
        print("Installing PyInstaller…")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "pyinstaller"])

    sep = ";" if sys.platform.startswith("win") else ":"
    market_pkg = ROOT / "market_data"
    datas = [
        f"{PKG}{sep}token_tracker",
    ]
    if market_pkg.exists():
        datas.append(f"{market_pkg}{sep}market_data")

    hidden = [
        "token_tracker",
        "token_tracker.analyze",
        "token_tracker.dexscreener",
        "token_tracker.geckoterminal",
        "token_tracker.sentiment",
        "token_tracker.narrative",
        "token_tracker.report",
        "token_tracker.http_util",
        "token_tracker.holders",
        "token_tracker.holder_sources",
        "token_tracker.wallet_lookup",
        "token_tracker.rugwatch_bridge",
        "token_tracker.bundles",
        "token_tracker.bundle_sources",
        "token_tracker.bundle_fusion",
        "token_tracker.env_config",
        "token_tracker.social_sources",
        "token_tracker.coin_facts",
        "token_tracker.alerts",
        "token_tracker.bubblemaps",
        "token_tracker.pumpfun",
        "token_tracker.cli",
        "market_data",
        "market_data.client",
        "market_data.db",
        "market_data.paths",
        "market_data.collector",
        "market_data.api_server",
        "certifi",
    ]

    cmd = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--noconfirm",
        "--clean",
        "--windowed",
        "--onedir",
        "--name",
        NAME,
        "--paths",
        str(ROOT),
        "--distpath",
        str(DIST),
        "--workpath",
        str(ROOT / "build"),
        "--specpath",
        str(ROOT),
    ]
    for d in datas:
        cmd.extend(["--add-data", d])
    for h in hidden:
        cmd.extend(["--hidden-import", h])
    cmd.append(str(ENTRY))

    print("Running:", " ".join(cmd))
    subprocess.check_call(cmd, cwd=str(ROOT))

    exe = DIST / NAME / f"{NAME}.exe"
    if exe.exists():
        print("\nSUCCESS")
        print(f"Executable: {exe}")
        print(f"Folder:     {exe.parent}")
        print("\nDouble-click the .exe inside that folder (needs internet).")
        print("Optional: put a .env next to the .exe for API keys.")
        print("To share: zip the whole folder.")
        return 0

    print("Build finished but exe not found. Check dist/")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
