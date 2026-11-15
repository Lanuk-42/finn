"""Quote verification. The model may only *quote*; code decides whether the quote is real."""
import re
import unicodedata

_TRANS = str.maketrans({"‘": "'", "’": "'", "“": '"', "”": '"', "–": "-", "—": "-",
                        "•": " ", " ": " ", "₹": "rs "})


def norm(s):
    s = unicodedata.normalize("NFKC", s or "").translate(_TRANS).lower()
    s = re.sub(r"-\s*\n\s*", "", s)            # words hyphenated across line breaks
    s = re.sub(r"rs\.?\s*", "rs ", s)
    s = re.sub(r"[^a-z0-9%.,'\"()/&+ -]", " ", s)  # drop symbols that PDFs mangle
    return re.sub(r"\s+", " ", s).strip()


def quote_in_text(quote, text):
    """True if the quote appears verbatim (after whitespace/typography normalisation).
    An ellipsis splits a quote into parts that must appear in order."""
    if not quote or len(quote.strip()) < 12:
        return False
    t = norm(text)
    pos = 0
    for part in re.split(r"\.\.\.|…", quote):
        p = norm(part)
        if len(p) < 6:
            continue
        i = t.find(p, pos)
        if i < 0:
            return False
        pos = i + len(p)
    return pos > 0


def numbers_in(s):
    return [float(x.replace(",", "")) for x in re.findall(r"\d+(?:,\d{3})*(?:\.\d+)?", s or "")]
