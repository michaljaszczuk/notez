// js/storage.js

const ALL_DATA_KEY_LOCAL = 'allNotesDataLocal'; // Key for chrome.storage.local

// --- Core Data Functions ---
async function getAllData() {
  return new Promise((resolve) => {
    chrome.storage.local.get(ALL_DATA_KEY_LOCAL, (result) => {
      resolve(result[ALL_DATA_KEY_LOCAL] || { notebooks: {}, sections: {}, pages: {} });
    });
  });
}

async function saveData(data) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [ALL_DATA_KEY_LOCAL]: data }, () => {
      if (chrome.runtime.lastError) {
        console.error("Storage.local save error:", chrome.runtime.lastError.message);
        return reject(chrome.runtime.lastError);
      }
      // The background script (background.js) will pick up this change
      // and can then sync it with chrome.storage.sync if needed.
      resolve();
    });
  });
}

function generateId() {
    return `id_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// --- Notebook Functions ---
async function addNotebook(name) {
  const data = await getAllData();
  const id = generateId();
  data.notebooks[id] = { id, name, createdAt: Date.now() };
  await saveData(data);
  return data.notebooks[id];
}

async function getNotebook(notebookId) {
  const data = await getAllData();
  return data.notebooks[notebookId];
}

async function updateNotebook(notebookId, name) {
  const data = await getAllData();
  if (!data.notebooks[notebookId]) {
    throw new Error("Notebook not found for update");
  }
  data.notebooks[notebookId].name = name;
  data.notebooks[notebookId].updatedAt = Date.now(); // Optional: track updates
  await saveData(data);
  return data.notebooks[notebookId];
}

async function deleteNotebook(notebookId) {
  const data = await getAllData();
  if (!data.notebooks[notebookId]) {
    console.warn(`Notebook ${notebookId} not found for deletion.`);
    return false; // Or throw new Error("Notebook not found");
  }

  // Find and delete all sections (and their pages) belonging to this notebook
  const sectionsToDelete = Object.values(data.sections).filter(
    (section) => section.notebookId === notebookId
  );

  for (const section of sectionsToDelete) {
    await deleteSection(section.id, data); // Pass data to avoid multiple reads
  }

  delete data.notebooks[notebookId];
  await saveData(data);
  console.log(`Notebook ${notebookId} and its contents deleted.`);
  return true;
}

// --- Section Functions ---
async function addSection(notebookId, name) {
  const data = await getAllData();
  if (!data.notebooks[notebookId]) throw new Error("Notebook not found");
  const id = generateId();
  data.sections[id] = { id, name, notebookId, createdAt: Date.now() };
  await saveData(data);
  return data.sections[id];
}

async function getSection(sectionId) {
  const data = await getAllData();
  return data.sections[sectionId];
}

async function updateSection(sectionId, name) {
  const data = await getAllData();
  if (!data.sections[sectionId]) {
    throw new Error("Section not found for update");
  }
  data.sections[sectionId].name = name;
  data.sections[sectionId].updatedAt = Date.now(); // Optional: track updates
  await saveData(data);
  return data.sections[sectionId];
}

// internalDeleteSection can be called by deleteNotebook to avoid multiple saveData calls if preferred
async function deleteSection(sectionId, existingData = null) {
  const data = existingData || await getAllData();
  if (!data.sections[sectionId]) {
    console.warn(`Section ${sectionId} not found for deletion.`);
    return false; // Or throw new Error("Section not found");
  }

  // Find and delete all pages belonging to this section
  const pagesToDelete = Object.values(data.pages).filter(
    (page) => page.sectionId === sectionId
  );

  for (const page of pagesToDelete) {
    delete data.pages[page.id]; // Directly delete from the data object
  }

  delete data.sections[sectionId];
  if (!existingData) { // Only save if this is the primary call, not a nested one
    await saveData(data);
  }
  console.log(`Section ${sectionId} and its pages deleted.`);
  return true;
}

// --- Page Functions ---
async function addPage(sectionId, title, content = "") {
  const data = await getAllData();
  if (!data.sections[sectionId]) throw new Error("Section not found");
  const id = generateId();
  const now = Date.now();
  data.pages[id] = { id, title, content, sectionId, createdAt: now, updatedAt: now };
  await saveData(data);
  return data.pages[id];
}

async function getPage(pageId) {
  const data = await getAllData();
  return data.pages[pageId];
}

async function updatePage(pageId, title, content) {
  const data = await getAllData();
  if (!data.pages[pageId]) {
    // This was the previous behavior. Depending on UX, might want to create it
    // or ensure it's always created before calling update.
    console.warn(`Page ${pageId} not found for update. It will not be created.`);
    throw new Error("Page not found for update. Cannot update non-existent page.");
  }
  data.pages[pageId] = {
    ...data.pages[pageId],
    title,
    content,
    updatedAt: Date.now(),
  };
  await saveData(data);
  return data.pages[pageId];
}

async function deletePage(pageId, existingData = null) {
  const data = existingData || await getAllData();
  if (!data.pages[pageId]) {
    console.warn(`Page ${pageId} not found for deletion.`);
    return false; // Or throw new Error("Page not found");
  }
  delete data.pages[pageId];
  if (!existingData) { // Only save if this is the primary call
    await saveData(data);
  }
  console.log(`Page ${pageId} deleted.`);
  return true;
}

// --- Utility/Listing Functions (Optional but often useful) ---
async function getSectionsByNotebook(notebookId) {
  const data = await getAllData();
  return Object.values(data.sections).filter(section => section.notebookId === notebookId);
}

async function getPagesBySection(sectionId) {
  const data = await getAllData();
  return Object.values(data.pages).filter(page => page.sectionId === sectionId);
}