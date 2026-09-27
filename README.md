# Philip Lau | Portfolio

Personal portfolio of Philip Lau — Technical Business Developer and Research Assistant at Aarhus University. Live at **https://lauphilip.github.io/**.

The site is a static, dependency-free page. `index.html` is only a shell; every piece of content is loaded from JSON at runtime, fetched in parallel, and rendered progressively. Updating the site almost never requires touching HTML, CSS or JavaScript.

## Structure

```text
LauPhilip.github.io/
├── index.html              # Layout shell (sections, sidebar, project dialog)
├── css/style.css           # Design system: tokens, light/dark themes, components
├── js/app.js               # Data engine: fetch, render, filters, scroll-spy, GitHub feed
├── data/
│   ├── site.json           # Name, hero phrases, bio, stats, contact, featured press, career goals
│   ├── experience.json     # Work timeline
│   ├── education.json      # Degrees + course lists
│   ├── volunteering.json
│   ├── skills.json         # Tools (grouped), capabilities, learning / next-up
│   ├── publications.json   # Papers, talks, workshops
│   ├── projects.json       # Project registry: id, status, category, featured
│   ├── certifications.json
│   └── references.json
├── projects/
│   ├── certifications/     # Certificate images
│   └── project_<id>/       # info.json + images (.webp) + optional video
├── img/                    # Avatar, press clipping, favicon, social preview image
└── assets/cv.pdf           # Optional — the "Download CV" button appears only if this file exists
```

## Common edits

| I want to… | Edit |
|---|---|
| Add a project | Create `projects/project_<id>/info.json` (+ images), then add `{ "id", "status", "category" }` to `data/projects.json`. Set `"featured": true` to pin it. |
| Add a job / degree | `data/experience.json` or `data/education.json` |
| Add a paper or talk | `data/publications.json` |
| Change hero text or stats | `data/site.json` |
| Hide a GitHub repo from the live feed | `contact.repo_exclude` in `data/site.json` |
| Show the CV button | Drop your CV at `assets/cv.pdf` |

A project's `info.json` supports `title`, `short_desc`, `blueprint_title`, `blueprint_desc`, `tags`, `images` (array), `video`, `poster` and `links` (`[{ "label", "url" }]`).

Images should be WebP, at most ~1600 px wide. Convert with e.g. `cwebp -q 82 in.png -o out.webp`.

## Features

- Light and dark theme that follows the system, with a manual toggle
- Sticky section index with scroll-spy on desktop, full-screen menu on mobile
- Project filtering by status and type, free-text search and tag chips
- Accessible project dialog (native `<dialog>`) with keyboard navigation (← →, Esc) and shareable deep links such as `/#project/project_ask_eiva`
- Live GitHub contribution calendar and most recently pushed repos (cached per session to respect API limits)
- Lazy-loaded WebP images, deferred scripts, skeleton loaders, reduced-motion support, Open Graph/SEO metadata and print styles

## Ask Lau (chat widget)

The "Ask Lau" button in the bottom-right corner answers visitors' questions about the portfolio and always shows its sources. It works out of the box with **in-browser search** (`js/ask.js`): all content is split into small passages and ranked with BM25 keyword search plus a few synonyms — no server, no API key, no cost.

To let an AI write the answers instead, deploy the optional Cloudflare Worker in `ask-worker/worker.js`:

1. Create a free Cloudflare account → *Workers & Pages* → *Create Worker*, paste in `ask-worker/worker.js` and deploy.
2. Under *Settings → Variables*, add the secret `MISTRAL_API_KEY` (or `ANTHROPIC_API_KEY` with `PROVIDER=anthropic` and a `MODEL`), plus `SITE_URL` and `ALLOWED_ORIGIN` = `https://lauphilip.github.io`.
3. Put the Worker's URL in `data/site.json` → `"ask": { "endpoint": "https://…workers.dev" }`.

The Worker only accepts a question from your own domain, loads the portfolio from the live site itself (so it can't be used as a free general chatbot), limits each visitor to 12 questions per 10 minutes, and keeps the API key off the website. If it is ever unreachable, the widget quietly falls back to search. Set `"enabled": false` to hide the widget.

## Visitor statistics

Privacy-friendly stats via [GoatCounter](https://www.goatcounter.com) — no cookies, no personal data, no consent banner needed. Create a free account (e.g. code `lauphilip`) and set `data/site.json` → `"analytics": { "goatcounter": "lauphilip" }`. Besides page views it counts these events (never the content of questions): `quick-view`, `cv-download`, `copy-email`, `ask-open`, `ask-question` and `project/<id>`. Visits from `localhost` are not counted.

## Running locally

`fetch()` needs a web server, so opening `index.html` directly won't work:

```bash
python -m http.server 8000
# → http://localhost:8000
```
