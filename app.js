(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const els = {
    setup: $('setup'), recorder: $('recorder'), script: $('script'), openCamera: $('openCamera'),
    camera: $('camera'), promptWindow: $('promptWindow'), promptText: $('promptText'), controls: $('controls'),
    speed: $('speed'), setupSpeed: $('setupSpeed'), fontSize: $('fontSize'), setupFont: $('setupFont'),
    promptY: $('promptY'), backdrop: $('backdrop'), mirror: $('mirror'), togglePrompt: $('togglePrompt'),
    restartPrompt: $('restartPrompt'), record: $('record'), flipCamera: $('flipCamera'), back: $('back'),
    showSettings: $('showSettings'), settings: $('settings'), countdown: $('countdown'),
    recordingBadge: $('recordingBadge'), timer: $('timer'), resultDialog: $('resultDialog'),
    resultVideo: $('resultVideo'), discard: $('discard'), save: $('save'), toast: $('toast')
  };

  const state = {
    stream: null, recorder: null, chunks: [], blob: null, blobURL: null,
    facingMode: 'user', prompting: false, recording: false, promptOffset: 0,
    lastFrame: 0, raf: 0, timerId: 0, startedAt: 0, wakeLock: null
  };

  const saved = JSON.parse(localStorage.getItem('prompt-lia-settings') || '{}');
  els.script.value = localStorage.getItem('prompt-lia-script') || '';
  els.speed.value = els.setupSpeed.value = saved.speed || 34;
  els.fontSize.value = els.setupFont.value = saved.font || 38;
  els.promptY.value = saved.y || 16;
  els.backdrop.value = saved.backdrop ?? 45;
  els.mirror.checked = saved.mirror ?? true;

  function toast(message, ms = 3200) {
    els.toast.textContent = message;
    els.toast.classList.remove('hidden');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => els.toast.classList.add('hidden'), ms);
  }

  function saveSettings() {
    localStorage.setItem('prompt-lia-script', els.script.value);
    localStorage.setItem('prompt-lia-settings', JSON.stringify({
      speed: els.speed.value, font: els.fontSize.value, y: els.promptY.value,
      backdrop: els.backdrop.value, mirror: els.mirror.checked
    }));
  }

  function syncSettings() {
    els.promptText.style.fontSize = `${els.fontSize.value}px`;
    els.promptWindow.style.top = `${els.promptY.value}%`;
    els.promptWindow.style.setProperty('--prompt-bg', Number(els.backdrop.value) / 100);
    els.camera.classList.toggle('not-mirrored', !els.mirror.checked || state.facingMode === 'environment');
    saveSettings();
  }

  async function getCamera() {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Este navegador não oferece acesso à câmera. Abra no Safari.');
    state.stream?.getTracks().forEach(track => track.stop());
    const constraints = {
      audio: { echoCancellation: true, noiseSuppression: true },
      video: {
        facingMode: { ideal: state.facingMode },
        width: { ideal: 1080 }, height: { ideal: 1920 },
        aspectRatio: { ideal: 9 / 16 }
      }
    };
    state.stream = await navigator.mediaDevices.getUserMedia(constraints);
    els.camera.srcObject = state.stream;
    await els.camera.play();
    syncSettings();
  }

  async function openCamera() {
    if (!els.script.value.trim()) return toast('Cole ou escreva um roteiro primeiro.');
    els.openCamera.disabled = true;
    els.openCamera.textContent = 'Abrindo…';
    try {
      await getCamera();
      els.promptText.textContent = els.script.value.trim();
      state.promptOffset = 0;
      renderPrompt();
      els.setup.classList.add('hidden');
      els.recorder.classList.remove('hidden');
      els.recorder.setAttribute('aria-hidden', 'false');
      await requestWakeLock();
    } catch (error) {
      toast(error.name === 'NotAllowedError' ? 'Permita o uso da câmera e do microfone nos ajustes do Safari.' : error.message, 5000);
    } finally {
      els.openCamera.disabled = false;
      els.openCamera.textContent = 'Abrir câmera';
    }
  }

  function renderPrompt() {
    els.promptText.style.transform = `translateY(${-state.promptOffset}px)`;
  }

  function promptFrame(now) {
    if (!state.prompting) return;
    const dt = state.lastFrame ? Math.min((now - state.lastFrame) / 1000, .1) : 0;
    state.lastFrame = now;
    state.promptOffset += Number(els.speed.value) * dt;
    const max = Math.max(0, els.promptText.scrollHeight - els.promptWindow.clientHeight * .54);
    if (state.promptOffset >= max) {
      state.promptOffset = max;
      pausePrompt();
    }
    renderPrompt();
    state.raf = requestAnimationFrame(promptFrame);
  }

  function playPrompt() {
    state.prompting = true;
    state.lastFrame = 0;
    els.togglePrompt.textContent = 'Ⅱ';
    cancelAnimationFrame(state.raf);
    state.raf = requestAnimationFrame(promptFrame);
  }

  function pausePrompt() {
    state.prompting = false;
    els.togglePrompt.textContent = '▶';
    cancelAnimationFrame(state.raf);
  }

  function restartPrompt() {
    pausePrompt();
    state.promptOffset = 0;
    renderPrompt();
  }

  async function countdown() {
    els.countdown.classList.remove('hidden');
    for (const value of ['3', '2', '1']) {
      els.countdown.textContent = value;
      await new Promise(resolve => setTimeout(resolve, 700));
    }
    els.countdown.classList.add('hidden');
  }

  function preferredMimeType() {
    const types = [
      'video/mp4;codecs=h264,aac', 'video/mp4',
      'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'
    ];
    return types.find(type => window.MediaRecorder?.isTypeSupported(type)) || '';
  }

  async function startRecording() {
    if (!window.MediaRecorder) return toast('A gravação não é compatível com este navegador. Use o Safari atualizado.');
    await countdown();
    state.chunks = [];
    const mimeType = preferredMimeType();
    try {
      state.recorder = new MediaRecorder(state.stream, mimeType ? { mimeType, videoBitsPerSecond: 8_000_000 } : undefined);
    } catch (_) {
      state.recorder = new MediaRecorder(state.stream);
    }
    state.recorder.ondataavailable = event => { if (event.data?.size) state.chunks.push(event.data); };
    state.recorder.onstop = finishRecording;
    state.recorder.start(1000);
    state.recording = true;
    state.startedAt = Date.now();
    els.record.classList.add('recording');
    els.recordingBadge.classList.remove('hidden');
    els.flipCamera.disabled = true;
    updateTimer();
    state.timerId = setInterval(updateTimer, 250);
    playPrompt();
  }

  function stopRecording() {
    if (state.recorder?.state !== 'inactive') state.recorder.stop();
    state.recording = false;
    pausePrompt();
    clearInterval(state.timerId);
    els.record.classList.remove('recording');
    els.recordingBadge.classList.add('hidden');
    els.flipCamera.disabled = false;
  }

  function updateTimer() {
    const seconds = Math.floor((Date.now() - state.startedAt) / 1000);
    els.timer.textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  }

  function finishRecording() {
    const type = state.recorder?.mimeType || state.chunks[0]?.type || 'video/mp4';
    state.blob = new Blob(state.chunks, { type });
    if (state.blobURL) URL.revokeObjectURL(state.blobURL);
    state.blobURL = URL.createObjectURL(state.blob);
    els.resultVideo.src = state.blobURL;
    els.resultDialog.showModal();
  }

  function fileForRecording() {
    const isMP4 = state.blob.type.includes('mp4');
    const ext = isMP4 ? 'mp4' : 'webm';
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    return new File([state.blob], `Prompt-LIA-${stamp}.${ext}`, { type: state.blob.type });
  }

  async function saveRecording() {
    if (!state.blob) return;
    const file = fileForRecording();
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Vídeo Prompt LIA' });
        return;
      } catch (error) {
        if (error.name === 'AbortError') return;
      }
    }
    const link = document.createElement('a');
    link.href = state.blobURL;
    link.download = file.name;
    link.click();
    toast('Vídeo baixado. Verifique Arquivos/Downloads.');
  }

  async function discardRecording() {
    els.resultVideo.pause();
    els.resultDialog.close();
    els.resultVideo.removeAttribute('src');
    if (state.blobURL) URL.revokeObjectURL(state.blobURL);
    state.blob = null;
    state.blobURL = null;
    state.chunks = [];
    restartPrompt();
  }

  async function flipCamera() {
    state.facingMode = state.facingMode === 'user' ? 'environment' : 'user';
    try { await getCamera(); } catch (error) { toast(`Não foi possível trocar a câmera: ${error.message}`); }
  }

  async function closeCamera() {
    if (state.recording) stopRecording();
    pausePrompt();
    state.stream?.getTracks().forEach(track => track.stop());
    state.stream = null;
    els.camera.srcObject = null;
    els.recorder.classList.add('hidden');
    els.recorder.setAttribute('aria-hidden', 'true');
    els.setup.classList.remove('hidden');
    if (state.wakeLock) await state.wakeLock.release().catch(() => {});
  }

  async function requestWakeLock() {
    try { state.wakeLock = await navigator.wakeLock?.request('screen'); } catch (_) {}
  }

  els.openCamera.addEventListener('click', openCamera);
  els.togglePrompt.addEventListener('click', () => state.prompting ? pausePrompt() : playPrompt());
  els.restartPrompt.addEventListener('click', restartPrompt);
  els.record.addEventListener('click', () => state.recording ? stopRecording() : startRecording());
  els.flipCamera.addEventListener('click', flipCamera);
  els.back.addEventListener('click', closeCamera);
  els.save.addEventListener('click', saveRecording);
  els.discard.addEventListener('click', discardRecording);
  els.showSettings.addEventListener('click', () => els.settings.classList.toggle('hidden'));

  els.setupSpeed.addEventListener('input', () => { els.speed.value = els.setupSpeed.value; saveSettings(); });
  els.setupFont.addEventListener('input', () => { els.fontSize.value = els.setupFont.value; syncSettings(); });
  [els.speed, els.fontSize, els.promptY, els.backdrop].forEach(input => input.addEventListener('input', () => {
    els.setupSpeed.value = els.speed.value;
    els.setupFont.value = els.fontSize.value;
    syncSettings();
  }));
  els.mirror.addEventListener('change', syncSettings);
  els.script.addEventListener('input', () => localStorage.setItem('prompt-lia-script', els.script.value));

  let touchStartY = 0;
  let touchStartOffset = 0;
  els.promptWindow.addEventListener('touchstart', event => {
    touchStartY = event.touches[0].clientY;
    touchStartOffset = state.promptOffset;
    pausePrompt();
  }, { passive: true });
  els.promptWindow.addEventListener('touchmove', event => {
    state.promptOffset = Math.max(0, touchStartOffset + touchStartY - event.touches[0].clientY);
    renderPrompt();
  }, { passive: true });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !state.wakeLock) requestWakeLock();
  });

  window.addEventListener('beforeunload', () => state.stream?.getTracks().forEach(track => track.stop()));
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('./sw.js').catch(() => {});
  syncSettings();
})();
