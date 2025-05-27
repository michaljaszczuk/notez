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
let expandedNotebooks = new Set(); // To track expanded notebooks
let expandedSections = new Set();  // To track expanded sections

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
            if (expandedNotebooks.has(notebook.id)) {
                expandedNotebooks.delete(notebook.id);
                 // Optional: If collapsing, decide if sections within it should also be marked as collapsed
                // getSectionsByNotebookLocal(notebook.id).forEach(sec => expandedSections.delete(sec.id));
            } else {
                expandedNotebooks.add(notebook.id);
            }
            currentSelectedNotebookId = notebook.id;
            // currentSelectedSectionId = null; // Keep section selected if within this notebook

            renderSidebar(lastSearchQuery);

            // If notebook was expanded, and no relevant page is open, try to load first page
            if (expandedNotebooks.has(notebook.id)) {
                const sections = getSectionsByNotebookLocal(notebook.id).sort((a, b) => a.name.localeCompare(b.name));
                if (sections.length > 0) {
                    const firstSection = sections[0];
                    // Optionally auto-expand the first section
                    // expandedSections.add(firstSection.id);
                    const pages = getPagesBySectionLocal(firstSection.id).sort((a, b) => a.title.localeCompare(b.title));
                    if (pages.length > 0) {
                        // Load first page only if no page is open or current page is not in this notebook.
                        if (!currentOpenPageId || !appData.pages[currentOpenPageId] || appData.sections[appData.pages[currentOpenPageId].sectionId].notebookId !== notebook.id) {
                            loadPageIntoEditor(pages[0].id);
                        }
                    } else if (!currentOpenPageId || !appData.pages[currentOpenPageId] || appData.sections[appData.pages[currentOpenPageId].sectionId].notebookId !== notebook.id) {
                        // No pages in the first section, set placeholder if editor should change
                        setEditorPlaceholder(`No pages in section "${firstSection.name}". Click "+ New Page".`);
                    }
                } else if (!currentOpenPageId || !appData.pages[currentOpenPageId] || appData.sections[appData.pages[currentOpenPageId].sectionId].notebookId !== notebook.id) {
                    // No sections in the notebook, set placeholder if editor should change
                     setEditorPlaceholder(`No sections in notebook "${notebook.name}". Click "+ New Section".`);
                }
            }
        });

        const notebookControls = document.createElement('div');
        notebookControls.classList.add('item-controls');

        const addSectionBtn = createIconButton('&#43;', 'Add Section', async (e) => {
            e.stopPropagation();
            currentSelectedNotebookId = notebook.id; // Ensure this notebook is context
            expandedNotebooks.add(notebook.id);   // Ensure notebook is expanded

            const sectionName = prompt(`Enter name for new section in "${notebook.name}":`);
            if (sectionName) {
                try {
                    const newSection = await addSection(notebook.id, sectionName);
                    appData.sections[newSection.id] = newSection;
                    currentSelectedSectionId = newSection.id; // Select new section
                    expandedSections.add(newSection.id); // Expand new section
                    renderSidebar(lastSearchQuery);
                    setEditorPlaceholder(`No pages in new section "${newSection.name}". Click "+ New Page".`);
                } catch (error) {
                    console.error("Error adding section:", error);
                    alert("Failed to add section.");
                }
            }
        });

        const renameNotebookBtn = createIconButton('&#9998;', 'Rename Notebook', async (e) => {
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

        const deleteNotebookBtn = createIconButton('&#128465;', 'Delete Notebook', async (e) => {
            e.stopPropagation();
            if (confirm(`Are you sure you want to delete notebook "${notebook.name}" and all its contents?`)) {
                const notebookIdToDelete = notebook.id;
                try {
                    await deleteNotebook(notebookIdToDelete);
                    delete appData.notebooks[notebookIdToDelete];
                    // Cascade delete local appData sections and pages
                    getSectionsByNotebookLocal(notebookIdToDelete).forEach(sec => {
                        getPagesBySectionLocal(sec.id).forEach(p => delete appData.pages[p.id]);
                        delete appData.sections[sec.id];
                        expandedSections.delete(sec.id); // Clean up expansion state
                    });
                    expandedNotebooks.delete(notebookIdToDelete); // Clean up expansion state

                    if (currentSelectedNotebookId === notebookIdToDelete) {
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
        // Show sections if notebook is expanded OR if we are searching (filteredNotebooks handles this)
        if (expandedNotebooks.has(notebook.id) || (searchQuery && filteredNotebooks.some(nb => nb.id === notebook.id))) {
            const sectionsToDisplay = getSectionsByNotebookLocal(notebook.id).filter(sec =>
                searchQuery ? sec.name.toLowerCase().includes(lastSearchQuery) ||
                              getPagesBySectionLocal(sec.id).some(p =>
                                  p.title.toLowerCase().includes(lastSearchQuery) ||
                                  (p.content && p.content.toLowerCase().includes(lastSearchQuery))
                              )
                            : true
            );

            sectionsToDisplay.sort((a, b) => a.name.localeCompare(b.name)).forEach(section => {
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
                    if (expandedSections.has(section.id)) {
                        expandedSections.delete(section.id);
                    } else {
                        expandedSections.add(section.id);
                    }
                    currentSelectedSectionId = section.id;
                    currentSelectedNotebookId = notebook.id; // Ensure parent notebook is also marked active

                    renderSidebar(lastSearchQuery);

                    // If section was expanded, and no relevant page is open, try to load first page
                    if (expandedSections.has(section.id)) {
                        const pages = getPagesBySectionLocal(section.id).sort((a,b) => a.title.localeCompare(b.title));
                        if (pages.length > 0) {
                             if (!currentOpenPageId || !appData.pages[currentOpenPageId] || appData.pages[currentOpenPageId].sectionId !== section.id) {
                                loadPageIntoEditor(pages[0].id);
                            }
                        } else if (!currentOpenPageId || !appData.pages[currentOpenPageId] || appData.pages[currentOpenPageId].sectionId !== section.id) {
                            setEditorPlaceholder(`No pages in section "${section.name}". Click "+ New Page".`);
                        }
                    }
                });

                const sectionControls = document.createElement('div');
                sectionControls.classList.add('item-controls');

                const addPageBtn = createIconButton('&#43;', 'Add Page', async (e) => {
                    e.stopPropagation();
                    currentSelectedSectionId = section.id; // Set context for adding page
                    currentSelectedNotebookId = notebook.id;
                    expandedSections.add(section.id);      // Ensure section is expanded
                    expandedNotebooks.add(notebook.id);  // Ensure parent notebook is expanded

                    const pageTitle = prompt(`Enter title for new page in "${section.name}":`);
                    if (pageTitle) {
                        try {
                            const newPage = await addPage(section.id, pageTitle, "");
                            appData.pages[newPage.id] = newPage;
                            loadPageIntoEditor(newPage.id); // Load new page (will also render sidebar)
                        } catch (error) {
                            console.error("Error adding page:", error);
                            alert("Failed to add page.");
                        }
                    }
                });

                const renameSectionBtn = createIconButton('&#9998;', 'Rename Section', async (e) => {
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

                const deleteSectionBtn = createIconButton('&#128465;', 'Delete Section', async (e) => {
                    e.stopPropagation();
                    if (confirm(`Are you sure you want to delete section "${section.name}" and all its pages?`)) {
                        const sectionIdToDelete = section.id;
                        try {
                            await deleteSection(sectionIdToDelete);
                            delete appData.sections[sectionIdToDelete];
                            // Cascade delete local appData pages
                            getPagesBySectionLocal(sectionIdToDelete).forEach(p => delete appData.pages[p.id]);
                            expandedSections.delete(sectionIdToDelete); // Clean up expansion state

                            if (currentSelectedSectionId === sectionIdToDelete) {
                                currentSelectedSectionId = null;
                                // If a page from this section was open, clear it
                                if (currentOpenPageId && appData.pages[currentOpenPageId] && appData.pages[currentOpenPageId].sectionId === sectionIdToDelete) {
                                    currentOpenPageId = null;
                                    clearEditor();
                                }
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
                // Show pages if section is expanded OR if we are searching and this section is relevant
                if (expandedSections.has(section.id) || (searchQuery && sectionsToDisplay.some(s => s.id === section.id))) {
                    const pagesToDisplay = getPagesBySectionLocal(section.id).filter(p =>
                        searchQuery ? p.title.toLowerCase().includes(lastSearchQuery) ||
                                      (p.content && p.content.toLowerCase().includes(lastSearchQuery))
                                    : true
                    );

                    pagesToDisplay.sort((a, b) => a.title.localeCompare(b.title)).forEach(page => {
                        const pageLi = document.createElement('li');
                        pageLi.classList.add('page-item');
                        pageLi.dataset.pageId = page.id;

                        const pageTitleNode = document.createTextNode(page.title); // Create text node for title
                        pageLi.appendChild(pageTitleNode); // Append title text node

                        if (page.id === currentOpenPageId) {
                            pageLi.classList.add('active');
                        }
                        pageLi.addEventListener('click', (e) => {
                            e.stopPropagation();
                            loadPageIntoEditor(page.id); // This will also set currentSelected items and re-render
                        });

                        const deletePageBtn = createIconButton('&#128465;', 'Delete Page', async (ev) => {
                            ev.stopPropagation();
                            if (confirm(`Are you sure you want to delete page "${page.title}"?`)) {
                                try {
                                    await deletePage(page.id);
                                    delete appData.pages[page.id];
                                    if (currentOpenPageId === page.id) {
                                        clearEditor();
                                        currentOpenPageId = null;
                                        // Try to load another page in the same section or set placeholder
                                        const remainingPages = getPagesBySectionLocal(section.id);
                                        if (remainingPages.length > 0) {
                                            loadPageIntoEditor(remainingPages.sort((a,b)=>a.title.localeCompare(b.title))[0].id);
                                        } else {
                                            setEditorPlaceholder("Select or create a page to start typing...");
                                        }
                                    }
                                    renderSidebar(lastSearchQuery);
                                } catch (error) {
                                    console.error("Error deleting page:", error);
                                    alert("Failed to delete page.");
                                }
                            }
                        });
                        deletePageBtn.style.marginLeft = "5px"; // basic styling
                        pageLi.appendChild(deletePageBtn); // Append delete button AFTER text node
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

function createIconButton(htmlContent, title, onClick) {
    const button = document.createElement('button');
    button.classList.add('icon-button');
    button.innerHTML = htmlContent; // Use innerHTML for HTML entities
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
    // Do not disable editor parts here, setEditorPlaceholder handles it
}

function setEditorPlaceholder(text) {
    noteTitleInput.value = "";
    noteEditor.innerHTML = `<p style="color: #aaa;">${text}</p>`;
    currentOpenPageId = null; // Ensure no page is considered open
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

        const section = appData.sections[page.sectionId];
        if (section) {
            currentSelectedSectionId = section.id;
            currentSelectedNotebookId = section.notebookId;
            // Ensure parents are expanded when a page is loaded
            expandedSections.add(section.id);
            expandedNotebooks.add(section.notebookId);
        }

        noteTitleInput.disabled = false;
        noteEditor.contentEditable = "true";
        saveNoteBtn.disabled = false;

        await chrome.storage.local.set({ lastOpenPageId: pageId });
        renderSidebar(lastSearchQuery); // Re-render sidebar to reflect active items and expansion
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
        // Check if the title in the sidebar needs updating (renderSidebar will catch it, but direct is faster for UI feel)
        const pageLi = notebookListElement.querySelector(`.page-item[data-page-id="${currentOpenPageId}"]`);
        if (pageLi) {
            for (let child of pageLi.childNodes) {
                if (child.nodeType === Node.TEXT_NODE && child.nodeValue.trim() !== title) {
                    child.nodeValue = title;
                    break;
                }
            }
        }
        alert('Note saved!');
    } catch (error) {
        console.error("Error saving note:", error);
        alert(`Failed to save note: ${error.message}`);
    }
});

const debouncedSave = debounce(async () => {
    if (currentOpenPageId && noteEditor.contentEditable === "true") {
        // console.log("Autosaving...");
        const title = noteTitleInput.value.trim();
        const content = noteEditor.innerHTML;
        if (!title) return; // Don't autosave without a title

        try {
            const updated = await updatePage(currentOpenPageId, title, content);
             appData.pages[currentOpenPageId] = { ...appData.pages[currentOpenPageId], ...updated };
            // Update the title in the sidebar if it's visible and changed
            const pageLi = notebookListElement.querySelector(`.page-item[data-page-id="${currentOpenPageId}"]`);
            if (pageLi) {
                for (let child of pageLi.childNodes) {
                    if (child.nodeType === Node.TEXT_NODE && child.nodeValue.trim() !== title) {
                        child.nodeValue = title;
                        break;
                    }
                }
            }
        } catch (error) {
            console.error("Error autosaving note:", error);
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

    // Optionally load persisted expansion states (if you implement saving them)
    // const { expandedNbs, expandedSns } = await chrome.storage.local.get(['expandedNbs', 'expandedSns']);
    // if (expandedNbs) expandedNotebooks = new Set(expandedNbs);
    // if (expandedSns) expandedSections = new Set(expandedSns);


    const { lastOpenPageId: storedLastOpenPageId,
            lastSelectedNotebookId: storedLastSelectedNotebookId,
            lastSelectedSectionId: storedLastSelectedSectionId
           } = await chrome.storage.local.get(['lastOpenPageId', 'lastSelectedNotebookId', 'lastSelectedSectionId']);

    currentSelectedNotebookId = storedLastSelectedNotebookId;
    currentSelectedSectionId = storedLastSelectedSectionId;

    // Initial expansion based on last state
    if (storedLastOpenPageId && appData.pages[storedLastOpenPageId]) {
        const pageToLoad = appData.pages[storedLastOpenPageId];
        const sectionOfPage = appData.sections[pageToLoad.sectionId];
        if (sectionOfPage) {
            expandedSections.add(sectionOfPage.id);
            if (appData.notebooks[sectionOfPage.notebookId]) {
                expandedNotebooks.add(sectionOfPage.notebookId);
            }
        }
        await loadPageIntoEditor(storedLastOpenPageId); // This also calls renderSidebar
    } else if (currentSelectedSectionId && appData.sections[currentSelectedSectionId]) {
        const sectionToSelect = appData.sections[currentSelectedSectionId];
        expandedSections.add(sectionToSelect.id);
        if (appData.notebooks[sectionToSelect.notebookId]) {
            expandedNotebooks.add(sectionToSelect.notebookId);
        }
        const pagesInSection = getPagesBySectionLocal(currentSelectedSectionId).sort((a,b) => a.title.localeCompare(b.title));
        if (pagesInSection.length > 0) {
            await loadPageIntoEditor(pagesInSection[0].id);
        } else {
            setEditorPlaceholder(`No pages in section "${sectionToSelect.name}". Click "+ New Page".`);
            renderSidebar(); // Explicitly call render if no page is loaded
        }
    } else if (currentSelectedNotebookId && appData.notebooks[currentSelectedNotebookId]) {
        const notebookToSelect = appData.notebooks[currentSelectedNotebookId];
        expandedNotebooks.add(notebookToSelect.id);
        const sectionsInNotebook = getSectionsByNotebookLocal(currentSelectedNotebookId).sort((a,b) => a.name.localeCompare(b.name));
        if (sectionsInNotebook.length > 0) {
            const firstSection = sectionsInNotebook[0];
            currentSelectedSectionId = firstSection.id; // Also select the first section
            expandedSections.add(firstSection.id); // And expand it
            const pagesInFirstSection = getPagesBySectionLocal(firstSection.id).sort((a,b) => a.title.localeCompare(b.title));
            if (pagesInFirstSection.length > 0) {
                await loadPageIntoEditor(pagesInFirstSection[0].id);
            } else {
                 setEditorPlaceholder(`No pages in section "${firstSection.name}". Click "+ New Page".`);
                 renderSidebar();
            }
        } else {
            setEditorPlaceholder(`No sections in notebook "${notebookToSelect.name}". Click "+ New Section".`);
            renderSidebar();
        }
    } else if (Object.keys(appData.notebooks).length > 0) {
        // Fallback: Load first page of first section of first notebook, and expand them
        const firstNotebook = Object.values(appData.notebooks).sort((a,b) => a.name.localeCompare(b.name))[0];
        if (firstNotebook) {
            currentSelectedNotebookId = firstNotebook.id;
            expandedNotebooks.add(firstNotebook.id);
            const sections = getSectionsByNotebookLocal(firstNotebook.id).sort((a,b) => a.name.localeCompare(b.name));
            if (sections.length > 0) {
                currentSelectedSectionId = sections[0].id;
                expandedSections.add(sections[0].id);
                const pages = getPagesBySectionLocal(sections[0].id).sort((a,b) => a.title.localeCompare(b.title));
                if (pages.length > 0) {
                    await loadPageIntoEditor(pages[0].id);
                } else {
                    setEditorPlaceholder(`No pages in section "${sections[0].name}". Click "+ New Page".`);
                    renderSidebar();
                }
            } else {
                 setEditorPlaceholder(`No sections in notebook "${firstNotebook.name}". Click "+ New Section".`);
                 renderSidebar();
            }
        } else {
             renderSidebar(); // Should not happen if notebooks exist, but good fallback
        }
    } else {
        setEditorPlaceholder("Create a notebook and page to get started!");
        renderSidebar(); // Initial render for empty state
    }


    chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
        if (message.type === 'DATA_UPDATED_FROM_SYNC') {
            console.log("Popup: Received data update notification from background.");
            const freshData = await getAllData(); // Re-fetch all data
            if (freshData) {
                appData = freshData;
            }

            // Validate and clean up expansion sets based on fresh data
            const validExpandedNotebooks = new Set();
            expandedNotebooks.forEach(id => { if (appData.notebooks[id]) validExpandedNotebooks.add(id); });
            expandedNotebooks = validExpandedNotebooks;

            const validExpandedSections = new Set();
            expandedSections.forEach(id => { if (appData.sections[id]) validExpandedSections.add(id); });
            expandedSections = validExpandedSections;

            // Decide if current page still exists and reload or clear
            if (currentOpenPageId && !appData.pages[currentOpenPageId]) {
                currentOpenPageId = null;
                clearEditor(); // Clear content
                setEditorPlaceholder("The previously open page was removed or changed."); // Set placeholder
            } else if (currentOpenPageId && appData.pages[currentOpenPageId]) { // Page still exists
                // Re-load content of current page in case it changed from sync
                const page = appData.pages[currentOpenPageId];
                noteTitleInput.value = page.title;
                noteEditor.innerHTML = page.content || "<p></p>";
                 // Ensure editor is enabled if a page is loaded
                noteTitleInput.disabled = false;
                noteEditor.contentEditable = "true";
                saveNoteBtn.disabled = false;
            } else if (!currentOpenPageId) { // No page was open, or it got deleted.
                 // If editor was showing a specific placeholder due to deletion, it's already set.
                 // Otherwise, ensure a generic placeholder if appropriate.
                 // The logic in initializeApp will try to load a default page if possible based on selections.
                 // For now, just ensure the sidebar is correct. If nothing is loadable, it'll show its placeholder.
            }

            // If current selected notebook/section was deleted, clear selection
            if (currentSelectedNotebookId && !appData.notebooks[currentSelectedNotebookId]) {
                currentSelectedNotebookId = null;
            }
            if (currentSelectedSectionId && !appData.sections[currentSelectedSectionId]) {
                currentSelectedSectionId = null;
                 // if the section of the current open page was deleted, the page itself would be gone or reparented (not handled here)
                 // but if currentOpenPageId's section is now invalid, it would have been caught above.
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
            expandedNotebooks.add(newNotebook.id); // Expand the new notebook
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
        // Optionally persist expansion states:
        // chrome.storage.local.set({
        //     expandedNbs: Array.from(expandedNotebooks),
        //     expandedSns: Array.from(expandedSections)
        // });

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