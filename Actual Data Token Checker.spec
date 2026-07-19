# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['C:\\Users\\levyr\\GrokScreener\\desktop_app.py'],
    pathex=['C:\\Users\\levyr\\GrokScreener'],
    binaries=[],
    datas=[('C:\\Users\\levyr\\GrokScreener\\token_tracker', 'token_tracker'), ('C:\\Users\\levyr\\GrokScreener\\market_data', 'market_data')],
    hiddenimports=['token_tracker', 'token_tracker.analyze', 'token_tracker.dexscreener', 'token_tracker.geckoterminal', 'token_tracker.sentiment', 'token_tracker.narrative', 'token_tracker.report', 'token_tracker.http_util', 'token_tracker.holders', 'token_tracker.holder_sources', 'token_tracker.wallet_lookup', 'token_tracker.rugwatch_bridge', 'token_tracker.bundles', 'token_tracker.bundle_sources', 'token_tracker.bundle_fusion', 'token_tracker.env_config', 'token_tracker.social_sources', 'token_tracker.coin_facts', 'token_tracker.alerts', 'token_tracker.bubblemaps', 'token_tracker.pumpfun', 'token_tracker.cli', 'market_data', 'market_data.client', 'market_data.db', 'market_data.paths', 'market_data.collector', 'market_data.api_server', 'certifi'],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='Actual Data Token Checker',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='Actual Data Token Checker',
)
