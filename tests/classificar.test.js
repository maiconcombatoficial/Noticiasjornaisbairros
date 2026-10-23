'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { classificar } = require('../src/classificar');

const sc = { escopo: 'sc' };
const casos = [
  ['Rótula na Lagoa da Conceição é liberada em Florianópolis', sc, { regioes: ['leste'], bairros: ['lagoa-da-conceicao'] }],
  ['Homem é preso no Centro de Florianópolis', sc, { regioes: ['centro'], bairros: ['centro-bairro'] }],
  ['Casa pega fogo no Estreito, em Florianópolis', sc, { regioes: ['continente'], bairros: ['estreito'] }],
  ['Obra no bairro Pantanal, em Florianópolis, interdita rua', sc, { regioes: ['centro'], bairros: ['pantanal'] }],
  ['Moradores dos Ingleses reclamam de esgoto na praia', sc, { regioes: ['norte'], bairros: ['ingleses'] }],
  ['Prefeitura asfalta rua no bairro Daniela, em Florianópolis', sc, { regioes: ['norte'], bairros: ['daniela'] }],
  ['Campeche ganha ciclovia', { escopo: 'br' }, { floripa: false }],
  ['Campeche ganha ciclovia em Florianópolis', { escopo: 'br' }, { regioes: ['sul'], bairros: ['campeche'] }],
  ['Queimadas no Pantanal batem recorde', { escopo: 'br' }, { floripa: false }],
  ['Praia Brava terá novo acesso em Itajaí', sc, { floripa: false }],
  ['Balneário Camboriú recebe evento', sc, { floripa: false }],
  ['Palhoça inaugura escola no centro', sc, { floripa: false }],
  ['Daniela Mercury faz show em Florianópolis', sc, { regioes: [], bairros: [], geral: true }],
  ['Acidente na SC-401 deixa feridos na Capital', sc, { geral: true }],
  ['Festa da Tainha no Norte da Ilha', sc, { regioes: ['norte'], bairros: [] }],
  ['UFSC abre vagas para pós', { escopo: 'local', bairro_fixo: 'trindade' }, { regioes: ['centro'], bairros: ['trindade'] }],
  ['Aeroporto de Florianópolis bate recorde de passageiros', sc, { regioes: ['sul'], bairros: ['carianos'] }],
  ['Travessia para a Costa da Lagoa terá novo horário', sc, { regioes: ['leste'] }],
  ['Rio Vermelho recebe mutirão de limpeza na Praia do Moçambique', sc, { regioes: ['leste'] }],
  ['Fábrica fecha em Joinville', sc, { floripa: false }],
];

for (const [titulo, fonte, esperado] of casos) {
  test(titulo, () => {
    const r = classificar({ titulo }, fonte);
    if (esperado.floripa === false) { assert.equal(r.floripa, false); return; }
    assert.equal(r.floripa, true);
    if (esperado.regioes) assert.deepEqual([...r.regioes].sort(), [...esperado.regioes].sort());
    if (esperado.bairros) assert.deepEqual([...r.bairros].sort(), [...esperado.bairros].sort());
    if (esperado.geral !== undefined) assert.equal(r.geral, esperado.geral);
  });
}

test('título em outra cidade com resumo que cita Florianópolis de passagem não entra', () => {
  const r = classificar({ titulo: 'São José inaugura hospital', resumo: 'Unidade atende também moradores de Florianópolis.' }, sc);
  assert.equal(r.floripa, false);
});

test('Ressacada é em Carianos, não na Trindade', () => {
  const r = classificar({ titulo: 'Avaí anuncia acesso gratuito à Ressacada, em Florianópolis' }, sc);
  assert.deepEqual(r.bairros, ['carianos']);
});
test('"no centro de inovação" não é o bairro Centro', () => {
  const r = classificar({ titulo: 'Prefeitura de Florianópolis entrega cartas no centro de inovação ACATE' }, sc);
  assert.deepEqual(r.bairros, []);
});
test('busca por bairro no Google: Praia Brava de Itajaí não entra', () => {
  const r = classificar({ titulo: 'Escorpiões na Praia Brava: ação mobiliza Vigilância em Itajaí' }, sc);
  assert.equal(r.floripa, false);
});
test('busca por bairro no Google: Jurerê sem citar Florianópolis entra', () => {
  const r = classificar({ titulo: 'Halloween em Jurerê Internacional tem Túnel do Terror' }, sc);
  assert.deepEqual(r.bairros, ['jurere']);
});
test('"capital de giro" não é Florianópolis', () => {
  const r = classificar({ titulo: 'Banco libera capital de giro para pequenas empresas de SC' }, sc);
  assert.equal(r.floripa, false);
});
