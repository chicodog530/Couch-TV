import os
import sys
import json
import asyncio
import logging
import threading
import argparse
from pathlib import Path

from flask import Flask, render_template, request, jsonify
from websockets.asyncio.server import serve
import websockets

# Ensure project root is in sys.path BEFORE any package imports
PROJECT_ROOT = Path(sys._MEIPASS) if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS") else Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from server.paths import get_bundle_dir, get_data_dir, ensure_config_files

ensure_config_files()

BUNDLE_DIR = get_bundle_dir()
DATA_DIR = get_data_dir()

from server.network_utils import get_local_ip, generate_qr_data_uri
from server.audio_controller import audio_ctrl
from server.input_controller import input_ctrl
from server.app_launcher import launcher
from server.cert_utils import get_ssl_context, ensure_ssl_certificates

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("CouchPC")

FLASK_HTTP_PORT = 5000
FLASK_HTTPS_PORT = 5443
WS_PORT = 5001
WSS_PORT = 5002

SETTINGS_PATH = DATA_DIR / "config" / "settings.json"

WALLPAPERS = [
    {"id": "aurora", "name": "Northern Aurora", "url": "/static/wallpapers/aurora.jpg"},
    {"id": "nebula", "name": "Deep Space Nebula", "url": "/static/wallpapers/nebula.jpg"},
    {"id": "cyberpunk", "name": "Cyberpunk Neon", "url": "/static/wallpapers/cyberpunk.jpg"},
    {"id": "sunset", "name": "Cinema Sunset", "url": "/static/wallpapers/sunset.jpg"},
    {"id": "oled", "name": "Midnight OLED", "url": "/static/wallpapers/oled.jpg"}
]

def load_settings():
    if SETTINGS_PATH.exists():
        try:
            with open(SETTINGS_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {"background": "/static/wallpapers/aurora.jpg", "theme": "glass"}

def save_settings(settings):
    try:
        with open(SETTINGS_PATH, "w", encoding="utf-8") as f:
            json.dump(settings, f, indent=2)
        return True
    except Exception:
        return False

# ----------------- Flask Web Server -----------------
template_dir = str(PROJECT_ROOT / "templates")
static_dir = str(PROJECT_ROOT / "static")
flask_app = Flask(__name__, template_folder=template_dir, static_folder=static_dir)

@flask_app.route("/")
@flask_app.route("/remote")
def remote_page():
    local_ip = get_local_ip()
    settings = load_settings()
    is_https = request.is_secure or request.scheme == "https"
    active_ws_port = WSS_PORT if is_https else WS_PORT
    return render_template(
        "remote.html",
        local_ip=local_ip,
        ws_port=active_ws_port,
        is_https=is_https,
        https_url=f"https://{local_ip}:{FLASK_HTTPS_PORT}",
        settings=settings
    )

@flask_app.route("/tv")
def tv_page():
    local_ip = get_local_ip()
    server_url = f"http://{local_ip}:{FLASK_HTTP_PORT}"
    https_url = f"https://{local_ip}:{FLASK_HTTPS_PORT}"
    qr_data_uri = generate_qr_data_uri(server_url)
    qr_https_uri = generate_qr_data_uri(https_url)
    settings = load_settings()
    return render_template(
        "tv.html",
        local_ip=local_ip,
        server_url=server_url,
        https_url=https_url,
        qr_code=qr_data_uri,
        qr_https=qr_https_uri,
        ws_port=WS_PORT,
        wallpapers=WALLPAPERS,
        settings=settings
    )

@flask_app.route("/api/shortcuts", methods=["GET"])
def get_shortcuts():
    return jsonify(launcher.load_shortcuts())

@flask_app.route("/api/shortcuts", methods=["POST"])
def add_shortcut():
    data = request.json or {}
    sc = launcher.add_shortcut(data)
    broadcast_shortcuts_update()
    return jsonify({"status": "ok", "shortcut": sc})

@flask_app.route("/api/shortcuts/<shortcut_id>", methods=["DELETE"])
def delete_shortcut(shortcut_id):
    success = launcher.delete_shortcut(shortcut_id)
    if success:
        broadcast_shortcuts_update()
    return jsonify({"status": "ok" if success else "not_found"})

@flask_app.route("/api/shortcuts/reorder", methods=["POST"])
def api_reorder_shortcuts():
    data = request.json or {}
    order = data.get("order", [])
    if order:
        reordered = launcher.reorder_shortcuts(order)
        broadcast_shortcuts_update()
        return jsonify({"status": "ok", "shortcuts": reordered})
    return jsonify({"status": "error", "message": "Missing order list"}), 400

@flask_app.route("/api/catalog", methods=["GET"])
def get_app_catalog():
    cat_path = DATA_DIR / "config" / "app_catalog.json"
    if not cat_path.exists():
        cat_path = BUNDLE_DIR / "config" / "app_catalog.json"
    if not cat_path.exists():
        return jsonify([])
    try:
        with open(cat_path, "r", encoding="utf-8") as f:
            return jsonify(json.load(f))
    except Exception as e:
        logger.error(f"Error loading catalog: {e}")
        return jsonify([])

@flask_app.route("/api/backgrounds", methods=["GET"])
def get_backgrounds():
    return jsonify(WALLPAPERS)

@flask_app.route("/api/settings", methods=["GET", "POST"])
def api_settings():
    if request.method == "POST":
        data = request.json or {}
        settings = load_settings()
        settings.update(data)
        save_settings(settings)
        broadcast_message_all({"type": "settings_updated", "settings": settings})
        return jsonify({"status": "ok", "settings": settings})
    return jsonify(load_settings())

@flask_app.route("/api/launch", methods=["POST"])
def api_launch():
    data = request.json or {}
    target = data.get("target", "")
    l_type = data.get("launch_type", "url")
    success = launcher.launch(target, l_type)
    return jsonify({"status": "ok" if success else "error"})

@flask_app.route("/api/volume", methods=["GET", "POST"])
def api_volume():
    if request.method == "POST":
        data = request.json or {}
        val = data.get("value", 50)
        audio_ctrl.set_volume(val)
        broadcast_volume_state()
    return jsonify({
        "volume": audio_ctrl.get_volume(),
        "muted": audio_ctrl.is_muted()
    })

# ----------------- WebSocket Server -----------------
connected_clients = set()
ws_loop = None

def broadcast_volume_state():
    broadcast_message_all({
        "type": "volume_state",
        "value": audio_ctrl.get_volume(),
        "muted": audio_ctrl.is_muted()
    })

def broadcast_shortcuts_update():
    broadcast_message_all({
        "type": "shortcuts_updated",
        "shortcuts": launcher.load_shortcuts()
    })

def broadcast_message_all(data_dict):
    if not ws_loop:
        return
    msg = json.dumps(data_dict)
    asyncio.run_coroutine_threadsafe(_broadcast_message(msg), ws_loop)

async def _broadcast_message(msg: str):
    if not connected_clients:
        return
    tasks = [ws.send(msg) for ws in connected_clients.copy()]
    if tasks:
        await asyncio.gather(*tasks, return_exceptions=True)

async def ws_handler(ws):
    connected_clients.add(ws)
    logger.info(f"Client connected. Total clients: {len(connected_clients)}")

    await ws.send(json.dumps({
        "type": "volume_state",
        "value": audio_ctrl.get_volume(),
        "muted": audio_ctrl.is_muted()
    }))

    try:
        async for message in ws:
            try:
                data = json.loads(message)
                msg_type = data.get("type")

                if msg_type == "mouse_move":
                    input_ctrl.move_mouse(data.get("dx", 0), data.get("dy", 0))
                elif msg_type == "mouse_click":
                    input_ctrl.click(data.get("button", "left"))
                elif msg_type == "mouse_down":
                    input_ctrl.mouse_down(data.get("button", "left"))
                elif msg_type == "mouse_up":
                    input_ctrl.mouse_up(data.get("button", "left"))
                elif msg_type == "mouse_scroll":
                    input_ctrl.scroll(data.get("delta", 0))
                elif msg_type == "type_text":
                    input_ctrl.type_text(data.get("text", ""))
                elif msg_type == "key_press":
                    input_ctrl.send_key_press(data.get("key", ""))
                elif msg_type == "hotkey":
                    input_ctrl.trigger_hotkey(data.get("combo", ""))
                elif msg_type == "set_volume":
                    audio_ctrl.set_volume(data.get("value", 50))
                    broadcast_volume_state()
                elif msg_type == "toggle_mute":
                    audio_ctrl.toggle_mute()
                    broadcast_volume_state()
                elif msg_type == "launch":
                    launcher.launch(data.get("target", ""), data.get("launch_type", "url"))
                elif msg_type == "get_status":
                    await ws.send(json.dumps({
                        "type": "volume_state",
                        "value": audio_ctrl.get_volume(),
                        "muted": audio_ctrl.is_muted()
                    }))
            except Exception as e:
                logger.error(f"Error handling WS packet: {e}")
    finally:
        connected_clients.discard(ws)
        logger.info(f"Client disconnected. Total clients: {len(connected_clients)}")

def start_ws_server():
    global ws_loop
    ws_loop = asyncio.new_event_loop()
    asyncio.set_event_loop(ws_loop)

    local_ip = get_local_ip()
    ssl_ctx = get_ssl_context(local_ip)

    async def main():
        # Plain WebSocket (ws://)
        server_ws = await serve(ws_handler, "0.0.0.0", WS_PORT)
        logger.info(f"WS server listening on ws://0.0.0.0:{WS_PORT}")
        
        # Secure WebSocket (wss://) for HTTPS / gyro
        server_wss = await serve(ws_handler, "0.0.0.0", WSS_PORT, ssl=ssl_ctx)
        logger.info(f"WSS server listening on wss://0.0.0.0:{WSS_PORT}")

        await asyncio.gather(server_ws.wait_closed(), server_wss.wait_closed())

    ws_loop.run_until_complete(main())

def start_flask_http():
    logger.info(f"Flask HTTP listening on http://0.0.0.0:{FLASK_HTTP_PORT}")
    flask_app.run(host="0.0.0.0", port=FLASK_HTTP_PORT, debug=False, use_reloader=False)

def start_flask_https():
    local_ip = get_local_ip()
    cert_path, key_path = ensure_ssl_certificates(local_ip)
    logger.info(f"Flask HTTPS listening on https://0.0.0.0:{FLASK_HTTPS_PORT}")
    flask_app.run(
        host="0.0.0.0",
        port=FLASK_HTTPS_PORT,
        debug=False,
        use_reloader=False,
        ssl_context=(cert_path, key_path)
    )

# ----------------- PySide6 GUI Components -----------------
try:
    from PySide6.QtWidgets import (
        QApplication, QMainWindow, QSystemTrayIcon, QMenu, QWidget, QPushButton,
        QHBoxLayout, QGraphicsOpacityEffect
    )
    from PySide6.QtWebEngineWidgets import QWebEngineView
    from PySide6.QtCore import QUrl, QObject, Signal, Qt, QTimer, QPropertyAnimation, QEasingCurve, QEvent
    from PySide6.QtGui import QIcon, QKeySequence, QShortcut, QCursor
    HAS_GUI = True
except ImportError:
    HAS_GUI = False

class WindowSignalBridge(QObject):
    switch_to_tv = Signal()
    switch_to_pc = Signal()
    show_back_btn = Signal()
    hide_back_btn = Signal()

class TvWindowManager:
    def __init__(self, bridge):
        self.bridge = bridge

    def show_and_focus(self):
        self.bridge.switch_to_tv.emit()

    def hide_or_minimize(self):
        self.bridge.switch_to_pc.emit()

    def show_back_button(self):
        self.bridge.show_back_btn.emit()

    def hide_back_button(self):
        self.bridge.hide_back_btn.emit()

class FloatingBackButton(QWidget):
    """Floating button pinned on top of any launched streaming app to return to the TV Launcher.
    Smoothly fades out during playback so user can experience full screen, and reappears when hovered."""
    def __init__(self, on_click):
        super().__init__()
        self.setWindowFlags(Qt.WindowStaysOnTopHint | Qt.FramelessWindowHint | Qt.Tool)
        self.setAttribute(Qt.WA_TranslucentBackground)

        layout = QHBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)

        self.btn = QPushButton("⬅ Back to TV Main Screen")
        self.btn.setCursor(Qt.PointingHandCursor)
        self.btn.setStyleSheet("""
            QPushButton {
                background: rgba(15, 23, 42, 0.94);
                color: #ffffff;
                border: 2px solid #38bdf8;
                border-radius: 20px;
                padding: 12px 26px;
                font-size: 15px;
                font-weight: 800;
                box-shadow: 0 4px 25px rgba(0, 0, 0, 0.8);
            }
            QPushButton:hover {
                background: #38bdf8;
                color: #0f172a;
                border-color: #ffffff;
                box-shadow: 0 0 30px rgba(56, 189, 248, 0.95);
            }
        """)
        self.btn.clicked.connect(on_click)
        layout.addWidget(self.btn)
        self.btn.installEventFilter(self)

        # Smooth Opacity Effect and Property Animation
        self.opacity_effect = QGraphicsOpacityEffect(self)
        self.setGraphicsEffect(self.opacity_effect)
        self.opacity_effect.setOpacity(1.0)

        self.anim = QPropertyAnimation(self.opacity_effect, b"opacity")

        # Auto-fade timer: starts after showing or leaving hover
        self.fade_timer = QTimer(self)
        self.fade_timer.setSingleShot(True)
        self.fade_timer.timeout.connect(self.fade_out)

        # Position in top-left
        self.move(30, 25)

    def fade_to(self, target_opacity: float, duration_ms: int = 300):
        self.anim.stop()
        self.anim.setDuration(duration_ms)
        self.anim.setStartValue(self.opacity_effect.opacity())
        self.anim.setEndValue(target_opacity)
        self.anim.setEasingCurve(QEasingCurve.InOutQuad)
        self.anim.start()

    def fade_in(self):
        self.fade_timer.stop()
        self.fade_to(1.0, 250)

    def fade_out(self):
        # 0.02 keeps hit-testing alive in Windows DWM while being virtually invisible during full screen video
        self.fade_to(0.02, 600)

    def show_and_reset(self):
        self.fade_timer.stop()
        self.anim.stop()
        self.opacity_effect.setOpacity(1.0)
        self.show()
        self.raise_()
        self.fade_timer.start(3500)

    def hide(self):
        self.fade_timer.stop()
        self.anim.stop()
        super().hide()

    def enterEvent(self, event):
        self.fade_in()
        super().enterEvent(event)

    def leaveEvent(self, event):
        if not self.rect().contains(self.mapFromGlobal(QCursor.pos())):
            self.fade_timer.start(2500)
        super().leaveEvent(event)

    def eventFilter(self, watched, event):
        if watched == self.btn:
            if event.type() == QEvent.Enter:
                self.fade_in()
            elif event.type() == QEvent.Leave:
                if not self.rect().contains(self.mapFromGlobal(QCursor.pos())):
                    self.fade_timer.start(2500)
        return super().eventFilter(watched, event)

class FloatingTvPill(QWidget):
    """Always-on-top pill button on desktop to return to TV mode."""
    def __init__(self, on_click):
        super().__init__()
        self.setWindowFlags(Qt.WindowStaysOnTopHint | Qt.FramelessWindowHint | Qt.Tool)
        self.setAttribute(Qt.WA_TranslucentBackground)

        layout = QHBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)

        self.btn = QPushButton("📺 Return to TV Mode")
        self.btn.setCursor(Qt.PointingHandCursor)
        self.btn.setStyleSheet("""
            QPushButton {
                background: rgba(15, 23, 42, 0.92);
                color: #38bdf8;
                border: 2px solid #6366f1;
                border-radius: 18px;
                padding: 10px 20px;
                font-size: 14px;
                font-weight: 800;
            }
            QPushButton:hover {
                background: #6366f1;
                color: #ffffff;
                box-shadow: 0 0 15px rgba(99, 102, 241, 0.8);
            }
        """)
        self.btn.clicked.connect(on_click)
        layout.addWidget(self.btn)

        screen = QApplication.primaryScreen().geometry()
        self.move(screen.width() - 210, 20)

class TvWindow(QMainWindow):
    def __init__(self, url: str, bridge: WindowSignalBridge):
        super().__init__()
        self.setWindowTitle("CouchPC TV Launcher")
        self.bridge = bridge

        self.browser = QWebEngineView(self)
        self.browser.setUrl(QUrl(url))
        self.setCentralWidget(self.browser)

        # Floating overlay buttons
        self.floating_pill = FloatingTvPill(self.activate_tv_mode)
        self.floating_back_btn = FloatingBackButton(self.handle_back_to_tv)

        # Connect signals
        self.bridge.switch_to_tv.connect(self.activate_tv_mode)
        self.bridge.switch_to_pc.connect(self.activate_pc_mode)
        self.bridge.show_back_btn.connect(self.floating_back_btn.show_and_reset)
        self.bridge.hide_back_btn.connect(self.floating_back_btn.hide)

        # Hotkeys
        self.shortcut_esc = QShortcut(QKeySequence(Qt.Key_Escape), self)
        self.shortcut_esc.activated.connect(self.activate_pc_mode)

        self.shortcut_f11 = QShortcut(QKeySequence(Qt.Key_F11), self)
        self.shortcut_f11.activated.connect(self.toggle_fullscreen)

        self.showFullScreen()

    def handle_back_to_tv(self):
        launcher.close_active_app()
        self.activate_tv_mode()

    def activate_tv_mode(self):
        self.floating_pill.hide()
        self.floating_back_btn.hide()
        self.showFullScreen()
        self.raise_()
        self.activateWindow()

    def activate_pc_mode(self):
        self.showMinimized()
        self.floating_pill.show()

    def toggle_fullscreen(self):
        if self.isFullScreen():
            self.showNormal()
        else:
            self.showFullScreen()

def run_gui():
    os.environ["QTWEBENGINE_CHROMIUM_FLAGS"] = "--disable-features=UseChromeOSDirectVideoDecoder --enable-gpu-rasterization --ignore-gpu-blocklist"
    tv_url = f"http://127.0.0.1:{FLASK_HTTP_PORT}/tv"

    app = QApplication.instance() or QApplication(sys.argv)
    app.setApplicationName("CouchPC")

    bridge = WindowSignalBridge()
    wm = TvWindowManager(bridge)
    launcher.set_window_manager(wm)

    window = TvWindow(tv_url, bridge)

    icon_path = str(PROJECT_ROOT / "static" / "icons" / "remote_icon.png")
    tray = QSystemTrayIcon(QIcon(icon_path), app)
    tray.setToolTip("CouchPC TV Controller")

    menu = QMenu()
    act_tv = menu.addAction("📺 TV Mode (Fullscreen)")
    act_pc = menu.addAction("💻 PC Desktop Mode")
    menu.addSeparator()
    act_quit = menu.addAction("Quit CouchPC")

    act_tv.triggered.connect(window.activate_tv_mode)
    act_pc.triggered.connect(window.activate_pc_mode)
    act_quit.triggered.connect(app.quit)

    tray.setContextMenu(menu)
    tray.activated.connect(lambda reason: window.activate_tv_mode() if reason == QSystemTrayIcon.DoubleClick else None)
    tray.show()

    sys.exit(app.exec())

# ----------------- Main Entrypoint -----------------
def main():
    parser = argparse.ArgumentParser(description="CouchPC - TV Box & Remote Server")
    parser.add_argument("--headless", action="store_true", help="Run background server only")
    args = parser.parse_args()

    # Start HTTP & HTTPS Flask servers in threads
    t_http = threading.Thread(target=start_flask_http, daemon=True)
    t_http.start()

    t_https = threading.Thread(target=start_flask_https, daemon=True)
    t_https.start()

    # Start WebSocket servers
    t_ws = threading.Thread(target=start_ws_server, daemon=True)
    t_ws.start()

    local_ip = get_local_ip()
    print("=" * 60)
    print("[*] CouchPC is running!")
    print(f"-> Standard Web Remote: http://{local_ip}:{FLASK_HTTP_PORT}/remote")
    print(f"-> Secure Gyro Remote:   https://{local_ip}:{FLASK_HTTPS_PORT}/remote")
    print(f"-> TV Box Mode:          http://{local_ip}:{FLASK_HTTP_PORT}/tv")
    print("=" * 60)

    if args.headless or not HAS_GUI:
        try:
            while True:
                threading.Event().wait(1)
        except KeyboardInterrupt:
            print("\nShutting down CouchPC...")
    else:
        run_gui()

if __name__ == "__main__":
    main()
