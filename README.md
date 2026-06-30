# Philip Lau (Lau) — Portfolio Website

This is the GitHub repository for my personal portfolio website, hosted live at [lauphilip.github.io](https://lauphilip.github.io/). 

The site is built from scratch using clean, simple code to showcase my work as a Research Assistant, my experience in digital automation, and my coding projects.

## 🛠️ The Tech Used

*   **Frontend:** Plain HTML5, CSS3 for layouts, and standard JavaScript (ES6+).
*   **Fonts:** Plus Jakarta Sans for standard text and Share Tech Mono for code-style accents.
*   **Icons:** Colored developer icons loaded directly from the Devicon library, plus custom SVG shapes.
*   **Hosting:** Hosted completely for free using GitHub Pages.

---

## 📂 How the Folders are Organized

The site is designed to be modular. Instead of typing out every single project inside the main `index.html` file, a JavaScript loop automatically reads files from the `projects` folder and displays them on the page.

```text
├── index.html           # The main webpage file (holds the layout and JavaScript loader)
├── article.jpg          # Newspaper clipping image from the Witt A/S project
├── image_bdfe74.png     # My pixel-art avatar photo
├── image_cabf88.jpg     # The Marvel-style lab banner image in the contact section
└── projects/            # The folder where all my projects live
    ├── master_list.json # The main list that tells the website which projects to load
    ├── project_ask_eiva/# Folder for the AskEIVA project files
    │   └── info.json
    ├── project_mind_lego/# Folder for the MIND thesis project files
    │   └── info.json
    └── [other folders]  # Other project folders for my personal or work tools