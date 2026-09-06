#!/usr/bin/env python3
"""
build_index.py — turn the original crawl output into a lightweight JSON index
for the web UI.

Reads:
  ../web_crawler/crawler_doc/crawled_urls.txt   (500 title / URL pairs)
  ../web_crawler/crawled_html_pages/*.html      (462 saved pages)

Writes:
  public/data/crawl-index.json

The JSON keeps only what the archive browser needs: title, URL, which of the
original related terms appear on the page, and a short text snippet. The 79 MB
of raw HTML never ships to the browser.
"""

from __future__ import annotations

import html
import json
import re
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent
URLS_FILE = REPO / "web_crawler" / "crawler_doc" / "crawled_urls.txt"
PAGES_DIR = REPO / "web_crawler" / "crawled_html_pages"
OUT_FILE = HERE / "public" / "data" / "crawl-index.json"

# The exact topic definition from the original assignment (Web_Crawler.docx).
TOPIC = "Video games & virtual reality"
SEEDS = [
    "https://en.wikipedia.org/wiki/Video_game",
    "https://en.wikipedia.org/wiki/Virtual_reality",
]
RELATED_TERMS = [
    "gaming", "xbox", "playstation", "console", "jrpg", "rpg", "sega",
    "nintendo", "gpu", "video-game", "cartridge", "controller", "oculus",
    "vive", "halo", "bungie", "usb", "disk", "valve", "pc", "dualshock",
    "gameboy", "arcade", "graphics", "atari",
]

INVALID_TITLE_CHARS = ['<', '>', ':', '"', '/', '\\', '|', '?', '*']

_TAG_RE = re.compile(r"<[^>]+>")
_SCRIPT_STYLE_RE = re.compile(r"<(script|style)[^>]*>.*?</\1>", re.I | re.S)
_WS_RE = re.compile(r"\s+")


def clean_title(title: str) -> str:
    for c in INVALID_TITLE_CHARS:
        title = title.replace(c, "")
    return title


def parse_url_list(text: str) -> list[dict]:
    """Each record in crawled_urls.txt looks like:

        1: Video game - Wikipedia
        https://en.wikipedia.org/wiki/Video_game
    """
    records = []
    entry_re = re.compile(r"^\s*(\d+):\s*(.+?)\s*$")
    lines = text.splitlines()
    for i, line in enumerate(lines):
        m = entry_re.match(line)
        if not m:
            continue
        title = m.group(2)
        url = ""
        for j in range(i + 1, min(i + 4, len(lines))):
            candidate = lines[j].strip()
            if candidate.startswith("http"):
                url = candidate
                break
        records.append({"n": int(m.group(1)), "title": title, "url": url})
    return records


def page_text_from_html(raw: str) -> str:
    raw = _SCRIPT_STYLE_RE.sub(" ", raw)
    # Keep only the main article body when we can find it.
    start = raw.find('<div class="mw-parser-output"')
    if start != -1:
        raw = raw[start:]
    text = _TAG_RE.sub(" ", raw)
    text = html.unescape(text)
    text = re.sub(r"\[\s*(?:\d+|edit|citation needed)\s*\]", " ", text, flags=re.I)
    text = _WS_RE.sub(" ", text)
    return text.strip()


def matched_terms(text: str) -> list[str]:
    low = text.lower()
    hits = []
    for term in RELATED_TERMS:
        pattern = r"\b" + re.escape(term.lower()) + r"\b"
        if re.search(pattern, low):
            hits.append(term)
    return hits


def make_snippet(text: str, terms: list[str], length: int = 260) -> str:
    """A readable snippet, centred on the first matched term when possible."""
    if not text:
        return ""
    anchor = 0
    if terms:
        m = re.search(r"\b" + re.escape(terms[0].lower()) + r"\b", text.lower())
        if m:
            anchor = max(0, m.start() - length // 3)
    snippet = text[anchor:anchor + length].strip()
    if anchor > 0:
        snippet = "…" + snippet
    if anchor + length < len(text):
        snippet = snippet + "…"
    return snippet


def main() -> None:
    records = parse_url_list(URLS_FILE.read_text(encoding="utf-8", errors="ignore"))
    print(f"{len(records)} URL records in crawled_urls.txt")

    term_freq: Counter[str] = Counter()
    pages = []
    missing = 0

    for rec in records:
        fname = clean_title(rec["title"]) + ".html"
        fpath = PAGES_DIR / fname
        entry = {
            "n": rec["n"],
            "title": rec["title"].replace(" - Wikipedia", ""),
            "url": rec["url"],
            "terms": [],
            "snippet": "",
            "archived": False,
        }
        if fpath.exists():
            text = page_text_from_html(fpath.read_text(encoding="utf-8", errors="ignore"))
            terms = matched_terms(text)
            entry["terms"] = terms
            entry["snippet"] = make_snippet(text, terms)
            entry["archived"] = True
            for t in terms:
                term_freq[t] += 1
        else:
            missing += 1
        pages.append(entry)

    # De-dupe: crawled_urls.txt has redirect duplicates (same title, different URL).
    seen = set()
    unique_pages = []
    for p in pages:
        key = p["title"]
        if key in seen:
            continue
        seen.add(key)
        unique_pages.append(p)

    payload = {
        "topic": TOPIC,
        "seeds": SEEDS,
        "relatedTerms": RELATED_TERMS,
        "relevanceThreshold": 2,
        "totalCrawled": len(records),
        "uniquePages": len(unique_pages),
        "archivedPages": sum(1 for p in unique_pages if p["archived"]),
        "termFrequency": dict(term_freq.most_common()),
        "pages": unique_pages,
    }

    OUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUT_FILE.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    size_kb = OUT_FILE.stat().st_size / 1024
    print(f"wrote {OUT_FILE.relative_to(HERE)}  ({size_kb:.0f} KB)")
    print(f"  unique pages: {len(unique_pages)}   archived: {payload['archivedPages']}   missing html: {missing}")
    print(f"  top terms: {list(term_freq.most_common(8))}")


if __name__ == "__main__":
    main()
