'use strict';
/**
 * Servidor HTTP sem dependências: serve o app (pasta web/) e roda o coletor periodicamente.
 * Variáveis: PORT (3000), INTERVALO_MIN (20), COLETAR_AO_INICIAR (true), TOKEN_COLETA (opcional)
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { coletarTudo, soExportar } = require('./coletor');

const RAIZ = path.resolve(__dirname, '..');
const WEB = path.join(RAIZ, 'web');
const PORT = Number(process.env.PORT || 3000);
const INTERVALO_MIN = Number(process.env.INTERVALO_MIN || 20);
const TOKEN = process.env.TOKEN_COLETA || '';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2',
};

let coletando = null;
let ultimaColeta = null;
function coletarAgora() {
  if (coletando) return coletando;
  coletando = coletarTudo()
    .then((r) => { ultimaColeta = { ...r, em: new Date().toISOString() }; return r; })
    .catch((e) => { console.error('erro na coleta:', e); ultimaColeta = { erro: e.message, em: new Date().toISOString() }; })
    .finally(() => { coletando = null; });
  return coletando;
}

function enviarArquivo(res, arquivo) {
  const ext = path.extname(arquivo).toLowerCase();
  const dinamico = arquivo.includes(`${path.sep}api${path.sep}`) || ext === '.html' || arquivo.endsWith('sw.js');
  res.writeHead(200, {
    'content-type': MIME[ext] || 'application/octet-stream',
    'cache-control': dinamico ? 'no-cache' : 'public, max-age=86400',
  });
  fs.createReadStream(arquivo).pipe(res);
}

const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let p = decodeURIComponent(url.pathname);

  if (p === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, coletando: !!coletando, ultimaColeta }));
  }
  if (p === '/api/coletar') {
    if (TOKEN && url.searchParams.get('token') !== TOKEN) {
      res.writeHead(403, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ erro: 'token inválido' }));
    }
    const jaRodando = !!coletando;
    coletarAgora();
    res.writeHead(202, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ iniciada: !jaRodando, mensagem: jaRodando ? 'coleta já em andamento' : 'coleta iniciada' }));
  }

  if (p === '/') p = '/index.html';
  const arquivo = path.normalize(path.join(WEB, p));
  if (!arquivo.startsWith(WEB + path.sep) || !fs.existsSync(arquivo) || fs.statSync(arquivo).isDirectory()) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    return res.end('não encontrado');
  }
  enviarArquivo(res, arquivo);
});

servidor.listen(PORT, () => {
  console.log(`Notícias Floripa por bairro em http://localhost:${PORT}`);
  try { soExportar(); } catch (e) { console.warn('exportação inicial falhou:', e.message); }
  if ((process.env.COLETAR_AO_INICIAR || 'true') !== 'false') coletarAgora();
  if (INTERVALO_MIN > 0) setInterval(coletarAgora, INTERVALO_MIN * 60 * 1000).unref();
});
