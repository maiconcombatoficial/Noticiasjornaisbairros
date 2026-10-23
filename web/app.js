/* Floripa por Bairro — interface. Sem dependências. Lê api/noticias.json e api/bairros.json. */
(() => {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const el = {
    regioes: $('#regioes'), selBairro: $('#sel-bairro'), selAssunto: $('#sel-assunto'),
    dlgEscolha: $('#dlg-escolha'), escolhaTitulo: $('#escolha-titulo'), escolhaBusca: $('#escolha-busca'), escolhaLista: $('#escolha-lista'), fecharEscolha: $('#fechar-escolha'), lista: $('#lista'), vazio: $('#vazio'), vazioDica: $('#vazio-dica'), mais: $('#mais'),
    busca: $('#busca'), periodo: $('#periodo'), incluirGeral: $('#incluir-geral'), rotuloGeral: $('#rotulo-geral'), contagem: $('#contagem'),
    atualizado: $('#atualizado'), fontesOk: $('#fontes-ok'), btnAtualizar: $('#btn-atualizar'), btnFontes: $('#btn-fontes'),
    dlg: $('#dlg-fontes'), fecharFontes: $('#fechar-fontes'), listaFontes: $('#lista-fontes'), tpl: $('#tpl-card'),
    puxar: $('#puxar'), puxarTexto: $('.puxar-texto'), avisoVersao: $('#aviso-versao'), btnVersao: $('#btn-versao'), toast: $('#toast'), versao: $('#versao'),
    toastTexto: $('#toast-texto'), toastAcao: $('#toast-acao'), btnArquivadas: $('#btn-arquivadas'), btnLerDepois: $('#btn-lerdepois'), btnPautas: $('#btn-pautas'),
  };
  const APP_VERSAO = '1.9';
  const PAGINA = 40;
  const estado = { regiao: 'todas', bairro: '', assunto: '', q: '', horas: 72, incluirGeral: true, pagina: 1, visao: 'normal', pauta: false };
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

  // ---------- listas locais: arquivadas e ler depois (ficam só neste aparelho) ----------
  const chaveTitulo = (t) => norm(t).replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean).slice(0, 14).join(' ');
  function listaLocal(chave) {
    const porId = new Map(); const porTitulo = new Map();
    try {
      const limite = Date.now() - 45 * 86400e3;
      for (const x of JSON.parse(localStorage.getItem(chave) || '[]')) { if (x.q > limite) { porId.set(x.id, x); if (x.t) porTitulo.set(x.t, x); } }
    } catch { /* sem armazenamento */ }
    const salvar = () => { try { localStorage.setItem(chave, JSON.stringify([...porId.values()])); } catch { /* sem armazenamento */ } };
    return {
      tem: (n) => porId.has(n.id) || porTitulo.has(chaveTitulo(n.titulo)),
      adicionar(n) { const x = { id: n.id, t: chaveTitulo(n.titulo), q: Date.now() }; porId.set(x.id, x); porTitulo.set(x.t, x); salvar(); },
      remover(n) { const t = chaveTitulo(n.titulo); for (const [k, x] of porId) if (x.id === n.id || x.t === t) porId.delete(k); porTitulo.delete(t); salvar(); },
    };
  }
  const arquivadas = listaLocal('fpb-arquivadas');
  const lerDepois = listaLocal('fpb-ler-depois');
  const estaArquivada = (n) => arquivadas.tem(n);

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
    estado.pauta = qs.get('p') === '1';
    if (qs.has('geral')) estado.incluirGeral = qs.get('geral') !== '0';
  }
  function gravarHash() {
    let h = `#/${estado.regiao}`;
    if (estado.bairro) h += `/${estado.bairro}`;
    const qs = new URLSearchParams();
    if (estado.q) qs.set('q', estado.q);
    if (estado.assunto) qs.set('a', estado.assunto);
    if (estado.pauta) qs.set('p', '1');
    if (estado.horas !== 72) qs.set('h', String(estado.horas));
    if (!estado.incluirGeral) qs.set('geral', '0');
    const s = qs.toString();
    history.replaceState(null, '', h + (s ? `?${s}` : ''));
  }

  // ---------- filtragem ----------
  function naVisao(n) {
    if (estado.visao === 'arquivadas') return estaArquivada(n);
    if (estado.visao === 'lerdepois') return lerDepois.tem(n) && !estaArquivada(n);
    return !estaArquivada(n);
  }
  function filtrar() {
    const limite = estado.horas ? Date.now() - estado.horas * 3600e3 : 0;
    const q = norm(estado.q.trim());
    const termosBairro = q ? [...mapaBairro.values()].filter((b) => norm(b.nome).includes(q)).map((b) => b.id) : [];
    return dados.noticias.filter((n) => {
      if (!naVisao(n)) return false;
      if (limite && new Date(n.publicado_em).getTime() < limite) return false;
      if (estado.bairro) { if (!n.bairros.includes(estado.bairro)) return false; }
      else if (estado.regiao !== 'todas') { if (!n.regioes.includes(estado.regiao)) return false; }
      else if (!estado.incluirGeral && n.geral) return false;
      if (estado.assunto && !n.assuntos.includes(estado.assunto)) return false;
      if (estado.pauta && !n.pauta) return false;
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
    const c = { regioes: {}, bairros: {}, assuntos: {}, total: 0, geral: 0, noLugar: 0, pautas: 0 };
    for (const n of dados.noticias) {
      if (!naVisao(n)) continue;
      if (limite && new Date(n.publicado_em).getTime() < limite) continue;
      if (q && !norm(`${n.titulo} ${n.resumo} ${n.fonte}`).includes(q)) continue;
      const noLugar = estado.bairro ? n.bairros.includes(estado.bairro) : estado.regiao !== 'todas' ? n.regioes.includes(estado.regiao) : (estado.incluirGeral || !n.geral);
      if (noLugar && (!estado.assunto || n.assuntos.includes(estado.assunto)) && n.pauta) c.pautas++;
      if (estado.pauta && !n.pauta) continue;
      if (noLugar) { c.noLugar++; for (const a of n.assuntos) c.assuntos[a] = (c.assuntos[a] || 0) + 1; }
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
  function renderSeletores(c) {
    const r = mapaRegiao.get(estado.regiao);
    const b = estado.bairro ? mapaBairro.get(estado.bairro) : null;
    const corRegiao = b ? mapaRegiao.get(b.regiao)?.cor : r?.cor;
    $('.seletor-valor', el.selBairro).textContent = b ? b.nome : r ? `Toda a região` : 'Todos';
    el.selBairro.classList.toggle('ativo', !!b);
    el.selBairro.style.setProperty('--c', corRegiao || 'var(--primaria)');
    const a = estado.assunto ? mapaAssunto.get(estado.assunto) : null;
    $('.seletor-valor', el.selAssunto).textContent = a ? `${a.emoji || ''} ${a.nome}`.trim() : 'Todos';
    el.selAssunto.classList.toggle('ativo', !!a);
  }

  // ---------- painel de escolha (bairro / assunto) ----------
  let escolhaTipo = 'bairro';
  function opcao(texto, n, ativo, cor, onclick, destaque) {
    const bt = document.createElement('button');
    bt.innerHTML = `${texto}<span class="n">${n}</span>`;
    bt.classList.toggle('ativo', ativo); bt.classList.toggle('vazio', n === 0); bt.classList.toggle('destaque', !!destaque);
    if (cor) bt.style.setProperty('--c', cor);
    bt.onclick = () => { onclick(); el.dlgEscolha.close(); estado.pagina = 1; render(); };
    return bt;
  }
  function grupo(nome, cor) {
    const g = document.createElement('div'); g.className = 'folha-grupo';
    g.innerHTML = `<span class="ponto"></span>${nome}`; if (cor) g.style.setProperty('--c', cor);
    return g;
  }
  function renderEscolha() {
    const c = contar();
    const filtro = norm(el.escolhaBusca.value.trim());
    el.escolhaLista.innerHTML = '';
    if (escolhaTipo === 'bairro') {
      const regioes = estado.regiao === 'todas' ? [...mapaRegiao.values()] : [mapaRegiao.get(estado.regiao)];
      if (!filtro) {
        const topo = document.createElement('div'); topo.className = 'folha-opcoes'; topo.style.marginBottom = '8px';
        if (estado.regiao === 'todas') topo.appendChild(opcao('Toda Florianópolis', c.total, !estado.bairro, null, () => { estado.bairro = ''; }, true));
        else topo.appendChild(opcao(`Toda a região · ${mapaRegiao.get(estado.regiao).nome}`, c.regioes[estado.regiao] || 0, !estado.bairro, mapaRegiao.get(estado.regiao).cor, () => { estado.bairro = ''; }, true));
        el.escolhaLista.appendChild(topo);
      }
      for (const r of regioes) {
        const bairros = [...r.bairros].filter((b) => !filtro || norm(b.nome).includes(filtro))
          .sort((x, y) => (c.bairros[y.id] || 0) - (c.bairros[x.id] || 0) || x.nome.localeCompare(y.nome, 'pt-BR'));
        if (!bairros.length) continue;
        el.escolhaLista.appendChild(grupo(r.nome, r.cor));
        const ops = document.createElement('div'); ops.className = 'folha-opcoes';
        for (const b of bairros) ops.appendChild(opcao(b.nome, c.bairros[b.id] || 0, estado.bairro === b.id, r.cor, () => { estado.regiao = r.id; estado.bairro = b.id; }));
        el.escolhaLista.appendChild(ops);
      }
    } else {
      const ops = document.createElement('div'); ops.className = 'folha-opcoes';
      if (!filtro) ops.appendChild(opcao('Todos os assuntos', c.noLugar, !estado.assunto, null, () => { estado.assunto = ''; }, true));
      const lista = [...mapaAssunto.values()].filter((a) => !filtro || norm(a.nome).includes(filtro)).sort((x, y) => (c.assuntos[y.id] || 0) - (c.assuntos[x.id] || 0));
      for (const a of lista) ops.appendChild(opcao(`${a.emoji || ''} ${a.nome}`.trim(), c.assuntos[a.id] || 0, estado.assunto === a.id, null, () => { estado.assunto = a.id; }));
      el.escolhaLista.appendChild(ops);
    }
    if (!el.escolhaLista.children.length) el.escolhaLista.innerHTML = '<p class="painel-nota">Nada encontrado.</p>';
  }
  function abrirEscolha(tipo) {
    escolhaTipo = tipo;
    el.escolhaTitulo.textContent = tipo === 'bairro' ? 'Escolher bairro' : 'Escolher assunto';
    el.escolhaBusca.value = ''; el.escolhaBusca.placeholder = tipo === 'bairro' ? 'Buscar bairro…' : 'Buscar assunto…';
    renderEscolha();
    el.dlgEscolha.showModal();
    el.escolhaLista.scrollTop = 0;
  }
  el.selBairro.addEventListener('click', () => abrirEscolha('bairro'));
  el.selAssunto.addEventListener('click', () => abrirEscolha('assunto'));
  el.escolhaBusca.addEventListener('input', renderEscolha);
  el.fecharEscolha.addEventListener('click', () => el.dlgEscolha.close());
  el.dlgEscolha.addEventListener('click', (e) => { if (e.target === el.dlgEscolha) el.dlgEscolha.close(); });

  async function copiarTexto(texto) {
    try { await navigator.clipboard.writeText(texto); return true; } catch { /* sem permissão: usa o método antigo */ }
    try {
      const ta = document.createElement('textarea'); ta.value = texto; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok;
    } catch { return false; }
  }
  function card(n) {
    const frag = el.tpl.content.cloneNode(true);
    const a = $('.card-link', frag); a.href = n.url;
    const btCopiar = $('.copiar', frag);
    btCopiar.onclick = async (e) => {
      e.preventDefault(); e.stopPropagation();
      const ok = await copiarTexto(n.url);
      toast(ok ? 'Link copiado' : 'Não consegui copiar; segure o título para copiar o link');
      if (ok) { btCopiar.classList.add('ok'); btCopiar.lastChild.textContent = ' Copiado'; setTimeout(() => { btCopiar.classList.remove('ok'); btCopiar.lastChild.textContent = ' Copiar link'; }, 1800); }
    };
    const artigo = $('.card', frag);
    const movel = $('.card-movel', frag);
    const fundo = $('.card-fundo', frag);
    const btArquivar = $('.arquivar', frag);
    const btLerDepois = $('.lerdepois', frag);
    const salvo = lerDepois.tem(n);
    // O que cada lado do arrasto faz depende da lista que está aberta
    const acaoArquivar = { rotulo: 'Arquivar', cor: '#ef4444', executar: () => { arquivadas.adicionar(n); toast('Notícia arquivada', 4000, { rotulo: 'Desfazer', ao: () => { arquivadas.remover(n); render(); } }); } };
    const acaoRestaurar = { rotulo: 'Restaurar', cor: '#10b981', executar: () => { arquivadas.remover(n); toast('Notícia restaurada'); } };
    const acaoSalvar = { rotulo: 'Ler depois', cor: '#0b5fff', executar: () => { lerDepois.adicionar(n); toast('Salva em Ler depois', 2500, { rotulo: 'Ver lista', ao: () => { estado.visao = 'lerdepois'; estado.pagina = 1; render(); window.scrollTo({ top: 0 }); } }); }, semSumir: true };
    const acaoRemover = { rotulo: 'Remover', cor: '#64748b', executar: () => { lerDepois.remover(n); toast('Removida de Ler depois', 4000, { rotulo: 'Desfazer', ao: () => { lerDepois.adicionar(n); render(); } }); } };
    let esquerda = null, direita = null;
    if (estado.visao === 'arquivadas') { direita = acaoRestaurar; }
    else if (estado.visao === 'lerdepois') { esquerda = acaoArquivar; direita = acaoRemover; }
    else { esquerda = acaoArquivar; direita = salvo ? acaoRemover : acaoSalvar; }
    $('span', btArquivar).textContent = estado.visao === 'arquivadas' ? 'Restaurar' : 'Arquivar';
    $('span', btLerDepois).textContent = salvo ? 'Salvo' : 'Ler depois';
    btLerDepois.classList.toggle('salvo', salvo);
    function executar(acao, direcao) {
      if (acao.semSumir) { movel.classList.add('animando'); movel.style.transform = ''; acao.executar(); setTimeout(render, 150); return; }
      movel.classList.add('animando');
      movel.style.transform = `translateX(${direcao > 0 ? '110%' : '-110%'})`; movel.style.opacity = '0';
      setTimeout(() => { acao.executar(); render(); }, 230);
    }
    btArquivar.onclick = (e) => { e.preventDefault(); e.stopPropagation(); executar(estado.visao === 'arquivadas' ? acaoRestaurar : acaoArquivar, estado.visao === 'arquivadas' ? 1 : -1); };
    btLerDepois.onclick = (e) => { e.preventDefault(); e.stopPropagation(); executar(salvo ? acaoRemover : acaoSalvar, 1); };
    // arrastar para os lados (celular)
    let x0 = null, y0 = null, dx = 0, modo = null;
    artigo.addEventListener('touchstart', (e) => { if (e.touches.length !== 1) return; x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; dx = 0; modo = null; movel.classList.remove('animando'); }, { passive: true });
    artigo.addEventListener('touchmove', (e) => {
      if (x0 === null) return;
      const mx = e.touches[0].clientX - x0, my = e.touches[0].clientY - y0;
      if (!modo) { if (Math.abs(mx) < 8 && Math.abs(my) < 8) return; modo = Math.abs(mx) > Math.abs(my) * 1.3 ? 'h' : 'v'; }
      if (modo !== 'h') return;
      const acao = mx < 0 ? esquerda : direita;
      dx = acao ? mx : mx * 0.15; // sem ação daquele lado, quase não anda
      if (acao) { fundo.textContent = acao.rotulo; fundo.style.background = acao.cor; fundo.style.justifyContent = mx < 0 ? 'flex-end' : 'flex-start'; }
      movel.style.transform = `translateX(${dx}px)`;
    }, { passive: true });
    const soltar = () => {
      if (x0 === null) return;
      const limiar = Math.min(120, artigo.offsetWidth * 0.35);
      const acao = dx < 0 ? esquerda : direita;
      if (modo === 'h' && acao && Math.abs(dx) >= limiar) executar(acao, dx < 0 ? -1 : 1);
      else { movel.classList.add('animando'); movel.style.transform = ''; }
      x0 = y0 = null; modo = null;
    };
    artigo.addEventListener('touchend', soltar, { passive: true });
    artigo.addEventListener('touchcancel', soltar, { passive: true });
    const btCompartilhar = $('.compartilhar', frag);
    if (navigator.share) {
      btCompartilhar.hidden = false;
      btCompartilhar.onclick = async (e) => {
        e.preventDefault(); e.stopPropagation();
        try { await navigator.share({ title: n.titulo, text: `${n.titulo} (${n.fonte})`, url: n.url }); } catch { /* cancelado */ }
      };
    }
    if (n.imagem) { const w = $('.card-img', frag); w.hidden = false; const img = $('img', w); img.src = n.imagem; img.onerror = () => { w.hidden = true; }; }
    $('.fonte', frag).textContent = n.fonte || 'Fonte';
    const t = $('time', frag); t.dateTime = n.publicado_em; t.textContent = tempoRelativo(n.publicado_em);
    t.title = new Date(n.publicado_em).toLocaleString('pt-BR');
    $('.titulo', frag).appendChild(destacar(n.titulo, estado.q.trim()));
    if (n.resumo && norm(n.resumo) !== norm(n.titulo)) $('.resumo', frag).appendChild(destacar(n.resumo, estado.q.trim()));
    const tags = $('.tags', frag);
    if (salvo && estado.visao === 'normal') { const s = document.createElement('span'); s.className = 'tag salvo'; s.textContent = '🔖 Ler depois'; tags.appendChild(s); }
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
    if (n.pauta) { const s = document.createElement('span'); s.className = 'tag pauta'; s.textContent = '📣 Pauta'; s.title = 'A comunidade reclama, cobra ou pede providências'; tags.appendChild(s); }
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
      el.vazioDica.textContent = estado.visao === 'arquivadas'
        ? 'Arraste uma notícia para a esquerda (ou toque em Arquivar) para guardá-la aqui.'
        : estado.visao === 'lerdepois'
        ? 'Arraste uma notícia para a direita (ou toque em Ler depois) para guardá-la aqui.'
        : dados.noticias.length
        ? 'Tente outro período, outro bairro ou veja as notícias gerais de Floripa.'
        : 'A primeira coleta ainda não rodou. Em modo servidor ela começa sozinha; no GitHub Pages, aguarde a ação agendada.';
    }
  }
  function render() {
    gravarHash();
    const c = contar();
    renderRegioes(c);
    renderSeletores(c);
    el.btnArquivadas.classList.toggle('ativo', estado.visao === 'arquivadas');
    $('.n', el.btnArquivadas).textContent = dados.noticias.filter(estaArquivada).length;
    el.btnLerDepois.classList.toggle('ativo', estado.visao === 'lerdepois');
    $('.n', el.btnLerDepois).textContent = dados.noticias.filter((n) => lerDepois.tem(n) && !estaArquivada(n)).length;
    el.btnPautas.classList.toggle('ativo', estado.pauta);
    $('.n', el.btnPautas).textContent = c.pautas;
    el.rotuloGeral.hidden = estado.regiao !== 'todas' || estado.visao !== 'normal';
    const itens = filtrar();
    const onde = estado.bairro ? mapaBairro.get(estado.bairro)?.nome : estado.regiao === 'todas' ? 'Florianópolis' : mapaRegiao.get(estado.regiao)?.nome;
    const assuntoNome = estado.assunto ? mapaAssunto.get(estado.assunto)?.nome : '';
    el.contagem.textContent = `${itens.length} ${itens.length === 1 ? 'notícia' : 'notícias'}${estado.visao === 'arquivadas' ? (itens.length === 1 ? ' arquivada' : ' arquivadas') : estado.visao === 'lerdepois' ? ' para ler depois' : ''} · ${onde}${estado.pauta ? ' · Pautas da comunidade' : ''}${assuntoNome ? ` · ${assuntoNome}` : ''}${estado.q ? ` · “${estado.q}”` : ''}`;
    renderLista(itens);
  }
  let toastTimer;
  function toast(msg, ms = 2200, acao = null) {
    el.toastTexto.textContent = msg; el.toast.hidden = false;
    el.toastAcao.hidden = !acao;
    if (acao) { el.toastAcao.textContent = acao.rotulo; el.toastAcao.onclick = () => { el.toast.hidden = true; acao.ao(); }; }
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.toast.hidden = true; }, ms);
  }
  function renderRodape() {
    el.versao.textContent = `app v${APP_VERSAO}`;
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
      dados.noticias = (dados.noticias || []).map((x) => ({ ...x, regioes: x.regioes || [], bairros: x.bairros || [], assuntos: x.assuntos || [], pauta: !!x.pauta })).sort((x, y) => (y.publicado_em || '').localeCompare(x.publicado_em || ''));
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
  el.btnPautas.addEventListener('click', () => { estado.pauta = !estado.pauta; estado.pagina = 1; render(); });
  el.btnArquivadas.addEventListener('click', () => { estado.visao = estado.visao === 'arquivadas' ? 'normal' : 'arquivadas'; estado.pagina = 1; render(); window.scrollTo({ top: 0 }); });
  el.btnLerDepois.addEventListener('click', () => { estado.visao = estado.visao === 'lerdepois' ? 'normal' : 'lerdepois'; estado.pagina = 1; render(); window.scrollTo({ top: 0 }); });
  el.incluirGeral.addEventListener('change', () => { estado.incluirGeral = el.incluirGeral.checked; estado.pagina = 1; render(); });
  el.mais.addEventListener('click', () => { estado.pagina++; render(); });
  async function atualizarTudo() {
    // Em modo servidor, pede uma coleta nova; em modo estático só recarrega o JSON.
    try { await fetch('api/coletar', { method: 'GET' }); } catch { /* estático */ }
    const antes = dados.gerado_em;
    const total = dados.noticias.length;
    await carregar();
    verificarNovaVersao();
    if (dados.gerado_em !== antes || dados.noticias.length !== total) toast(`Notícias atualizadas (${dados.noticias.length})`);
    else toast('Você já está com a lista mais recente');
  }
  el.btnAtualizar.addEventListener('click', atualizarTudo);

  // ---------- puxar para baixo para atualizar (celular) ----------
  (() => {
    const LIMIAR = 70;
    let y0 = null; let x0 = null; let puxando = false; let dist = 0; let ocupado = false;
    const topoDaPagina = () => (window.scrollY || document.documentElement.scrollTop) <= 0;
    document.addEventListener('touchstart', (e) => {
      if (ocupado || !topoDaPagina() || e.touches.length !== 1 || el.dlg.open || el.dlgEscolha.open) { y0 = null; return; }
      y0 = e.touches[0].clientY; x0 = e.touches[0].clientX; puxando = false; dist = 0;
    }, { passive: true });
    document.addEventListener('touchmove', (e) => {
      if (y0 === null || ocupado) return;
      const dy = e.touches[0].clientY - y0;
      const dxp = Math.abs(e.touches[0].clientX - x0);
      if (!puxando && dxp > 10 && dxp > dy) { y0 = null; return; } // gesto horizontal: é o arquivar
      if (dy <= 0 || !topoDaPagina()) { if (puxando) soltar(false); y0 = dy <= 0 ? y0 : null; return; }
      puxando = true;
      dist = Math.min(dy * 0.5, 110);
      el.puxar.classList.add('visivel');
      el.puxar.classList.toggle('pronto', dist >= LIMIAR);
      el.puxarTexto.textContent = dist >= LIMIAR ? 'Solte para atualizar' : 'Puxe para atualizar';
      el.puxar.style.transform = `translateY(${dist}px)`;
    }, { passive: true });
    async function soltar(disparar) {
      const foiPronto = dist >= LIMIAR;
      y0 = null; puxando = false;
      if (disparar && foiPronto) {
        ocupado = true;
        el.puxar.classList.add('carregando'); el.puxar.classList.remove('pronto');
        el.puxarTexto.textContent = 'Atualizando…';
        el.puxar.style.transform = `translateY(${LIMIAR}px)`;
        try { await atualizarTudo(); } finally {
          el.puxar.classList.remove('carregando', 'visivel'); el.puxar.style.transform = '';
          ocupado = false;
        }
        return;
      }
      el.puxar.classList.remove('visivel', 'pronto'); el.puxar.style.transform = ''; dist = 0;
    }
    document.addEventListener('touchend', () => { if (puxando) soltar(true); else y0 = null; }, { passive: true });
    document.addEventListener('touchcancel', () => { if (puxando) soltar(false); y0 = null; }, { passive: true });
  })();
  el.btnFontes.addEventListener('click', () => { renderFontes(); el.dlg.showModal(); });
  el.fecharFontes.addEventListener('click', () => el.dlg.close());
  el.dlg.addEventListener('click', (e) => { if (e.target === el.dlg) el.dlg.close(); });
  window.addEventListener('hashchange', () => { lerHash(); sincronizarControles(); render(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    verificarNovaVersao();
    if (dados.gerado_em && Date.now() - new Date(dados.gerado_em).getTime() > 10 * 60e3) carregar();
  });
  setInterval(() => { if (!document.hidden) carregar(); }, 15 * 60e3);

  // ---------- nova versão do app ----------
  let registro = null;
  let recarregando = false;
  function mostrarAvisoVersao(sw) {
    el.avisoVersao.hidden = false;
    el.btnVersao.onclick = () => { el.btnVersao.textContent = 'Atualizando…'; sw.postMessage({ tipo: 'ATIVAR' }); };
  }
  function verificarNovaVersao() {
    if (registro) registro.update().catch(() => {});
  }
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').then((reg) => {
      registro = reg;
      if (reg.waiting && navigator.serviceWorker.controller) mostrarAvisoVersao(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const novo = reg.installing;
        if (!novo) return;
        novo.addEventListener('statechange', () => {
          if (novo.state === 'installed' && navigator.serviceWorker.controller) mostrarAvisoVersao(novo);
        });
      });
      setInterval(verificarNovaVersao, 30 * 60e3);
    }).catch(() => {});
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (recarregando) return; recarregando = true; location.reload();
    });
  }
  carregar().catch((e) => { el.contagem.textContent = `Não consegui carregar as notícias: ${e.message}`; });
})();
