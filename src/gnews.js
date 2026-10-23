'use strict';
/**
 * Resolve links do Google Notícias (news.google.com/rss/articles/<id>) para a URL real do portal.
 * 1) ids antigos trazem a URL embutida em base64;
 * 2) ids novos exigem pedir à própria página do Google os parâmetros de assinatura e chamar o endpoint
 *    interno "batchexecute" (mesma técnica de bibliotecas abertas como googlenewsdecoder).
 * Qualquer falha devolve null e o link original é mantido.
 */
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function extrairId(url) {
  const m = String(url).match(/news\.google\.com\/(?:rss\/)?articles\/([A-Za-z0-9_-]+)/);
  return m ? m[1] : null;
}

/** Tenta achar a URL embutida no id (formato antigo). */
function decodificarBase64(id) {
  try {
    const bin = Buffer.from(id.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('latin1');
    const m = bin.match(/https?:\/\/[A-Za-z0-9\-._~:/?#\[\]@!$&'()*+,;=%]+/);
    if (!m) return null;
    const u = m[0].replace(/[\x00-\x1f].*$/s, '');
    return /^https?:\/\/[^/]+\.[a-z]{2,}/i.test(u) ? u : null;
  } catch {
    return null;
  }
}

async function comTimeout(ms, fn) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fn(ctrl.signal); } finally { clearTimeout(t); }
}

function extrairParametros(html) {
  const sg = html.match(/data-n-a-sg="([^"]+)"/);
  const ts = html.match(/data-n-a-ts="([^"]+)"/);
  return sg && ts ? { sg: sg[1], ts: ts[1] } : null;
}

function montarCorpoBatch(id, sg, ts) {
  const req = `["garturlreq",[["X","X",["X","X"],null,null,1,1,"US:en",null,1,null,null,null,null,null,0,1],"X","X",1,[1,1,1],1,1,null,0,0,null,0],"${id}",${Number(ts)},"${sg}"]`;
  return 'f.req=' + encodeURIComponent(JSON.stringify([[['Fbv4je', req, null, 'generic']]]));
}

function extrairUrlDaResposta(texto) {
  // A resposta vem como JSON "protegido" (prefixo )]}' e tamanhos de bloco); basta achar garturlres
  // dentro da resposta a string vem escapada duas vezes: \"garturlres\",\"https://...?a\\u003d1\"
  const m = texto.match(/garturlres\\",\\"((?:\\\\.|[^"\\])+)\\"/) || texto.match(/garturlres","((?:\\.|[^"\\])+)"/);
  if (!m) return null;
  const u = m[1].replace(/\\\\u003d|\\u003d/g, '=').replace(/\\\\u0026|\\u0026/g, '&').replace(/\\\\\/|\\\//g, '/').replace(/\\\\/g, '\\');
  return /^https?:\/\//.test(u) ? u : null;
}

async function resolverPelaApi(id, timeoutMs) {
  const pagina = await comTimeout(timeoutMs, (signal) => fetch(`https://news.google.com/rss/articles/${id}`, {
    signal, redirect: 'follow', headers: { 'user-agent': USER_AGENT, accept: 'text/html' },
  }));
  if (!pagina.ok) return null;
  // Às vezes o Google já redireciona direto para o portal
  if (pagina.url && !/news\.google\.com/.test(pagina.url)) return pagina.url;
  const params = extrairParametros(await pagina.text());
  if (!params) return null;
  const resp = await comTimeout(timeoutMs, (signal) => fetch('https://news.google.com/_/DotsSplashUi/data/batchexecute', {
    signal, method: 'POST',
    headers: { 'user-agent': USER_AGENT, 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: montarCorpoBatch(id, params.sg, params.ts),
  }));
  if (!resp.ok) return null;
  return extrairUrlDaResposta(await resp.text());
}

const cache = new Map();
async function resolverUrl(url, { timeoutMs = 12000 } = {}) {
  const id = extrairId(url);
  if (!id) return null;
  if (cache.has(id)) return cache.get(id);
  let resolvida = decodificarBase64(id);
  if (!resolvida) {
    try { resolvida = await resolverPelaApi(id, timeoutMs); } catch { resolvida = null; }
  }
  if (resolvida && /news\.google\.com/.test(resolvida)) resolvida = null;
  cache.set(id, resolvida);
  return resolvida;
}

module.exports = { resolverUrl, extrairId, decodificarBase64, extrairParametros, extrairUrlDaResposta, montarCorpoBatch };
