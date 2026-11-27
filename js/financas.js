/* Jarbas · módulo Finanças (base pronta para a próxima etapa)
   Estrutura de dados e registro do módulo já existem; a tela e as ações
   serão ligadas quando o controle financeiro for construído. */
"use strict";
(function (J) {
  const F = (J.financas = {});
  const COL = "lancamentos";
  F.ativo = false; // quando ligar: aparece a aba "Finanças" e o Jarbas passa a entender gastos e receitas

  /* lançamento: { id, tipo: "despesa"|"receita", valor (número, em reais), descricao, categoria,
                  data "AAAA-MM-DD", forma: "pix"|"cartão"|"dinheiro"|"boleto"|"", conta: "Pessoal"|"Loja", criadoEm } */
  F.CATEGORIAS = ["Alimentação", "Transporte", "Moradia", "Saúde", "Lazer", "Compras", "Contas", "Loja", "Salário", "Vendas", "Outros"];
  F.lista = () => J.store.lista(COL).sort((a, b) => (b.data || "").localeCompare(a.data || ""));
  F.salvar = (l) => J.store.inserir(COL, l);
  F.remover = (id) => J.store.remover(COL, id);
  F.saldoDoMes = function (mes) {
    mes = mes || J.agora().data.slice(0, 7);
    return F.lista().filter((l) => (l.data || "").startsWith(mes)).reduce((s, l) => s + (l.tipo === "receita" ? 1 : -1) * Number(l.valor || 0), 0);
  };
  /* trecho de instruções que o cérebro do Jarbas receberá quando o módulo estiver ativo */
  F.instrucoes = () => "";
})(window.J);
