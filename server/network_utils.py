import socket
import segno

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
    """
    qr = segno.make_qr(url)
    return qr.png_data_uri(scale=scale, dark='#000000', light='#ffffff')
