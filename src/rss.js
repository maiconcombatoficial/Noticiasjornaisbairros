'use strict';
/**
 * Parser leve de RSS 2.0 / RSS 1.0 (RDF) / Atom, sem dependências.
 * Não é um parser XML completo: foi feito para feeds de notícias reais, que variam muito,
 * e por isso é tolerante a erros (CDATA, namespaces, tags mal fechadas).
 */
const { limparHtml, decodificarEntidades, parseData } = require('./util');

function pegarTag(xml, nomes) {
  for (const nome of [].concat(nomes)) {
    // aceita prefixo de namespace opcional e atributos
    const re = new RegExp(`<(?:[a-zA-Z0-9_-]+:)?${nome}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[a-zA-Z0-9_-]+:)?${nome}\\s*>`, 'i');
    const m = xml.match(re);
    if (m) return m[1].trim();
  }
  return '';
}

function pegarAtributo(xml, tag, atributo) {
  const re = new RegExp(`<(?:[a-zA-Z0-9_-]+:)?${tag}\\b[^>]*?\\b${atributo}\\s*=\\s*["']([^"']+)["'][^>]*>`, 'i');
  const m = xml.match(re);
  return m ? decodificarEntidades(m[1].trim()) : '';
}

function textoLimpo(bruto) {
  return limparHtml(bruto);
}

function extrairLink(xml) {
  // RSS: <link>url</link>
  let link = pegarTag(xml, 'link');
  link = limparHtml(link);
  if (link && /^https?:\/\//i.test(link)) return link;
  // Atom: <link rel="alternate" href="..."/>
  const links = xml.match(/<(?:[a-zA-Z0-9_-]+:)?link\b[^>]*>/gi) || [];
  let candidato = '';
  for (const l of links) {
    const href = (l.match(/\bhref\s*=\s*["']([^"']+)["']/i) || [])[1];
    const rel = (l.match(/\brel\s*=\s*["']([^"']+)["']/i) || [])[1] || 'alternate';
    if (href && rel === 'alternate') return decodificarEntidades(href);
    if (href && !candidato) candidato = decodificarEntidades(href);
  }
  if (candidato) return candidato;
  const guid = limparHtml(pegarTag(xml, 'guid'));
  if (/^https?:\/\//i.test(guid)) return guid;
  const id = limparHtml(pegarTag(xml, 'id'));
  if (/^https?:\/\//i.test(id)) return id;
  return '';
}

function extrairImagem(xml, conteudoBruto) {
  const enclosure = pegarAtributo(xml, 'enclosure', 'url');
  if (enclosure && /\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(enclosure)) return enclosure;
  const tipoEnc = pegarAtributo(xml, 'enclosure', 'type');
  if (enclosure && /^image\//i.test(tipoEnc)) return enclosure;
  const media = pegarAtributo(xml, 'content', 'url') || pegarAtributo(xml, 'thumbnail', 'url');
  if (media && /^https?:\/\//i.test(media)) return media;
  const img = (conteudoBruto || '').match(/<img[^>]+src\s*=\s*["']([^"']+)["']/i);
  if (img && /^https?:\/\//i.test(img[1])) return decodificarEntidades(img[1]);
  return '';
}

/**
 * @returns {{titulo:string, itens:Array<{titulo:string, link:string, resumo:string, conteudo:string, data:string|null, imagem:string, autor:string, fonte:string, categorias:string[]}>}}
 */
function parseFeed(xml) {
  if (!xml || typeof xml !== 'string') return { titulo: '', itens: [] };
  xml = xml.replace(/^﻿/, '');
  const blocos = xml.match(/<(?:[a-zA-Z0-9_-]+:)?(item|entry)(?:\s[^>]*)?>[\s\S]*?<\/(?:[a-zA-Z0-9_-]+:)?(?:item|entry)\s*>/gi) || [];
  const cabecalho = xml.slice(0, xml.search(/<(?:[a-zA-Z0-9_-]+:)?(item|entry)[\s>]/i) >>> 0);
  const tituloFeed = textoLimpo(pegarTag(cabecalho, 'title'));

  const itens = [];
  for (const bloco of blocos) {
    const tituloBruto = pegarTag(bloco, 'title');
    const titulo = textoLimpo(tituloBruto);
    const link = extrairLink(bloco);
    if (!titulo || !link) continue;
    const conteudoBruto = pegarTag(bloco, ['encoded', 'content']) || '';
    const resumoBruto = pegarTag(bloco, ['description', 'summary', 'subtitle']) || '';
    const resumo = textoLimpo(resumoBruto) || textoLimpo(conteudoBruto).slice(0, 600);
    const data = parseData(textoLimpo(pegarTag(bloco, ['pubDate', 'published', 'updated', 'date', 'issued', 'created', 'modified'])));
    const imagem = extrairImagem(bloco, conteudoBruto + ' ' + resumoBruto);
    const autor = textoLimpo(pegarTag(bloco, ['creator', 'author', 'name']));
    const fonte = textoLimpo(pegarTag(bloco, 'source'));
    const categorias = (bloco.match(/<(?:[a-zA-Z0-9_-]+:)?category\b[^>]*>([\s\S]*?)<\//gi) || [])
      .map((c) => textoLimpo(c.replace(/^<[^>]+>/, '').replace(/<\/$/, '')))
      .filter(Boolean);
    const termos = (bloco.match(/<(?:[a-zA-Z0-9_-]+:)?category\b[^>]*\bterm\s*=\s*["']([^"']+)["']/gi) || [])
      .map((c) => decodificarEntidades((c.match(/term\s*=\s*["']([^"']+)["']/i) || [])[1] || ''));
    itens.push({ titulo, link, resumo, conteudo: textoLimpo(conteudoBruto), data, imagem, autor, fonte, categorias: categorias.concat(termos).filter(Boolean) });
  }
  return { titulo: tituloFeed, itens };
}

module.exports = { parseFeed };
