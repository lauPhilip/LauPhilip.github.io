/* ==========================================================================
   Ask: answers questions about Philip's work from the content of this site.

   1. build.py writes data/ask-index.json: short passages from every page,
      each with a link back to where it lives (/work/<slug>/, /about/#skills...).
   2. A question is matched against those passages with BM25 keyword search
      (plus a few synonyms), in the browser.
   3. If an AI endpoint is set (data/site.json -> ask.endpoint), the question is
      sent there and an AI writes the answer. Otherwise the best passages are
      shown directly. Either way the answer lists its sources on this site.
   ========================================================================== */
(() => {
  'use strict';

  const panel = document.getElementById('ask-panel');
  if (!panel || typeof panel.showModal !== 'function') {
    document.querySelectorAll('[data-ask-open], .ask-section').forEach((el) => { el.hidden = true; });
    return;
  }

  // Optional AI endpoint from data/site.json (ask.endpoint), written into the page by build.py.
  const ENDPOINT = panel.dataset.endpoint || '';
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- text processing ---------- */
  const STOP = new Set(('a an the and or of to in on for with at by from as is are was were be been it its this that these those i me my he him his she her they them their you your we our ' +
    'what which who whom how when where why does do did has have had can could would should will about into than then so if not no any all some more most very just also there here ' +
    'tell show give know please philip lau lau\'s').split(' '));

  const stem = (w) => {
    if (w.length <= 3) return w;
    if (w.endsWith('ies')) return `${w.slice(0, -3)}y`;
    if (w.endsWith('ing') && w.length > 5) return w.slice(0, -3);
    if (w.endsWith('ed') && w.length > 4) return w.slice(0, -2);
    if (w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
    return w;
  };

  const tokenize = (t) => String(t).toLowerCase()
    .replace(/c#/g, 'csharp').replace(/\.net/g, 'dotnet').replace(/[^a-z0-9æøå+]+/g, ' ')
    .split(' ').filter((w) => w && !STOP.has(w)).map(stem);

  // Everyday words mapped to the vocabulary used on the site.
  const SYN = {
    ai: ['llm', 'rag', 'chatbot', 'assistant', 'machine', 'generative', 'agent', 'model'],
    llm: ['ai', 'language', 'model', 'rag'],
    chatbot: ['assistant', 'rag', 'bot', 'chat'],
    school: ['education', 'university', 'degree', 'msc', 'bachelor'],
    study: ['education', 'university', 'degree', 'msc', 'bachelor', 'course'],
    degree: ['education', 'msc', 'bachelor', 'grade'],
    education: ['university', 'degree', 'msc', 'bachelor', 'grade', 'course'],
    grade: ['education', 'degree', 'msc', 'bachelor'],
    job: ['experience', 'work', 'role', 'position'],
    work: ['experience', 'job', 'role'],
    experience: ['work', 'job', 'role'],
    contact: ['email', 'phone', 'linkedin', 'reach'],
    email: ['contact', 'mail'],
    hire: ['contact', 'available', 'role', 'looking'],
    available: ['looking', 'open', 'role'],
    lego: ['mould', 'mind'],
    microsoft: ['power', 'sharepoint', 'automate', 'apps'],
    lowcode: ['power', 'apps', 'automate', 'citizen'],
    code: ['programming', 'language', 'python', 'csharp', 'javascript'],
    programming: ['language', 'python', 'csharp', 'javascript', 'php'],
    language: ['programming', 'python', 'csharp', 'javascript', 'danish', 'english'],
    teach: ['instructor', 'workshop', 'supervis', 'student'],
    taught: ['teach', 'instructor', 'workshop', 'supervis', 'student'],
    teacher: ['instructor', 'teach'],
    mentor: ['supervis', 'instructor', 'tutor'],
    built: ['build', 'developed', 'created'],
    lead: ['leadership', 'team', 'facilitator', 'chair', 'board', 'supervis'],
    leadership: ['lead', 'team', 'facilitator', 'chair', 'board'],
    research: ['publication', 'paper', 'conference', 'literature'],
    paper: ['publication', 'conference', 'research'],
    volunteer: ['volunteering', 'board', 'ida'],
    hobby: ['interest'], hobbies: ['interest'],
    goal: ['direction', 'next', 'looking'], future: ['direction', 'next', 'looking'],
  };
  const expand = (tokens) => {
    const out = [...tokens];
    tokens.forEach((t) => (SYN[t] || []).forEach((s) => out.push(stem(s))));
    return out;
  };

  const INTENTS = [
    { re: /\b(contact|reach|email|mail|phone|call|hire|linkedin)\b/i, kind: 'Contact', boost: 4 },
    { re: /\b(educat\w*|degree\w*|stud(y|ied)|universit\w*|school|grades?|msc|master'?s?|bachelor'?s?|courses?)\b/i, kind: 'Education', boost: 3 },
    { re: /\b(projects?|built|build|made|portfolio)\b/i, kind: 'Project', boost: 1.8 },
    { re: /\b(jobs?|work(ed)?|experience|roles?|employ\w*|career)\b/i, kind: 'Experience', boost: 1.5 },
    { re: /\b(publications?|papers?|conference|talks?|research)\b/i, kind: 'Publications', boost: 2 },
    { re: /\b(certific\w*|badges?|kaggle)\b/i, kind: 'Certifications', boost: 3 },
    { re: /\b(volunteer\w*|board|ida)\b/i, kind: 'Volunteering', boost: 2.5 },
    { re: /\b(skills?|tools?|stack|languages?|framework\w*|know)\b/i, kind: 'Skills', boost: 1.5 },
    { re: /\b(goals?|future|ambition\w*|looking for|want|next)\b/i, kind: 'Career goals', boost: 2 },
    { re: /\b(hobb\w*|interests?|free time|spare time)\b/i, kind: 'About', boost: 2 },
  ];
  const intentBoost = (q) => {
    const m = {};
    INTENTS.forEach((it) => { if (it.re.test(q)) m[it.kind] = Math.max(m[it.kind] || 1, it.boost); });
    return m;
  };

  /* ---------- BM25 ---------- */
  function makeIndex(docs) {
    docs.forEach((d) => { d.tokens = tokenize(`${d.t} ${d.x}`); });
    const df = new Map();
    let total = 0;
    docs.forEach((d) => {
      total += d.tokens.length;
      new Set(d.tokens).forEach((t) => df.set(t, (df.get(t) || 0) + 1));
    });
    const avg = total / Math.max(docs.length, 1);
    const N = docs.length;
    const idf = (t) => Math.log(1 + (N - (df.get(t) || 0) + 0.5) / ((df.get(t) || 0) + 0.5));
    return function search(query, k = 5) {
      const base = tokenize(query);
      if (!base.length) return [];
      const q = expand(base);
      const boost = intentBoost(query);
      const scored = docs.map((d) => {
        const tf = new Map();
        d.tokens.forEach((t) => tf.set(t, (tf.get(t) || 0) + 1));
        let score = 0;
        q.forEach((t, i) => {
          const f = tf.get(t) || 0;
          if (!f) return;
          const w = i < base.length ? 1 : 0.45; // synonyms count less than the visitor's own words
          score += w * idf(t) * (f * 2.2) / (f + 1.2 * (0.25 + 0.75 * d.tokens.length / avg));
        });
        return { d, score: score * (d.w || 1) * (boost[d.k] || 1) };
      }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
      const best = scored[0]?.score || 0;
      return scored.filter((x) => x.score >= best * 0.45).slice(0, k);
    };
  }

  /* ---------- loading the index ---------- */
  let indexPromise = null;
  let contact = {};
  let profile = {};
  const loadIndex = () => {
    indexPromise ??= fetch('/data/ask-index.json')
      .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then((data) => { contact = data.contact || {}; profile = data.profile || {}; return makeIndex(data.docs || []); })
      .catch((err) => { indexPromise = null; throw err; });
    return indexPromise;
  };

  /* ---------- panel ---------- */
  const log = $('#ask-log');
  const form = $('#ask-panel-form');
  const input = $('#ask-panel-input');
  let lastTrigger = null;
  let busy = false;

  function open(trigger) {
    lastTrigger = trigger || document.activeElement;
    if (!panel.open) {
      panel.showModal();
      window.trackEvent?.('ask-open');
    }
    input.focus();
    loadIndex().catch(() => {});
  }
  function close() { panel.close(); }

  panel.addEventListener('close', () => {
    if (lastTrigger && document.contains(lastTrigger)) lastTrigger.focus();
  });
  // A click on the dimmed backdrop (outside the sheet) closes the panel.
  panel.addEventListener('click', (e) => {
    if (e.target !== panel) return;
    const r = panel.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) close();
  });
  panel.addEventListener('click', (e) => {
    if (e.target.closest('[data-ask-close]')) close();
    const src = e.target.closest('.sources a');
    if (src) {
      const url = new URL(src.href, location.href);
      if (url.pathname === location.pathname) close(); // same page: close so the section is visible
    }
  });

  document.querySelectorAll('[data-ask-open]').forEach((btn) => btn.addEventListener('click', () => open(btn)));
  document.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-ask-q]');
    if (!chip) return;
    if (!panel.open) open(chip);
    ask(chip.dataset.askQ);
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (!q || busy) return;
    input.value = '';
    ask(q);
  });
  document.querySelectorAll('[data-ask-form]').forEach((f) => f.addEventListener('submit', (e) => {
    e.preventDefault();
    const field = f.querySelector('input');
    const q = field.value.trim();
    if (!q) { field.focus(); return; }
    field.value = '';
    open(f.querySelector('button'));
    ask(q);
  }));

  // A persistent status element, so screen readers hear when an answer arrives.
  const live = document.createElement('p');
  live.className = 'sr-only';
  live.setAttribute('role', 'status');
  panel.appendChild(live);
  const announce = (msg) => { live.textContent = ''; setTimeout(() => { live.textContent = msg; }, 50); };

  function add(cls, html) {
    const el = document.createElement('div');
    el.className = cls;
    el.innerHTML = html;
    log.appendChild(el);
    el.scrollIntoView({ block: 'nearest' });
    return el;
  }

  // Broad questions about who Philip is ("what does he do", "in simple words").
  const BROAD = /\b(who\s+(is|'s)\s+(he|philip|lau|this)|what\s+(does|do|is)\s+(he|philip|lau|you)\s+(do|work|doing)|what\s+is\s+his\s+(job|work)|tell\s+me\s+about\s+(him|philip|yourself)|introduce|in\s+(simple|plain|short)\s+(words|terms|english|language)|summar(y|i[sz]e)|about\s+(him|philip))\b/i;

  const fixedSources = (list) => `<div class="sources"><p class="sources-label">Sources on this site</p><ul>${list.map(([h, s]) =>
    `<li><a href="${esc(h)}">${esc(s)}</a></li>`).join('')}</ul></div>`;

  function sourcesHtml(hits) {
    const seen = new Set();
    const items = hits.filter(({ d }) => {
      const key = `${d.h}|${d.s}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 3);
    if (!items.length) return '';
    return `<div class="sources"><p class="sources-label">Sources on this site</p><ul>${items.map(({ d }) =>
      `<li><a href="${esc(d.h)}">${esc(d.s || d.t)}</a></li>`).join('')}</ul></div>`;
  }

  // Pick the most relevant sentences from the best passages (no AI needed).
  function extractive(q, hits) {
    const qt = new Set(expand(tokenize(q)));
    const picked = [];
    const seen = new Set();
    const usedPages = new Set();
    hits.slice(0, 6).forEach(({ d }) => {
      if (usedPages.has(d.h) && d.k === 'Project') return; // one sentence per project page
      usedPages.add(d.h);
      if (d.sum) {
        if (!seen.has(d.sum)) { seen.add(d.sum); picked.push(d.sum); }
        return;
      }
      const sentences = d.x.split(/(?<=[.!?])\s+(?=[A-Z0-9"“])/).filter((x) => x.length > 25);
      const best = (sentences.length ? sentences : [d.x])
        .map((snt) => ({ snt, score: tokenize(snt).filter((t) => qt.has(t)).length }))
        .sort((a, b) => b.score - a.score)[0];
      if (best && !seen.has(best.snt)) { seen.add(best.snt); picked.push(best.snt); }
    });
    return picked.slice(0, 3);
  }

  async function ask(q) {
    if (busy) return;
    busy = true;
    $('.ask-intro', log)?.remove();
    add('msg-user', esc(q));
    window.trackEvent?.('ask-question'); // counts questions only, never their text
    const status = add('msg-status', 'Looking through the site...');
    status.setAttribute('role', 'status');

    let hits = [];
    try { hits = (await loadIndex())(q, 8); } catch { /* answered below */ }

    let html = '';
    if (ENDPOINT) {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 20000);
        const res = await fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: q }),
          signal: ctrl.signal,
        });
        clearTimeout(timer);
        if (!res.ok) throw new Error(res.status);
        const { answer } = await res.json();
        if (answer) html = `<p>${esc(answer).replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br>')}</p>${sourcesHtml(hits)}`;
      } catch {
        /* fall back to the search below */
      }
    }

    if (!html && intentBoost(q).Contact && hits[0]?.d.k === 'Contact' && contact.email) {
      html = `<p>The quickest way is email: <a href="mailto:${esc(contact.email)}">${esc(contact.email)}</a>. You can also call ${esc(contact.phone)} or connect on <a href="${esc(contact.linkedin)}">LinkedIn</a>. Philip is based in ${esc(contact.location)}.</p>${sourcesHtml(hits)}`;
    }

    if (!html && BROAD.test(q) && (profile.lead || profile.text)) {
      html = `<p>In Philip's own words:</p><p>${esc(profile.lead)}</p><p>${esc(profile.text)}</p>${fixedSources([['/', 'Home'], ['/about/', 'About']])}`;
    }

    if (!html) {
      const top = hits[0]?.score || 0;
      if (!hits.length || top < 1.2) {
        html = '<p>I could not find that on this site. Try asking about his projects, skills, jobs or education, or <a href="/#contact">contact Philip directly</a>.</p>';
      } else {
        html = `<p class="sources-label">Matching passages from this site</p>${extractive(q, hits).map((s) => `<p>${esc(s)}</p>`).join('')}${sourcesHtml(hits)}`;
      }
    }

    status.remove();
    const answer = add('msg-answer', html);
    const n = answer.querySelectorAll('.sources li').length;
    announce(n ? `Answer ready, ${n} source${n === 1 ? '' : 's'}` : 'Answer ready');
    input.placeholder = input.dataset.placeholderNext || input.placeholder;
    busy = false;
  }

})();
