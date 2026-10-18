const DB_NAME = 'lotoanalise';
const DB_VERSION = 1;

let dbPromise = null;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('resultados')) {
        db.createObjectStore('resultados', { keyPath: ['jogo', 'concurso'] })
          .createIndex('porJogo', 'jogo');
      }
      if (!db.objectStoreNames.contains('sugestoes')) {
        db.createObjectStore('sugestoes', { keyPath: ['jogo', 'concurso'] })
          .createIndex('porJogo', 'jogo');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function getDb() {
  if (!dbPromise) dbPromise = openDb();
  return dbPromise;
}

async function store(nome, modo) {
  const db = await getDb();
  return db.transaction(nome, modo).objectStore(nome);
}

export async function getAllResultados(jogo) {
  const s = await store('resultados', 'readonly');
  return new Promise((resolve, reject) => {
    const req = s.index('porJogo').getAll(IDBKeyRange.only(jogo));
    req.onsuccess = () => resolve(req.result.sort((a, b) => a.concurso - b.concurso));
    req.onerror = () => reject(req.error);
  });
}

export async function getExistingConcursos(jogo) {
  const resultados = await getAllResultados(jogo);
  return new Set(resultados.map((r) => r.concurso));
}

export async function upsertResultados(jogo, registros) {
  if (!registros.length) return;
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction('resultados', 'readwrite');
    const s = t.objectStore('resultados');
    for (const r of registros) {
      s.put({ jogo, concurso: r.concurso, data: r.data, dezenas: r.dezenas });
    }
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

export async function getResultadoPorConcurso(jogo, concurso) {
  const s = await store('resultados', 'readonly');
  return new Promise((resolve, reject) => {
    const req = s.get([jogo, concurso]);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function getSugestao(jogo, concurso) {
  const s = await store('sugestoes', 'readonly');
  return new Promise((resolve, reject) => {
    const req = s.get([jogo, concurso]);
    req.onsuccess = () => resolve(req.result ? req.result.dezenas : null);
    req.onerror = () => reject(req.error);
  });
}

export async function saveSugestao(jogo, concurso, dezenas) {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction('sugestoes', 'readwrite');
    t.objectStore('sugestoes').put({ jogo, concurso, dezenas, geradaEm: new Date().toISOString() });
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

export async function getAllSugestoes(jogo) {
  const s = await store('sugestoes', 'readonly');
  return new Promise((resolve, reject) => {
    const req = s.index('porJogo').getAll(IDBKeyRange.only(jogo));
    req.onsuccess = () => resolve(req.result.sort((a, b) => a.concurso - b.concurso));
    req.onerror = () => reject(req.error);
  });
}
