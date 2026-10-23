'use strict';
/** Marca matérias de agenda (cursos, palestras, eventos...): formato principal e até dois temas. */
const { normalizar } = require('./util');

let compilado = null;
function re(termos) {
  return new RegExp(termos.map((t) => `(?<![a-z0-9])${normalizar(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z0-9])`).join('|'), 'gi');
}
function obter(cfg) {
  if (!compilado || compilado.origem !== cfg) {
    compilado = {
      origem: cfg, minimo: cfg.minimo || 8,
      formatos: Object.entries(cfg.formatos).map(([id, t]) => ({ id, nome: t.nome, emoji: t.emoji, re: re(t.termos) })),
      temas: Object.entries(cfg.temas).map(([id, t]) => ({ id, nome: t.nome, emoji: t.emoji, re: re(t.termos) })),
      sinais: re(cfg.sinais), bloqueio: re(cfg.bloqueios),
    };
  }
  return compilado;
}
const contar = (texto, r) => (texto.match(r) || []).length;

/**
 * @returns {{agenda:string, temas:string[], pontos:number}} agenda = '' ou o id do formato (curso, oficina, palestra, congresso, evento, acao, esportivo)
 */
function avaliarAgenda(item, cfg = require('./agenda.json')) {
  const c = obter(cfg);
  const titulo = normalizar(item.titulo || '');
  const texto = normalizar(`${item.resumo || ''} ${(item.conteudo || '').slice(0, 1500)}`);
  if (contar(titulo, c.bloqueio) > 0) return { agenda: '', temas: [], pontos: 0 };
  let melhor = null;
  for (const f of c.formatos) {
    const noTitulo = Math.min(contar(titulo, f.re), 2);
    const p = noTitulo * 6 + Math.min(contar(texto, f.re), 3) * 3;
    if (p > 0 && (!melhor || p > melhor.p)) melhor = { id: f.id, p, noTitulo }; // empate: vale a ordem do arquivo
  }
  if (!melhor) return { agenda: '', temas: [], pontos: 0 };
  const sinais = Math.min(contar(titulo, c.sinais), 2) * 4 + Math.min(contar(texto, c.sinais), 4) * 2;
  const pontos = melhor.p + sinais;
  // Precisa do formato (curso, palestra, evento...) no título e de um sinal de participação (inscrição, data, gratuito...)
  const ok = pontos >= c.minimo && melhor.noTitulo > 0 && sinais > 0;
  if (!ok) return { agenda: '', temas: [], pontos };
  const temas = c.temas.map((t) => ({ id: t.id, p: Math.min(contar(titulo, t.re), 3) * 2 + Math.min(contar(texto, t.re), 4) }))
    .filter((t) => t.p >= 2).sort((a, b) => b.p - a.p);
  const principal = temas[0] ? temas[0].p : 0;
  return { agenda: melhor.id, temas: temas.filter((t) => t.p * 2 >= principal).slice(0, 2).map((t) => t.id), pontos };
}

function listaTiposAgenda(cfg = require('./agenda.json')) {
  return Object.entries(cfg.formatos).map(([id, t]) => ({ id, nome: t.nome, emoji: t.emoji }));
}
function listaTemasAgenda(cfg = require('./agenda.json')) {
  return Object.entries(cfg.temas).map(([id, t]) => ({ id, nome: t.nome, emoji: t.emoji })).concat([{ id: 'outros', nome: 'Outros temas', emoji: '📌' }]);
}

module.exports = { avaliarAgenda, listaTiposAgenda, listaTemasAgenda };
