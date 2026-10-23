'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { avaliarPauta } = require('../src/pautas');

const sim = [
  ['Moradores dos Ingleses reclamam de esgoto na praia', '', true],
  ['Buraco na Rua Fúlvio Aducci, no Estreito, causa transtornos há meses', 'Moradores cobram a prefeitura.', true],
  ['Comunidade do Saco Grande pede ponto de ônibus coberto', '', true],
  ['Creche no Campeche tem fila de espera de 300 crianças; pais cobram vagas', '', true],
  ['Iluminação pública apagada há semanas deixa moradores do Rio Vermelho com medo', '', true],
  ['Estudantes da Univali cobram melhorias no acesso ao campus em Florianópolis', '', false],
];
const nao = [
  ['Ato pró-Lula leva multidão ao Centro de Florianópolis', '', true],
  ['Avaí anuncia acesso gratuito à Ressacada', '', true],
  ['Previsão do tempo hoje em SC: chuva e temporais colocam regiões em alerta', '', false],
  ['Centro de Saúde do Pântano do Sul promove atividades do Outubro Rosa', 'Agendamento de consultas pelo telefone.', true],
  ['Requerimento de Informações ao Executivo N.º 00248/2026', '', false],
  ['Fiscalização encontra animais feridos e risco de contaminação de rio em Xanxerê', '', false],
  ['Prefeitura inaugura nova praça no Jardim Atlântico', '', true],
  ['Obra de esgoto nos Ingleses e Santinho chega a 44% da rede prevista', '', true],
];
for (const [t, r, b] of sim) test(`pauta: ${t}`, () => assert.equal(avaliarPauta({ titulo: t, resumo: r }, b, b || /Florian/.test(t)).pauta, true));
for (const [t, r, b] of nao) test(`não é pauta: ${t}`, () => assert.equal(avaliarPauta({ titulo: t, resumo: r }, b, b || /Florian/.test(t)).pauta, false));
