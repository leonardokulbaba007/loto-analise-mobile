import { JOGOS, fetchLatest, fetchConcurso } from './caixaApi.js';
import * as db from './db.js';

export class ErroSincronizacao extends Error {}

// Poucos pedidos simultâneos e uma pausa entre eles, para não sobrecarregar a
// API da Caixa. Se muitos pedidos seguidos falharem, para tudo: continuar
// insistindo só prolongaria um eventual bloqueio por excesso de requisições.
const MAX_WORKERS = 2;
const PAUSA_ENTRE_REQUISICOES_MS = 250;
const FALHAS_SEGUIDAS_LIMITE = 15;
const TAMANHO_LOTE_GRAVACAO = 25; // celular pode suspender a aba em segundo plano a qualquer momento

async function executarComLimite(itens, tarefa, concorrencia) {
  let proximo = 0;
  let falhasSeguidas = 0;
  let abortado = false;

  async function trabalhador() {
    while (proximo < itens.length && !abortado) {
      const idx = proximo++;
      const sucesso = await tarefa(itens[idx]);
      falhasSeguidas = sucesso ? 0 : falhasSeguidas + 1;
      if (falhasSeguidas >= FALHAS_SEGUIDAS_LIMITE) {
        abortado = true;
        return;
      }
      await new Promise((r) => setTimeout(r, PAUSA_ENTRE_REQUISICOES_MS));
    }
  }

  const trabalhadores = Array.from({ length: Math.min(concorrencia, itens.length) }, trabalhador);
  await Promise.all(trabalhadores);
  return abortado;
}

export async function syncJogo(jogo, onProgress) {
  let latest;
  try {
    latest = await fetchLatest(jogo);
  } catch {
    throw new ErroSincronizacao(
      'Não foi possível falar com a API da Caixa agora. Verifique a internet ou tente de novo em alguns minutos.',
    );
  }

  await db.upsertResultados(jogo, [latest]); // salva já, não espera o resto

  const existentes = await db.getExistingConcursos(jogo);
  const faltantes = [];
  for (let n = 1; n < latest.concurso; n++) {
    if (!existentes.has(n)) faltantes.push(n);
  }

  // Grava em lotes à medida que chegam: se a aba for suspensa ou fechada no
  // meio (comum em segundo plano no celular), só o lote em andamento se perde.
  let totalNovos = 1;
  let pendentes = [];
  const descarregarPendentes = async () => {
    if (!pendentes.length) return;
    await db.upsertResultados(jogo, pendentes);
    totalNovos += pendentes.length;
    pendentes = [];
  };

  let concluidos = 0;
  let abortado = false;
  try {
    abortado = await executarComLimite(faltantes, async (numero) => {
      const r = await fetchConcurso(jogo, numero);
      concluidos++;
      if (onProgress) onProgress(jogo, concluidos, faltantes.length);
      if (r) {
        pendentes.push(r);
        if (pendentes.length >= TAMANHO_LOTE_GRAVACAO) await descarregarPendentes();
        return true;
      }
      return false;
    }, MAX_WORKERS);
  } finally {
    await descarregarPendentes();
  }

  if (abortado) {
    throw new ErroSincronizacao(
      `Muitos pedidos seguidos falharam ao buscar ${JOGOS[jogo].nome} — a Caixa pode ter limitado as `
      + `requisições por um tempo. O que já foi baixado ficou salvo (${totalNovos - 1} de `
      + `${faltantes.length} concursos que faltavam). Tente de novo mais tarde.`,
    );
  }
  return totalNovos;
}

export async function syncAll(onProgress) {
  const resultado = {};
  for (const jogo of Object.keys(JOGOS)) {
    resultado[jogo] = await syncJogo(jogo, onProgress);
  }
  return resultado;
}
