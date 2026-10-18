# Loto Análise — versão celular (PWA)

Mesma ideia do app do notebook (estatísticas, sugestão de aposta, histórico de
concursos, comparativo sugestão × resultado oficial), só que roda direto no
navegador do Android como um app instalável, sem precisar do notebook ligado.

Tudo roda no próprio celular: a sincronização com a API da Caixa, os cálculos e
o armazenamento (IndexedDB). O celular e o notebook **não compartilham dados** —
cada um guarda seu próprio histórico de sugestões.

## Por que precisa ser publicado num site

Para o Android oferecer "Instalar app" e o Service Worker funcionar (que é o
que permite abrir offline com os dados já baixados), o navegador exige HTTPS.
`file://` ou IP local não bastam. É preciso publicar esses arquivos em algum
lugar com HTTPS — gratuito, não precisa de servidor próprio.

Duas opções simples (escolha uma):

### Opção A — Netlify Drop (mais simples, sem conta obrigatória)
1. Acesse https://app.netlify.com/drop no navegador.
2. Arraste a pasta `mobile` inteira para a página.
3. Em segundos ela te dá um link `https://algumnome.netlify.app`.
4. Abra esse link no Chrome do celular.

Sem login, mas o link pode mudar se você limpar o site depois. Para algo mais
permanente, crie uma conta Netlify gratuita antes de arrastar a pasta.

### Opção B — GitHub Pages (permanente, precisa de conta GitHub)
1. Crie um repositório novo no GitHub (pode ser privado).
2. Suba o conteúdo da pasta `mobile` para esse repositório.
3. Nas configurações do repositório: Settings > Pages > Source > escolha a
   branch e a pasta raiz.
4. O GitHub te dá um link `https://seu-usuario.github.io/nome-do-repo/`.

## Instalar no Android

1. Abra o link publicado no Chrome do celular.
2. Deixe a primeira sincronização terminar (pode levar alguns minutos — baixa
   o histórico completo da Mega-Sena e da Lotofácil; melhor fazer no Wi-Fi).
3. Vai aparecer um aviso "Instalar o Loto Análise na tela inicial?" — toque em
   Instalar. Se não aparecer, use o menu (⋮) do Chrome > "Instalar aplicativo"
   ou "Adicionar à tela inicial".
4. O app abre com ícone próprio, sem a barra de endereço do navegador.

## Sobre a sincronização

- A API da Caixa bloqueia temporariamente (alguns minutos) quem manda muitos
  pedidos rápido demais. Por isso a sincronização aqui é propositalmente lenta
  (2 pedidos por vez, com pausa entre eles) — a primeira pode levar uns 15-20
  minutos para baixar tudo. Depois disso, só busca o que for novo, então é
  rápida.
- Se a aba for suspensa no meio (o celular faz isso com abas em segundo
  plano), o que já foi baixado fica salvo — não perde tudo, só o que estava
  em andamento naquele momento.
- Se muitos pedidos seguidos falharem, o app para sozinho e avisa, em vez de
  insistir e arriscar prolongar um bloqueio.

## Limitações desta versão

- Sem o botão de macro do Excel (isso é coisa do Windows). Em vez disso, a
  aba Comparativo tem um botão "Exportar CSV" que abre em qualquer app de
  planilha.
- Testado no Chrome Android. Deve funcionar em outros navegadores baseados em
  Chromium; não foi testado no Firefox nem no Safari (iOS).

## Estrutura

- `index.html` — página única, com as três abas (Painel / Histórico / Comparativo)
- `manifest.webmanifest` — metadados do app instalável
- `sw.js` — Service Worker (cache dos arquivos do app para uso offline)
- `js/caixaApi.js` — chamadas à API pública da Caixa
- `js/db.js` — armazenamento local (IndexedDB)
- `js/update.js` — sincronização com a Caixa
- `js/analysis.js` — frequência, atraso, soma, paridade
- `js/suggest.js` — gera a sugestão e faz o backtest/evolução
- `js/app.js` — toda a interface e navegação entre abas
- `icons/` — ícones do app
