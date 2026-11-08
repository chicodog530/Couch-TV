import json
import os
import subprocess
import webbrowser
import logging
import time
import threading
from pathlib import Path

logger = logging.getLogger(__name__)

CONFIG_PATH = Path(__file__).parent.parent / "config" / "shortcuts.json"
PROFILE_DIR = Path(__file__).parent.parent / "browser_profile"

CHROME_PATH = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
EDGE_PATH = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"

class AppLauncher:
    def __init__(self):
        self.tv_window_manager = None
        self.active_app_proc = None

    def set_window_manager(self, manager):
        self.tv_window_manager = manager

    def load_shortcuts(self):
        if not CONFIG_PATH.exists():
            return []
        try:
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Error loading shortcuts: {e}")
            return []

    def save_shortcuts(self, shortcuts):
        try:
            with open(CONFIG_PATH, "w", encoding="utf-8") as f:
                json.dump(shortcuts, f, indent=2)
            return True
        except Exception as e:
            logger.error(f"Error saving shortcuts: {e}")
            return False

    def add_shortcut(self, shortcut):
        shortcuts = self.load_shortcuts()
        if "id" not in shortcut or not shortcut["id"]:
            import uuid
            shortcut["id"] = "sc_" + str(uuid.uuid4())[:8]
        shortcuts.append(shortcut)
        self.save_shortcuts(shortcuts)
        return shortcut

    def delete_shortcut(self, shortcut_id):
        shortcuts = self.load_shortcuts()
        filtered = [s for s in shortcuts if s.get("id") != shortcut_id]
        if len(filtered) != len(shortcuts):
            self.save_shortcuts(filtered)
            return True
        return False

    def reorder_shortcuts(self, ordered_ids: list):
        """Reorders the shortcuts list according to the list of IDs."""
        shortcuts = self.load_shortcuts()
        sc_map = {s.get("id"): s for s in shortcuts}
        new_list = []
        for sid in ordered_ids:
            if sid in sc_map:
                new_list.append(sc_map[sid])
                del sc_map[sid]
        # Append any remaining that weren't in ordered_ids
        for remaining in sc_map.values():
            new_list.append(remaining)
        self.save_shortcuts(new_list)
        return new_list

    def launch(self, target: str, launch_type: str = "url"):
        target = target.strip()
        logger.info(f"Launching target: {target} (type: {launch_type})")

        if target == "pc_mode":
            self.switch_to_pc_mode()
            return True

        if target == "tv_mode":
            self.switch_to_tv_mode()
            return True

        # Close any previous app session first
        self.close_active_app()

        # URL Launching in TRUE 100% Fullscreen
        if target.startswith("http://") or target.startswith("https://"):
            browser_bin = None
            if os.path.exists(CHROME_PATH):
                browser_bin = CHROME_PATH
            elif os.path.exists(EDGE_PATH):
                browser_bin = EDGE_PATH

            if browser_bin:
                try:
                    PROFILE_DIR.mkdir(parents=True, exist_ok=True)
                    # Chromium flags to enforce full screen kiosk/app mode
                    args = [
                        browser_bin,
                        f"--app={target}",
                        "--start-fullscreen",
                        "--new-window",
                        "--window-position=0,0",
                        "--window-size=1920,1080",
                        f"--user-data-dir={str(PROFILE_DIR)}",
                        "--no-first-run",
                        "--no-default-browser-check"
                    ]
                    self.active_app_proc = subprocess.Popen(args)
                    
                    # Ensure window gets maximized via Win32 in background
                    threading.Thread(target=self._maximize_window_thread, args=(self.active_app_proc.pid,), daemon=True).start()

                    # Show "Back to TV" overlay button
                    if self.tv_window_manager:
                        self.tv_window_manager.show_back_button()

                    return True
                except Exception as e:
                    logger.warning(f"Failed to launch browser in app mode, falling back: {e}")

            webbrowser.open(target)
            if self.tv_window_manager:
                self.tv_window_manager.show_back_button()
            return True

        # Custom URI (e.g. steam://) or executable
        try:
            self.active_app_proc = subprocess.Popen(target, shell=True)
            if self.tv_window_manager:
                self.tv_window_manager.show_back_button()
            return True
        except Exception as e:
            logger.error(f"Failed to launch app: {e}")
            try:
                os.startfile(target)
                if self.tv_window_manager:
                    self.tv_window_manager.show_back_button()
                return True
            except Exception as e2:
                logger.error(f"Failed startfile: {e2}")
                return False

    def _maximize_window_thread(self, pid: int):
        """Monitors and ensures the launched app window is maximized full screen."""
        try:
            import win32gui
            import win32con
            import win32process
        except ImportError:
            return

        for _ in range(4):
            time.sleep(0.4)
            hwnds = []
            def enum_cb(hwnd, _):
                if win32gui.IsWindowVisible(hwnd):
                    _, win_pid = win32process.GetWindowThreadProcessId(hwnd)
                    if win_pid == pid:
                        hwnds.append(hwnd)
                return True
            try:
                win32gui.EnumWindows(enum_cb, None)
                for h in hwnds:
                    win32gui.ShowWindow(h, win32con.SW_MAXIMIZE)
            except Exception:
                pass

    def close_active_app(self):
        """Closes any currently active streaming or app window."""
        if self.active_app_proc:
            try:
                self.active_app_proc.terminate()
            except Exception:
                pass
            self.active_app_proc = None

        if self.tv_window_manager:
            self.tv_window_manager.hide_back_button()

    def switch_to_pc_mode(self):
        """Minimizes TV mode and reveals Windows desktop."""
        if self.tv_window_manager:
            self.tv_window_manager.hide_or_minimize()
        from server.input_controller import input_ctrl
        input_ctrl.trigger_hotkey("win_d")

    def switch_to_tv_mode(self):
        """Restores and focuses the TV fullscreen launcher."""
        self.close_active_app()
        if self.tv_window_manager:
            self.tv_window_manager.show_and_focus()

launcher = AppLauncher()
