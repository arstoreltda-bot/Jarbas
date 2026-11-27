/* Jarbas · módulo Tarefas (o que o senhor tem que fazer; separado dos compromissos da agenda) */
"use strict";
(function (J) {
  const T = (J.tarefas = {});
  const COL = "tarefas";
  const el = J.el;
  const semAcento = (x) => String(x || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

  /* pendentes primeiro (por prazo; sem prazo no fim), depois as feitas (mais recentes primeiro) */
  const chave = (t) => (t.prazo || "9999-99-99") + (t.hora || "99:99") + (t.importante ? "0" : "1") + (t.criadoEm || "");
  const ordenar = (l) => l.slice().sort((a, b) => (a.feita - b.feita) || (a.feita ? String(b.feitaEm || "").localeCompare(String(a.feitaEm || "")) : chave(a).localeCompare(chave(b))));
  T.lista = () => ordenar(J.store.lista(COL));
  T.pendentes = () => T.lista().filter((t) => !t.feita);
  T.obter = (id) => J.store.lista(COL).find((t) => t.id === id) || null;

  T.normalizar = function (t) {
    t = Object.assign({ titulo: "", prazo: "", hora: "", lembrete: null, importante: false, notas: "", feita: false }, t || {});
    t.titulo = String(t.titulo || "").trim().replace(/[.!]+$/, "").slice(0, 160);
    if (t.titulo) t.titulo = t.titulo[0].toUpperCase() + t.titulo.slice(1);
    t.prazo = /^\d{4}-\d{2}-\d{2}$/.test(t.prazo || "") ? t.prazo : "";
    const m = String(t.hora || "").match(/^(\d{1,2}):(\d{2})/); t.hora = t.prazo && m ? `${m[1].padStart(2, "0")}:${m[2]}` : "";
    t.lembrete = t.prazo ? J.agenda.normalizarLembrete(t.lembrete) : null;
    t.importante = !!t.importante; t.feita = !!t.feita;
    t.notas = String(t.notas || "").trim().slice(0, 500);
    return t;
  };
  T.valida = (t) => !!(t && t.titulo);
  function campos(t) { return { titulo: t.titulo, prazo: t.prazo, hora: t.hora, lembrete: t.lembrete, importante: t.importante, notas: t.notas, feita: t.feita, feitaEm: t.feita ? t.feitaEm || new Date().toISOString() : null }; }
  T.salvar = (t) => { const d = J.store.inserir(COL, campos(T.normalizar(t))); T.mudou(); return d; };
  T.alterar = (id, t) => { const base = T.obter(id); if (!base) return null; const d = J.store.atualizar(COL, id, campos(T.normalizar(Object.assign({}, base, t)))); T.mudou(); return d; };
  T.concluir = (id, feita = true) => { const d = J.store.atualizar(COL, id, { feita: !!feita, feitaEm: feita ? new Date().toISOString() : null }); T.mudou(); return d; };
  T.remover = (id) => { J.store.remover(COL, id); T.mudou(); };
  T.mudou = () => { if (T.onMudou) T.onMudou(); };

  /* filtro do cérebro: {status: "pendentes"|"feitas"|"todas", de, ate, termo, semPrazo} — o app conta, não a IA */
  const GENERICOS = /^(tarefas?|tudo|todos?|todas?|coisas?|pendencias?|afazeres)$/;
  T.filtrar = function (f) {
    f = f || {};
    const st = f.status || "pendentes";
    let termo = semAcento(f.termo).trim(); if (GENERICOS.test(termo)) termo = "";
    const hoje = J.agora().data;
    return T.lista().filter((t) => {
      if (st === "pendentes" && t.feita) return false;
      if (st === "feitas" && !t.feita) return false;
      if (f.atrasadas && !(t.prazo && t.prazo < hoje)) return false;
      if (f.semPrazo && t.prazo) return false;
      if (f.de) { // período: inclui as atrasadas pendentes quando o período começa hoje
        const ate = f.ate && f.ate >= f.de ? f.ate : f.de;
        if (!t.prazo) return false;
        const atrasadaConta = !t.feita && f.de <= hoje && t.prazo < hoje;
        if (!atrasadaConta && (t.prazo < f.de || t.prazo > ate)) return false;
      }
      if (termo && !semAcento(t.titulo + " " + t.notas).includes(termo.replace(/s$/, ""))) return false;
      return true;
    });
  };
  T.paraIA = function () {
    const sete = new Date(Date.now() - 7 * 86400000).toISOString();
    return T.lista().filter((t) => !t.feita || String(t.feitaEm || "") > sete).slice(0, 100)
      .map((t) => ({ id: t.id, titulo: t.titulo, prazo: t.prazo || undefined, hora: t.hora || undefined, feita: t.feita || undefined, importante: t.importante || undefined }));
  };
  T.rotuloPrazo = function (t, curto) {
    if (!t.prazo) return "";
    const hoje = J.agora().data;
    let d = t.prazo === hoje ? "hoje" : t.prazo === J.addDias(hoje, 1) ? "amanhã" : t.prazo === J.addDias(hoje, -1) ? "ontem" : J.rotuloDia(t.prazo).replace(/^.* · /, "");
    if (!curto && t.prazo < hoje && !t.feita) d = "atrasada, era " + d;
    return d + (t.hora ? " às " + J.fmtH(t.hora) : "");
  };

  /* lembretes: a tarefa com prazo vira um "compromisso" de aviso (com hora, ou às 9h do dia) */
  T.comoCompromissos = function () {
    return T.pendentes().filter((t) => t.prazo && t.lembrete !== -1).map((t) => ({
      id: "t-" + t.id, titulo: t.titulo, data: t.prazo, inicio: t.hora || "09:00", fim: "", diaInteiro: false, local: "", tarefa: true, semHora: !t.hora,
      lembrete: t.lembrete == null ? [0] : t.lembrete,
    }));
  };

  /* ---------- tela ---------- */
  const ICO_OK = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  let verFeitas = false;
  T.render = function () {
    const raiz = J.$("tarefas"); if (!raiz) return;
    const hoje = J.agora().data, todas = T.lista();
    const pend = todas.filter((t) => !t.feita), feitas = todas.filter((t) => t.feita);
    const grupos = [
      ["Atrasadas", pend.filter((t) => t.prazo && t.prazo < hoje), "atras"],
      ["Hoje", pend.filter((t) => t.prazo === hoje), ""],
      ["Próximas", pend.filter((t) => t.prazo && t.prazo > hoje), ""],
      ["Sem prazo", pend.filter((t) => !t.prazo), ""],
    ];
    const nova = el("input", { type: "text", placeholder: "Nova tarefa…", "aria-label": "Nova tarefa", maxlength: 160, enterkeyhint: "done" });
    const rapida = el("form", { class: "tf-nova card", autocomplete: "off", onsubmit: (e) => { e.preventDefault(); const v = nova.value.trim(); if (!v) return; T.salvar({ titulo: v }); J.vibrar(10); J.ui.toast("Tarefa anotada"); setTimeout(() => { const n = J.$("tarefas").querySelector(".tf-nova input"); if (n) n.focus(); }, 30); } },
      nova, el("button", { class: "mais", type: "button", "aria-label": "Nova tarefa com detalhes", onclick: () => T.abrirForm({ titulo: nova.value.trim() }), html: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>' }));
    const filhos = [rapida];
    grupos.forEach(([tit, l, cls]) => {
      if (!l.length) return;
      filhos.push(el("div", { class: "tf-grupo " + cls }, el("h3", { text: `${tit} · ${l.length}` }), el("div", { class: "itens" }, ...l.map(item))));
    });
    if (!pend.length) filhos.push(el("p", { class: "vazio", text: "Nenhuma tarefa pendente, senhor. Escreva acima ou peça na conversa: \"anota a tarefa de pagar o boleto amanhã\"." }));
    if (feitas.length) {
      filhos.push(el("button", { class: "ligacao tf-ver", type: "button", text: verFeitas ? "Esconder concluídas" : `Ver concluídas (${feitas.length})`, onclick: () => { verFeitas = !verFeitas; T.render(); } }));
      if (verFeitas) filhos.push(el("div", { class: "tf-grupo feitas" }, el("div", { class: "itens" }, ...feitas.slice(0, 40).map(item)),
        el("button", { class: "btn perigo tf-limpar", type: "button", text: "Apagar as concluídas", onclick: (e) => {
          const b = e.currentTarget; if (b.dataset.ok !== "1") { b.dataset.ok = "1"; b.textContent = `Toque de novo para apagar ${feitas.length}`; return; }
          feitas.forEach((t) => J.store.remover(COL, t.id)); T.mudou(); J.ui.toast("Concluídas apagadas");
        } })));
    }
    raiz.replaceChildren(...filhos);
  };
  function item(t) {
    const sub = [T.rotuloPrazo(t, true), t.prazo && t.prazo >= J.agora().data && t.lembrete !== -1 && !t.feita ? "🔔" : "", t.notas].filter(Boolean).join(" · ");
    return el("div", { class: "tf-item card" + (t.feita ? " feita" : "") + (t.importante ? " imp" : "") },
      el("button", { class: "tf-check", type: "button", "aria-label": t.feita ? "Marcar como não feita" : "Concluir", html: ICO_OK, onclick: () => { T.concluir(t.id, !t.feita); J.vibrar(12); if (!t.feita) J.ui.toast("Feito ✓"); } }),
      el("button", { class: "tf-txt", type: "button", onclick: () => T.abrirForm(t) },
        el("div", { class: "tt", text: (t.importante ? "★ " : "") + t.titulo }), sub ? el("div", { class: "sub", text: sub }) : null));
  }

  /* ---------- formulário ---------- */
  const LEMBRETES = [[-1, "Sem aviso"], [0, "Na hora (ou às 9h)"], [15, "15 min antes"], [30, "30 min antes"], [60, "1 hora antes"], [1440, "1 dia antes"]];
  T.abrirForm = function (t) {
    t = t || {}; const editando = !!t.id;
    const f = el("form", { class: "form", autocomplete: "off" });
    const campo = (rot, inp) => el("label", { class: "campo" }, el("span", { text: rot }), inp);
    const titulo = el("input", { type: "text", value: t.titulo || "", placeholder: "Ex.: Pagar o boleto da luz", required: true, maxlength: 160, enterkeyhint: "done" });
    const temPrazo = el("input", { type: "checkbox" }); temPrazo.checked = !!t.prazo;
    const prazo = el("input", { type: "date", value: t.prazo || J.agora().data });
    const hora = el("input", { type: "time", value: t.hora || "" });
    const lem = el("select", {}); LEMBRETES.forEach(([v, x]) => lem.append(el("option", { value: v, text: x })));
    const l0 = t.lembrete == null ? [0] : J.listaLembretes(t.lembrete); let atual = l0.length ? String(l0[0]) : "-1";
    if (l0.length > 1) { lem.append(el("option", { value: "manter", text: J.rotuloLembrete(l0).replace(/^avisos? /, "") })); atual = "manter"; }
    else if (!LEMBRETES.some(([v]) => String(v) === atual)) lem.append(el("option", { value: atual, text: J.rotuloLembrete(Number(atual)).replace(/^aviso /, "") }));
    lem.value = atual;
    const imp = el("input", { type: "checkbox" }); imp.checked = !!t.importante;
    const notas = el("textarea", { rows: 2, placeholder: "Opcional", maxlength: 500 }); notas.value = t.notas || "";
    const blocoPrazo = el("div", {}, el("div", { class: "duas" }, campo("Dia", prazo), campo("Hora (opcional)", hora)), campo("Lembrete", lem));
    const sync = () => { blocoPrazo.hidden = !temPrazo.checked; }; temPrazo.onchange = sync; sync();
    const aviso = el("p", { class: "alerta", hidden: true });
    f.append(campo("O que fazer", titulo), el("label", { class: "linha-check" }, temPrazo, el("span", { text: "Tem prazo" })), blocoPrazo,
      el("label", { class: "linha-check" }, imp, el("span", { text: "Importante ★" })), campo("Observações", notas), aviso);
    const botoes = el("div", { class: "botoes" });
    if (editando) botoes.append(el("button", { class: "btn perigo", type: "button", text: "Apagar", onclick: (e) => {
      const b = e.currentTarget; if (b.dataset.ok !== "1") { b.dataset.ok = "1"; b.textContent = "Toque de novo para apagar"; return; }
      T.remover(t.id); J.ui.fecharFolha(); J.ui.toast("Tarefa apagada");
    } }));
    botoes.append(el("button", { class: "btn primario", type: "submit", text: editando ? "Salvar" : "Anotar" }));
    f.append(botoes);
    f.onsubmit = (e) => {
      e.preventDefault();
      const novo = { titulo: titulo.value, prazo: temPrazo.checked ? prazo.value : "", hora: temPrazo.checked ? hora.value : "", lembrete: lem.value === "manter" ? l0 : Number(lem.value), importante: imp.checked, notas: notas.value };
      if (!T.valida(T.normalizar(Object.assign({}, novo)))) { aviso.hidden = false; aviso.textContent = "Escreva o que é para fazer."; return; }
      if (editando) T.alterar(t.id, novo); else T.salvar(novo);
      J.ui.fecharFolha(); J.ui.toast(editando ? "Tarefa alterada" : "Tarefa anotada");
    };
    J.ui.abrirFolha(editando ? "Tarefa" : "Nova tarefa", f);
  };
})(window.J);
