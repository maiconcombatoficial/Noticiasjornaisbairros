'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const g = require('../src/gnews');

test('extrai o id do link do Google Notícias', () => {
  assert.equal(g.extrairId('https://news.google.com/rss/articles/CBMiabc_-XYZ?oc=5'), 'CBMiabc_-XYZ');
  assert.equal(g.extrairId('https://ndmais.com.br/x'), null);
});
test('decodifica id antigo com URL embutida', () => {
  const url = 'https://ndmais.com.br/noticia/teste-123/';
  const bin = Buffer.concat([Buffer.from([0x08, 0x13, 0x22, url.length]), Buffer.from(url, 'latin1'), Buffer.from([0xd2, 0x01, 0x00])]);
  const id = bin.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  assert.equal(g.decodificarBase64(id), url);
});
test('id novo (sem URL embutida) não inventa link', () => {
  assert.equal(g.decodificarBase64('AU_yqLN3x9qJ5m2tR8Zk'), null);
});
test('lê os parâmetros de assinatura da página', () => {
  const html = '<c-wiz data-n-a-id="X" data-n-a-sg="AbCd-ef" data-n-a-ts="1729600000"></c-wiz>';
  assert.deepEqual(g.extrairParametros(html), { sg: 'AbCd-ef', ts: '1729600000' });
});
test('extrai a URL da resposta do batchexecute', () => {
  const resp = ')]}\'\n\n123\n[["wrb.fr","Fbv4je","[\\"garturlres\\",\\"https://www.nsctotal.com.br/noticias/obra-x?a\\\\u003d1\\",null]",null,null,null,"generic"]]';
  assert.equal(g.extrairUrlDaResposta(resp), 'https://www.nsctotal.com.br/noticias/obra-x?a=1');
});
