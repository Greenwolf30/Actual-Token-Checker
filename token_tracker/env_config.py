"""Load local secrets from a gitignored .env (stdlib only).

Never commit real keys. Prefer:
  HELIUS_API_KEY=...
  # or full RPC URL:
  SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=...
"""

from __future__ import annotations

import os
from pathlib import Path

_LOADED = False


def project_root() -> Path:
    return Path(__file__).resolve().parent.parent


def _candidate_env_paths() -> list[Path]:
    """Project .env, cwd .env, and next to a frozen .exe if present."""
    paths: list[Path] = [
        project_root() / ".env",
        Path.cwd() / ".env",
    ]
    try:
        import sys

        if getattr(sys, "frozen", False):
            paths.insert(0, Path(sys.executable).resolve().parent / ".env")
    except Exception:  # noqa: BLE001
        pass
    # de-dupe while preserving order
    seen: set[str] = set()
    out: list[Path] = []
    for p in paths:
        key = str(p.resolve()) if p.exists() else str(p)
        if key not in seen:
            seen.add(key)
            out.append(p)
    return out


def load_dotenv(path: Path | None = None, *, override: bool = False) -> None:
    """Parse KEY=VALUE lines into os.environ. Silent if file missing."""
    global _LOADED
    if _LOADED and path is None:
        return
    paths = [path] if path is not None else _candidate_env_paths()
    loaded_any = False
    for env_path in paths:
        if not env_path or not env_path.is_file():
            continue
        try:
            text = env_path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        loaded_any = True
        for raw in text.splitlines():
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            if line.startswith("export "):
                line = line[7:].strip()
            if "=" not in line:
                continue
            key, _, val = line.partition("=")
            key = key.strip()
            val = val.strip().strip("'").strip('"')
            if not key:
                continue
            if override or key not in os.environ or os.environ.get(key) == "":
                os.environ[key] = val
        # first existing .env wins for non-override fills; still mark loaded
        break
    _LOADED = True
    if not loaded_any:
        return


def helius_api_key() -> str | None:
    load_dotenv()
    key = (os.environ.get("HELIUS_API_KEY") or "").strip()
    return key or None


def solana_rpc_url() -> str | None:
    """Preferred Solana RPC: explicit URL, else Helius from HELIUS_API_KEY."""
    load_dotenv()
    explicit = (os.environ.get("SOLANA_RPC_URL") or "").strip()
    if explicit:
        return explicit
    key = helius_api_key()
    if key:
        return f"https://mainnet.helius-rpc.com/?api-key={key}"
    return None


def has_helius() -> bool:
    load_dotenv()
    if helius_api_key():
        return True
    url = (os.environ.get("SOLANA_RPC_URL") or "").lower()
    return "helius" in url
