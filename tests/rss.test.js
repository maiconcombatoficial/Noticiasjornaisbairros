'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseFeed } = require('../src/rss');

test('RSS 2.0 com CDATA, enclosure e content:encoded', () => {
  const xml = `<?xml version="1.0"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel><title>ND Mais</title>
  <item><title><![CDATA[Chuva alaga ruas em Florianópolis &amp; região]]></title>
  <link>https://ndmais.com.br/x?utm_source=rss</link>
  <description><![CDATA[<p>Pontos de <b>alagamento</b> no Itacorubi.</p>]]></description>
  <pubDate>Thu, 23 Oct 2026 10:00:00 -0300</pubDate>
  <enclosure url="https://img.x/a.jpg" type="image/jpeg"/>
  <content:encoded><![CDATA[<img src="https://img.x/b.jpg"> texto longo]]></content:encoded>
  <category>Trânsito</category></item></channel></rss>`;
  const f = parseFeed(xml);
  assert.equal(f.titulo, 'ND Mais');
  assert.equal(f.itens.length, 1);
  const i = f.itens[0];
  assert.equal(i.titulo, 'Chuva alaga ruas em Florianópolis & região');
  assert.equal(i.link, 'https://ndmais.com.br/x?utm_source=rss');
  assert.equal(i.resumo, 'Pontos de alagamento no Itacorubi.');
  assert.equal(i.imagem, 'https://img.x/a.jpg');
  assert.equal(i.data, '2026-10-23T13:00:00.000Z');
  assert.deepEqual(i.categorias, ['Trânsito']);
});

test('Atom com link rel=alternate', () => {
  const xml = `<feed xmlns="http://www.w3.org/2005/Atom"><title>Blog</title>
  <entry><title>Festa em Canasvieiras</title><link rel="self" href="https://a/self"/><link rel="alternate" href="https://a/post"/>
  <updated>2026-10-22T12:00:00Z</updated><summary type="html">&lt;p&gt;Resumo&lt;/p&gt;</summary></entry></feed>`;
  const f = parseFeed(xml);
  assert.equal(f.itens[0].link, 'https://a/post');
  assert.equal(f.itens[0].resumo, 'Resumo');
  assert.equal(f.itens[0].data, '2026-10-22T12:00:00.000Z');
});

test('Google Notícias: source e sufixo do título', () => {
  const xml = `<rss><channel><title>"Florianópolis" - Google Notícias</title>
  <item><title>Obra na Lagoa é liberada - NSC Total</title><link>https://news.google.com/rss/articles/abc</link>
  <pubDate>Thu, 23 Oct 2026 10:00:00 GMT</pubDate><source url="https://www.nsctotal.com.br">NSC Total</source></item></channel></rss>`;
  const f = parseFeed(xml);
  assert.equal(f.itens[0].fonte, 'NSC Total');
  assert.equal(f.itens[0].titulo, 'Obra na Lagoa é liberada - NSC Total');
});

test('ignora itens sem título ou sem link', () => {
  const f = parseFeed('<rss><channel><item><title>Só título</title></item><item><link>https://x</link></item></channel></rss>');
  assert.equal(f.itens.length, 0);
});
