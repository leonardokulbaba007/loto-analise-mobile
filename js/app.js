import { JOGOS } from './caixaApi.js';
import * as db from './db.js';
import { syncAll, ErroSincronizacao } from './update.js';
import { resumo } from './analysis.js';
import {
  gerarSugestao, backtestSugestao, evolucaoAcertos,
  sugestaoParaProximo, garantirSugestoesProximas,
} from './suggest.js';

const POR_PAGINA_HISTORICO = 20;

const estado = {
  jogo: 'megasena',
  pagina: 'painel',
  sincronizando: false,
  sincronizadoOk: false,
  historico: novoFiltroHistorico(),
};

function novoFiltroHistorico() {
  return { pagina: 1, porPagina: POR_PAGINA_HISTORICO, concurso: '', dataInicio: '', dataFim: '' };
}

function fmt2(n) { return String(n).padStart(2, '0'); }
function formatarDezenas(dezenas) { return dezenas.map(fmt2).join(' '); }

function mostrarToast(msg, duracao = 3500) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), duracao);
}

// ---------- navegação ----------

function montarTabsJogo() {
  const container = document.getElementById('tabs-jogo');
  container.innerHTML = '';
  for (const [chave, cfg] of Object.entries(JOGOS)) {
    const btn = document.createElement('button');
    btn.textContent = cfg.nome;
    btn.className = chave === estado.jogo ? 'ativo' : '';
    btn.addEventListener('click', () => {
      if (estado.jogo === chave) return;
      estado.jogo = chave;
      estado.historico = novoFiltroHistorico();
      renderizarTudo();
    });
    container.appendChild(btn);
  }
}

function montarTabsPagina() {
  document.querySelectorAll('#tabs-pagina button').forEach((btn) => {
    btn.classList.toggle('ativo', btn.dataset.pagina === estado.pagina);
    btn.onclick = () => {
      estado.pagina = btn.dataset.pagina;
      renderizarTudo();
    };
  });
}

function renderizarTudo() {
  montarTabsJogo();
  montarTabsPagina();
  document.getElementById('pagina-painel').style.display = estado.pagina === 'painel' ? '' : 'none';
  document.getElementById('pagina-historico').style.display = estado.pagina === 'historico' ? '' : 'none';
  document.getElementById('pagina-comparativo').style.display = estado.pagina === 'comparativo' ? '' : 'none';

  if (estado.pagina === 'painel') renderizarPainel();
  else if (estado.pagina === 'historico') renderizarHistorico();
  else renderizarComparativo();
}

// ---------- painel ----------

let tokenPainel = 0;
async function renderizarPainel() {
  const meuToken = ++tokenPainel;
  const container = document.getElementById('pagina-painel');
  const jogo = estado.jogo;

  const resultados = await db.getAllResultados(jogo);
  if (meuToken !== tokenPainel) return;

  if (!resultados.length) {
    container.innerHTML = '<p>Ainda não há dados locais. Aguarde a sincronização inicial (a primeira pode levar alguns minutos).</p>';
    return;
  }

  const r = resumo(resultados, jogo);
  const ultimo = resultados[resultados.length - 1];

  let concursoSugestao = null;
  let sugestao;
  if (estado.sincronizadoOk && !estado.sincronizando) {
    const s = await sugestaoParaProximo(jogo, resultados);
    if (meuToken !== tokenPainel) return;
    concursoSugestao = s.concurso;
    sugestao = s.dezenas;
  } else {
    sugestao = gerarSugestao(resultados, jogo);
  }

  const backtest = backtestSugestao(resultados, sugestao);
  const evolucao = evolucaoAcertos(resultados, sugestao, jogo);
  const somaSugestao = sugestao.reduce((a, b) => a + b, 0);
  const paresSugestao = sugestao.filter((n) => n % 2 === 0).length;

  container.innerHTML = `
    <p class="status">Base local: ${resultados.length} concursos. Último concurso: <strong>${ultimo.concurso}</strong>
      (${ultimo.data}) — dezenas ${formatarDezenas(ultimo.dezenas)}</p>

    <div class="cartao">
      <h2>Sugestão do sistema${concursoSugestao ? ` (${concursoSugestao})` : ''}</h2>
      <div class="numeros">${sugestao.map((n) => `<div class="bola">${fmt2(n)}</div>`).join('')}</div>
      <button class="botao" id="btn-nova-sugestao">Gerar outra sugestão</button>
      ${concursoSugestao
        ? `<p class="status">Sugestão salva. Quando o concurso ${concursoSugestao} for sorteado, o resultado
             aparece na aba Comparativo.</p>`
        : `<p class="status">Sem sincronização confirmada com a Caixa: esta sugestão não foi salva.
             <button class="botao secundario" id="btn-tentar-sync">Tentar de novo</button></p>`}

      <h3>Como essa combinação teria se saído no histórico</h3>
      <p>Em ${backtest.totalConcursosTestados} concursos já sorteados, o máximo de acertos foi
        <strong>${backtest.maximoJaAcertado}</strong> número(s) (${backtest.vezesNoMaximo}x).</p>
      <table>
        <tr><th>Acertos</th><th>Concursos</th></tr>
        ${backtest.histograma.map(([a, q]) => `<tr><td>${a}</td><td>${q}</td></tr>`).join('')}
      </table>
      <p class="status">Essa distribuição é estatisticamente equivalente à de uma combinação escolhida ao acaso.</p>

      <h3>Evolução dos acertos ao longo do tempo</h3>
      <div class="grafico-evolucao">
        <div class="linha-esperada" style="bottom:${evolucao.percentualEsperado}%">
          <span>esperado só pelo acaso: ${evolucao.esperado}</span>
        </div>
        <div class="grafico-barras">
          ${evolucao.blocos.map((b) => `
            <div class="grafico-coluna">
              <div class="grafico-barra" style="height:${b.percentual}%"
                   title="Concursos ${b.concursoInicial}–${b.concursoFinal}: média ${b.mediaAcertos.toFixed(2)}"></div>
            </div>`).join('')}
        </div>
      </div>
      <p class="status">Do mais antigo (${evolucao.blocos[0].concursoInicial}) ao mais recente
        (${evolucao.blocos[evolucao.blocos.length - 1].concursoFinal}). As barras oscilam em torno da linha
        tracejada, sem tendência real de subir.</p>
    </div>

    <div class="cartao">
      <h3>Frequência de cada dezena</h3>
      <div class="grafico-barras">
        ${r.graficoFrequencia.map((item) => `
          <div class="grafico-coluna">
            <div class="grafico-barra" style="height:${item.percentual}%"
                 title="Número ${fmt2(item.numero)}: ${item.contagem}x"></div>
            <span class="grafico-label">${fmt2(item.numero)}</span>
          </div>`).join('')}
      </div>
      <p class="status">Toque numa barra para ver o número e a quantidade de vezes sorteado.</p>
    </div>

    <div class="duas-colunas">
      <div class="cartao">
        <h3>Mais frequentes</h3>
        <table>${r.maisFrequentes.map(([n, q]) => `<tr><td>${fmt2(n)}</td><td>${q}x</td></tr>`).join('')}</table>
      </div>
      <div class="cartao">
        <h3>Mais "atrasados"</h3>
        <table>${r.maisAtrasados.map(([n, q]) => `<tr><td>${fmt2(n)}</td><td>${q}c</td></tr>`).join('')}</table>
      </div>
    </div>

    <div class="cartao">
      <h3>Distribuição da soma das dezenas</h3>
      <div class="grafico-barras">
        ${r.graficoSoma.map((item) => `
          <div class="grafico-coluna">
            <div class="grafico-barra" style="height:${item.percentual}%"
                 title="Soma entre ${item.inicio} e ${item.fim}: ${item.contagem} concursos"></div>
            <span class="grafico-label-h">${item.inicio}</span>
          </div>`).join('')}
      </div>
      <p class="status">Média histórica: ${r.soma.media.toFixed(1)} (min ${r.soma.min}, max ${r.soma.max}).
        Soma da sugestão atual: ${somaSugestao}.</p>
    </div>

    <div class="cartao">
      <h3>Pares e ímpares por concurso</h3>
      <div class="grafico-barras">
        ${r.graficoParImpar.map((item) => `
          <div class="grafico-coluna">
            <div class="grafico-barra" style="height:${item.percentual}%"
                 title="${item.pares} pares / ${item.impares} ímpares: ${item.contagem} concursos"></div>
            <span class="grafico-label-h">${item.pares}p/${item.impares}i</span>
          </div>`).join('')}
      </div>
      <p class="status">A sugestão atual tem ${paresSugestao} números pares
        e ${sugestao.length - paresSugestao} ímpares.</p>
    </div>
  `;

  document.getElementById('btn-nova-sugestao').addEventListener('click', async () => {
    if (estado.sincronizadoOk && !estado.sincronizando) {
      await sugestaoParaProximo(jogo, resultados, true);
    }
    renderizarPainel();
  });

  const btnTentar = document.getElementById('btn-tentar-sync');
  if (btnTentar) btnTentar.addEventListener('click', () => iniciarSync());
}

// ---------- histórico ----------

let tokenHistorico = 0;
async function renderizarHistorico() {
  const meuToken = ++tokenHistorico;
  const container = document.getElementById('pagina-historico');
  const jogo = estado.jogo;
  const h = estado.historico;

  const todos = await db.getAllResultados(jogo);
  if (meuToken !== tokenHistorico) return;

  let lista;
  let totalPaginas = 1;
  const buscaConcursoAtiva = Boolean(h.concurso);

  if (buscaConcursoAtiva) {
    const concursoNum = parseInt(h.concurso, 10);
    const achado = todos.find((r) => r.concurso === concursoNum);
    lista = achado ? [achado] : [];
  } else {
    let filtrados = [...todos].reverse();
    if (h.dataInicio || h.dataFim) {
      filtrados = filtrados.filter((r) => {
        const [d, m, a] = r.data.split('/');
        const iso = `${a}-${m}-${d}`;
        if (h.dataInicio && iso < h.dataInicio) return false;
        if (h.dataFim && iso > h.dataFim) return false;
        return true;
      });
    }
    totalPaginas = Math.max(1, Math.ceil(filtrados.length / h.porPagina));
    h.pagina = Math.min(Math.max(1, h.pagina), totalPaginas);
    const inicio = (h.pagina - 1) * h.porPagina;
    lista = filtrados.slice(inicio, inicio + h.porPagina);
  }

  const temFiltro = Boolean(h.concurso || h.dataInicio || h.dataFim);

  container.innerHTML = `
    <form class="busca" id="form-busca">
      <input type="number" id="input-concurso" placeholder="Nº concurso" value="${h.concurso}">
      <label>De <input type="date" id="input-data-inicio" value="${h.dataInicio}"></label>
      <label>Até <input type="date" id="input-data-fim" value="${h.dataFim}"></label>
      <button type="submit" class="botao" style="margin:0;">Buscar</button>
      ${temFiltro ? '<button type="button" class="botao secundario" id="btn-limpar" style="margin:0;">Limpar</button>' : ''}
    </form>
    ${lista.length === 0
      ? `<p>${buscaConcursoAtiva ? 'Concurso não encontrado na base local.' : 'Nenhum concurso encontrado nesse período.'}</p>`
      : `<div class="cartao">${lista.map((r, i) => `
          <div style="${i < lista.length - 1 ? 'margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid #262626;' : ''}">
            <strong>Concurso ${r.concurso}</strong> — ${r.data}
            <div class="numeros">${r.dezenas.map((n) => `<div class="bola pequena">${fmt2(n)}</div>`).join('')}</div>
          </div>`).join('')}</div>`}
    ${!buscaConcursoAtiva && lista.length > 0 ? `
      <div class="paginacao">
        <button id="pg-primeira" ${h.pagina <= 1 ? 'disabled' : ''}>« Mais recente</button>
        <button id="pg-anteriores" ${h.pagina >= totalPaginas ? 'disabled' : ''}>‹ Anteriores</button>
        <span>Pág. ${h.pagina} de ${totalPaginas}</span>
        <button id="pg-recentes" ${h.pagina <= 1 ? 'disabled' : ''}>Recentes ›</button>
        <button id="pg-ultima" ${h.pagina >= totalPaginas ? 'disabled' : ''}>Antigo »</button>
      </div>` : ''}
  `;

  document.getElementById('form-busca').addEventListener('submit', (e) => {
    e.preventDefault();
    h.concurso = document.getElementById('input-concurso').value;
    h.dataInicio = document.getElementById('input-data-inicio').value;
    h.dataFim = document.getElementById('input-data-fim').value;
    h.pagina = 1;
    renderizarHistorico();
  });

  const btnLimpar = document.getElementById('btn-limpar');
  if (btnLimpar) btnLimpar.addEventListener('click', () => {
    estado.historico = novoFiltroHistorico();
    renderizarHistorico();
  });

  const ligarPagina = (id, novaPagina) => {
    const btn = document.getElementById(id);
    if (btn) btn.addEventListener('click', () => { h.pagina = novaPagina; renderizarHistorico(); });
  };
  ligarPagina('pg-primeira', 1);
  ligarPagina('pg-anteriores', h.pagina + 1);
  ligarPagina('pg-recentes', h.pagina - 1);
  ligarPagina('pg-ultima', totalPaginas);
}

// ---------- comparativo ----------

let tokenComparativo = 0;
async function renderizarComparativo() {
  const meuToken = ++tokenComparativo;
  const container = document.getElementById('pagina-comparativo');
  const jogo = estado.jogo;

  const [resultados, sugestoes] = await Promise.all([db.getAllResultados(jogo), db.getAllSugestoes(jogo)]);
  if (meuToken !== tokenComparativo) return;

  if (!sugestoes.length) {
    container.innerHTML = `<p>Ainda não há sugestões salvas para comparar. Abra o Painel com a sincronização
      em dia para gerar a primeira.</p>`;
    return;
  }

  const oficiais = new Map(resultados.map((r) => [r.concurso, r]));
  const sugestoesMap = new Map(sugestoes.map((s) => [s.concurso, s]));
  const ultimoConcurso = Math.max(
    sugestoes[sugestoes.length - 1].concurso,
    resultados.length ? resultados[resultados.length - 1].concurso : 0,
  );
  const primeiroConcurso = sugestoes[0].concurso;

  const linhas = [];
  for (let c = ultimoConcurso; c >= primeiroConcurso; c--) {
    const s = sugestoesMap.get(c);
    const o = oficiais.get(c);
    if (!s && !o) continue;
    let acertos = null;
    let dezenasAcertadas = null;
    if (s && o) {
      const comuns = s.dezenas.filter((n) => o.dezenas.includes(n)).sort((a, b) => a - b);
      acertos = comuns.length;
      dezenasAcertadas = comuns;
    }
    linhas.push({ concurso: c, data: o ? o.data : null, oficial: o ? o.dezenas : null, sugestao: s ? s.dezenas : null, acertos, dezenasAcertadas });
  }

  container.innerHTML = `
    <div class="cartao" style="overflow-x:auto;">
      <table>
        <tr><th>Concurso</th><th>Data</th><th>Oficial</th><th>Sugestão</th><th>Acertos</th></tr>
        ${linhas.map((l) => `
          <tr>
            <td>${l.concurso}</td>
            <td>${l.data || '—'}</td>
            <td>${l.oficial ? formatarDezenas(l.oficial) : 'Aguardando sorteio'}</td>
            <td>${l.sugestao ? formatarDezenas(l.sugestao) : 'Sem sugestão'}</td>
            <td>${l.acertos === null ? '—' : l.acertos}</td>
          </tr>`).join('')}
      </table>
    </div>
    <button class="botao" id="btn-exportar-csv">Exportar CSV</button>
  `;

  document.getElementById('btn-exportar-csv').addEventListener('click', () => exportarCsv(jogo, linhas));
}

function exportarCsv(jogo, linhas) {
  const cabecalho = ['Concurso', 'Data', 'Resultado oficial', 'Sugestao', 'Acertos', 'Dezenas acertadas'];
  const corpo = linhas.map((l) => [
    l.concurso,
    l.data || '',
    l.oficial ? formatarDezenas(l.oficial) : 'Aguardando sorteio',
    l.sugestao ? formatarDezenas(l.sugestao) : 'Sem sugestao',
    l.acertos === null ? '' : l.acertos,
    l.dezenasAcertadas ? formatarDezenas(l.dezenasAcertadas) : '',
  ]);
  const csv = [cabecalho, ...corpo]
    .map((linha) => linha.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';'))
    .join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `comparativo_${jogo}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------- sincronização ----------

async function iniciarSync() {
  if (estado.sincronizando) return;
  estado.sincronizando = true;
  const banner = document.getElementById('sincronizando-banner');
  banner.classList.add('ativo');
  banner.textContent = 'Sincronizando com a Caixa...';

  // A primeira sincronização pode levar minutos (milhares de concursos). Sem isso,
  // a tela ficaria parada em "sem dados" até terminar tudo — aqui ela vai mostrando
  // o que já chegou, a cada poucos segundos. Pula a vez se o usuário estiver
  // digitando em algum campo, pra não apagar o que ele já escreveu.
  const atualizarTelaPeriodicamente = setInterval(() => {
    const emFoco = document.activeElement;
    if (emFoco && (emFoco.tagName === 'INPUT' || emFoco.tagName === 'TEXTAREA')) return;
    renderizarTudo();
  }, 4000);

  try {
    await syncAll((jogo, done, total) => {
      banner.textContent = `Sincronizando ${JOGOS[jogo].nome}: ${done}/${total}`;
    });
    estado.sincronizadoOk = true;
    await garantirSugestoesProximas();
    mostrarToast('Resultados atualizados!');
  } catch (err) {
    console.error(err);
    if (err instanceof ErroSincronizacao) {
      mostrarToast(err.message, 7000);
    } else {
      mostrarToast('Não foi possível sincronizar com a Caixa. Verifique a internet.');
    }
  } finally {
    clearInterval(atualizarTelaPeriodicamente);
    estado.sincronizando = false;
    banner.classList.remove('ativo');
    renderizarTudo();
  }
}

// ---------- instalação como app ----------

function configurarInstalacao() {
  let deferredPrompt = null;
  const banner = document.getElementById('instalar-banner');

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    banner.classList.add('ativo');
  });

  document.getElementById('btn-instalar').addEventListener('click', async () => {
    banner.classList.remove('ativo');
    if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
    }
  });

  window.addEventListener('appinstalled', () => banner.classList.remove('ativo'));
}

// ---------- inicialização ----------

function init() {
  montarTabsJogo();
  montarTabsPagina();
  renderizarTudo();
  iniciarSync();
  configurarInstalacao();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch((err) => console.error('Falha ao registrar service worker', err));
  }
}

init();
