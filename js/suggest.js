import { JOGOS } from './caixaApi.js';
import * as db from './db.js';
import { frequencia, distribuicaoSoma, distribuicaoParImpar } from './analysis.js';

function escolhaPonderada(pool, pesos) {
  const total = pesos.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= pesos[i];
    if (r <= 0) return i;
  }
  return pool.length - 1;
}

/**
 * Gera uma aposta combinando dois filtros estatísticos sobre o histórico:
 * sorteio ponderado pela frequência histórica + preferência por soma e
 * paridade dentro da faixa mais comum. É um filtro sobre padrões passados,
 * não uma previsão — sorteios de loteria são eventos independentes.
 */
export function gerarSugestao(resultados, jogo, tentativas = 200) {
  const cfg = JOGOS[jogo];
  const freq = frequencia(resultados, jogo);
  const numeros = [...freq.keys()];
  const pesosBase = numeros.map((n) => freq.get(n) + 1);

  const somaInfo = distribuicaoSoma(resultados);
  const faixaSoma = [somaInfo.media - somaInfo.desvio, somaInfo.media + somaInfo.desvio];

  const parImparContagem = distribuicaoParImpar(resultados);
  let alvoPares = null;
  let maiorContagem = -1;
  for (const [chave, c] of parImparContagem) {
    if (c > maiorContagem) {
      maiorContagem = c;
      alvoPares = parseInt(chave.split(',')[0], 10);
    }
  }

  let melhorCandidato = null;
  let melhorDistancia = null;

  for (let t = 0; t < tentativas; t++) {
    const pool = [...numeros];
    const pesos = [...pesosBase];
    const candidato = new Set();
    while (candidato.size < cfg.qtd) {
      const idx = escolhaPonderada(pool, pesos);
      candidato.add(pool[idx]);
      pool.splice(idx, 1);
      pesos.splice(idx, 1);
    }

    const lista = [...candidato].sort((a, b) => a - b);
    const soma = lista.reduce((a, b) => a + b, 0);
    const pares = lista.filter((n) => n % 2 === 0).length;

    const dentroDaSoma = soma >= faixaSoma[0] && soma <= faixaSoma[1];
    const paresOk = alvoPares === null || pares === alvoPares;

    if (dentroDaSoma && paresOk) return lista;

    const distancia = Math.abs(soma - somaInfo.media) + (paresOk ? 0 : 2);
    if (melhorDistancia === null || distancia < melhorDistancia) {
      melhorDistancia = distancia;
      melhorCandidato = lista;
    }
  }

  return melhorCandidato;
}

export function backtestSugestao(resultados, sugestao) {
  const sugestaoSet = new Set(sugestao);
  const contagemAcertos = new Map();
  for (const r of resultados) {
    const acertos = r.dezenas.filter((n) => sugestaoSet.has(n)).length;
    contagemAcertos.set(acertos, (contagemAcertos.get(acertos) || 0) + 1);
  }
  const total = resultados.length;
  const chaves = [...contagemAcertos.keys()];
  const maxAcertos = chaves.length ? Math.max(...chaves) : 0;
  return {
    totalConcursosTestados: total,
    histograma: [...contagemAcertos.entries()].sort((a, b) => a[0] - b[0]),
    maximoJaAcertado: maxAcertos,
    vezesNoMaximo: contagemAcertos.get(maxAcertos) || 0,
  };
}

/**
 * Agrupa o histórico em blocos consecutivos e mostra a média de acertos da
 * sugestão em cada bloco, com a média esperada só pelo acaso (hipergeométrica)
 * como referência, para visualizar se há alguma tendência real ao longo do tempo.
 */
export function evolucaoAcertos(resultados, sugestao, jogo, nBlocos = 60) {
  const cfg = JOGOS[jogo];
  const esperado = (cfg.qtd * cfg.qtd) / (cfg.max - cfg.min + 1);
  const total = resultados.length;
  if (total === 0) {
    return { blocos: [], esperado: Math.round(esperado * 100) / 100, percentualEsperado: 0 };
  }

  const sugestaoSet = new Set(sugestao);
  const tamanhoBloco = Math.max(1, Math.ceil(total / nBlocos));

  const blocos = [];
  for (let i = 0; i < total; i += tamanhoBloco) {
    const fatia = resultados.slice(i, i + tamanhoBloco);
    const acertos = fatia.map((r) => r.dezenas.filter((n) => sugestaoSet.has(n)).length);
    const media = acertos.reduce((a, b) => a + b, 0) / acertos.length;
    blocos.push({
      mediaAcertos: media,
      concursoInicial: fatia[0].concurso,
      concursoFinal: fatia[fatia.length - 1].concurso,
    });
  }

  const maiorValor = Math.max(...blocos.map((b) => b.mediaAcertos));
  const escala = Math.max(maiorValor, esperado) * 1.15 || 1;
  for (const b of blocos) {
    b.percentual = Math.round((b.mediaAcertos / escala) * 1000) / 10;
  }

  return {
    blocos,
    esperado: Math.round(esperado * 100) / 100,
    percentualEsperado: Math.round((esperado / escala) * 1000) / 10,
  };
}

export async function sugestaoParaProximo(jogo, resultados, nova = false) {
  const proximo = resultados[resultados.length - 1].concurso + 1;
  let dezenas = nova ? null : await db.getSugestao(jogo, proximo);
  if (!dezenas) {
    dezenas = gerarSugestao(resultados, jogo);
    await db.saveSugestao(jogo, proximo, dezenas);
  }
  return { concurso: proximo, dezenas };
}

export async function garantirSugestoesProximas() {
  for (const jogo of Object.keys(JOGOS)) {
    const resultados = await db.getAllResultados(jogo);
    if (resultados.length) await sugestaoParaProximo(jogo, resultados);
  }
}
