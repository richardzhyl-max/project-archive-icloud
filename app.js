import { applyEvent, CATALOG_NAME, decodeEvent, emptyCatalog, normalizeCatalog, recordsFor, SCHEMA, shortcutURL } from './catalog.js';
import { readCatalog, updateCatalog } from './store.js';

const $ = id => document.getElementById(id);
const archiveName = 'iCloud归档到项目';
const manageName = 'iCloud管理项目档案';
const openName = 'iCloud打开项目原件';
const dayFormat = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: 'long', day: 'numeric' });
const timeFormat = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
let catalog = emptyCatalog();
let savedCatalog;
let activeProject = null;
let demo = false;
let configured = false;
let editingRecord = null;
let callbackQueue = Promise.resolve();

function node(tag, className, text) {
  const value = document.createElement(tag);
  if (className) value.className = className;
  if (text !== undefined) value.textContent = text;
  return value;
}

function notice(message = '', error = false) {
  $('notice').textContent = message;
  $('notice').classList.toggle('error', error);
  $('notice').hidden = !message;
}

function runShortcut(name, input) {
  if (demo) { notice('当前是示例预览。退出示例后，可以建立自己的档案。'); return; }
  if (!configured) { $('setup').showModal(); return; }
  window.location.href = shortcutURL(name, input);
}

function empty(title, detail) {
  const box = node('div', 'empty');
  box.append(node('h2', '', title), node('p', 'muted', detail));
  return box;
}

function render() {
  const showWelcome = !configured && !demo && !Object.keys(catalog.projects).length;
  $('welcome').hidden = !showWelcome;
  $('home').hidden = showWelcome || activeProject !== null;
  $('timeline').hidden = showWelcome || activeProject === null;
  $('leave-demo').hidden = !demo;
  $('home-title').textContent = demo ? '项目列表 · 示例' : '项目列表';
  $('cache-note').textContent = demo
    ? '这是示例内容，不会写入你的档案。'
    : '此页显示本机副本。换设备或补齐记录时，从 iCloud 导入「' + CATALOG_NAME + '」。';
  $('project-list').replaceChildren();
  const projects = Object.entries(catalog.projects).map(([name, id]) => ({ name, id, records: recordsFor(catalog, id) }))
    .sort((a, b) => Date.parse(b.records[0]?.archived_at ?? '1970-01-01') - Date.parse(a.records[0]?.archived_at ?? '1970-01-01') || a.name.localeCompare(b.name, 'zh-CN'));
  for (const project of projects) {
    const card = node('button', 'project-card');
    card.type = 'button';
    const icon = node('span', 'folder'); icon.setAttribute('aria-hidden', 'true');
    const arrow = node('span', 'arrow', '↗'); arrow.setAttribute('aria-hidden', 'true');
    const detail = project.records.length ? project.records.length + ' 份归档 · 最近 ' + dayFormat.format(new Date(project.records[0].archived_at)) : '等待第一份归档';
    card.append(icon, arrow, node('span', 'project-name', project.name), node('span', 'muted', detail));
    card.addEventListener('click', () => {
      activeProject = project.id; $('search').value = ''; render(); $('timeline-title').focus();
    });
    $('project-list').append(card);
  }
  if (!projects.length) $('project-list').append(empty('从一个项目开始', '点「新建项目」，或从系统共享菜单归档第一份文件。'));
  if (activeProject) renderTimeline();
}

function renderTimeline() {
  const project = Object.entries(catalog.projects).find(([, id]) => id === activeProject);
  if (!project) { activeProject = null; render(); return; }
  $('timeline-title').textContent = project[0];
  const all = recordsFor(catalog, activeProject);
  $('timeline-meta').textContent = all.length + ' 份归档 · 北京时间 · 精确到秒';
  const records = recordsFor(catalog, activeProject, $('search').value);
  const list = $('record-list'); list.replaceChildren();
  if (!records.length) {
    list.append(empty(all.length ? '没有找到匹配的文件' : '时间线还没有文件', all.length ? '试试文件名中的其他词，或搜索文件说明。' : '点「归档文件」或从系统共享面板存入第一份原件。'));
    return;
  }
  let currentDay, group;
  for (const record of records) {
    const date = new Date(record.archived_at), day = dayFormat.format(date);
    if (day !== currentDay) {
      currentDay = day; group = node('ul', 'entries');
      const section = node('section', 'day');
      section.append(node('h2', 'day-label', day), group); list.append(section);
    }
    const row = node('li', 'entry');
    const time = node('time', 'entry-time', timeFormat.format(date)); time.dateTime = record.archived_at;
    const info = node('div', 'entry-info'); info.append(node('h3', '', record.title));
    if (record.original !== record.title) info.append(node('p', 'muted original', record.original));
    if (record.note) info.append(node('p', 'entry-note', record.note));
    const actions = node('div', 'entry-actions');
    const open = node('a', 'outline', '打开原件'); open.href = shortcutURL(openName, record.path);
    open.addEventListener('click', event => { event.preventDefault(); runShortcut(openName, record.path); });
    const edit = node('button', 'quiet', '编辑'); edit.type = 'button';
    edit.addEventListener('click', () => openEditor(record));
    actions.append(open, edit); row.append(time, info, actions); group.append(row);
  }
}

function openEditor(record = null) {
  if (demo) { notice('当前是示例预览。退出示例后，可以建立自己的档案。'); return; }
  if (!configured) { $('setup').showModal(); return; }
  editingRecord = record;
  $('editor-title').textContent = record ? '修改文件记录' : '新建项目';
  $('name-label').textContent = record ? '显示名称' : '项目名称';
  $('editor-name').maxLength = record ? 255 : 64;
  $('editor-name').value = record?.title ?? '';
  $('editor-note').value = record?.note ?? '';
  $('note-field').hidden = !record;
  $('editor-status').textContent = '';
  $('editor').showModal(); $('editor-name').focus();
}

async function handleCallback() {
  // Shortcuts leaves Base64 plus signs unescaped, and URLSearchParams treats them as spaces.
  const hash = new URLSearchParams(location.hash.slice(1).replaceAll('+', '%2B'));
  if (!hash.has('event')) return;
  const encoded = hash.get('event');
  history.replaceState(null, '', location.pathname + location.search);
  try {
    if (demo) { demo = false; catalog = savedCatalog; }
    const event = decodeEvent(encoded);
    catalog = await updateCatalog(current => applyEvent(current, event));
    configured = true;
    localStorage.setItem('archive-configured', 'yes');
    activeProject = event.project_id;
    $('search').value = ''; render();
    notice(event.type === 'record' ? '已收到归档记录。原件和清单由快捷指令保存在你的 iCloud 文件夹。' : '项目记录已更新。');
  } catch (error) { notice(error.message, true); }
}

function chooseCatalog() {
  if (demo) { notice('退出示例后，可以导入自己的 iCloud 清单。'); return; }
  $('catalog-file').click();
}

$('catalog-file').addEventListener('change', async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    if (file.size > 20 * 1024 * 1024) throw new Error('这份清单超过 20MB，请先保留文件并联系维护者处理。');
    const next = normalizeCatalog(JSON.parse(await file.text()));
    catalog = await updateCatalog(() => next);
    for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
    render(); notice('已从所选清单更新 ' + Object.keys(next.projects).length + ' 个项目、' + Object.keys(next.records).length + ' 条记录。');
  } catch (error) { notice(error instanceof SyntaxError ? '请选择「项目档案清单.json」，这份文件不是有效的清单。' : error.message, true); }
  finally { event.target.value = ''; }
});

$('editor-form').addEventListener('submit', event => {
  event.preventDefault();
  const name = $('editor-name').value.trim().normalize('NFC');
  if (!name || /[\u0000-\u001f]/u.test(name)) { $('editor-status').textContent = '请填写有效的名称。'; return; }
  if (!editingRecord && Object.hasOwn(catalog.projects, name)) { $('editor-status').textContent = '已有同名项目，请直接打开。'; return; }
  const command = editingRecord
    ? { action: 'edit', id: editingRecord.id, title: name, note: $('editor-note').value.trim() }
    : { action: 'project', name };
  $('editor').close(); runShortcut(manageName, command);
});

$('cancel-edit').addEventListener('click', () => $('editor').close());
$('new-project').addEventListener('click', () => openEditor());
$('back').addEventListener('click', () => { activeProject = null; render(); $('home-title').focus(); });
$('search').addEventListener('input', renderTimeline);
for (const id of ['archive', 'archive-here']) {
  $(id).href = shortcutURL(archiveName);
  $(id).addEventListener('click', event => { event.preventDefault(); runShortcut(archiveName); });
}
for (const id of ['import-button', 'import-timeline', 'import-setup']) $(id).addEventListener('click', chooseCatalog);
$('start-button').addEventListener('click', () => $('setup').showModal());
$('guide-button').addEventListener('click', () => $('guide').showModal());
$('reconfigure').addEventListener('click', () => { $('guide').close(); $('setup').showModal(); });
$('setup-done').addEventListener('click', () => {
  configured = true; localStorage.setItem('archive-configured', 'yes');
  $('setup').close(); render();
});
$('copy-address').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(new URL('./', location.href).href); $('copy-address').textContent = '已复制'; }
  catch { $('setup-message').textContent = '请长按上方网址，选择复制。'; }
});
$('export-button').addEventListener('click', () => {
  if (demo) { notice('示例内容不需要导出。'); return; }
  const url = URL.createObjectURL(new Blob([JSON.stringify(catalog, null, 2)], { type: 'application/json' }));
  const link = node('a'); link.href = url; link.download = CATALOG_NAME; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  notice('已准备下载当前清单。若要备份到 iCloud，请在文件保存界面选择对应文件夹。');
});

$('demo-button').addEventListener('click', () => {
  savedCatalog = catalog; demo = true; activeProject = null;
  const make = (id, projectId, title, original, date, note) => ({ id, project_id: projectId, title, original, archived_at: date, note, path: '原件/' + projectId + '/' + id + '-' + original });
  catalog = normalizeCatalog({ schema: SCHEMA, projects: { '网站改版': 'demo-website', '品牌设计': 'demo-brand', '年度计划': 'demo-plan' }, records: {
    'demo-03': make('demo-03', 'demo-website', '首页方案确认', '首页方案-确认版.pdf', '2026-11-08T10:26:35+08:00', '确认首页结构和配色，可以开始下一步制作。'),
    'demo-02': make('demo-02', 'demo-website', '第一版设计', '首页设计-v1.jpg', '2026-11-07T16:08:12+08:00', '记录第一轮设计，后续调整保留为新的归档。'),
    'demo-01': make('demo-01', 'demo-website', '项目需求', '网站改版需求.docx', '2026-11-05T09:18:04+08:00', ''),
    'demo-04': make('demo-04', 'demo-brand', '标志参考', '标志参考.png', '2026-11-06T14:02:08+08:00', '确认希望采用的视觉方向。'),
  } }); render();
});
$('leave-demo').addEventListener('click', () => { demo = false; catalog = savedCatalog; activeProject = null; notice(); render(); });

window.addEventListener('hashchange', () => { callbackQueue = callbackQueue.then(handleCallback); });

async function offline() {
  const target = $('offline-state');
  if (!('serviceWorker' in navigator) || !window.isSecureContext) {
    target.textContent = '离线访问需使用 HTTPS 正式网址'; return;
  }
  try {
    await navigator.serviceWorker.register('./sw.js');
    await navigator.serviceWorker.ready;
    target.textContent = '已准备离线访问';
    if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
  } catch { target.textContent = '离线准备未完成，请联网重新打开'; }
}

async function start() {
  $('site-address').textContent = new URL('./', location.href).href;
  try { configured = localStorage.getItem('archive-configured') === 'yes'; catalog = await readCatalog(); }
  catch (error) { notice(error.message, true); }
  render(); await handleCallback(); offline();
}
callbackQueue = start();
