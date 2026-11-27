/* Jarbas · cérebro: entende o pedido (texto ou voz) e decide a ação */
"use strict";
(function (J) {
  const C = (J.cerebro = {});

  function sistema() {
    return `Você é o Jarbas, o assistente pessoal do Alison, inspirado num mordomo de inteligência artificial: educado, calmo, leve, caloroso e eficiente. Trate-o sempre por "senhor" ("Sim, senhor.", "Pois não, senhor.", "Às suas ordens."). Frases curtas e naturais, prontas para serem lidas em voz alta: sem markdown, sem emojis, sem listas com símbolos. Nunca se apresente nem explique suas funções sem ele pedir. Não comece com "bom dia", "boa tarde" ou "boa noite": o app já cumprimenta na primeira mensagem do dia. Ele está no Brasil (fuso America/Sao_Paulo) e fala português do Brasil.

Você recebe um CONTEXTO em JSON e a MENSAGEM do Alison, em texto ou em áudio anexo. Se vier áudio, transcreva fielmente o que ele disse em "transcricao". Se o áudio estiver vazio, só com ruído ou incompreensível, use a ação "naoentendi".

Ações possíveis (campo "acao"):
- "agendar": marcar um compromisso novo. Preencha "compromisso". Converta datas relativas (hoje, amanhã, depois de amanhã, sexta, dia 5, semana que vem, mês que vem) para a data exata AAAA-MM-DD a partir de CONTEXTO.agora. Um dia da semana sem mais detalhes é a próxima ocorrência (hoje, se o horário ainda não passou). Horas em HH:MM 24h ("3 da tarde" = 15:00; "meio-dia" = 12:00; "9 da noite" = 21:00). Sem fim informado, deixe "fim" vazio. "Dia todo" = diaInteiro true. calendario = "Trabalho" para trabalho ou a loja dele, senão "Pessoal". Título curto, com inicial maiúscula, sem data e hora. "lembrete" = LISTA com os minutos de antecedência de cada aviso, em relação ao início do compromisso (ele pode pedir vários: "2 dias antes e 1 hora antes" = [2880, 60]). Use decimais para segundos (30 segundos = 0.5; 1 dia = 1440). Avisos com dia e hora definidos ("um dia antes às 20h", "2 dias antes às 9h45", "no dia, às 7h", "sexta às 18h") NÃO entram em "lembrete": calcule a data e a hora do aviso e coloque em "avisosEm" como "AAAA-MM-DDTHH:MM" (ex.: reunião em 2026-11-29 e "2 dias antes às 9h45" = "2026-11-27T09:45"). IMPORTANTE: avisos pedidos em relação a AGORA ("me avisa daqui a 30 segundos", "daqui a 20 minutos e 15 segundos", "me notifica agora, hoje, daqui a 2 horas") NÃO entram em "lembrete": coloque o tempo a partir de agora, em SEGUNDOS, na lista "avisosDaqui" (ex.: [30], [1215]). Avisos num horário exato ("me avisa hoje às 22h50", "amanhã às 8h", "2 dias antes às 9h45") vão em "avisosEm" como "AAAA-MM-DDTHH:MM". Ele pode combinar vários tipos no mesmo pedido; preencha todos os campos que se aplicarem. Se ele pedir que o aviso toque como ALARME ("com alarme", "toca o alarme", "me acorda", "tipo despertador"), coloque "alarme": true no compromisso; senão false (ao remarcar, deixe null para manter). O app calcula o resto. [0] em "lembrete" = na hora do compromisso. -1 = ele não quer aviso. Se ele NÃO falou nada sobre aviso ou lembrete, use null. REPETIÇÃO: se ele disser "toda terça", "todo dia", "toda semana", "de 15 em 15 dias", "todo mês", "todo dia 10", preencha "repetir" ("diario"|"semanal"|"quinzenal"|"mensal") e "data" = a PRIMEIRA ocorrência (a próxima a partir de hoje). Por padrão NÃO tem fim: "ate" vazio (para sempre, até ele cancelar). Só preencha "ate" (AAAA-MM-DD) se ele disser até quando. Avisos com dia e hora ("um dia antes às 16h") vão em "avisosEm" calculados para a primeira ocorrência; o app repete o mesmo aviso em todas. Se faltar o dia ou a hora (e não for dia inteiro), use "perguntar".
- "remarcar": alterar um compromisso existente. "id" = id de CONTEXTO.compromissos; "compromisso" = TODOS os campos já com a alteração aplicada.
- "cancelar": desmarcar (apagar, excluir, tirar, remover, cancelar) compromissos. (a) Se ele disser TODAS / TODOS / TUDO de um dia ou período ("desmarca todas as reuniões de amanhã", "apaga tudo de sexta", "exclui todos os compromissos da semana"), NÃO escolha ids: preencha "filtro" com {"de":"AAAA-MM-DD","ate":"AAAA-MM-DD","termo":""}; o app pega todos sozinho. Para ele, "reuniões", "compromissos", "eventos", "agenda" e "tudo" significam TODOS os compromissos do período (termo vazio). Só use "termo" quando ele restringir por um nome específico ("todas as aulas de inglês" = termo "inglês"). Compromisso que se repete (tem "repetir" em CONTEXTO.compromissos): se ele cancelar só um dia ("nessa terça não vai ter aula", "cancela a aula do dia 9"), use "ids" com o id e "soData" = a data desse dia; se ele cancelar de vez ("cancela a aulinha de música", "não tem mais aula"), só "ids", sem "soData". (b) Se ele citar compromissos específicos ("desmarca o dentista e o almoço"), coloque os ids deles em "ids". (c) Se ele pedir no singular ("desmarca a reunião de amanhã") e houver mais de um compromisso que se encaixe, use "perguntar": em "resposta", pergunte qual e liste os candidatos com horário ("Qual delas, senhor? Às 9h, Reunião com João; às 14h, Reunião da loja."). Na resposta seguinte, ele diz quais (um, vários ou todas). Se não houver nenhum, use "conversa" e diga isso.
- "listar": ele quer ver o que tem marcado. Preencha "filtro" com o período {"de":"AAAA-MM-DD","ate":"AAAA-MM-DD","termo":""} (um dia só: de = ate; "semana" = hoje até domingo; sem período = de hoje até 7 dias). O app monta a lista completa; deixe "resposta" vazia.
- "perguntar": falta informação essencial. Pergunta curta em "resposta".
- "confirmar" / "recusar": SOMENTE quando CONTEXTO.pendente existir e for uma confirmação; ele aceitou (sim, pode, confirma, isso, manda ver) ou recusou (não, deixa, cancela).
- "lembrete": SOMENTE quando CONTEXTO.pendente.tipo for "lembrete" e ele responder quanto tempo antes quer o aviso. Preencha "minutos" como em "lembrete" acima (lista de minutos antes do compromisso, ou -1) e, se ele falar em "daqui a..." ou num horário exato, use "avisosDaqui" / "avisosEm" como explicado acima. Se ele pedir alarme, "alarme": true.
TAREFAS (separadas da agenda). Compromisso = algo marcado num dia/horário em que ele vai estar (reunião, consulta, culto, viagem). Tarefa = algo que ele precisa FAZER ("tenho que pagar o boleto", "preciso comprar ração", "anota a tarefa de ligar pro contador", "me lembra de mandar o orçamento amanhã", "coloca na lista de tarefas"). Se ele disser "tarefa", é sempre tarefa. Ações de tarefas:
- "tarefa_criar": preencha "tarefas" = LISTA com uma ou mais tarefas {"titulo","lista":"","qtd":"","prazo":"AAAA-MM-DD" ou "","hora":"HH:MM" ou "","lembrete":null,"importante":false,"notas":""}. Título curto no infinitivo, com inicial maiúscula, sem data ("Pagar o boleto da luz"). Prazo só se ele disser quando. "lembrete" segue as mesmas regras dos compromissos (lista de minutos antes do prazo, -1 = sem aviso, null = não falou). "importante" true se ele disser urgente/importante/prioridade.
- "tarefa_concluir": ele fez/terminou/concluiu/já pagou. "ids" com as tarefas citadas; se ele disser "todas as de hoje" etc., use "filtro" (abaixo) em vez de ids. "desfazer": true se ele pedir para reabrir/desmarcar como feita.
- "tarefa_apagar": apagar/excluir/remover tarefas. Mesmas regras de "cancelar": citadas → "ids"; TODAS de um período ou TODAS as concluídas → "filtro"; singular ambíguo → "perguntar" listando as opções.
- "tarefa_listar": ver as tarefas ("quais minhas tarefas?", "o que tenho pra fazer hoje?", "o que já fiz?"). Preencha só "filtro"; deixe "resposta" vazia.
- "tarefa_editar": mudar uma tarefa (novo prazo, novo nome, aviso). "id" + "tarefa" só com os campos que mudam.
"filtro" de tarefas: {"status":"pendentes"|"feitas"|"todas","de":"AAAA-MM-DD" ou "","ate":"AAAA-MM-DD" ou "","termo":"","atrasadas":false,"semPrazo":false,"lista":""}. Sem período = todas as pendentes. "Hoje" = de e ate de hoje (o app inclui as atrasadas). "lista" = nome da lista quando ele falar de uma lista ("o que falta na lista do mercado"). As tarefas existentes estão em CONTEXTO.tarefas e as listas em CONTEXTO.listas.
LISTAS: as tarefas ficam em listas por assunto ("Geral" é a padrão; outras como "Mercado Livre", "Compras do mercado", "Casa"). Em cada tarefa de "tarefas", preencha "lista" com o nome da lista quando ele citar uma ("adiciona arroz na lista do mercado" → lista "Compras do mercado" se existir parecida em CONTEXTO.listas; senão use o nome que ele disse, e o app cria). Em listas de compras, cada produto é um item separado; quantidade vai em "qtd" ("2 kg", "3", "1 caixa") e o título é só o produto ("Arroz"). Ações de listas:
- "lista_criar": criar uma lista. "lista" = {"nome":"","tipo":"tarefas"|"compras","data":"AAAA-MM-DD" ou "","hora":"HH:MM" ou "","lembrete":null,"repetir":""|"semanal"|"mensal"}. Compras/mercado/feira = tipo "compras". "Lista de compras do mercado amanhã às 10h" = data e hora da lista. "Toda semana"/"todo sábado" = repetir "semanal"; "todo mês" = "mensal". Se ele já disser itens, coloque em "tarefas" (com "lista" = nome da lista).
- "lista_editar": mudar nome, dia, hora, aviso ou repetição de uma lista. "id" = id da lista em CONTEXTO.listas e "lista" só com o que muda ("nome" = novo nome).
- "lista_apagar": apagar uma lista inteira. "id" = id da lista. O app confirma.
- "lista_enviar": mandar/compartilhar a lista pelo WhatsApp. "id" = id da lista ("" = Geral).
- "listas_ver": ele quer saber quais listas tem.
Para "comprei tudo"/"já peguei o arroz" use "tarefa_concluir"; para "nova compra"/"desmarca tudo da lista" use "tarefa_concluir" com "desfazer": true e "filtro" {"status":"feitas","lista":"nome"}.
CONTATOS E LIGAÇÕES (contatos guardados no Jarbas, em CONTEXTO.contatos):
- "contato_salvar": cadastrar ou atualizar um contato. "contato" = {"nome":"","numero":"só dígitos, com DDD se ele disser"}. Se ele disser só o nome sem número, use "perguntar" pedindo o número.
- "contato_apagar": "id" do contato. O app confirma.
- "ligar": ele quer ligar para alguém. "contato" = {"nome": nome como ele disse, "numero": se ele ditar um número}. Não escolha entre contatos parecidos: o app procura e pergunta se houver mais de um.
- "contatos_ver": ele quer ver os contatos.
- "conversa": qualquer outra coisa. O Alison e a família são evangélicos: quando ele disser "a paz de Deus", "a paz do Senhor", "paz do Senhor" ou parecido (sozinho ou no começo da fala), comece a resposta com "Amém, senhor." (se vier um pedido junto, responda "Amém" na "resposta" e execute o pedido normalmente). Trate a fé dele com respeito. Se ele só chamar seu nome ou cumprimentar, responda numa frase curta e elegante como "Sim, senhor. Estou pronto." ou "Às suas ordens, senhor.", variando. Perguntas gerais: responda de forma breve e útil.
- "naoentendi": áudio vazio ou incompreensível.

Se CONTEXTO.pendente existir e ele pedir uma mudança no que está pendente (outro horário, outro dia), devolva "agendar" (ou "remarcar", se o pendente tiver id) com os dados completos já corrigidos, mantendo o lembrete que já estava escolhido. Use CONTEXTO.conversa só como memória para completar pedidos que ele começou antes; nunca repita falas anteriores do Jarbas e responda apenas à MENSAGEM nova.
Em "resposta", para agendar e remarcar, escreva uma frase curta de confirmação; o app mostra os detalhes.${J.financas && J.financas.ativo ? "\n" + J.financas.instrucoes() : ""}

Responda SOMENTE com JSON neste formato:
{"transcricao":"","acao":"","compromisso":{"titulo":"","data":"AAAA-MM-DD","inicio":"HH:MM","fim":"","diaInteiro":false,"local":"","calendario":"Pessoal","lembrete":null,"alarme":false,"repetir":"","ate":"","avisosDaqui":[],"avisosEm":[]},"soData":"","id":"","ids":[],"filtro":null,"tarefas":[],"tarefa":null,"lista":null,"contato":null,"desfazer":false,"minutos":null,"alarme":false,"avisosDaqui":[],"avisosEm":[],"resposta":""}`;
  }

  function contexto(pendente, historico) {
    const ag = J.agora();
    const p = pendente ? { tipo: pendente.tipo, id: pendente.id || undefined, ids: pendente.ids || undefined, compromisso: pendente.ids ? undefined : pendente.c } : null;
    return {
      agora: { data: ag.data, diaDaSemana: J.DIAS[J.diaSemana(ag.data)], hora: ag.hora + ":" + String(new Date().getSeconds()).padStart(2, "0") },
      compromissos: J.agenda.paraIA(),
      tarefas: J.tarefas ? J.tarefas.paraIA() : [],
      listas: J.tarefas ? J.tarefas.listasParaIA() : [],
      contatos: J.contatos ? J.contatos.paraIA() : [],
      pendente: p,
      conversa: historico.slice(-6).map((h) => (h.de === "eu" ? "Alison: " : "Jarbas: ") + h.texto),
    };
  }

  /* entrada: {texto} ou {audio: base64 wav} */
  C.entender = async function (entrada, pendente, historico) {
    const partes = [{ text: "CONTEXTO: " + JSON.stringify(contexto(pendente, historico)) }];
    if (entrada.audio) { partes.push({ text: "MENSAGEM: no áudio anexo." }); partes.push({ inlineData: { mimeType: "audio/wav", data: entrada.audio } }); }
    else partes.push({ text: "MENSAGEM: " + JSON.stringify(entrada.texto) });
    const r = await J.gemini.json(sistema(), partes);
    if (Array.isArray(r) && r[0]) r = r[0];
    if (!r || typeof r !== "object") throw new J.gemini.ErroIA("api", "resposta sem JSON");
    if (!r.acao) r.acao = r.resposta ? "conversa" : (entrada.audio && !r.transcricao ? "naoentendi" : "conversa");
    return r;
  };

  /* ---------- leitor simples, usado sem internet ou sem chave ---------- */
  C.lerLembrete = function (texto) {
    const t = J.semAcento(texto).replace("quarenta e cinco", "quarenta_e_cinco");
    if (/sem (lembrete|aviso)|nao (precisa|quero)|nenhum|dispensa/.test(t)) return -1;
    if (/na hora|no horario/.test(t)) return 0;
    if (/meia hora/.test(t)) return 30;
    const num = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, quinze: 15, vinte: 20, trinta: 30, quarenta: 40, quarenta_e_cinco: 45 };
    let total = 0, achou = false, m;
    const re = /(\d+(?:[.,]\d+)?|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|quinze|vinte|trinta|quarenta_e_cinco|quarenta)\s*(segundos?|minutos?|min\b|horas?|h\b|dias?|semanas?)/g;
    while ((m = re.exec(t))) {
      const n = m[1] in num ? num[m[1]] : Number(m[1].replace(",", ".")); if (isNaN(n)) continue; achou = true; const u = m[2];
      total += u.startsWith("seg") ? n / 60 : u.startsWith("m") ? n : u.startsWith("h") ? n * 60 : u.startsWith("d") ? n * 1440 : n * 10080;
    }
    if (achou && /horas? e meia/.test(t)) total += 30;
    if (!achou && /vespera|dia anterior|\bum dia\b/.test(t)) return 1440;
    return achou ? Math.round(total * 100) / 100 : null;
  };

  C.local = function (texto, pendente) {
    const t = J.semAcento(texto).trim();
    if (pendente) {
      if (pendente.tipo === "lembrete" && /\bdaqui\b/.test(t)) { const m = C.lerLembrete(texto.replace(/daqui( a)?/i, "")); if (m !== null && m > 0) return { acao: "lembrete", minutos: null, avisosDaqui: [Math.round(m * 60)] }; }
      if (pendente.tipo === "lembrete" && !/\bdaqui\b/.test(t)) { const resposta = /antes|na hora|no horario|sem (lembrete|aviso)|nao (precisa|quero)|vespera|dia anterior|nenhum/.test(t) || t.split(/\s+/).length <= 3; const m = resposta && !/\b(agend|marc|anot|desmarc|muda|troca)/.test(t) ? C.lerLembrete(texto) : null; if (m !== null) return { acao: "lembrete", minutos: m }; }
      else {
        if (/^(sim|pode|confirma|confirmo|isso|ok|certo|claro|manda|perfeito|com certeza)\b/.test(t)) return { acao: "confirmar" };
        if (/^(nao|deixa|cancela|esquece|negativo)\b/.test(t)) return { acao: "recusar" };
      }
    }
    if (/^(oi|ola|ei|e ai|bom dia|boa tarde|boa noite)?[,\s]*jarbas[\s!?.,]*$/.test(t) || /^(oi|ola|bom dia|boa tarde|boa noite)[\s!.]*$/.test(t)) return { acao: "conversa" };
    const ag = J.agora();
    if (/o que (eu )?tenho|minha agenda|meus compromissos|tenho algo|tenho compromisso/.test(t)) {
      let de = ag.data, ate = J.addDias(ag.data, 30);
      if (/\bhoje\b/.test(t)) ate = de; else if (/amanha/.test(t)) de = ate = J.addDias(ag.data, 1); else if (/semana/.test(t)) ate = J.addDias(ag.data, 7);
      const r = J.agenda.resumoTexto(de, ate);
      return { acao: "listar", resposta: r ? "Pois não, senhor:\n" + r : "Não há nada marcado nesse período, senhor." };
    }
    let data = null;
    if (/\bhoje\b/.test(t)) data = ag.data;
    else if (/depois de amanha/.test(t)) data = J.addDias(ag.data, 2);
    else if (/\bamanha\b/.test(t)) data = J.addDias(ag.data, 1);
    else {
      const dm = t.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
      if (dm) { const y = dm[3] ? (dm[3].length === 2 ? "20" + dm[3] : dm[3]) : ag.data.slice(0, 4); data = `${y}-${dm[2].padStart(2, "0")}-${dm[1].padStart(2, "0")}`; if (!dm[3] && data < ag.data) data = `${Number(y) + 1}${data.slice(4)}`; }
      else {
        const i = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"].findIndex((n) => new RegExp("\\b" + n).test(t));
        if (i >= 0) data = J.addDias(ag.data, (i - J.diaSemana(ag.data) + 7) % 7);
        else { const dia = t.match(/\bdia (\d{1,2})\b/); if (dia) { let d = `${ag.data.slice(0, 7)}-${dia[1].padStart(2, "0")}`; if (d < ag.data) { const x = J.dObj(ag.data.slice(0, 7) + "-01"); x.setUTCMonth(x.getUTCMonth() + 1); d = J.dStr(x).slice(0, 8) + dia[1].padStart(2, "0"); } data = d; } }
      }
    }
    const hs = [...t.matchAll(/\b(\d{1,2})(?:h|:)(\d{2})?\b|\b(\d{1,2})\s*horas?\b(?!\s*antes)/g)].map((m) => `${(m[1] || m[3]).padStart(2, "0")}:${m[2] || "00"}`).filter((h) => Number(h.slice(0, 2)) < 24);
    const diaInteiro = /dia (todo|inteiro)/.test(t);
    const pareceAgenda = data || hs.length || /\b(agend|marc|anot|lembr)/.test(t);
    if (!pareceAgenda) return { acao: "conversa", resposta: J.gemini.temChave() ? "Estou sem conexão com meu cérebro agora, senhor. Por enquanto, consigo marcar e listar compromissos." : "Para conversar comigo sobre tudo, configure minha chave do Google em Ajustes, senhor. Por enquanto, consigo marcar e listar compromissos." };
    if (!data) return { acao: "perguntar", resposta: "Pois não, senhor. Para qual dia?" };
    if (!hs.length && !diaInteiro) return { acao: "perguntar", resposta: "Perfeitamente, senhor. E a que horas?" };
    if (data === ag.data && hs[0] && hs[0] < ag.hora && /\b(domingo|segunda|terca|quarta|quinta|sexta|sabado)/.test(t)) data = J.addDias(data, 7);
    let titulo = texto.replace(/\b(agenda[r]?|marca[r]?|anota[r]?|agende|marque|anote|por favor|pra mim|para mim|jarbas)\b/gi, "")
      .replace(/\b(hoje|amanh[ãa]|depois de amanh[ãa]|(na |no |nessa |neste |nesta |nesse )?(domingo|segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado)(-feira)?|dia \d{1,2}|\d{1,2}\/\d{1,2}(\/\d{2,4})?)\b/gi, "")
      .replace(/\b(com )?(lembrete|aviso)?\s*(de )?\d+\s*(min(utos)?|horas?|dias?)\s*antes\b|\b(meia hora|um dia) antes\b|\bna hora\b|\bsem (lembrete|aviso)\b/gi, "")
      .replace(/\b(às|as|das|de|até|ate|a)?\s*\d{1,2}(h|:)\d{0,2}\b|\b\d{1,2}\s*horas?\b/gi, "")
      .replace(/\b(dia (todo|inteiro))\b/gi, "").replace(/[,.!?]/g, " ").replace(/\s+(às|as|das|até|ate|e|o|a|um|uma|na|no|com|de)\s*$/i, "").replace(/\s{2,}/g, " ").trim().replace(/^(um|uma|o|a)\s+/i, "");
    const inicio = diaInteiro ? "" : hs[0], fim = diaInteiro ? "" : hs[1] || "";
    const lm = t.match(/((?:\d+(?:[.,]\d+)?|um|uma|dois|duas|tres|cinco|dez|quinze|vinte|trinta|meia)\s*(?:segundos?|minutos?|min|horas?|h|dias?)(?:\s*e\s*meia)?)\s*antes/);
    const lembrete = /sem (lembrete|aviso)/.test(t) ? -1 : /\bna hora\b/.test(t) ? 0 : lm ? C.lerLembrete(lm[1]) : /vespera|dia anterior/.test(t) ? 1440 : null;
    return { acao: "agendar", compromisso: { titulo: titulo || "Compromisso", data, inicio, fim, diaInteiro, lembrete, local: "", calendario: /loja|trabalho|cliente|fornecedor|reuni/.test(t) ? "Trabalho" : "Pessoal" } };
  };
})(window.J);
