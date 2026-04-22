// folders-db.js — 썸네일 창고 폴더 구조 관리
// 2단 트리: parent → child (최대 2 depth)
// 전역 API: window.FoldersDB

(function() {
  const KEY = 'yw-warehouse-folders';

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY) || '[]'); }
    catch { return []; }
  }

  function save(list) {
    localStorage.setItem(KEY, JSON.stringify(list));
  }

  function list() { return load(); }

  function get(id) {
    return load().find(f => f.id === id) || null;
  }

  function create(name, parentId) {
    const folders = load();
    // Enforce max 2 levels: parent can't have grandparent
    if (parentId) {
      const parent = folders.find(f => f.id === parentId);
      if (!parent) throw new Error('NO_PARENT');
      if (parent.parentId) throw new Error('MAX_DEPTH'); // already child of another
    }
    const f = {
      id: ProjectsDB.uuid(),
      name: (name || '새 폴더').trim() || '새 폴더',
      parentId: parentId || null,
      createdAt: ProjectsDB.nowISO()
    };
    folders.push(f);
    save(folders);
    return f;
  }

  function rename(id, newName) {
    const folders = load();
    const f = folders.find(x => x.id === id);
    if (!f) return;
    f.name = (newName || '').trim() || f.name;
    save(folders);
  }

  function remove(id) {
    const folders = load();
    // Collect this id + all descendants
    const idsToRemove = new Set([id]);
    for (const f of folders) {
      if (f.parentId === id) idsToRemove.add(f.id);
    }
    const next = folders.filter(f => !idsToRemove.has(f.id));
    save(next);
    // Un-assign refs from removed folders
    _detachRefsFromFolders([...idsToRemove]);
    return [...idsToRemove];
  }

  function _detachRefsFromFolders(folderIds) {
    const projects = ProjectsDB.list();
    for (const entry of projects) {
      const p = ProjectsDB.load(entry.id);
      if (!p) continue;
      let changed = false;
      for (const ref of p.thumbResearch?.references || []) {
        if (ref.folderId && folderIds.includes(ref.folderId)) {
          ref.folderId = null;
          changed = true;
        }
      }
      if (changed) ProjectsDB.save(p);
    }
  }

  function assignRefToFolder(projectId, refId, folderId) {
    const p = ProjectsDB.load(projectId);
    if (!p) return;
    const ref = p.thumbResearch?.references.find(r => r.id === refId);
    if (!ref) return;
    ref.folderId = folderId || null;
    ProjectsDB.save(p);
  }

  // Get folder + all direct children IDs (for "show all descendants" view)
  function getFolderAndDescendants(id) {
    if (!id) return [];
    const folders = load();
    const ids = [id];
    for (const f of folders) if (f.parentId === id) ids.push(f.id);
    return ids;
  }

  // Tree structure: [{ ...parent, children: [child, child] }]
  function tree() {
    const folders = load();
    const parents = folders.filter(f => !f.parentId);
    return parents.map(p => ({
      ...p,
      children: folders.filter(c => c.parentId === p.id)
    }));
  }

  window.FoldersDB = {
    list, get, create, rename, remove,
    assignRefToFolder, getFolderAndDescendants, tree
  };
})();
