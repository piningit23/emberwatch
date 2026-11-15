// Sound, synthesised with WebAudio: no audio files, no network, nothing to
// load. The context is created on the first user gesture (browsers require
// one) and every effect is a short oscillator or noise burst with an envelope.
export function createAudio() {
  let context = null;
  let master = null;
  let muted = false;
  let hum = null;

  function ensure() {
    if (context) {
      if (context.state === 'suspended') void context.resume();
      return true;
    }
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = 0.35;
      master.connect(context.destination);
    } catch {
      return false;
    }
    return true;
  }

  function tone(freq, endFreq, dur, type, gainValue, delay) {
    if (!context || muted) return;
    const start = context.currentTime + (delay || 0);
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (endFreq !== freq) osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), start + dur);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(gainValue, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(start);
    osc.stop(start + dur + 0.05);
  }

  function noise(dur, gainValue, delay) {
    if (!context || muted) return;
    const start = context.currentTime + (delay || 0);
    const length = Math.max(1, Math.floor(context.sampleRate * dur));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    gain.gain.value = gainValue;
    source.connect(gain);
    gain.connect(master);
    source.start(start);
  }

  return {
    /** Call on the first gesture so later sounds are allowed to play. */
    unlock() {
      if (ensure() && !hum) {
        // A soft low drone under the title screen, barely there.
        hum = context.createOscillator();
        const gain = context.createGain();
        hum.type = 'sine';
        hum.frequency.value = 55;
        gain.gain.value = 0.03;
        hum.connect(gain);
        gain.connect(master);
        hum.start();
      }
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.35;
      return muted;
    },
    shoot() {
      tone(720, 420, 0.09, 'square', 0.12);
    },
    hit() {
      noise(0.08, 0.18);
      tone(180, 90, 0.1, 'triangle', 0.2);
    },
    kill() {
      tone(520, 130, 0.16, 'sawtooth', 0.14);
      noise(0.12, 0.12, 0.02);
    },
    pickup() {
      tone(880, 880, 0.07, 'sine', 0.16);
      tone(1318, 1318, 0.09, 'sine', 0.12, 0.06);
    },
    hurt() {
      tone(140, 60, 0.25, 'sawtooth', 0.25);
      noise(0.15, 0.2);
    },
    emberHit() {
      tone(220, 110, 0.3, 'sawtooth', 0.2);
    },
    dash() {
      noise(0.14, 0.1);
      tone(300, 900, 0.14, 'sine', 0.1);
    },
    waveClear() {
      tone(523, 523, 0.12, 'sine', 0.18);
      tone(659, 659, 0.12, 'sine', 0.18, 0.1);
      tone(784, 784, 0.2, 'sine', 0.2, 0.2);
    },
    waveStart() {
      tone(392, 392, 0.15, 'triangle', 0.2);
      tone(523, 523, 0.2, 'triangle', 0.2, 0.12);
    },
    boss() {
      tone(98, 49, 0.8, 'sawtooth', 0.22);
      tone(147, 73, 0.8, 'sawtooth', 0.14, 0.1);
    },
    win() {
      const notes = [523, 659, 784, 1046, 1318];
      notes.forEach((freq, i) => tone(freq, freq, 0.22, 'sine', 0.2, i * 0.13));
    },
    lose() {
      const notes = [392, 330, 262, 196];
      notes.forEach((freq, i) => tone(freq, freq * 0.9, 0.3, 'triangle', 0.18, i * 0.16));
    },
  };
}
