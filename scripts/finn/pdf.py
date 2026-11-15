"""Download a filing PDF and extract its text (cached on disk by URL hash)."""
import hashlib
import io

import requests
from pypdf import PdfReader

from .config import DATA, UA

CACHE = DATA / "cache" / "pdf"


def _key(url):
    return hashlib.sha256(url.encode()).hexdigest()[:24]


def text(url, max_pages=40):
    """Plain text of the PDF at url ('' if not a readable text PDF). Cached."""
    if not url:
        return ""
    CACHE.mkdir(parents=True, exist_ok=True)
    p = CACHE / f"{_key(url)}.txt"
    if p.exists():
        return p.read_text()
    out = ""
    alt = [url]
    if "/AttachHis/" in url:
        alt.append(url.replace("/AttachHis/", "/AttachLive/"))
    elif "/AttachLive/" in url:
        alt.append(url.replace("/AttachLive/", "/AttachHis/"))
    r = None
    for u in alt:
        try:
            r = requests.get(u, headers={"User-Agent": UA, "Referer": "https://www.bseindia.com/"}, timeout=60)
        except requests.RequestException:
            r = None  # host unreachable (e.g. company IR site not on the network allowlist)
            continue
        if r.status_code == 200 and r.content[:4] == b"%PDF":
            break
    if r is None:
        return ""  # not cached: a later run may reach it
    if r.status_code == 200 and r.content[:4] == b"%PDF":
        try:
            reader = PdfReader(io.BytesIO(r.content))
            out = "\n".join((pg.extract_text() or "") for pg in reader.pages[:max_pages])
        except Exception:  # noqa: BLE001  (corrupt / encrypted PDFs -> treated as unreadable)
            out = ""
    p.write_text(out)
    return out
