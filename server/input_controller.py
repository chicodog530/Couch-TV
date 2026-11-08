import ctypes
from ctypes import wintypes
import time

user32 = ctypes.windll.user32

# Win32 Constants
INPUT_MOUSE = 0
INPUT_KEYBOARD = 1
INPUT_HARDWARE = 2

# Mouse flags
MOUSEEVENTF_MOVE = 0x0001
MOUSEEVENTF_LEFTDOWN = 0x0002
MOUSEEVENTF_LEFTUP = 0x0004
MOUSEEVENTF_RIGHTDOWN = 0x0008
MOUSEEVENTF_RIGHTUP = 0x0010
MOUSEEVENTF_MIDDLEDOWN = 0x0020
MOUSEEVENTF_MIDDLEUP = 0x0040
MOUSEEVENTF_WHEEL = 0x0800
MOUSEEVENTF_HWHEEL = 0x1000

# Keyboard flags
KEYEVENTF_EXTENDEDKEY = 0x0001
KEYEVENTF_KEYUP = 0x0002
KEYEVENTF_UNICODE = 0x0004
KEYEVENTF_SCANCODE = 0x0008

# Virtual Key Codes
VK_MAP = {
    'backspace': 0x08,
    'tab': 0x09,
    'enter': 0x0D,
    'return': 0x0D,
    'shift': 0x10,
    'ctrl': 0x11,
    'control': 0x11,
    'alt': 0x12,
    'pause': 0x13,
    'caps_lock': 0x14,
    'escape': 0x1B,
    'esc': 0x1B,
    'space': 0x20,
    'pageup': 0x21,
    'pagedown': 0x22,
    'end': 0x23,
    'home': 0x24,
    'left': 0x25,
    'up': 0x26,
    'right': 0x27,
    'down': 0x28,
    'insert': 0x2D,
    'delete': 0x2E,
    'win': 0x5B,
    'lwin': 0x5B,
    'rwin': 0x5C,
    'volume_mute': 0xAD,
    'volume_down': 0xAE,
    'volume_up': 0xAF,
    'media_next': 0xB0,
    'media_prev': 0xB1,
    'media_stop': 0xB2,
    'media_play_pause': 0xCD,
    'f1': 0x70,
    'f2': 0x71,
    'f3': 0x72,
    'f4': 0x73,
    'f5': 0x74,
    'f6': 0x75,
    'f7': 0x76,
    'f8': 0x77,
    'f9': 0x78,
    'f10': 0x79,
    'f11': 0x7A,
    'f12': 0x7B,
}

class MOUSEINPUT(ctypes.Structure):
    _fields_ = [
        ('dx', wintypes.LONG),
        ('dy', wintypes.LONG),
        ('mouseData', wintypes.DWORD),
        ('dwFlags', wintypes.DWORD),
        ('time', wintypes.DWORD),
        ('dwExtraInfo', ctypes.c_size_t),
    ]

class KEYBDINPUT(ctypes.Structure):
    _fields_ = [
        ('wVk', wintypes.WORD),
        ('wScan', wintypes.WORD),
        ('dwFlags', wintypes.DWORD),
        ('time', wintypes.DWORD),
        ('dwExtraInfo', ctypes.c_size_t),
    ]

class HARDWAREINPUT(ctypes.Structure):
    _fields_ = [
        ('uMsg', wintypes.DWORD),
        ('wParamL', wintypes.WORD),
        ('wParamH', wintypes.WORD),
    ]

class _INPUT_UNION(ctypes.Union):
    _fields_ = [
        ('mi', MOUSEINPUT),
        ('ki', KEYBDINPUT),
        ('hi', HARDWAREINPUT),
    ]

class INPUT(ctypes.Structure):
    _fields_ = [
        ('type', wintypes.DWORD),
        ('union', _INPUT_UNION),
    ]

def _send_inputs(inputs):
    n_inputs = len(inputs)
    arr = (INPUT * n_inputs)(*inputs)
    user32.SendInput(n_inputs, arr, ctypes.sizeof(INPUT))

class InputController:
    def __init__(self):
        self.is_dragging = False

    def move_mouse(self, dx: float, dy: float, acceleration: float = 1.35):
        """Relative mouse move with natural acceleration curve."""
        # Non-linear acceleration for natural trackpad feel
        dist = (dx**2 + dy**2)**0.5
        factor = 1.0 + (dist * 0.05 * (acceleration - 1.0))
        
        target_dx = int(round(dx * factor))
        target_dy = int(round(dy * factor))
        
        inp = INPUT()
        inp.type = INPUT_MOUSE
        inp.union.mi.dx = target_dx
        inp.union.mi.dy = target_dy
        inp.union.mi.dwFlags = MOUSEEVENTF_MOVE
        _send_inputs([inp])

    def mouse_down(self, button: str = 'left'):
        inp = INPUT()
        inp.type = INPUT_MOUSE
        if button == 'right':
            inp.union.mi.dwFlags = MOUSEEVENTF_RIGHTDOWN
        elif button == 'middle':
            inp.union.mi.dwFlags = MOUSEEVENTF_MIDDLEDOWN
        else:
            inp.union.mi.dwFlags = MOUSEEVENTF_LEFTDOWN
        _send_inputs([inp])
        if button == 'left':
            self.is_dragging = True

    def mouse_up(self, button: str = 'left'):
        inp = INPUT()
        inp.type = INPUT_MOUSE
        if button == 'right':
            inp.union.mi.dwFlags = MOUSEEVENTF_RIGHTUP
        elif button == 'middle':
            inp.union.mi.dwFlags = MOUSEEVENTF_MIDDLEUP
        else:
            inp.union.mi.dwFlags = MOUSEEVENTF_LEFTUP
        _send_inputs([inp])
        if button == 'left':
            self.is_dragging = False

    def click(self, button: str = 'left'):
        self.mouse_down(button)
        time.sleep(0.015)
        self.mouse_up(button)

    def double_click(self, button: str = 'left'):
        self.click(button)
        time.sleep(0.05)
        self.click(button)

    def scroll(self, delta_y: int):
        """Scroll vertical: positive is up, negative is down."""
        inp = INPUT()
        inp.type = INPUT_MOUSE
        # WHEEL_DELTA is 120
        inp.union.mi.mouseData = int(delta_y)
        inp.union.mi.dwFlags = MOUSEEVENTF_WHEEL
        _send_inputs([inp])

    def send_key_press(self, key_name: str):
        key = key_name.lower().strip()
        vk = VK_MAP.get(key)
        if not vk:
            return
        
        down = INPUT()
        down.type = INPUT_KEYBOARD
        down.union.ki.wVk = vk
        
        up = INPUT()
        up.type = INPUT_KEYBOARD
        up.union.ki.wVk = vk
        up.union.ki.dwFlags = KEYEVENTF_KEYUP
        
        _send_inputs([down, up])

    def type_text(self, text: str):
        """Types string directly as Unicode characters."""
        inputs = []
        for char in text:
            code = ord(char)
            # UTF-16 surrogate pairs support for emojis
            if code > 0xFFFF:
                code -= 0x10000
                high = 0xD800 + (code >> 10)
                low = 0xDC00 + (code & 0x3FF)
                for c in (high, low):
                    down = INPUT()
                    down.type = INPUT_KEYBOARD
                    down.union.ki.wVk = 0
                    down.union.ki.wScan = c
                    down.union.ki.dwFlags = KEYEVENTF_UNICODE
                    up = INPUT()
                    up.type = INPUT_KEYBOARD
                    up.union.ki.wVk = 0
                    up.union.ki.wScan = c
                    up.union.ki.dwFlags = KEYEVENTF_UNICODE | KEYEVENTF_KEYUP
                    inputs.extend([down, up])
            else:
                down = INPUT()
                down.type = INPUT_KEYBOARD
                down.union.ki.wVk = 0
                down.union.ki.wScan = code
                down.union.ki.dwFlags = KEYEVENTF_UNICODE
                up = INPUT()
                up.type = INPUT_KEYBOARD
                up.union.ki.wVk = 0
                up.union.ki.wScan = code
                up.union.ki.dwFlags = KEYEVENTF_UNICODE | KEYEVENTF_KEYUP
                inputs.extend([down, up])
        
        if inputs:
            _send_inputs(inputs)

    def trigger_hotkey(self, combo: str):
        """Supported combos: 'win_d', 'alt_tab', 'alt_f4', 'ctrl_c', 'ctrl_v', 'ctrl_z'"""
        combo = combo.lower()
        if combo == 'win_d':
            # Toggle desktop (PC mode)
            down1 = INPUT(type=INPUT_KEYBOARD, union=_INPUT_UNION(ki=KEYBDINPUT(wVk=VK_MAP['win'], wScan=0, dwFlags=0, time=0, dwExtraInfo=0)))
            down2 = INPUT(type=INPUT_KEYBOARD, union=_INPUT_UNION(ki=KEYBDINPUT(wVk=ord('D'), wScan=0, dwFlags=0, time=0, dwExtraInfo=0)))
            up2 = INPUT(type=INPUT_KEYBOARD, union=_INPUT_UNION(ki=KEYBDINPUT(wVk=ord('D'), wScan=0, dwFlags=KEYEVENTF_KEYUP, time=0, dwExtraInfo=0)))
            up1 = INPUT(type=INPUT_KEYBOARD, union=_INPUT_UNION(ki=KEYBDINPUT(wVk=VK_MAP['win'], wScan=0, dwFlags=KEYEVENTF_KEYUP, time=0, dwExtraInfo=0)))
            _send_inputs([down1, down2, up2, up1])
        elif combo == 'alt_tab':
            down1 = INPUT(type=INPUT_KEYBOARD, union=_INPUT_UNION(ki=KEYBDINPUT(wVk=VK_MAP['alt'], wScan=0, dwFlags=0, time=0, dwExtraInfo=0)))
            down2 = INPUT(type=INPUT_KEYBOARD, union=_INPUT_UNION(ki=KEYBDINPUT(wVk=VK_MAP['tab'], wScan=0, dwFlags=0, time=0, dwExtraInfo=0)))
            up2 = INPUT(type=INPUT_KEYBOARD, union=_INPUT_UNION(ki=KEYBDINPUT(wVk=VK_MAP['tab'], wScan=0, dwFlags=KEYEVENTF_KEYUP, time=0, dwExtraInfo=0)))
            up1 = INPUT(type=INPUT_KEYBOARD, union=_INPUT_UNION(ki=KEYBDINPUT(wVk=VK_MAP['alt'], wScan=0, dwFlags=KEYEVENTF_KEYUP, time=0, dwExtraInfo=0)))
            _send_inputs([down1, down2, up2, up1])
        elif combo == 'alt_f4':
            down1 = INPUT(type=INPUT_KEYBOARD, union=_INPUT_UNION(ki=KEYBDINPUT(wVk=VK_MAP['alt'], wScan=0, dwFlags=0, time=0, dwExtraInfo=0)))
            down2 = INPUT(type=INPUT_KEYBOARD, union=_INPUT_UNION(ki=KEYBDINPUT(wVk=VK_MAP['f4'], wScan=0, dwFlags=0, time=0, dwExtraInfo=0)))
            up2 = INPUT(type=INPUT_KEYBOARD, union=_INPUT_UNION(ki=KEYBDINPUT(wVk=VK_MAP['f4'], wScan=0, dwFlags=KEYEVENTF_KEYUP, time=0, dwExtraInfo=0)))
            up1 = INPUT(type=INPUT_KEYBOARD, union=_INPUT_UNION(ki=KEYBDINPUT(wVk=VK_MAP['alt'], wScan=0, dwFlags=KEYEVENTF_KEYUP, time=0, dwExtraInfo=0)))
            _send_inputs([down1, down2, up2, up1])

input_ctrl = InputController()
