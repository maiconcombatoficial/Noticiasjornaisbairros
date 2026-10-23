'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { avaliarAgenda } = require('../src/agenda');
const casos = [
  ['Senac abre inscrições para curso gratuito de garçom em Florianópolis', 'curso'],
  ['Florianópolis terá aulão gratuito de preparação para o Enem no dia 27', 'curso'],
  ['Palestra sobre segurança no trânsito reúne motoristas no Estreito', 'palestra'],
  ['Em Florianópolis, CRECI/SC promove encontro gratuito sobre inteligência artificial', 'palestra'],
  ['Prefeitura promove mutirão de castração gratuita no Campeche neste sábado', 'evento'],
  ['Floripa Instrumental 2025 celebra três dias de música no Ribeirão da Ilha', 'evento'],
  ['Moradores dos Ingleses reclamam de esgoto na praia', ''],
  ['Avaí vence o Athletic por 2 a 1 na Ressacada', ''],
  ['Previsão do tempo em Florianópolis: nublado', ''],
  ['Homem é preso após assalto a curso de idiomas no Centro', ''],
];
for (const [t, e] of casos) test(`${t} → ${e || 'não é agenda'}`, () => assert.equal(avaliarAgenda({ titulo: t }).agenda, e));
