# Floripa por Bairro — notícias de Florianópolis por região e bairro

App (PWA, instalável no celular) que reúne as notícias de Florianópolis de **todos os portais possíveis**
e as organiza por região — **Norte da Ilha, Centro, Continente, Sul da Ilha e Leste da Ilha** — e,
dentro de cada região, por **bairro**. A divisão segue o Decreto Municipal 29.142/2026 (5 regiões, 56 bairros),
com localidades conhecidas (Joaquina, Praia Mole, Santinho, Matadeiro…) tratadas como bairros para facilitar a busca.

Sem dependências externas: só Node.js 22+ (usa `fetch` e `node:sqlite` nativos).

## Como funciona

```
portais (RSS) + Google Notícias (RSS de busca)  →  coletor  →  classificador por bairro  →  SQLite  →  web/api/*.json  →  app
```

1. **Coleta** (`src/coletor.js`): baixa os feeds listados em `src/fontes.json`. Dois tipos:
   - `rss`: feed direto do portal (ND Mais, NSC Total, g1 SC, SCC10, RIC, OCP, Portal da Ilha, Jornal do Campeche, Sul de Floripa, UFSC…).
   - `gnews`: busca no Google Notícias em formato RSS. Alcança qualquer portal, inclusive os que não têm feed
     (Prefeitura, Câmara, Portal Norte da Ilha, CBN, Rádio Guarujá, jornais nacionais…). Além das buscas fixas,
     a cada coleta roda um lote rotativo de buscas `"<bairro>" Florianópolis`, cobrindo todos os bairros ao longo do dia.
2. **Classificação** (`src/classificar.js` + `src/bairros.json`): cada notícia ganha regiões e bairros a partir do
   título e do resumo. Termos únicos (Canasvieiras, Itacorubi, Jurerê…) bastam; termos ambíguos (Centro, Pantanal,
   Daniela, Estreito, Balneário…) só contam quando o texto fala de Florianópolis **e** o termo aparece como lugar
   ("no bairro Pantanal", "Estreito, em Florianópolis"). Há listas de vetos ("Mato Grosso" ⇒ não é o Pantanal da Trindade).
   Também reconhece pontos de referência: UFSC ⇒ Trindade, aeroporto ⇒ Carianos, Ponte Hercílio Luz ⇒ Centro, etc.
   Notícias de Florianópolis sem bairro identificado ficam como "gerais de Floripa"; notícias de outras cidades são descartadas.
3. **Deduplicação**: mesma URL ou mesmo título vindo de dois caminhos (feed direto + Google Notícias) vira uma notícia só,
   preferindo o link direto do portal.
4. **App** (`web/`): lê `web/api/noticias.json` e filtra tudo no navegador. Abas por região, chips por bairro com contagem,
   busca, período (24 h / 3 d / 7 d / tudo), agrupamento por dia, modo escuro, funciona offline (service worker).

## Rodando localmente

```bash
npm start            # servidor em http://localhost:3000, coleta ao iniciar e a cada 20 min
npm run coletar      # uma coleta avulsa (gera web/api/*.json)
npm test
```

Variáveis úteis: `PORT`, `INTERVALO_MIN` (0 desliga a coleta periódica), `DB_PATH`, `RETENCAO_DIAS` (45),
`EXPORT_DIAS` (10), `GNEWS_BAIRROS=false` (desliga as buscas por bairro), `TOKEN_COLETA` (protege `GET /api/coletar`),
`FONTES_PATH` / `BAIRROS_PATH` (arquivos de configuração alternativos).

## Publicando

### Opção 1 — GitHub Pages, de graça e sem servidor (recomendada)

O workflow `.github/workflows/coleta.yml` roda a coleta **a cada 30 minutos** no GitHub Actions, grava os JSON
no repositório e publica a pasta `web/` no GitHub Pages.

1. No repositório: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. **Settings → Actions → General → Workflow permissions: Read and write permissions**.
3. Rode o workflow uma vez em **Actions → "Coletar notícias e publicar no GitHub Pages" → Run workflow**.
4. O app fica em `https://<usuario>.github.io/Noticiasjornaisbairros/`. No celular, "Adicionar à tela de início" instala como app.

### Opção 2 — servidor próprio / Docker

```bash
docker build -t floripa-bairros .
docker run -d -p 3000:3000 -v floripa-dados:/app/data floripa-bairros
```

Funciona também em Render, Railway, Fly.io etc. (comando `npm start`, porta `PORT`).
Nesse modo o botão "atualizar" do app dispara uma coleta na hora.

## Atualizações no celular

- **Notícias**: puxe a lista para baixo (ou toque no ícone de atualizar). O rodapé mostra a hora da última coleta.
- **O app em si**: quando uma versão nova é publicada, aparece a faixa "Nova versão do app disponível" com o botão
  **Atualizar agora**. O número da versão fica no rodapé (`app v1.3`). Ao mudar o app, altere `APP_VERSAO` em
  `web/app.js` e `VERSAO` em `web/sw.js` para o mesmo valor.

## Personalizando

- **Fontes**: edite `src/fontes.json`. Para um portal com feed, adicione `{ "id", "nome", "tipo": "rss", "url", "escopo" }`.
  Para um portal sem feed, use `"tipo": "gnews"` com `"consulta": "site:portal.com.br"`.
  `escopo` = `local` (portal só de Floripa: tudo entra), `sc` (estadual: precisa citar Florianópolis/Capital/bairro) ou `br`.
  `regiao_fixa` / `bairro_fixo` marcam portais de bairro (ex.: Jornal do Campeche ⇒ Sul).
- **Bairros e termos**: edite `src/bairros.json` (`aliases`, `fracos`, `ignorar`, `negativos`, `exige_bairro`).
  Rode `npm test` depois — há casos de teste com armadilhas reais (Pantanal, Praia Brava de Itajaí, Daniela Mercury…).
- **Status das fontes**: ícone de RSS no topo do app, ou `web/api/status.json`. Fontes com 8 falhas seguidas ficam
  pausadas e são tentadas de novo a cada 6 coletas.

## Fontes incluídas

ND Mais, NSC Total (Diário Catarinense, Hora, CBN Floripa), g1 SC, SCC10, RIC Mais, OCP News, TVBV/Band SC, Correio SC,
Tudo Aqui SC (Jovem Pan), Portal Catarinas, Gazeta do Povo SC, Portal da Ilha, Imagem da Ilha, Floripa Notícias,
Notícias Floripa, FloripAmanhã, Floripa Centro, Jornal Conexão, Portal Grande Florianópolis, De Olho na Ilha, UFSC,
Prefeitura de Florianópolis, Câmara de Vereadores, Portal Norte da Ilha, Sul de Floripa, Jornal do Campeche, DuCampeche,
Rádio Guarujá, Agora Floripa, jornais nacionais (Folha, Estadão, O Globo, CNN, UOL) via Google Notícias, e as buscas
por região e por bairro no Google Notícias.

> As URLs de feed foram montadas a partir do padrão de cada portal (a maioria usa WordPress, `/feed/`). Se alguma não
> responder, ela aparece em vermelho no painel de fontes e pode ser trocada por uma busca `gnews` do mesmo site.
