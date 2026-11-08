import os
import datetime
import ipaddress
import ssl
from pathlib import Path
from cryptography import x509
from cryptography.x509.oid import NameOID
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives import serialization

CERTS_DIR = Path(__file__).parent.parent / "config" / "certs"
CERT_FILE = CERTS_DIR / "couchpc_cert.pem"
KEY_FILE = CERTS_DIR / "couchpc_key.pem"

def ensure_ssl_certificates(local_ip: str = "127.0.0.1") -> tuple[str, str]:
    """
    Generates a local self-signed certificate if one doesn't exist.
    Returns (cert_path, key_path).
    """
    CERTS_DIR.mkdir(parents=True, exist_ok=True)

    if CERT_FILE.exists() and KEY_FILE.exists():
        return str(CERT_FILE), str(KEY_FILE)

    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)

    subject = issuer = x509.Name([
        x509.NameAttribute(NameOID.COMMON_NAME, "CouchPC Local"),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, "CouchPC"),
    ])

    san_list = [
        x509.DNSName("localhost"),
        x509.IPAddress(ipaddress.ip_address("127.0.0.1")),
    ]
    try:
        if local_ip and local_ip != "127.0.0.1":
            san_list.append(x509.IPAddress(ipaddress.ip_address(local_ip)))
    except Exception:
        pass

    cert = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(datetime.datetime.now(datetime.timezone.utc))
        .not_valid_after(datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=3650))
        .add_extension(x509.SubjectAlternativeName(san_list), critical=False)
        .sign(key, hashes.SHA256())
    )

    with open(KEY_FILE, "wb") as f:
        f.write(key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.TraditionalOpenSSL,
            encryption_algorithm=serialization.NoEncryption(),
        ))

    with open(CERT_FILE, "wb") as f:
        f.write(cert.public_bytes(serialization.Encoding.PEM))

    return str(CERT_FILE), str(KEY_FILE)

def get_ssl_context(local_ip: str = "127.0.0.1") -> ssl.SSLContext:
    cert_path, key_path = ensure_ssl_certificates(local_ip)
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ctx.load_cert_chain(certfile=cert_path, keyfile=key_path)
    return ctx
