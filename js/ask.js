/* ==========================================================================
   Ask Lau — a small assistant that answers questions about this portfolio.

   How it works
   1. Every piece of portfolio content (jobs, projects, skills, education…)
      becomes a small "document" with a link back to where it lives on the page.
   2. A question is matched against those documents with BM25 keyword search
      (plus a few synonyms), entirely in the browser.
   3. If an AI endpoint is configured (data/site.json → ask.endpoint), the
      question is sent there and an AI writes the answer from the portfolio.
      Otherwise the best-matching passages are shown directly.
   Either way, every answer lists the sources it came from.
   ========================================================================== */
(() => {
  'use strict';

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

  // Everyday words → the vocabulary used on the site.
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
    language: ['programming', 'danish', 'english'],
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
    goal: ['career', 'horizon', 'trajectory'], future: ['career', 'goal', 'trajectory'],
  };
  const expand = (tokens) => {
    const out = [...tokens];
    tokens.forEach((t) => (SYN[t] || []).forEach((s) => out.push(stem(s))));
    return out;
  };

  const firstSentence = (t) => (String(t).match(/^.*?[.!?](\s|$)/)?.[0] || String(t)).trim();

  /* ---------- build the knowledge base ---------- */
  function buildDocs({ data = {}, projects = [] }) {
    const docs = [];
    const add = (title, text, href, kind, weight = 1) => text && docs.push({ title, text: String(text).trim(), href, kind, weight });
    const s = data.site || {};
    const c = s.contact || {};

    add('About Philip', `${s.bio} ${s.quote || ''}`, '#about', 'About', 1.1);
    add('Current role', `${s.name} is currently ${s.role}. ${s.availability_text || ''}.`, '#top', 'About', 1.2);
    add('Languages & interests', `Speaks ${(s.languages || []).join(' and ')}. Interests: ${(s.interests || []).join(', ')}. Based in ${c.location}.`, '#about', 'About');
    (s.goals || []).forEach((g) => add(`Career goal (${g.horizon})`, g.text, '#about', 'Career goals'));
    if (s.quick?.looking_for) add('Roles he is looking for', `Open to roles in ${s.quick.looking_for.replace(/ · /g, ', ')}.`, '#about', 'Career goals', 1.2);
    (s.quick?.highlights || []).forEach((h) => add('Highlight', h, '#quick', 'Highlights', 1.15));
    add('Contact', `Email ${c.email}. Phone ${c.phone}. Based in ${c.location}. LinkedIn ${c.linkedin}.`, '#contact', 'Contact', 1.3);
    (s.now || []).forEach((n) => add(`Now — ${n.kicker}: ${n.title}`, n.text, n.href, 'Right now'));
    if (s.featured) add(`Highlighted media — ${s.featured.title}`, `${s.featured.kicker}. ${s.featured.text} ${s.featured.badge || ''}`, '#featured', 'Media');

    (data.experience || []).forEach((j) => {
      const head = `${j.title} at ${j.org.split(' — ')[0]} (${j.period})`;
      add(head, `${j.title}, ${j.org}, ${j.period}.`, '#experience', 'Experience', 0.8);
      (j.points || []).forEach((p) => {
        const text = typeof p === 'string' ? p : `${p.text} ${(p.sub || []).join(' ')}`;
        add(head, text, '#experience', 'Experience');
      });
    });
    (data.education || []).forEach((e) => add(e.title, `${e.title}, ${e.org}, ${e.period} — final grade ${e.grade}. ${(e.points || []).join(' ')} Courses: ${(e.courses || []).join(', ')}.`, '#education', 'Education', 1.1));
    (data.volunteering || []).forEach((v) => add(`${v.title} — ${v.org}`, `${v.title}, ${v.org}, ${v.period}. ${(v.points || []).join(' ')}`, '#volunteering', 'Volunteering'));

    const sk = data.skills || {};
    const groups = {};
    (sk.tools || []).forEach((t) => (groups[t.group] ??= []).push(t.name));
    Object.entries(groups).forEach(([g, names]) => add(`Skills — ${g}`, `${g}: ${names.join(', ')}.`, '#skills', 'Skills'));
    (sk.capabilities || []).forEach((cap) => cap.items.forEach((i) => add(`${cap.title} skill — ${i.name}`, `${i.name}: ${i.text}`, '#skills', 'Skills')));
    if (sk.learning?.length) add('Currently learning', `Currently learning ${sk.learning.join(', ')}. Next up: ${(sk.bucket_list || []).join(', ')}.`, '#skills', 'Skills');

    (data.publications || []).forEach((p) => add(p.title, `${p.type} (${p.year}): ${p.title}. ${p.authors}. ${p.venue}. ${p.status || ''}`, '#publications', 'Publications', 1.1));
    (data.certifications || []).forEach((ce) => add(ce.title, `${ce.type} from ${ce.issuer}: ${ce.title} (${ce.date}).`, '#certifications', 'Certifications'));
    (data.references || []).forEach((r) => add(`Reference — ${r.person}`, `${r.person}, ${r.title}, ${r.company} (${r.relation}).`, '#references', 'References', 0.8));

    projects.forEach((p) => {
      const href = `#project/${p.id}`;
      const name = p.short || p.title.split(':')[0];
      add(p.title, `${p.title}. ${p.short_desc} (${p.status} ${p.category} project)`, href, 'Project', 1.25);
      docs[docs.length - 1].summary = `${name} — ${firstSentence(p.short_desc)}`;
      add(p.title, p.blueprint_desc, href, 'Project');
      add(`${name} — technical details`, `${p.tech_notes || ''} Technologies: ${(p.tags || []).join(', ')}.`, href, 'Project', 0.9);
    });

    docs.forEach((d, i) => { d.id = i; d.tokens = tokenize(`${d.title} ${d.text}`); });
    return docs;
  }

  const INTENTS = [
    { re: /\b(contact|reach|email|mail|phone|call|hire|linkedin)\b/i, kind: 'Contact', boost: 4 },
    { re: /\b(educat\w*|degree\w*|stud(y|ied)|universit\w*|school|grades?|msc|master'?s?|bachelor'?s?|courses?)\b/i, kind: 'Education', boost: 3 },
    { re: /\b(projects?|built|build|made|portfolio)\b/i, kind: 'Project', boost: 1.8 },
    { re: /\b(jobs?|work(ed)?|experience|roles?|employ\w*|career)\b/i, kind: 'Experience', boost: 1.5 },
    { re: /\b(publications?|papers?|conference|talks?|research)\b/i, kind: 'Publications', boost: 2 },
    { re: /\b(certific\w*|badges?|kaggle)\b/i, kind: 'Certifications', boost: 3 },
    { re: /\b(volunteer\w*|board|ida)\b/i, kind: 'Volunteering', boost: 2.5 },
    { re: /\b(skills?|tools?|stack|languages?|framework\w*|know)\b/i, kind: 'Skills', boost: 1.5 },
    { re: /\b(goals?|future|ambition\w*|looking for|want)\b/i, kind: 'Career goals', boost: 2 },
    { re: /\b(hobb\w*|interests?|free time|spare time)\b/i, kind: 'About', boost: 2 },
  ];
  const intentBoost = (q) => {
    const m = {};
    INTENTS.forEach((it) => { if (it.re.test(q)) m[it.kind] = Math.max(m[it.kind] || 1, it.boost); });
    return m;
  };

  /* ---------- BM25 ---------- */
  function makeIndex(docs) {
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
          const w = i < base.length ? 1 : 0.45; // synonyms count less than the user's own words
          score += w * idf(t) * (f * 2.2) / (f + 1.2 * (0.25 + 0.75 * d.tokens.length / avg));
        });
        return { d, score: score * d.weight * (boost[d.kind] || 1) };
      }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
      // keep only passages that are reasonably close to the best match
      const best = scored[0]?.score || 0;
      return scored.filter((x) => x.score >= best * 0.45).slice(0, k);
    };
  }

  /* ---------- UI ---------- */
  const SUGGESTIONS = [
    'What did he do at LEGO?',
    'Which AI projects has he built?',
    'What is his education?',
    'What roles is he looking for?',
    'How can I contact him?',
  ];

  let search = null;
  let docs = [];
  let cfg = {};
  let busy = false;

  function mount() {
    const root = document.createElement('div');
    root.className = 'ask';
    root.innerHTML = `
      <div class="ask-panel" id="ask-panel" role="dialog" aria-modal="false" aria-labelledby="ask-title" hidden>
        <header class="ask-head">
          <span class="ask-avatar" aria-hidden="true">L</span>
          <div>
            <h2 id="ask-title">Ask Lau</h2>
            <p>Questions about Philip's work, skills and experience</p>
          </div>
          <button class="icon-btn" type="button" id="ask-close" aria-label="Close Ask Lau"><svg><use href="#i-close"/></svg></button>
        </header>
        <div class="ask-log" id="ask-log" aria-live="polite">
          <div class="msg bot">
            <p>Hi! I answer questions using only what's on this site, and I always show where the answer comes from. Try one of these:</p>
            <div class="ask-suggest">${SUGGESTIONS.map((q) => `<button type="button" class="chip" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>
          </div>
        </div>
        <form class="ask-form" id="ask-form" autocomplete="off">
          <input id="ask-input" type="text" maxlength="300" placeholder="Ask about skills, projects, jobs…" aria-label="Your question">
          <button class="ask-send" type="submit" aria-label="Send"><svg><use href="#i-arrow"/></svg></button>
        </form>
        <p class="ask-note" id="ask-note">${cfg.endpoint ? 'AI answers based on this portfolio — they can occasionally be wrong.' : 'Answers are taken directly from this portfolio.'} For anything important, <a href="#contact">ask Philip directly</a>.</p>
      </div>
      <button class="ask-fab" type="button" id="ask-fab" aria-controls="ask-panel" aria-expanded="false">
        <svg aria-hidden="true"><use href="#i-spark"/></svg>
        <span>Ask Lau</span>
      </button>`;
    document.body.appendChild(root);

    const panel = $('#ask-panel');
    const fab = $('#ask-fab');
    const input = $('#ask-input');
    const setOpen = (open) => {
      panel.hidden = !open;
      fab.setAttribute('aria-expanded', String(open));
      root.classList.toggle('open', open);
      if (open) { setTimeout(() => input.focus(), 50); window.trackEvent?.('ask-open'); }
      else fab.focus({ preventScroll: true });
    };
    fab.addEventListener('click', () => setOpen(panel.hidden));
    $('#ask-close').addEventListener('click', () => setOpen(false));
    panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } });

    $('#ask-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const q = input.value.trim();
      if (!q || busy) return;
      input.value = '';
      ask(q);
    });
    panel.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-q]');
      if (chip) return ask(chip.dataset.q);
      const src = e.target.closest('a[data-href]');
      if (src) {
        e.preventDefault();
        go(src.dataset.href);
        if (matchMedia('(max-width: 640px)').matches) setOpen(false);
      }
    });
  }

  function go(href) {
    const P = window.Portfolio;
    const m = href.match(/^#project\/(.+)$/);
    if (m && P) {
      const idx = P.projects.findIndex((p) => p.id === m[1]);
      if (idx >= 0) return P.openProject(idx);
    }
    if (href === '#quick' && P) return P.openQuick();
    const el = document.querySelector(href);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function addMsg(role, html) {
    const log = $('#ask-log');
    const div = document.createElement('div');
    div.className = `msg ${role}`;
    div.innerHTML = html;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
    return div;
  }

  function sourcesHtml(hits) {
    const seen = new Set();
    const items = hits.filter(({ d }) => {
      const key = d.href + d.kind;
      if (seen.has(key)) return false;
      seen.add(key); return true;
    }).slice(0, 4);
    if (!items.length) return '';
    return `<div class="ask-sources"><span>Sources</span>${items.map(({ d }) =>
      `<a href="${esc(d.href)}" data-href="${esc(d.href)}">${esc(d.kind)} · ${esc(shortTitle(d.title))}</a>`).join('')}</div>`;
  }
  const shortTitle = (t) => { const x = t.split(/:| — | at /)[0]; return x.length > 30 ? `${x.slice(0, 28)}…` : x; };

  // Pick the most relevant sentences from the top passages (no AI needed).
  function extractive(q, hits) {
    const qt = new Set(expand(tokenize(q)));
    const picked = [];
    const seen = new Set();
    hits.slice(0, 4).forEach(({ d }) => {
      if (d.summary) {
        if (!seen.has(d.summary)) { seen.add(d.summary); picked.push({ text: d.summary, d }); }
        return;
      }
      const sentences = d.text.split(/(?<=[.!?])\s+(?=[A-Z0-9"“])/).filter((x) => x.length > 25);
      const best = (sentences.length ? sentences : [d.text])
        .map((snt) => ({ snt, score: tokenize(snt).filter((t) => qt.has(t)).length }))
        .sort((a, b) => b.score - a.score)[0];
      if (best && !seen.has(best.snt)) { seen.add(best.snt); picked.push({ text: best.snt, d }); }
    });
    return picked.slice(0, 3);
  }

  async function ask(q) {
    if (!search) return;
    busy = true;
    addMsg('user', `<p>${esc(q)}</p>`);
    window.trackEvent?.('ask-question'); // counts questions only — the text is never sent to analytics
    const hits = search(q, 8);
    const typing = addMsg('bot typing', '<span></span><span></span><span></span>');

    let html = '';
    if (cfg.endpoint) {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 20000);
        const res = await fetch(cfg.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: q }),
          signal: ctrl.signal,
        });
        clearTimeout(timer);
        if (!res.ok) throw new Error(res.status);
        const { answer } = await res.json();
        if (answer) html = `<p>${esc(answer).replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br>')}</p>${sourcesHtml(hits)}`;
      } catch (e) {
        console.warn('Ask Lau: AI endpoint unavailable, using search instead.', e);
      }
    }

    if (!html && intentBoost(q).Contact && (hits[0]?.d.kind === 'Contact')) {
      const c = window.Portfolio?.data?.site?.contact || {};
      html = `<p>The quickest way is email: <a href="mailto:${esc(c.email)}">${esc(c.email)}</a>. You can also call ${esc(c.phone)} or connect on <a href="${esc(c.linkedin)}" target="_blank" rel="noopener">LinkedIn</a>. Philip is based in ${esc(c.location)}.</p>${sourcesHtml(hits)}`;
    }

    if (!html) {
      const top = hits[0]?.score || 0;
      if (!hits.length || top < 1.2) {
        html = `<p>I couldn't find that on this site. I only know what's in Philip's portfolio — try asking about his projects, skills, jobs or education, or <a href="#contact" data-href="#contact">contact him directly</a>.</p>`;
      } else {
        const lines = extractive(q, hits);
        html = `<p>Here's what I found:</p><ul class="ask-answer">${lines.map((l) => `<li>${esc(l.text)}</li>`).join('')}</ul>${sourcesHtml(hits)}`;
      }
    }

    await new Promise((r) => setTimeout(r, 350)); // brief pause so the reply doesn't flash in
    typing.remove();
    addMsg('bot', html);
    busy = false;
  }

  function init() {
    const P = window.Portfolio;
    if (!P || search) return;
    cfg = P.data?.site?.ask || {};
    if (cfg.enabled === false) return;
    docs = buildDocs(P);
    search = makeIndex(docs);
    mount();
  }

  if (window.Portfolio) init();
  else window.addEventListener('portfolio:ready', init, { once: true });
})();
