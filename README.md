# Focused Wikipedia Crawler — web UI

**Live:** https://wiki-crawler.web.app &middot;
**Source:** https://github.com/solorzke/WebCrawler

A static single-page site that gives the old CLI web crawler
(`../web_crawler/`) a front end:

- **Overview** — how the focused-crawl algorithm works, the original topic
  definition, and term-coverage stats from the 2018 run.
- **Live crawler** — a JavaScript re-implementation of the crawler that runs
  entirely in the browser against the public [MediaWiki API][api]. Configure
  seeds / related terms / thresholds and watch it BFS through Wikipedia in real
  time. No backend — this is what makes it hostable as static files.
- **2018 archive** — searchable, filterable browser over the 462 unique pages
  the original Python crawler saved.

[api]: https://www.mediawiki.org/wiki/API:Main_page

## Layout

```
site/
  public/                 # everything Firebase serves
    index.html
    styles.css
    config.js             # MediaWiki API base
    crawler.js            # the browser crawl engine
    app.js                # UI wiring
    data/crawl-index.json # generated from the 2018 crawl output
  build_index.py          # regenerates public/data/crawl-index.json
  firebase.json           # Hosting config, pinned to site "wiki-crawler"
  .firebaserc             # Firebase project: solorzke-websites
```

## Regenerate the archive index

```bash
cd site
python3 build_index.py
```

Reads `../web_crawler/crawler_doc/crawled_urls.txt` and the saved HTML in
`../web_crawler/crawled_html_pages/`, writes `public/data/crawl-index.json`
(~250 KB). The 79 MB of raw HTML is **not** deployed.

## Run locally

```bash
cd site/public
python3 -m http.server 5000
# open http://localhost:5000
```

(Any static server works. The live crawler needs internet access to reach
`en.wikipedia.org`.)

## Deploy to Firebase Hosting

Live at **https://wiki-crawler.web.app**
(project `solorzke-websites`, Hosting site `wiki-crawler`).

```bash
npm install -g firebase-tools      # once
firebase login                     # once

cd site
python3 build_index.py             # if the 2018 crawl output changed
firebase deploy --only hosting --project solorzke-websites
```

`firebase.json` pins `"site": "wiki-crawler"`, so the deploy always targets that
Hosting site and not the project's other sites. Firebase Hosting serves the
`public/` folder as-is — no build step, no server code.

## Notes on the live crawler

- Requests go out one at a time with a configurable delay (default 450 ms) and
  `maxlag=5`, and it backs off on HTTP 429/503 — polite by default.
- It is capped by *max pages to save* and a *fetch budget* so a run always
  terminates. A 20–40 page demo takes well under a minute.
- Relevance test: a page is kept when at least *N* distinct related terms match
  as whole words (case-insensitive) in the article text — same rule as the
  original Python (`webcrawler.py`), which used a raw substring check.

## Changelog

### 2026-09-06
- Initial build: Overview / Live crawler / 2018 archive, browser-side crawl
  engine, generated archive index.
- Deployed to Firebase Hosting at https://wiki-crawler.web.app
  (project `solorzke-websites`, site `wiki-crawler`).
- Added GitHub source links (header icon, hero button, footer) pointing at
  `github.com/solorzke/WebCrawler`, and an inline SVG favicon.
