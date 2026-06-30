async function fetchGitHubContributions() {
    const username = "LauPhilip";
    const currentYear = new Date().getFullYear(); // Automatically scales to 2026, 2027, etc.
    const headerElement = document.getElementById("github-contribution-header");

    try {
        // Fetch your live contribution chart directly
        const response = await fetch(`https://images.weserv.nl/?url=ghchart.rshah.org/${username}`);
        if (!response.ok) throw new Error("Chart unreachable");
        
        const svgText = await response.text();
        
        // Use a regular expression to pull the exact contribution number text hidden inside the chart data
        const match = svgText.match(/(\d+[\d,]*)\s+contributions/i);
        let totalContributions = match ? match[1] : null;

        // Fallback Strategy: If the chart text parsing fails, use a secondary global event counter
        if (!totalContributions) {
            const backupResponse = await fetch(`https://api.github.com/search/commits?q=author:${username}+author-date:${currentYear}-01-01..${currentYear}-12-31`);
            const backupData = await backupResponse.json();
            totalContributions = backupData.total_count || "View";
        }

        if (headerElement) {
            headerElement.textContent = `${totalContributions} contributions in ${currentYear}`;
        }
    } catch (error) {
        console.warn("GitHub activity counter switched to year fallback:", error);
        // Completely dynamic fallback text without any hardcoded numbers
        if (headerElement) {
            headerElement.textContent = `My Repository Contributions in ${currentYear}`;
        }
    }
}

async function loadLatestCommitDate() {
    // Replace with your exact GitHub username and repository name
    const username = "LauPhilip"; 
    const repo = "LauPhilip.github.io"; 
    
    try {
        const response = await fetch(`https://api.github.com/repos/${username}/${repo}/commits/master`);
        if (!response.ok) throw new Error("API response error");
        
        const commitData = await response.json();
        const commitDateString = commitData.commit.committer.date; // e.g., "2026-06-30T11:07:46Z"
        
        // Format the date neatly (e.g., "June 30, 2026")
        const dateOptions = { year: 'numeric', month: 'long', day: 'numeric' };
        const formattedDate = new Date(commitDateString).toLocaleDateString('en-US', dateOptions);
        
        const updateTarget = document.getElementById('latest-update');
        if (updateTarget) {
            updateTarget.textContent = `| Last updated: ${formattedDate}`;
        }
    } catch (error) {
        console.warn("Could not fetch latest commit timestamp:", error);
        // Fallback gracefully so it doesn't leave a broken loading message
        const updateTarget = document.getElementById('latest-update');
        if (updateTarget) updateTarget.style.display = 'none';
    }
}
// Local container module to manage asynchronous JSON state matrices securely
let projectStateEngine = {};

async function loadModularProjects() {
    try {
        const response = await fetch('projects/master_list.json');
        if (!response.ok) return;
        const projectRegistry = await response.json();

        const classMap = {
            'ongoing_work': 'p-work-on', 'ongoing_personal': 'p-pers-on',
            'finished_work': 'p-work-fin', 'finished_personal': 'p-pers-fin'
        };

        for (const item of projectRegistry) {
            try {
                const infoResponse = await fetch(`projects/${item.id}/info.json`);
                if (!infoResponse.ok) continue;

                const data = await infoResponse.json();
                
                // Store in memory mapping using IDs as data keys
                projectStateEngine[item.id] = data;

                const targetContainer = document.getElementById(`grid-${item.status}-${item.category}`);
                const borderClass = classMap[`${item.status}_${item.category}`] || '';

                if (!targetContainer) continue;

                // Render clean, non-expanding overview items into main grid
                const cardHTML = `
                    <div class="project-card ${borderClass}" onclick="launchProjectModal('${item.id}')">
                        <div class="project-header-flex">
                            <h3 style="margin: 0 0 0.5rem 0; font-size: 1.3rem; font-weight: 700;">${data.title}</h3>
                            <span class="expand-icon" style="font-family: 'Share Tech Mono', monospace; font-size: 0.85rem; background: rgba(0,0,0,0.05); padding: 0.2rem 0.5rem; border-radius: 4px; color: #555;">CLICK TO EXPAND</span>
                        </div>
                        <p style="font-size: 0.95rem; margin: 0.5rem 0 1.5rem 0; color: #3a3a3c;">${data.short_desc}</p>
                        <div class="tags" style="margin-top: auto;">
                            ${data.tags.map(tg => `<span class="tag">${tg}</span>`).join('')}
                        </div>
                    </div>
                `;

                targetContainer.insertAdjacentHTML('beforeend', cardHTML);

            } catch (err) {
                console.error(`Asset generation runtime parsing exception on target: ${item.id}`, err);
            }
        }
    } catch (error) {
        console.error("Critical failure during initialization loop operations:", error);
    }
}

// Launches viewport modal containing expanded parameters cleanly isolated
function launchProjectModal(projectId) {
    const data = projectStateEngine[projectId];
    if (!data) return;

    // 1. Process Images Content (Spacious, responsive wrapper to prevent cropping)
    let imageContentHTML = '';
    if (data.images) {
        if (Array.isArray(data.images)) {
            imageContentHTML = `<div style="display: flex; flex-direction: column; gap: 1.5rem; width: 100%; align-items: center; margin-top: 2rem;">`;
            data.images.forEach(imgSrc => {
                imageContentHTML += `
                    <div style="width: 100%; display: flex; justify-content: center;">
                        <img src="${imgSrc}" alt="Gallery Asset" style="width: 100%; max-width: 750px; height: auto; object-fit: contain; border-radius: 6px; box-shadow: 0 4px 20px rgba(0,0,0,0.12); border: 1px solid rgba(0,0,0,0.08); display: block;">
                    </div>`;
            });
            imageContentHTML += `</div>`;
        } else if (typeof data.images === 'string') {
            imageContentHTML = `
                <div style="margin-top: 2rem; width: 100%; display: flex; justify-content: center;">
                    <img src="${data.images}" alt="Asset" style="width: 100%; max-width: 750px; height: auto; object-fit: contain; border-radius: 6px; box-shadow: 0 4px 20px rgba(0,0,0,0.12); border: 1px solid rgba(0,0,0,0.08); display: block;">
                </div>`;
        }
    }

    // 2. Process Video Content (Updated to match the wider, comfortable layout rules)
    let videoContentHTML = '';
    if (data.video) {
        videoContentHTML = `
            <div style="margin-top: 2rem; border-top: 1px dashed rgba(0,0,0,0.15); padding-top: 1.5rem; width: 100%;">
                <h4 style="font-family:'Share Tech Mono', monospace; font-size:1rem; margin:0 0 1rem 0; color:var(--tangerine); text-transform:uppercase;">🎥 SYSTEM DEMONSTRATION VIDEO</h4>
                <div style="display: flex; justify-content: center;">
                    <video controls style="width: 100%; max-width: 750px; height: auto; border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); background: #000;">
                        <source src="${data.video}" type="video/mp4">
                        Your browser does not support the video tag.
                    </video>
                </div>
            </div>
        `;
    }

    const linksContentHTML = data.links && data.links.length > 0 ? 
        `<div style="margin-top:1.5rem; display:flex; gap:1.2rem;">
            ${data.links.map(lnk => `<a href="${lnk.url}" target="_blank" style="color:var(--red-passion); font-family:'Share Tech Mono', monospace; font-weight:600; text-decoration:underline;">[→ ${lnk.label}]</a>`).join('')}
         </div>` : '';

    // Standard structural modal component definition
    document.getElementById('modal-body-content').innerHTML = `
        <h2 style="font-size: 2rem; margin-top: 0; margin-bottom: 0.5rem; font-weight: 800; color: var(--text-dark);">${data.title}</h2>
        <p style="font-size: 1.05rem; line-height: 1.6; color: #2c2c2e; margin-bottom: 2rem;">${data.short_desc}</p>
        
        <div style="border-top: 1px dashed rgba(0,0,0,0.15); padding-top: 1.5rem;">
            <h4 style="font-family:'Share Tech Mono', monospace; font-size:1rem; margin:0 0 0.5rem 0; color:var(--tea); text-transform:uppercase;">${data.blueprint_title || 'BLUEPRINT SPECIFICATION'}</h4>
            <p style="font-size: 0.95rem; line-height: 1.6; color: #3a3a3c; margin-bottom: 1.5rem;">${data.blueprint_desc}</p>
        </div>

        ${imageContentHTML}
        ${videoContentHTML}
        ${linksContentHTML}

        <div class="tags" style="margin-top: 2rem; border-top: 1px dashed rgba(0,0,0,0.15); padding-top: 1.5rem;">
            ${data.tags.map(tg => `<span class="tag" style="background:#262624; color:var(--text-light); border-color:#444;">${tg}</span>`).join('')}
        </div>
    `;

    const modalElement = document.getElementById('project-modal');
    modalElement.style.display = 'flex';
}

// Safely dismiss modal viewport when clicking context regions outward
function closeProjectModal(event) {
    document.getElementById('project-modal').style.display = 'none';
}

async function loadProfessionalReferences() {
    try {
        const response = await fetch('projects/references.json');
        if (!response.ok) return;
        const references = await response.json();

        const gridContainer = document.getElementById('reference-grid');
        if (!gridContainer) return;

        references.forEach(ref => {
            const cardHTML = `
                <div style="background-color: var(--card-bg); color: var(--text-dark); border-radius: 6px; padding: 1.5rem; display: flex; flex-direction: column; justify-content: space-between; border-top: 4px solid var(--accent-primary); box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
                    <div>
                        <!-- Company Header & Logo row -->
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem; border-bottom: 1px dashed rgba(0,0,0,0.1); padding-bottom: 0.75rem;">
                            <span style="font-family: 'Share Tech Mono', monospace; font-size: 0.9rem; letter-spacing: 1px; color: #555; text-transform: uppercase; font-weight: bold;">${ref.company}</span>
                            <img src="${ref.logo}" alt="${ref.company} logo" style="height: 24px; width: auto; object-fit: contain;">
                        </div>
                        
                        <!-- Person Name and Relationship -->
                        <h3 style="margin: 0 0 0.25rem 0; font-size: 1.25rem; font-weight: 700;">${ref.person}</h3>
                        <div style="font-family: 'Share Tech Mono', monospace; font-size: 0.85rem; color: var(--red-passion); text-transform: uppercase; font-weight: bold; margin-bottom: 1rem;">
                            ${ref.relation}
                        </div>
                        
                        <!-- Title & Corporate Alignment metadata -->
                        <div style="font-size: 0.9rem; line-height: 1.4; color: #3a3a3c;">
                            <strong>Title:</strong> ${ref.title}<br>
                            <strong>Dept:</strong> ${ref.department}
                        </div>
                    </div>

                    <!-- Direct Access Coordinates Connection Layer -->
                    <div style="margin-top: 1.5rem; padding-top: 0.75rem; border-top: 1px solid rgba(0,0,0,0.05);">
                        <a href="mailto:${ref.contact}" style="font-family: 'Share Tech Mono', monospace; font-size: 0.9rem; color: var(--text-dark); text-decoration: none; font-weight: bold; border-bottom: 1px dashed var(--accent-primary);">
                            ✉️ ${ref.contact}
                        </a>
                    </div>
                </div>
            `;
            gridContainer.insertAdjacentHTML('beforeend', cardHTML);
        });
    } catch (error) {
        console.error("Reference generation error:", error);
    }
}


document.addEventListener("DOMContentLoaded", () => {
    loadModularProjects();
    loadProfessionalReferences();
    loadLatestCommitDate();
    fetchGitHubContributions();
});