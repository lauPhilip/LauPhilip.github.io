/* Small enhancements for the generated pages. All content is in the HTML;
   this file only adds analytics, copy-to-clipboard, project filters and clips. */
(() => {
  'use strict';

  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  /* ---------- analytics (GoatCounter, no cookies) ---------- */
  window.trackEvent = (name) => {
    try { window.goatcounter?.count?.({ path: `event/${name}`, title: name, event: true }); } catch { /* ignore */ }
  };
  const code = document.querySelector('meta[name="goatcounter"]')?.content;
  if (code && !/^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(location.hostname)) {
    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://gc.zgo.at/count.js';
    s.dataset.goatcounter = `https://${code}.goatcounter.com/count`;
    document.head.appendChild(s);
  }
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-track]');
    if (t) window.trackEvent(t.dataset.track);
  });

  /* ---------- copy email address ---------- */
  $$('[data-copy-email]').forEach((btn) => {
    const status = btn.parentElement.querySelector('.copy-status');
    btn.addEventListener('click', async () => {
      const addr = btn.dataset.copyEmail;
      let ok = false;
      try { await navigator.clipboard.writeText(addr); ok = true; } catch { /* fall through */ }
      if (status) status.textContent = ok ? btn.dataset.copied : addr;
      if (ok) window.trackEvent('copy-email');
      setTimeout(() => { if (status) status.textContent = ''; }, 4000);
    });
  });

  /* ---------- work filters ---------- */
  const filterBtns = $$('[data-filter]');
  if (filterBtns.length) {
    const items = $$('.work-list > li');
    const status = document.getElementById('filter-status');
    filterBtns.forEach((btn) => btn.addEventListener('click', () => {
      const key = btn.dataset.filter;
      filterBtns.forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
      let shown = 0;
      items.forEach((li) => {
        const on = key === 'all' || li.dataset.group === key;
        li.hidden = !on;
        if (on) shown += 1;
      });
      if (status) status.textContent = `Showing ${shown} ${shown === 1 ? 'project' : 'projects'}`;
    }));
  }

  /* ---------- clips on cards: play on hover or focus, desktop only, one at a time ---------- */
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  let playing = null;
  const stop = (v) => { if (v) { v.pause(); v.currentTime = 0; v.hidden = true; } };
  $$('[data-clip]').forEach((box) => {
    const link = box.closest('a');
    if (!link) return;
    let video = null;
    const start = () => {
      if (!finePointer.matches || reducedMotion.matches) return;
      if (!video) {
        video = document.createElement('video');
        Object.assign(video, { src: box.dataset.clip, muted: true, loop: true, playsInline: true, preload: 'none' });
        video.setAttribute('aria-hidden', 'true');
        box.appendChild(video);
      }
      if (playing && playing !== video) stop(playing);
      video.hidden = false;
      video.play().catch(() => { video.hidden = true; });
      playing = video;
    };
    const end = () => { stop(video); if (playing === video) playing = null; };
    link.addEventListener('mouseenter', start);
    link.addEventListener('mouseleave', end);
    link.addEventListener('focus', start);
    link.addEventListener('blur', end);
  });

  /* ---------- clip on a project page: muted loop with a pause button ---------- */
  $$('[data-clip-player]').forEach((fig) => {
    const video = fig.querySelector('video');
    const btn = fig.querySelector('[data-clip-toggle]');
    if (!video || !btn) return;
    video.controls = false;
    btn.hidden = false;
    const label = () => { btn.textContent = video.paused ? 'Play' : 'Pause'; };
    btn.addEventListener('click', () => { if (video.paused) video.play().catch(label); else video.pause(); });
    video.addEventListener('play', label);
    video.addEventListener('pause', label);
    if (!reducedMotion.matches) video.play().catch(label);
    label();
  });
})();
