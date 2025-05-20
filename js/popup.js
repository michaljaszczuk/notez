// js/popup.js

// Elements
const noteEditor = document.getElementById('note-editor');
const saveNoteBtn = document.getElementById('save-note-btn');
const noteTitleInput = document.getElementById('note-title-input');
const notebookListElement = document.getElementById('notebook-list');
const addNotebookBtn = document.getElementById('add-notebook-btn');
const toggleDarkModeBtn = document.getElementById('toggle-dark-mode');
const searchInput = document.getElementById('search-input');
const editorToolbar = document.querySelector('.editor-toolbar');
const sidebarElement = document.getElementById('sidebar'); // For adding new section/page buttons

// State
let appData = {
    notebooks: {},
    sections: {},
    pages: {}
};
let currentOpenPageId = null;
let currentSelectedNotebookId = null;
let currentSelectedSectionId = null;
let lastSearchQuery = "";

// --- Rich Text Editor Controls ---
editorToolbar.addEventListener('click', (e) => {
    if (e.target.tagName === 'BUTTON' && e.target.dataset.command) {
        document.execCommand(e.target.dataset.command, false, null);
        noteEditor.focus();
    }
});

// --- Dark Mode ---
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

// --- UI Rendering ---

function renderSidebar(searchQuery = "") {
    notebookListElement.innerHTML = ''; // Clear existing
    lastSearchQuery = searchQuery.toLowerCase();

    const filteredNotebooks = Object.values(appData.notebooks).filter(nb =>
        searchQuery ? nb.name.toLowerCase().includes(lastSearchQuery) ||
                      getSectionsByNotebookLocal(nb.id).some(sec =>
                          sec.name.toLowerCase().includes(lastSearchQuery) ||
                          getPagesBySectionLocal(sec.id).some(p =>
                              p.title.toLowerCase().includes(lastSearchQuery) ||
                              (p.content && p.content.toLowerCase().includes(lastSearchQuery)) // search content too
                          )
                      )
                    : true
    );

    if (filteredNotebooks.length === 0 && searchQuery) {
        const li = document.createElement('li');
        li.textContent = "No results found.";
        li.classList.add('no-results');
        notebookListElement.appendChild(li);
        return;
    }
    if (Object.keys(appData.notebooks).length === 0 && !searchQuery) {
         const li = document.createElement('li');
        li.textContent = "No notebooks yet. Click '+ New Notebook' to start!";
        li.classList.add('no-results');
        notebookListElement.appendChild(li);
        return;
    }


    filteredNotebooks.sort((a, b) => a.name.localeCompare(b.name)).forEach(notebook => {
        const notebookLi = document.createElement('li');
        notebookLi.classList.add('notebook-item');
        if (notebook.id === currentSelectedNotebookId) {
            notebookLi.classList.add('active-notebook');
        }

        const notebookHeader = document.createElement('div');
        notebookHeader.classList.add('item-header');
        const notebookNameSpan = document.createElement('span');
        notebookNameSpan.textContent = notebook.name;
        notebookNameSpan.classList.add('item-name');
        notebookNameSpan.addEventListener('click', (e) => {
            e.stopPropagation();
            currentSelectedNotebookId = notebook.id;
            currentSelectedSectionId = null; // Reset section selection
            // currentOpenPageId = null; // Optionally reset page
            // clearEditor();
            renderSidebar(lastSearchQuery);
            // Try to load first page of first section or indicate to create one
            const sections = getSectionsByNotebookLocal(notebook.id);
            if (sections.length > 0) {
                const firstSection = sections[0];
                const pages = getPagesBySectionLocal(firstSection.id);
                if (pages.length > 0) {
                    loadPageIntoEditor(pages[0].id);
                } else {
                    setEditorPlaceholder(`No pages in section "${firstSection.name}". Click "+ New Page" in section controls.`);
                }
            } else {
                 setEditorPlaceholder(`No sections in notebook "${notebook.name}". Click "+ New Section".`);
            }
        });

        const notebookControls = document.createElement('div');
        notebookControls.classList.add('item-controls');

        const addSectionBtn = createIconButton('+', 'Add Section', async (e) => {
            e.stopPropagation();
            const sectionName = prompt(`Enter name for new section in "${notebook.name}":`);
            if (sectionName) {
                try {
                    const newSection = await addSection(notebook.id, sectionName);
                    appData.sections[newSection.id] = newSection;
                    currentSelectedSectionId = newSection.id; // Select new section
                    renderSidebar(lastSearchQuery);
                    setEditorPlaceholder(`No pages in new section "${newSection.name}". Click "+ New Page".`);
                } catch (error) {
                    console.error("Error adding section:", error);
                    alert("Failed to add section.");
                }
            }
        });

        const renameNotebookBtn = createIconButton('✎', 'Rename Notebook', async (e) => {
            e.stopPropagation();
            const newName = prompt("Enter new notebook name:", notebook.name);
            if (newName && newName !== notebook.name) {
                try {
                    await updateNotebook(notebook.id, newName);
                    appData.notebooks[notebook.id].name = newName;
                    renderSidebar(lastSearchQuery);
                } catch (error) {
                    console.error("Error renaming notebook:", error);
                    alert("Failed to rename notebook.");
                }
            }
        });

        const deleteNotebookBtn = createIconButton('🗑', 'Delete Notebook', async (e) => {
            e.stopPropagation();
            if (confirm(`Are you sure you want to delete notebook "${notebook.name}" and all its contents?`)) {
                try {
                    await deleteNotebook(notebook.id);
                    delete appData.notebooks[notebook.id];
                    // Cascade delete local appData sections and pages
                    getSectionsByNotebookLocal(notebook.id).forEach(sec => {
                        getPagesBySectionLocal(sec.id).forEach(p => delete appData.pages[p.id]);
                        delete appData.sections[sec.id];
                    });

                    if (currentSelectedNotebookId === notebook.id) {
                        currentSelectedNotebookId = null;
                        currentSelectedSectionId = null;
                        currentOpenPageId = null;
                        clearEditor();
                        setEditorPlaceholder("Select or create a page to start typing...");
                    }
                    renderSidebar(lastSearchQuery);
                } catch (error) {
                    console.error("Error deleting notebook:", error);
                    alert("Failed to delete notebook.");
                }
            }
        });

        notebookControls.append(addSectionBtn, renameNotebookBtn, deleteNotebookBtn);
        notebookHeader.append(notebookNameSpan, notebookControls);
        notebookLi.appendChild(notebookHeader);

        // Sections
        const sectionsUl = document.createElement('ul');
        sectionsUl.classList.add('section-list');
        if (notebook.id === currentSelectedNotebookId || searchQuery) { // Show sections if notebook is active or searching
            const sections = getSectionsByNotebookLocal(notebook.id).filter(sec =>
                searchQuery ? sec.name.toLowerCase().includes(lastSearchQuery) ||
                              getPagesBySectionLocal(sec.id).some(p =>
                                  p.title.toLowerCase().includes(lastSearchQuery) ||
                                  (p.content && p.content.toLowerCase().includes(lastSearchQuery))
                              )
                            : true
            );

            sections.sort((a, b) => a.name.localeCompare(b.name)).forEach(section => {
                const sectionLi = document.createElement('li');
                sectionLi.classList.add('section-item');
                if (section.id === currentSelectedSectionId) {
                    sectionLi.classList.add('active-section');
                }

                const sectionHeader = document.createElement('div');
                sectionHeader.classList.add('item-header');
                const sectionNameSpan = document.createElement('span');
                sectionNameSpan.textContent = section.name;
                sectionNameSpan.classList.add('item-name');
                sectionNameSpan.addEventListener('click', (e) => {
                    e.stopPropagation();
                    currentSelectedSectionId = section.id;
                    currentSelectedNotebookId = notebook.id; // Ensure parent notebook is also marked active
                    // currentOpenPageId = null; // Optionally reset page
                    // clearEditor();
                    renderSidebar(lastSearchQuery);
                     // Try to load first page or indicate to create one
                    const pages = getPagesBySectionLocal(section.id);
                    if (pages.length > 0) {
                        loadPageIntoEditor(pages[0].id);
                    } else {
                        setEditorPlaceholder(`No pages in section "${section.name}". Click "+ New Page".`);
                    }
                });

                const sectionControls = document.createElement('div');
                sectionControls.classList.add('item-controls');

                const addPageBtn = createIconButton('+', 'Add Page', async (e) => {
                    e.stopPropagation();
                    const pageTitle = prompt(`Enter title for new page in "${section.name}":`);
                    if (pageTitle) {
                        try {
                            const newPage = await addPage(section.id, pageTitle, "");
                            appData.pages[newPage.id] = newPage;
                            loadPageIntoEditor(newPage.id); // Load new page
                            renderSidebar(lastSearchQuery); // Re-render to show new page and select it
                        } catch (error) {
                            console.error("Error adding page:", error);
                            alert("Failed to add page.");
                        }
                    }
                });

                const renameSectionBtn = createIconButton('✎', 'Rename Section', async (e) => {
                    e.stopPropagation();
                    const newName = prompt("Enter new section name:", section.name);
                    if (newName && newName !== section.name) {
                        try {
                            await updateSection(section.id, newName);
                            appData.sections[section.id].name = newName;
                            renderSidebar(lastSearchQuery);
                        } catch (error)                            {
                            console.error("Error renaming section:", error);
                            alert("Failed to rename section.");
                        }
                    }
                });

                const deleteSectionBtn = createIconButton('🗑', 'Delete Section', async (e) => {
                    e.stopPropagation();
                    if (confirm(`Are you sure you want to delete section "${section.name}" and all its pages?`)) {
                        try {
                            await deleteSection(section.id);
                            delete appData.sections[section.id];
                            // Cascade delete local appData pages
                            getPagesBySectionLocal(section.id).forEach(p => delete appData.pages[p.id]);

                            if (currentSelectedSectionId === section.id) {
                                currentSelectedSectionId = null;
                                currentOpenPageId = null;
                                clearEditor();
                                setEditorPlaceholder("Select or create a page to start typing...");
                            }
                            renderSidebar(lastSearchQuery);
                        } catch (error) {
                            console.error("Error deleting section:", error);
                            alert("Failed to delete section.");
                        }
                    }
                });

                sectionControls.append(addPageBtn, renameSectionBtn, deleteSectionBtn);
                sectionHeader.append(sectionNameSpan, sectionControls);
                sectionLi.appendChild(sectionHeader);

                // Pages
                const pagesUl = document.createElement('ul');
                pagesUl.classList.add('page-list');
                if (section.id === currentSelectedSectionId || searchQuery) { // Show pages if section is active or searching
                    const pages = getPagesBySectionLocal(section.id).filter(p =>
                        searchQuery ? p.title.toLowerCase().includes(lastSearchQuery) ||
                                      (p.content && p.content.toLowerCase().includes(lastSearchQuery))
                                    : true
                    );

                    pages.sort((a, b) => a.title.localeCompare(b.title)).forEach(page => {
                        if (searchQuery && !(page.title.toLowerCase().includes(lastSearchQuery) || (page.content && page.content.toLowerCase().includes(lastSearchQuery))) &&
                            !section.name.toLowerCase().includes(lastSearchQuery) && !notebook.name.toLowerCase().includes(lastSearchQuery)) {
                           // If searching and this page itself doesn't match, and its parent section/notebook also don't match the query, skip
                           // This logic is tricky if we want to show parent if child matches. The current filter on notebooks/sections handles this.
                        }

                        const pageLi = document.createElement('li');
                        pageLi.classList.add('page-item');
                        pageLi.textContent = page.title;
                        pageLi.dataset.pageId = page.id;
                        if (page.id === currentOpenPageId) {
                            pageLi.classList.add('active');
                        }
                        pageLi.addEventListener('click', (e) => {
                            e.stopPropagation();
                            loadPageIntoEditor(page.id);
                            currentSelectedSectionId = section.id; // Ensure parent section is active
                            currentSelectedNotebookId = notebook.id; // Ensure parent notebook is active
                            renderSidebar(lastSearchQuery); // Re-render to highlight
                        });

                        // Simple delete for page directly on the page item for now
                        const deletePageBtn = createIconButton('🗑', 'Delete Page', async (ev) => {
                            ev.stopPropagation();
                            if (confirm(`Are you sure you want to delete page "${page.title}"?`)) {
                                try {
                                    await deletePage(page.id);
                                    delete appData.pages[page.id];
                                    if (currentOpenPageId === page.id) {
                                        clearEditor();
                                        currentOpenPageId = null;
                                        setEditorPlaceholder("Select or create a page to start typing...");
                                    }
                                    renderSidebar(lastSearchQuery);
                                } catch (error) {
                                    console.error("Error deleting page:", error);
                                    alert("Failed to delete page.");
                                }
                            }
                        });
                        deletePageBtn.style.marginLeft = "5px"; // basic styling
                        pageLi.appendChild(deletePageBtn);
                        pagesUl.appendChild(pageLi);
                    });
                }
                sectionLi.appendChild(pagesUl);
                sectionsUl.appendChild(sectionLi);
            });
        }
        notebookLi.appendChild(sectionsUl);
        notebookListElement.appendChild(notebookLi);
    });
}

function createIconButton(text, title, onClick) {
    const button = document.createElement('button');
    button.classList.add('icon-button');
    button.textContent = text;
    button.title = title;
    button.addEventListener('click', onClick);
    return button;
}

// Helper to get local data to avoid async calls during pure render logic if appData is up-to-date
function getSectionsByNotebookLocal(notebookId) {
    return Object.values(appData.sections).filter(section => section.notebookId === notebookId);
}

function getPagesBySectionLocal(sectionId) {
    return Object.values(appData.pages).filter(page => page.sectionId === sectionId);
}

function clearEditor() {
    noteTitleInput.value = "";
    noteEditor.innerHTML = "";
    currentOpenPageId = null;
}

function setEditorPlaceholder(text) {
    noteTitleInput.value = "";
    noteEditor.innerHTML = `<p style="color: #aaa;">${text}</p>`;
    currentOpenPageId = null;
    noteTitleInput.disabled = true;
    noteEditor.contentEditable = "false"; // Disable editing
    saveNoteBtn.disabled = true;
}


// --- Data Loading/Saving ---
async function loadPageIntoEditor(pageId) {
    const page = appData.pages[pageId];
    if (page) {
        noteTitleInput.value = page.title;
        noteEditor.innerHTML = page.content || "<p></p>"; // Ensure there's always a paragraph for editing
        currentOpenPageId = pageId;

        // Set current notebook and section based on page
        const section = appData.sections[page.sectionId];
        if (section) {
            currentSelectedSectionId = section.id;
            currentSelectedNotebookId = section.notebookId;
        }

        noteTitleInput.disabled = false;
        noteEditor.contentEditable = "true";
        saveNoteBtn.disabled = false;

        await chrome.storage.local.set({ lastOpenPageId: pageId });
        renderSidebar(lastSearchQuery); // Re-render sidebar to reflect active items
        noteEditor.focus();
    } else {
        console.error("Page not found:", pageId);
        setEditorPlaceholder("Error: Page not found. Select or create another page.");
    }
}

saveNoteBtn.addEventListener('click', async () => {
    if (!currentOpenPageId) {
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
        const updated = await updatePage(currentOpenPageId, title, content);
        appData.pages[currentOpenPageId] = { ...appData.pages[currentOpenPageId], ...updated }; // Update local state
        renderSidebar(lastSearchQuery); // Update sidebar if title changed
        alert('Note saved!');
    } catch (error) {
        console.error("Error saving note:", error);
        alert(`Failed to save note: ${error.message}`);
    }
});

const debouncedSave = debounce(async () => {
    if (currentOpenPageId && noteEditor.contentEditable === "true") {
        console.log("Autosaving...");
        const title = noteTitleInput.value.trim();
        const content = noteEditor.innerHTML;
        if (!title) return; // Don't autosave without a title

        try {
            const updated = await updatePage(currentOpenPageId, title, content);
             appData.pages[currentOpenPageId] = { ...appData.pages[currentOpenPageId], ...updated };
            // Potentially re-render sidebar if title change needs to be reflected immediately
            // renderSidebar(lastSearchQuery); // This might be too much for autosave
             // Update the title in the sidebar if it's visible and changed
            const pageLi = notebookListElement.querySelector(`.page-item[data-page-id="${currentOpenPageId}"]`);
            if (pageLi && pageLi.childNodes[0].nodeValue.trim() !== title) { // Check nodeValue of text node
                 // To avoid issues with the delete button inside, find the text node more carefully
                for (let child of pageLi.childNodes) {
                    if (child.nodeType === Node.TEXT_NODE) {
                        child.nodeValue = title;
                        break;
                    }
                }
            }
        } catch (error) {
            console.error("Error autosaving note:", error);
            // Optionally provide unobtrusive feedback for autosave errors
        }
    }
}, 1500);

noteEditor.addEventListener('input', debouncedSave);
noteTitleInput.addEventListener('input', debouncedSave);

// --- Search ---
searchInput.addEventListener('input', debounce(() => {
    renderSidebar(searchInput.value);
}, 300));


// --- Initialization ---
async function initializeApp() {
    await loadDarkModePreference();
    const data = await getAllData(); // From storage.js
    if (data) {
        appData = data;
    }

    const { lastOpenPageId: storedLastOpenPageId,
            lastSelectedNotebookId: storedLastSelectedNotebookId,
            lastSelectedSectionId: storedLastSelectedSectionId
           } = await chrome.storage.local.get(['lastOpenPageId', 'lastSelectedNotebookId', 'lastSelectedSectionId']);

    currentSelectedNotebookId = storedLastSelectedNotebookId;
    currentSelectedSectionId = storedLastSelectedSectionId;

    renderSidebar(); // Initial render

    if (storedLastOpenPageId && appData.pages[storedLastOpenPageId]) {
        await loadPageIntoEditor(storedLastOpenPageId);
    } else if (currentSelectedSectionId && appData.sections[currentSelectedSectionId]) {
        const pagesInSection = getPagesBySectionLocal(currentSelectedSectionId);
        if (pagesInSection.length > 0) {
            await loadPageIntoEditor(pagesInSection.sort((a,b) => a.title.localeCompare(b.title))[0].id);
        } else {
            setEditorPlaceholder(`No pages in selected section. Click "+ New Page".`);
        }
    } else if (currentSelectedNotebookId && appData.notebooks[currentSelectedNotebookId]) {
        const sectionsInNotebook = getSectionsByNotebookLocal(currentSelectedNotebookId);
        if (sectionsInNotebook.length > 0) {
            const firstSection = sectionsInNotebook.sort((a,b) => a.name.localeCompare(b.name))[0];
            currentSelectedSectionId = firstSection.id; // Select this section
            const pagesInFirstSection = getPagesBySectionLocal(firstSection.id);
            if (pagesInFirstSection.length > 0) {
                await loadPageIntoEditor(pagesInFirstSection.sort((a,b) => a.title.localeCompare(b.title))[0].id);
            } else {
                 setEditorPlaceholder(`No pages in section "${firstSection.name}". Click "+ New Page".`);
            }
        } else {
            setEditorPlaceholder(`No sections in selected notebook. Click "+ New Section".`);
        }
    } else if (Object.keys(appData.notebooks).length > 0) {
        // Fallback: Load first page of first section of first notebook
        const firstNotebook = Object.values(appData.notebooks).sort((a,b) => a.name.localeCompare(b.name))[0];
        if (firstNotebook) {
            currentSelectedNotebookId = firstNotebook.id;
            const sections = getSectionsByNotebookLocal(firstNotebook.id).sort((a,b) => a.name.localeCompare(b.name));
            if (sections.length > 0) {
                currentSelectedSectionId = sections[0].id;
                const pages = getPagesBySectionLocal(sections[0].id).sort((a,b) => a.title.localeCompare(b.title));
                if (pages.length > 0) {
                    await loadPageIntoEditor(pages[0].id);
                } else {
                    setEditorPlaceholder(`No pages in section "${sections[0].name}". Click "+ New Page".`);
                }
            } else {
                 setEditorPlaceholder(`No sections in notebook "${firstNotebook.name}". Click "+ New Section".`);
            }
        }
    } else {
        setEditorPlaceholder("Create a notebook and page to get started!");
    }


    chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
        if (message.type === 'DATA_UPDATED_FROM_SYNC') {
            console.log("Popup: Received data update notification from background.");
            const freshData = await getAllData(); // Re-fetch all data
            if (freshData) {
                appData = freshData;
            }
            // Decide if current page still exists and reload or clear
            if (currentOpenPageId && !appData.pages[currentOpenPageId]) {
                currentOpenPageId = null;
                clearEditor();
                setEditorPlaceholder("The previously open page was removed or changed.");
            } else if (currentOpenPageId) {
                // Re-load content of current page in case it changed
                const page = appData.pages[currentOpenPageId];
                if (page) {
                    noteTitleInput.value = page.title;
                    noteEditor.innerHTML = page.content || "<p></p>";
                }
            }
            renderSidebar(lastSearchQuery); // Re-render the sidebar with new data
            sendResponse({status: "Popup updated"});
        }
        return true; // Indicates you wish to send a response asynchronously
    });
}

addNotebookBtn.addEventListener('click', async () => {
    const notebookName = prompt("Enter new notebook name:");
    if (notebookName) {
        try {
            const newNotebook = await addNotebook(notebookName);
            appData.notebooks[newNotebook.id] = newNotebook;
            currentSelectedNotebookId = newNotebook.id; // Select the new notebook
            currentSelectedSectionId = null; // No section selected yet in new notebook
            clearEditor();
            setEditorPlaceholder(`Notebook "${newNotebook.name}" created. Add a section and page.`);
            renderSidebar(lastSearchQuery);
        } catch (error) {
            console.error("Error adding notebook:", error);
            alert("Failed to add notebook.");
        }
    }
});

// Debounce function
function debounce(func, delay) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), delay);
    };
}

// Save last selection state when popup is about to close
// 'visibilitychange' is more reliable for popups than 'unload'
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
        if (currentOpenPageId) {
            chrome.storage.local.set({ lastOpenPageId: currentOpenPageId });
        }
        if (currentSelectedNotebookId) {
            chrome.storage.local.set({ lastSelectedNotebookId: currentSelectedNotebookId });
        }
        if (currentSelectedSectionId) {
            chrome.storage.local.set({ lastSelectedSectionId: currentSelectedSectionId });
        }
         // Autosave one last time if content is dirty
        if (currentOpenPageId && noteEditor.contentEditable === "true") {
            const title = noteTitleInput.value.trim();
            const content = noteEditor.innerHTML;
            if (title) { // Only save if there's a title
                 updatePage(currentOpenPageId, title, content).catch(err => console.error("Error on final save:", err));
            }
        }
    }
});


document.addEventListener('DOMContentLoaded', initializeApp);