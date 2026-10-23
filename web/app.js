/* Floripa por Bairro — interface. Sem dependências. Lê api/noticias.json e api/bairros.json. */
(() => {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const el = {
    regioes: $('#regioes'), bairros: $('#bairros'), assuntos: $('#assuntos'), lista: $('#lista'), vazio: $('#vazio'), vazioDica: $('#vazio-dica'), mais: $('#mais'),
    busca: $('#busca'), periodo: $('#periodo'), incluirGeral: $('#incluir-geral'), rotuloGeral: $('#rotulo-geral'), contagem: $('#contagem'),
    atualizado: $('#atualizado'), fontesOk: $('#fontes-ok'), btnAtualizar: $('#btn-atualizar'), btnFontes: $('#btn-fontes'),
    dlg: $('#dlg-fontes'), fecharFontes: $('#fechar-fontes'), listaFontes: $('#lista-fontes'), tpl: $('#tpl-card'),
  };
  const PAGINA = 40;
  const estado = { regiao: 'todas', bairro: '', assunto: '', q: '', horas: 72, incluirGeral: true, pagina: 1 };
  let dados = { noticias: [], contagem: { regioes: {}, bairros: {} } };
  let cfg = { regioes: [] };
  let status = null;
  const mapaRegiao = new Map();
  const mapaBairro = new Map();
  const mapaAssunto = new Map();

  // ---------- utilidades ----------
  const norm = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  function tempoRelativo(iso) {
    const d = new Date(iso); const diff = (Date.now() - d.getTime()) / 1000;
    if (!Number.isFinite(diff)) return '';
    if (diff < 60) return 'agora';
    if (diff < 3600) return `${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} h`;
    if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} d`;
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  }
  function rotuloDia(iso) {
    const d = new Date(iso); const hoje = new Date(); const ontem = new Date(); ontem.setDate(hoje.getDate() - 1);
    const mesmo = (a, b) => a.toDateString() === b.toDateString();
    if (mesmo(d, hoje)) return 'Hoje';
    if (mesmo(d, ontem)) return 'Ontem';
    return d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  }
  function destacar(texto, termo) {
    if (!termo) return document.createTextNode(texto);
    const frag = document.createDocumentFragment();
    const n = norm(texto); const t = norm(termo); let i = 0;
    while (true) {
      const p = n.indexOf(t, i);
      if (p < 0) { frag.appendChild(document.createTextNode(texto.slice(i))); break; }
      frag.appendChild(document.createTextNode(texto.slice(i, p)));
      const m = document.createElement('mark'); m.textContent = texto.slice(p, p + t.length); frag.appendChild(m);
      i = p + t.length;
    }
    return frag;
  }

  // ---------- estado na URL (#/regiao/bairro?q=) ----------
  function lerHash() {
    const h = location.hash.replace(/^#\/?/, '');
    const [caminho, query] = h.split('?');
    const [regiao, bairro] = caminho.split('/').map(decodeURIComponent);
    estado.regiao = regiao && mapaRegiao.has(regiao) ? regiao : 'todas';
    estado.bairro = bairro && mapaBairro.has(bairro) ? bairro : '';
    const qs = new URLSearchParams(query || '');
    estado.q = qs.get('q') || ''; el.busca.value = estado.q;
    if (qs.has('h')) estado.horas = Number(qs.get('h'));
    estado.assunto = qs.get('a') && mapaAssunto.has(qs.get('a')) ? qs.get('a') : '';
    if (qs.has('geral')) estado.incluirGeral = qs.get('geral') !== '0';
  }
  function gravarHash() {
    let h = `#/${estado.regiao}`;
    if (estado.bairro) h += `/${estado.bairro}`;
    const qs = new URLSearchParams();
    if (estado.q) qs.set('q', estado.q);
    if (estado.assunto) qs.set('a', estado.assunto);
    if (estado.horas !== 72) qs.set('h', String(estado.horas));
    if (!estado.incluirGeral) qs.set('geral', '0');
    const s = qs.toString();
    history.replaceState(null, '', h + (s ? `?${s}` : ''));
  }

  // ---------- filtragem ----------
  function filtrar() {
    const limite = estado.horas ? Date.now() - estado.horas * 3600e3 : 0;
    const q = norm(estado.q.trim());
    const termosBairro = q ? [...mapaBairro.values()].filter((b) => norm(b.nome).includes(q)).map((b) => b.id) : [];
    return dados.noticias.filter((n) => {
      if (limite && new Date(n.publicado_em).getTime() < limite) return false;
      if (estado.bairro) { if (!n.bairros.includes(estado.bairro)) return false; }
      else if (estado.regiao !== 'todas') { if (!n.regioes.includes(estado.regiao)) return false; }
      else if (!estado.incluirGeral && n.geral) return false;
      if (estado.assunto && !n.assuntos.includes(estado.assunto)) return false;
      if (q) {
        const alvo = norm(`${n.titulo} ${n.resumo} ${n.fonte}`);
        if (!alvo.includes(q) && !n.bairros.some((b) => termosBairro.includes(b))) return false;
      }
      return true;
    });
  }
  function contar(filtroFn) {
    // contagens respeitando período e busca, mas não região/bairro
    const limite = estado.horas ? Date.now() - estado.horas * 3600e3 : 0;
    const q = norm(estado.q.trim());
    const c = { regioes: {}, bairros: {}, assuntos: {}, total: 0, geral: 0 };
    for (const n of dados.noticias) {
      if (limite && new Date(n.publicado_em).getTime() < limite) continue;
      if (q && !norm(`${n.titulo} ${n.resumo} ${n.fonte}`).includes(q)) continue;
      const noLugar = estado.bairro ? n.bairros.includes(estado.bairro) : estado.regiao !== 'todas' ? n.regioes.includes(estado.regiao) : (estado.incluirGeral || !n.geral);
      if (noLugar) for (const a of n.assuntos) c.assuntos[a] = (c.assuntos[a] || 0) + 1;
      if (estado.assunto && !n.assuntos.includes(estado.assunto)) continue;
      c.total++;
      if (n.geral) c.geral++;
      for (const r of n.regioes) c.regioes[r] = (c.regioes[r] || 0) + 1;
      for (const b of n.bairros) c.bairros[b] = (c.bairros[b] || 0) + 1;
    }
    return c;
  }

  // ---------- render ----------
  function renderRegioes(c) {
    el.regioes.innerHTML = '';
    const todas = document.createElement('button');
    todas.innerHTML = `<span class="ponto" style="--c:var(--geral)"></span>Todas <span class="n">${c.total}</span>`;
    todas.classList.toggle('ativo', estado.regiao === 'todas');
    todas.onclick = () => { estado.regiao = 'todas'; estado.bairro = ''; estado.pagina = 1; render(); };
    el.regioes.appendChild(todas);
    for (const r of cfg.regioes) {
      const b = document.createElement('button');
      b.style.setProperty('--c', r.cor);
      b.innerHTML = `<span class="ponto"></span>${r.nome} <span class="n">${c.regioes[r.id] || 0}</span>`;
      b.classList.toggle('ativo', estado.regiao === r.id);
      b.onclick = () => { estado.regiao = r.id; estado.bairro = ''; estado.pagina = 1; render(); };
      el.regioes.appendChild(b);
    }
    el.regioes.querySelector('.ativo')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }
  function renderBairros(c) {
    el.bairros.innerHTML = '';
    const r = mapaRegiao.get(estado.regiao);
    if (!r) return;
    const todos = document.createElement('button');
    todos.style.setProperty('--c', r.cor);
    todos.innerHTML = `Toda a região <span class="n">${c.regioes[r.id] || 0}</span>`;
    todos.classList.toggle('ativo', !estado.bairro);
    todos.onclick = () => { estado.bairro = ''; estado.pagina = 1; render(); };
    el.bairros.appendChild(todos);
    const ordenados = [...r.bairros].sort((a, b) => (c.bairros[b.id] || 0) - (c.bairros[a.id] || 0) || a.nome.localeCompare(b.nome, 'pt-BR'));
    for (const bairro of ordenados) {
      const n = c.bairros[bairro.id] || 0;
      const b = document.createElement('button');
      b.style.setProperty('--c', r.cor);
      b.innerHTML = `${bairro.nome}<span class="n">${n}</span>`;
      b.classList.toggle('ativo', estado.bairro === bairro.id);
      b.classList.toggle('vazio', n === 0);
      b.onclick = () => { estado.bairro = bairro.id; estado.pagina = 1; render(); };
      el.bairros.appendChild(b);
    }
    el.bairros.querySelector('.ativo')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }
  function renderAssuntos(c) {
    el.assuntos.innerHTML = '';
    if (!mapaAssunto.size) return;
    const todos = document.createElement('button');
    todos.textContent = 'Todos os assuntos';
    todos.classList.toggle('ativo', !estado.assunto);
    todos.onclick = () => { estado.assunto = ''; estado.pagina = 1; render(); };
    el.assuntos.appendChild(todos);
    const ordenados = [...mapaAssunto.values()].sort((a, b) => (c.assuntos[b.id] || 0) - (c.assuntos[a.id] || 0));
    for (const a of ordenados) {
      const n = c.assuntos[a.id] || 0;
      const b = document.createElement('button');
      b.innerHTML = `${a.emoji || ''} ${a.nome}<span class="n">${n}</span>`;
      b.classList.toggle('ativo', estado.assunto === a.id);
      b.classList.toggle('vazio', n === 0);
      b.onclick = () => { estado.assunto = estado.assunto === a.id ? '' : a.id; estado.pagina = 1; render(); };
      el.assuntos.appendChild(b);
    }
    el.assuntos.querySelector('.ativo')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }
  function card(n) {
    const frag = el.tpl.content.cloneNode(true);
    const a = $('.card-link', frag); a.href = n.url;
    if (n.imagem) { const w = $('.card-img', frag); w.hidden = false; const img = $('img', w); img.src = n.imagem; img.onerror = () => { w.hidden = true; }; }
    $('.fonte', frag).textContent = n.fonte || 'Fonte';
    const t = $('time', frag); t.dateTime = n.publicado_em; t.textContent = tempoRelativo(n.publicado_em);
    t.title = new Date(n.publicado_em).toLocaleString('pt-BR');
    $('.titulo', frag).appendChild(destacar(n.titulo, estado.q.trim()));
    if (n.resumo && norm(n.resumo) !== norm(n.titulo)) $('.resumo', frag).appendChild(destacar(n.resumo, estado.q.trim()));
    const tags = $('.tags', frag);
    const regioesComBairro = new Set(n.bairros.map((b) => mapaBairro.get(b)?.regiao));
    for (const rid of n.regioes) {
      if (regioesComBairro.has(rid)) continue;
      const r = mapaRegiao.get(rid); if (!r) continue;
      const s = document.createElement('span'); s.className = 'tag regiao'; s.style.setProperty('--c', r.cor); s.textContent = r.nome; tags.appendChild(s);
    }
    for (const bid of n.bairros) {
      const b = mapaBairro.get(bid); if (!b) continue;
      const s = document.createElement('span'); s.className = 'tag'; s.style.setProperty('--c', mapaRegiao.get(b.regiao)?.cor || 'var(--geral)'); s.textContent = b.nome; tags.appendChild(s);
    }
    if (!n.regioes.length && !n.bairros.length) { const s = document.createElement('span'); s.className = 'tag'; s.textContent = 'Floripa'; tags.appendChild(s); }
    for (const aid of n.assuntos) {
      const a = mapaAssunto.get(aid); if (!a) continue;
      const s = document.createElement('span'); s.className = 'tag assunto'; s.textContent = `${a.emoji || ''} ${a.nome}`.trim();
      s.title = `Ver só ${a.nome}`; s.style.cursor = 'pointer';
      s.onclick = (e) => { e.preventDefault(); e.stopPropagation(); estado.assunto = aid; estado.pagina = 1; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); };
      tags.appendChild(s);
    }
    return frag;
  }
  function renderLista(itens) {
    el.lista.innerHTML = '';
    const mostrar = itens.slice(0, estado.pagina * PAGINA);
    let diaAtual = '';
    for (const n of mostrar) {
      const d = rotuloDia(n.publicado_em);
      if (d !== diaAtual) { diaAtual = d; const h = document.createElement('div'); h.className = 'dia'; h.textContent = d; el.lista.appendChild(h); }
      el.lista.appendChild(card(n));
    }
    el.vazio.hidden = itens.length > 0;
    el.mais.hidden = mostrar.length >= itens.length;
    if (!itens.length) {
      el.vazioDica.textContent = dados.noticias.length
        ? 'Tente outro período, outro bairro ou veja as notícias gerais de Floripa.'
        : 'A primeira coleta ainda não rodou. Em modo servidor ela começa sozinha; no GitHub Pages, aguarde a ação agendada.';
    }
  }
  function render() {
    gravarHash();
    const c = contar();
    renderRegioes(c);
    renderBairros(c);
    renderAssuntos(c);
    el.rotuloGeral.hidden = estado.regiao !== 'todas';
    const itens = filtrar();
    const onde = estado.bairro ? mapaBairro.get(estado.bairro)?.nome : estado.regiao === 'todas' ? 'Florianópolis' : mapaRegiao.get(estado.regiao)?.nome;
    const assuntoNome = estado.assunto ? mapaAssunto.get(estado.assunto)?.nome : '';
    el.contagem.textContent = `${itens.length} ${itens.length === 1 ? 'notícia' : 'notícias'} · ${onde}${assuntoNome ? ` · ${assuntoNome}` : ''}${estado.q ? ` · “${estado.q}”` : ''}`;
    renderLista(itens);
  }
  function renderRodape() {
    if (dados.gerado_em) {
      const d = new Date(dados.gerado_em);
      el.atualizado.textContent = `Atualizado ${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    }
    if (status && status.fontes) {
      const ok = status.fontes.filter((f) => !f.erro).length;
      el.fontesOk.textContent = `${ok}/${status.fontes.length} fontes respondendo`;
    }
  }
  function renderFontes() {
    el.listaFontes.innerHTML = '';
    if (!status || !status.fontes || !status.fontes.length) { el.listaFontes.innerHTML = '<p class="painel-nota">Nenhuma coleta registrada ainda.</p>'; return; }
    const fontes = [...status.fontes].sort((a, b) => (b.total_itens || 0) - (a.total_itens || 0));
    for (const f of fontes) {
      const div = document.createElement('div');
      div.className = 'fonte-linha' + (f.erro ? (f.falhas_seguidas >= 8 ? ' pausada' : ' erro') : '');
      const rel = f.ultimo_ok ? tempoRelativo(f.ultimo_ok) : '';
      const quando = f.ultimo_ok ? (rel === 'agora' ? 'respondeu agora' : /^\d/.test(rel) ? `ok há ${rel}` : `ok em ${rel}`) : 'nunca respondeu';
      const detalhe = f.erro ? `${f.falhas_seguidas >= 8 ? 'pausada' : 'erro'}: ${f.erro} · ${quando}` : `${quando} · ${f.itens_ultima || 0} itens na última coleta`;
      div.innerHTML = `<span class="status"></span><div><div>${f.nome}${f.site ? ` <a href="${f.site}" target="_blank" rel="noopener" style="color:var(--texto-2)">↗</a>` : ''}</div><small>${detalhe}</small></div><div class="num">${f.total_itens || 0}<small>notícias</small></div>`;
      el.listaFontes.appendChild(div);
    }
  }

  // ---------- carregamento ----------
  async function carregarJson(url) {
    const r = await fetch(`${url}?_=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status} em ${url}`);
    return r.json();
  }
  async function carregar() {
    el.btnAtualizar.classList.add('girando');
    try {
      const [b, n, s] = await Promise.all([
        carregarJson('api/bairros.json').catch(() => cfg),
        carregarJson('api/noticias.json').catch(() => ({ noticias: [], contagem: {} })),
        carregarJson('api/status.json').catch(() => null),
      ]);
      cfg = b; dados = n; status = s;
      mapaRegiao.clear(); mapaBairro.clear(); mapaAssunto.clear();
      for (const r of cfg.regioes || []) { mapaRegiao.set(r.id, r); for (const bb of r.bairros) mapaBairro.set(bb.id, { ...bb, regiao: r.id }); }
      for (const a of cfg.assuntos || []) mapaAssunto.set(a.id, a);
      dados.noticias = (dados.noticias || []).map((x) => ({ ...x, regioes: x.regioes || [], bairros: x.bairros || [], assuntos: x.assuntos || [] })).sort((x, y) => (y.publicado_em || '').localeCompare(x.publicado_em || ''));
      lerHash();
      sincronizarControles();
      render();
      renderRodape();
    } finally {
      el.btnAtualizar.classList.remove('girando');
    }
  }
  function sincronizarControles() {
    for (const b of el.periodo.querySelectorAll('button')) b.classList.toggle('ativo', Number(b.dataset.h) === estado.horas);
    el.incluirGeral.checked = estado.incluirGeral;
  }

  // ---------- eventos ----------
  let tmr;
  el.busca.addEventListener('input', () => { clearTimeout(tmr); tmr = setTimeout(() => { estado.q = el.busca.value; estado.pagina = 1; render(); }, 180); });
  el.periodo.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; estado.horas = Number(b.dataset.h); estado.pagina = 1; sincronizarControles(); render(); });
  el.incluirGeral.addEventListener('change', () => { estado.incluirGeral = el.incluirGeral.checked; estado.pagina = 1; render(); });
  el.mais.addEventListener('click', () => { estado.pagina++; render(); });
  el.btnAtualizar.addEventListener('click', async () => {
    // Em modo servidor, pede uma coleta nova; em modo estático só recarrega o JSON.
    try { await fetch('api/coletar', { method: 'GET' }); } catch { /* estático */ }
    carregar();
  });
  el.btnFontes.addEventListener('click', () => { renderFontes(); el.dlg.showModal(); });
  el.fecharFontes.addEventListener('click', () => el.dlg.close());
  el.dlg.addEventListener('click', (e) => { if (e.target === el.dlg) el.dlg.close(); });
  window.addEventListener('hashchange', () => { lerHash(); sincronizarControles(); render(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && dados.gerado_em && Date.now() - new Date(dados.gerado_em).getTime() > 10 * 60e3) carregar(); });
  setInterval(() => { if (!document.hidden) carregar(); }, 15 * 60e3);

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  carregar().catch((e) => { el.contagem.textContent = `Não consegui carregar as notícias: ${e.message}`; });
})();
