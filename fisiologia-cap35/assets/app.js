/* Livro interativo — comportamento. Sem dependências externas.
   Lê os dados de window.LIVRO (assets/dados.js, gerado pelo build.py). */
(function () {
  'use strict';
  var D = window.LIVRO;
  if (!D || !D.blocos) return;
  var META = D.meta, BLOCOS = D.blocos, NB = BLOCOS.length;
  var CHAVE = 'livro:' + META.hash;
  var TIPO_ROT = { DIRETA: 'Direta', MULTIPLA: 'Múltipla escolha', VF: 'Verdadeiro ou falso', DISSERTATIVA: 'Dissertativa' };

  /* ================= utilidades ================= */
  function $(id) { return document.getElementById(id); }
  function el(tag, at, filhos) {
    var e = document.createElement(tag);
    if (at) for (var k in at) {
      if (!at.hasOwnProperty(k) || at[k] == null) continue;
      if (k === 'text') e.textContent = at[k];
      else if (k === 'class') e.className = at[k];
      else e.setAttribute(k, at[k]);
    }
    if (filhos) filhos.forEach(function (f) { if (f) e.appendChild(typeof f === 'string' ? document.createTextNode(f) : f); });
    return e;
  }
  function svg(path) {
    var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true');
    s.innerHTML = path; return s;
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  var toastT = null;
  function toast(msg, ms) {
    var t = $('toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true; }, ms || 3200);
  }

  /* ================= armazenamento (localStorage com try/catch; fallback em memória) ================= */
  var memLS = {};
  var LS = {
    get: function (k) {
      try { var v = window.localStorage.getItem(k); if (v !== null) return v; } catch (e) {}
      return Object.prototype.hasOwnProperty.call(memLS, k) ? memLS[k] : null;
    },
    set: function (k, v) { memLS[k] = v; try { window.localStorage.setItem(k, v); } catch (e) {} },
    del: function (k) { delete memLS[k]; try { window.localStorage.removeItem(k); } catch (e) {} }
  };
  function lerJSON(k, padrao) { try { var v = JSON.parse(LS.get(k) || 'null'); return v && typeof v === 'object' ? v : padrao; } catch (e) { return padrao; } }
  var estado = lerJSON(CHAVE, null) || {};
  estado.resp = estado.resp || {};
  function salvarEstado() { try { LS.set(CHAVE, JSON.stringify(estado)); } catch (e) {} }
  var prefs = lerJSON('livro:prefs', {}) || {};
  function salvarPrefs() { try { LS.set('livro:prefs', JSON.stringify(prefs)); } catch (e) {} }

  /* ================= imagens (pasta ou embutidas em base64) ================= */
  var urlCache = {};
  function urlImagem(img) {
    if (urlCache[img.id]) return urlCache[img.id];
    var emb = document.querySelector('script[data-img="' + img.id + '"]');
    var url;
    if (emb) {
      var b64 = emb.textContent.replace(/\s+/g, '');
      try {
        var bin = atob(b64), n = bin.length, u8 = new Uint8Array(n);
        for (var i = 0; i < n; i++) u8[i] = bin.charCodeAt(i);
        url = URL.createObjectURL(new Blob([u8], { type: 'image/jpeg' }));
      } catch (e) { url = 'data:image/jpeg;base64,' + b64; }
    } else {
      url = 'imagens/' + encodeURIComponent(img.arquivo);
    }
    urlCache[img.id] = url;
    return url;
  }
  var ioImg = ('IntersectionObserver' in window) ? new IntersectionObserver(function (ents) {
    ents.forEach(function (en) {
      if (!en.isIntersecting) return;
      ioImg.unobserve(en.target);
      // carrega todas as imagens do mesmo carrossel (as outras ficam fora da área visível do trilho)
      Array.prototype.forEach.call(en.target.querySelectorAll('img'), carregarImg);
    });
  }, { rootMargin: '800px 0px' }) : null;
  function carregarImg(imgEl) {
    if (imgEl.getAttribute('src')) return;
    imgEl.src = urlImagem(imgEl._dado);
  }

  /* ================= renderização ================= */
  var secoes = [];
  var controlesQ = {};       // id -> controlador da questão
  var questoesDoBloco = {};  // numero -> [ids]

  function renderTexto(nos, cont) {
    nos.forEach(function (no) {
      if (no.t === 'h') cont.appendChild(el('h3', { text: no.texto }));
      else if (no.t === 'leg') cont.appendChild(el('p', { class: 'legenda', text: no.texto }));
      else if (no.t === 'tabela') {
        var tb = el('tbody');
        no.linhas.forEach(function (lin) { tb.appendChild(el('tr', null, lin.map(function (c) { return el('td', { text: c }); }))); });
        cont.appendChild(el('table', null, [tb]));
      } else {
        var p = el('p');
        if (no.subtitulo) { p.appendChild(el('span', { class: 'subtitulo', text: no.subtitulo })); p.appendChild(document.createTextNode(' ')); }
        p.appendChild(document.createTextNode(no.texto));
        cont.appendChild(p);
      }
    });
  }

  function criarCarrossel(b) {
    var wrap = el('div', { class: 'carrossel' });
    var trilho = el('div', { class: 'trilho', tabindex: '0', 'aria-label': 'Imagens do bloco ' + b.numero + ' (' + b.imagens.length + ')', role: 'group' });
    b.imagens.forEach(function (img, i) {
      var fig = el('figure', { class: 'slide area', 'data-img': img.id, 'aria-label': 'Imagem ' + (i + 1) + ' de ' + b.imagens.length });
      var im = el('img', { alt: img.alt, width: img.largura, height: img.altura, decoding: 'async', draggable: 'false' });
      im._dado = img;
      im.addEventListener('click', function () { if (!Tinta.ligada) abrirZoom(b, i); });
      fig.appendChild(im);
      var amp = el('button', { type: 'button', class: 'btn-ampliar', 'aria-label': 'Ampliar imagem ' + (i + 1) + ' em tela cheia' }, [svg('<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>')]);
      amp.addEventListener('click', function () { abrirZoom(b, i); });
      fig.appendChild(amp);
      trilho.appendChild(fig);
      if (!ioImg) carregarImg(im);
      Tinta.registrar(fig, 'b' + pad2(b.numero) + ':img:' + img.id, 'img', b.numero);
    });
    wrap.appendChild(trilho);
    if (ioImg) ioImg.observe(trilho);
    var n = b.imagens.length;
    var ctrl = el('div', { class: 'car-ctrl' });
    var leg = el('div', { class: 'car-legenda', 'aria-live': 'polite' });
    if (n > 1) {
      var ant = el('button', { type: 'button', class: 'car-seta', 'aria-label': 'Imagem anterior', text: '‹' });
      var prox = el('button', { type: 'button', class: 'car-seta', 'aria-label': 'Próxima imagem', text: '›' });
      var pontos = [];
      ctrl.appendChild(ant);
      for (var i = 0; i < n; i++) {
        (function (i) {
          var p = el('button', { type: 'button', class: 'ponto', 'aria-label': 'Ver imagem ' + (i + 1) + ' de ' + n });
          p.addEventListener('click', function () { irPara(i); });
          pontos.push(p); ctrl.appendChild(p);
        })(i);
      }
      ctrl.appendChild(prox);
      var atual = -1;
      var irPara = function (i) {
        i = Math.max(0, Math.min(n - 1, i));
        trilho.scrollTo({ left: i * trilho.clientWidth, behavior: 'smooth' });
        marcar(i);
      };
      var marcar = function (i) {
        if (i === atual) return; atual = i;
        pontos.forEach(function (p, k) { p.setAttribute('aria-current', k === i ? 'true' : 'false'); });
        ant.disabled = i === 0; prox.disabled = i === n - 1;
        leg.textContent = 'Imagem ' + (i + 1) + ' de ' + n;
      };
      ant.addEventListener('click', function () { irPara(atual - 1); });
      prox.addEventListener('click', function () { irPara(atual + 1); });
      var rt = null;
      trilho.addEventListener('scroll', function () {
        clearTimeout(rt);
        rt = setTimeout(function () { if (trilho.clientWidth) marcar(Math.round(trilho.scrollLeft / trilho.clientWidth)); }, 60);
      }, { passive: true });
      trilho.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowRight') { e.preventDefault(); irPara(atual + 1); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); irPara(atual - 1); }
      });
      marcar(0);
      wrap.appendChild(ctrl);
      wrap.appendChild(leg);
    }
    return wrap;
  }

  function linhaAcao(btn, chipTxt, chipLabel) {
    var linha = el('div', { class: 'acao-linha' });
    var chip = el('button', { type: 'button', class: 'pk', tabindex: '-1', 'aria-label': chipLabel + ' (modo caneta)', title: chipLabel, text: chipTxt });
    chip.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); if (!btn.disabled) btn.click(); });
    linha.appendChild(btn); linha.appendChild(chip);
    btn._chip = chip; btn._linha = linha;
    return linha;
  }
  function desab(btn, v) { btn.disabled = !!v; if (btn._chip) btn._chip.disabled = !!v; }

  function criarQuestao(q, b) {
    var art = el('article', { class: 'q area', id: 'q-' + q.id, 'data-q': q.id, 'data-tipo': q.tipo });
    art.appendChild(el('div', { class: 'q-cab' }, [el('span', { class: 'q-id', text: q.id }), el('span', { class: 'q-tipo', text: TIPO_ROT[q.tipo] || q.tipo })]));
    var enun = el('p', { class: 'q-enun' });
    enun.appendChild(el('span', { class: 'q-rot', text: q.tipo === 'VF' ? 'Afirmação' : 'Pergunta' }));
    enun.appendChild(el('span', { class: 'q-enun-txt', text: q.enunciado }));
    art.appendChild(enun);

    var c = { q: q, art: art, opcoes: [] };
    var r0 = null;
    if (q.tipo === 'MULTIPLA' || q.tipo === 'VF') {
      var grupo = el('div', { class: q.tipo === 'VF' ? 'vf' : 'alts', role: 'group', 'aria-label': 'Opções da questão ' + q.id });
      var valores = q.tipo === 'VF' ? ['Verdadeiro', 'Falso'] : Object.keys(q.alternativas).sort();
      valores.forEach(function (v) {
        var btn;
        if (q.tipo === 'VF') {
          btn = el('button', { type: 'button', class: 'vf-btn', 'data-valor': v }, [el('span', { class: 'vf-txt', text: v }), el('span', { class: 'marca-res' })]);
        } else {
          btn = el('button', { type: 'button', class: 'alt', 'data-valor': v }, [
            el('span', { class: 'alt-letra', text: v, 'aria-hidden': 'true' }),
            el('span', { class: 'alt-txt', text: q.alternativas[v] }),
            el('span', { class: 'marca-res' })]);
          btn.setAttribute('aria-label', 'Alternativa ' + v + ': ' + q.alternativas[v]);
        }
        btn.addEventListener('click', function () { responder(q.id, { s: v === q.resposta ? 'certo' : 'errado', e: v }); });
        c.opcoes.push(btn);
        grupo.appendChild(linhaAcao(btn, q.tipo === 'VF' ? v.charAt(0) : v, 'Responder ' + v));
      });
      art.appendChild(grupo);
    }
    var botoes = el('div', { class: 'q-botoes' });
    c.bDica = el('button', { type: 'button', class: 'btn btn-pequeno', 'aria-expanded': 'false', text: 'Dica' });
    c.bDica.addEventListener('click', function () {
      var r = estado.resp[q.id] || {};
      r.d = r.d ? 0 : 1; estado.resp[q.id] = r; salvarEstado(); atualizarQ(q.id);
    });
    if (q.tipo === 'DIRETA' || q.tipo === 'DISSERTATIVA') {
      c.bMostrar = el('button', { type: 'button', class: 'btn btn-pequeno btn-primario', text: 'Mostrar resposta' });
      c.bMostrar.addEventListener('click', function () { responder(q.id, { s: 'revelada' }); });
      c.bAcertei = el('button', { type: 'button', class: 'btn btn-pequeno btn-certo', text: 'Acertei' });
      c.bAcertei.addEventListener('click', function () { responder(q.id, { s: 'certo' }); });
      c.bErrei = el('button', { type: 'button', class: 'btn btn-pequeno btn-errado', text: 'Errei' });
      c.bErrei.addEventListener('click', function () { responder(q.id, { s: 'errado' }); });
      botoes.appendChild(linhaAcao(c.bMostrar, 'Ver', 'Mostrar resposta'));
      botoes.appendChild(linhaAcao(c.bAcertei, '✓', 'Acertei'));
      botoes.appendChild(linhaAcao(c.bErrei, '✗', 'Errei'));
    }
    botoes.appendChild(linhaAcao(c.bDica, '?', 'Dica'));
    c.bRefazer = el('button', { type: 'button', class: 'btn btn-pequeno', text: 'Refazer' });
    c.bRefazer.addEventListener('click', function () {
      delete estado.resp[q.id]; salvarEstado(); atualizarQ(q.id); atualizarPlacares();
      var f = c.opcoes[0] || c.bMostrar; if (f) f.focus({ preventScroll: true });
    });
    botoes.appendChild(linhaAcao(c.bRefazer, '↺', 'Refazer'));
    art.appendChild(botoes);

    c.dica = el('div', { class: 'q-dica', hidden: '' }, [el('span', { class: 'q-rot', text: 'Dica' }), el('span', { text: q.dica })]);
    c.dica.id = 'dica-' + q.id; c.bDica.setAttribute('aria-controls', c.dica.id);
    art.appendChild(c.dica);
    c.feedback = el('div', { class: 'q-feedback', 'aria-live': 'polite' });
    art.appendChild(c.feedback);
    c.resp = el('div', { class: 'q-resp', hidden: '' });
    if (q.tipo === 'DIRETA' || q.tipo === 'DISSERTATIVA') {
      c.resp.appendChild(el('p', null, [el('span', { class: 'q-rot', text: 'Resposta' }), el('span', { class: 'q-resposta', text: q.resposta })]));
    }
    c.resp.appendChild(el('p', null, [el('span', { class: 'q-rot', text: 'Justificativa' }), el('span', { class: 'q-justificativa', text: q.justificativa })]));
    art.appendChild(c.resp);
    controlesQ[q.id] = c;
    Tinta.registrar(art, 'b' + pad2(b.numero) + ':q:' + q.id, 'q', b.numero);
    return art;
  }

  function responder(id, dados) {
    var r = estado.resp[id] || {};
    r.s = dados.s; if (dados.e) r.e = dados.e; else delete r.e;
    estado.resp[id] = r; salvarEstado(); atualizarQ(id); atualizarPlacares();
  }

  function atualizarQ(id) {
    var c = controlesQ[id], q = c.q, r = estado.resp[id] || {};
    var respondida = r.s === 'certo' || r.s === 'errado';
    var revelada = respondida || r.s === 'revelada';
    c.art.classList.toggle('q-certo', r.s === 'certo');
    c.art.classList.toggle('q-errado', r.s === 'errado');
    c.art.setAttribute('data-estado', r.s || 'nova');
    c.opcoes.forEach(function (btn) {
      var v = btn.getAttribute('data-valor');
      btn.classList.remove('certa', 'errada', 'revela');
      var marca = btn.querySelector('.marca-res'); marca.textContent = '';
      desab(btn, respondida);
      btn.setAttribute('aria-pressed', respondida && r.e === v ? 'true' : 'false');
      if (!respondida) return;
      if (v === r.e) { btn.classList.add(r.s === 'certo' ? 'certa' : 'errada'); marca.textContent = r.s === 'certo' ? 'Certa' : 'Sua resposta'; }
      else if (v === q.resposta) { btn.classList.add('revela'); marca.textContent = 'Resposta certa'; }
    });
    if (c.bMostrar) {
      c.bMostrar._linha.hidden = !!r.s;
      c.bAcertei._linha.hidden = c.bErrei._linha.hidden = r.s !== 'revelada';
    }
    c.bDica._linha.hidden = revelada;
    c.bDica.setAttribute('aria-expanded', r.d ? 'true' : 'false');
    c.bDica.textContent = r.d ? 'Ocultar dica' : 'Dica';
    c.dica.hidden = !r.d;
    c.bRefazer._linha.hidden = !r.s;
    c.resp.hidden = !revelada;
    var fb = '';
    c.feedback.className = 'q-feedback';
    if (respondida) {
      if (q.tipo === 'MULTIPLA' || q.tipo === 'VF') {
        fb = r.s === 'certo' ? 'Correto.' : 'Incorreto. Resposta certa: ' + q.resposta + '.';
      } else {
        fb = r.s === 'certo' ? 'Você marcou: acertei.' : 'Você marcou: errei.';
      }
      c.feedback.classList.add(r.s === 'certo' ? 'ok' : 'nok');
    }
    c.feedback.textContent = fb;
  }

  function placarDe(numero) {
    var ids = questoesDoBloco[numero] || [], certos = 0, resp = 0;
    ids.forEach(function (id) { var r = estado.resp[id]; if (r && (r.s === 'certo' || r.s === 'errado')) { resp++; if (r.s === 'certo') certos++; } });
    return { certos: certos, resp: resp, total: ids.length };
  }
  function classeDesempenho(certos, resp) {
    if (!resp) return '';
    var p = certos / resp;
    return p >= 0.7 ? 'bom' : p >= 0.5 ? 'medio' : 'ruim';
  }
  function textoPlacar(p) { return p.certos + ' de ' + p.total + ' acertos' + (p.resp ? ' · ' + p.resp + ' respondida' + (p.resp > 1 ? 's' : '') : ''); }

  function atualizarPlacares() {
    var tc = 0, tr = 0, tt = 0;
    BLOCOS.forEach(function (b) {
      var p = placarDe(b.numero); tc += p.certos; tr += p.resp; tt += p.total;
      var cls = classeDesempenho(p.certos, p.resp);
      var pl = $('placar-' + b.numero);
      if (pl) { pl.textContent = 'Placar: ' + textoPlacar(p); pl.className = 'placar ' + cls; }
      var li = $('idx-nota-' + b.numero); if (li) { li.textContent = p.certos + '/' + p.total; li.parentNode.parentNode.className = 'res-linha ' + cls; }
      var rs = $('res-nota-' + b.numero); if (rs) { rs.textContent = p.certos + ' de ' + p.total; rs.parentNode.parentNode.className = 'res-linha ' + cls; }
    });
    var g = $('res-geral');
    if (g) {
      g.textContent = tc + ' de ' + tt + ' acertos' + (tr ? ' (' + tr + ' respondidas, ' + Math.round(100 * tc / tr) + '% de acerto)' : ' · nenhuma questão respondida ainda');
      g.className = 'res-geral ' + classeDesempenho(tc, tr);
    }
  }

  function criarBloco(b, idx) {
    var sec = el('section', { class: 'bloco', id: 'bloco-' + pad2(b.numero), 'data-n': b.numero, 'aria-labelledby': 'tit-' + b.numero });
    var cab = el('header', { class: 'bloco-cab' }, [
      el('span', { class: 'bloco-num', text: 'Bloco ' + b.numero + ' de ' + NB }),
      el('h2', { id: 'tit-' + b.numero, tabindex: '-1', text: b.titulo })
    ]);
    if (b.sensivel) cab.appendChild(el('div', { class: 'selo-sensivel' }, [svg('<path d="M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>'), 'Conteúdo sensível: veja imagens reais pelos links de apoio']));
    sec.appendChild(cab);

    var cartao = el('div', { class: 'cartao' });
    var colImg = el('div', { class: 'col-img' }, [criarCarrossel(b)]);
    var texto = el('div', { class: 'texto area', 'data-texto': b.numero, lang: 'pt-BR' });
    renderTexto(b.texto, texto);
    Tinta.registrar(texto, 'b' + pad2(b.numero) + ':txt', 'txt', b.numero);
    cartao.appendChild(colImg);
    cartao.appendChild(el('div', { class: 'col-txt' }, [texto]));
    sec.appendChild(cartao);

    var gImg = 'https://www.google.com/search?tbm=isch&q=' + encodeURIComponent(b.busca_imagens);
    var gVid = 'https://www.google.com/search?tbm=vid&tbs=dur:s&q=' + encodeURIComponent(b.busca_videos);
    sec.appendChild(el('nav', { class: 'apoio', 'aria-label': 'Links de apoio do bloco ' + b.numero }, [
      el('span', { class: 'apoio-rot', text: 'Apoio:' }),
      el('a', { class: 'link-apoio', href: gImg, target: '_blank', rel: 'noopener noreferrer', title: 'Busca: ' + b.busca_imagens }, [svg('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>'), 'Imagens reais']),
      el('a', { class: 'link-apoio', href: gVid, target: '_blank', rel: 'noopener noreferrer', title: 'Busca: ' + b.busca_videos }, [svg('<rect x="2" y="5" width="15" height="14" rx="2"/><path d="M17 10l5-3v10l-5-3z"/>'), 'Vídeos curtos'])
    ]));

    var qs = el('div', { class: 'questoes' });
    qs.appendChild(el('div', { class: 'questoes-cab' }, [
      el('h3', { text: 'Questões (' + b.questoes.length + ')' }),
      el('div', { class: 'placar', id: 'placar-' + b.numero, 'aria-live': 'polite' })
    ]));
    var lista = el('div', { class: 'lista-q' });
    questoesDoBloco[b.numero] = [];
    b.questoes.forEach(function (q) { questoesDoBloco[b.numero].push(q.id); lista.appendChild(criarQuestao(q, b)); });
    qs.appendChild(lista);
    sec.appendChild(qs);

    var ultimo = idx === NB - 1;
    var prox = el('button', { type: 'button', class: 'btn btn-primario', text: ultimo ? 'Ver fechamento ↓' : 'Próximo bloco ↓' });
    prox.addEventListener('click', function () {
      var alvo = ultimo ? $('fechamento') : secoes[idx + 1];
      alvo.scrollIntoView({ behavior: 'smooth', block: 'start' });
      var foco = ultimo ? $('fech-titulo') : $('tit-' + BLOCOS[idx + 1].numero);
      if (foco) foco.focus({ preventScroll: true });
    });
    sec.appendChild(el('div', { class: 'bloco-rodape' }, [prox]));
    return sec;
  }

  function criarFechamento() {
    var f = $('fechamento');
    f.appendChild(el('h2', { id: 'fech-titulo', tabindex: '-1', text: 'Fechamento' }));
    f.appendChild(el('p', { text: 'Resumo geral das questões deste capítulo.' }));
    f.appendChild(el('div', { class: 'res-geral', id: 'res-geral', 'aria-live': 'polite' }));
    var ul = el('ul', { class: 'res-tabela' });
    BLOCOS.forEach(function (b) {
      var a = el('a', { href: '#bloco-' + pad2(b.numero) }, [
        el('span', { class: 'res-num', text: b.numero }),
        el('span', { class: 'res-tit', text: b.titulo }),
        el('span', { class: 'res-nota', id: 'res-nota-' + b.numero })]);
      ul.appendChild(el('li', null, [el('div', { class: 'res-linha' }, [a])]));
    });
    f.appendChild(ul);
    var topo = el('button', { type: 'button', class: 'btn', text: 'Voltar ao início ↑' });
    topo.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });
    var zerar = el('button', { type: 'button', class: 'btn btn-perigo', text: 'Zerar progresso das questões' });
    zerar.addEventListener('click', zerarProgresso);
    f.appendChild(el('div', { class: 'fech-acoes' }, [topo, zerar]));
  }

  function zerarProgresso() {
    if (!window.confirm('Zerar todas as respostas e o placar deste capítulo? Os desenhos não são apagados.')) return;
    estado.resp = {}; salvarEstado();
    Object.keys(controlesQ).forEach(atualizarQ); atualizarPlacares();
    toast('Progresso das questões zerado.');
  }

  /* ================= índice, progresso e tema ================= */
  function criarIndice() {
    var ol = $('indice-lista');
    BLOCOS.forEach(function (b) {
      var a = el('a', { href: '#bloco-' + pad2(b.numero), 'data-n': b.numero }, [
        el('span', { class: 'res-num', text: b.numero }),
        el('span', { class: 'res-tit', text: b.titulo + (b.sensivel ? ' · sensível' : '') }),
        el('span', { class: 'res-nota', id: 'idx-nota-' + b.numero })]);
      a.addEventListener('click', function (e) {
        e.preventDefault(); fecharIndice();
        secoes[b.numero - 1].scrollIntoView({ block: 'start' });
        var h = $('tit-' + b.numero); if (h) h.focus({ preventScroll: true });
      });
      ol.appendChild(el('li', null, [el('div', { class: 'res-linha' }, [a])]));
    });
    var dlg = $('indice');
    $('btn-indice').addEventListener('click', function () {
      var at = ol.querySelector('[aria-current="true"]'); if (at) at.removeAttribute('aria-current');
      var cur = ol.querySelector('a[data-n="' + BLOCOS[blocoAtual].numero + '"]'); if (cur) cur.setAttribute('aria-current', 'true');
      if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
      if (cur) cur.scrollIntoView({ block: 'center' });
    });
    $('indice-fechar').addEventListener('click', fecharIndice);
    dlg.addEventListener('click', function (e) { if (e.target === dlg) fecharIndice(); });
    $('btn-zerar').addEventListener('click', function () { fecharIndice(); zerarProgresso(); });
    $('btn-apagar-tinta').addEventListener('click', function () { fecharIndice(); Tinta.limparTudo(); });
  }
  function fecharIndice() { var d = $('indice'); if (d.close) { try { d.close(); } catch (e) {} } d.removeAttribute('open'); }

  var blocoAtual = 0;
  function atualizarProgresso() {
    var lim = 60 + window.innerHeight * 0.35, at = 0;
    for (var i = 0; i < secoes.length; i++) { if (secoes[i].getBoundingClientRect().top <= lim) at = i; else break; }
    if (at !== blocoAtual || !atualizarProgresso.feito) {
      blocoAtual = at; atualizarProgresso.feito = true;
      var b = BLOCOS[at];
      $('topo-bloco').textContent = 'Bloco ' + b.numero + ' de ' + NB;
      $('topo-titulo').textContent = b.titulo;
      $('barra-cheia').style.width = (100 * (at + 1) / NB) + '%';
      $('barra').setAttribute('aria-valuenow', String(at + 1));
      $('barra').setAttribute('aria-valuemax', String(NB));
    }
  }
  var rafProg = 0;
  window.addEventListener('scroll', function () {
    if (rafProg) return;
    rafProg = requestAnimationFrame(function () { rafProg = 0; atualizarProgresso(); });
  }, { passive: true });
  window.addEventListener('resize', atualizarProgresso);

  function alternarTema() {
    var novo = document.documentElement.getAttribute('data-tema') === 'escuro' ? 'claro' : 'escuro';
    document.documentElement.setAttribute('data-tema', novo);
    LS.set('livro:tema', novo);
    Tinta.trocouTema();
  }

  /* ================= zoom em tela cheia com pinça ================= */
  var Z = { lista: [], i: 0, base: 1, s: 1, x: 0, y: 0, iw: 0, ih: 0, ptrs: {}, ini: null, ultTap: 0, foco: null };
  function abrirZoom(b, i) {
    Z.lista = b.imagens; Z.foco = document.activeElement;
    $('zoom').hidden = false; document.documentElement.style.overflow = 'hidden';
    mostrarZoom(i);
    $('zoom-fechar').focus();
  }
  function fecharZoom() {
    $('zoom').hidden = true; document.documentElement.style.overflow = '';
    Z.ptrs = {}; if (Z.foco && Z.foco.focus) Z.foco.focus({ preventScroll: true });
  }
  function mostrarZoom(i) {
    Z.i = Math.max(0, Math.min(Z.lista.length - 1, i));
    var d = Z.lista[Z.i], img = $('zoom-img');
    img.alt = d.alt; Z.iw = d.largura; Z.ih = d.altura;
    img.style.width = Z.iw + 'px'; img.style.height = Z.ih + 'px';
    img.src = urlImagem(d);
    $('zoom-cont').textContent = (Z.i + 1) + ' / ' + Z.lista.length;
    $('zoom-ant').disabled = Z.i === 0; $('zoom-prox').disabled = Z.i === Z.lista.length - 1;
    ajustarZoom(true);
  }
  function ajustarZoom(reset) {
    var p = $('zoom-palco'), W = p.clientWidth, H = p.clientHeight;
    Z.base = Math.min(W / Z.iw, H / Z.ih);
    if (reset) Z.s = 1;
    limitarZoom(); aplicarZoom();
  }
  function limitarZoom() {
    var p = $('zoom-palco'), W = p.clientWidth, H = p.clientHeight;
    Z.s = Math.max(1, Math.min(8, Z.s));
    var w = Z.iw * Z.base * Z.s, h = Z.ih * Z.base * Z.s;
    if (w <= W) Z.x = (W - w) / 2; else Z.x = Math.min(0, Math.max(W - w, Z.x));
    if (h <= H) Z.y = (H - h) / 2; else Z.y = Math.min(0, Math.max(H - h, Z.y));
  }
  function aplicarZoom() { $('zoom-img').style.transform = 'translate(' + Z.x + 'px,' + Z.y + 'px) scale(' + (Z.base * Z.s) + ')'; }
  function zoomEm(px, py, novoS) {
    var k = Z.base * Z.s, ix = (px - Z.x) / k, iy = (py - Z.y) / k;
    Z.s = Math.max(1, Math.min(8, novoS));
    var k2 = Z.base * Z.s; Z.x = px - ix * k2; Z.y = py - iy * k2;
    limitarZoom(); aplicarZoom();
  }
  function iniciarZoomUI() {
    var palco = $('zoom-palco');
    function pos(e) { var r = palco.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    palco.addEventListener('pointerdown', function (e) {
      palco.setPointerCapture(e.pointerId);
      Z.ptrs[e.pointerId] = pos(e);
      var ids = Object.keys(Z.ptrs);
      if (ids.length === 1) {
        var agora = Date.now(), p = Z.ptrs[ids[0]];
        if (agora - Z.ultTap < 300) { zoomEm(p.x, p.y, Z.s > 1.05 ? 1 : 2.5); Z.ultTap = 0; }
        else Z.ultTap = agora;
        Z.ini = { tipo: 'pan', x: Z.x, y: Z.y, px: p.x, py: p.y };
      } else if (ids.length === 2) {
        var a = Z.ptrs[ids[0]], b = Z.ptrs[ids[1]];
        Z.ini = { tipo: 'pinca', d: Math.hypot(a.x - b.x, a.y - b.y) || 1, s: Z.s, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, x: Z.x, y: Z.y };
      }
    });
    palco.addEventListener('pointermove', function (e) {
      if (!Z.ptrs[e.pointerId] || !Z.ini) return;
      Z.ptrs[e.pointerId] = pos(e);
      var ids = Object.keys(Z.ptrs);
      if (Z.ini.tipo === 'pinca' && ids.length >= 2) {
        var a = Z.ptrs[ids[0]], b = Z.ptrs[ids[1]];
        var d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        var k0 = Z.base * Z.ini.s, ix = (Z.ini.mx - Z.ini.x) / k0, iy = (Z.ini.my - Z.ini.y) / k0;
        Z.s = Math.max(1, Math.min(8, Z.ini.s * d / Z.ini.d));
        var k = Z.base * Z.s; Z.x = mx - ix * k; Z.y = my - iy * k;
        limitarZoom(); aplicarZoom();
      } else if (Z.ini.tipo === 'pan' && ids.length === 1) {
        var p = Z.ptrs[ids[0]];
        Z.x = Z.ini.x + (p.x - Z.ini.px); Z.y = Z.ini.y + (p.y - Z.ini.py);
        limitarZoom(); aplicarZoom();
      }
    });
    function fim(e) {
      delete Z.ptrs[e.pointerId];
      var ids = Object.keys(Z.ptrs);
      if (ids.length === 1) { var p = Z.ptrs[ids[0]]; Z.ini = { tipo: 'pan', x: Z.x, y: Z.y, px: p.x, py: p.y }; }
      else if (!ids.length) Z.ini = null;
    }
    palco.addEventListener('pointerup', fim);
    palco.addEventListener('pointercancel', fim);
    palco.addEventListener('wheel', function (e) {
      e.preventDefault(); var p = pos(e);
      zoomEm(p.x, p.y, Z.s * Math.exp(-e.deltaY * 0.0022));
    }, { passive: false });
    $('zoom-fechar').addEventListener('click', fecharZoom);
    $('zoom-mais').addEventListener('click', function () { zoomEm(palco.clientWidth / 2, palco.clientHeight / 2, Z.s * 1.5); });
    $('zoom-menos').addEventListener('click', function () { zoomEm(palco.clientWidth / 2, palco.clientHeight / 2, Z.s / 1.5); });
    $('zoom-ant').addEventListener('click', function () { mostrarZoom(Z.i - 1); });
    $('zoom-prox').addEventListener('click', function () { mostrarZoom(Z.i + 1); });
    window.addEventListener('resize', function () { if (!$('zoom').hidden) ajustarZoom(false); });
    $('zoom').addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); fecharZoom(); }
      else if (e.key === 'ArrowRight') mostrarZoom(Z.i + 1);
      else if (e.key === 'ArrowLeft') mostrarZoom(Z.i - 1);
      else if (e.key === '+' || e.key === '=') $('zoom-mais').click();
      else if (e.key === '-') $('zoom-menos').click();
      else if (e.key === 'Tab') {
        var fs = Array.prototype.filter.call($('zoom').querySelectorAll('button'), function (b) { return !b.disabled; });
        var i = fs.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); fs[fs.length - 1].focus(); }
        else if (!e.shiftKey && i === fs.length - 1) { e.preventDefault(); fs[0].focus(); }
      }
    });
  }

  /* ================= caneta, marca-texto e borracha ================= */
  var Tinta = (function () {
    var T = {
      ligada: false, ferr: 'c1', soCaneta: false, stylus: false,
      areas: {}, lista: [], undo: [], cores: {}, pronto: false
    };
    var LARG = { c1: 2.4, c2: 2.4, c3: 2.4, c4: 2.4, hl: 18 };
    var ro = ('ResizeObserver' in window) ? new ResizeObserver(function (ents) {
      ents.forEach(function (en) { var a = en.target._area; if (a) ajustar(a); });
    }) : null;
    var io = ('IntersectionObserver' in window) ? new IntersectionObserver(function (ents) {
      ents.forEach(function (en) { var a = en.target._area; if (a) { a.visivel = en.isIntersecting; ajustar(a); } });
    }, { rootMargin: '100% 0px' }) : null;

    /* ---------- persistência: IndexedDB com fallback em memória ---------- */
    var DB = { db: null, mem: {}, pend: {}, timer: null };
    function abrirDB(cb) {
      var feito = false; function fim() { if (!feito) { feito = true; cb(); } }
      try {
        if (!window.indexedDB) return fim();
        var req = indexedDB.open('livro-tinta-' + META.hash, 1);
        req.onupgradeneeded = function () { try { req.result.createObjectStore('areas'); } catch (e) {} };
        req.onsuccess = function () {
          DB.db = req.result;
          try {
            var cur = DB.db.transaction('areas', 'readonly').objectStore('areas').openCursor();
            cur.onsuccess = function () { var c = cur.result; if (c) { DB.mem[c.key] = c.value; c.continue(); } else fim(); };
            cur.onerror = fim;
          } catch (e) { fim(); }
        };
        req.onerror = fim; req.onblocked = fim;
        setTimeout(fim, 4000);
      } catch (e) { fim(); }
    }
    function salvar(a) {
      DB.mem[a.id] = a.tracos; DB.pend[a.id] = true;
      clearTimeout(DB.timer); DB.timer = setTimeout(gravarPendentes, 250);
    }
    function gravarPendentes() {
      var ids = Object.keys(DB.pend); DB.pend = {};
      if (!DB.db || !ids.length) return;
      try {
        var st = DB.db.transaction('areas', 'readwrite').objectStore('areas');
        ids.forEach(function (id) {
          var v = DB.mem[id];
          if (v && v.length) st.put(v, id); else st.delete(id);
        });
      } catch (e) {}
    }
    window.addEventListener('pagehide', gravarPendentes);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') gravarPendentes(); });

    /* ---------- áreas ---------- */
    T.registrar = function (elm, id, tipo, bloco) {
      var cv = document.createElement('canvas');
      cv.className = 'tinta'; cv.setAttribute('aria-hidden', 'true'); cv.width = 0; cv.height = 0;
      elm.appendChild(cv);
      var a = { id: id, el: elm, cv: cv, ctx: null, tipo: tipo, bloco: bloco, tracos: [], visivel: !io, ativa: false, w: 0, h: 0 };
      elm._area = a; elm.setAttribute('data-area', id);
      T.areas[id] = a; T.lista.push(a);
      if (T.pronto && DB.mem[id]) a.tracos = DB.mem[id];
      ligarEventos(a);
      if (ro) ro.observe(elm);
      if (io) io.observe(elm);
      return a;
    };
    function ajustar(a) {
      var precisa = a.visivel && (T.ligada || a.tracos.length > 0);
      if (!precisa) {
        if (a.ativa) { a.cv.width = 0; a.cv.height = 0; a.ativa = false; }
        return;
      }
      var w = a.el.clientWidth, h = a.el.clientHeight;
      if (!w || !h) return;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      while (dpr > 1 && w * h * dpr * dpr > 6e6) dpr -= 0.25;   // limita memória (iPad/iPhone)
      if (w * h * dpr * dpr > 6e6) dpr = Math.sqrt(6e6 / (w * h));
      var W = Math.round(w * dpr), H = Math.round(h * dpr);
      if (!a.ativa || a.cv.width !== W || a.cv.height !== H || a.w !== w || a.h !== h) {
        a.cv.width = W; a.cv.height = H; a.w = w; a.h = h; a.dpr = dpr;
        a.ctx = a.cv.getContext('2d');
        a.ativa = true;
        redesenhar(a);
      }
    }
    function lerCores() {
      var cs = getComputedStyle(document.documentElement);
      ['c1', 'c2', 'c3', 'c4', 'hl'].forEach(function (c) { T.cores[c] = cs.getPropertyValue('--tinta-' + c).trim() || '#d00'; });
    }
    T.trocouTema = function () { lerCores(); T.lista.forEach(function (a) { if (a.ativa) redesenhar(a); }); };

    /* ---------- desenho ---------- */
    function escY(a, t) { return a.tipo === 'img' && t.r ? a.w / t.r : 1; }   // imagem tem proporção fixa
    function larg(t, pr, ey) { return t.c === 'hl' ? t.w * ey : t.w * ey * (0.35 + 1.3 * pr); }
    function redesenhar(a) {
      if (!a.ativa || !a.ctx) return;
      var ctx = a.ctx;
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, a.cv.width, a.cv.height);
      ctx.setTransform(a.dpr, 0, 0, a.dpr, 0, 0);
      a.tracos.forEach(function (t) { desenharTraco(a, t, 0); });
    }
    function desenharTraco(a, t, desde) {
      var ctx = a.ctx, p = t.p, n = p.length / 3, W = a.w, ey = escY(a, t);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = T.cores[t.c] || T.cores.c1; ctx.fillStyle = ctx.strokeStyle;
      if (t.c === 'hl') {
        ctx.lineWidth = larg(t, 0.5, ey);
        ctx.beginPath(); ctx.moveTo(p[0] * W, p[1] * ey);
        for (var i = 1; i < n; i++) ctx.lineTo(p[i * 3] * W, p[i * 3 + 1] * ey);
        if (n === 1) ctx.lineTo(p[0] * W + 0.1, p[1] * ey);
        ctx.stroke();
        return;
      }
      if (n === 1) {
        ctx.beginPath(); ctx.arc(p[0] * W, p[1] * ey, larg(t, p[2], ey) / 2, 0, Math.PI * 2); ctx.fill(); return;
      }
      for (var k = Math.max(1, desde); k < n; k++) {
        ctx.lineWidth = larg(t, (p[k * 3 + 2] + p[k * 3 - 1]) / 2, ey);
        ctx.beginPath();
        ctx.moveTo(p[k * 3 - 3] * W, p[k * 3 - 2] * ey);
        ctx.lineTo(p[k * 3] * W, p[k * 3 + 1] * ey);
        ctx.stroke();
      }
    }

    /* ---------- entrada por pointer events ---------- */
    var gesto = null;   // { a, id, traco | apagados }
    function ponto(a, e) {
      var r = a.cv.getBoundingClientRect();
      var pr = e.pointerType === 'pen' ? (e.pressure || 0.5) : 0.5;
      return { x: (e.clientX - r.left) / (r.width || 1), y: e.clientY - r.top, pr: pr };
    }
    function arred(v, d) { var m = Math.pow(10, d); return Math.round(v * m) / m; }
    function ligarEventos(a) {
      var cv = a.cv;
      cv.addEventListener('pointerdown', function (e) {
        if (!T.ligada) return;
        if (e.pointerType === 'pen') detectouStylus();
        if (T.soCaneta && e.pointerType === 'touch') return;          // o dedo rola
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        if (gesto) return;                                            // ignora segundo dedo
        e.preventDefault();
        try { cv.setPointerCapture(e.pointerId); } catch (er) {}
        if (!a.ativa) { a.visivel = true; ajustar(a); }
        var pt = ponto(a, e);
        if (T.ferr === 'borracha') {
          gesto = { a: a, id: e.pointerId, apagados: [] };
          apagarEm(a, pt);
        } else {
          var t = { c: T.ferr === 'hl' ? 'hl' : T.ferr, w: LARG[T.ferr] || 2.4, r: arred(a.w, 1), p: [arred(pt.x, 5), arred(pt.y, 1), arred(pt.pr, 2)] };
          a.tracos.push(t);
          gesto = { a: a, id: e.pointerId, traco: t };
          if (t.c !== 'hl') desenharTraco(a, t, 0);
        }
      });
      cv.addEventListener('pointermove', function (e) {
        if (!gesto || gesto.a !== a || gesto.id !== e.pointerId) return;
        e.preventDefault();
        var evs = (e.getCoalescedEvents && e.getCoalescedEvents()) || [];
        if (!evs.length) evs = [e];
        if (gesto.apagados) { evs.forEach(function (ev) { apagarEm(a, ponto(a, ev)); }); return; }
        var t = gesto.traco, antes = t.p.length / 3;
        evs.forEach(function (ev) {
          var pt = ponto(a, ev), n = t.p.length;
          var dx = (pt.x - t.p[n - 3]) * a.w, dy = pt.y - t.p[n - 2];
          if (dx * dx + dy * dy < 0.6) return;
          t.p.push(arred(pt.x, 5), arred(pt.y, 1), arred(pt.pr, 2));
        });
        if (t.c === 'hl') redesenhar(a); else desenharTraco(a, t, antes);
      });
      function fim(e) {
        if (!gesto || gesto.a !== a || gesto.id !== e.pointerId) return;
        if (gesto.traco) { T.undo.push({ tipo: 'add', a: a.id, t: gesto.traco }); salvar(a); }
        else if (gesto.apagados.length) { T.undo.push({ tipo: 'apagar', a: a.id, itens: gesto.apagados }); salvar(a); }
        gesto = null;
      }
      cv.addEventListener('pointerup', fim);
      cv.addEventListener('pointercancel', fim);
      cv.addEventListener('lostpointercapture', fim);
      // iPad: com "só a caneta desenha", impede que o Apple Pencil role a página
      cv.addEventListener('touchstart', bloquearRolagemStylus, { passive: false });
      cv.addEventListener('touchmove', bloquearRolagemStylus, { passive: false });
    }
    function bloquearRolagemStylus(e) {
      if (!T.ligada || !T.soCaneta) return;
      for (var i = 0; i < e.touches.length; i++) if (e.touches[i].touchType === 'stylus') { e.preventDefault(); return; }
    }
    function apagarEm(a, pt) {
      var px = pt.x * a.w, py = pt.y, mudou = false;
      for (var i = a.tracos.length - 1; i >= 0; i--) {
        var t = a.tracos[i], ey = escY(a, t), raio = 12 + larg(t, 1, ey) / 2, r2 = raio * raio, p = t.p, acertou = false;
        for (var k = 0; k < p.length; k += 3) {
          var dx = p[k] * a.w - px, dy = p[k + 1] * ey - py;
          if (dx * dx + dy * dy <= r2) { acertou = true; break; }
        }
        if (!acertou && p.length >= 6) {   // segmento passa perto do ponto
          for (var j = 3; j < p.length && !acertou; j += 3) {
            if (distSeg(px, py, p[j - 3] * a.w, p[j - 2] * ey, p[j] * a.w, p[j + 1] * ey) <= raio) acertou = true;
          }
        }
        if (acertou) { gesto.apagados.push({ t: t, i: i }); a.tracos.splice(i, 1); mudou = true; }
      }
      if (mudou) redesenhar(a);
    }
    function distSeg(px, py, x1, y1, x2, y2) {
      var dx = x2 - x1, dy = y2 - y1, l = dx * dx + dy * dy, u = l ? ((px - x1) * dx + (py - y1) * dy) / l : 0;
      u = Math.max(0, Math.min(1, u));
      var qx = x1 + u * dx - px, qy = y1 + u * dy - py; return Math.sqrt(qx * qx + qy * qy);
    }

    /* ---------- ações ---------- */
    T.desfazer = function () {
      var u = T.undo.pop();
      if (!u) { toast('Nada para desfazer.'); return; }
      if (u.tipo === 'add') { var a = T.areas[u.a], i = a.tracos.lastIndexOf(u.t); if (i >= 0) a.tracos.splice(i, 1); salvar(a); ajustar(a); redesenhar(a); }
      else if (u.tipo === 'apagar') {
        var b = T.areas[u.a];
        u.itens.slice().sort(function (x, y) { return x.i - y.i; }).forEach(function (it) { b.tracos.splice(Math.min(it.i, b.tracos.length), 0, it.t); });
        salvar(b); ajustar(b); redesenhar(b);
      } else if (u.tipo === 'limpar') {
        u.itens.forEach(function (it) { var c = T.areas[it.a]; c.tracos = it.tracos; salvar(c); ajustar(c); redesenhar(c); });
      }
    };
    function limparAreas(filtro, msgVazio) {
      var itens = [];
      T.lista.forEach(function (a) {
        if (!filtro(a) || !a.tracos.length) return;
        itens.push({ a: a.id, tracos: a.tracos }); a.tracos = []; salvar(a); redesenhar(a); ajustar(a);
      });
      if (!itens.length) { toast(msgVazio); return false; }
      T.undo.push({ tipo: 'limpar', itens: itens });
      return true;
    }
    T.limparBloco = function (numero) {
      var tem = T.lista.some(function (a) { return a.bloco === numero && a.tracos.length; });
      if (!tem) { toast('O bloco ' + numero + ' não tem traços.'); return; }
      if (!window.confirm('Apagar todos os traços do bloco ' + numero + '? (Dá para desfazer.)')) return;
      if (limparAreas(function (a) { return a.bloco === numero; }, '')) toast('Traços do bloco ' + numero + ' apagados.');
    };
    T.limparTudo = function () {
      if (!T.lista.some(function (a) { return a.tracos.length; })) { toast('Não há desenhos.'); return; }
      if (!window.confirm('Apagar todos os desenhos de todos os blocos? (Dá para desfazer enquanto a página estiver aberta.)')) return;
      if (limparAreas(function () { return true; }, '')) toast('Todos os desenhos foram apagados.');
    };

    /* ---------- modos ---------- */
    var toque = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || (navigator.maxTouchPoints || 0) > 0;
    function atualizarUI() {
      document.body.classList.toggle('caneta-on', T.ligada);
      document.body.classList.toggle('so-caneta', T.soCaneta);
      document.body.classList.toggle('ferr-borracha', T.ferr === 'borracha');
      var fab = $('fab-caneta');
      fab.setAttribute('aria-pressed', T.ligada ? 'true' : 'false');
      $('fab-rotulo').textContent = T.ligada ? 'Desligar' : 'Caneta';
      $('paleta').hidden = !T.ligada;
      Array.prototype.forEach.call(document.querySelectorAll('.ferr[data-ferr]'), function (b) {
        b.setAttribute('aria-checked', b.getAttribute('data-ferr') === T.ferr ? 'true' : 'false');
      });
      var so = $('btn-so-caneta');
      so.setAttribute('aria-pressed', T.soCaneta ? 'true' : 'false');
      so.title = T.soCaneta ? 'Só a caneta desenha; o dedo rola (toque para o dedo também desenhar)' : 'O dedo desenha (toque para só a caneta desenhar)';
      so.setAttribute('aria-label', so.title);
      var pal = $('paleta'); pal.classList.toggle('recolhida', !!prefs.paletaRecolhida);
      var rec = $('btn-recolher');
      rec.setAttribute('aria-label', prefs.paletaRecolhida ? 'Mostrar ferramentas' : 'Recolher ferramentas');
      rec.title = rec.getAttribute('aria-label');
      var mostrarAviso = T.ligada && !T.soCaneta && toque;
      if (!mostrarAviso) $('aviso-dedo').hidden = true;
      else if (!T._avisoMostrado) { T._avisoMostrado = true; $('aviso-dedo').hidden = false; clearTimeout(T._avisoT); T._avisoT = setTimeout(function () { $('aviso-dedo').hidden = true; }, 3000); }
      if (!T.ligada) T._avisoMostrado = false;
    }
    var recolherT = null;
    function agendarRecolher() {
      clearTimeout(recolherT);
      recolherT = setTimeout(function () { if (T.ligada && !prefs.paletaRecolhida) { prefs.paletaRecolhida = true; salvarPrefs(); atualizarUI(); } }, 3000);
    }
    T.agendarRecolher = agendarRecolher;
    function detectouStylus() {
      if (T.stylus) return;
      T.stylus = true;
      if (!prefs.soCanetaEscolhido && !T.soCaneta) {
        T.soCaneta = true; atualizarUI();
        toast('Stylus detectada: só a caneta desenha; o dedo rola a página. Dá para mudar na paleta.', 5000);
      }
    }
    T.ligar = function (v) {
      T.ligada = v; if (v) { prefs.paletaRecolhida = false; agendarRecolher(); } atualizarUI();
      T.lista.forEach(ajustar);
      if (v && !T.soCaneta && toque && !prefs.avisoVisto) { prefs.avisoVisto = 1; salvarPrefs(); }
    };
    T.iniciar = function (cb) {
      lerCores();
      T.soCaneta = !!prefs.soCaneta && !!prefs.soCanetaEscolhido;
      if (prefs.ferr && LARG[prefs.ferr] || prefs.ferr === 'borracha') T.ferr = prefs.ferr;
      $('fab-caneta').addEventListener('click', function () { T.ligar(!T.ligada); });
      $('aviso-desligar').addEventListener('click', function () { T.ligar(false); });
      Array.prototype.forEach.call(document.querySelectorAll('.ferr[data-ferr]'), function (b) {
        b.addEventListener('click', function () {
          T.ferr = b.getAttribute('data-ferr'); prefs.ferr = T.ferr;
          if (prefs.paletaRecolhida) { prefs.paletaRecolhida = false; }   // tocar na bolinha recolhida reabre
          salvarPrefs(); atualizarUI(); agendarRecolher();
        });
      });
      $('btn-desfazer').addEventListener('click', T.desfazer);
      $('btn-recolher').addEventListener('click', function () { prefs.paletaRecolhida = !prefs.paletaRecolhida; salvarPrefs(); atualizarUI(); });
      $('btn-limpar-bloco').addEventListener('click', function () { T.limparBloco(BLOCOS[blocoAtual].numero); });
      $('btn-so-caneta').addEventListener('click', function () {
        T.soCaneta = !T.soCaneta; prefs.soCaneta = T.soCaneta; prefs.soCanetaEscolhido = 1; salvarPrefs(); atualizarUI();
        toast(T.soCaneta ? 'Só a stylus desenha; o dedo rola a página.' : 'O dedo também desenha. Para rolar, desligue a caneta.');
      });
      document.addEventListener('pointerdown', function (e) { if (e.pointerType === 'pen') detectouStylus(); }, true);
      document.addEventListener('pointerover', function (e) { if (e.pointerType === 'pen') detectouStylus(); }, true);
      atualizarUI();
      abrirDB(function () {
        T.pronto = true;
        T.lista.forEach(function (a) { if (DB.mem[a.id]) a.tracos = DB.mem[a.id]; ajustar(a); });
        document.documentElement.setAttribute('data-tinta-pronta', DB.db ? 'indexeddb' : 'memoria');
        if (cb) cb();
      });
    };
    T.contar = function () { var n = 0; T.lista.forEach(function (a) { n += a.tracos.length; }); return n; };
    T.gravarAgora = gravarPendentes;
    return T;
  })();

  /* ================= montagem ================= */
  function montar() {
    var cont = $('blocos');
    var frag = document.createDocumentFragment();
    BLOCOS.forEach(function (b, i) { var s = criarBloco(b, i); secoes.push(s); frag.appendChild(s); });
    cont.appendChild(frag);
    criarFechamento();
    criarIndice();
    Object.keys(controlesQ).forEach(atualizarQ);
    atualizarPlacares();
    iniciarZoomUI();
    $('btn-tema').addEventListener('click', alternarTema);
    atualizarProgresso();
    Tinta.iniciar();
    window.__livro = { tinta: Tinta, estado: function () { return estado; }, blocoAtual: function () { return blocoAtual; } };
    if (location.hash) { var alvo = document.getElementById(location.hash.slice(1)); if (alvo) alvo.scrollIntoView(); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar); else montar();
})();
