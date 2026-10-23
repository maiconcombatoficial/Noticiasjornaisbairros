'use strict';
/**
 * Coletor: baixa os feeds (RSS direto e Google Notícias), classifica por bairro/região,
 * grava no SQLite com deduplicação e exporta os JSON lidos pelo app (web/api/*.json).
 *
 * Uso:  node src/coletor.js            (uma coleta e sai)
 *       node src/coletor.js --so-exportar
 * Variáveis: DB_PATH, RETENCAO_DIAS, EXPORT_DIAS, EXPORT_MAX, TIMEOUT_MS, CONCORRENCIA, GNEWS_BAIRROS
 */
const fs = require('node:fs');
const path = require('node:path');
const { parseFeed } = require('./rss');
const { classificar, resumoConfig } = require('./classificar');
const { classificarAssuntos, listaAssuntos } = require('./assuntos');
const { resolverUrl } = require('./gnews');
const { avaliarPauta } = require('./pautas');
const { avaliarAgenda, listaTiposAgenda } = require('./agenda');
const { abrir } = require('./db');
const { hash, normalizarUrl, chaveTitulo, agoraIso, normalizar } = require('./util');

const RAIZ = path.resolve(__dirname, '..');
const DIR_WEB_API = path.join(RAIZ, 'web', 'api');
const CONFIG = {
  dbPath: process.env.DB_PATH || path.join(RAIZ, 'data', 'noticias.db'),
  retencaoDias: Number(process.env.RETENCAO_DIAS || 45),
  exportDias: Number(process.env.EXPORT_DIAS || 10),
  exportMax: Number(process.env.EXPORT_MAX || 4000),
  timeoutMs: Number(process.env.TIMEOUT_MS || 20000),
  concorrencia: Number(process.env.CONCORRENCIA || 4),
  gnewsBairros: (process.env.GNEWS_BAIRROS || 'true') !== 'false',
  resolverGnews: (process.env.RESOLVER_GNEWS || 'true') !== 'false',
  resolverAntigos: Number(process.env.RESOLVER_ANTIGOS || 80),
  falhasParaPausar: 8,
};
const USER_AGENT = 'Mozilla/5.0 (compatible; NoticiasFloripaBairros/1.0; +https://github.com/maiconcombatoficial/Noticiasjornaisbairros)';

function carregarJson(nome) {
  // FONTES_PATH / BAIRROS_PATH permitem usar arquivos de configuração alternativos (testes, outra cidade...)
  const env = nome === 'fontes.json' ? process.env.FONTES_PATH : process.env.BAIRROS_PATH;
  return JSON.parse(fs.readFileSync(env ? path.resolve(env) : path.join(__dirname, nome), 'utf8'));
}

function urlGnews(consulta) {
  const q = `${consulta} when:3d`;
  return `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=pt-BR&gl=BR&ceid=BR:pt-419`;
}

async function baixar(url, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'user-agent': USER_AGENT, accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*;q=0.8', 'accept-language': 'pt-BR,pt;q=0.9' },
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const texto = await r.text();
    if (!/<(rss|feed|rdf:RDF|channel|item|entry)\b/i.test(texto.slice(0, 5000))) {
      throw new Error('resposta não parece um feed RSS/Atom');
    }
    return texto;
  } finally {
    clearTimeout(timer);
  }
}

/** Monta a lista de fontes a coletar nesta rodada (fixas + lote rotativo de buscas por bairro). */
function compilarExclusoes(fontesCfg) {
  const padroes = (fontesCfg.excluir_titulos && fontesCfg.excluir_titulos.padroes) || [];
  return padroes.map((p) => new RegExp(p, 'i'));
}

function montarFontes(db, fontesCfg, bairrosCfg) {
  const fontes = fontesCfg.fontes.filter((f) => f.ativa !== false).map((f) => ({ ...f }));
  const gb = fontesCfg.gnews_por_bairro || {};
  if (CONFIG.gnewsBairros && gb.ativo !== false) {
    const todos = bairrosCfg.regioes.flatMap((r) => r.bairros.map((b) => ({ ...b, regiao: r.id })));
    const lote = Math.max(1, Number(gb.lote || 12));
    const inicio = Number(db.meta('gnews_bairro_offset') || 0) % todos.length;
    for (let i = 0; i < Math.min(lote, todos.length); i++) {
      const b = todos[(inicio + i) % todos.length];
      fontes.push({
        id: `gnews-bairro-${b.id}`,
        nome: `Google Notícias · ${b.nome}`,
        tipo: 'gnews',
        consulta: `"${b.nome}" Florianópolis`,
        // escopo 'sc': o título precisa citar o bairro (termo forte) ou Florianópolis; o Google casa pelo corpo
        // do texto, e forçar o bairro trazia lixo ("Daniela Reinehr", "Praia Brava de Itajaí").
        escopo: 'sc',
        rotativa: true,
      });
    }
    db.meta('gnews_bairro_offset', (inicio + lote) % todos.length);
  }
  return fontes;
}

function montarNoticia(item, fonte, cls, assuntos = [], pauta = false, agenda = '') {
  const viaGnews = fonte.tipo === 'gnews' || /news\.google\./i.test(item.link);
  // Link do Google já resolvido para o portal: passa a valer como link direto (inclusive na deduplicação)
  const linkDireto = item.linkResolvido ? normalizarUrl(item.linkResolvido) : null;
  const url = linkDireto || (viaGnews ? item.link : normalizarUrl(item.link));
  let titulo = item.titulo;
  let fonteNome = fonte.nome;
  // Itens vindos do Google Notícias chegam como "Título - Nome do Portal" e trazem <source>
  if (item.fonte) {
    const sufixo = ` - ${item.fonte}`;
    if (titulo.endsWith(sufixo)) { titulo = titulo.slice(0, -sufixo.length).trim(); fonteNome = item.fonte; }
    else if (viaGnews) fonteNome = item.fonte;
  } else if (viaGnews) {
    const m = titulo.match(/^(.*)\s-\s([^-]{2,60})$/);
    if (m) { titulo = m[1].trim(); fonteNome = m[2].trim(); }
  }
  const resumo = viaGnews ? '' : (item.resumo || '').slice(0, 400);
  return {
    id: hash(viaGnews && !linkDireto ? chaveTitulo(titulo) + '|gnews' : url),
    url,
    titulo,
    titulo_chave: chaveTitulo(titulo),
    resumo,
    imagem: item.imagem || '',
    fonte_id: fonte.id,
    fonte_nome: fonteNome,
    via_gnews: viaGnews && !linkDireto ? 1 : 0,
    publicado_em: item.data || agoraIso(),
    coletado_em: agoraIso(),
    regioes: JSON.stringify(cls.regioes),
    bairros: JSON.stringify(cls.bairros),
    assuntos: JSON.stringify(assuntos),
    pauta: pauta ? 1 : 0,
    agenda: agenda || '',
    geral: cls.geral ? 1 : 0,
  };
}

async function coletarFonte(db, fonte, bairrosCfg, log, exclusoes = []) {
  const anterior = db.statusFonte(fonte.id) || { falhas_seguidas: 0, total_itens: 0 };
  if (!fonte.rotativa && anterior.falhas_seguidas >= CONFIG.falhasParaPausar) {
    // Fonte pausada por falhas repetidas: tenta de novo só de vez em quando (1 em 6 rodadas)
    const rodada = Number(db.meta('rodada') || 0);
    if (rodada % 6 !== 0) return { fonte, pulada: true };
  }
  const url = fonte.tipo === 'gnews' ? urlGnews(fonte.consulta) : fonte.url;
  const resultado = { fonte, itens: 0, novas: 0, descartadas: 0, erro: null };
  try {
    const xml = await baixar(url, CONFIG.timeoutMs);
    const feed = parseFeed(xml);
    resultado.itens = feed.itens.length;
    const candidatos = [];
    for (const item of feed.itens) {
      const tituloNorm = normalizar(item.titulo);
      if (exclusoes.some((re) => re.test(tituloNorm))) { resultado.descartadas++; continue; }
      const cls = classificar({ titulo: item.titulo, resumo: item.resumo, conteudo: item.conteudo }, fonte, bairrosCfg);
      if (!cls.floripa) { resultado.descartadas++; continue; }
      candidatos.push({ item, cls });
    }
    // Links do Google Notícias: resolve para a URL do portal só nas notícias ainda não conhecidas
    if (CONFIG.resolverGnews) {
      const pendentes = candidatos.filter(({ item, cls }) => /news\.google\./i.test(item.link) && !db.jaConhecida(montarNoticia(item, fonte, cls)));
      await emParalelo(pendentes, 3, async (c) => { c.item.linkResolvido = await resolverUrl(c.item.link, { timeoutMs: CONFIG.timeoutMs }); });
      resultado.resolvidas = pendentes.filter((c) => c.item.linkResolvido).length;
    }
    db.transacao(() => {
      for (const { item, cls } of candidatos) {
        const assuntos = classificarAssuntos({ titulo: item.titulo, resumo: item.resumo, conteudo: item.conteudo });
        const { pauta } = avaliarPauta({ titulo: item.titulo, resumo: item.resumo, conteudo: item.conteudo }, cls.bairros.length > 0, cls.bairros.length > 0 || cls.regioes.length > 0);
        const { agenda } = avaliarAgenda({ titulo: item.titulo, resumo: item.resumo, conteudo: item.conteudo });
        const n = montarNoticia(item, fonte, cls, assuntos, pauta, agenda);
        const r = db.inserirNoticia(n);
        if (r === 'nova' || r === 'substituiu') resultado.novas++;
      }
    });
    db.salvarStatus({
      fonte_id: fonte.id, nome: fonte.nome, tipo: fonte.tipo,
      ultimo_ok: agoraIso(), ultimo_erro: anterior.ultimo_erro || null, erro: null, falhas_seguidas: 0,
      total_itens: (anterior.total_itens || 0) + resultado.novas, itens_ultima: resultado.itens, novos_ultima: resultado.novas, ultima_coleta: agoraIso(),
    });
    log(`✓ ${fonte.nome}: ${resultado.itens} itens, ${resultado.novas} novas, ${resultado.descartadas} fora de Floripa${resultado.resolvidas ? `, ${resultado.resolvidas} links resolvidos` : ''}`);
  } catch (e) {
    resultado.erro = e.name === 'AbortError' ? 'tempo esgotado' : (e.cause && e.cause.code) || e.message;
    db.salvarStatus({
      fonte_id: fonte.id, nome: fonte.nome, tipo: fonte.tipo,
      ultimo_ok: anterior.ultimo_ok || null, ultimo_erro: agoraIso(), erro: resultado.erro,
      falhas_seguidas: (anterior.falhas_seguidas || 0) + 1, total_itens: anterior.total_itens || 0, itens_ultima: 0, novos_ultima: 0, ultima_coleta: agoraIso(),
    });
    log(`✗ ${fonte.nome}: ${resultado.erro}`);
  }
  return resultado;
}

async function emParalelo(itens, limite, fn) {
  const resultados = [];
  let i = 0;
  const trabalhadores = Array.from({ length: Math.min(limite, itens.length) }, async () => {
    while (i < itens.length) {
      const idx = i++;
      resultados[idx] = await fn(itens[idx]);
    }
  });
  await Promise.all(trabalhadores);
  return resultados;
}

/** Resolve, aos poucos, os links do Google Notícias de notícias já guardadas. */
async function resolverAntigos(db, log) {
  if (!CONFIG.resolverGnews || CONFIG.resolverAntigos <= 0) return 0;
  const pendentes = db.gnewsPendentes(CONFIG.resolverAntigos);
  if (!pendentes.length) return 0;
  let ok = 0;
  await emParalelo(pendentes, 3, async (n) => {
    const direta = await resolverUrl(n.url, { timeoutMs: CONFIG.timeoutMs });
    if (!direta) return;
    const urlNorm = normalizarUrl(direta);
    db.resolverUrl(n.id, urlNorm, hash(urlNorm));
    ok++;
  });
  log(`links antigos do Google resolvidos: ${ok} de ${pendentes.length}`);
  return ok;
}

/** Semeia o banco com o JSON exportado anteriormente (útil quando o banco é novo, ex.: GitHub Actions). */
function semearDoJson(db) {
  const arq = path.join(DIR_WEB_API, 'noticias.json');
  if (db.total() > 0 || !fs.existsSync(arq)) return 0;
  try {
    const dados = JSON.parse(fs.readFileSync(arq, 'utf8'));
    let n = 0;
    db.transacao(() => {
      for (const x of dados.noticias || []) {
        const r = db.inserirNoticia({
          id: x.id, url: x.url, titulo: x.titulo, titulo_chave: chaveTitulo(x.titulo), resumo: x.resumo || '', imagem: x.imagem || '',
          fonte_id: x.fonte_id || '', fonte_nome: x.fonte || '', via_gnews: x.via_gnews ? 1 : 0, publicado_em: x.publicado_em, coletado_em: x.coletado_em || agoraIso(),
          regioes: JSON.stringify(x.regioes || []), bairros: JSON.stringify(x.bairros || []),
          assuntos: JSON.stringify(x.assuntos && x.assuntos.length ? x.assuntos : classificarAssuntos({ titulo: x.titulo, resumo: x.resumo })),
          pauta: (x.pauta !== undefined ? x.pauta : avaliarPauta({ titulo: x.titulo, resumo: x.resumo }, (x.bairros || []).length > 0, (x.bairros || []).length > 0 || (x.regioes || []).length > 0).pauta) ? 1 : 0,
          agenda: x.agenda !== undefined ? (x.agenda || '') : avaliarAgenda({ titulo: x.titulo, resumo: x.resumo }).agenda, geral: x.geral ? 1 : 0,
        });
        if (r !== 'duplicada') n++;
      }
    });
    return n;
  } catch (e) {
    console.warn('não consegui semear do JSON anterior:', e.message);
    return 0;
  }
}

function exportar(db, bairrosCfg, fontesCfg) {
  fs.mkdirSync(DIR_WEB_API, { recursive: true });
  const desde = new Date(Date.now() - CONFIG.exportDias * 86400000).toISOString();
  const noticias = db.recentes(desde, CONFIG.exportMax).map((n) => ({
    id: n.id, url: n.url, titulo: n.titulo, resumo: n.resumo ? n.resumo.slice(0, 240) : '', imagem: n.imagem || '',
    fonte: n.fonte_nome, fonte_id: n.fonte_id, via_gnews: n.via_gnews, publicado_em: n.publicado_em, coletado_em: n.coletado_em,
    regioes: n.regioes, bairros: n.bairros,
    assuntos: n.assuntos && n.assuntos.length ? n.assuntos : classificarAssuntos({ titulo: n.titulo, resumo: n.resumo }),
    pauta: n.pauta,
    agenda: n.agenda || '',
    geral: n.geral,
  }));
  const contagem = { regioes: {}, bairros: {}, assuntos: {}, agenda: {}, geral: 0, pautas: 0 };
  for (const n of noticias) {
    if (n.pauta) contagem.pautas++;
    if (n.agenda) contagem.agenda[n.agenda] = (contagem.agenda[n.agenda] || 0) + 1;
    for (const r of n.regioes) contagem.regioes[r] = (contagem.regioes[r] || 0) + 1;
    for (const b of n.bairros) contagem.bairros[b] = (contagem.bairros[b] || 0) + 1;
    for (const a of n.assuntos) contagem.assuntos[a] = (contagem.assuntos[a] || 0) + 1;
    if (n.geral) contagem.geral++;
  }
  const geradoEm = agoraIso();
  fs.writeFileSync(path.join(DIR_WEB_API, 'noticias.json'), JSON.stringify({ gerado_em: geradoEm, dias: CONFIG.exportDias, total: noticias.length, contagem, noticias }));
  fs.writeFileSync(path.join(DIR_WEB_API, 'bairros.json'), JSON.stringify({ gerado_em: geradoEm, ...resumoConfig(bairrosCfg), assuntos: listaAssuntos(), agenda: listaTiposAgenda() }));
  const fontesInfo = {};
  for (const f of fontesCfg.fontes) fontesInfo[f.id] = { site: f.site || '', escopo: f.escopo, tipo: f.tipo };
  fs.writeFileSync(path.join(DIR_WEB_API, 'status.json'), JSON.stringify({
    gerado_em: geradoEm, total_no_banco: db.total(), exportadas: noticias.length,
    fontes: db.statusFontes().map((s) => ({ ...s, ...(fontesInfo[s.fonte_id] || {}) })),
  }));
  return noticias.length;
}

async function coletarTudo({ log = console.log } = {}) {
  const inicio = Date.now();
  const bairrosCfg = carregarJson('bairros.json');
  const fontesCfg = carregarJson('fontes.json');
  const db = abrir(CONFIG.dbPath);
  try {
    const semeadas = semearDoJson(db);
    if (semeadas) log(`banco novo: ${semeadas} notícias recuperadas do JSON anterior`);
    db.meta('rodada', Number(db.meta('rodada') || 0) + 1);
    const fontes = montarFontes(db, fontesCfg, bairrosCfg);
    const exclusoes = compilarExclusoes(fontesCfg);
    log(`coletando ${fontes.length} fontes...`);
    const resultados = await emParalelo(fontes, CONFIG.concorrencia, (f) => coletarFonte(db, f, bairrosCfg, log, exclusoes));
    const novas = resultados.reduce((s, r) => s + (r.novas || 0), 0);
    const comErro = resultados.filter((r) => r.erro).length;
    await resolverAntigos(db, log);
    const removidas = db.limparAntigas(new Date(Date.now() - CONFIG.retencaoDias * 86400000).toISOString());
    const exportadas = exportar(db, bairrosCfg, fontesCfg);
    db.meta('ultima_coleta', agoraIso());
    const resumo = { fontes: fontes.length, comErro, novas, removidas, exportadas, total: db.total(), segundos: Math.round((Date.now() - inicio) / 1000) };
    log(`fim: ${novas} novas, ${comErro} fontes com erro, ${exportadas} exportadas, ${resumo.total} no banco (${resumo.segundos}s)`);
    return resumo;
  } finally {
    db.fechar();
  }
}

function soExportar() {
  const db = abrir(CONFIG.dbPath);
  try {
    semearDoJson(db);
    return exportar(db, carregarJson('bairros.json'), carregarJson('fontes.json'));
  } finally {
    db.fechar();
  }
}

if (require.main === module) {
  if (process.argv.includes('--so-exportar')) {
    console.log(`${soExportar()} notícias exportadas`);
  } else {
    coletarTudo().catch((e) => { console.error(e); process.exit(1); });
  }
}

module.exports = { coletarTudo, exportar, soExportar, CONFIG, montarNoticia, urlGnews };
