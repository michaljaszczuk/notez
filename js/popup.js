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

// --- Rich Text Editor Controls (Modified) ---
editorToolbar.addEventListener('click', (e) => {
    const button = e.target.closest('button'); // Get the button element, even if an icon inside it was clicked
    if (button && button.dataset.command) {
        if (noteEditor.contentEditable === 'true') { // Only execute if editor is actually editable
            noteEditor.focus(); // Ensure the editor has focus before executing the command
            document.execCommand(button.dataset.command, false, null);
        }
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
    } else {
        // If a page is active, ensure the editor is editable
        // This can be redundant if loadPageIntoEditor was just called, but acts as a safeguard
        if (appData.pages[activePageId]) {
            noteTitleInput.disabled = false;
            noteEditor.contentEditable = "true";
            saveNoteBtn.disabled = false;
        }
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
            // renderApp(); // This will trigger displayPagesList -- called by loadPageIntoEditor or if no pages

            // Auto-load first page of the section
            const pages = getPagesBySectionLocal(section.id).sort((a,b) => a.title.localeCompare(b.title)); // Ensure consistent sort
            if (pages.length > 0) {
                loadPageIntoEditor(pages[0].id); // loadPageIntoEditor also sets activePageId and calls renderApp
            } else {
                clearEditor();
                setEditorPlaceholder("No pages in this section. Click 'Add Page'.");
                editorColumn.classList.add('hidden'); // Hide editor if no pages
                renderApp(); // Call renderApp to update UI for empty section state
            }

        });
        sidebarColumnList.appendChild(li);
    });
}

function displayPagesList(sectionId, searchQuery = "") {
    pagesColumnList.innerHTML = '';
    // Ensure pages are sorted, e.g., by title
    const pages = getPagesBySectionLocal(sectionId).filter(p =>
        searchQuery ? p.title.toLowerCase().includes(searchQuery) || (p.content && p.content.toLowerCase().includes(searchQuery)) : true
    ).sort((a, b) => a.title.localeCompare(b.title));


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
        // Add data-id for easier targeting if needed later
        li.dataset.pageId = page.id;
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
    if (notebookName && notebookName.trim() !== "") {
        try {
            const newNotebook = await addNotebook(notebookName.trim()); // From storage.js
            appData.notebooks[newNotebook.id] = newNotebook;
            activeNotebookId = newNotebook.id;
            currentViewMode = VIEW_MODES.NOTEBOOK_CONTENTS;
            activeSectionId = null;
            activePageId = null;
            renderApp();
        } catch (error) {
            console.error("Error adding notebook:", error);
            alert("Failed to add notebook. See console for details.");
        }
    }
}

async function handleAddSection() {
    if (!activeNotebookId) {
        alert("Please select a notebook first.");
        return;
    }
    const sectionName = prompt(`Enter name for new section in "${appData.notebooks[activeNotebookId].name}":`);
    if (sectionName && sectionName.trim() !== "") {
        try {
            const newSection = await addSection(activeNotebookId, sectionName.trim());
            appData.sections[newSection.id] = newSection;
            activeSectionId = newSection.id;
            activePageId = null;
            renderApp();
            // Auto-focus or prompt to add a page? For now, just show the empty section.
            setEditorPlaceholder("New section created. Click 'Add Page'.");
            editorColumn.classList.add('hidden'); // Ensure editor is hidden as no page is active
        } catch (error) {
            console.error("Error adding section:", error);
            alert("Failed to add section. See console for details.");
        }
    }
}

async function handleAddPage() {
    if (!activeSectionId) {
        alert("Please select a section first.");
        return;
    }
    const pageTitle = prompt(`Enter title for new page in "${appData.sections[activeSectionId].name}":`);
    if (pageTitle && pageTitle.trim() !== "") {
        try {
            const newPage = await addPage(activeSectionId, pageTitle.trim(), "<p></p>"); // Add empty paragraph
            appData.pages[newPage.id] = newPage;
            // activePageId = newPage.id; // loadPageIntoEditor will handle this
            loadPageIntoEditor(newPage.id); // This will load and re-render
        } catch (error) {
            console.error("Error adding page:", error);
            alert("Failed to add page. See console for details.");
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
        noteEditor.innerHTML = page.content || "<p></p>"; // Ensure there's at least a paragraph for editing
        activePageId = pageId; // Set the truly active page for the editor

        // Ensure correct notebook and section are also marked active for context
        activeSectionId = page.sectionId;
        if (appData.sections[activeSectionId]) {
            activeNotebookId = appData.sections[activeSectionId].notebookId;
        } else { // Should not happen if data is consistent
            console.warn("Section data missing for page, attempting to find notebook by iterating sections.");
            // Fallback to find notebook if section data somehow missing from appData.sections
            for (const secId in appData.sections) {
                if (appData.sections[secId].id === page.sectionId) {
                    activeNotebookId = appData.sections[secId].notebookId;
                    break;
                }
            }
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
        noteTitleInput.focus();
        return;
    }
    try {
        // const updatedPageData = { ...appData.pages[activePageId], title, content, updatedAt: Date.now() }; // Local update before save
        const updated = await updatePage(activePageId, title, content); // Assumes updatePage persists and returns updated obj
        appData.pages[activePageId] = updated; // Update local cache with the returned, persisted page

        // Update page title in the pages list (Column 2) if it changed
        // More robust: find by data-page-id
        const pageListItem = pagesColumnList.querySelector(`li[data-page-id="${activePageId}"]`);
        if (pageListItem && pageListItem.textContent !== title) {
            pageListItem.textContent = title; // Update text content
        }
        // alert('Note saved!'); // Optional: provide feedback
        console.log('Note saved:', activePageId);
    } catch (error) {
        console.error("Error saving note:", error);
        alert(`Failed to save note: ${error.message}. See console for details.`);
    }
});

const debouncedSave = debounce(async () => {
    if (activePageId && noteEditor.contentEditable === "true") {
        const title = noteTitleInput.value.trim();
        const content = noteEditor.innerHTML;

        // Avoid saving if title is empty, unless it's an existing note perhaps.
        // For autosave, it's better to save even if title is temporarily empty during editing.
        // The manual save button can enforce title presence.
        // if (!title) return;

        try {
            // Optimistically update local data as well, but rely on updatePage's return for true state
            // const updatedPageData = { ...appData.pages[activePageId], title, content, updatedAt: Date.now() };
            const updated = await updatePage(activePageId, title, content);
            appData.pages[activePageId] = updated; // Update with persisted data

            // Update page title in Column 2 (Pages List) if it changed
            const pageListItem = pagesColumnList.querySelector(`li[data-page-id="${activePageId}"]`);
            if (pageListItem && pageListItem.textContent !== title) {
               pageListItem.textContent = title;
            }
            console.log('Note autosaved:', activePageId);
        } catch (error) {
            console.error("Error autosaving note:", error);
            // Optionally notify user of autosave failure, but be careful not to be too intrusive.
        }
    }
}, 1500);

noteEditor.addEventListener('input', debouncedSave);
noteTitleInput.addEventListener('input', debouncedSave);


// --- Search (Simple Implementation) ---
searchInputMain.addEventListener('input', debounce(() => {
    lastSearchQuery = searchInputMain.value.toLowerCase();
    // Re-render the current view with the search query
    // Note: renderApp() itself handles which lists to display based on currentViewMode
    renderApp();
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
        lastViewMode
    } = await chrome.storage.local.get(['lastActivePageId', 'lastActiveSectionId', 'lastActiveNotebookId', 'lastViewMode']);

    activeNotebookId = lastActiveNotebookId;
    activeSectionId = lastActiveSectionId;
    activePageId = lastActivePageId;
    currentViewMode = VIEW_MODES.ALL_NOTEBOOKS; // Default, will be adjusted

    // Validate restored IDs against current appData
    if (activeNotebookId && !appData.notebooks[activeNotebookId]) activeNotebookId = null;
    if (activeSectionId && !appData.sections[activeSectionId]) activeSectionId = null;
    if (activePageId && !appData.pages[activePageId]) activePageId = null;

    // Adjust state if inconsistencies found (e.g., page exists but its section/notebook doesn't)
    // Or if a more specific part of the state was active
    if (activePageId && appData.pages[activePageId]) {
        activeSectionId = appData.pages[activePageId].sectionId;
        if (activeSectionId && appData.sections[activeSectionId]) {
            activeNotebookId = appData.sections[activeSectionId].notebookId;
        } else { // Section or notebook for the page is missing
            activePageId = null; activeSectionId = null; activeNotebookId = null;
        }
    } else if (activeSectionId && appData.sections[activeSectionId]) {
        activeNotebookId = appData.sections[activeSectionId].notebookId;
        activePageId = null; // No specific page was active, or page is no longer valid
    } else if (activeNotebookId) {
        activeSectionId = null; activePageId = null; // Only notebook was active
    }


    // Determine view mode based on what's valid and active
    if (activeNotebookId && appData.notebooks[activeNotebookId]) {
        currentViewMode = lastViewMode === VIEW_MODES.NOTEBOOK_CONTENTS ? VIEW_MODES.NOTEBOOK_CONTENTS : VIEW_MODES.ALL_NOTEBOOKS;
        if (currentViewMode === VIEW_MODES.NOTEBOOK_CONTENTS){
            // ensure section and page are still valid for this notebook
            if(activeSectionId && (!appData.sections[activeSectionId] || appData.sections[activeSectionId].notebookId !== activeNotebookId)){
                activeSectionId = null;
                activePageId = null;
            }
            if(activePageId && (!appData.pages[activePageId] || appData.pages[activePageId].sectionId !== activeSectionId)){
                activePageId = null;
            }
        } else { // last view mode was ALL_NOTEBOOKS or invalid
            activeNotebookId = null; // effectively reset to all notebooks view if lastView wasn't specific enough
            activeSectionId = null;
            activePageId = null;
        }
    } else { // No valid notebook, default to all notebooks view
        currentViewMode = VIEW_MODES.ALL_NOTEBOOKS;
        activeNotebookId = null;
        activeSectionId = null;
        activePageId = null;
    }
    
    // If a page was determined to be active and valid, load it.
    if (activePageId && appData.pages[activePageId]) {
        await loadPageIntoEditor(activePageId); // This will call renderApp
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
            const freshData = await getAllData(); // Fetch the latest data
            if (freshData) {
                appData = freshData; // Update local appData
            }

            // Re-validate active items based on the fresh data
            if (activeNotebookId && !appData.notebooks[activeNotebookId]) {
                activeNotebookId = null;
                currentViewMode = VIEW_MODES.ALL_NOTEBOOKS; // Fallback
            }
            if (activeSectionId && (!appData.sections[activeSectionId] || (activeNotebookId && appData.sections[activeSectionId].notebookId !== activeNotebookId))) {
                activeSectionId = null;
            }
            if (activePageId && (!appData.pages[activePageId] || (activeSectionId && appData.pages[activePageId].sectionId !== activeSectionId))) {
                activePageId = null;
            }
            
            // If the currently active page still exists, refresh its content in the editor
            if (activePageId && appData.pages[activePageId]) {
                const page = appData.pages[activePageId];
                noteTitleInput.value = page.title;
                noteEditor.innerHTML = page.content || "<p></p>";
            } else if (editorColumn.classList.contains('hidden') === false) {
                // If an editor was visible but the page is now gone or invalid
                clearEditor();
                setEditorPlaceholder("Page no longer exists or was modified externally.");
            }
            
            renderApp(); // Re-render the UI with fresh data and validated state
            sendResponse({ status: "Popup UI updated from sync" });
        }
        return true; // Indicates async response
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

// Save last state before popup closes
// Using 'pagehide' for Manifest V3 as 'visibilitychange' might not always fire for popups closing
window.addEventListener('pagehide', async (event) => {
    // Save active IDs
    await chrome.storage.local.set({
        lastActivePageId: activePageId,
        lastActiveSectionId: activeSectionId,
        lastActiveNotebookId: activeNotebookId,
        lastViewMode: currentViewMode // Persist the view mode
    });

    // Autosave if a page is open and editable
    if (activePageId && noteEditor.contentEditable === "true") {
        const title = noteTitleInput.value.trim();
        const content = noteEditor.innerHTML;
        if (title) { // Only save if there's a title (or adjust this condition as needed)
            try {
                await updatePage(activePageId, title, content);
                console.log("Final autosave on popup close for page:", activePageId);
            } catch (err) {
                console.error("Error on final autosave:", err);
            }
        }
    }
});


// Helper to get local data (assuming these were in your original popup.js or global scope)
// These functions filter the `appData` object.
function getSectionsByNotebookLocal(notebookId) {
    if (!appData.notebooks[notebookId]) return [];
    return Object.values(appData.sections).filter(section => section.notebookId === notebookId);
}

function getPagesBySectionLocal(sectionId) {
    if (!appData.sections[sectionId]) return [];
    return Object.values(appData.pages).filter(page => page.sectionId === sectionId);
}
// Ensure other data functions like addNotebook, addSection, addPage, updatePage, getAllData
// are correctly defined or imported from your storage.js (which they are if storage.js is loaded)

document.addEventListener('DOMContentLoaded', initializeApp);