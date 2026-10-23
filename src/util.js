'use strict';
const crypto = require('node:crypto');

const ENTIDADES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–',
  laquo: '«', raquo: '»', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', copy: '©', reg: '®', deg: '°',
  aacute: 'á', agrave: 'à', acirc: 'â', atilde: 'ã', eacute: 'é', ecirc: 'ê', iacute: 'í', oacute: 'ó',
  ocirc: 'ô', otilde: 'õ', uacute: 'ú', uuml: 'ü', ccedil: 'ç', Aacute: 'Á', Agrave: 'À', Acirc: 'Â',
  Atilde: 'Ã', Eacute: 'É', Ecirc: 'Ê', Iacute: 'Í', Oacute: 'Ó', Ocirc: 'Ô', Otilde: 'Õ', Uacute: 'Ú',
  Ccedil: 'Ç', ordm: 'º', ordf: 'ª', middot: '·', bull: '•', trade: '™', euro: '€',
};

/** Decodifica entidades HTML/XML (nomeadas, decimais e hexadecimais). */
function decodificarEntidades(texto) {
  if (!texto) return '';
  return String(texto).replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (tudo, ent) => {
    if (ent[0] === '#') {
      const hex = ent[1] === 'x' || ent[1] === 'X';
      const cod = parseInt(ent.slice(hex ? 2 : 1), hex ? 16 : 10);
      if (Number.isFinite(cod) && cod > 0 && cod < 0x10ffff) {
        try { return String.fromCodePoint(cod); } catch { return tudo; }
      }
      return tudo;
    }
    return Object.prototype.hasOwnProperty.call(ENTIDADES, ent) ? ENTIDADES[ent] : tudo;
  });
}

/** Remove tags HTML, CDATA e normaliza espaços. */
function limparHtml(texto) {
  if (!texto) return '';
  let t = String(texto);
  t = t.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  // Feeds Atom/alguns RSS escapam o HTML (&lt;p&gt;): decodifica antes de tirar as tags
  if (/&lt;[a-z\/!]/i.test(t)) t = decodificarEntidades(t);
  t = t.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ');
  t = t.replace(/<br\s*\/?>|<\/p>|<\/div>|<\/li>|<\/h[1-6]>/gi, ' ');
  t = t.replace(/<[^>]+>/g, ' ');
  t = decodificarEntidades(t);
  return t.replace(/\s+/g, ' ').trim();
}

/** Minúsculas, sem acentos, pontuação vira espaço. Base de toda a comparação textual. */
function normalizar(texto) {
  if (!texto) return '';
  return String(texto)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s,.\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Normalização agressiva para detectar títulos duplicados. */
function chaveTitulo(titulo) {
  return normalizar(titulo).replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean).slice(0, 14).join(' ');
}

function slug(texto) {
  return normalizar(texto).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function hash(texto) {
  return crypto.createHash('sha1').update(String(texto)).digest('hex').slice(0, 16);
}

/** Remove parâmetros de rastreamento e normaliza URL para deduplicação. */
function normalizarUrl(url) {
  try {
    const u = new URL(url);
    const remover = [];
    for (const k of u.searchParams.keys()) {
      if (/^(utm_|fbclid|gclid|ref|source|origem|share|mc_cid|mc_eid|igshid|_ga)/i.test(k)) remover.push(k);
    }
    remover.forEach((k) => u.searchParams.delete(k));
    u.hash = '';
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, '');
    let s = u.toString();
    if (s.endsWith('/')) s = s.slice(0, -1);
    return s;
  } catch {
    return String(url || '').trim();
  }
}

/** Converte datas RSS/Atom (RFC 822, ISO 8601, variantes) para ISO; null se inválida. */
function parseData(texto) {
  if (!texto) return null;
  let t = String(texto).trim();
  // Alguns feeds usam "GMT-0300" ou meses em português
  t = t.replace(/\s+(GMT|UTC)([+-]\d{2})(\d{2})$/, ' $2:$3');
  const meses = { jan: 'Jan', fev: 'Feb', mar: 'Mar', abr: 'Apr', mai: 'May', jun: 'Jun', jul: 'Jul', ago: 'Aug', set: 'Sep', out: 'Oct', nov: 'Nov', dez: 'Dec' };
  t = t.replace(/\b(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\b/i, (m) => meses[m.toLowerCase()]);
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return null;
  const agora = Date.now();
  // Datas no futuro distante ou muito antigas costumam ser erro de feed
  if (d.getTime() > agora + 36 * 3600 * 1000) return new Date(agora).toISOString();
  return d.toISOString();
}

function agoraIso() {
  return new Date().toISOString();
}

module.exports = { decodificarEntidades, limparHtml, normalizar, chaveTitulo, slug, hash, normalizarUrl, parseData, agoraIso };
