#!/usr/bin/env python3
"""Build Philip Lau's portfolio as static HTML.

Reads data/*.json and projects/<id>/info.json and writes:

    index.html               Home
    work/index.html          All projects
    work/<slug>/index.html   One page per project
    about/index.html         Experience, education, skills and more
    404.html                 Not found page
    sitemap.xml, robots.txt  For search engines
    data/ask-index.json      Passages used by the Ask feature (browser and Worker)

Usage:
    python3 build.py          write the pages
    python3 build.py --check  exit 1 if any generated file is out of date

No third-party packages: only the Python 3 standard library.
"""

from __future__ import annotations

import hashlib
import html
import json
import re
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SITE_URL = "https://lauphilip.github.io"


# --------------------------------------------------------------------------
# Loading data
# --------------------------------------------------------------------------

def load_json(rel: str, default=None):
    path = ROOT / rel
    if not path.exists():
        return default
    with path.open(encoding="utf-8") as fh:
        return json.load(fh)


def load_all() -> dict:
    data = {
        "site": load_json("data/site.json", {}),
        "experience": load_json("data/experience.json", []),
        "education": load_json("data/education.json", []),
        "volunteering": load_json("data/volunteering.json", []),
        "skills": load_json("data/skills.json", {}),
        "publications": load_json("data/publications.json", []),
        "certifications": load_json("data/certifications.json", []),
        "references": load_json("data/references.json", []),
    }
    projects = []
    for entry in load_json("data/projects.json", []):
        info = load_json(f"projects/{entry['id']}/info.json")
        if not info:
            print(f"warning: projects/{entry['id']}/info.json is missing, skipped", file=sys.stderr)
            continue
        project = {**info, **entry}
        project.setdefault("slug", entry["id"].removeprefix("project_").replace("_", "-"))
        project.setdefault("short", info.get("title", "").split(":")[0].strip())
        projects.append(project)
    data["projects"] = projects
    return data


# --------------------------------------------------------------------------
# Small helpers
# --------------------------------------------------------------------------

def e(value) -> str:
    """Escape text for HTML content and attribute values."""
    return html.escape(str(value if value is not None else ""), quote=True)


LINK_RE = re.compile(r"\[([^\]]+)\]\(([^)\s]+)\)")


def inline(text: str, **subs) -> str:
    """Escape a copy string and turn [label](url) into links. {name} placeholders are filled from subs."""
    for key, val in subs.items():
        text = text.replace("{" + key + "}", str(val))
    out = e(text)
    return LINK_RE.sub(lambda m: f'<a href="{m.group(2)}">{m.group(1)}</a>', out)


def period(text: str) -> str:
    return str(text or "").replace(" — ", " to ").replace("—", " to ").replace("Present", "now")


NUMBER_WORDS = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty".split()


def number_word(n: int) -> str:
    return NUMBER_WORDS[n] if 0 <= n < len(NUMBER_WORDS) else str(n)


def lower_first(text: str) -> str:
    """'Main developer' -> 'main developer', but leave 'LEGO', 'C#' or 'Marvel' alone."""
    if not text:
        return text
    word = text.split()[0]
    if word.isupper() or word in {"Marvel", "Olympic"} or (len(word) > 1 and not word[1:].islower()):
        return text
    return text[0].lower() + text[1:]


def join_words(items: list[str]) -> str:
    items = [i for i in items if i]
    if len(items) <= 1:
        return "".join(items)
    return ", ".join(items[:-1]) + " and " + items[-1]


def file_hash(rel: str) -> str:
    path = ROOT / rel
    if not path.exists():
        return "0"
    return hashlib.sha256(path.read_bytes()).hexdigest()[:10]


_size_cache: dict[str, tuple[int, int] | None] = {}


def image_size(rel: str) -> tuple[int, int] | None:
    """Width and height of a WebP, PNG or JPEG file, read from its header."""
    if rel in _size_cache:
        return _size_cache[rel]
    size = None
    path = ROOT / rel
    if path.exists():
        data = path.read_bytes()
        if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
            kind = data[12:16]
            if kind == b"VP8 ":
                w, h = struct.unpack("<HH", data[26:30])
                size = (w & 0x3FFF, h & 0x3FFF)
            elif kind == b"VP8L":
                bits = int.from_bytes(data[21:25], "little")
                size = ((bits & 0x3FFF) + 1, ((bits >> 14) & 0x3FFF) + 1)
            elif kind == b"VP8X":
                size = (int.from_bytes(data[24:27], "little") + 1, int.from_bytes(data[27:30], "little") + 1)
        elif data[:8] == b"\x89PNG\r\n\x1a\n":
            size = struct.unpack(">II", data[16:24])
        elif data[:2] == b"\xff\xd8":
            i = 2
            while i < len(data) - 9:
                if data[i] != 0xFF:
                    i += 1
                    continue
                marker = data[i + 1]
                if marker in (0xC0, 0xC1, 0xC2):
                    h, w = struct.unpack(">HH", data[i + 5:i + 9])
                    size = (w, h)
                    break
                i += 2 + struct.unpack(">H", data[i + 2:i + 4])[0]
    _size_cache[rel] = size
    return size


def img(rel: str, alt: str, cls: str = "", lazy: bool = True, priority: bool = False, extra: str = "") -> str:
    attrs = [f'src="/{e(rel)}"', f'alt="{e(alt)}"']
    size = image_size(rel)
    if size:
        attrs.append(f'width="{size[0]}" height="{size[1]}"')
    if cls:
        attrs.append(f'class="{cls}"')
    if priority:
        attrs.append('fetchpriority="high"')
    elif lazy:
        attrs.append('loading="lazy"')
    attrs.append('decoding="async"')
    if extra:
        attrs.append(extra)
    return f"<img {' '.join(attrs)}>"


def humanize_image(rel: str) -> str:
    stem = Path(rel).stem
    stem = re.sub(r"[-_]\d+$", "", stem)
    words = re.sub(r"[-_]+", " ", stem).strip()
    return words[:1].upper() + words[1:]


def project_cover(p: dict) -> str | None:
    if p.get("cover"):
        return p["cover"]
    if p.get("poster"):
        return p["poster"]
    images = p.get("images") or []
    return images[0] if images else None


def project_meta(p: dict) -> str:
    org, role = p.get("org", ""), p.get("role", "")
    if not role:
        return org
    if not org or org.lower() in role.lower() or role.lower().startswith(org.split()[0].lower()):
        return role
    return f"{org}, {lower_first(role)}"


def mailto(site: dict) -> str:
    return f"mailto:{site.get('contact', {}).get('email', '')}"


# --------------------------------------------------------------------------
# Icons (inline SVG, decorative)
# --------------------------------------------------------------------------

ICON_CHAT = ('<svg aria-hidden="true" focusable="false" width="17" height="17" viewBox="0 0 24 24" fill="none" '
             'stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M4 5h16v11H9l-5 4z"/></svg>')
ICON_CLOSE = ('<svg aria-hidden="true" focusable="false" width="20" height="20" viewBox="0 0 24 24" fill="none" '
              'stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>')


# --------------------------------------------------------------------------
# Shared layout
# --------------------------------------------------------------------------

def head(d: dict, *, path: str | None, title: str, description: str, og_image: str | None = None,
         extra: str = "", noindex: bool = False) -> str:
    site = d["site"]
    url = SITE_URL + path if path else None
    image = SITE_URL + "/" + (og_image or "img/og.jpg")
    goat = (site.get("analytics") or {}).get("goatcounter", "")
    ask_on = (site.get("ask") or {}).get("enabled", True) is not False
    lines = [
        "<!DOCTYPE html>",
        '<html lang="en" class="no-js">',
        "<head>",
        '<meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1">',
        f"<title>{e(title)}</title>",
        f'<meta name="description" content="{e(description)}">',
        '<meta name="color-scheme" content="light dark">',
        '<meta name="theme-color" content="#FFFFFF" media="(prefers-color-scheme: light)">',
        '<meta name="theme-color" content="#0E0E10" media="(prefers-color-scheme: dark)">',
    ]
    if noindex:
        lines.append('<meta name="robots" content="noindex">')
    if url:
        lines.append(f'<link rel="canonical" href="{e(url)}">')
        lines.append(f'<meta property="og:url" content="{e(url)}">')
    lines += [
        '<meta property="og:type" content="website">',
        f'<meta property="og:site_name" content="{e(site.get("name", ""))}">',
        f'<meta property="og:title" content="{e(title)}">',
        f'<meta property="og:description" content="{e(description)}">',
        f'<meta property="og:image" content="{e(image)}">',
        '<meta name="twitter:card" content="summary_large_image">',
        '<link rel="icon" href="/img/favicon.svg" type="image/svg+xml">',
        '<link rel="preload" href="/fonts/schibsted-grotesk-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin>',
        '<link rel="preload" href="/fonts/schibsted-grotesk-latin-600-normal.woff2" as="font" type="font/woff2" crossorigin>',
        f'<link rel="stylesheet" href="/css/style.css?v={file_hash("css/style.css")}">',
        "<script>document.documentElement.className='js'</script>",
    ]
    if goat:
        lines.append(f'<meta name="goatcounter" content="{e(goat)}">')
    lines.append(f'<script src="/js/site.js?v={file_hash("js/site.js")}" defer></script>')
    if ask_on:
        lines.append(f'<script src="/js/ask.js?v={file_hash("js/ask.js")}" defer></script>')
    if extra:
        lines.append(extra)
    lines.append("</head>")
    return "\n".join(lines)


def header(d: dict, active: str | None, exact: bool) -> str:
    site = d["site"]
    ask_on = (site.get("ask") or {}).get("enabled", True) is not False

    def nav_link(key: str, href: str, label: str) -> str:
        cls = ' class="is-active"' if active == key else ""
        cur = ' aria-current="page"' if active == key and exact else ""
        return f'<a href="{href}"{cls}{cur}>{label}</a>'

    ask_btn = ""
    if ask_on:
        ask_btn = ('<button type="button" class="ask-trigger js-only" data-ask-open aria-haspopup="dialog">'
                   f'{ICON_CHAT}<span class="ask-trigger-label">Ask</span><span class="sr-only"> about my work</span></button>')
    return f"""<a class="skip-link" href="#main">Skip to content</a>
<header class="site-header">
<div class="wrap header-inner">
<a class="brand" href="/">{e(site.get("name", "Philip Lau"))}</a>
<nav class="site-nav" aria-label="Main">
{nav_link("work", "/work/", "Work")}
{nav_link("about", "/about/", "About")}
<a href="/#contact">Contact</a>
{ask_btn}
</nav>
</div>
</header>"""


def footer(d: dict, full: bool) -> str:
    site = d["site"]
    c = site.get("contact", {})
    updated = site.get("updated", "")
    year = updated.split()[-1] if updated else ""
    name = site.get("name", "")
    copyright_line = f"© {e(year)} {e(name)}".strip()
    if not full:
        return f"""<footer class="site-footer footer-slim">
<div class="wrap footer-slim-inner">
<div class="footer-slim-links">
<a href="mailto:{e(c.get('email'))}">{e(c.get('email'))}</a>
<a href="{e(c.get('linkedin'))}">LinkedIn</a>
<a href="{e(c.get('github'))}">GitHub</a>
</div>
<p>{copyright_line}</p>
</div>
</footer>"""
    cs = site.get("contact_section", {})
    return f"""<footer id="contact" class="site-footer footer-full" aria-labelledby="contact-title">
<div class="wrap footer-full-inner">
<h2 id="contact-title" class="contact-title">{e(cs.get("title", "Contact"))}</h2>
<p class="contact-text">{e(cs.get("text", ""))}</p>
<div class="contact-email">
<a class="email-link" href="mailto:{e(c.get('email'))}">{e(c.get('email'))}</a>
<button type="button" class="btn btn-secondary btn-small js-only" data-copy-email="{e(c.get('email'))}" data-copied="{e(cs.get('copied_label', 'Address copied'))}">{e(cs.get("copy_label", "Copy address"))}</button>
<span class="copy-status" role="status"></span>
</div>
<ul class="contact-links">
<li>{e(c.get("phone", ""))}</li>
<li><a href="{e(c.get('linkedin'))}">LinkedIn</a></li>
<li><a href="{e(c.get('github'))}">GitHub</a></li>
<li>{e(c.get("location", ""))}</li>
</ul>
<div class="footer-base">
<p>{copyright_line}</p>
<p>Last updated {e(updated)}</p>
</div>
</div>
</footer>"""


def ask_dialog(d: dict) -> str:
    ask = d["site"].get("ask") or {}
    if ask.get("enabled", True) is False:
        return ""
    examples = d["site"].get("home", {}).get("ask_examples", [])
    chips = "".join(f'<button type="button" class="chip" data-ask-q="{e(q)}">{e(q)}</button>' for q in examples)
    endpoint = f' data-endpoint="{e(ask["endpoint"])}"' if ask.get("endpoint") else ""
    return f"""<dialog class="ask-panel" id="ask-panel" aria-labelledby="ask-panel-title"{endpoint}>
<div class="ask-panel-head">
<h2 id="ask-panel-title">{e(ask.get("title", "Ask about my work"))}</h2>
<button type="button" class="icon-btn" data-ask-close aria-label="Close">{ICON_CLOSE}</button>
</div>
<div class="ask-log" id="ask-log" role="log" aria-live="polite" aria-relevant="additions">
<div class="ask-intro">
<p>{e(ask.get("intro", ""))}</p>
<div class="chips">{chips}</div>
</div>
</div>
<form class="ask-panel-form" id="ask-panel-form" autocomplete="off">
<label class="sr-only" for="ask-panel-input">Your question</label>
<input id="ask-panel-input" name="q" type="text" maxlength="300" placeholder="{e(ask.get("placeholder_first", "Ask a question"))}" data-placeholder-next="{e(ask.get("placeholder", "Ask another question"))}">
<button type="submit" class="btn btn-primary">Ask</button>
</form>
<p class="ask-note">{e(ask.get("note", ""))}</p>
</dialog>"""


def page(d: dict, *, path: str | None, title: str, description: str, main: str, active: str | None = None,
         exact: bool = True, full_footer: bool = False, og_image: str | None = None, extra_head: str = "",
         noindex: bool = False) -> str:
    return "\n".join([
        head(d, path=path, title=title, description=description, og_image=og_image, extra=extra_head, noindex=noindex),
        "<body>",
        header(d, active, exact),
        main,
        footer(d, full_footer),
        ask_dialog(d),
        "</body>",
        "</html>",
        "",
    ])


def person_json_ld(d: dict) -> str:
    site = d["site"]
    c = site.get("contact", {})
    data = {
        "@context": "https://schema.org",
        "@type": "Person",
        "name": site.get("name"),
        "jobTitle": site.get("role", "").split(",")[0],
        "affiliation": {"@type": "CollegeOrUniversity", "name": "Aarhus University"},
        "address": {"@type": "PostalAddress", "addressLocality": c.get("location", "").split(",")[0], "addressCountry": "DK"},
        "email": f"mailto:{c.get('email', '')}",
        "url": SITE_URL + "/",
        "image": SITE_URL + "/" + site.get("avatar", "img/avatar.webp"),
        "sameAs": [u for u in (c.get("linkedin"), c.get("github")) if u],
    }
    return '<script type="application/ld+json">' + json.dumps(data, ensure_ascii=False) + "</script>"


# --------------------------------------------------------------------------
# Pages
# --------------------------------------------------------------------------

def thumb(p: dict, cls: str) -> str:
    cover = project_cover(p)
    if not cover:
        return f'<div class="{cls} thumb-empty" aria-hidden="true"></div>'
    clip = ""
    if p.get("clip"):
        clip = f' data-clip="/{e(p["clip"])}"'
    pos = p.get("cover_position")
    extra = f'style="object-position: {e(pos)}"' if pos else ""
    return f'<div class="{cls}"{clip}>{img(cover, "", extra=extra)}</div>'


def home_page(d: dict) -> str:
    site = d["site"]
    home = site.get("home", {})
    projects = d["projects"]
    by_id = {p["id"]: p for p in projects}
    picks = [by_id[i] for i in home.get("projects", []) if i in by_id] or [p for p in projects if p.get("featured")][:3]

    cards = []
    for p in picks:
        cards.append(f"""<li class="project-card">
<a href="/work/{e(p['slug'])}/">
{thumb(p, "card-media")}
<h3>{e(p.get('short') or p.get('title'))}</h3>
<p>{e(p.get('tagline') or p.get('short_desc', ''))}</p>
</a>
</li>""")

    examples = "".join(f'<button type="button" class="chip" data-ask-q="{e(q)}">{e(q)}</button>' for q in home.get("ask_examples", []))
    ask_on = (site.get("ask") or {}).get("enabled", True) is not False
    ask_section = ""
    if ask_on:
        ask_section = f"""<section class="home-section ask-section js-only" aria-labelledby="ask-title">
<h2 id="ask-title" class="h2-medium">{e(home.get("ask_title", ""))}</h2>
<p class="section-text">{e(home.get("ask_text", ""))}</p>
<form class="ask-inline" data-ask-form autocomplete="off">
<label class="sr-only" for="ask-input">Your question</label>
<input id="ask-input" name="q" type="text" maxlength="300" placeholder="{e(home.get("ask_placeholder", ""))}">
<button type="submit" class="btn btn-primary btn-tall">Ask</button>
</form>
<div class="chips">{examples}</div>
</section>"""

    talk = ""
    if home.get("talk_image"):
        talk = f"""<figure class="talk-figure">
{img(home["talk_image"], home.get("talk_alt", ""), cls="talk-img")}
<figcaption>{e(home.get("talk_caption", ""))}</figcaption>
</figure>"""

    redirect_map = {p["id"]: p["slug"] for p in projects}
    redirect = ("<script>(function(){var m=location.hash.match(/^#project\\/(.+)$/);if(!m)return;"
                f"var s={json.dumps(redirect_map, separators=(',', ':'))}[decodeURIComponent(m[1])];"
                "location.replace(s?'/work/'+s+'/':'/work/');})();</script>")

    main = f"""<main id="main" class="wrap home">
<section class="hero" aria-labelledby="hero-title">
{img(site.get("avatar", "img/avatar.webp"), "Portrait of " + site.get("name", ""), cls="hero-portrait", lazy=False, priority=True)}
<div class="hero-text">
<h1 id="hero-title" class="display">{e(home.get("hero_title", site.get("name", "")))}</h1>
<p class="hero-lead">{e(home.get("hero_lead", site.get("headline", "")))}</p>
<p class="hero-body">{e(home.get("hero_text", site.get("intro", "")))}</p>
<div class="actions">
<a class="btn btn-primary" href="{e(mailto(site))}">{e(home.get("primary_cta", "Email me"))}</a>
<a class="btn btn-secondary" href="/about/">{e(home.get("secondary_cta", "My experience"))}</a>
</div>
</div>
</section>

<section class="home-section" aria-labelledby="work-title">
<h2 id="work-title" class="h2-large">{e(home.get("projects_title", "Selected work"))}</h2>
<ul class="card-grid">
{chr(10).join(cards)}
</ul>
<a class="more-link" href="/work/">{e(home.get("projects_link", "See all projects").replace("{count}", str(len(projects))))}</a>
</section>

<section class="home-section between" aria-labelledby="between-title">
{talk}
<div class="between-text">
<h2 id="between-title" class="h2-medium">{e(home.get("between_title", ""))}</h2>
<p>{e(home.get("between_text", ""))}</p>
<a class="more-link" href="/about/">{e(home.get("between_link", "Read more"))}</a>
</div>
</section>
{ask_section}
</main>"""
    return page(d, path="/", title=f"{site.get('name')}, {site.get('availability_text', '')}".rstrip(", "),
                description=site.get("intro") or site.get("headline", ""), main=main, full_footer=True,
                extra_head=redirect + "\n" + person_json_ld(d))


def work_page(d: dict) -> str:
    site = d["site"]
    w = site.get("work", {})
    projects = d["projects"]
    filters = w.get("filters", [])
    buttons = "".join(
        f'<button type="button" class="filter-btn" data-filter="{e(f["key"])}" aria-pressed="{"true" if i == 0 else "false"}">{e(f["label"])}</button>'
        for i, f in enumerate(filters))
    items = []
    for p in projects:
        items.append(f"""<li data-group="{e(p.get('group', ''))}">
<a class="work-item" href="/work/{e(p['slug'])}/">
{thumb(p, "work-thumb")}
<div class="work-body">
<h2>{e(p.get('title'))}</h2>
<p class="work-desc">{e(p.get('short_desc', ''))}</p>
<p class="work-meta">{e(project_meta(p))}</p>
</div>
</a>
</li>""")
    intro = w.get("intro", "").replace("{count_words}", number_word(len(projects)).capitalize()).replace("{count}", str(len(projects)))
    filter_html = ""
    if filters:
        filter_html = f"""<div class="filters js-only" role="group" aria-label="Filter projects">{buttons}</div>
<p class="sr-only" role="status" id="filter-status"></p>"""
    main = f"""<main id="main" class="wrap work">
<div class="page-intro">
<h1 class="display">{e(w.get("title", "Work"))}</h1>
<p class="page-lead">{e(intro)}</p>
</div>
{filter_html}
<ul class="work-list">
{chr(10).join(items)}
</ul>
<p class="outro">{inline(w.get("outro", ""), mailto=mailto(site))}</p>
</main>"""
    return page(d, path="/work/", title=f"Work, {site.get('name')}", description=intro, main=main, active="work")


def project_page(d: dict, p: dict, nxt: dict) -> str:
    site = d["site"]
    title = p.get("title", "")
    links = p.get("links") or []
    links_html = ""
    if links:
        links_html = '<ul class="project-links">' + "".join(
            f'<li><a href="{e(l["url"])}">{e(l["label"])}</a></li>' for l in links) + "</ul>"

    facts = []
    if p.get("org"):
        facts.append(("Where", p["org"]))
    if p.get("role"):
        facts.append(("My role", p["role"]))
    if p.get("status"):
        facts.append(("Status", {"ongoing": "Ongoing", "finished": "Finished"}.get(p["status"], p["status"].capitalize())))
    dl = ""
    if facts:
        dl = '<dl class="facts">' + "".join(f"<div><dt>{e(k)}</dt><dd>{e(v)}</dd></div>" for k, v in facts) + "</dl>"

    cover = project_cover(p)
    cover_alt = p.get("cover_alt") or (f"{p.get('short') or title}: {humanize_image(cover).lower()}" if cover else "")
    media = ""
    if p.get("clip"):
        poster = p.get("poster") or cover
        size = image_size(poster) if poster else None
        dims = f' width="{size[0]}" height="{size[1]}"' if size else ""
        media = f"""<figure class="project-media project-clip" data-clip-player>
<video src="/{e(p['clip'])}"{f' poster="/{e(poster)}"' if poster else ""}{dims} muted loop playsinline preload="none" controls aria-label="{e(cover_alt or title)}"></video>
<button type="button" class="btn btn-secondary btn-small clip-toggle js-only" data-clip-toggle hidden>Pause</button>
</figure>"""
    elif cover:
        size = image_size(cover)
        portrait = bool(size and size[1] > size[0])
        cls = "project-cover is-portrait" if portrait else "project-cover"
        media = f'<div class="project-media">{img(cover, cover_alt, cls=cls, lazy=False, priority=True)}</div>'

    story = []
    for key, heading in (("problem", "The problem"), ("built", "What I built"), ("result", "The result")):
        if p.get(key):
            story.append(f'<section class="story-block"><h2 class="h2-small">{heading}</h2><p>{e(p[key])}</p></section>')
    if not story and p.get("blueprint_desc"):
        story.append(f'<section class="story-block"><h2 class="h2-small">{e(p.get("blueprint_title") or "About the project")}</h2><p>{e(p["blueprint_desc"])}</p></section>')

    how = p.get("how_it_works") or {}
    tech_parts = []
    if how.get("intro"):
        tech_parts.append(f'<p class="tech-intro">{e(how["intro"])}</p>')
    steps_html = ""
    if how.get("steps"):
        steps_html = f'<ol class="pipeline" aria-label="{e(p.get("short") or title)} pipeline">' + "".join(
            f'<li{" class=\"is-key\"" if s.get("highlight") else ""}><span class="step-name">{e(s["name"])}</span>'
            f'<span class="step-text">{e(s.get("text", ""))}</span></li>' for s in how["steps"]) + "</ol>"
    tech = ""
    if p.get("tech_notes") or steps_html:
        tags = p.get("tags") or []
        tech = f"""<section class="tech" aria-labelledby="tech-title">
<div class="tech-head">
<h2 id="tech-title" class="h2-small">For engineers: how it works</h2>
{''.join(tech_parts)}
</div>
{steps_html}
{f'<p class="tech-notes">{e(p["tech_notes"])}</p>' if p.get("tech_notes") else ""}
{f'<p class="tech-tags"><span class="sr-only">Technologies: </span>{e(", ".join(tags))}</p>' if tags else ""}
</section>"""

    gallery_imgs = [i for i in (p.get("images") or []) if i != cover]
    gallery = ""
    if gallery_imgs:
        short = p.get("short") or title.split(":")[0]
        alts = p.get("image_alts") or {}
        figs = "".join(
            f'<li><a href="/{e(i)}">{img(i, alts.get(i) or f"{short}: {humanize_image(i).lower()}")}</a></li>'
            for i in gallery_imgs)
        gallery = f"""<section class="gallery" aria-labelledby="gallery-title">
<h2 id="gallery-title" class="h2-small">Images</h2>
<ul class="gallery-grid">{figs}</ul>
</section>"""

    main = f"""<main id="main" class="wrap project">
<article>
<div class="project-head">
<a class="back-link" href="/work/">Back to all work</a>
<h1 class="project-title">{e(title)}</h1>
<p class="project-lead">{e(p.get("short_desc", ""))}</p>
{links_html}
</div>
{dl}
{media}
<div class="story">
{chr(10).join(story)}
</div>
{tech}
{gallery}
<nav class="project-nav" aria-label="More projects">
<a class="all-link" href="/work/">All projects</a>
<a class="next-link" href="/work/{e(nxt['slug'])}/"><span class="next-label">Next project</span><span class="next-title">{e(nxt.get('title'))}</span></a>
</nav>
</article>
</main>"""
    return page(d, path=f"/work/{p['slug']}/", title=f"{title}, {site.get('name')}", description=p.get("short_desc", ""),
                main=main, active="work", exact=False, og_image=cover if cover and cover.endswith((".jpg", ".png")) else None)


def about_page(d: dict) -> str:
    site = d["site"]
    about = site.get("about", {})
    c = site.get("contact", {})

    langs = join_words(site.get("languages", []))
    interests = join_words([lower_first(i) for i in site.get("interests", [])])
    personal = " ".join(x for x in (f"{langs}." if langs else "", f"Outside work: {interests}." if interests else "") if x)

    cv = ""
    if c.get("cv_available") and c.get("cv") and (ROOT / c["cv"]).exists():
        cv = f'<p><a class="btn btn-secondary" href="/{e(c["cv"])}" download data-track="cv-download">Download CV</a></p>'

    intro_text = " ".join(x for x in (about.get("text", ""), site.get("direction", "")) if x)

    # Experience
    jobs = []
    for j in d["experience"]:
        org = j.get("org", "")
        org_head, _, org_rest = org.partition(", ")
        points = []
        for pt in j.get("points", []):
            if isinstance(pt, str):
                points.append(f"<li>{e(pt)}</li>")
            else:
                sub = "".join(f"<li>{e(s)}</li>" for s in pt.get("sub", []))
                points.append(f'<li>{e(pt.get("text", ""))}<ul>{sub}</ul></li>')
        jobs.append(f"""<div class="entry">
<div class="entry-head"><h3>{e(j.get("title"))}, {e(org_head)}</h3><p class="entry-period">{e(period(j.get("period")))}</p></div>
{f'<p class="entry-sub">{e(org_rest)}</p>' if org_rest else ""}
{f'<p class="entry-text">{e(j["summary"])}</p>' if j.get("summary") else ""}
<ul class="entry-points">{"".join(points)}</ul>
</div>""")

    # Education
    edu = []
    for ed in d["education"]:
        grade = f" Final grade {ed['grade']}." if ed.get("grade") else ""
        courses = ""
        if ed.get("courses"):
            courses = f'<details class="courses"><summary>Courses</summary><p>{e(join_words(ed["courses"]))}.</p></details>'
        edu.append(f"""<div class="entry">
<div class="entry-head"><h3>{e(ed.get("title"))}</h3><p class="entry-period">{e(period(ed.get("period")))}</p></div>
<p class="entry-text">{e(ed.get("org", ""))}.{e(grade)} {e(" ".join(ed.get("points", [])))}</p>
{courses}
</div>""")
    certs = d["certifications"]
    if certs:
        parts = [f'<a href="/{e(x["link"])}">{e(x["title"])}</a> ({e(x.get("issuer", ""))}, {e(x.get("date", ""))})'
                 if x.get("link") and not x["link"].startswith("http") else f'{e(x["title"])} ({e(x.get("issuer", ""))}, {e(x.get("date", ""))})'
                 for x in certs]
        joined = ", ".join(parts[:-1]) + " and " + parts[-1] if len(parts) > 1 else parts[0]
        edu.append(f'<p class="entry-text">Certifications: {joined}.</p>')

    # Skills
    groups: dict[str, list[str]] = {}
    for t in (d["skills"] or {}).get("tools", []):
        groups.setdefault(t.get("group", "Other"), []).append(t["name"])
    for cap in (d["skills"] or {}).get("capabilities", []):
        groups.setdefault(cap["title"], []).extend(i["name"] for i in cap.get("items", []))
    skills = "".join(f"<div><dt>{e(g)}</dt><dd>{e(', '.join(names))}</dd></div>" for g, names in groups.items())

    # Publications and media
    pubs = []
    home = site.get("home", {})
    if home.get("talk_image"):
        pubs.append(f'<figure class="talk-figure">{img(home["talk_image"], home.get("talk_alt", ""), cls="talk-img")}'
                    f'<figcaption>{e(home.get("talk_caption", ""))}</figcaption></figure>')
    for pub in d["publications"]:
        meta = ", ".join(x for x in (pub.get("type"), (pub.get("status") or "").lower(), pub.get("year")) if x)
        plinks = "".join(f'<li><a href="{e(l["url"])}">{e(l["label"])}</a></li>' for l in pub.get("links", []))
        pubs.append(f"""<div class="entry pub">
<p class="entry-meta">{e(meta)}</p>
<h3>{e(pub.get("title"))}</h3>
<p class="entry-text">{e(pub.get("authors", ""))}. {e(pub.get("venue", ""))}.</p>
{f'<ul class="inline-links">{plinks}</ul>' if plinks else ""}
</div>""")
    feat = site.get("featured")
    if feat:
        pubs.append(f"""<div class="entry feature">
{img(feat["image"], "Newspaper article about the " + feat.get("title", "")[0].lower() + feat.get("title", "")[1:], cls="feature-img") if feat.get("image") else ""}
<div class="feature-text">
{f'<p class="entry-meta">{e(feat["label"])}</p>' if feat.get("label") else ""}
<h3>{e(feat.get("title"))}</h3>
<p class="entry-text">{e(feat.get("text", ""))} {e(feat.get("note", ""))}</p>
</div>
</div>""")

    # Volunteering
    vols = "".join(
        f'<div class="vol"><p><strong>{e(v.get("title"))},</strong> {e(v.get("org"))}, {e(period(v.get("period")))}</p>'
        f'{"".join(f"<p class=\"vol-text\">{e(x)}</p>" for x in v.get("points", []))}</div>'
        for v in d["volunteering"])

    # References
    refs = "".join(
        f'<div class="ref"><h3>{e(r.get("person"))}</h3><p>{e(r.get("title"))}, {e(r.get("company"))}</p>'
        f'<p class="ref-relation">{e(r.get("relation"))}</p></div>' for r in d["references"])

    main = f"""<main id="main" class="wrap about">
<section class="about-intro" aria-labelledby="about-title">
<div class="about-text">
<h1 id="about-title" class="display">{e(about.get("title", "About"))}</h1>
<p class="about-lead">{e(about.get("lead", site.get("headline", "")))}</p>
<p class="about-body">{e(intro_text)}</p>
<p class="about-personal">{e(personal)}</p>
{cv}
</div>
{img(site.get("avatar", "img/avatar.webp"), "Portrait of " + site.get("name", ""), cls="about-portrait", lazy=False)}
</section>

<section id="experience" class="about-section" aria-labelledby="experience-title">
<h2 id="experience-title" class="h2-section">Experience</h2>
<div class="entries entries-wide">{"".join(jobs)}</div>
</section>

<section id="education" class="about-section" aria-labelledby="education-title">
<h2 id="education-title" class="h2-section">Education</h2>
<div class="entries">{"".join(edu)}</div>
</section>

<section id="skills" class="about-section" aria-labelledby="skills-title">
<h2 id="skills-title" class="h2-section">Skills</h2>
<dl class="skills">{skills}</dl>
</section>

<section id="publications" class="about-section" aria-labelledby="publications-title">
<h2 id="publications-title" class="h2-section">Publications and media</h2>
<div class="entries">{"".join(pubs)}</div>
</section>

<section id="volunteering" class="about-section" aria-labelledby="volunteering-title">
<h2 id="volunteering-title" class="h2-section">Volunteering</h2>
<div class="vols">{vols}</div>
</section>

<section id="references" class="about-section" aria-labelledby="references-title">
<h2 id="references-title" class="h2-section">References</h2>
<div class="refs">{refs}</div>
<p class="refs-note">{e(about.get("references_note", ""))}</p>
</section>

<p class="outro">{inline(about.get("outro", ""), mailto=mailto(site))}</p>
</main>"""
    return page(d, path="/about/", title=f"About, {site.get('name')}", description=about.get("lead", ""),
                main=main, active="about", extra_head=person_json_ld(d))


def not_found_page(d: dict) -> str:
    site = d["site"]
    nf = site.get("not_found", {})
    links = "".join(f'<li><a href="{e(l["href"])}">{e(l["label"])}</a></li>' for l in nf.get("links", []))
    main = f"""<main id="main" class="wrap not-found">
<h1 class="display">{e(nf.get("title", "Page not found"))}</h1>
<p class="page-lead">{e(nf.get("text", ""))}</p>
<ul class="inline-links big">{links}</ul>
</main>"""
    return page(d, path=None, title=f"{nf.get('title', 'Page not found')}, {site.get('name')}",
                description=nf.get("text", ""), main=main, noindex=True)


# --------------------------------------------------------------------------
# Ask index: short passages with a link to where they live on the site
# --------------------------------------------------------------------------

def ask_index(d: dict) -> str:
    site = d["site"]
    c = site.get("contact", {})
    docs = []

    def add(title, text, href, kind, source, weight=1.0, summary=None):
        text = re.sub(r"\s+", " ", str(text or "")).strip()
        if not text:
            return
        doc = {"t": title, "x": text, "h": href, "k": kind, "s": source, "w": weight}
        if summary:
            doc["sum"] = summary
        docs.append(doc)

    name = site.get("name", "Philip")
    add("Current role", f"{name} is currently {site.get('role', '')}. {site.get('availability_text', '')}.", "/", "About", "Home", 1.2)
    add("About Philip", " ".join(site.get("bio", []) if isinstance(site.get("bio"), list) else [site.get("bio", "")]), "/about/", "About", "About", 1.1)
    about = site.get("about", {})
    add("About Philip", f"{about.get('lead', '')} {about.get('text', '')}", "/about/", "About", "About", 1.0)
    add("Career direction", site.get("direction", ""), "/about/", "Career goals", "About", 1.2)
    looking = (site.get("quick") or {}).get("looking_for") or []
    if isinstance(looking, list) and looking:
        add("Roles he is looking for", f"Open to roles in {join_words(looking)}.", "/about/", "Career goals", "About", 1.2)
    add("Languages and interests", f"Speaks {join_words(site.get('languages', []))}. Interests: {join_words(site.get('interests', []))}. Based in {c.get('location', '')}.", "/about/", "About", "About")
    for h in (site.get("quick") or {}).get("highlights", []):
        add("Highlight", h, "/about/", "Highlights", "About", 1.15)
    add("Contact", f"Email {c.get('email')}. Phone {c.get('phone')}. Based in {c.get('location')}. LinkedIn {c.get('linkedin')}.", "/#contact", "Contact", "Contact", 1.3)
    feat = site.get("featured")
    if feat:
        add(feat.get("title", ""), f"{feat.get('text', '')} {feat.get('note', '')}", "/about/#publications", "Media", "Publications and media")

    for j in d["experience"]:
        org_head = j.get("org", "").split(",")[0]
        head_ = f"{j.get('title')} at {org_head} ({period(j.get('period'))})"
        src = f"Experience at {org_head}"
        add(head_, f"{j.get('title')}, {j.get('org')}, {period(j.get('period'))}. {j.get('summary', '')}", "/about/#experience", "Experience", src, 0.8)
        for pt in j.get("points", []):
            text = pt if isinstance(pt, str) else f"{pt.get('text', '')} {' '.join(pt.get('sub', []))}"
            add(head_, text, "/about/#experience", "Experience", src)
    for ed in d["education"]:
        add(ed.get("title"), f"{ed.get('title')}, {ed.get('org')}, {period(ed.get('period'))}. Final grade {ed.get('grade')}. "
            f"{' '.join(ed.get('points', []))} Courses: {', '.join(ed.get('courses', []))}.", "/about/#education", "Education", "Education", 1.1)
    for v in d["volunteering"]:
        add(f"{v.get('title')}, {v.get('org')}", f"{v.get('title')}, {v.get('org')}, {period(v.get('period'))}. {' '.join(v.get('points', []))}",
            "/about/#volunteering", "Volunteering", "Volunteering")
    groups: dict[str, list[str]] = {}
    for t in (d["skills"] or {}).get("tools", []):
        groups.setdefault(t.get("group", "Other"), []).append(t["name"])
    for g, names in groups.items():
        add(f"Skills: {g}", f"{g}: {', '.join(names)}.", "/about/#skills", "Skills", "Skills")
    for cap in (d["skills"] or {}).get("capabilities", []):
        for i in cap.get("items", []):
            add(f"{cap['title']} skill: {i['name']}", f"{i['name']}: {i['text']}", "/about/#skills", "Skills", "Skills")
    for pub in d["publications"]:
        add(pub.get("title"), f"{pub.get('type')} ({pub.get('year')}): {pub.get('title')}. {pub.get('authors')}. {pub.get('venue')}. {pub.get('status', '')}",
            "/about/#publications", "Publications", "Publications and media", 1.1)
    for x in d["certifications"]:
        add(x.get("title"), f"{x.get('type')} from {x.get('issuer')}: {x.get('title')} ({x.get('date')}).", "/about/#education", "Certifications", "Education")
    for r in d["references"]:
        add(f"Reference: {r.get('person')}", f"{r.get('person')}, {r.get('title')}, {r.get('company')} ({r.get('relation')}).",
            "/about/#references", "References", "References", 0.8)

    for p in d["projects"]:
        href = f"/work/{p['slug']}/"
        src = p.get("title", "")
        short = p.get("short") or src.split(":")[0]
        first = re.match(r"^.*?[.!?](\s|$)", p.get("short_desc", ""))
        summary = f"{short}: {(first.group(0) if first else p.get('short_desc', '')).strip()}"
        add(src, f"{src}. {p.get('short_desc', '')} ({p.get('status', '')} project, {p.get('org', '')})", href, "Project", src, 1.25, summary)
        if p.get("role"):
            add(src, f"Philip's role on {short}: {p['role']}.", href, "Project", src)
        for key in ("problem", "built", "result"):
            add(src, p.get(key), href, "Project", src)
        if not any(p.get(k) for k in ("problem", "built", "result")):
            add(src, p.get("blueprint_desc"), href, "Project", src)
        add(f"{short}: technical details", f"{p.get('tech_notes', '')} Technologies: {', '.join(p.get('tags', []))}.", href, "Project", src, 0.9)

    payload = {
        "contact": {k: c.get(k) for k in ("email", "phone", "location", "linkedin")},
        "profile": {"lead": site.get("home", {}).get("hero_lead", site.get("headline", "")),
                    "text": site.get("home", {}).get("hero_text", site.get("intro", ""))},
        "docs": docs,
    }
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n"


# --------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------

def build() -> dict[str, str]:
    d = load_all()
    out: dict[str, str] = {}
    out["index.html"] = home_page(d)
    out["work/index.html"] = work_page(d)
    projects = d["projects"]
    for i, p in enumerate(projects):
        out[f"work/{p['slug']}/index.html"] = project_page(d, p, projects[(i + 1) % len(projects)])
    out["about/index.html"] = about_page(d)
    out["404.html"] = not_found_page(d)
    out["data/ask-index.json"] = ask_index(d)
    urls = ["/", "/work/"] + [f"/work/{p['slug']}/" for p in projects] + ["/about/"]
    out["sitemap.xml"] = ('<?xml version="1.0" encoding="UTF-8"?>\n'
                          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
                          + "".join(f"  <url><loc>{SITE_URL}{u}</loc></url>\n" for u in urls)
                          + "</urlset>\n")
    out["robots.txt"] = f"User-agent: *\nAllow: /\n\nSitemap: {SITE_URL}/sitemap.xml\n"
    return out


def stale_project_pages(out: dict[str, str]) -> list[Path]:
    work = ROOT / "work"
    if not work.exists():
        return []
    return [p for p in work.glob("*/index.html") if str(p.relative_to(ROOT)) not in out]


def main(argv: list[str]) -> int:
    check = "--check" in argv
    out = build()
    changed = [rel for rel, content in out.items()
               if not (ROOT / rel).exists() or (ROOT / rel).read_text(encoding="utf-8") != content]
    stale = stale_project_pages(out)
    if check:
        if changed or stale:
            for rel in changed:
                print(f"out of date: {rel}")
            for p in stale:
                print(f"no longer generated: {p.relative_to(ROOT)}")
            print("Run `python3 build.py` and commit the result.")
            return 1
        print(f"OK: {len(out)} generated files are up to date.")
        return 0
    for rel in changed:
        path = ROOT / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(out[rel], encoding="utf-8")
    for p in stale:
        p.unlink()
        try:
            p.parent.rmdir()
        except OSError:
            pass
    print(f"Built {len(out)} files ({len(changed)} changed, {len(stale)} removed).")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
