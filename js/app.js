/* Jarbas · aplicativo (conversa, voz, telas, ajustes e primeira vez) */
"use strict";
(function (J) {
  const $ = J.$, el = J.el, V = J.voz, G = J.gemini, A = J.agenda;
  const VERSAO = "1.0.11";
  const chat = $("chat"), entrada = $("entrada"), btnAcao = $("btn-acao");
  const ehIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const instalado = () => window.navigator.standalone === true || matchMedia("(display-mode: standalone)").matches;

  /* ================= utilidades de tela ================= */
  J.ui = {};
  let toastT;
  J.ui.toast = (t) => { const e = $("toast"); e.textContent = t; e.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (e.hidden = true), 2600); };
  J.ui.abrirFolha = (titulo, corpo) => { $("folha-t").textContent = titulo; $("folha-corpo").replaceChildren(corpo); $("folha").hidden = false; };
  J.ui.fecharFolha = () => { $("folha").hidden = true; $("folha-corpo").replaceChildren(); };
  $("folha-x").onclick = J.ui.fecharFolha; $("folha-fundo").onclick = J.ui.fecharFolha;

  let estadoAtual = "pronto";
  function estado(e) {
    estadoAtual = e || "pronto";
    const txt = { pronto: "Pronto", ouvindo: "Ouvindo…", pensando: "Pensando…", falando: "Falando…" }[estadoAtual];
    $("estado").textContent = txt; $("estado").classList.toggle("ativo", estadoAtual !== "pronto");
    $("orbe").className = "orbe" + (estadoAtual !== "pronto" ? " " + estadoAtual : "");
  }
  V.onEstado = (falando) => { if (falando) estado("falando"); else if (estadoAtual === "falando") estado("pronto"); };

  /* ================= conversa ================= */
  let historico = J.store.get("conversa", []).filter((h) => !/^Conectado, senhor/.test(h.texto || ""));
  const salvarHist = () => J.store.set("conversa", historico.slice(-60));
  function rolar() { const t = $("tela-conversa"); requestAnimationFrame(() => { t.scrollTop = t.scrollHeight; }); }
  function bolha(de, texto, extra) { const e = el("div", { class: "msg " + de + (extra ? " " + extra : ""), text: texto }); chat.append(e); rolar(); return e; }
  function digitando() { const e = el("div", { class: "digitando", "aria-label": "Jarbas está pensando" }, el("i"), el("i"), el("i")); chat.append(e); rolar(); return e; }

  /* Jarbas diz algo: escreve, guarda e fala. Retorna quando terminar de falar. */
  /* cumprimento do dia: só na primeira mensagem do senhor em cada dia */
  let saudarAgora = false;
  function marcarSaudacao() {
    const hoje = J.agora().data;
    if (J.store.get("saudacao.dia", "") !== hoje) { J.store.set("saudacao.dia", hoje); saudarAgora = true; }
  }
  function dizer(texto, { falar = true, guardar = true } = {}) {
    if (saudarAgora) {
      saudarAgora = false;
      const s = J.saudacao();
      texto = String(texto || "").replace(/^(bom dia|boa tarde|boa noite)[,!.]?\s*(senhor[,!.]?)?\s*/i, "");
      texto = /^(sim|às suas ordens|pronto|estou aqui|sistemas)/i.test(texto) ? `${s}, senhor. ${texto.replace(/^sim, senhor\.\s*/i, "")}`.trim() : `${s}, senhor. ${texto}`.trim();
    }
    bolha("jarbas", texto);
    if (guardar) { historico.push({ de: "jarbas", texto, t: Date.now() }); salvarHist(); }
    return falar ? V.falar(texto) : Promise.resolve();
  }

  const PRONTO = ["Sim, senhor. Estou pronto.", "Às suas ordens, senhor.", "Pronto e à disposição, senhor.", "Sim, senhor. Pode falar.", "Estou aqui, senhor.", "Sistemas prontos, senhor."];
  const ANOTADO = ["Anotado, senhor.", "Feito, senhor. Está na agenda.", "Perfeito, senhor. Marcado.", "Pronto, senhor. Já está anotado."];
  let ultimaFrase = {};
  const variar = (lista, chave) => { let i; do { i = Math.floor(Math.random() * lista.length); } while (lista.length > 1 && i === ultimaFrase[chave]); ultimaFrase[chave] = i; return lista[i]; };

  /* ---------- pendências (confirmações e perguntas de lembrete) ---------- */
  let pendente = null; // {tipo:"confirmar"|"lembrete"|"cancelar", c, id, cartao}
  function encerrarCartao(p, texto, ok) {
    if (!p || !p.cartao) return;
    const b = p.cartao.querySelector(".botoes, .chips"); if (b) b.remove();
    if (p.chips) p.chips.remove();
    p.cartao.append(el("div", { class: ok ? "feito" : "cancelado", text: texto }));
    if (ok && p.tipo !== "cancelar" && p.final) p.cartao.append(el("div", { class: "botoes" }, el("button", { class: "btn", type: "button", text: "Ver na agenda", onclick: () => { A.irPara(p.final.data); mostrar("agenda"); } })));
  }
  function descartarPendente(texto) { if (pendente) { encerrarCartao(pendente, texto || "Substituído", false); if (pendente.chips) pendente.chips.remove(); pendente = null; } }

  const ICO = {
    dia: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>',
    hora: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    sino: '<svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"/></svg>',
    local: '<svg viewBox="0 0 24 24"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>',
    pasta: '<svg viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
  };
  function detalhes(c) {
    const d = el("div", { class: "det" });
    const add = (ico, txt) => { if (txt) d.append(el("span", { html: ICO[ico] }), el("span", { text: txt })); };
    add("dia", J.rotuloDiaLongo(c.data)); add("hora", c.diaInteiro ? "Dia inteiro" : `${J.fmtH(c.inicio)} até ${J.fmtH(c.fim)}`);
    add("local", c.local); add("pasta", c.calendario); add("sino", c.lembrete == null ? "" : J.rotuloLembrete(c.lembrete).replace(/^aviso/, "Aviso"));
    return d;
  }
  function cartao(c, { titulo, perigo, botoes, alerta }) {
    const k = el("div", { class: "cartao" + (perigo ? " perigo" : "") }, el("div", { class: "tt", text: titulo || c.titulo }), detalhes(c));
    if (alerta) k.append(el("p", { class: "alerta", text: alerta }));
    if (botoes) k.append(el("div", { class: "botoes" }, botoes));
    chat.append(k); rolar(); return k;
  }

  function pedirConfirmacao(c, id, porVoz) {
    descartarPendente();
    const cf = A.conflitos(c, id);
    const alerta = cf.length ? `Atenção: nesse horário o senhor já tem ${cf.map((o) => `${o.titulo} (${J.rotuloHora(o)})`).join(", ")}.` : "";
    const p = { tipo: "confirmar", c, id };
    p.cartao = cartao(c, { alerta, botoes: [el("button", { class: "btn", type: "button", text: "Cancelar", onclick: () => recusar() }), el("button", { class: "btn primario", type: "button", text: id ? "Salvar alteração" : "Confirmar", onclick: () => confirmar() })] });
    pendente = p;
    const lem = c.lembrete == null ? "" : c.lembrete < 0 ? ", sem aviso" : `, com ${J.rotuloLembrete(c.lembrete)}`;
    const frase = id ? `Vou alterar para ${c.titulo}, ${J.diaFrase(c.data)}, ${c.diaInteiro ? "o dia inteiro" : "às " + J.fmtH(c.inicio)}${lem}. Confirma, senhor?`
      : `Vou marcar ${c.titulo}, ${J.diaFrase(c.data)}, ${c.diaInteiro ? "o dia inteiro" : "às " + J.fmtH(c.inicio)}${lem}. ${alerta ? alerta + " " : ""}Confirma, senhor?`;
    return dizer(frase).then(() => porVoz && ouvirDeNovo());
  }
  function perguntarLembrete(c, id, porVoz) {
    descartarPendente();
    const p = { tipo: "lembrete", c, id };
    p.cartao = cartao(c, {});
    const chips = el("div", { class: "chips" });
    [["Na hora", "na hora"], ["15 min antes", "15 minutos antes"], ["30 min antes", "30 minutos antes"], ["1 hora antes", "1 hora antes"], ["1 dia antes", "1 dia antes"], ["Sem aviso", "sem lembrete"]]
      .forEach(([r, v]) => chips.append(el("button", { class: "chip", type: "button", text: r, onclick: () => enviarTexto(v) })));
    chat.append(chips); p.chips = chips; rolar();
    pendente = p;
    return dizer("Quanto tempo antes o senhor deseja que eu o lembre?").then(() => porVoz && ouvirDeNovo());
  }
  function pedirCancelamento(alvo, porVoz) {
    descartarPendente();
    const p = { tipo: "cancelar", c: alvo, id: alvo.id };
    p.cartao = cartao(alvo, { perigo: true, botoes: [el("button", { class: "btn", type: "button", text: "Manter", onclick: () => recusar() }), el("button", { class: "btn perigo", type: "button", text: "Desmarcar", onclick: () => confirmar() })] });
    pendente = p;
    return dizer(`Deseja que eu desmarque ${alvo.titulo}, ${J.diaFrase(alvo.data)}${alvo.diaInteiro ? "" : ", às " + J.fmtH(alvo.inicio)}?`).then(() => porVoz && ouvirDeNovo());
  }
  function confirmar() {
    const p = pendente; if (!p) return dizer(variar(PRONTO, "pronto"));
    pendente = null;
    if (p.tipo === "cancelar") { A.remover(p.id); encerrarCartao(p, "Desmarcado ✓", true); return dizer("Desmarcado, senhor."); }
    if (p.tipo === "lembrete") { pendente = p; return dizer("Antes, senhor: quanto tempo antes devo lembrá-lo?"); }
    p.final = p.id ? A.alterar(p.id, p.c) : A.salvar(p.c);
    if (!p.final) { encerrarCartao(p, "Esse compromisso não existe mais.", false); return dizer("Esse compromisso não está mais na agenda, senhor."); }
    A.irPara(p.final.data);
    encerrarCartao(p, p.id ? "Alterado ✓" : "Anotado ✓", true);
    J.vibrar(15);
    return dizer(p.id ? "Alterado, senhor." : variar(ANOTADO, "anotado"));
  }
  function recusar() {
    const p = pendente; if (!p) return dizer("Perfeitamente, senhor.");
    pendente = null; encerrarCartao(p, p.tipo === "cancelar" ? "Mantido" : "Não marcado", false);
    return dizer(p.tipo === "cancelar" ? "Perfeitamente, senhor. Deixei como estava." : "Tudo bem, senhor, não marquei.");
  }

  /* ---------- executar a decisão do cérebro ---------- */
  async function executar(r, porVoz) {
    const resp = (r.resposta || "").trim();
    switch (r.acao) {
      case "agendar":
      case "remarcar": {
        let id = r.acao === "remarcar" ? r.id : (pendente && pendente.id) || null;
        const base = id ? A.obter(id) : null;
        if (id && !base) id = null;
        const anterior = pendente && pendente.c;
        let c = A.normalizar(Object.assign({}, base || {}, r.compromisso || {}));
        if (c.lembrete == null && base) c.lembrete = base.lembrete;
        if (c.lembrete == null && anterior && anterior.lembrete != null && pendente.tipo === "confirmar") c.lembrete = anterior.lembrete;
        if (!A.valido(c)) { await dizer(resp && r.acao !== "agendar" ? resp : "Perdão, senhor, não peguei o dia ou o horário. Pode repetir?"); return porVoz && ouvirDeNovo(); }
        if (c.lembrete == null) return perguntarLembrete(c, id, porVoz);
        return pedirConfirmacao(c, id, porVoz);
      }
      case "cancelar": {
        const alvo = A.obter(r.id);
        if (!alvo) { await dizer(resp || "Qual compromisso o senhor deseja desmarcar?"); return porVoz && ouvirDeNovo(); }
        return pedirCancelamento(alvo, porVoz);
      }
      case "confirmar": return confirmar();
      case "recusar": return recusar();
      case "lembrete": {
        const m = Number(r.minutos);
        if (!pendente || pendente.tipo !== "lembrete") return dizer(resp || variar(PRONTO, "pronto"));
        if (r.minutos == null || isNaN(m)) { await dizer("Perdão, senhor. Quanto tempo antes devo lembrá-lo? Por exemplo, 30 minutos antes ou um dia antes."); return porVoz && ouvirDeNovo(); }
        const p = pendente; if (p.chips) p.chips.remove(); p.cartao.remove(); pendente = null;
        p.c.lembrete = Math.max(-1, Math.min(43200, m));
        return pedirConfirmacao(p.c, p.id, porVoz);
      }
      case "naoentendi": await dizer("Perdão, senhor, não consegui ouvir bem. Pode repetir?"); return porVoz && ouvirDeNovo();
      case "perguntar": await dizer(resp || "Pode me dar mais detalhes, senhor?"); return porVoz && ouvirDeNovo();
      case "listar": return dizer(resp || "Sua agenda está livre, senhor.");
      default: {
        await dizer(resp || variar(PRONTO, "pronto"));
        if (porVoz && pendente) ouvirDeNovo();
      }
    }
  }

  /* ---------- processar uma mensagem (texto ou áudio) ---------- */
  let ocupado = false;
  async function processar(ent) {
    if (ocupado) return; ocupado = true;
    $("sugestoes").hidden = true;
    marcarSaudacao();
    const porVoz = !!ent.audio;
    let minha = null;
    if (ent.texto) { minha = bolha("eu", ent.texto); historico.push({ de: "eu", texto: ent.texto, t: Date.now() }); salvarHist(); }
    else minha = bolha("eu", "Áudio…", "voz carregando");
    estado("pensando");
    const pens = digitando();
    let r = null;
    try {
      // atalhos instantâneos para respostas simples digitadas
      if (ent.texto && pendente) { const l = J.cerebro.local(ent.texto, pendente); if (["confirmar", "recusar", "lembrete"].includes(l.acao)) r = l; }
      if (!r && ent.texto && /^\s*(oi|olá|ola|ei|ô)?[,\s]*jarbas[\s!?.,]*$/i.test(ent.texto)) r = { acao: "conversa", resposta: variar(PRONTO, "pronto") };
      if (!r) {
        try { r = await J.cerebro.entender(ent, pendente, historico); }
        catch (e1) {
          if (e1.tipo === "chave" || e1.tipo === "semchave" || e1.tipo === "rede") throw e1;
          await J.sleep(1500); // o Google às vezes falha uma vez: tenta de novo antes de incomodar o senhor
          r = await J.cerebro.entender(ent, pendente, historico);
        }
      }
    } catch (e) {
      console.warn("Jarbas IA", e && e.tipo, e && e.status, e && e.message);
      if (ent.texto) {
        r = J.cerebro.local(ent.texto, pendente);
        if (r.acao === "conversa" && e.tipo !== "semchave") { r.resposta = G.explicar(e); r.tecnico = `Detalhe técnico: ${e.tipo || "erro"}${e.status ? " " + e.status : ""}${e.modeloUsado ? " · " + e.modeloUsado : ""}${e.message ? " · " + String(e.message).slice(0, 120) : ""}`; }
      } else {
        pens.remove(); minha.remove(); estado(); ocupado = false;
        await dizer(G.explicar(e), { guardar: false });
        bolha("jarbas", `Detalhe técnico: ${e.tipo || "erro"}${e.status ? " " + e.status : ""}${e.modeloUsado ? " · " + e.modeloUsado : ""}${e.message ? " · " + String(e.message).slice(0, 120) : ""}`, "tecnico");
        return;
      }
    }
    pens.remove(); estado();
    if (porVoz) {
      const tr = String(r.transcricao || "").trim();
      if (!tr || r.acao === "naoentendi") { minha.remove(); r.acao = "naoentendi"; }
      else { minha.textContent = tr; minha.classList.remove("carregando"); historico.push({ de: "eu", texto: tr, t: Date.now(), voz: true }); salvarHist(); }
    }
    ocupado = false;
    try { await executar(r, porVoz); if (r.tecnico) bolha("jarbas", r.tecnico, "tecnico"); } catch (e) { console.error(e); }
  }
  function enviarTexto(t) { t = String(t || "").trim(); if (!t) return; if (escuta) escuta.cancelar(); if (ocupado) { J.ui.toast("Um instante, senhor…"); return; } V.destravar(); processar({ texto: t }); }

  /* ================= microfone ================= */
  let escuta = null;
  async function ouvir({ auto = false, nova = false } = {}) {
    if (escuta) { escuta.parar(); return; }
    if (ocupado) return;
    V.destravar(); V.calar();
    if (!G.temChave()) { if (!auto) { await dizer("Para eu ouvir sua voz, preciso da minha chave do Google, senhor. Vamos configurá-la?"); mostrarInicio("chave"); } return; }
    if (!V.microfoneDisponivel()) { if (!auto) dizer("Este navegador não me deixa usar o microfone, senhor. Abra o Jarbas pelo ícone na tela de início."); return; }
    const ov = $("escuta"), orbeG = $("escuta-orbe"), txt = $("escuta-txt");
    txt.textContent = auto ? "Pode responder, senhor…" : "Ouvindo, senhor…";
    ov.hidden = false; estado("ouvindo");
    if (!auto && !nova) { V.som("ouvir"); await J.sleep(160); }
    try {
      escuta = await V.ouvir({
        esperaInicial: auto ? 6000 : 9000,
        onNivel: (n) => { orbeG.style.transform = `scale(${1 + n * 0.35})`; },
        onFala: () => { txt.textContent = "Estou ouvindo… toque quando terminar"; },
      });
    } catch (e) {
      ov.hidden = true; estado(); escuta = null;
      if (e.message === "negado") dizer("Preciso da permissão do microfone, senhor. Toque no microfone de novo e escolha Permitir. Se não aparecer, vá em Ajustes do iPhone, Safari, Microfone.");
      else dizer("Não consegui acessar o microfone agora, senhor.");
      return;
    }
    const res = await escuta.pronto; escuta = null;
    if (res && res.mudo && !nova) { return ouvir({ auto, nova: true }); } // reabre o microfone sozinho, sem incomodar
    ov.hidden = true; orbeG.style.transform = ""; estado();
    if (!res || res.mudo) { if (res && !auto) dizer("Não consegui ouvir o microfone, senhor. Toque nele de novo, por favor.", { guardar: false }); return; }
    if (!res.falou || res.duracao < 0.5) { if (res.pico < 0.003) V.soltarMicrofone(); if (!auto) dizer("Não ouvi nada, senhor. Toque no microfone e fale de novo, por favor.", { guardar: false }); return; }
    V.som("fim");
    processar({ audio: res.wav, duracao: res.duracao });
  }
  /* conversa contínua: depois de uma pergunta do Jarbas, o microfone abre sozinho */
  function ouvirDeNovo() { if (J.store.get("voz.continua", true) && V.ligada() && document.visibilityState === "visible") setTimeout(() => ouvir({ auto: true }), 250); }
  $("escuta-orbe").onclick = () => escuta && escuta.parar();
  $("escuta-enviar").onclick = () => escuta && escuta.parar();
  $("escuta-cancelar").onclick = () => escuta && escuta.cancelar();

  /* ================= compositor ================= */
  function ajustarCampo() {
    entrada.style.height = "auto"; entrada.style.height = Math.min(entrada.scrollHeight, 132) + "px";
    const tem = !!entrada.value.trim();
    btnAcao.classList.toggle("enviar", tem); btnAcao.setAttribute("aria-label", tem ? "Enviar" : "Falar com o Jarbas");
  }
  entrada.addEventListener("input", ajustarCampo);
  entrada.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviarCampo(); } });
  function enviarCampo() {
    const t = entrada.value.trim(); if (!t) return;
    entrada.value = ""; ajustarCampo(); enviarTexto(t);
  }
  btnAcao.addEventListener("click", () => { if (entrada.value.trim()) enviarCampo(); else { entrada.blur(); ouvir(); } });
  $("form").addEventListener("submit", (e) => { e.preventDefault(); enviarCampo(); });
  $("sugestoes").addEventListener("click", (e) => { const b = e.target.closest(".chip"); if (b) enviarTexto(b.textContent); });

  /* ================= abas ================= */
  let telaAtual = "conversa";
  function mostrar(qual) {
    telaAtual = qual;
    ["conversa", "agenda", "ajustes"].forEach((t) => { $("tela-" + t).hidden = t !== qual; });
    document.querySelectorAll("#abas button").forEach((b) => b.toggleAttribute("aria-current", b.dataset.tela === qual) || b.dataset.tela === qual && b.setAttribute("aria-current", "page"));
    $("compositor").hidden = qual !== "conversa";
    if (qual === "agenda") { A.render(); $("tela-agenda").scrollTop = 0; }
    if (qual === "ajustes") renderAjustes();
    if (qual === "conversa") rolar();
  }
  J.ui.mostrar = mostrar;
  document.querySelectorAll("#abas button").forEach((b) => (b.onclick = () => mostrar(b.dataset.tela)));
  function contador() { const n = A.lista().filter((c) => c.data >= J.agora().data).length; $("contador").hidden = !n; $("contador").textContent = n > 99 ? "99+" : String(n); }
  A.onMudou = () => { contador(); if (telaAtual === "agenda") A.render(); };

  /* botão de voz no topo */
  function pintarVoz() { const on = V.ligada(); $("btn-voz").setAttribute("aria-pressed", String(on)); $("btn-voz").setAttribute("aria-label", on ? "Voz do Jarbas ligada" : "Voz do Jarbas desligada"); }
  $("btn-voz").onclick = () => { const on = !V.ligada(); J.store.set("voz.ligada", on); pintarVoz(); if (!on) V.calar(); else { V.destravar(); V.falar("Voz ligada, senhor."); } J.ui.toast(on ? "Voz ligada" : "Voz desligada"); };

  /* ================= lembretes ================= */
  let avisoAtual = null;
  function avisar(c, quando) {
    avisoAtual = c;
    $("aviso-t").textContent = c.titulo;
    $("aviso-s").textContent = (c.diaInteiro ? "Dia inteiro" : "Às " + J.fmtH(c.inicio)) + " · " + quando + (c.local ? " · " + c.local : "");
    $("aviso").hidden = false;
    V.destravar(); V.som("aviso"); J.vibrar([200, 100, 200]);
    setTimeout(() => dizer(`Com licença, senhor. Lembrete: ${c.titulo}${c.diaInteiro ? "" : ", às " + J.fmtH(c.inicio)}, ${quando}.`), 1100);
    try { if ("Notification" in window && Notification.permission === "granted" && navigator.serviceWorker) navigator.serviceWorker.ready.then((r) => r.showNotification("Jarbas · " + c.titulo, { body: (c.diaInteiro ? "Hoje" : "Às " + J.fmtH(c.inicio)) + ", " + quando, icon: "icons/icon-192.png", tag: c.id })); } catch (e) {}
  }
  $("aviso-ok").onclick = () => { $("aviso").hidden = true; avisoAtual = null; };
  const verificar = () => A.verificarLembretes(avisar);
  setInterval(verificar, 10000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { verificar(); contador(); if (telaAtual === "agenda") A.render(); } });

  /* ================= ajustes ================= */
  function interruptor(ligado, aoMudar, rotulo) {
    const i = el("input", { type: "checkbox", role: "switch", "aria-label": rotulo }); i.checked = !!ligado; i.onchange = () => aoMudar(i.checked);
    return el("label", { class: "chave-sw" }, i, el("span"));
  }
  function linha(rot, sub, direita) { return el("div", { class: "linha" }, el("div", { class: "rot" }, rot, sub ? el("small", { text: sub }) : null), direita); }
  function selecao(opcoes, valor, aoMudar, rotulo) {
    const s = el("select", { "aria-label": rotulo }); opcoes.forEach(([v, t]) => s.append(el("option", { value: v, text: t }))); s.value = valor; s.onchange = () => aoMudar(s.value); return s;
  }
  function renderAjustes() {
    const raiz = $("ajustes"); const tem = G.temChave();
    const cerebro = el("div", { class: "grupo" },
      linha("Google Gemini", tem ? "Modelo: " + G.modelo() : "Sem chave: só agenda básica por texto", el("span", { class: "pilula" + (tem ? "" : " nao"), text: tem ? "Conectado" : "Desligado" })),
      linha(tem ? "Trocar a chave" : "Configurar a chave grátis", "Passo a passo no Google AI Studio", el("button", { class: "btn", type: "button", text: tem ? "Trocar" : "Configurar", onclick: () => mostrarInicio("chave") })));

    const vozes = V.vozesOrdenadas();
    const premium = V.modo() === "premium";
    const voz = el("div", { class: "grupo" },
      linha("Responder em voz", null, interruptor(V.ligada(), (v) => { J.store.set("voz.ligada", v); pintarVoz(); if (!v) V.calar(); }, "Responder em voz")),
      linha("Tipo de voz", premium ? "Mais natural, porém demora alguns segundos e tem cota diária" : "Responde na hora", selecao([["premium", "Premium"], ["iphone", "Do iPhone"]], V.modo(), (v) => { J.store.set("voz.modo", v); renderAjustes(); }, "Tipo de voz")),
      premium ? linha("Voz premium", null, selecao(V.VOZES_PREMIUM, V.vozPremium(), (v) => { J.store.set("voz.premium", v); testarVoz(); }, "Voz premium"))
        : linha("Voz do iPhone", vozes.length ? null : "Nenhuma voz em português encontrada", selecao([["", "Automática"]].concat(vozes.map((v) => [v.name, v.name + (V.masculina(v) ? " ♂" : "")])), V.vozIphone(), (v) => { J.store.set("voz.iphone", v); testarVoz(); }, "Voz do iPhone")),
      premium ? null : linha("Jeito de falar", null, selecao([["ia", "Assistente de IA"], ["natural", "Natural"], ["grave", "Grave e calmo"]], J.store.get("voz.estilo", "ia"), (v) => { J.store.set("voz.estilo", v); testarVoz(); }, "Jeito de falar")),
      linha("Ouvir um exemplo", null, el("button", { class: "btn", type: "button", text: "Ouvir", onclick: testarVoz })),
      linha("Conversa contínua", "Quando eu fizer uma pergunta, o microfone abre sozinho", interruptor(J.store.get("voz.continua", true), (v) => J.store.set("voz.continua", v), "Conversa contínua")));

    const inputArq = el("input", { type: "file", accept: "application/json,.json", hidden: true, onchange: importar });
    const dados = el("div", { class: "grupo" },
      linha("Fazer backup", "Salva agenda e ajustes num arquivo", el("button", { class: "btn", type: "button", text: "Exportar", onclick: exportar })),
      linha("Restaurar backup", null, el("button", { class: "btn", type: "button", text: "Importar", onclick: () => inputArq.click() })),
      linha("Limpar a conversa", "A agenda não é apagada", el("button", { class: "btn perigo", type: "button", text: "Limpar", onclick: (e) => {
        const b = e.currentTarget; if (b.dataset.ok !== "1") { b.dataset.ok = "1"; b.textContent = "Confirmar"; return; }
        historico = []; salvarHist(); chat.replaceChildren(); descartarPendente(); bolha("jarbas", variar(PRONTO, "pronto")); J.ui.toast("Conversa limpa"); renderAjustes();
      } })), inputArq);

    const app = el("div", { class: "grupo" },
      linha("Instalado na tela de início", instalado() ? "Funcionando como aplicativo" : "Abra no Safari e adicione à Tela de Início", el("span", { class: "pilula" + (instalado() ? "" : " nao"), text: instalado() ? "Sim" : "Não" })),
      instalado() ? null : linha("Como instalar", null, el("button", { class: "btn", type: "button", text: "Ver", onclick: () => mostrarInicio("instalar") })));

    raiz.replaceChildren(
      el("div", { class: "secao" }, el("h3", { text: "Cérebro" }), cerebro),
      el("div", { class: "secao" }, el("h3", { text: "Voz" }), voz),
      el("div", { class: "secao" }, el("h3", { text: "Seus dados (ficam só neste iPhone)" }), dados),
      el("div", { class: "secao" }, el("h3", { text: "Aplicativo" }), app),
      el("p", { class: "rodape", text: `Jarbas ${VERSAO} · seu assistente pessoal` }));
  }
  V.onVozes = () => { if (telaAtual === "ajustes") renderAjustes(); };
  function testarVoz() { V.destravar(); V.falar(`${J.saudacao()}, senhor. Sou o Jarbas. Em que posso ajudá-lo?`, { forcar: true }); }

  async function exportar() {
    const dados = JSON.stringify(J.store.exportar(), null, 1);
    const nome = `jarbas-backup-${J.agora().data}.json`;
    try {
      const arq = new File([dados], nome, { type: "application/json" });
      if (navigator.canShare && navigator.canShare({ files: [arq] })) { await navigator.share({ files: [arq], title: "Backup do Jarbas" }); return; }
    } catch (e) { if (e && e.name === "AbortError") return; }
    const a = el("a", { href: URL.createObjectURL(new Blob([dados], { type: "application/json" })), download: nome }); document.body.append(a); a.click(); a.remove();
  }
  function importar(e) {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => { try { J.store.importar(JSON.parse(r.result)); J.ui.toast("Backup restaurado"); setTimeout(() => location.reload(), 700); } catch (err) { J.ui.toast(err.message || "Arquivo inválido"); } };
    r.readAsText(f); e.target.value = "";
  }

  /* ================= primeira vez: instalar e chave ================= */
  const ICO_COMP = '<svg viewBox="0 0 24 24"><path d="M12 3v12M8 7l4-4 4 4"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>';
  const ICO_MAIS = '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M12 8v8M8 12h8"/></svg>';
  function mostrarInicio(passo) {
    const raiz = $("inicio"); raiz.hidden = false;
    const fechar = () => { raiz.hidden = true; raiz.replaceChildren(); };
    if (passo === "instalar") {
      raiz.replaceChildren(el("div", { class: "inicio-in" },
        el("div", { class: "orbe" }, el("i")),
        el("h2", { text: "Instale o Jarbas" }),
        el("p", { class: "lead", text: "Assim ele abre em tela cheia, como um aplicativo, e pode usar o microfone." }),
        el("ol", { class: "passos" },
          el("li", { html: `<span>Abra este endereço no <b>Safari</b>.</span>` }),
          el("li", { html: `<span>Toque em <b>Compartilhar</b> ${ICO_COMP} (na barra de baixo; se não aparecer, toque em <b>⋯</b> primeiro).</span>` }),
          el("li", { html: `<span>Role e toque em <b>Adicionar à Tela de Início</b> ${ICO_MAIS}.</span>` }),
          el("li", { html: `<span>Deixe <b>Abrir como App Web</b> ligado e toque em <b>Adicionar</b>.</span>` }),
          el("li", { html: `<span>Feche o Safari e abra o <b>Jarbas</b> pelo ícone novo na tela de início.</span>` })),
        el("button", { class: "ligacao", type: "button", text: "Continuar no navegador por enquanto", onclick: () => { J.store.set("inicio.pulouInstalar", true); fechar(); if (!G.temChave() && !J.store.get("inicio.pulouChave")) mostrarInicio("chave"); } })));
      return;
    }
    const campo = el("input", { type: "text", placeholder: "Cole aqui a chave (AQ.… ou AIza…)", autocapitalize: "off", autocorrect: "off", spellcheck: "false", "aria-label": "Chave da API do Gemini", value: "" });
    const msg = el("p", { class: "fraco", text: "A chave fica guardada só neste iPhone." });
    const botao = el("button", { class: "btn primario", type: "button", text: "Conectar o Jarbas" });
    botao.onclick = async () => {
      const k = campo.value.trim().replace(/\s+/g, "");
      if (k.length < 20) { msg.textContent = "Essa chave parece incompleta. Copie de novo no AI Studio."; msg.style.color = "var(--alerta)"; return; }
      botao.disabled = true; botao.textContent = "Testando a chave…"; msg.style.color = ""; msg.textContent = "Conversando com o Google…";
      try {
        await G.configurar(k);
        fechar(); renderAjustes(); V.destravar();
        dizer("Conectado, senhor. Estou pronto.", { guardar: false });
      } catch (e) {
        botao.disabled = false; botao.textContent = "Conectar o Jarbas"; msg.style.color = "var(--alerta)";
        msg.textContent = e.tipo === "chave" ? "O Google recusou essa chave. Confira se copiou inteira." : e.tipo === "rede" ? "Sem internet. Tente de novo." : "Não deu certo agora (" + (e.message || "erro") + "). Tente de novo.";
      }
    };
    raiz.replaceChildren(el("div", { class: "inicio-in" },
      el("div", { class: "orbe" }, el("i")),
      el("h2", { text: "Ligue o cérebro do Jarbas" }),
      el("p", { class: "lead", text: "Leva 2 minutos e é grátis. Só precisa de uma conta Google (a do Gmail serve)." }),
      el("ol", { class: "passos" },
        el("li", { html: `<span>Toque aqui: <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a> e entre com sua conta Google. Se pedir, aceite os termos.</span>` }),
        el("li", { html: `<span>Toque em <b>Create API key</b> (Criar chave de API). Se perguntar o projeto, escolha o que aparecer ou crie um novo.</span>` }),
        el("li", { html: `<span>Toque em <b>Copiar</b> ao lado da chave (começa com <b>AQ.</b> ou <b>AIza</b>).</span>` }),
        el("li", { html: `<span>Volte aqui, cole no campo abaixo e toque em <b>Conectar</b>. Não precisa cadastrar cartão.</span>` })),
      campo, botao, msg,
      el("button", { class: "ligacao", type: "button", text: G.temChave() ? "Voltar" : "Fazer isso depois", onclick: () => { J.store.set("inicio.pulouChave", true); fechar(); } })));
  }

  /* ================= teclado e tela (iPhone) ================= */
  function ajustarAltura() {
    const vv = window.visualViewport; const h = vv ? vv.height : window.innerHeight;
    document.documentElement.style.setProperty("--altura", h + "px");
    document.body.classList.toggle("teclado", !!vv && window.innerHeight - vv.height > 120);
    if (vv && vv.offsetTop) window.scrollTo(0, 0);
    if (telaAtual === "conversa") rolar();
  }
  if (window.visualViewport) { visualViewport.addEventListener("resize", ajustarAltura); visualViewport.addEventListener("scroll", ajustarAltura); }
  window.addEventListener("resize", ajustarAltura); ajustarAltura();
  document.addEventListener("gesturestart", (e) => e.preventDefault()); // sem zoom de pinça
  let ultimoToque = 0;
  document.addEventListener("touchend", (e) => { const t = Date.now(); if (t - ultimoToque < 300 && !e.target.closest("input,textarea,select")) e.preventDefault(); ultimoToque = t; }, { passive: false });
  document.addEventListener("pointerdown", () => V.destravar(), { passive: true });

  /* ================= início ================= */
  function iniciar() {
    pintarVoz(); contador(); G.revisar();
    const recentes = historico.slice(-16);
    let ultimoDia = "";
    recentes.forEach((h) => {
      const d = h.t ? new Date(h.t).toLocaleDateString("pt-BR", { timeZone: J.TZ }) : "";
      if (d && d !== ultimoDia) { ultimoDia = d; chat.append(el("div", { class: "data-sep", text: d === new Date().toLocaleDateString("pt-BR", { timeZone: J.TZ }) ? "Hoje" : d })); }
      bolha(h.de, h.texto, h.voz ? "voz" : "");
    });
    if (historico.length) $("sugestoes").hidden = true;
    bolha("jarbas", variar(PRONTO, "pronto"));
    if (ehIOS && !instalado() && !J.store.get("inicio.pulouInstalar")) mostrarInicio("instalar");
    else if (!G.temChave() && !J.store.get("inicio.pulouChave")) mostrarInicio("chave");
    verificar();
  }
  iniciar();

  /* atualização garantida: compara com a versão publicada e recarrega sozinho */
  async function checarVersao() {
    try {
      const r = await fetch("versao.json?t=" + Date.now(), { cache: "no-store" });
      if (!r.ok) return;
      const v = (await r.json()).versao;
      if (v && v !== VERSAO && sessionStorage.getItem("jarbas.recarregou") !== v) {
        sessionStorage.setItem("jarbas.recarregou", v);
        try { const ks = await caches.keys(); await Promise.all(ks.map((k) => caches.delete(k))); } catch (e) {}
        try { const rs = await navigator.serviceWorker.getRegistrations(); await Promise.all(rs.map((x) => x.update())); } catch (e) {}
        location.reload();
      }
    } catch (e) {}
  }
  checarVersao();
  document.addEventListener("visibilitychange", () => { if (!document.hidden) checarVersao(); });

  /* aplicativo offline + atualizações */
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").then((reg) => {
      reg.addEventListener("updatefound", () => {
        const n = reg.installing; if (!n) return;
        n.addEventListener("statechange", () => { if (n.state === "installed" && navigator.serviceWorker.controller) J.ui.toast("Atualizando o Jarbas…"); });
      });
      document.addEventListener("visibilitychange", () => { if (!document.hidden) reg.update().catch(() => {}); });
    }).catch(() => {});
  }

  /* para testes automatizados */
  J._teste = { processar, executar, get pendente() { return pendente; }, enviarTexto, mostrar, ouvir };
})(window.J);
