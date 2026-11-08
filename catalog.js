export const SCHEMA = 'project-archive/2';
export const CATALOG_NAME = '项目档案清单.json';
const idPattern = /^[a-zA-Z0-9_-]{1,90}$/;

export function emptyCatalog() {
  return { schema: SCHEMA, projects: {}, records: {} };
}

function object(value, label) {
  // Shortcuts' Set Dictionary Value stores text values; imported maps can be JSON text.
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { throw new Error(label + '格式不正确。'); }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(label + '格式不正确。');
  return value;
}

function label(value, name, max, optional = false) {
  if (typeof value !== 'string') throw new Error(name + '格式不正确。');
  const result = value.trim().normalize('NFC');
  if ((!result && !optional) || [...result].length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(result)) {
    throw new Error(name + '为空或过长。');
  }
  return result;
}

function id(value) {
  if (typeof value !== 'string' || !idPattern.test(value)) throw new Error('档案编号格式不正确。');
  return value;
}

export function normalizeRecord(value) {
  const source = object(value, '文件记录');
  const record = {
    id: id(source.id), project_id: id(source.project_id),
    original: label(source.original, '原文件名', 255),
    title: label(source.title, '显示名称', 255),
    note: label(source.note ?? '', '文件说明', 2000, true),
    path: label(source.path, '原件路径', 600),
    archived_at: source.archived_at,
  };
  const prefix = '原件/' + record.project_id + '/' + record.id + '-';
  const filename = record.path.slice(prefix.length);
  if (!record.path.startsWith(prefix) || !filename || /[\\/:*?"<>|\u0000-\u001f]/u.test(filename) || filename === '.' || filename === '..') {
    throw new Error('原件路径不属于这个档案。');
  }
  if (typeof record.archived_at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(record.archived_at) || !Number.isFinite(Date.parse(record.archived_at))) {
    throw new Error('归档时间格式不正确。');
  }
  return record;
}

export function normalizeCatalog(value) {
  const source = object(value, '清单');
  if (source.schema !== SCHEMA) throw new Error('请选择新版「项目档案清单.json」。');
  const projects = object(source.projects, '项目列表');
  const records = object(source.records, '归档记录');
  const result = emptyCatalog();
  const projectIds = new Set();
  for (const [name, projectId] of Object.entries(projects)) {
    const cleanName = label(name, '项目名称', 64);
    if (projectIds.has(id(projectId)) || Object.hasOwn(result.projects, cleanName)) throw new Error('清单中有重复项目。');
    Object.defineProperty(result.projects, cleanName, { value: projectId, writable: true, enumerable: true, configurable: true });
    projectIds.add(projectId);
  }
  for (const [recordId, value] of Object.entries(records)) {
    const record = normalizeRecord(value);
    if (record.id !== recordId || !projectIds.has(record.project_id)) throw new Error('文件记录没有对应的项目。');
    result.records[record.id] = record;
  }
  return result;
}

export function applyEvent(catalog, value) {
  const event = object(value, '归档结果');
  if (event.schema !== SCHEMA || !['project', 'record'].includes(event.type)) throw new Error('无法识别这个归档结果。');
  const name = label(event.project, '项目名称', 64);
  const projectId = id(event.project_id);
  const result = normalizeCatalog(catalog);
  if ((Object.hasOwn(result.projects, name) && result.projects[name] !== projectId) ||
      Object.entries(result.projects).some(([other, value]) => other !== name && value === projectId)) {
    throw new Error('项目记录有变化，请重新导入 iCloud 清单。');
  }
  Object.defineProperty(result.projects, name, { value: projectId, writable: true, enumerable: true, configurable: true });
  if (event.type === 'record') {
    const record = normalizeRecord(event);
    if (record.project_id !== projectId) throw new Error('归档结果的项目不一致。');
    result.records[record.id] = record;
  }
  return result;
}

export function decodeEvent(encoded) {
  if (typeof encoded !== 'string' || encoded.length > 24000) throw new Error('归档结果过长，请从 iCloud 导入清单。');
  try {
    const bytes = Uint8Array.from(atob(encoded.replace(/\s/g, '')), char => char.charCodeAt(0));
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch { throw new Error('归档结果无法读取，请从 iCloud 导入清单。'); }
}

export function recordsFor(catalog, projectId, query = '') {
  const term = query.trim().toLocaleLowerCase();
  return Object.values(catalog.records)
    .filter(record => (!projectId || record.project_id === projectId) &&
      (!term || [record.title, record.original, record.note].some(value => value.toLocaleLowerCase().includes(term))))
    .sort((a, b) => Date.parse(b.archived_at) - Date.parse(a.archived_at) || b.id.localeCompare(a.id));
}

export function shortcutURL(name, input) {
  return 'shortcuts://run-shortcut?name=' + encodeURIComponent(name) +
    (input === undefined ? '' : '&input=text&text=' + encodeURIComponent(typeof input === 'string' ? input : JSON.stringify(input)));
}
