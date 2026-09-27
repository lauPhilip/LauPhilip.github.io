/* ==========================================================================
   Philip Lau — portfolio engine
   All content lives in /data/*.json and /projects/<id>/info.json.
   Everything is fetched in parallel and rendered progressively.
   ========================================================================== */
(() => {
  'use strict';

  const GH_USER = 'lauPhilip';
  const GH_REPO = 'LauPhilip.github.io';
  const DEVICON = 'https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/';

  /* ---------- helpers ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const safeUrl = (u) => (/^(https?:|mailto:|tel:|#|[./]?[\w-])/i.test(u || '') && !/^javascript:/i.test(u) ? u : '#');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const html = (el, markup) => { if (el) el.innerHTML = markup; return el; };

  const store = {
    get(k) { try { return JSON.parse(sessionStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } },
  };

  async function getJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    return res.json();
  }

  /** Fetch with a sessionStorage cache (for rate-limited external APIs). */
  async function cachedJSON(url, ttlMin = 60) {
    const key = `cache:${url}`;
    const hit = store.get(key);
    if (hit && Date.now() - hit.t < ttlMin * 60e3) return hit.v;
    const v = await getJSON(url);
    store.set(key, { t: Date.now(), v });
    return v;
  }

  const safe = (fn) => (...a) => { try { return fn(...a); } catch (e) { console.warn(e); } };

  /* ---------- theme ---------- */
  function initTheme() {
    const root = document.documentElement;
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const current = () => root.getAttribute('data-theme') || (mq.matches ? 'dark' : 'light');
    const paint = () => $$('.js-theme use').forEach((u) => u.setAttribute('href', current() === 'dark' ? '#i-sun' : '#i-moon'));
    $$('.js-theme').forEach((b) => b.addEventListener('click', () => {
      const next = current() === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('theme', next); } catch { /* ignore */ }
      paint();
    }));
    mq.addEventListener?.('change', paint);
    paint();
  }

  /* ---------- navigation: TOC, scroll-spy, mobile menu ---------- */
  function initNav() {
    const sections = $$('main section[data-title]');
    const toc = $('#toc');
    sections.forEach((s, i) => {
      const n = String(i + 1).padStart(2, '0');
      const num = $('.section-head .num', s);
      if (num) num.textContent = n;
      toc.insertAdjacentHTML('beforeend', `<li><a href="#${s.id}"><span class="n">${n}</span>${esc(s.dataset.title)}</a></li>`);
    });

    const links = new Map($$('a', toc).map((a) => [a.hash.slice(1), a]));
    const visible = new Set();
    const spy = new IntersectionObserver((entries) => {
      entries.forEach((e) => (e.isIntersecting ? visible.add(e.target.id) : visible.delete(e.target.id)));
      const first = sections.find((s) => visible.has(s.id));
      links.forEach((a, id) => a.classList.toggle('active', first?.id === id));
    }, { rootMargin: '-35% 0px -55% 0px' });
    sections.forEach((s) => spy.observe(s));

    // Mobile menu
    const btn = $('#menu-btn');
    const side = $('#sidebar');
    const setOpen = (open) => {
      side.classList.toggle('open', open);
      btn.setAttribute('aria-expanded', String(open));
      $('use', btn).setAttribute('href', open ? '#i-close' : '#i-menu');
      document.body.style.overflow = open ? 'hidden' : '';
    };
    btn.addEventListener('click', () => setOpen(!side.classList.contains('open')));
    side.addEventListener('click', (e) => { if (e.target.closest('a')) setOpen(false); });
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && side.classList.contains('open')) setOpen(false); });
    matchMedia('(min-width: 1080px)').addEventListener?.('change', () => setOpen(false));
  }

  /* ---------- reveal on scroll ---------- */
  let revealObserver;
  function reveal(root = document) {
    if (reduceMotion || !('IntersectionObserver' in window)) return;
    revealObserver ??= new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); revealObserver.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -8% 0px' });
    $$('.section-head, .tl-item, .now-card, .card, .pub, .goal, .cap, .cert, .ref, .repo, .feature, .tool-group, .gh-card, .quote, .lede', root)
      .forEach((el, i) => {
        if (el.classList.contains('reveal')) return;
        el.classList.add('reveal');
        el.style.transitionDelay = `${Math.min(i % 6, 5) * 50}ms`;
        revealObserver.observe(el);
      });
  }

  /* ---------- hero phrase typewriter ---------- */
  function initPhrases(phrases) {
    const el = $('#phrase');
    if (!el || !phrases?.length) return;
    el.textContent = phrases[0];
    if (reduceMotion || phrases.length < 2) return;
    let i = 0;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    (async function loop() {
      for (;;) {
        await sleep(3200);
        if (document.hidden) continue;
        let t = el.textContent;
        while (t.length) { t = t.slice(0, -1); el.textContent = t; await sleep(22); }
        i = (i + 1) % phrases.length;
        const next = phrases[i];
        for (let k = 1; k <= next.length; k++) { el.textContent = next.slice(0, k); await sleep(42); }
      }
    })();
  }

  /* ---------- renderers ---------- */
  function renderSite(s) {
    initPhrases(s.phrases);
    if (s.role) $('#hero-status span:last-child').textContent = s.role;
    if (s.degrees) $('#hero-degrees').textContent = s.degrees.join(' · ');
    html($('#now'), (s.now || []).map((n, i) => `
      <a class="now-card" href="${esc(safeUrl(n.href || '#'))}">
        <span class="now-kicker">${i === 0 ? '<span class="pulse"></span>' : ''}${esc(n.kicker)}</span>
        <strong>${esc(n.title)}</strong>
        <span class="now-text">${esc(n.text)}</span>
        <span class="now-go" aria-hidden="true">→</span>
      </a>`).join(''));

    $('#about-bio').textContent = s.bio || '';
    $('#about-quote').textContent = s.quote ? `“${s.quote}”` : '';
    const c = s.contact || {};
    html($('#about-facts'), `
      <dt>Based in</dt><dd>${esc(c.location)}</dd>
      <dt>Languages</dt><dd>${esc((s.languages || []).join(', '))}</dd>
      <dt>Interests</dt><dd>${esc((s.interests || []).join(', '))}</dd>`);
    html($('#about-goals'), (s.goals || []).map((g) => `
      <article class="goal"><span class="kicker">${esc(g.horizon)}</span><h3>${esc(g.title)}</h3><p>${esc(g.text)}</p></article>`).join(''));

    const f = s.featured;
    if (f) {
      html($('#feature'), `
        <img src="${esc(f.image)}" alt="Newspaper clipping: ${esc(f.title)}" loading="lazy" decoding="async" width="994" height="1287">
        <div>
          <span class="kicker">${esc(f.kicker)}</span>
          <h3>${esc(f.title)}</h3>
          <p>${esc(f.text)}</p>
          ${f.badge ? `<span class="badge accent">${esc(f.badge)}</span>` : ''}
        </div>`);
    } else { $('#featured').remove(); }

    if (c.email) {
      const a = $('#contact-email');
      a.textContent = c.email; a.href = `mailto:${c.email}`;
      $('#copy-email').addEventListener('click', async () => {
        const t = $('#copy-toast');
        try { await navigator.clipboard.writeText(c.email); t.textContent = 'Copied'; }
        catch { t.textContent = 'Press Ctrl+C'; }
        t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 1600);
      });
    }
    html($('#contact-facts'), `
      ${c.phone ? `<dt>Phone</dt><dd><a href="tel:${esc(c.phone.replace(/\s/g, ''))}">${esc(c.phone)}</a></dd>` : ''}
      ${c.location ? `<dt>Location</dt><dd>${esc(c.location)}</dd>` : ''}
      ${c.linkedin ? `<dt>LinkedIn</dt><dd><a href="${esc(safeUrl(c.linkedin))}" target="_blank" rel="noopener">${esc(c.linkedin.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''))}</a></dd>` : ''}
      ${c.github ? `<dt>GitHub</dt><dd><a href="${esc(safeUrl(c.github))}" target="_blank" rel="noopener">${esc(c.github.replace(/^https?:\/\//, ''))}</a></dd>` : ''}`);

    // CV button: only shown when the file actually exists.
    if (c.cv) {
      fetch(c.cv, { method: 'HEAD' }).then((r) => {
        if (r.ok) { const b = $('#cv-btn'); b.href = c.cv; b.hidden = false; }
      }).catch(() => {});
    }
  }

  function timelineItem(it, opts = {}) {
    const limit = opts.limit ?? Infinity;
    const pts = it.points || [];
    const extra = pts.length - limit;
    return `
      <li class="tl-item">
        <div class="tl-period">${it.current ? '<span class="now" title="Current"></span>' : ''}${esc(it.period)}</div>
        <div>
          <h3>${esc(it.title)}${it.grade ? ` <span class="grade">${esc(it.grade)}</span>` : ''}</h3>
          <div class="tl-org">${esc(it.org)}</div>
          ${pts.length ? `<ul class="tl-points">${pts.map((p, i) => {
            const text = typeof p === 'string' ? p : p.text;
            const sub = typeof p === 'object' && p.sub?.length ? `<ol class="tl-sub">${p.sub.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>` : '';
            return `<li${i >= limit ? ' class="extra"' : ''}>${esc(text)}${sub}</li>`;
          }).join('')}</ul>` : ''}
          ${extra > 0 ? `<button type="button" class="linklike tl-more" data-more="${extra}">Show ${extra} more</button>` : ''}
          ${it.courses?.length ? `
            <details class="courses"><summary>${it.courses.length} courses</summary>
              <ul class="course-list">${it.courses.map((c) => `<li class="chip">${esc(c)}</li>`).join('')}</ul>
            </details>` : ''}
        </div>
      </li>`;
  }

  function renderTimeline(sel, items, opts) {
    const el = $(sel);
    html(el, items.map((it) => timelineItem(it, opts)).join(''));
    el.addEventListener('click', (e) => {
      const b = e.target.closest('.tl-more');
      if (!b) return;
      const item = b.closest('.tl-item');
      const open = item.classList.toggle('expanded');
      b.textContent = open ? 'Show less' : `Show ${b.dataset.more} more`;
    });
  }

  function iconUrl(icon) {
    return icon?.startsWith('devicon:') ? `${DEVICON}${icon.slice(8)}.svg` : icon;
  }

  function renderSkills(sk) {
    const groups = {};
    (sk.tools || []).forEach((t) => (groups[t.group || 'Other'] ??= []).push(t));
    html($('#tool-groups'), Object.entries(groups).map(([g, tools]) => `
      <div class="tool-group"><h3>${esc(g)}</h3><div class="tool-list">
        ${tools.map((t) => `<span class="tool">${t.icon
          ? `<img src="${esc(iconUrl(t.icon))}" alt="" width="20" height="20" loading="lazy" decoding="async"${t.invert ? ' class="invert"' : ''} data-fallback="${esc(t.mono || t.name.slice(0, 2))}">`
          : `<span class="mono-icon" aria-hidden="true">${esc(t.mono || t.name.slice(0, 2))}</span>`}${esc(t.name)}</span>`).join('')}
      </div></div>`).join(''));
    // Replace broken icons with a neat monogram.
    $$('#tool-groups img').forEach((img) => img.addEventListener('error', () => {
      img.outerHTML = `<span class="mono-icon" aria-hidden="true">${esc(img.dataset.fallback)}</span>`;
    }, { once: true }));

    html($('#capabilities'), (sk.capabilities || []).map((c) => `
      <article class="cap"><h3>${esc(c.title)}</h3><dl>
        ${c.items.map((i) => `<div><dt>${esc(i.name)}</dt><dd>${esc(i.text)}</dd></div>`).join('')}
      </dl></article>`).join(''));

    html($('#learning'), `
      ${sk.learning?.length ? `<div class="learning-row"><h3>Learning now</h3><div class="chips">${sk.learning.map((l) => `<span class="chip live">${esc(l)}</span>`).join('')}</div></div>` : ''}
      ${sk.bucket_list?.length ? `<div class="learning-row"><h3>Next up</h3><div class="chips">${sk.bucket_list.map((l) => `<span class="chip dashed">${esc(l)}</span>`).join('')}</div></div>` : ''}`);
  }

  function renderPublications(pubs) {
    if (!pubs?.length) { $('#publications').remove(); return; }
    html($('#pub-list'), pubs.map((p) => `
      <li class="pub">
        <div class="pub-year">${esc(p.year)} <span class="badge">${esc(p.type)}</span></div>
        <div>
          <h3>${esc(p.title)}</h3>
          ${p.authors ? `<div class="by">${esc(p.authors)}</div>` : ''}
          <div class="venue">${esc(p.venue)}${p.status ? ` · ${esc(p.status)}` : ''}</div>
          ${p.links?.length ? `<div class="pub-links">${p.links.map((l) => `<a href="${esc(safeUrl(l.url))}" target="_blank" rel="noopener">${esc(l.label)} ↗</a>`).join('')}</div>` : ''}
        </div>
      </li>`).join(''));
  }

  function renderCerts(certs) {
    html($('#cert-grid'), certs.map((c) => `
      <a class="cert" href="${esc(safeUrl(c.link))}" target="_blank" rel="noopener">
        <img src="${esc(c.image)}" alt="" loading="lazy" decoding="async" width="64" height="44">
        <div>
          <div class="issuer">${esc(c.issuer)} · ${esc(c.type)}</div>
          <h3>${esc(c.title)}</h3>
          <div class="date">Earned ${esc(c.date)} ↗</div>
        </div>
      </a>`).join(''));
  }

  function renderRefs(refs) {
    html($('#ref-grid'), refs.map((r) => `
      <article class="ref">
        <span class="org">${esc(r.company)}</span>
        <h3>${esc(r.person)}</h3>
        <span class="rel">${esc(r.relation)}</span>
        <span class="role">${esc(r.title)} · ${esc(r.department)}</span>
        ${r.contact ? `<a class="ext" href="mailto:${esc(r.contact)}">${esc(r.contact)}</a>` : ''}
      </article>`).join(''));
  }

  /* ---------- projects ---------- */
  const P = { list: [], filter: { status: 'all', category: 'all', q: '', tag: '' }, current: -1 };

  function projectCard(p, idx) {
    const img = p.images?.[0];
    const initials = p.title.replace(/[^A-Za-z ]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
    const tags = p.tags || [];
    return `
      <button type="button" class="card" data-idx="${idx}" aria-label="Open project: ${esc(p.title)}">
        ${p.featured ? '<span class="card-star"><svg><use href="#i-star"/></svg>Featured</span>' : ''}
        <div class="card-media">
          ${img ? `<img src="${esc(img)}" alt="" loading="lazy" decoding="async">` : `<div class="placeholder" aria-hidden="true">${esc(initials)}</div>`}
        </div>
        <div class="card-body">
          <div class="card-meta"><span class="dot ${esc(p.status)}"></span>${esc(p.status)} · ${esc(p.category)}${p.private ? '<span class="lock">Private code</span>' : ''}</div>
          <h3>${esc(p.title)}</h3>
          <p>${esc(p.short_desc)}</p>
          <div class="tags">${tags.slice(0, 4).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}${tags.length > 4 ? `<span class="tag">+${tags.length - 4}</span>` : ''}</div>
        </div>
      </button>`;
  }

  function applyFilters() {
    const { status, category, q, tag } = P.filter;
    const needle = q.trim().toLowerCase();
    let shown = 0;
    $$('#project-grid .card').forEach((card) => {
      const p = P.list[+card.dataset.idx];
      const hay = `${p.title} ${p.short_desc} ${p.blueprint_desc || ''} ${(p.tags || []).join(' ')}`.toLowerCase();
      const ok = (status === 'all' || p.status === status)
        && (category === 'all' || p.category === category)
        && (!needle || hay.includes(needle))
        && (!tag || (p.tags || []).includes(tag));
      card.classList.toggle('hide', !ok);
      if (ok) shown++;
    });
    $('#project-count').textContent = `${shown} of ${P.list.length} projects`;
    $('#project-empty').hidden = shown > 0;
  }

  function initFilters() {
    $$('.seg').forEach((seg) => seg.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      $$('button', seg).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      P.filter[seg.dataset.filter] = b.dataset.value;
      applyFilters();
    }));
    let t;
    $('#project-search').addEventListener('input', (e) => {
      clearTimeout(t);
      t = setTimeout(() => { P.filter.q = e.target.value; applyFilters(); }, 120);
    });
    $('#tag-cloud').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      P.filter.tag = P.filter.tag === b.dataset.tag ? '' : b.dataset.tag;
      $$('button', e.currentTarget).forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.tag === P.filter.tag)));
      applyFilters();
    });
    $('#clear-filters').addEventListener('click', () => {
      P.filter = { status: 'all', category: 'all', q: '', tag: '' };
      $('#project-search').value = '';
      $$('.seg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.value === 'all')));
      $$('#tag-cloud button').forEach((b) => b.setAttribute('aria-pressed', 'false'));
      applyFilters();
    });
  }

  function renderTagCloud() {
    const counts = {};
    P.list.forEach((p) => (p.tags || []).forEach((t) => { counts[t] = (counts[t] || 0) + 1; }));
    const top = Object.entries(counts).filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 10);
    html($('#tag-cloud'), top.map(([t, n]) => `<button type="button" class="chip" aria-pressed="false" data-tag="${esc(t)}">${esc(t)} <span class="muted">${n}</span></button>`).join(''));
  }

  async function loadProjects() {
    const registry = await getJSON('data/projects.json');
    const loaded = await Promise.all(registry.map(async (item) => {
      try {
        const info = await getJSON(`projects/${item.id}/info.json`);
        const images = Array.isArray(info.images) ? info.images : info.images ? [info.images] : [];
        return { ...info, ...item, images };
      } catch (e) { console.warn('Project failed to load', item.id, e); return null; }
    }));
    // Ongoing first, featured first within each group, registry order otherwise.
    const rank = (p) => (p.status === 'ongoing' ? 0 : 2) + (p.featured ? 0 : 1);
    P.list = loaded.filter(Boolean).map((p, i) => ({ ...p, _i: i })).sort((a, b) => rank(a) - rank(b) || a._i - b._i);

    html($('#project-grid'), P.list.map(projectCard).join(''));
    renderTagCloud();
    initFilters();
    applyFilters();
    // Tall images, diagrams and logos look better fully visible than cropped.
    $$('#project-grid .card-media img').forEach((img) => {
      const fit = () => { if (img.naturalWidth / img.naturalHeight < 1.35) img.classList.add('contain'); };
      img.complete && img.naturalWidth ? fit() : img.addEventListener('load', fit, { once: true });
    });
    $('#project-grid').addEventListener('click', (e) => {
      const card = e.target.closest('.card');
      if (card) openProject(+card.dataset.idx);
    });
    reveal($('#projects'));
    routeFromHash();
  }

  /* ---------- project dialog ---------- */
  const modal = $('#project-modal');

  function openProject(idx, { push = true } = {}) {
    const p = P.list[idx];
    if (!p) return;
    P.current = idx;
    const imgs = p.images || [];
    $('#modal-meta').textContent = `${p.status} · ${p.category}${p.private ? ' · private code' : ''} — ${idx + 1} / ${P.list.length}`;
    html($('#modal-body'), `
      <h2 id="modal-title">${esc(p.title)}</h2>
      <p class="lead">${esc(p.short_desc)}</p>
      <div class="tags">${(p.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>
      ${p.links?.length ? `<div class="modal-links">${p.links.map((l) => `<a class="btn" href="${esc(safeUrl(l.url))}" target="_blank" rel="noopener">${esc(l.label)}<svg><use href="#i-arrow"/></svg></a>`).join('')}</div>` : ''}
      ${p.blueprint_desc ? `<div class="modal-section"><h4>${esc(p.blueprint_title || 'Overview')}</h4><p>${esc(p.blueprint_desc)}</p></div>` : ''}
      ${p.video ? `<div class="modal-section"><h4>Demo</h4><video controls preload="none" playsinline ${p.poster ? `poster="${esc(p.poster)}"` : ''}><source src="${esc(p.video)}" type="video/mp4"></video></div>` : ''}
      ${imgs.length ? `<div class="modal-section"><h4>Gallery${imgs.length > 1 ? ` · ${imgs.length}` : ''}</h4>
        <div class="gallery${imgs.length > 1 ? ' multi' : ''}">${imgs.map((src, i) => `<a href="${esc(src)}" target="_blank" rel="noopener"><img src="${esc(src)}" alt="${esc(p.title)} — image ${i + 1}" loading="lazy" decoding="async"></a>`).join('')}</div></div>` : ''}
    `);
    $('#modal-body').scrollTop = 0;
    if (!modal.open) {
      modal.showModal();
      document.body.classList.add('modal-open');
    }
    if (push) history.replaceState(null, '', `#project/${p.id}`);
  }

  function closeProject() {
    if (!modal.open) return;
    modal.close();
  }

  function initModal() {
    modal.addEventListener('close', () => {
      document.body.classList.remove('modal-open');
      $$('video', modal).forEach((v) => v.pause());
      if (location.hash.startsWith('#project/')) history.replaceState(null, '', '#projects');
      const card = $(`#project-grid .card[data-idx="${P.current}"]`);
      card?.focus({ preventScroll: true });
    });
    modal.addEventListener('click', (e) => { if (e.target === modal) closeProject(); }); // backdrop
    $('#modal-close').addEventListener('click', closeProject);
    const step = (d) => openProject((P.current + d + P.list.length) % P.list.length);
    $('#modal-prev').addEventListener('click', () => step(-1));
    $('#modal-next').addEventListener('click', () => step(1));
    modal.addEventListener('keydown', (e) => {
      if (e.target.closest('video')) return;
      if (e.key === 'ArrowRight') step(1);
      if (e.key === 'ArrowLeft') step(-1);
    });
  }

  function routeFromHash() {
    const m = location.hash.match(/^#project\/(.+)$/);
    if (!m) return;
    const idx = P.list.findIndex((p) => p.id === decodeURIComponent(m[1]));
    if (idx >= 0) openProject(idx, { push: false });
  }
  addEventListener('hashchange', routeFromHash);

  /* ---------- GitHub (live) ---------- */
  async function loadContributions() {
    const box = $('#heatmap');
    const total = $('#gh-total');
    try {
      const d = await cachedJSON(`https://github-contributions-api.jogruber.de/v4/${GH_USER}?y=last`, 180);
      const days = d.contributions || [];
      if (!days.length) throw new Error('no data');
      // Pad so the first column starts on Sunday, like GitHub.
      const pad = new Date(days[0].date).getDay();
      box.innerHTML = '<i style="visibility:hidden"></i>'.repeat(pad)
        + days.map((x) => `<i data-l="${x.level}" title="${x.count} contribution${x.count === 1 ? '' : 's'} on ${x.date}"></i>`).join('');
      const n = d.total?.lastYear ?? days.reduce((a, x) => a + x.count, 0);
      total.innerHTML = `<b>${n.toLocaleString('en')}</b> contributions in the last year`;
    } catch {
      // Fallback: static chart image.
      box.style.display = 'block';
      box.innerHTML = `<img src="https://ghchart.rshah.org/B8900A/${GH_USER}" alt="GitHub contribution chart" loading="lazy">`;
      total.textContent = 'Contributions in the last year';
      $('.heat-legend').hidden = true;
    }
  }

  const LANG = { 'C#': '#178600', Python: '#3572A5', PHP: '#4F5D95', HTML: '#E34C26', JavaScript: '#F1E05A', TypeScript: '#3178C6', CSS: '#563D7C' };

  async function loadRepos(exclude = []) {
    const grid = $('#repo-grid');
    const skip = new Set([GH_REPO, ...exclude].map((n) => n.toLowerCase()));
    try {
      const repos = await cachedJSON(`https://api.github.com/users/${GH_USER}/repos?sort=pushed&per_page=30`, 60);
      const list = repos.filter((r) => !r.fork && !r.archived && !skip.has(r.name.toLowerCase())).slice(0, 6);
      if (!list.length) throw new Error('none');
      const ago = (iso) => {
        const days = Math.round((Date.now() - new Date(iso)) / 864e5);
        if (days < 1) return 'today';
        if (days < 30) return `${days}d ago`;
        if (days < 365) return `${Math.round(days / 30)}mo ago`;
        return `${Math.round(days / 365)}y ago`;
      };
      html(grid, list.map((r) => `
        <a class="repo" href="${esc(r.html_url)}" target="_blank" rel="noopener">
          <h3><svg><use href="#i-github"/></svg>${esc(r.name)}</h3>
          <p>${esc(r.description || 'No description yet.')}</p>
          <div class="meta">
            ${r.language ? `<span><span class="lang-dot" style="background:${LANG[r.language] || 'var(--muted)'}"></span>${esc(r.language)}</span>` : ''}
            ${r.stargazers_count ? `<span>★ ${r.stargazers_count}</span>` : ''}
            <span>updated ${ago(r.pushed_at)}</span>
          </div>
        </a>`).join(''));
      $('#gh-sub').textContent = 'Live from GitHub — most recently pushed public repositories.';
      reveal(grid);
    } catch {
      grid.remove();
    }
  }

  async function loadLastUpdated() {
    try {
      const c = await cachedJSON(`https://api.github.com/repos/${GH_USER}/${GH_REPO}/commits?per_page=1`, 60);
      const d = new Date(c[0].commit.committer.date);
      $('#last-updated').textContent = `Last updated ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`;
    } catch { /* silent */ }
  }

  /* ---------- boot ---------- */
  async function boot() {
    $('#year').textContent = new Date().getFullYear();
    initTheme();
    initNav();
    initModal();

    const files = ['site', 'experience', 'education', 'volunteering', 'skills', 'publications', 'certifications', 'references'];
    const results = await Promise.allSettled(files.map((f) => getJSON(`data/${f}.json`)));
    const data = Object.fromEntries(files.map((f, i) => [f, results[i].status === 'fulfilled' ? results[i].value : null]));
    results.forEach((r, i) => r.status === 'rejected' && console.warn(`data/${files[i]}.json`, r.reason));

    if (data.site) safe(renderSite)(data.site);
    if (data.experience) safe(renderTimeline)('#experience-list', data.experience, { limit: 4 });
    if (data.education) safe(renderTimeline)('#education-list', data.education);
    if (data.volunteering) safe(renderTimeline)('#volunteering-list', data.volunteering);
    if (data.skills) safe(renderSkills)(data.skills);
    safe(renderPublications)(data.publications);
    if (data.certifications) safe(renderCerts)(data.certifications);
    if (data.references) safe(renderRefs)(data.references);
    reveal();

    loadProjects().catch((e) => { console.error(e); html($('#project-grid'), '<p class="empty">Projects could not be loaded.</p>'); });

    // External, non-critical: wait until the browser is idle.
    const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 400));
    idle(() => { loadContributions(); loadRepos(data.site?.contact?.repo_exclude); loadLastUpdated(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
