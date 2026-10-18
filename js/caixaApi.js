const BASE_URL = 'https://servicebus2.caixa.gov.br/portaldeloterias/api';

export const JOGOS = {
  megasena: { nome: 'Mega-Sena', path: 'megasena', min: 1, max: 60, qtd: 6 },
  lotofacil: { nome: 'Lotofácil', path: 'lotofacil', min: 1, max: 25, qtd: 15 },
};

function parse(payload) {
  return {
    concurso: payload.numero,
    data: payload.dataApuracao,
    dezenas: payload.listaDezenas.map(Number).sort((a, b) => a - b),
  };
}

// Nota: quando a Caixa bloqueia um IP (excesso de pedidos), a resposta 403 vem
// sem cabeçalho CORS. O navegador então rejeita o fetch() com um erro genérico
// de rede ("Failed to fetch"), sem deixar ver o status 403 — CORS é checado só
// no navegador, então isso não dá pra distinguir aqui de "sem internet" ou
// "Caixa fora do ar". Por isso a proteção contra bloqueio mora em update.js,
// contando falhas seguidas, e não checando o código de status como no app
// desktop (onde o Python enxerga o 403 direto, sem CORS no meio).
async function fetchComRetentativas(url, tentativas = 2) {
  let ultimoErro;
  for (let i = 0; i < tentativas; i++) {
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return await resp.json();
    } catch (err) {
      ultimoErro = err;
      if (i < tentativas - 1) await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw ultimoErro;
}

export async function fetchLatest(jogo) {
  const payload = await fetchComRetentativas(`${BASE_URL}/${JOGOS[jogo].path}`);
  return parse(payload);
}

export async function fetchConcurso(jogo, numero) {
  try {
    const payload = await fetchComRetentativas(`${BASE_URL}/${JOGOS[jogo].path}/${numero}`, 2);
    if (!payload || !payload.listaDezenas) return null;
    return parse(payload);
  } catch {
    return null; // falha de 1 concurso não derruba a sincronização inteira
  }
}
