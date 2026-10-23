'use strict';
/** Marca matérias de agenda (cursos, palestras, eventos) e diz o tipo principal. */
const { normalizar } = require('./util');

let compilado = null;
function re(termos) {
  return new RegExp(termos.map((t) => `(?<![a-z0-9])${normalizar(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z0-9])`).join('|'), 'gi');
}
function obter(cfg) {
  if (!compilado || compilado.origem !== cfg) {
    compilado = {
      origem: cfg, minimo: cfg.minimo || 6,
      tipos: Object.entries(cfg.tipos).map(([id, t]) => ({ id, nome: t.nome, emoji: t.emoji, re: re(t.termos) })),
      sinais: re(cfg.sinais), bloqueio: re(cfg.bloqueios),
    };
  }
  return compilado;
}
const contar = (texto, r) => (texto.match(r) || []).length;

/**
 * @returns {{agenda:string, pontos:number}} agenda = '' | 'curso' | 'palestra' | 'evento'
 */
function avaliarAgenda(item, cfg = require('./agenda.json')) {
  const c = obter(cfg);
  const titulo = normalizar(item.titulo || '');
  const texto = normalizar(`${item.resumo || ''} ${(item.conteudo || '').slice(0, 1500)}`);
  if (contar(titulo, c.bloqueio) > 0) return { agenda: '', pontos: 0 };
  let melhor = null;
  for (const t of c.tipos) {
    const noTitulo = Math.min(contar(titulo, t.re), 2);
    const p = noTitulo * 6 + Math.min(contar(texto, t.re), 3) * 3;
    if (p > 0 && (!melhor || p > melhor.p)) melhor = { id: t.id, p, noTitulo };
  }
  if (!melhor) return { agenda: '', pontos: 0 };
  const sinais = Math.min(contar(titulo, c.sinais), 2) * 4 + Math.min(contar(texto, c.sinais), 4) * 2;
  const pontos = melhor.p + sinais;
  // Precisa do tipo (curso, palestra, evento...) no título e de um sinal de participação (inscrição, data, gratuito...)
  const ok = pontos >= c.minimo && melhor.noTitulo > 0 && sinais > 0;
  return { agenda: ok ? melhor.id : '', pontos };
}

function listaTiposAgenda(cfg = require('./agenda.json')) {
  return Object.entries(cfg.tipos).map(([id, t]) => ({ id, nome: t.nome, emoji: t.emoji }));
}

module.exports = { avaliarAgenda, listaTiposAgenda };
