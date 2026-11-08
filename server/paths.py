import sys
import shutil
from pathlib import Path

def get_bundle_dir() -> Path:
    """Returns the read-only directory containing bundled assets (templates, static, default configs)."""
    if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
        return Path(sys._MEIPASS)
    return Path(__file__).parent.parent

def get_data_dir() -> Path:
    """Returns the persistent writable directory next to the executable (or project root)."""
    if getattr(sys, "frozen", False):
        return Path(sys.executable).parent
    return Path(__file__).parent.parent

def ensure_config_files():
    """Copies default bundled config files to the writable data dir if not already present."""
    bundle_cfg = get_bundle_dir() / "config"
    data_cfg = get_data_dir() / "config"
    data_cfg.mkdir(parents=True, exist_ok=True)

    for cfg_name in ["shortcuts.json", "app_catalog.json", "settings.json"]:
        dest = data_cfg / cfg_name
        src = bundle_cfg / cfg_name
        if not dest.exists() and src.exists():
            try:
                shutil.copy2(src, dest)
            except Exception as e:
                print(f"[!] Warning copying default {cfg_name}: {e}")
