(() => {
  const $ = id => document.getElementById(id);
  const textInput = $('textInput'), voiceSelect = $('voiceSelect'), pdfInput = $('pdfInput');
  const synth = window.speechSynthesis;
  let voices = [], mode = 'quick', utterance = null, chunks = [], currentChunk = 0, speaking = false;
  const chunkSize = 220;
  const MAX_CHARS = 100000;
  if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  function setStatus(message) { $('status').textContent = message; }
  function setStage(n, message) { $('stageCount').textContent = `${n}/7`; $('progressBar').style.width = `${Math.round(n / 7 * 100)}%`; if (message) { $('playState').textContent = message; setStatus(message); } }
  function updateCount() { $('charCount').textContent = textInput.value.length.toLocaleString('ca-ES'); }
  function refreshVoices() {
    const previousHint = $('voiceHint').textContent;
    voices = synth ? synth.getVoices() : [];
    const old = voiceSelect.value;
    voiceSelect.innerHTML = '';
    const catalan = voices.filter(v => (v.lang || '').toLowerCase().replace('_','-').startsWith('ca-') || (v.lang || '').toLowerCase() === 'ca');
    const sorted = [...catalan];
    if (!sorted.length) {
      const option = document.createElement('option'); option.value = ''; option.textContent = 'Cap veu catalana detectada'; voiceSelect.append(option);
      $('voiceHint').textContent = 'No s’ha detectat cap veu catalana. Instal·la una veu catalana al dispositiu i prem «Actualitza les veus».';
      return;
    }
    sorted.forEach((v, i) => {
      const o = document.createElement('option'); o.value = String(voices.indexOf(v));
      o.textContent = `${v.name} · ${v.lang}${v.default ? ' · predeterminada' : ''}`;
      voiceSelect.append(o);
    });
    const preferred = sorted.find(v => (v.lang || '').toLowerCase().replace('_','-').startsWith('ca-')) || sorted[0];
    voiceSelect.value = [...voiceSelect.options].some(o => o.value === old) ? old : String(voices.indexOf(preferred));
    $('voiceHint').textContent = catalan.length ? `${catalan.length} veu(s) catalana(es) detectada(es). Prova-les: la qualitat depèn del motor i del dispositiu.` : 'No s’ha detectat cap veu catalana. A Android, revisa Configuració → Sortida de text a veu → motor de Google → Idiomes/dades de veu; després prem «Actualitza les veus».';
  }
  $('refreshVoicesBtn')?.addEventListener('click', () => { if (synth) { synth.cancel(); refreshVoices(); setStatus('Llista de veus actualitzada.'); } });
  function splitText(text) {
    const clean = text.replace(/\s+/g, ' ').trim();
    if (!clean) return [];
    const sentences = clean.match(/[^.!?。]+[.!?。]?/g) || [clean];
    const out = []; let part = '';
    for (const sentence of sentences) {
      if ((part + ' ' + sentence).trim().length > chunkSize && part) { out.push(part.trim()); part = ''; }
      if (sentence.length > chunkSize) {
        let rest = sentence;
        while (rest.length > chunkSize) { let cut = rest.lastIndexOf(' ', chunkSize); if (cut < 60) cut = chunkSize; out.push(rest.slice(0, cut).trim()); rest = rest.slice(cut).trim(); }
        part = rest;
      } else part += (part ? ' ' : '') + sentence;
    }
    if (part.trim()) out.push(part.trim());
    return out;
  }
  function updateProgress() { $('progressBar').style.width = chunks.length ? `${Math.min(100, currentChunk / chunks.length * 100)}%` : '0%'; }
  function setPlaying(on) { speaking = on; $('pauseBtn').disabled = !on; $('stopBtn').disabled = !on; $('playBtn').textContent = on ? '↻  REINICIA LA LECTURA' : '▶  LLEGEIX EL TEXT'; }
  function speakChunk(index) {
    if (!synth || index >= chunks.length) {
      setPlaying(false); $('playState').textContent = 'Lectura finalitzada'; $('progressBar').style.width = '100%'; setStatus('Lectura finalitzada'); return;
    }
    currentChunk = index; updateProgress(); utterance = new SpeechSynthesisUtterance(chunks[index]);
    const selected = voices.find(v => String(voices.indexOf(v)) === voiceSelect.value && ((v.lang || '').toLowerCase().replace('_','-').startsWith('ca-') || (v.lang || '').toLowerCase() === 'ca'));
    if (selected) { utterance.voice = selected; utterance.lang = selected.lang; }
    else { utterance.lang = 'ca-ES'; if (!voices.some(v => (v.lang || '').toLowerCase().replace('_','-').startsWith('ca-'))) { setStatus('No hi ha cap veu catalana instal·lada. Instal·la’n una per evitar una veu d’una altra llengua.'); return; } }
    utterance.rate = effectiveRate();
    const style = $('voiceStyle')?.value || 'neutral';
    utterance.pitch = ({deep:0.78,warm:0.94,narrative:0.98,neutral:1,calm:0.92,lively:1.08})[style] || 1; utterance.onstart = () => { setPlaying(true); $('playState').textContent = `Llegint fragment ${index + 1} de ${chunks.length}`; setStatus('Reproduint àudio…'); };
    utterance.onend = () => { if (speaking) speakChunk(index + 1); };
    utterance.onerror = e => { if (e.error !== 'canceled' && e.error !== 'interrupted') { setPlaying(false); setStatus('No s’ha pogut reproduir la veu en aquest navegador.'); } };
    synth.speak(utterance);
  }
  function effectiveRate(speed = Number($('speedRange').value)) {
    const style = $('readingStyle')?.value || (mode === 'podcast' ? 'podcast' : 'natural');
    const multiplier = style === 'podcast' ? 0.85 : style === 'study' ? 0.78 : 1;
    return Math.max(0.5, Math.min(2, speed * multiplier));
  }
  let piperModule = null, piperAudio = null, piperObjectUrl = null, piperQueue = [], piperIndex = 0, piperRunId = 0, piperPaused = false, piperActive = false;
  const piperBtn = $('piperBtn');
  function splitForPiper(text, limit = 420) {
    const clean = text.replace(/\s+/g, ' ').trim();
    if (!clean) return [];
    const sentences = clean.match(/[^.!?。]+[.!?。]?/g) || [clean];
    const out = []; let part = '';
    for (const raw of sentences) {
      const sentence = raw.trim();
      if (!sentence) continue;
      if (part && (part + ' ' + sentence).length > limit) { out.push(part.trim()); part = ''; }
      if (sentence.length > limit) {
        let rest = sentence;
        while (rest.length > limit) {
          let cut = rest.lastIndexOf(' ', limit);
          if (cut < Math.floor(limit * .55)) cut = limit;
          out.push(rest.slice(0, cut).trim()); rest = rest.slice(cut).trim();
        }
        part = rest;
      } else part += (part ? ' ' : '') + sentence;
    }
    if (part.trim()) out.push(part.trim());
    return out;
  }
  function stopPiper(clearQueue = true) {
    piperRunId++;
    piperActive = false; piperPaused = false;
    if (clearQueue) { piperQueue = []; piperIndex = 0; }
    if (piperAudio) { piperAudio.onended = null; piperAudio.onerror = null; piperAudio.pause(); piperAudio = null; }
    if (piperObjectUrl) { URL.revokeObjectURL(piperObjectUrl); piperObjectUrl = null; }
  }
  function reportPiperDownload(progress, context) {
    if (!progress || typeof progress !== 'object') return;
    const loaded = Number(progress.loaded), total = Number(progress.total);
    if (Number.isFinite(loaded) && Number.isFinite(total) && total > 0) {
      const pct = Math.max(0, Math.min(100, Math.round(loaded / total * 100)));
      const label = progress.url ? String(progress.url).split('/').pop() : 'model de veu';
      setStatus(`Descarregant ${label}: ${pct}% (${context})`);
      $('piperHint').textContent = `Primera càrrega del model neuronal: ${pct}%. Mantén la pàgina oberta i la connexió activa.`;
    } else if (progress.url) {
      setStatus(`Carregant fitxer del model neuronal (${context})…`);
    }
  }
  async function playPiperChunk(runId) {
    if (runId !== piperRunId || !piperActive || piperPaused) return;
    if (piperIndex >= piperQueue.length) {
      piperActive = false;
      $('playState').textContent = 'Lectura neuronal finalitzada';
      $('progressBar').style.width = '100%';
      setStatus('Lectura neuronal finalitzada.');
      $('pauseBtn').disabled = true; $('stopBtn').disabled = true; $('pauseBtn').textContent = 'Ⅱ';
      return;
    }
    const index = piperIndex;
    $('playState').textContent = `Generant fragment neuronal ${index + 1} de ${piperQueue.length}…`;
    $('progressBar').style.width = `${Math.round(index / piperQueue.length * 100)}%`;
    setStatus(`Generant veu neuronal: fragment ${index + 1} de ${piperQueue.length}. En textos llargs pot trigar.`);
    try {
      const voiceCandidates = [$('piperVoiceSelect')?.value || 'ca_ES-upc_ona-medium'];
      let wav = null, lastError = null;
      for (const voiceId of voiceCandidates) {
        try { wav = await piperModule.predict({ text: piperQueue[index], voiceId }, progress => reportPiperDownload(progress, `fragment ${index + 1}/${piperQueue.length}`)); if (wav) break; }
        catch (err) { lastError = err; }
      }
      if (runId !== piperRunId || !piperActive) return;
      if (!wav) throw lastError || new Error('No s’ha pogut generar aquest fragment.');
      if (piperObjectUrl) URL.revokeObjectURL(piperObjectUrl);
      piperObjectUrl = URL.createObjectURL(wav);
      piperAudio = new Audio(piperObjectUrl);
      piperAudio.playbackRate = effectiveRate();
      piperAudio.onplay = () => { $('playState').textContent = `Reproduint fragment ${index + 1} de ${piperQueue.length}`; setStatus('Veu neuronal en reproducció.'); };
      piperAudio.onended = () => {
        if (runId !== piperRunId || !piperActive) return;
        piperIndex++;
        if (piperObjectUrl) { URL.revokeObjectURL(piperObjectUrl); piperObjectUrl = null; }
        piperAudio = null;
        playPiperChunk(runId);
      };
      piperAudio.onerror = () => {
        if (runId !== piperRunId) return;
        piperActive = false; setStatus('Error reproduint l’àudio neuronal. Pots continuar amb la veu estàndard.');
        $('pauseBtn').disabled = true; $('stopBtn').disabled = true;
      };
      await piperAudio.play();
      $('pauseBtn').disabled = false; $('stopBtn').disabled = false;
    } catch (err) {
      if (runId !== piperRunId) return;
      console.error(err); piperActive = false;
      setStatus('No s’ha pogut generar veu neuronal per aquest fragment. Prova Chrome actualitzat o la veu estàndard.');
      $('piperHint').textContent = 'La integració de Piper és experimental; si falla un fragment, utilitza la lectura estàndard.';
      $('pauseBtn').disabled = true; $('stopBtn').disabled = true;
    }
  }
  piperBtn?.addEventListener('click', async () => {
    const text = textInput.value.trim();
    if (!text) { setStatus('Primer escriu text o carrega un PDF.'); textInput.focus(); return; }
    stopPiper(); if (synth) synth.cancel();
    piperBtn.disabled = true;
    try {
      setStatus('Carregant el motor neuronal… La primera vegada cal connexió a internet.');
      $('piperHint').textContent = 'Preparant el motor i dividint el text en fragments per evitar carregar-ho tot a la memòria.';
      if (!piperModule) piperModule = await import('https://esm.sh/@mintplex-labs/piper-tts-web');
      piperQueue = splitForPiper(text, 420);
      if (!piperQueue.length) throw new Error('No hi ha text per llegir.');
      piperIndex = 0; piperPaused = false; piperActive = true;
      const runId = piperRunId;
      $('progressBar').style.width = '0%'; $('pauseBtn').textContent = 'Ⅱ';
      $('pauseBtn').disabled = false; $('stopBtn').disabled = false;
      $('playState').textContent = `Preparat: ${piperQueue.length} fragments neuronals`;
      $('piperHint').textContent = `Text dividit en ${piperQueue.length} fragments. Es genera i reprodueix un fragment cada vegada per reduir l’ús de memòria; textos llargs poden trigar força.`;
      await playPiperChunk(runId);
    } catch (err) {
      console.error(err); setStatus('No s’ha pogut iniciar Piper en aquest navegador. Prova Chrome actualitzat o utilitza la veu del dispositiu.');
      $('piperHint').textContent = 'La integració web de Piper és experimental i pot fallar si el model o el navegador no són compatibles.';
      piperActive = false; $('pauseBtn').disabled = true; $('stopBtn').disabled = true;
    } finally { piperBtn.disabled = false; }
  });
  // Genera un fitxer WAV real amb la veu neuronal, dividint el text en 7 fases.
  // Requereix que la integració Piper i el model català siguin compatibles amb el navegador.
  const downloadAudioBtn = $('downloadAudioBtn');
  function wavParts(blob) {
    return blob.arrayBuffer().then(buffer => {
      const view = new DataView(buffer);
      const bytes = new Uint8Array(buffer);
      if (bytes.length < 44 || String.fromCharCode(...bytes.slice(0,4)) !== 'RIFF' || String.fromCharCode(...bytes.slice(8,12)) !== 'WAVE') {
        throw new Error('El motor no ha retornat un WAV compatible.');
      }
      let offset = 12, fmt = null, pcm = null;
      while (offset + 8 <= bytes.length) {
        const id = String.fromCharCode(...bytes.slice(offset, offset + 4));
        const size = view.getUint32(offset + 4, true);
        const start = offset + 8;
        if (id === 'fmt ') fmt = bytes.slice(start, start + size);
        if (id === 'data') { pcm = bytes.slice(start, start + size); break; }
        offset = start + size + (size % 2);
      }
      if (!fmt || !pcm) throw new Error('El WAV no conté les dades d’àudio esperades.');
      return { fmt, pcm };
    });
  }
  function joinWav(parts) {
    if (!parts.length) throw new Error('No s’ha generat cap àudio.');
    const fmt = parts[0].fmt;
    if (parts.some(p => p.fmt.length !== fmt.length || p.fmt.some((b,i) => b !== fmt[i]))) throw new Error('Els fragments d’àudio tenen formats diferents.');
    const total = parts.reduce((n,p) => n + p.pcm.length, 0);
    const out = new ArrayBuffer(12 + 8 + fmt.length + 8 + total);
    const v = new DataView(out), b = new Uint8Array(out);
    const str = (o,t) => { for (let i=0;i<t.length;i++) b[o+i]=t.charCodeAt(i); };
    str(0,'RIFF'); v.setUint32(4, out.byteLength - 8, true); str(8,'WAVE');
    str(12,'fmt '); v.setUint32(16,fmt.length,true); b.set(fmt,20);
    const dataHead = 20 + fmt.length; str(dataHead,'data'); v.setUint32(dataHead+4,total,true);
    let cursor = dataHead + 8; for (const p of parts) { b.set(p.pcm,cursor); cursor += p.pcm.length; }
    return new Blob([out], {type:'audio/wav'});
  }
  downloadAudioBtn?.addEventListener('click', async () => {
    const text = textInput.value.trim();
    if (!text) { setStatus('Primer escriu text o carrega un PDF.'); textInput.focus(); return; }
    if (text.length > MAX_CHARS) { setStatus('El text supera els 100.000 caràcters.'); return; }
    downloadAudioBtn.disabled = true; piperBtn.disabled = true; stopPiper(); if (synth) synth.cancel();
    const audioParts = [];
    try {
      setStage(0, '0/7 · Preparant el text…');
      const normalized = text.replace(/\s+/g,' ').trim();
      if (!piperModule) { setStatus('Carregant el motor neuronal…'); piperModule = await import('https://esm.sh/@mintplex-labs/piper-tts-web'); }
      const chunksForAudio = splitForPiper(normalized, 350);
      if (!chunksForAudio.length) throw new Error('No hi ha fragments per generar.');
      // Divideix per fragments ja tallats entre paraules: evita tallar una paraula a mitja síl·laba.
      const allChunks = Array.from({length:7}, (_,i) => chunksForAudio.slice(Math.floor(chunksForAudio.length*i/7), Math.floor(chunksForAudio.length*(i+1)/7))).filter(group => group.length);
      let done = 0; const totalChunks = chunksForAudio.length;
      for (let sectionIndex=0; sectionIndex<allChunks.length; sectionIndex++) {
        setStage(sectionIndex+1, `${sectionIndex+1}/7 · Generant àudio (${done}/${totalChunks} fragments)…`);
        for (const piece of allChunks[sectionIndex]) {
          setStatus(`${sectionIndex+1}/7 · Generant àudio (${done+1}/${totalChunks})…`);
          let wav = null, lastError = null;
          for (const voiceId of [$('piperVoiceSelect')?.value || 'ca_ES-upc_ona-medium']) {
            try { wav = await piperModule.predict({text:piece, voiceId}, progress => reportPiperDownload(progress, `fragment ${done+1}/${totalChunks}`)); if (wav) break; } catch (e) { lastError=e; }
          }
          if (!wav) throw lastError || new Error('No s’ha pogut generar un fragment.');
          audioParts.push(await wavParts(wav)); done++;
        }
        setStage(sectionIndex+1, `${sectionIndex+1}/7 · Àudio generat (${done}/${totalChunks})`);
      }
      setStage(6, '6/7 · Unint els fragments en un sol fitxer…');
      const finalWav = joinWav(audioParts);
      setStage(7, '7/7 · Àudio preparat per descarregar');
      const url = URL.createObjectURL(finalWav); const a = document.createElement('a');
      a.href=url; a.download=`veu-natural-${new Date().toISOString().slice(0,10)}.wav`; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(()=>URL.revokeObjectURL(url), 60000);
      setStatus('Àudio WAV descarregat. Desa’l al mòbil i podràs escoltar-lo sense internet.');
      $('piperHint').textContent = 'Fitxer WAV generat. Si la descàrrega no s’obre, comprova la carpeta Descàrregues del mòbil.';
    } catch (err) {
      console.error(err); setStatus('No s’ha pogut crear l’àudio descarregable. La integració Piper/model català pot no ser compatible amb aquest navegador.');
      $('piperHint').textContent = 'La descàrrega d’àudio encara és beta: cal validar el model i el motor real en un mòbil abans de garantir-ne el funcionament.';
    } finally { downloadAudioBtn.disabled = false; piperBtn.disabled = false; }
  });

  $('playBtn').addEventListener('click', () => {
    stopPiper();
    if (!synth) { setStatus('Aquest navegador no admet síntesi de veu. Prova Chrome o Safari actualitzat.'); return; }
    const pieces = splitText(textInput.value);
    if (!pieces.length) { setStatus('Primer escriu text o carrega un PDF.'); textInput.focus(); return; }
    synth.cancel(); chunks = pieces; currentChunk = 0; setPlaying(true); $('progressBar').style.width = '0%'; speakChunk(0);
  });
  $('pauseBtn').addEventListener('click', () => { if (piperActive) { if (piperAudio && !piperAudio.paused) { piperPaused = true; piperAudio.pause(); $('playState').textContent = 'Veu neuronal en pausa'; $('pauseBtn').textContent = '▶'; } else if (piperPaused) { piperPaused = false; $('pauseBtn').textContent = 'Ⅱ'; if (piperAudio) piperAudio.play().catch(() => {}); else playPiperChunk(piperRunId); $('playState').textContent = 'Reprenent veu neuronal…'; } return; } if (!synth) return; if (synth.paused) { synth.resume(); $('playState').textContent = 'Reproduint'; $('pauseBtn').textContent = 'Ⅱ'; } else { synth.pause(); $('playState').textContent = 'En pausa'; $('pauseBtn').textContent = '▶'; } });
  $('stopBtn').addEventListener('click', () => { stopPiper(); if (synth) synth.cancel(); setPlaying(false); $('playState').textContent = 'Lectura aturada'; setStatus('Lectura aturada'); });
  $('clearBtn').addEventListener('click', () => { stopPiper(); if (synth) synth.cancel(); textInput.value = ''; updateCount(); chunks = []; setPlaying(false); updateProgress(); setStatus('Preparat per llegir'); $('playState').textContent = 'A punt per començar'; pdfInput.value = ''; });
  textInput.addEventListener('input', () => {
    if (textInput.value.length > MAX_CHARS) {
      textInput.value = textInput.value.slice(0, MAX_CHARS);
      setStatus('Límit de 100.000 caràcters assolit. S’ha retallat el text addicional.');
    }
    updateCount();
  });
  $('speedRange').addEventListener('input', e => $('speedLabel').textContent = `${Number(e.target.value).toLocaleString('ca-ES',{minimumFractionDigits:1,maximumFractionDigits:2})}×`);
  document.querySelectorAll('.mode').forEach(btn => btn.addEventListener('click', () => { mode = btn.dataset.mode; document.querySelectorAll('.mode').forEach(b => b.classList.toggle('active', b === btn)); $('modeLabel').textContent = mode === 'podcast' ? 'MODE PODCAST' : 'VEU RÀPIDA'; if (mode === 'podcast') { $('speedRange').value = Math.min(Number($('speedRange').value),1.05); $('speedLabel').textContent = `${Number($('speedRange').value).toLocaleString('ca-ES',{minimumFractionDigits:1})}×`; setStatus('Mode podcast: ritme més pausat'); } else setStatus('Mode veu ràpida'); }));
  pdfInput.addEventListener('change', async () => {
    const file = pdfInput.files && pdfInput.files[0]; if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pdf')) { setStatus('Tria un fitxer PDF.'); return; }
    if (!window.pdfjsLib) { setStatus('No s’ha pogut carregar el lector PDF. Comprova la connexió i torna-ho a provar.'); return; }
    setStatus('Llegint el PDF…'); $('playState').textContent = 'Important text del PDF';
    try {
      const bytes = new Uint8Array(await file.arrayBuffer()); const pdf = await pdfjsLib.getDocument({data: bytes}).promise; let all = [];
      for (let n = 1; n <= pdf.numPages; n++) { const page = await pdf.getPage(n); const content = await page.getTextContent(); all.push(content.items.map(item => item.str).join(' ')); setStatus(`Llegint pàgina ${n} de ${pdf.numPages}…`); }
      let extracted = all.join('\n\n').trim();
      if (extracted.length > MAX_CHARS) {
        extracted = extracted.slice(0, MAX_CHARS);
        setStatus('El PDF supera els 100.000 caràcters; s’importaran els primers 100.000.');
      }
      if (!extracted) { setStatus('Aquest PDF no conté text seleccionable. Pot ser un document escanejat.'); return; }
      textInput.value = extracted; updateCount(); setStatus(`PDF carregat: ${pdf.numPages} pàgina(es), ${extracted.length.toLocaleString('ca-ES')} caràcters. Revisa el text abans de reproduir-lo.`); $('playState').textContent = 'PDF preparat';
    } catch (err) { console.error(err); setStatus('No s’ha pogut llegir el PDF. Pot estar protegit o malmès.'); }
  });
  $('readingStyle')?.addEventListener('change', () => { const names={natural:'Estil natural',podcast:'Mode podcast pausat',study:'Mode estudi: lent i clar'}; setStatus(names[$('readingStyle').value]+' seleccionat.'); if (piperAudio) piperAudio.playbackRate=effectiveRate(); });
  document.querySelectorAll('.mode').forEach(btn => btn.addEventListener('click', () => { mode = btn.dataset.mode; document.querySelectorAll('.mode').forEach(b => b.classList.toggle('active', b === btn)); if (mode === 'podcast') { $('readingStyle').value = 'podcast'; setStatus('Mode podcast: ritme més pausat'); } else { $('readingStyle').value = 'natural'; setStatus('Mode veu ràpida'); } if (piperAudio) piperAudio.playbackRate=effectiveRate(); }));
  if (synth) { refreshVoices(); if (synth.onvoiceschanged !== undefined) synth.onvoiceschanged = refreshVoices; }
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
  let deferredPrompt; const installBtn = $('installBtn');
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt = e; installBtn.classList.remove('hidden'); });
  installBtn.addEventListener('click', async () => { if (!deferredPrompt) return; deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; installBtn.classList.add('hidden'); });
})();
