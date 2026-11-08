import socket
import base64
import io

try:
    import segno
    HAS_SEGNO = True
except ImportError:
    HAS_SEGNO = False

try:
    import qrcode
    HAS_QRCODE = True
except ImportError:
    HAS_QRCODE = False

def get_local_ip() -> str:
    """
    Returns the primary local IPv4 address reachable on the local network.
    """
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        # Connect to a public IP; does not actually send packets but resolves route
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
    except Exception:
        ip = '127.0.0.1'
    finally:
        s.close()
    return ip

def generate_qr_data_uri(url: str, scale: int = 5) -> str:
    """
    Generates a PNG data URI for the given URL to display in HTML.
    Supports either segno or qrcode.
    """
    if HAS_SEGNO:
        qr = segno.make_qr(url)
        return qr.png_data_uri(scale=scale, dark='#000000', light='#ffffff')
    elif HAS_QRCODE:
        img = qrcode.make(url)
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        b64 = base64.b64encode(buf.getvalue()).decode("ascii")
        return f"data:image/png;base64,{b64}"
    return ""
