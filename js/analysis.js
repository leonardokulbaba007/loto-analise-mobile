import { JOGOS } from './caixaApi.js';

export function frequencia(resultados, jogo) {
  const cfg = JOGOS[jogo];
  const contagem = new Map();
  for (let n = cfg.min; n <= cfg.max; n++) contagem.set(n, 0);
  for (const r of resultados) {
    for (const n of r.dezenas) contagem.set(n, (contagem.get(n) || 0) + 1);
  }
  return contagem;
}

export function atraso(resultados, jogo) {
  const cfg = JOGOS[jogo];
  const ultimaAparicao = new Map();
  for (let n = cfg.min; n <= cfg.max; n++) ultimaAparicao.set(n, null);
  resultados.forEach((r, idx) => {
    for (const n of r.dezenas) ultimaAparicao.set(n, idx);
  });
  const total = resultados.length;
  const atrasos = new Map();
  for (const [n, idx] of ultimaAparicao) {
    atrasos.set(n, idx !== null ? total - 1 - idx : total);
  }
  return atrasos;
}

export function distribuicaoParImpar(resultados) {
  const contagem = new Map();
  for (const r of resultados) {
    const pares = r.dezenas.filter((n) => n % 2 === 0).length;
    const impares = r.dezenas.length - pares;
    const chave = `${pares},${impares}`;
    contagem.set(chave, (contagem.get(chave) || 0) + 1);
  }
  return contagem;
}

export function distribuicaoSoma(resultados) {
  const somas = resultados.map((r) => r.dezenas.reduce((a, b) => a + b, 0));
  if (somas.length === 0) return { media: 0, desvio: 0, min: 0, max: 0 };
  const media = somas.reduce((a, b) => a + b, 0) / somas.length;
  const variancia = somas.reduce((acc, s) => acc + (s - media) ** 2, 0) / somas.length;
  return { media, desvio: Math.sqrt(variancia), min: Math.min(...somas), max: Math.max(...somas) };
}

export function graficoSoma(resultados, nFaixas = 20) {
  const somas = resultados.map((r) => r.dezenas.reduce((a, b) => a + b, 0));
  if (somas.length === 0) return [];
  const minimo = Math.min(...somas);
  const maximo = Math.max(...somas);
  const largura = Math.max(1, (maximo - minimo) / nFaixas);
  const contagens = new Array(nFaixas).fill(0);
  for (const s of somas) {
    const idx = Math.min(nFaixas - 1, Math.floor((s - minimo) / largura));
    contagens[idx]++;
  }
  const maior = Math.max(...contagens, 1);
  return contagens.map((contagem, i) => ({
    inicio: Math.round(minimo + i * largura),
    fim: Math.round(minimo + (i + 1) * largura),
    contagem,
    percentual: maior ? Math.round((contagem / maior) * 1000) / 10 : 0,
  }));
}

export function graficoParImpar(resultados, jogo) {
  const cfg = JOGOS[jogo];
  const contagem = distribuicaoParImpar(resultados);
  const maior = Math.max(...contagem.values(), 1);
  const lista = [];
  for (let pares = 0; pares <= cfg.qtd; pares++) {
    const impares = cfg.qtd - pares;
    const c = contagem.get(`${pares},${impares}`) || 0;
    lista.push({ pares, impares, contagem: c, percentual: maior ? Math.round((c / maior) * 1000) / 10 : 0 });
  }
  return lista;
}

export function resumo(resultados, jogo) {
  const freq = frequencia(resultados, jogo);
  const atr = atraso(resultados, jogo);
  const freqEntries = [...freq.entries()];
  const maisFrequentes = [...freqEntries].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const menosFrequentes = [...freqEntries].sort((a, b) => a[1] - b[1]).slice(0, 10);
  const maisAtrasados = [...atr.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const maximo = Math.max(...freq.values(), 0);
  const graficoFrequencia = [...freqEntries]
    .sort((a, b) => a[0] - b[0])
    .map(([numero, contagem]) => ({
      numero, contagem,
      percentual: maximo ? Math.round((contagem / maximo) * 1000) / 10 : 0,
    }));

  return {
    totalConcursos: resultados.length,
    maisFrequentes,
    menosFrequentes,
    maisAtrasados,
    soma: distribuicaoSoma(resultados),
    graficoFrequencia,
    graficoSoma: graficoSoma(resultados),
    graficoParImpar: graficoParImpar(resultados, jogo),
  };
}
