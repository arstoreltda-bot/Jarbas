/* Jarbas · voz: ouvir (microfone) e falar (voz premium do Google ou voz do iPhone) */
"use strict";
(function (J) {
  const V = (J.voz = {});
  let ctx = null;

  /* O iPhone só libera o áudio depois de um toque: chamamos isto em todo toque. */
  let gravando = false;
  V.destravar = function () {
    try {
      if (!gravando) sessao("playback"); // toca mesmo com o iPhone no modo silencioso (iOS 17+)
      const A = window.AudioContext || window.webkitAudioContext;
      if (!A) return null;
      if (!ctx) ctx = new A();
      if (ctx.state === "suspended" || ctx.state === "interrupted") ctx.resume();
      if (window.speechSynthesis && !V._sintDestravado) {
        V._sintDestravado = true;
        const u = new SpeechSynthesisUtterance(" "); u.volume = 0; speechSynthesis.speak(u);
      }
    } catch (e) {}
    return ctx;
  };
  V.ctx = () => ctx || V.destravar();
  function sessao(tipo) { try { if (navigator.audioSession) navigator.audioSession.type = tipo; } catch (e) {} }

  /* ================= OUVIR ================= */
  V.microfoneDisponivel = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

  /* Grava até o senhor parar de falar (silêncio) ou tocar de novo.
     opcoes: {onNivel(0..1), onFala()} -> retorna controlador {parar(), cancelar(), pronto: Promise<{wav, duracao, falou}>} */
  V.ouvir = async function (opcoes = {}) {
    V.calar();
    V.destravar();
    gravando = true; sessao("play-and-record");
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
    } catch (e) {
      gravando = false; sessao("playback");
      const err = new Error(e && e.name === "NotAllowedError" ? "negado" : "indisponivel"); err.causa = e; throw err;
    }
    /* No iPhone, um contexto de áudio criado antes do microfone pode gravar mudo ou distorcido.
       Por isso a gravação usa um contexto próprio, criado depois que o microfone abriu. */
    const Ctx = window.AudioContext || window.webkitAudioContext;
    let ac;
    try { ac = new Ctx(); } catch (e) { ac = null; }
    if (!ac) { stream.getTracks().forEach((t) => t.stop()); gravando = false; throw new Error("indisponivel"); }
    try { await ac.resume(); } catch (e) {}
    const fonte = ac.createMediaStreamSource(stream);
    const proc = ac.createScriptProcessor(4096, 1, 1);
    const pedacos = [];
    const taxa = ac.sampleRate;
    const inicio = performance.now();
    let ruido = 1, falou = false, ultimaFala = 0, encerrado = false, amostras = 0, pico = 0;
    const SIL = opcoes.silencio || 1600, MAX = opcoes.maximo || 45000;
    let fim;
    const pronto = new Promise((res) => { fim = res; });

    proc.onaudioprocess = (ev) => {
      const dado = ev.inputBuffer.getChannelData(0);
      const saida = ev.outputBuffer.getChannelData(0); saida.fill(0);
      if (encerrado) return;
      pedacos.push(new Float32Array(dado)); amostras += dado.length;
      let s = 0; for (let i = 0; i < dado.length; i++) s += dado[i] * dado[i];
      const rms = Math.sqrt(s / dado.length);
      const t = performance.now() - inicio;
      if (rms > 0) ruido = Math.min(ruido, Math.max(0.002, rms));   // nível do silêncio (o menor ouvido)
      pico = Math.max(pico, rms);
      const limiar = Math.max(0.01, ruido * 2.5);
      if (rms > limiar) { if (!falou && opcoes.onFala) opcoes.onFala(); falou = true; ultimaFala = t; }
      if (opcoes.onNivel) opcoes.onNivel(Math.min(1, rms / 0.08));
      if ((falou && t - ultimaFala > SIL && t > 1200) || t > MAX || (!falou && t > (opcoes.esperaInicial || 9000))) encerrar(true, false);
    };
    fonte.connect(proc); proc.connect(ac.destination);

    function liberar() {
      try { proc.disconnect(); fonte.disconnect(); } catch (e) {}
      stream.getTracks().forEach((t) => t.stop());
      try { ac.close(); } catch (e) {}
      gravando = false; sessao("playback");
    }
    function encerrar(enviar, manual) {
      if (encerrado) return; encerrado = true; liberar();
      if (!enviar) { fim(null); return; }
      const duracao = amostras / taxa;
      /* se o senhor tocou em Enviar, manda mesmo que o detector não tenha percebido a fala */
      fim({ wav: paraWav(pedacos, taxa, 16000), duracao, falou: falou || (manual && duracao >= 0.6 && pico > 0.003), pico });
    }
    return { parar: () => encerrar(true, true), cancelar: () => encerrar(false), pronto };
  };

  /* junta, reduz para 16 kHz e codifica em WAV (base64) */
  function paraWav(pedacos, taxaOrig, taxa) {
    const total = pedacos.reduce((n, p) => n + p.length, 0);
    const todo = new Float32Array(total); let o = 0; pedacos.forEach((p) => { todo.set(p, o); o += p.length; });
    const fator = taxaOrig / taxa, n = Math.floor(total / fator);
    const pcm = new Int16Array(n);
    for (let i = 0; i < n; i++) {
      const a = Math.floor(i * fator), b = Math.min(total, Math.floor((i + 1) * fator));
      let s = 0; for (let k = a; k < b; k++) s += todo[k];
      const v = Math.max(-1, Math.min(1, s / Math.max(1, b - a)));
      pcm[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
    }
    const buf = new ArrayBuffer(44 + pcm.length * 2), dv = new DataView(buf);
    const str = (off, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(off + i, s.charCodeAt(i)); };
    str(0, "RIFF"); dv.setUint32(4, 36 + pcm.length * 2, true); str(8, "WAVE"); str(12, "fmt ");
    dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true); dv.setUint32(24, taxa, true);
    dv.setUint32(28, taxa * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true); str(36, "data"); dv.setUint32(40, pcm.length * 2, true);
    new Int16Array(buf, 44).set(pcm);
    return V.base64(new Uint8Array(buf));
  }
  V.base64 = function (bytes) {
    let s = ""; const passo = 0x8000;
    for (let i = 0; i < bytes.length; i += passo) s += String.fromCharCode.apply(null, bytes.subarray(i, i + passo));
    return btoa(s);
  };

  /* ================= FALAR ================= */
  V.ligada = () => J.store.get("voz.ligada", true);
  /* pedido do Alison (26/11): usar a voz de mordomo de IA (Premium, Charon) */
  if (J.store.get("voz.migr", 0) < 1) { J.store.set("voz.modo", "premium"); J.store.set("voz.premium", "Charon"); J.store.set("voz.migr", 1); }
  V.modo = () => J.store.get("voz.modo", "premium");        // "iphone" (instantânea) | "premium" (Google, mais lenta)
  V.vozPremium = () => J.store.get("voz.premium", "Charon");
  V.vozIphone = () => J.store.get("voz.iphone", "");
  V.VOZES_PREMIUM = [["Charon", "Charon · grave e informativa"], ["Orus", "Orus · firme"], ["Iapetus", "Iapetus · clara"], ["Algenib", "Algenib · rouca"], ["Rasalgethi", "Rasalgethi · informativa"], ["Schedar", "Schedar · equilibrada"], ["Enceladus", "Enceladus · suave"], ["Fenrir", "Fenrir · animada"]];

  const MASC = /Felipe|Eddy|Reed|Daniel|Henrique|Ricardo|Ant[oô]nio|Thiago|F[áa]bio|Humberto|Donato|J[úu]lio|Nicolau|Val[ée]rio|Male|Masculin/i;
  const BOBAS = /Grandpa|Grandma|Shelley|Sandy|Flo\b|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Good News|Jester|Organ|Superstar|Trinoids|Whisper|Wobble|Zarvox|Albert|Fred|Junior|Ralph|Kathy|Rocko/i;
  V.vozesIphone = () => ((window.speechSynthesis && speechSynthesis.getVoices()) || []).filter((v) => /^pt/i.test(v.lang));
  V.masculina = (v) => MASC.test(v.name);
  function nota(v) { let p = 0; if (/pt-BR/i.test(v.lang)) p += 4; if (MASC.test(v.name)) p += 6; if (/Premium|Aprimorad|Enhanced|Neural|Natural/i.test(v.name)) p += 3; if (BOBAS.test(v.name)) p -= 8; return p; }
  V.vozesOrdenadas = () => V.vozesIphone().sort((a, b) => nota(b) - nota(a));
  function escolherVozIphone() { const vs = V.vozesOrdenadas(); const n = V.vozIphone(); return (n && vs.find((v) => v.name === n)) || vs[0] || null; }

  /* Texto escrito -> texto falável (sem símbolos, horas e datas por extenso) */
  const DIA_LONGO = { dom: "domingo", seg: "segunda", ter: "terça", qua: "quarta", qui: "quinta", sex: "sexta", "sáb": "sábado" };
  V.falavel = function (t) {
    return String(t || "")
      .replace(/[✓✅•›·]/g, ",").replace(/["“”*_#]/g, "")
      .replace(/\b(dom|seg|ter|qua|qui|sex|sáb) (\d{2})\/(\d{2})\b/g, (x, d, dd, mm) => `${DIA_LONGO[d]}, dia ${Number(dd)} de ${J.MESES[Number(mm) - 1]}`)
      .replace(/\b(\d{1,2})\/(\d{1,2})\b/g, (x, dd, mm) => (Number(mm) >= 1 && Number(mm) <= 12 ? `${Number(dd)} de ${J.MESES[Number(mm) - 1]}` : x))
      .replace(/\b(\d{1,2})h(\d{2})\b/g, (x, h, m) => `${Number(h)} e ${Number(m)}`)
      .replace(/\b1h\b/g, "1 hora").replace(/\b(\d{1,2})h\b/g, "$1 horas")
      .replace(/\b(\d+) min\b/g, "$1 minutos").replace(/\b(\d+) s\b/g, "$1 segundos")
      .replace(/R\$\s?(\d+)/g, "$1 reais")
      .replace(/\s*\n+\s*/g, ", ").replace(/\s*[;:]\s+/g, ", ").replace(/\.{2,}|…/g, ",")
      .replace(/\s*\(\s*/g, ", ").replace(/\s*\)\s*/g, " ").replace(/(,\s*){2,}/g, ", ").replace(/^\s*,\s*/, "")
      .replace(/\s{2,}/g, " ").trim().slice(0, 1500);
  };

  let tocando = null, filaId = 0, premiumPausadoAte = 0;
  V.falando = () => !!tocando;
  V.calar = function () {
    filaId++;
    try { if (tocando && tocando.stop) tocando.stop(); } catch (e) {}
    tocando = null;
    try { window.speechSynthesis && speechSynthesis.cancel(); } catch (e) {}
    if (V.onEstado) V.onEstado(false);
  };

  /* fala e resolve quando terminar */
  V.falar = async function (texto, { forcar = false } = {}) {
    if (!forcar && !V.ligada()) return;
    const t = V.falavel(texto); if (!t) return;
    V.calar(); const meu = filaId;
    if (V.onEstado) V.onEstado(true);
    try {
      if (V.modo() === "premium" && J.gemini.temChave() && J.store.get("gemini.temVoz", true) !== false && Date.now() > premiumPausadoAte) {
        try {
          const audio = await Promise.race([J.gemini.falar(t, V.vozPremium()), J.sleep(6000).then(() => { throw new Error("demorou"); })]);
          if (meu !== filaId) return;
          await tocarPcm(audio, meu);
          return;
        } catch (e) {
          if (meu !== filaId) return;
          if (e && e.tipo === "limite") premiumPausadoAte = Date.now() + 10 * 60000; // cota da voz premium: usa a do iPhone por 10 min
          else if (e && (e.tipo === "modelo" || e.tipo === "api")) premiumPausadoAte = Date.now() + 30 * 60000;
        }
      }
      await falarIphone(t, meu);
    } finally {
      if (meu === filaId) { tocando = null; if (V.onEstado) V.onEstado(false); }
    }
  };

  function tocarPcm({ pcm, taxa }, meu) {
    return new Promise((res) => {
      const ac = V.ctx(); if (!ac) return res();
      const buf = ac.createBuffer(1, pcm.length, taxa); const ch = buf.getChannelData(0);
      for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 32768;
      const src = ac.createBufferSource(); src.buffer = buf;
      const ganho = ac.createGain(); ganho.gain.value = 1.15; src.connect(ganho).connect(ac.destination);
      src.onended = () => res();
      if (meu !== filaId) return res();
      tocando = src; src.start();
      setTimeout(res, buf.duration * 1000 + 1500);
    });
  }
  const ESTILOS = { ia: { rate: 1.05, pitch: 0.82 }, natural: { rate: 1.0, pitch: 0.95 }, grave: { rate: 0.98, pitch: 0.7 } };
  function falarIphone(t, meu) {
    return new Promise((res) => {
      if (!window.speechSynthesis) return res();
      try {
        const u = new SpeechSynthesisUtterance(t); u.lang = "pt-BR";
        const v = escolherVozIphone(); if (v) u.voice = v;
        const es = ESTILOS[J.store.get("voz.estilo", "ia")] || ESTILOS.ia; u.rate = es.rate; u.pitch = es.pitch;
        let feito = false; const ok = () => { if (!feito) { feito = true; res(); } };
        u.onend = ok; u.onerror = ok;
        setTimeout(ok, 2500 + t.length * 85); // o iPhone às vezes não avisa que terminou
        if (meu !== filaId) return res();
        tocando = { stop: () => speechSynthesis.cancel() };
        speechSynthesis.speak(u);
      } catch (e) { res(); }
    });
  }

  /* sons curtos (sem arquivos) */
  V.som = function (tipo) {
    const ac = V.ctx(); if (!ac) return;
    const notas = { ouvir: [[660, 0, 0.09], [880, 0.09, 0.12]], fim: [[880, 0, 0.08], [660, 0.08, 0.12]], aviso: [[880, 0, 0.18], [1175, 0.22, 0.18], [880, 0.44, 0.18], [1175, 0.66, 0.25]], erro: [[300, 0, 0.18]] }[tipo] || [];
    notas.forEach(([f, t, d]) => {
      try {
        const o = ac.createOscillator(), g = ac.createGain(); o.type = "sine"; o.frequency.value = f;
        const t0 = ac.currentTime + t;
        g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(tipo === "aviso" ? 0.35 : 0.14, t0 + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
        o.connect(g).connect(ac.destination); o.start(t0); o.stop(t0 + d + 0.02);
      } catch (e) {}
    });
  };

  try { if (window.speechSynthesis) speechSynthesis.onvoiceschanged = () => V.onVozes && V.onVozes(); } catch (e) {}
})(window.J);
