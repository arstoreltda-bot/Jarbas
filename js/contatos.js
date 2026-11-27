/* Jarbas · contatos guardados no próprio Jarbas e ligações (abre o discador do iPhone) */
"use strict";
(function (J) {
  const K = (J.contatos = {});
  const COL = "contatos";
  const el = J.el;
  const semAcento = (x) => String(x || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

  K.lista = () => J.store.lista(COL).slice().sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  K.obter = (id) => J.store.lista(COL).find((c) => c.id === id) || null;
  K.digitos = (n) => String(n || "").replace(/[^\d+]/g, "").replace(/(?!^)\+/g, "");
  K.formatar = function (n) {
    const d = K.digitos(n).replace(/^\+?55(?=\d{10,11}$)/, "");
    if (/^\d{11}$/.test(d)) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    if (/^\d{10}$/.test(d)) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    if (/^\d{9}$/.test(d)) return `${d.slice(0, 5)}-${d.slice(5)}`;
    if (/^\d{8}$/.test(d)) return `${d.slice(0, 4)}-${d.slice(4)}`;
    return n;
  };
  K.normalizar = function (c) {
    c = Object.assign({ nome: "", numero: "" }, c || {});
    c.nome = String(c.nome || "").trim().replace(/\s+/g, " ").slice(0, 60);
    if (c.nome) c.nome = c.nome.split(" ").map((p, i) => (i > 0 && /^(da|de|do|das|dos|e)$/i.test(p) ? p.toLowerCase() : p.charAt(0).toUpperCase() + p.slice(1))).join(" ");
    c.numero = K.digitos(c.numero).slice(0, 16);
    return c;
  };
  K.valido = (c) => !!(c && c.nome && K.digitos(c.numero).replace("+", "").length >= 8);
  K.salvar = function (c) {
    c = K.normalizar(c);
    const igual = K.lista().find((x) => semAcento(x.nome) === semAcento(c.nome));
    const d = igual ? J.store.atualizar(COL, igual.id, { nome: c.nome, numero: c.numero }) : J.store.inserir(COL, { nome: c.nome, numero: c.numero });
    K.mudou(); return { contato: d, atualizado: !!igual };
  };
  K.alterar = (id, c) => { const d = J.store.atualizar(COL, id, K.normalizar(Object.assign({}, K.obter(id), c))); K.mudou(); return d; };
  K.remover = (id) => { J.store.remover(COL, id); K.mudou(); };
  K.mudou = () => { if (K.onMudou) K.onMudou(); };
  K.paraIA = () => K.lista().map((c) => ({ id: c.id, nome: c.nome }));

  /* procura pelo nome: exato > começa com > contém (cada palavra) */
  K.procurar = function (nome) {
    const n = semAcento(nome).replace(/^(o|a|do|da|pro|pra|para o|para a)\s+/, "");
    if (!n) return [];
    const l = K.lista();
    const exato = l.filter((c) => semAcento(c.nome) === n); if (exato.length) return exato;
    const comeca = l.filter((c) => semAcento(c.nome).startsWith(n) || semAcento(c.nome).split(" ").some((p) => p === n)); if (comeca.length) return comeca;
    const pal = n.split(/\s+/).filter((p) => p.length > 2);
    return l.filter((c) => pal.length && pal.every((p) => semAcento(c.nome).includes(p)));
  };
  K.ligar = (c) => { location.href = "tel:" + K.digitos(c.numero || c); };

  /* ---------- tela (em Ajustes) ---------- */
  const ICO_TEL = '<svg viewBox="0 0 24 24"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/></svg>';
  K.ICO_TEL = ICO_TEL;
  K.renderGrupo = function () {
    const g = el("div", { class: "grupo" });
    const l = K.lista();
    if (!l.length) g.append(el("div", { class: "linha" }, el("div", { class: "rot" }, "Nenhum contato ainda", el("small", { text: "Diga: \"salva o contato do João, 11 98765-4321\"" }))));
    l.forEach((c) => g.append(el("div", { class: "linha" },
      el("button", { class: "rot ct-nome", type: "button", onclick: () => K.abrirForm(c) }, c.nome, el("small", { text: K.formatar(c.numero) })),
      el("button", { class: "icone tel", type: "button", "aria-label": "Ligar para " + c.nome, html: ICO_TEL, onclick: () => K.ligar(c) }))));
    g.append(el("div", { class: "linha" }, el("div", { class: "rot" }, "Novo contato"), el("button", { class: "btn", type: "button", text: "Adicionar", onclick: () => K.abrirForm({}) })));
    return g;
  };
  K.abrirForm = function (c) {
    c = c || {}; const editando = !!c.id;
    const f = el("form", { class: "form", autocomplete: "off" });
    const campo = (rot, inp) => el("label", { class: "campo" }, el("span", { text: rot }), inp);
    const nome = el("input", { type: "text", value: c.nome || "", placeholder: "Ex.: João da loja", required: true, maxlength: 60 });
    const numero = el("input", { type: "tel", value: c.numero ? K.formatar(c.numero) : "", placeholder: "(11) 98765-4321", required: true, maxlength: 20, inputmode: "tel" });
    const aviso = el("p", { class: "alerta", hidden: true });
    f.append(campo("Nome", nome), campo("Telefone", numero), aviso);
    const botoes = el("div", { class: "botoes" });
    if (editando) botoes.append(el("button", { class: "btn perigo", type: "button", text: "Apagar", onclick: (e) => {
      const b = e.currentTarget; if (b.dataset.ok !== "1") { b.dataset.ok = "1"; b.textContent = "Toque de novo para apagar"; return; }
      K.remover(c.id); J.ui.fecharFolha(); J.ui.toast("Contato apagado");
    } }));
    botoes.append(el("button", { class: "btn primario", type: "submit", text: editando ? "Salvar" : "Adicionar" }));
    f.append(botoes);
    f.onsubmit = (e) => {
      e.preventDefault();
      const novo = K.normalizar({ nome: nome.value, numero: numero.value });
      if (!K.valido(novo)) { aviso.hidden = false; aviso.textContent = "Preencha o nome e um telefone com DDD."; return; }
      if (editando) K.alterar(c.id, novo); else K.salvar(novo);
      J.ui.fecharFolha(); J.ui.toast(editando ? "Contato salvo" : "Contato adicionado");
    };
    J.ui.abrirFolha(editando ? "Contato" : "Novo contato", f);
  };
})(window.J);
