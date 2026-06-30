# Philip Lau | Technical Portfolio Ecosystem

This repository houses my personal developer portfolio, highlighting my work as a Technical Business Developer. The architecture is completely decoupled and modular, using a dynamic JSON-driven data engine to inject project showcases, industry certifications, and professional references on runtime.

---

## 📂 Repository Structure

The project is organized as follows:

```text
LAUPHILIP.GITHUB.IO/
├── css/
│   └── style.css            # All visual presentation rules and typography styling
├── img/
│   ├── article.jpg          # Featured media section graphic
│   ├── image_bdfe74.png     # Personal profile workspace avatar
│   └── image_cabf88.jpg     # Contact section footer backdrop banner
├── js/
│   └── app.js               # Core data engine (handles async fetch operations & modal logic)
├── projects/
│   ├── certifications/      # Dedicated folder hosting verified credential PDFs/images
│   ├── project_[id]/        # Individual directories containing asset images and an info.json
│   ├── certifications.json  # Data matrix for Microsoft Learn, Kaggle, and industry badges
│   ├── master_list.json     # The global index registry routing all ongoing/finished categories
│   └── references.json      # Verified contact coordinates for professional references
├── index.html               # The core structural layout shell
└── README.md                # Repository documentation and architectural guide