// storage.js - Make sure functions like getAllData, addNotebook, updatePage are defined here
// And that they use the same ALL_DATA_KEY_LOCAL as background.js

const ALL_DATA_KEY_LOCAL = 'allNotesDataLocal'; // Key for chrome.storage.local

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
      // Background script should pick this up for syncing
      resolve();
    });
  });
}

function generateId() {
    return `id_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

async function addNotebook(name) {
  const data = await getAllData();
  const id = generateId();
  data.notebooks[id] = { id, name, createdAt: Date.now() };
  await saveData(data);
  return data.notebooks[id];
}

async function addSection(notebookId, name) {
  const data = await getAllData();
  if (!data.notebooks[notebookId]) throw new Error("Notebook not found");
  const id = generateId();
  data.sections[id] = { id, name, notebookId, createdAt: Date.now() };
  await saveData(data);
  return data.sections[id];
}

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
    // Option: Create page if it doesn't exist (e.g. for a new note)
    // This requires knowing its sectionId. For now, we assume it exists.
    console.warn(`Page ${pageId} not found for update. Consider creating it or handling this case.`);
    // If we want to create it, we need sectionId.
    // Let's assume for this example it must exist.
    throw new Error("Page not found for update");
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
// Add delete functions etc.