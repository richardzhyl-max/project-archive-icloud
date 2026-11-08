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

export async function writeCatalog(value) {
  const catalog = normalizeCatalog(value);
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('archive', 'readwrite');
    transaction.objectStore('archive').put(catalog, 'catalog');
    transaction.oncomplete = () => resolve(catalog);
    transaction.onerror = () => reject(new Error('本机记录未保存，请保留 iCloud 清单并重新导入。'));
    transaction.onabort = () => reject(new Error('本机保存已中断，请重新导入 iCloud 清单。'));
  });
}
