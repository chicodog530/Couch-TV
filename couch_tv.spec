# -*- mode: python ; coding: utf-8 -*-
import sys
from pathlib import Path

block_cipher = None

project_dir = Path(r"C:\Users\chico\.gemini\antigravity\scratch\couch-pc")

added_files = [
    (str(project_dir / 'templates'), 'templates'),
    (str(project_dir / 'static'), 'static'),
    (str(project_dir / 'config' / 'shortcuts.json'), 'config'),
    (str(project_dir / 'config' / 'app_catalog.json'), 'config'),
    (str(project_dir / 'config' / 'settings.json'), 'config'),
]

hidden_imports = [
    'flask',
    'jinja2',
    'werkzeug',
    'websockets',
    'websockets.asyncio',
    'websockets.asyncio.server',
    'pycaw',
    'pycaw.pycaw',
    'comtypes',
    'comtypes.client',
    'comtypes.stream',
    'PySide6',
    'PySide6.QtCore',
    'PySide6.QtGui',
    'PySide6.QtWidgets',
    'PySide6.QtWebEngineCore',
    'PySide6.QtWebEngineWidgets',
    'qrcode',
    'qrcode.image.pil',
    'PIL',
    'PIL.Image',
    'cryptography',
    'cryptography.x509',
    'cryptography.hazmat.primitives',
    'cryptography.hazmat.primitives.asymmetric',
    'cryptography.hazmat.primitives.asymmetric.rsa',
    'cryptography.hazmat.primitives.hashes',
    'cryptography.hazmat.primitives.serialization',
    'win32gui',
    'win32con',
    'win32process',
    'win32api',
]

a = Analysis(
    ['server/app.py'],
    pathex=[str(project_dir)],
    binaries=[],
    datas=added_files,
    hiddenimports=hidden_imports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['tkinter', 'matplotlib', 'numpy', 'scipy', 'pandas'],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='Couch-TV',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
    disable_windowed_traceback=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=str(project_dir / 'static' / 'icons' / 'icon.ico'),
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name='Couch-TV',
)
