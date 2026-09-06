/* app.js — view switching, overview rendering, live-crawl UI, archive browser. */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => (
  { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]
));

/* ---------------------------------------------------------------- views */
function showView(name) {
  $$(".view").forEach((v) => v.classList.toggle("is-active", v.id === `view-${name}`));
  $$(".tab").forEach((t) => t.classList.toggle("is-active", t.dataset.view === name));
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (location.hash !== `#${name}`) history.replaceState(null, "", `#${name}`);
}
$$(".tab").forEach((t) => t.addEventListener("click", () => showView(t.dataset.view)));
$$("[data-goto]").forEach((b) => b.addEventListener("click", () => showView(b.dataset.goto)));

/* ---------------------------------------------------------------- overview + archive data */
let INDEX = null;

fetch("data/crawl-index.json")
  .then((r) => r.json())
  .then((data) => { INDEX = data; renderOverview(data); initArchive(data); })
  .catch(() => {
    $("#overview-stats").innerHTML = '<div class="stat"><div class="stat-l">crawl index failed to load</div></div>';
  });

function statCard(n, label) {
  return `<div class="stat"><div class="stat-n">${n}</div><div class="stat-l">${label}</div></div>`;
}

function renderOverview(d) {
  $("#overview-stats").innerHTML = [
    statCard(d.totalCrawled, "pages crawled"),
    statCard(d.uniquePages, "unique articles"),
    statCard(d.relatedTerms.length, "related terms"),
    statCard(d.seeds.length, "seed URLs"),
  ].join("");

  $("#topic-name").textContent = d.topic;
  $("#a-topic").textContent = d.topic;
  $("#a-count").textContent = d.uniquePages;
  $("#threshold-n").textContent = d.relevanceThreshold;
  $("#a-meta").textContent = `${d.uniquePages} pages · seeds: ${d.seeds.map((s) => s.split("/wiki/")[1]).join(", ")}`;

  $("#seed-list").innerHTML = d.seeds.map((s) => `<li><a href="${esc(s)}" target="_blank" rel="noopener">${esc(s)}</a></li>`).join("");
  $("#term-list").innerHTML = d.relatedTerms.map((t) => `<span class="chip">${esc(t)}</span>`).join("");

  const entries = Object.entries(d.termFrequency);
  const max = Math.max(...entries.map(([, v]) => v), 1);
  $("#term-bars").innerHTML = entries.map(([term, count]) => `
    <div class="bar-row">
      <span class="bar-label">${esc(term)}</span>
      <span class="bar-track"><span class="bar-fill" style="width:${(count / max) * 100}%"></span></span>
      <span class="bar-val">${count}</span>
    </div>`).join("");
}

/* ---------------------------------------------------------------- live crawler */
let crawler = null;

const ui = {
  form: $("#crawl-form"),
  start: $("#btn-start"),
  pause: $("#btn-pause"),
  reset: $("#btn-reset"),
  preset: $("#btn-preset"),
  seeds: $("#f-seeds"),
  terms: $("#f-terms"),
  threshold: $("#f-threshold"),
  max: $("#f-max"),
  delay: $("#f-delay"),
  fetchcap: $("#f-fetchcap"),
  sFetched: $("#s-fetched"),
  sSaved: $("#s-saved"),
  sSkipped: $("#s-skipped"),
  sQueue: $("#s-queue"),
  progress: $("#live-progress"),
  status: $("#live-status"),
  results: $("#live-results"),
  resultsCount: $("#results-count"),
  log: $("#live-log"),
};

const PRESET = {
  seeds: "Video game\nVirtual reality",
  terms: "gaming, xbox, playstation, console, jrpg, rpg, sega, nintendo, gpu, cartridge, controller, oculus, vive, halo, bungie, valve, dualshock, gameboy, arcade, graphics, atari",
};
ui.preset.addEventListener("click", () => {
  ui.seeds.value = PRESET.seeds;
  ui.terms.value = PRESET.terms;
});

function logLine(msg, kind = "info") {
  const div = document.createElement("div");
  div.className = `log-line log-${kind}`;
  div.textContent = msg;
  ui.log.appendChild(div);
  ui.log.scrollTop = ui.log.scrollHeight;
  while (ui.log.children.length > 400) ui.log.removeChild(ui.log.firstChild);
}

function resultCard(rec) {
  const div = document.createElement("div");
  div.className = "card";
  div.innerHTML = `
    <div class="card-head">
      <div class="card-title"><a href="${esc(rec.url)}" target="_blank" rel="noopener">${esc(rec.title)}</a></div>
      <span class="card-n">#${rec.n}</span>
    </div>
    ${rec.snippet ? `<div class="card-snip">${esc(rec.snippet)}</div>` : ""}
    <div class="card-terms">${rec.terms.map((t) => `<span class="chip matched">${esc(t)}</span>`).join("")}</div>`;
  return div;
}

function setRunningUI(running) {
  ui.start.disabled = running;
  ui.pause.disabled = !running;
  ui.reset.disabled = running && !crawler;
  [ui.seeds, ui.terms, ui.threshold, ui.max, ui.delay, ui.fetchcap, ui.preset]
    .forEach((el) => { el.disabled = running; });
}

function resetLive() {
  if (crawler) crawler.stop();
  crawler = null;
  ui.results.innerHTML = "";
  ui.log.innerHTML = "";
  ui.resultsCount.textContent = "0";
  ["sFetched", "sSaved", "sSkipped", "sQueue"].forEach((k) => { ui[k].textContent = "0"; });
  ui.progress.style.width = "0";
  ui.status.textContent = "Idle.";
  ui.pause.textContent = "Pause";
  setRunningUI(false);
  ui.reset.disabled = true;
}

ui.reset.addEventListener("click", resetLive);

ui.pause.addEventListener("click", () => {
  if (!crawler) return;
  if (ui.pause.textContent === "Pause") {
    crawler.pause();
    ui.pause.textContent = "Resume";
    ui.start.disabled = true;
  } else {
    ui.pause.textContent = "Pause";
    crawler.resume();
  }
});

ui.form.addEventListener("submit", (e) => {
  e.preventDefault();
  resetLive();

  crawler = new FocusedCrawler({
    seeds: ui.seeds.value.split("\n"),
    terms: ui.terms.value,
    threshold: +ui.threshold.value,
    maxSaved: +ui.max.value,
    delayMs: +ui.delay.value,
    fetchBudget: +ui.fetchcap.value,
    onStatus: (s) => { ui.status.textContent = s; },
    onLog: logLine,
    onSave: (rec) => {
      ui.results.appendChild(resultCard(rec));
      ui.resultsCount.textContent = String(rec.n);
    },
    onProgress: (p) => {
      ui.sFetched.textContent = p.fetched;
      ui.sSaved.textContent = p.saved;
      ui.sSkipped.textContent = p.skipped;
      ui.sQueue.textContent = p.queue;
      ui.progress.style.width = `${p.pct}%`;
    },
    onDone: () => {
      setRunningUI(false);
      ui.reset.disabled = false;
      ui.pause.disabled = true;
    },
  });

  setRunningUI(true);
  ui.reset.disabled = false;
  crawler.start();
});

/* ---------------------------------------------------------------- archive browser */
function initArchive(d) {
  const PAGE_SIZE = 40;
  let shown = PAGE_SIZE;
  let activeTerms = new Set();

  const search = $("#a-search");
  const sort = $("#a-sort");
  const filterBox = $("#a-term-filter");
  const list = $("#archive-results");
  const moreBtn = $("#a-more");

  filterBox.innerHTML = d.relatedTerms
    .map((t) => `<span class="chip" data-term="${esc(t)}">${esc(t)}</span>`)
    .join("");
  filterBox.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    const term = chip.dataset.term;
    if (activeTerms.has(term)) { activeTerms.delete(term); chip.classList.remove("active"); }
    else { activeTerms.add(term); chip.classList.add("active"); }
    shown = PAGE_SIZE;
    render();
  });

  function filtered() {
    const q = search.value.trim().toLowerCase();
    let rows = d.pages.filter((p) => {
      if (activeTerms.size && ![...activeTerms].every((t) => p.terms.includes(t))) return false;
      if (q && !(`${p.title} ${p.snippet}`.toLowerCase().includes(q))) return false;
      return true;
    });
    const s = sort.value;
    if (s === "title") rows = [...rows].sort((a, b) => a.title.localeCompare(b.title));
    else if (s === "terms-desc") rows = [...rows].sort((a, b) => b.terms.length - a.terms.length);
    return rows;
  }

  function render() {
    const rows = filtered();
    $("#a-meta").textContent =
      `${rows.length} of ${d.uniquePages} pages` +
      (activeTerms.size ? ` · filtered by: ${[...activeTerms].join(", ")}` : "");
    list.innerHTML = rows.slice(0, shown).map((p) => `
      <div class="card">
        <div class="card-head">
          <div class="card-title"><a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.title)}</a></div>
          <span class="card-n">#${p.n}</span>
        </div>
        ${p.snippet ? `<div class="card-snip">${esc(p.snippet)}</div>` : ""}
        <div class="card-terms">${p.terms.map((t) => `<span class="chip ${activeTerms.has(t) ? "matched" : ""}">${esc(t)}</span>`).join("")}</div>
      </div>`).join("");
    moreBtn.hidden = rows.length <= shown;
  }

  search.addEventListener("input", () => { shown = PAGE_SIZE; render(); });
  sort.addEventListener("change", () => { shown = PAGE_SIZE; render(); });
  moreBtn.addEventListener("click", () => { shown += PAGE_SIZE; render(); });

  render();
}

/* ---------------------------------------------------------------- boot */
const initial = (location.hash || "#overview").slice(1);
if (["overview", "live", "archive"].includes(initial)) showView(initial);
