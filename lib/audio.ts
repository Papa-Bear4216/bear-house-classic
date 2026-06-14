// Pure client-side Web Audio API synthesizer for retro chimes
class AudioSynth {
  private ctx: AudioContext | null = null;

  private init() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
  }

  // Play a quick pleasant checkmark chime
  playCheckmark() {
    this.init();
    if (!this.ctx) return;
    
    const now = this.ctx.currentTime;
    
    // Low frequency tone followed by high frequency chime (dopamine hit!)
    this.playTone(392, 'sine', now, 0.08); // G4
    this.playTone(523.25, 'sine', now + 0.08, 0.15); // C5
    this.playTone(659.25, 'sine', now + 0.16, 0.25); // E5
  }

  // Play a level up sound for rewards
  playLevelUp() {
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    // Arpeggio rising up
    this.playTone(261.63, 'triangle', now, 0.1); // C4
    this.playTone(329.63, 'triangle', now + 0.08, 0.1); // E4
    this.playTone(392.00, 'triangle', now + 0.16, 0.1); // G4
    this.playTone(523.25, 'sine', now + 0.24, 0.3); // C5
  }

  // Play a timer alert sound
  playTimerAlert() {
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    // Classic retro double beep
    this.playTone(880, 'sawtooth', now, 0.12); // A5
    this.playTone(880, 'sawtooth', now + 0.2, 0.12);
  }

  private playTone(freq: number, type: OscillatorType, startTime: number, duration: number) {
    if (!this.ctx) return;
    
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.type = type;
      osc.frequency.setValueAtTime(freq, startTime);
      
      gain.gain.setValueAtTime(0.08, startTime);
      // Smooth fade out
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      
      osc.start(startTime);
      osc.stop(startTime + duration);
    } catch (e) {
      console.warn("Audio play blocked/failed:", e);
    }
  }
}

export const audioSynth = new AudioSynth();


// Custom canvas-free light-weight DOM confetti emitter
export function triggerConfetti() {
  if (typeof document === 'undefined') return;

  const colors = ['#facc15', '#ccff00', '#c084fc', '#be185d', '#3b82f6', '#10b981'];
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.inset = '0';
  container.style.pointerEvents = 'none';
  container.style.zIndex = '9999';
  document.body.appendChild(container);

  const particlesCount = 75;
  for (let i = 0; i < particlesCount; i++) {
    const p = document.createElement('div');
    const size = Math.random() * 8 + 6;
    p.style.width = `${size}px`;
    p.style.height = `${size}px`;
    p.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    p.style.position = 'absolute';
    p.style.borderRadius = Math.random() > 0.5 ? '50%' : '0%';
    
    // Spawn from bottom/center
    p.style.left = '50%';
    p.style.bottom = '-10px';
    
    const angle = (Math.random() * 120 + 30) * (Math.PI / 180); // 30 to 150 degrees
    const speed = Math.random() * 15 + 10;
    const vx = Math.cos(angle) * speed * (Math.random() > 0.5 ? 1 : -1);
    const vy = -Math.sin(angle) * speed - 10; // always up
    
    container.appendChild(p);

    let posX = window.innerWidth / 2;
    let posY = window.innerHeight;
    let currentVx = vx;
    let currentVy = vy;
    const gravity = 0.5;

    const animate = () => {
      posX += currentVx;
      posY += currentVy;
      currentVy += gravity;
      currentVx *= 0.98; // drag

      p.style.left = `${posX}px`;
      p.style.top = `${posY}px`;
      p.style.transform = `rotate(${posY * 2}deg)`;

      if (posY < window.innerHeight + 20 && posX > -20 && posX < window.innerWidth + 20) {
        requestAnimationFrame(animate);
      } else {
        p.remove();
      }
    };
    requestAnimationFrame(animate);
  }

  // Cleanup container
  setTimeout(() => {
    container.remove();
  }, 4000);
}
