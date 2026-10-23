'use strict';
/** Marca matérias que trazem demandas da comunidade (reclamações, cobranças, problemas de bairro). */
const { normalizar } = require('./util');

let compilado = null;
function re(termos) {
  return new RegExp(termos.map((t) => `(?<![a-z0-9])${normalizar(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z0-9])`).join('|'), 'gi');
}
function obter(cfg) {
  if (!compilado || compilado.origem !== cfg) {
    compilado = { origem: cfg, demanda: re(cfg.demanda), problema: re(cfg.problema), ocorrencia: re(cfg.ocorrencia || []), poder: re(cfg.poder_publico), bloqueio: re(cfg.bloqueios), minimo: cfg.minimo || 5 };
  }
  return compilado;
}
const contar = (texto, r) => (texto.match(r) || []).length;
const RE_DOCUMENTO = /^(requerimento|indicacao|mocao|projeto de lei|oficio|pedido de informac|emenda|parecer)\b/;
const RE_FLORIPA = /florianopolis|floripa/;

/**
 * @param {{titulo:string, resumo?:string, conteudo?:string}} item
 * @param {boolean} temBairro a notícia tem bairro identificado
 * @param {boolean} localizada tem bairro ou região identificados (ou cita Florianópolis no título)
 * @returns {{pauta:boolean, pontos:number}}
 */
function avaliarPauta(item, temBairro = false, localizada = true, cfg = require('./pautas.json')) {
  const c = obter(cfg);
  const titulo = normalizar(item.titulo || '');
  const texto = normalizar(`${item.resumo || ''} ${(item.conteudo || '').slice(0, 1500)}`);
  if (!localizada && !RE_FLORIPA.test(titulo)) return { pauta: false, pontos: 0 };
  if (RE_DOCUMENTO.test(titulo) || contar(titulo, c.bloqueio) > 0) return { pauta: false, pontos: 0 };
  const demandaTitulo = contar(titulo, c.demanda);
  const demandaTexto = contar(texto, c.demanda);
  const problemaTitulo = contar(titulo, c.problema);
  const demanda = Math.min(demandaTitulo, 2) * 6 + Math.min(demandaTexto, 3) * 3;
  const problema = Math.min(problemaTitulo, 2) * 4 + Math.min(contar(texto, c.problema), 3) * 2;
  const ocorrencia = Math.min(contar(titulo, c.ocorrencia) + contar(texto, c.ocorrencia), 2);
  const poder = Math.min(contar(titulo, c.poder) + contar(texto, c.poder), 2);
  const pontos = demanda + problema + ocorrencia + poder + (temBairro ? 1 : 0);
  // Precisa de alguém cobrando/reclamando, ou de um problema evidente já no título
  const temGatilho = demandaTitulo + demandaTexto > 0 || problemaTitulo >= 2;
  return { pauta: temGatilho && pontos >= c.minimo, pontos };
}

module.exports = { avaliarPauta };
