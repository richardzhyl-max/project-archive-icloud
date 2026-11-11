import { emptyCatalog, normalizeCatalog } from './catalog.js';

let connection;
function database() {
  connection ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('project-archive-icloud-v2', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('archive');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('无法打开本机档案。请使用 Safari 普通浏览模式。'));
  });
  return connection;
}

export async function readCatalog() {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction('archive').objectStore('archive').get('catalog');
    request.onsuccess = () => {
      try { resolve(request.result ? normalizeCatalog(request.result) : emptyCatalog()); }
      catch (error) { reject(error); }
    };
    request.onerror = () => reject(new Error('无法读取本机档案，请从 iCloud 导入清单恢复。'));
  });
}

export async function updateCatalog(update) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('archive', 'readwrite');
    const store = transaction.objectStore('archive');
    const request = store.get('catalog');
    let catalog, updateError;
    request.onsuccess = () => {
      try {
        catalog = normalizeCatalog(update(request.result ?? emptyCatalog()));
        store.put(catalog, 'catalog');
      } catch (error) {
        updateError = error;
        transaction.abort();
      }
    };
    transaction.oncomplete = () => resolve(catalog);
    transaction.onabort = () => reject(updateError ?? new Error('本机记录未保存，请保留 iCloud 清单并重新导入。'));
  });
}
