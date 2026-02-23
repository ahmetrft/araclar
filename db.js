/**
 * Shared IndexedDB wrapper for persisting File/Blob objects across the Toolbox applications.
 * Specifically used for storing audio files loaded into DrumPad and Music Player so they survive page reloads.
 */

const DB_NAME = 'ToolboxStorage';
const DB_VERSION = 1;

function openDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);

        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('drumpad')) {
                db.createObjectStore('drumpad');
            }
            if (!db.objectStoreNames.contains('musicplayer')) {
                db.createObjectStore('musicplayer');
            }
        };

        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

window.ToolboxDB = {
    async save(storeName, key, data) {
        try {
            const db = await openDB();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(storeName, 'readwrite');
                const store = tx.objectStore(storeName);
                const req = store.put(data, key);
                req.onsuccess = () => resolve();
                req.onerror = () => reject(req.error);
            });
        } catch (e) {
            console.error(`ToolboxDB Save Error (${storeName}:${key}):`, e);
        }
    },

    async load(storeName, key) {
        try {
            const db = await openDB();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(storeName, 'readonly');
                const store = tx.objectStore(storeName);
                const req = store.get(key);
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });
        } catch (e) {
            console.error(`ToolboxDB Load Error (${storeName}:${key}):`, e);
            return null;
        }
    }
};
