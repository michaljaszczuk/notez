// Elements
const noteEditor = document.getElementById('note-editor');
const saveNoteBtn = document.getElementById('save-note-btn');
const noteTitleInput = document.getElementById('note-title-input');
const notebookListElement = document.getElementById('notebook-list');
const addNotebookBtn = document.getElementById('add-notebook-btn');
const toggleDarkModeBtn = document.getElementById('toggle-dark-mode');
const searchInput = document.getElementById('search-input');
const editorToolbar = document.querySelector('.editor-toolbar');

let currentOpenPageId = null; // To keep track of the currently open page

// --- State (simplified, ideally from storage.js) ---
// This would be populated by functions in storage.js
let appData = {
    notebooks: {}, // { id1: { name: "NB1"}, id2: {name: "NB2"} }
    sections: {},  // { idS1: { name: "SEC1", notebookId: "id1"}, ... }
    pages: {}      // { idP1: { title: "Page1", content: "<p>Hi</p>", sectionId: "idS1"}, ... }
};

// --- Rich Text Editor Controls ---
editorToolbar.addEventListener('click', (e) => {
    if (e.target.tagName === 'BUTTON') {
        const command = e.target.dataset.command;
        if (command) {
            document.execCommand(command, false, null);
            noteEditor.focus(); // Keep focus in editor
        }
    }
});

// --- Dark Mode ---
function applyDarkModePreference(isDark) {
    document.body.classList.toggle('dark-mode', isDark);
}

toggleDarkModeBtn.addEventListener('click', async () => {
    const isCurrentlyDark = document.body.classList.contains('dark-mode');
    const newDarkModeState = !isCurrentlyDark;
    applyDarkModePreference(newDarkModeState);
    await chrome.storage.local.set({ darkMode: newDarkModeState });
});

async function loadDarkModePreference() {
    const { darkMode } = await chrome.storage.local.get('darkMode');
    if (darkMode !== undefined) {
        applyDarkModePreference(darkMode);
    } else {
        // Optional: check system preference if no user preference set
        const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        applyDarkModePreference(prefersDark);
    }
}


// --- UI Rendering (Simplified) ---
function renderNotebooks() {
    notebookListElement.innerHTML = ''; // Clear existing
    // For simplicity, just listing notebooks. You'd expand this for sections and pages.
    for (const nbId in appData.notebooks) {
        const notebook = appData.notebooks[nbId];
        const li = document.createElement('li');
        li.textContent = notebook.name;
        li.dataset.notebookId = nbId;
        // Add event listener to open notebook (which then lists sections, etc.)
        li.addEventListener('click', () => {
            console.log("Notebook clicked:", notebook.name);
            // Here you would render sections for this notebook, then pages
            // For now, just an example: find first page in this notebook and load it
            const firstPage = findFirstPageInNotebook(nbId);
            if(firstPage) {
              loadPageIntoEditor(firstPage.id);
            } else {
              noteEditor.innerHTML = `<p>No pages in ${notebook.name}. Create one!</p>`;
              noteTitleInput.value = "";
              currentOpenPageId = null;
            }
            // Highlight active item
            document.querySelectorAll('#notebook-list li').forEach(item => item.classList.remove('active'));
            li.classList.add('active');
        });
        notebookListElement.appendChild(li);
    }
}

function findFirstPageInNotebook(notebookId) {
    for (const sectionId in appData.sections) {
        if (appData.sections[sectionId].notebookId === notebookId) {
            for (const pageId in appData.pages) {
                if (appData.pages[pageId].sectionId === sectionId) {
                    return appData.pages[pageId];
                }
            }
        }
    }
    return null;
}


// --- Data Loading/Saving ---
async function loadPageIntoEditor(pageId) {
    const page = appData.pages[pageId]; // Assume page is already in appData
    if (page) {
        noteTitleInput.value = page.title;
        noteEditor.innerHTML = page.content;
        currentOpenPageId = pageId;
    } else {
        console.error("Page not found:", pageId);
        noteTitleInput.value = "Error: Page not found";
        noteEditor.innerHTML = "";
        currentOpenPageId = null;
    }
}

saveNoteBtn.addEventListener('click', async () => {
    if (!currentOpenPageId) {
        // Logic to create a new page (needs UI to select notebook/section)
        // For simplicity, let's assume you can only save an open page for now
        alert("Please select a page or create a new one to save.");
        return;
    }
    const title = noteTitleInput.value.trim();
    const content = noteEditor.innerHTML;
    if (!title) {
        alert("Please enter a title for the note.");
        return;
    }
    try {
        await updatePage(currentOpenPageId, title, content); // From storage.js
        appData.pages[currentOpenPageId] = { ...appData.pages[currentOpenPageId], title, content, updatedAt: Date.now() };
        // Optionally re-render part of the sidebar if title changes affect it.
        alert('Note saved!');
    } catch (error) {
        console.error("Error saving note:", error);
        alert("Failed to save note.");
    }
});

// Debounce function (from utils.js or inline)
function debounce(func, delay) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), delay);
    };
}

const debouncedSave = debounce(async () => {
    if (currentOpenPageId) {
        console.log("Autosaving...");
        await updatePage(currentOpenPageId, noteTitleInput.value.trim(), noteEditor.innerHTML);
        appData.pages[currentOpenPageId].content = noteEditor.innerHTML; // Update local state too
        appData.pages[currentOpenPageId].title = noteTitleInput.value.trim();
        appData.pages[currentOpenPageId].updatedAt = Date.now();
    }
}, 1500); // Autosave after 1.5 seconds of inactivity

noteEditor.addEventListener('input', debouncedSave);
noteTitleInput.addEventListener('input', debouncedSave);


// --- Initialization ---
async function initializeApp() {
    await loadDarkModePreference();
    const data = await getAllData(); // From storage.js
    if (data) {
        appData = data;
    }
    renderNotebooks(); // Initial render

    // Optional: Load the last opened page or a default page
    const { lastOpenPageId } = await chrome.storage.local.get('lastOpenPageId');
    if (lastOpenPageId && appData.pages[lastOpenPageId]) {
        loadPageIntoEditor(lastOpenPageId);
        // Highlight the active notebook/section/page in the sidebar
        // This requires finding the notebook of the lastOpenPageId and highlighting it.
        const page = appData.pages[lastOpenPageId];
        if (page) {
            const section = appData.sections[page.sectionId];
            if (section) {
                const notebookElement = notebookListElement.querySelector(`[data-notebook-id="${section.notebookId}"]`);
                if (notebookElement) notebookElement.classList.add('active');
                // Further drill down to highlight section and page if your UI supports it.
            }
        }
    } else if (Object.keys(appData.notebooks).length > 0) {
        // Or load first page of first notebook if no last open page
        const firstNotebookId = Object.keys(appData.notebooks)[0];
        const firstPage = findFirstPageInNotebook(firstNotebookId);
        if (firstPage) {
            loadPageIntoEditor(firstPage.id);
            const notebookElement = notebookListElement.querySelector(`[data-notebook-id="${firstNotebookId}"]`);
            if (notebookElement) notebookElement.classList.add('active');
        }
    }
    // Listen for storage changes from background script (if data is updated from sync)
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'DATA_UPDATED_FROM_SYNC') {
            console.log("Popup: Received data update notification from background.");
            initializeApp(); // Re-initialize or intelligently merge data
        }
    });
}

// Example of adding a notebook (very basic)
addNotebookBtn.addEventListener('click', async () => {
    const notebookName = prompt("Enter notebook name:");
    if (notebookName) {
        try {
            const newNotebook = await addNotebook(notebookName); // From storage.js
            appData.notebooks[newNotebook.id] = newNotebook;
            renderNotebooks(); // Re-render the list
        } catch (error) {
            console.error("Error adding notebook:", error);
            alert("Failed to add notebook.");
        }
    }
});


// Call initialization when the popup DOM is ready
document.addEventListener('DOMContentLoaded', initializeApp);

// Save last open page ID when popup closes (or when page changes)
window.addEventListener('unload', () => { // 'unload' might not always fire for popups.
    if (currentOpenPageId) {
        chrome.storage.local.set({ lastOpenPageId: currentOpenPageId });
    }
});
// A more reliable way for popups might be to save `lastOpenPageId` every time `loadPageIntoEditor` is successful.
// And in `loadPageIntoEditor`:
// async function loadPageIntoEditor(pageId) { ... if (page) { ... chrome.storage.local.set({ lastOpenPageId: pageId }); } }