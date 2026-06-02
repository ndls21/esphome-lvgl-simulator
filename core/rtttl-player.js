class RTTTLPlayer {
  constructor() {
    this._ctx = null;
    this._playing = false;
    this._stopFlag = false;
  }

  _getCtx() {
    if (!this._ctx) this._ctx = new (window.AudioContext || window.webkitAudioContext)();
    return this._ctx;
  }

  stop() {
    this._stopFlag = true;
    this._playing = false;
  }

  async play(song) {
    if (!song || typeof song !== 'string') return;
    this._stopFlag = false;
    this._playing = true;

    const ctx = this._getCtx();
    if (ctx.state === 'suspended') await ctx.resume();

    // Parse RTTTL: name:defaults:notes
    const parts = song.split(':');
    if (parts.length < 3) return;
    const defaults = {};
    parts[1].split(',').forEach(p => {
      const [k, v] = p.split('=');
      defaults[k.trim()] = parseInt(v);
    });
    const d = defaults.d || 4;
    const o = defaults.o || 6;
    const b = defaults.b || 120;
    const msPerBeat = 60000 / b;
    const msPerWhole = msPerBeat * 4;

    const noteFreqs = {
      'p': 0, 'c': 261.63, 'cs': 277.18, 'd': 293.66, 'ds': 311.13,
      'e': 329.63, 'f': 349.23, 'fs': 369.99, 'g': 392.00, 'gs': 415.30,
      'a': 440.00, 'as': 466.16, 'b': 493.88
    };

    const notes = parts[2].split(',').map(s => s.trim()).filter(Boolean);

    let t = ctx.currentTime + 0.05;
    for (const note of notes) {
      if (this._stopFlag) break;
      // Parse: [duration]note[#|b][octave][.]
      const m = note.match(/^(\d*)(p|c|cs|d|ds|e|f|fs|g|gs|a|as|b)(#?)(\d?)(\.*)/i);
      if (!m) continue;
      const dur = parseInt(m[1]) || d;
      const name = (m[2] + (m[3] === '#' ? 's' : '')).toLowerCase();
      const octave = parseInt(m[4]) || o;
      const dotted = m[5].includes('.');
      let ms = msPerWhole / dur;
      if (dotted) ms *= 1.5;

      const freq = noteFreqs[name] || 0;
      if (freq > 0) {
        const actualFreq = freq * Math.pow(2, octave - 4);
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'square';
        osc.frequency.setValueAtTime(actualFreq, t);
        gain.gain.setValueAtTime(0.15, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + ms / 1000 * 0.9);
        osc.start(t);
        osc.stop(t + ms / 1000);
      }
      t += ms / 1000;
    }
    this._playing = false;
  }
}

const rtttlPlayer = new RTTTLPlayer();
if (typeof module !== 'undefined') module.exports = { RTTTLPlayer };
