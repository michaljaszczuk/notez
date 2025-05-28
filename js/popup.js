// js/popup.js

// --- Elements (Existing & New) ---
const noteEditor = document.getElementById('note-editor');
const saveNoteBtn = document.getElementById('save-note-btn');
const noteTitleInput = document.getElementById('note-title-input');
const toggleDarkModeBtn = document.getElementById('toggle-dark-mode');
const editorToolbar = document.querySelector('.editor-toolbar');

// New UI Elements from OneNote Style HTML
const mainAppTitle = document.getElementById('main-app-title');
const searchInputMain = document.getElementById('search-input-main');

const sidebarColumn = document.getElementById('sidebar-column');
const sidebarBackBtn = document.getElementById('sidebar-back-btn');
const sidebarColumnHeaderTitle = document.getElementById('sidebar-column-header-title');
const sidebarColumnList = document.getElementById('sidebar-column-list');
const addItemSidebarColumnBtn = document.getElementById('add-item-sidebar-column-btn');

const pagesColumn = document.getElementById('pages-column');
const pagesColumnHeaderTitle = document.getElementById('pages-column-header-title');
const pagesColumnList = document.getElementById('pages-column-list');
const addPageColumnBtn = document.getElementById('add-page-column-btn');

const editorColumn = document.getElementById('editor-column');


// --- State Management ---
let appData = {
    notebooks: {},
    sections: {},
    pages: {}
};

const VIEW_MODES = {
    ALL_NOTEBOOKS: 'ALL_NOTEBOOKS',
    NOTEBOOK_CONTENTS: 'NOTEBOOK_CONTENTS' // Shows sections in sidebar, pages in pages-column
};
let currentViewMode = VIEW_MODES.ALL_NOTEBOOKS;

let activeNotebookId = null; // ID of the notebook being viewed (sections shown)
let activeSectionId = null;  // ID of the section whose pages are shown
let activePageId = null;     // ID of the page loaded in the editor

let lastSearchQuery = "";

// --- Rich Text Editor Controls (Existing) ---
editorToolbar.addEventListener('click', (e) => {
    if (e.target.tagName === 'BUTTON' && e.target.dataset.command) {
        document.execCommand(e.target.dataset.command, false, null);
        noteEditor.focus();
    }
});

// --- Dark Mode (Existing) ---
function applyDarkModePreference(isDark) {
    document.body.classList.toggle('dark-mode', isDark);
}
toggleDarkModeBtn.addEventListener('click', async () => {
    const newDarkModeState = !document.body.classList.contains('dark-mode');
    applyDarkModePreference(newDarkModeState);
    await chrome.storage.local.set({ darkMode: newDarkModeState });
});
async function loadDarkModePreference() {
    const { darkMode } = await chrome.storage.local.get('darkMode');
    if (darkMode !== undefined) {
        applyDarkModePreference(darkMode);
    } else {
        const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        applyDarkModePreference(prefersDark);
    }
}

// --- UI Rendering Orchestrator ---
function renderApp() {
    console.log("Rendering App - ViewMode:", currentViewMode, "ActiveNB:", activeNotebookId, "ActiveSec:", activeSectionId, "ActivePage:", activePageId);
    // Always clear lists before re-rendering to prevent duplicates
    sidebarColumnList.innerHTML = '';
    pagesColumnList.innerHTML = '';

    // Control visibility of columns based on state
    pagesColumn.classList.add('hidden'); // Hide by default, show if needed
    editorColumn.classList.add('hidden'); // Hide by default, show if needed


    if (currentViewMode === VIEW_MODES.ALL_NOTEBOOKS) {
        mainAppTitle.textContent = "Notesy"; // Or your main app title
        sidebarColumnHeaderTitle.textContent = "All Notebooks";
        sidebarBackBtn.style.display = 'none';
        addItemSidebarColumnBtn.innerHTML = '<span class="add-icon">&#43;</span> Add Notebook';
        addItemSidebarColumnBtn.onclick = handleAddNotebook; // Assign specific handler

        displayNotebooksList(lastSearchQuery);
        pagesColumn.classList.add('hidden');
        editorColumn.classList.add('hidden');
        setEditorPlaceholder("Select a notebook, then a page.");


    } else if (currentViewMode === VIEW_MODES.NOTEBOOK_CONTENTS) {
        if (activeNotebookId && appData.notebooks[activeNotebookId]) {
            const notebook = appData.notebooks[activeNotebookId];
            mainAppTitle.textContent = notebook.name; // Show notebook name in main header
            sidebarColumnHeaderTitle.textContent = "Sections"; // Or notebook.name again if preferred
            sidebarBackBtn.style.display = 'inline-block';
            addItemSidebarColumnBtn.innerHTML = '<span class="add-icon">&#43;</span> Add Section';
            addItemSidebarColumnBtn.onclick = handleAddSection; // Assign specific handler

            displaySectionsList(activeNotebookId, lastSearchQuery);

            if (activeSectionId && appData.sections[activeSectionId]) {
                const section = appData.sections[activeSectionId];
                pagesColumn.classList.remove('hidden');
                pagesColumnHeaderTitle.textContent = section.name;
                displayPagesList(activeSectionId, lastSearchQuery);
                addPageColumnBtn.onclick = handleAddPage; // Setup add page for this section

                if (activePageId && appData.pages[activePageId]) {
                    editorColumn.classList.remove('hidden');
                    // loadPageIntoEditor will fill the editor, already called when page is clicked.
                    // If navigating back or section changes, ensure editor content matches activePageId or clears.
                    if (appData.pages[activePageId].sectionId === activeSectionId) {
                         // Ensure editor is enabled
                        noteTitleInput.disabled = false;
                        noteEditor.contentEditable = "true";
                        saveNoteBtn.disabled = false;
                    } else {
                        // Mismatch, clear editor and activePageId
                        activePageId = null;
                        clearEditor();
                        setEditorPlaceholder("Select a page.");
                        editorColumn.classList.add('hidden');
                    }
                } else {
                    editorColumn.classList.add('hidden');
                    clearEditor();
                    setEditorPlaceholder(getPagesBySectionLocal(activeSectionId).length > 0 ? "Select a page." : "No pages. Click 'Add Page'.");
                }
            } else {
                pagesColumn.classList.add('hidden');
                editorColumn.classList.add('hidden');
                clearEditor();
                setEditorPlaceholder("Select a section to see pages.");
            }
        } else {
            // Should not happen if activeNotebookId is valid, but good fallback
            currentViewMode = VIEW_MODES.ALL_NOTEBOOKS;
            renderApp(); // Re-render in default state
            return;
        }
    }
    // Ensure editor is disabled if no page is active
    if (!activePageId) {
        noteTitleInput.disabled = true;
        noteEditor.contentEditable = "false";
        saveNoteBtn.disabled = true;
    }
}


// --- List Rendering Functions ---

function displayNotebooksList(searchQuery = "") {
    sidebarColumnList.innerHTML = '';
    const notebooks = Object.values(appData.notebooks).filter(nb =>
        searchQuery ? nb.name.toLowerCase().includes(searchQuery) : true
    ).sort((a, b) => a.name.localeCompare(b.name));

    if (notebooks.length === 0) {
        const li = document.createElement('li');
        li.textContent = searchQuery ? "No notebooks match search." : "No notebooks yet.";
        li.classList.add('empty-list-item');
        sidebarColumnList.appendChild(li);
        return;
    }

    notebooks.forEach(notebook => {
        const li = document.createElement('li');
        li.innerHTML = `<span class="item-icon notebook-icon"></span> ${notebook.name}`; // JS adds icon text/class
        if (notebook.id === activeNotebookId && currentViewMode === VIEW_MODES.NOTEBOOK_CONTENTS) {
             // This styling is for when we are in section view but might want to show which notebook is parent.
             // However, in ALL_NOTEBOOKS view, there's no 'activeNotebookId' in the same sense.
        }
        li.addEventListener('click', () => {
            activeNotebookId = notebook.id;
            currentViewMode = VIEW_MODES.NOTEBOOK_CONTENTS;
            activeSectionId = null; // Reset selected section when changing notebook
            activePageId = null;    // Reset selected page
            lastSearchQuery = ""; // Clear search when navigating
            searchInputMain.value = "";
            renderApp();
        });
        sidebarColumnList.appendChild(li);
    });
}

function displaySectionsList(notebookId, searchQuery = "") {
    sidebarColumnList.innerHTML = '';
    const sections = getSectionsByNotebookLocal(notebookId).filter(sec =>
        searchQuery ? sec.name.toLowerCase().includes(searchQuery) : true
    ).sort((a, b) => a.name.localeCompare(b.name));

    if (sections.length === 0) {
        const li = document.createElement('li');
        li.textContent = searchQuery ? "No sections match search." : "No sections in this notebook.";
        li.classList.add('empty-list-item');
        sidebarColumnList.appendChild(li);
        return;
    }

    sections.forEach(section => {
        const li = document.createElement('li');
        li.innerHTML = `<span class="item-icon section-icon"></span> ${section.name}`;
        if (section.id === activeSectionId) {
            li.classList.add('active');
        }
        li.addEventListener('click', () => {
            activeSectionId = section.id;
            activePageId = null; // Reset selected page when changing section
            lastSearchQuery = ""; // Clear search when navigating
            searchInputMain.value = "";
            renderApp(); // This will trigger displayPagesList

            // Auto-load first page of the section
            const pages = getPagesBySectionLocal(section.id).sort((a,b) => a.title.localeCompare(b.title));
            if (pages.length > 0) {
                loadPageIntoEditor(pages[0].id); // loadPageIntoEditor also sets activePageId and calls renderApp
            } else {
                clearEditor();
                setEditorPlaceholder("No pages in this section. Click 'Add Page'.");
                editorColumn.classList.add('hidden'); // Hide editor if no pages
            }

        });
        sidebarColumnList.appendChild(li);
    });
}

function displayPagesList(sectionId, searchQuery = "") {
    pagesColumnList.innerHTML = '';
    const pages = getPagesBySectionLocal(sectionId).filter(p =>
        searchQuery ? p.title.toLowerCase().includes(searchQuery) || (p.content && p.content.toLowerCase().includes(searchQuery)) : true
    ).sort((a, b) => a.title.localeCompare(b.name));

    if (pages.length === 0) {
        const li = document.createElement('li');
        li.textContent = searchQuery ? "No pages match search." : "No pages in this section.";
        li.classList.add('empty-list-item');
        pagesColumnList.appendChild(li);
        return;
    }

    pages.forEach(page => {
        const li = document.createElement('li');
        li.textContent = page.title; // Simpler, no icon for pages in list for now
        if (page.id === activePageId) {
            li.classList.add('active');
        }
        li.addEventListener('click', () => {
            // activePageId = page.id; // loadPageIntoEditor will set this
            loadPageIntoEditor(page.id); // This will re-call renderApp() after loading
        });
        pagesColumnList.appendChild(li);
    });
}


// --- Data Modification Handlers ---
async function handleAddNotebook() {
    const notebookName = prompt("Enter new notebook name:");
    if (notebookName) {
        try {
            const newNotebook = await addNotebook(notebookName); // From storage.js
            appData.notebooks[newNotebook.id] = newNotebook;
            activeNotebookId = newNotebook.id;
            currentViewMode = VIEW_MODES.NOTEBOOK_CONTENTS;
            activeSectionId = null;
            activePageId = null;
            renderApp();
        } catch (error) {
            console.error("Error adding notebook:", error);
            alert("Failed to add notebook.");
        }
    }
}

async function handleAddSection() {
    if (!activeNotebookId) {
        alert("Please select a notebook first.");
        return;
    }
    const sectionName = prompt(`Enter name for new section in "${appData.notebooks[activeNotebookId].name}":`);
    if (sectionName) {
        try {
            const newSection = await addSection(activeNotebookId, sectionName);
            appData.sections[newSection.id] = newSection;
            activeSectionId = newSection.id;
            activePageId = null;
            renderApp();
            // Auto-focus or prompt to add a page? For now, just show the empty section.
            setEditorPlaceholder("New section created. Click 'Add Page'.");
        } catch (error) {
            console.error("Error adding section:", error);
            alert("Failed to add section.");
        }
    }
}

async function handleAddPage() {
    if (!activeSectionId) {
        alert("Please select a section first.");
        return;
    }
    const pageTitle = prompt(`Enter title for new page in "${appData.sections[activeSectionId].name}":`);
    if (pageTitle) {
        try {
            const newPage = await addPage(activeSectionId, pageTitle, ""); // Add empty content
            appData.pages[newPage.id] = newPage;
            // activePageId = newPage.id; // loadPageIntoEditor will handle this
            loadPageIntoEditor(newPage.id); // This will load and re-render
        } catch (error) {
            console.error("Error adding page:", error);
            alert("Failed to add page.");
        }
    }
}

// --- Editor Content Handling ---
function clearEditor() {
    noteTitleInput.value = "";
    noteEditor.innerHTML = "";
    // activePageId = null; // Let setEditorPlaceholder or loadPageIntoEditor manage activePageId
}

function setEditorPlaceholder(text) {
    clearEditor(); // Clear content first
    noteEditor.innerHTML = `<p style="color: var(--text-color-subtle-dark); padding:15px;">${text}</p>`; // Use CSS var
    noteTitleInput.disabled = true;
    noteEditor.contentEditable = "false";
    saveNoteBtn.disabled = true;
}

async function loadPageIntoEditor(pageId) {
    const page = appData.pages[pageId];
    if (page) {
        noteTitleInput.value = page.title;
        noteEditor.innerHTML = page.content || "<p></p>";
        activePageId = pageId; // Set the truly active page for the editor

        // Ensure correct notebook and section are also marked active for context
        activeSectionId = page.sectionId;
        if (appData.sections[activeSectionId]) {
            activeNotebookId = appData.sections[activeSectionId].notebookId;
        }
        currentViewMode = VIEW_MODES.NOTEBOOK_CONTENTS; // Ensure we are in this mode

        noteTitleInput.disabled = false;
        noteEditor.contentEditable = "true";
        saveNoteBtn.disabled = false;
        editorColumn.classList.remove('hidden');


        await chrome.storage.local.set({
            lastActivePageId: activePageId,
            lastActiveSectionId: activeSectionId,
            lastActiveNotebookId: activeNotebookId
        });
        renderApp(); // Re-render to update active states in lists and ensure columns are visible
        noteEditor.focus();
    } else {
        console.error("Page not found:", pageId);
        activePageId = null; // Clear active page if not found
        setEditorPlaceholder("Error: Page not found.");
        editorColumn.classList.add('hidden');
        renderApp(); // Re-render to reflect state
    }
}

saveNoteBtn.addEventListener('click', async () => {
    if (!activePageId) {
        alert("No page is currently open to save.");
        return;
    }
    const title = noteTitleInput.value.trim();
    const content = noteEditor.innerHTML;
    if (!title) {
        alert("Please enter a title for the note.");
        return;
    }
    try {
        const updatedPageData = { ...appData.pages[activePageId], title, content, updatedAt: Date.now() };
        const updated = await updatePage(activePageId, title, content); // Assumes updatePage persists and returns updated obj
        appData.pages[activePageId] = updated;

        // Update page title in the pages list (Column 2) if it changed
        const pageListItem = pagesColumnList.querySelector(`li.active`); // More robust selector needed if not relying on .active
                                                                      // Or iterate through list items to find by data-id if you add it.
        if (pageListItem && pageListItem.textContent !== title) {
            pageListItem.textContent = title;
        }
        alert('Note saved!');
    } catch (error) {
        console.error("Error saving note:", error);
        alert(`Failed to save note: ${error.message}`);
    }
});

const debouncedSave = debounce(async () => {
    if (activePageId && noteEditor.contentEditable === "true") {
        const title = noteTitleInput.value.trim();
        const content = noteEditor.innerHTML;
        if (!title) return;

        try {
            const updatedPageData = { ...appData.pages[activePageId], title, content, updatedAt: Date.now() };
            const updated = await updatePage(activePageId, title, content);
            appData.pages[activePageId] = updated;
            // Update page title in Column 2 (Pages List)
            // This requires finding the correct <li>. For simplicity, renderApp() on major changes handles it.
            // Or, specifically find and update:
            const pageLiElements = pagesColumnList.getElementsByTagName("li");
            for (let li of pageLiElements) {
                // Assuming page title is unique enough for this demo or we add data-page-id to li
                if (appData.pages[activePageId] && li.textContent === appData.pages[activePageId].title_before_update_if_any) { // Pseudocode
                   // Or better: when creating page LIs, add data-page-id attribute
                   // if (li.dataset.pageId === activePageId && li.textContent !== title) {
                   //    li.textContent = title;
                   //    break;
                   // }
                }
            }
             if (pagesColumnHeaderTitle.textContent !== appData.sections[activeSectionId]?.name ||
                sidebarColumnHeaderTitle.textContent !== "Sections" ||
                mainAppTitle.textContent !== appData.notebooks[activeNotebookId]?.name) {
                // If titles changed due to rename, a full renderApp might be needed or specific title updates.
                // For now, this auto-save doesn't trigger a full render unless a page title change needs reflection.
            }


        } catch (error) {
            console.error("Error autosaving note:", error);
        }
    }
}, 1500);

noteEditor.addEventListener('input', debouncedSave);
noteTitleInput.addEventListener('input', debouncedSave);


// --- Search (Simple Implementation) ---
searchInputMain.addEventListener('input', debounce(() => {
    lastSearchQuery = searchInputMain.value.toLowerCase();
    // Re-render the current view with the search query
    if (currentViewMode === VIEW_MODES.ALL_NOTEBOOKS) {
        displayNotebooksList(lastSearchQuery);
    } else if (currentViewMode === VIEW_MODES.NOTEBOOK_CONTENTS) {
        if (activeNotebookId) displaySectionsList(activeNotebookId, lastSearchQuery);
        if (activeSectionId) displayPagesList(activeSectionId, lastSearchQuery); // Also filter pages list
    }
}, 300));


// --- Initialization ---
async function initializeApp() {
    await loadDarkModePreference();
    const data = await getAllData(); // From storage.js
    if (data) {
        appData = data;
    }

    // Restore last state
    const {
        lastActivePageId,
        lastActiveSectionId,
        lastActiveNotebookId,
        lastViewMode // You might want to store this too
    } = await chrome.storage.local.get(['lastActivePageId', 'lastActiveSectionId', 'lastActiveNotebookId', 'lastViewMode']);

    activeNotebookId = lastActiveNotebookId;
    activeSectionId = lastActiveSectionId;
    activePageId = lastActivePageId;
    currentViewMode = lastViewMode || VIEW_MODES.ALL_NOTEBOOKS; // Default to all notebooks

    // Validate restored IDs against current appData
    if (activeNotebookId && !appData.notebooks[activeNotebookId]) activeNotebookId = null;
    if (activeSectionId && !appData.sections[activeSectionId]) activeSectionId = null;
    if (activePageId && !appData.pages[activePageId]) activePageId = null;

    // Adjust state if inconsistencies found (e.g., page exists but its section/notebook doesn't)
    if (activePageId && (!activeSectionId || appData.pages[activePageId].sectionId !== activeSectionId)) {
        activeSectionId = appData.pages[activePageId].sectionId;
    }
    if (activeSectionId && (!activeNotebookId || appData.sections[activeSectionId].notebookId !== activeNotebookId)) {
        activeNotebookId = appData.sections[activeSectionId].notebookId;
    }

    // Determine view mode based on what's active
    if (activeNotebookId) {
        currentViewMode = VIEW_MODES.NOTEBOOK_CONTENTS;
    } else {
        currentViewMode = VIEW_MODES.ALL_NOTEBOOKS;
        activeSectionId = null; // Ensure these are clear if no notebook context
        activePageId = null;
    }
    
    // If a page was active, load it. renderApp() will be called within loadPageIntoEditor.
    if (activePageId && appData.pages[activePageId]) {
        await loadPageIntoEditor(activePageId);
    } else {
        renderApp(); // Initial render based on determined state
    }


    // Listener for back button in sidebar
    sidebarBackBtn.addEventListener('click', () => {
        currentViewMode = VIEW_MODES.ALL_NOTEBOOKS;
        activeNotebookId = null;
        activeSectionId = null;
        activePageId = null;
        lastSearchQuery = ""; // Clear search
        searchInputMain.value = "";
        renderApp();
    });

    // Listener for data sync from background (Simplified)
    chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
        if (message.type === 'DATA_UPDATED_FROM_SYNC') {
            console.log("Popup: Received data update from background sync.");
            const freshData = await getAllData();
            if (freshData) appData = freshData;

            // Validate active IDs
            if (activeNotebookId && !appData.notebooks[activeNotebookId]) activeNotebookId = null;
            if (activeSectionId && !appData.sections[activeSectionId]) activeSectionId = null;
            if (activePageId && !appData.pages[activePageId]) {
                activePageId = null;
                clearEditor(); // Clear editor if page vanished
                setEditorPlaceholder("Page no longer exists.");
            } else if (activePageId) {
                // Re-load current page content as it might have changed
                const page = appData.pages[activePageId];
                noteTitleInput.value = page.title;
                noteEditor.innerHTML = page.content || "<p></p>";
            }

            // Adjust view mode if necessary
            if (!activeNotebookId) currentViewMode = VIEW_MODES.ALL_NOTEBOOKS;
            else currentViewMode = VIEW_MODES.NOTEBOOK_CONTENTS;

            renderApp();
            sendResponse({ status: "Popup UI updated from sync" });
        }
        return true;
    });
}

// Debounce function (Existing)
function debounce(func, delay) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), delay);
    };
}

// Save last state before popup closes (Simplified: storing active IDs)
document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'hidden') {
        await chrome.storage.local.set({
            lastActivePageId: activePageId,
            lastActiveSectionId: activeSectionId,
            lastActiveNotebookId: activeNotebookId,
            lastViewMode: currentViewMode
        });
        // Autosave if a page is open
        if (activePageId && noteEditor.contentEditable === "true") {
            const title = noteTitleInput.value.trim();
            const content = noteEditor.innerHTML;
            if (title) {
                 updatePage(activePageId, title, content).catch(err => console.error("Error on final save:", err));
            }
        }
    }
});

// Helper to get local data (assuming these were in your original popup.js or global scope)
// If these were imported from storage.js, ensure that mechanism is in place.
// For this standalone example, I'm assuming they are available or you'll integrate them.
function getSectionsByNotebookLocal(notebookId) {
    if (!appData.notebooks[notebookId]) return [];
    return Object.values(appData.sections).filter(section => section.notebookId === notebookId);
}

function getPagesBySectionLocal(sectionId) {
    if (!appData.sections[sectionId]) return [];
    return Object.values(appData.pages).filter(page => page.sectionId === sectionId);
}
// Ensure other data functions like addNotebook, addSection, addPage, updatePage, getAllData
// are correctly defined or imported from your storage.js

document.addEventListener('DOMContentLoaded', initializeApp);