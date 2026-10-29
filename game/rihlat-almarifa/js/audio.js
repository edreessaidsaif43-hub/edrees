/* مؤثرات وموسيقى أصلية مولّدة برمجيًا عبر Web Audio (بدون ملفات خارجية) */
(function () {
  var ctx = null, master = null, musicGain = null, sfxGain = null;
  var muted = false;
  try { muted = localStorage.getItem('edu-muted') === '1'; } catch (e) {}
  var musicTimer = null, musicStep = 0, nextTime = 0, musicOn = false;

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return true; }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.8; master.connect(ctx.destination);
    musicGain = ctx.createGain(); musicGain.gain.value = 0.16; musicGain.connect(master);
    sfxGain = ctx.createGain(); sfxGain.gain.value = 0.5; sfxGain.connect(master);
    return true;
  }

  function tone(freq, start, dur, type, vol, dest, slideTo) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, start);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, start + dur);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(vol || 0.3, start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g); g.connect(dest || sfxGain);
    o.start(start); o.stop(start + dur + 0.02);
  }
  function hz(n) { return 440 * Math.pow(2, (n - 69) / 12); }

  var SFX = {
    jump: function (t) { tone(330, t, 0.16, 'square', 0.25, null, 700); },
    coin: function (t) { tone(hz(83), t, 0.07, 'square', 0.22); tone(hz(88), t + 0.07, 0.16, 'square', 0.22); },
    correct: function (t) { [72, 76, 79, 84].forEach(function (n, i) { tone(hz(n), t + i * 0.08, 0.18, 'triangle', 0.35); }); },
    wrong: function (t) { tone(220, t, 0.18, 'sawtooth', 0.18, null, 160); tone(160, t + 0.18, 0.25, 'sawtooth', 0.18, null, 110); },
    hurt: function (t) { [67, 63, 60, 55].forEach(function (n, i) { tone(hz(n), t + i * 0.11, 0.14, 'square', 0.25); }); },
    stomp: function (t) { tone(180, t, 0.1, 'square', 0.3, null, 80); },
    checkpoint: function (t) { [67, 71, 74].forEach(function (n, i) { tone(hz(n), t + i * 0.07, 0.14, 'triangle', 0.3); }); },
    clear: function (t) {
      var seq = [60, 64, 67, 72, 67, 72, 76, 79];
      seq.forEach(function (n, i) { tone(hz(n), t + i * 0.12, 0.2, 'square', 0.22); tone(hz(n - 12), t + i * 0.12, 0.2, 'triangle', 0.25); });
    },
    question: function (t) { tone(hz(76), t, 0.1, 'triangle', 0.3); tone(hz(81), t + 0.1, 0.18, 'triangle', 0.3); },
    gameover: function (t) { [64, 62, 60, 55, 52, 48].forEach(function (n, i) { tone(hz(n), t + i * 0.16, 0.22, 'triangle', 0.3); }); }
  };

  // لحن أصلي بسيط (سلم خماسي) — 32 خطوة، صفر = سكون
  var LEAD = [72, 0, 76, 79, 81, 0, 79, 76, 74, 0, 76, 74, 72, 0, 67, 0,
              72, 0, 76, 79, 84, 0, 81, 79, 76, 79, 81, 79, 76, 74, 72, 0];
  var BASS = [48, 48, 55, 55, 53, 53, 55, 55, 48, 48, 55, 55, 50, 50, 55, 55,
              48, 48, 55, 55, 57, 57, 53, 53, 48, 48, 53, 53, 55, 55, 48, 48];
  var STEP = 0.16;
  function schedule() {
    if (!musicOn || !ctx) return;
    while (nextTime < ctx.currentTime + 0.3) {
      var i = musicStep % 32;
      if (LEAD[i]) tone(hz(LEAD[i]), nextTime, STEP * 0.9, 'square', 0.18, musicGain);
      if (i % 2 === 0) tone(hz(BASS[i]), nextTime, STEP * 1.8, 'triangle', 0.4, musicGain);
      if (i % 4 === 2) tone(1800, nextTime, 0.03, 'square', 0.04, musicGain);
      nextTime += STEP; musicStep++;
    }
  }

  window.Sound = {
    unlock: function () { ensure(); },
    play: function (name) {
      if (!ensure() || !SFX[name]) return;
      SFX[name](ctx.currentTime + 0.01);
    },
    startMusic: function () {
      if (!ensure() || musicOn) return;
      musicOn = true; nextTime = ctx.currentTime + 0.05;
      musicTimer = setInterval(schedule, 100);
    },
    stopMusic: function () { musicOn = false; if (musicTimer) clearInterval(musicTimer); musicTimer = null; },
    isMuted: function () { return muted; },
    toggle: function () {
      muted = !muted;
      try { localStorage.setItem('edu-muted', muted ? '1' : '0'); } catch (e) {}
      if (ensure()) master.gain.setTargetAtTime(muted ? 0 : 0.8, ctx.currentTime, 0.02);
      return muted;
    }
  };
})();
