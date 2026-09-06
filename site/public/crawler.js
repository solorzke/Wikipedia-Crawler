/*
 * crawler.js — browser re-implementation of the focused Wikipedia crawler.
 *
 * Same algorithm as web_crawler/crawler_doc/webcrawler.py:
 *   BFS over /wiki/ links, keep a page when >= N distinct related terms appear
 *   in its visible text. Here the page text + links come from the MediaWiki
 *   `action=parse` endpoint instead of scraping raw HTML with BeautifulSoup.
 */

const API = (window.SITE_CONFIG && window.SITE_CONFIG.wikipediaApi)
  || "https://en.wikipedia.org/w/api.php";

const SKIP_PREFIXES = [
  "Wikipedia:", "Special:", "Talk:", "Help:", "File:", "Category:",
  "Template:", "Template talk:", "Portal:", "User:", "User talk:",
  "Draft:", "MediaWiki:", "Module:", "Book:",
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Normalise a user-entered seed (title / /wiki/Title / full URL) to a title. */
function toTitle(raw) {
  let s = raw.trim();
  if (!s) return "";
  try {
    if (s.startsWith("http")) s = new URL(s).pathname;
  } catch (_) { /* not a URL, fine */ }
  const m = s.match(/\/wiki\/(.+)$/);
  if (m) s = m[1];
  try { s = decodeURIComponent(s); } catch (_) { /* leave as-is */ }
  return s.replace(/_/g, " ").trim();
}

function parseTerms(raw) {
  return raw
    .split(/[,\n]/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

function isArticleTitle(title) {
  if (!title) return false;
  return !SKIP_PREFIXES.some((p) => title.startsWith(p));
}

class FocusedCrawler {
  constructor(opts) {
    this.seeds = opts.seeds.map(toTitle).filter(Boolean);
    this.terms = parseTerms(opts.terms);
    this.threshold = Math.max(1, opts.threshold | 0);
    this.maxSaved = Math.max(1, opts.maxSaved | 0);
    this.delayMs = Math.max(150, opts.delayMs | 0);
    this.fetchBudget = Math.max(this.maxSaved, opts.fetchBudget | 0);

    this.on = {
      status: opts.onStatus || (() => {}),
      log: opts.onLog || (() => {}),
      save: opts.onSave || (() => {}),
      progress: opts.onProgress || (() => {}),
      done: opts.onDone || (() => {}),
    };

    this.queue = [];
    this.visited = new Set();
    this.stats = { fetched: 0, saved: 0, skipped: 0, errors: 0 };
    this._running = false;
    this._stopped = false;
    this._paused = false;
  }

  get queueLength() { return this.queue.length; }

  pause() { this._paused = true; this.on.status("Paused."); }
  resume() { if (this._paused) { this._paused = false; this._loop(); } }
  stop() { this._stopped = true; this._paused = false; }

  start() {
    if (this._running) return;
    if (!this.seeds.length) { this.on.log("No valid seed articles.", "err"); return; }
    if (this.terms.length < this.threshold) {
      this.on.log(`Need at least ${this.threshold} related terms.`, "err");
      return;
    }
    for (const s of this.seeds) {
      if (!this.visited.has(s)) { this.visited.add(s); this.queue.push(s); }
    }
    this._running = true;
    this.on.log(`Seeded queue with ${this.queue.length} article(s): ${this.seeds.join(", ")}`, "info");
    this._loop();
  }

  async _loop() {
    while (
      this.queue.length &&
      !this._stopped &&
      !this._paused &&
      this.stats.saved < this.maxSaved &&
      this.stats.fetched < this.fetchBudget
    ) {
      const title = this.queue.shift();
      await this._visit(title);
      this._emitProgress();
      if (this.queue.length && this.stats.saved < this.maxSaved) {
        await sleep(this.delayMs);
      }
    }
    if (this._paused) return;
    this._running = false;

    let reason;
    if (this._stopped) reason = "Stopped.";
    else if (this.stats.saved >= this.maxSaved) reason = `Target reached — ${this.stats.saved} pages saved.`;
    else if (this.stats.fetched >= this.fetchBudget) reason = `Fetch budget (${this.fetchBudget}) exhausted — ${this.stats.saved} saved.`;
    else reason = `Queue drained — ${this.stats.saved} saved.`;
    this.on.status(reason);
    this.on.log(reason, "info");
    this.on.done(this.stats);
  }

  async _visit(title) {
    this.on.status(`Fetching “${title}” …`);
    let data;
    try {
      const url = `${API}?action=parse&page=${encodeURIComponent(title)}` +
        `&prop=text%7Clinks&format=json&formatversion=2&redirects=1&maxlag=5&origin=*`;
      const res = await fetch(url);
      if (res.status === 429 || res.status === 503) {
        this.on.log(`Rate limited on “${title}” — backing off 3s`, "err");
        await sleep(3000);
        this.queue.unshift(title);
        return;
      }
      data = await res.json();
    } catch (e) {
      this.stats.errors++;
      this.on.log(`✗ network error on “${title}”`, "err");
      return;
    }

    if (data.error) {
      this.stats.errors++;
      this.on.log(`✗ ${title}: ${data.error.info || data.error.code}`, "err");
      return;
    }

    this.stats.fetched++;
    const parse = data.parse || {};
    const realTitle = parse.title || title;
    const htmlText = typeof parse.text === "string" ? parse.text : (parse.text && parse.text["*"]) || "";
    const pageText = this._extractText(htmlText);
    const matched = this._matchTerms(pageText);

    if (matched.length >= this.threshold) {
      this.stats.saved++;
      const record = {
        n: this.stats.saved,
        title: realTitle,
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(realTitle.replace(/ /g, "_"))}`,
        terms: matched,
        snippet: this._snippet(pageText, matched[0]),
      };
      this.on.save(record);
      this.on.log(`✓ [${this.stats.saved}] ${realTitle} — ${matched.join(", ")}`, "save");
    } else {
      this.stats.skipped++;
      this.on.log(`· skip ${realTitle} (${matched.length}/${this.threshold} terms)`, "skip");
    }

    this._enqueueLinks(parse.links || []);
  }

  _extractText(html) {
    try {
      const doc = new DOMParser().parseFromString(html, "text/html");
      doc.querySelectorAll("style, script, .mw-editsection, .reference, .mw-empty-elt, table.navbox, sup.reference")
        .forEach((el) => el.remove());
      return (doc.body.textContent || "").replace(/\s+/g, " ").trim();
    } catch (_) {
      return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    }
  }

  _matchTerms(text) {
    const low = text.toLowerCase();
    const hits = [];
    for (const term of this.terms) {
      const re = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
      if (re.test(low)) hits.push(term);
    }
    return hits;
  }

  _snippet(text, term, len = 240) {
    if (!text) return "";
    let start = 0;
    if (term) {
      const idx = text.toLowerCase().indexOf(term.toLowerCase());
      if (idx > -1) start = Math.max(0, idx - len / 3);
    }
    let s = text.slice(start, start + len).trim();
    if (start > 0) s = "…" + s;
    if (start + len < text.length) s += "…";
    return s;
  }

  _enqueueLinks(links) {
    let added = 0;
    for (const link of links) {
      const ns = link.ns;
      const t = link.title;
      const exists = link.exists === undefined ? true : link.exists;
      if (ns !== 0 || !exists) continue;
      if (!isArticleTitle(t) || t === "Main Page") continue;
      if (this.visited.has(t)) continue;
      this.visited.add(t);
      this.queue.push(t);
      added++;
    }
    if (added) this.on.log(`  ↳ +${added} links queued (${this.queue.length} waiting)`, "info");
  }

  _emitProgress() {
    this.on.progress({
      ...this.stats,
      queue: this.queue.length,
      pct: Math.min(100, Math.round((this.stats.saved / this.maxSaved) * 100)),
    });
  }
}

window.FocusedCrawler = FocusedCrawler;
