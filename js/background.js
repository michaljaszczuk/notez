// js/background.js

const ALL_DATA_KEY_LOCAL = 'allNotesDataLocal'; // Should match storage.js
const ALL_DATA_KEY_SYNC = 'allNotesDataSync';   // For chrome.storage.sync

// --- HELPER FUNCTIONS ---

// Function to get all data from local storage
async function getAllLocalData() {
  return new Promise((resolve) => {
    chrome.storage.local.get(ALL_DATA_KEY_LOCAL, (result) => {
      resolve(result[ALL_DATA_KEY_LOCAL] || { notebooks: {}, sections: {}, pages: {} });
    });
  });
}

// Function to save all data to local storage
async function saveLocalData(data) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [ALL_DATA_KEY_LOCAL]: data }, () => {
      if (chrome.runtime.lastError) {
        console.error("Background: Local storage save error:", chrome.runtime.lastError.message);
        return reject(chrome.runtime.lastError);
      }
      console.log("Background: Data saved to local storage.");
      resolve();
    });
  });
}

// Function to get all data from sync storage
async function getAllSyncData() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(ALL_DATA_KEY_SYNC, (result) => {
      resolve(result[ALL_DATA_KEY_SYNC] || { notebooks: {}, sections: {}, pages: {} });
    });
  });
}

// Function to save all data to sync storage
async function saveSyncData(data) {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.set({ [ALL_DATA_KEY_SYNC]: data }, () => {
      if (chrome.runtime.lastError) {
        console.error("Background: Sync storage save error:", chrome.runtime.lastError.message);
        // Handle potential errors like QUOTA_BYTES_PER_ITEM exceeded
        return reject(chrome.runtime.lastError);
      }
      console.log("Background: Data saved to sync storage.");
      resolve();
    });
  });
}

// Function to notify the popup/active tabs that data has been updated from sync
function notifyPopupOfDataUpdate() {
  chrome.runtime.sendMessage({ type: 'DATA_UPDATED_FROM_SYNC' }, (response) => {
    if (chrome.runtime.lastError) {
      // This can happen if the popup is not open. It's usually fine.
      // console.log("Background: Popup not open or no listener for DATA_UPDATED_FROM_SYNC.");
    } else {
      console.log("Background: Sent DATA_UPDATED_FROM_SYNC message.");
    }
  });
}


// --- INITIALIZATION AND SYNC LOGIC ---

// Flag to prevent echo changes
let isUpdatingFromSync = false;
let isUpdatingFromLocal = false;

// 1. On Extension Install/Update:
//    - Try to load from sync and merge into local.
//    - If sync is empty, try to push local to sync (if local has data).
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log("Background: Extension installed or updated.", details.reason);

  if (details.reason === "install" || details.reason === "update") {
    const localData = await getAllLocalData();
    const syncData = await getAllSyncData();

    const localDataExists = Object.keys(localData.notebooks).length > 0 ||
                           Object.keys(localData.sections).length > 0 ||
                           Object.keys(localData.pages).length > 0;

    const syncDataExists = Object.keys(syncData.notebooks).length > 0 ||
                          Object.keys(syncData.sections).length > 0 ||
                          Object.keys(syncData.pages).length > 0;

    if (syncDataExists) {
      console.log("Background: Sync data found on install/update. Merging into local.");
      // Simple overwrite local with sync for this example.
      // A more robust solution might involve merging timestamps.
      isUpdatingFromSync = true;
      await saveLocalData(syncData);
      isUpdatingFromSync = false;
      notifyPopupOfDataUpdate(); // Notify popup if it's open
    } else if (localDataExists) {
      console.log("Background: Local data found, sync is empty. Pushing local to sync.");
      isUpdatingFromLocal = true;
      await saveSyncData(localData);
      isUpdatingFromLocal = false;
    } else {
      console.log("Background: No data in local or sync on install/update.");
      // Initialize with empty data if needed, or leave as is.
      // await saveLocalData({ notebooks: {}, sections: {}, pages: {} });
      // await saveSyncData({ notebooks: {}, sections: {}, pages: {} });
    }
  }
});

// 2. Listen for changes in chrome.storage (both local and sync)
chrome.storage.onChanged.addListener(async (changes, areaName) => {
  if (areaName === 'local' && changes[ALL_DATA_KEY_LOCAL]) {
    if (isUpdatingFromSync) {
      // This change was triggered by a sync update, so don't propagate it back to sync.
      console.log("Background: Local data changed due to sync update, not re-syncing.");
      return;
    }
    console.log("Background: Local data changed. Updating sync storage.");
    const newData = changes[ALL_DATA_KEY_LOCAL].newValue;
    if (newData) {
      isUpdatingFromLocal = true;
      try {
        await saveSyncData(newData);
      } catch (error) {
        console.error("Background: Failed to save to sync after local change:", error);
        // Optionally notify the user about sync failure
      }
      isUpdatingFromLocal = false;
    }
  }

  if (areaName === 'sync' && changes[ALL_DATA_KEY_SYNC]) {
    if (isUpdatingFromLocal) {
      // This change was triggered by a local update, so don't propagate it back to local.
      console.log("Background: Sync data changed due to local update, not re-updating local.");
      return;
    }
    console.log("Background: Sync data changed. Updating local storage and notifying popup.");
    const newData = changes[ALL_DATA_KEY_SYNC].newValue;
    if (newData) {
      isUpdatingFromSync = true;
      await saveLocalData(newData);
      isUpdatingFromSync = false;
      notifyPopupOfDataUpdate();
    } else {
      // Data was cleared in sync, clear it locally too
      isUpdatingFromSync = true;
      await saveLocalData({ notebooks: {}, sections: {}, pages: {} }); // Clear local data
      isUpdatingFromSync = false;
      notifyPopupOfDataUpdate();
    }
  }
});

// Optional: Log when the background script starts up (for Manifest V3, it's event-driven)
console.log("Notez Background Service Worker Started.");