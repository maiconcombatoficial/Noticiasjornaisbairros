'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { classificarAssuntos } = require('../src/assuntos');

const casos = [
  ['Carro despenca e invade casa na SC-401 em Florianópolis', 'transito'],
  ['Homem é preso por tráfico de drogas nos Ingleses', 'seguranca'],
  ['Previsão do tempo em Florianópolis: nublado com máxima de 21.8°C', 'clima'],
  ['Ato pró-Lula leva multidão ao Centro de Florianópolis no 2º turno', 'politica'],
  ['UFSC abre edital de transferência com 5 mil vagas', 'educacao'],
  ['Centro de Saúde do Pântano do Sul promove atividades do Outubro Rosa', 'saude'],
  ['Avaí anuncia acesso gratuito à Ressacada', 'esporte'],
  ['Obra de esgoto nos Ingleses e Santinho chega a 44% da rede prevista', 'obras'],
  ['Halloween em Jurerê Internacional tem Túnel do Terror e recreação infantil', 'cultura'],
  ['Florianópolis ganha mais três praias com Bandeira Azul', 'meio-ambiente'],
];
for (const [titulo, esperado] of casos) {
  test(`${titulo} → ${esperado}`, () => {
    const r = classificarAssuntos({ titulo });
    assert.equal(r[0], esperado, `veio ${r.join(',')}`);
  });
}
test('sem palavras-chave fica sem assunto', () => {
  assert.deepEqual(classificarAssuntos({ titulo: 'Resultado da Mega-Sena' }), []);
});
test('rótula da Lagoa não vira meio ambiente só pelo nome do lugar', () => {
  const r = classificarAssuntos({ titulo: 'Nova rótula da Lagoa da Conceição é liberada para destravar gargalo' });
  assert.deepEqual(r, ['transito']);
});
