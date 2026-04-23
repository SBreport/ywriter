// projects-db.js — 프로젝트 CRUD + IndexedDB 이미지 저장소
// 전역 API: window.ProjectsDB

(function() {
  const PROJECTS_INDEX_KEY = 'yw-projects';
  const PROJECT_KEY_PREFIX = 'yw-project-';
  const DB_NAME = 'ywriter';
  const DB_VERSION = 1;
  const IMG_STORE = 'images';
  const WAREHOUSE_PROJECT_ID = '__warehouse__';

  // ── IndexedDB ──
  let _dbPromise = null;
  function openDB() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(IMG_STORE)) {
          const store = db.createObjectStore(IMG_STORE, { keyPath: 'id' });
          store.createIndex('projectId', 'projectId', { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return _dbPromise;
  }

  async function saveImage(projectId, blob, kind, filename) {
    const db = await openDB();
    const id = uuid();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IMG_STORE, 'readwrite');
      tx.objectStore(IMG_STORE).add({
        id, projectId, kind, blob, filename: filename || id + '.png',
        createdAt: new Date().toISOString()
      });
      tx.oncomplete = () => resolve(id);
      tx.onerror = () => reject(tx.error);
    });
  }

  async function loadImage(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IMG_STORE, 'readonly');
      const req = tx.objectStore(IMG_STORE).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function loadImageUrl(id) {
    const rec = await loadImage(id);
    if (!rec) return null;
    return URL.createObjectURL(rec.blob);
  }

  async function deleteImage(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IMG_STORE, 'readwrite');
      tx.objectStore(IMG_STORE).delete(id);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  async function listImagesByProject(projectId) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IMG_STORE, 'readonly');
      const idx = tx.objectStore(IMG_STORE).index('projectId');
      const req = idx.getAll(projectId);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async function deleteImagesByProject(projectId) {
    const imgs = await listImagesByProject(projectId);
    for (const img of imgs) await deleteImage(img.id);
  }

  // ── Utility ──
  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  function nowISO() { return new Date().toISOString(); }

  // ── Project index ──
  function getIndex() {
    try {
      return JSON.parse(localStorage.getItem(PROJECTS_INDEX_KEY) || '[]');
    } catch { return []; }
  }

  function saveIndex(idx) {
    localStorage.setItem(PROJECTS_INDEX_KEY, JSON.stringify(idx));
  }

  function updateIndexEntry(project) {
    const idx = getIndex();
    const existing = idx.findIndex(p => p.id === project.id);
    const entry = {
      id: project.id,
      title: project.thumbResearch?.myVideoTitle || project.name || '제목 없음',
      updatedAt: project.updatedAt,
      progress: {
        c1: !!project.thumbResearch?.completed,
        c2: !!project.scriptWriting?.completed,
        c3: !!project.brollPlanning?.completed
      }
    };
    if (existing >= 0) idx[existing] = entry;
    else idx.unshift(entry);
    saveIndex(idx);
  }

  // ── Project CRUD ──
  function blankProject(name) {
    const id = uuid();
    const now = nowISO();
    return {
      id,
      name: name || '새 프로젝트',
      createdAt: now,
      updatedAt: now,
      thumbResearch: {
        references: [],
        myThumbTitle: '',
        myThumbImageId: null,
        myVideoTitle: name || '',
        audience: '',
        purpose: '',
        completed: false
      },
      scriptWriting: {
        benchmarks: [],
        sections: [],
        columnRatio: 50,
        hookBannerDismissed: false,
        completed: false
      },
      brollPlanning: {
        sectionsBroll: [],
        columnRatio: 60,
        completed: false
      },
      editPlanning: {
        completed: false,
        briefExpanded: true,
        brief: {
          targetDuration: '',
          tone: '',
          references: [],
          subtitleStyle: '',
          bgmMood: '',
          colorLook: '',
          transitionStyle: '',
          deadline: '',
          misc: ''
        },
        sectionsEdit: []
      },
      version: 1
    };
  }

  function create(name) {
    const p = blankProject(name);
    save(p);
    return p;
  }

  function save(project) {
    project.updatedAt = nowISO();
    localStorage.setItem(PROJECT_KEY_PREFIX + project.id, JSON.stringify(project));
    updateIndexEntry(project);
  }

  function load(id) {
    try {
      const raw = localStorage.getItem(PROJECT_KEY_PREFIX + id);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  async function remove(id) {
    localStorage.removeItem(PROJECT_KEY_PREFIX + id);
    const idx = getIndex().filter(p => p.id !== id);
    saveIndex(idx);
    await deleteImagesByProject(id);
  }

  async function duplicate(id) {
    const src = load(id);
    if (!src) return null;
    const copy = JSON.parse(JSON.stringify(src));
    copy.id = uuid();
    copy.name = (src.name || '프로젝트') + ' (복사)';
    copy.createdAt = nowISO();
    copy.updatedAt = nowISO();
    // Copy images to new project
    if (copy.thumbResearch?.references) {
      for (const ref of copy.thumbResearch.references) {
        if (ref.imageId) {
          const rec = await loadImage(ref.imageId);
          if (rec) {
            ref.imageId = await saveImage(copy.id, rec.blob, 'ref', rec.filename);
          }
        }
      }
    }
    if (copy.thumbResearch?.myThumbImageId) {
      const rec = await loadImage(copy.thumbResearch.myThumbImageId);
      if (rec) {
        copy.thumbResearch.myThumbImageId = await saveImage(copy.id, rec.blob, 'my-thumb', rec.filename);
      }
    }
    save(copy);
    return copy;
  }

  function list() {
    // Hide warehouse project from regular listings
    return getIndex().filter(p => p.id !== WAREHOUSE_PROJECT_ID);
  }

  function listWithWarehouse() {
    return getIndex();
  }

  function isWarehouseProject(id) {
    return id === WAREHOUSE_PROJECT_ID;
  }

  function getOrCreateWarehouseProject() {
    let p = load(WAREHOUSE_PROJECT_ID);
    if (!p) {
      const now = nowISO();
      p = {
        id: WAREHOUSE_PROJECT_ID,
        name: '창고 (직접 수집)',
        _isWarehouse: true,
        createdAt: now,
        updatedAt: now,
        thumbResearch: {
          references: [],
          myThumbTitle: '', myThumbImageId: null,
          myVideoTitle: '', audience: '', purpose: '',
          completed: false
        },
        scriptWriting: { benchmarks: [], sections: [], columnRatio: 50, hookBannerDismissed: false, completed: false },
        brollPlanning: { sectionsBroll: [], columnRatio: 60, completed: false },
        editPlanning: {
          completed: false, briefExpanded: true,
          brief: { targetDuration: '', tone: '', references: [], subtitleStyle: '', bgmMood: '', colorLook: '', transitionStyle: '', deadline: '', misc: '' },
          sectionsEdit: []
        },
        version: 1
      };
      save(p);
    }
    return p;
  }

  // ── v2 → v3 migration ──
  function detectV2Data() {
    const b = localStorage.getItem('broll-autosave');
    const w = localStorage.getItem('writing-autosave');
    const out = [];
    if (b) { try { out.push({ kind: 'broll', data: JSON.parse(b) }); } catch {} }
    if (w) { try { out.push({ kind: 'writing', data: JSON.parse(w) }); } catch {} }
    return out;
  }

  function migrateV2(item) {
    const p = blankProject(item.data.videoTitle || '가져온 작업');
    p.thumbResearch.myVideoTitle = item.data.videoTitle || '';
    p.thumbResearch.myThumbTitle = item.data.thumbnail || '';
    p.thumbResearch.audience = item.data.target || '';
    p.thumbResearch.purpose = item.data.purpose || '';
    if (p.thumbResearch.myVideoTitle && p.thumbResearch.audience && p.thumbResearch.purpose) {
      p.thumbResearch.completed = true;
    }
    if (item.data.sections?.length) {
      p.scriptWriting.sections = item.data.sections.map(s => ({
        level: s.level || 2, title: s.title, bodyMd: s.bodyMd
      }));
      p.scriptWriting.columnRatio = item.data.columnRatio || 50;
      p.scriptWriting.completed = true;
      if (item.kind === 'broll') {
        p.brollPlanning.sectionsBroll = item.data.sections.map(s => ({
          tags: s.tags || [], customTags: s.customTags || [], memo: s.memo || ''
        }));
      }
    }
    save(p);
    return p;
  }

  function clearV2() {
    localStorage.removeItem('broll-autosave');
    localStorage.removeItem('writing-autosave');
  }

  // ── Public API ──
  window.ProjectsDB = {
    // Project CRUD
    create, save, load, remove, duplicate, list, listWithWarehouse,
    blankProject,
    // Warehouse project
    getOrCreateWarehouseProject, isWarehouseProject, WAREHOUSE_PROJECT_ID,
    // Images
    saveImage, loadImage, loadImageUrl, deleteImage, listImagesByProject,
    // Migration
    detectV2Data, migrateV2, clearV2,
    // Utility
    uuid, nowISO
  };
})();
