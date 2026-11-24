# Philip Lau | Portfolio

Personal portfolio of Philip Lau, Research Assistant at Aarhus University. Live at **https://lauphilip.github.io/**.

The site is plain static HTML with its own URL for every page. A small Python script, `build.py`, reads the content from JSON and writes the pages, so updating the site almost never means touching HTML, CSS or JavaScript. The pages work without JavaScript; scripts only add the Ask panel, the Work filters, copy-to-clipboard and analytics.

## Pages

| URL | Content |
|---|---|
| `/` | Home: introduction, three recent projects, talk, Ask section and full contact section |
| `/work/` | All projects, with filters for industry, research and teaching, and personal |
| `/work/<slug>/` | One page per project: problem, what Philip built, result, how it works, images |
| `/about/` | Experience, education, skills, publications and media, volunteering, references |
| `/404.html` | Not found page |

Old one-page links such as `/#project/project_ask_eiva` are redirected to the new project page by a short script on the home page.

## Structure

```text
├── build.py                 # Generates every page from data/ and projects/
├── index.html, 404.html     # Generated
├── work/, about/            # Generated
├── sitemap.xml, robots.txt  # Generated
├── css/style.css            # Design tokens, light and dark mode, all components
├── js/site.js               # Analytics, copy email, Work filters, optional clips
├── js/ask.js                # Ask panel: in-browser search plus the optional Worker
├── ask-worker/worker.js     # Optional Cloudflare Worker that writes AI answers
├── fonts/                   # Self-hosted Schibsted Grotesk
├── img/                     # Portrait, talk photo, press clipping, favicon, social image
├── data/
│   ├── site.json            # Name, contact, page copy (home, work, about, contact, ask, 404)
│   ├── projects.json        # Project order, slug, organisation, filter group, cover image
│   ├── experience.json, education.json, volunteering.json
│   ├── skills.json, publications.json, certifications.json, references.json
│   └── ask-index.json       # Generated: passages used by the Ask feature
└── projects/
    ├── certifications/      # Certificate images
    └── project_<id>/        # info.json + images (.webp) + optional clip
```

## Working on the site

Run the build after every content change, then preview locally:

```bash
python3 build.py              # writes the pages (Python 3.12 or newer, no packages needed)
python3 -m http.server 8000   # then open http://localhost:8000
```

`python3 build.py --check` reports any page that is out of date without writing anything. GitHub Actions runs this check on every push to `main`, so commit the generated files together with the data change.

## Common edits

| I want to | Edit |
|---|---|
| Add a project | Create `projects/project_<id>/info.json` with images, then add `{ "id", "slug", "status", "category", "org", "group" }` to `data/projects.json`. The order in that file is the order on the Work page. `group` is `industry`, `research` or `personal`. Optional: `short` and `tagline` (used on Home cards), `cover` and `cover_alt` (main image). Run `build.py`. |
| Change the Home projects | `home.projects` in `data/site.json` (a list of project ids) |
| Change the Home copy | `home` in `data/site.json` |
| Change the About intro | `about.lead`, `about.text` and `direction` in `data/site.json` |
| Change the contact section | `contact_section` and `contact` in `data/site.json` |
| Add a job or degree | `data/experience.json` or `data/education.json` |
| Add a paper or talk | `data/publications.json` |
| Add a reference | `data/references.json` (`person`, `title`, `relation`, `company`, `department`; no contact details) |
| Show the CV button | Put the file at `assets/cv.pdf` and set `contact.cv_available` to `true` in `data/site.json` |
| Update the footer date | `updated` in `data/site.json` |

Copy strings in `data/site.json` may contain links written as `[label](url)`, and `{mailto}` for the email link.

### Project fields

A project's `info.json` supports `title`, `short_desc` (1 to 2 plain sentences), `role`, `problem`, `built`, `result`, `tech_notes`, `tags`, `images` (the first one is the cover unless `cover` is set in `projects.json`), `image_alts` (optional map from image path to alt text), `links` (`[{ "label", "url" }]`), `private` and `how_it_works` (optional `intro` and `steps` for a small pipeline figure). Older files may use `blueprint_title` and `blueprint_desc`, which are shown as a fallback.

Optional clip: add `"clip": "projects/<id>/clip.mp4"` and `"poster": "projects/<id>/poster.webp"`. On desktop the card then plays the muted loop on hover or keyboard focus, one at a time. The project page shows it with a pause button. Visitors who prefer reduced motion only see the poster, and clips are never preloaded.

Images should be WebP, at most about 1600 px wide. Convert with, for example, `cwebp -q 82 in.png -o out.webp`.

## Ask

The Ask button in the header (and the Ask section on Home) answers questions about Philip's work and always links to its sources on this site. It works without any server: `build.py` writes `data/ask-index.json`, and `js/ask.js` searches it in the browser with BM25 keyword search plus a few synonyms.

To let an AI write the answers, deploy the optional Cloudflare Worker in `ask-worker/worker.js`:

1. Create a Cloudflare Worker, paste in `ask-worker/worker.js` and deploy.
2. Add a Workers AI binding named `AI`, and the variables `SITE_URL` and `ALLOWED_ORIGIN` set to `https://lauphilip.github.io` (or `PROVIDER` with `MISTRAL_API_KEY` or `ANTHROPIC_API_KEY` and `MODEL`).
3. Put the Worker's URL in `data/site.json` under `ask.endpoint` and run `build.py`.

The Worker reads `data/ask-index.json` from the live site, accepts questions only from your own domain, limits each visitor to 12 questions per 10 minutes and keeps API keys off the website. If it is unreachable, the panel falls back to in-browser search. Set `ask.enabled` to `false` to hide the feature.

## Visitor statistics

Privacy-friendly statistics through [GoatCounter](https://www.goatcounter.com), with no cookies and no consent banner. The code is `analytics.goatcounter` in `data/site.json`. Every page counts as a page view (so project views show up as `/work/<slug>/`), and these events are counted, never the content of questions: `ask-open`, `ask-question`, `cv-download` and `copy-email`. Visits from `localhost` are not counted.
