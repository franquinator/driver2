import { CONFIG } from '../config.js';

/**
 * Generador de sonido procedural (Web Audio API). No se usan archivos externos:
 * - Motor: dos osciladores 'sawtooth' (armónicos) + filtro paso-bajo modulados por el RPM.
 * - Choque: burst de ruido blanco (filtro paso-bajo) + subgraveso de sierra.
 */
export class AudioEngine {
    static getInstance() {
        if (!AudioEngine._instance) AudioEngine._instance = new AudioEngine();
        return AudioEngine._instance;
    }

    constructor() {
        this.ctx = null;
        this.masterGain = null;
        this.engineNodes = null;
        this.noiseBuffer = null;
        this.enabled = CONFIG.AUDIO.ENABLED;
    }

    /**
     * Crea el contexto de audio, el volumen maestro y el buffer de ruido blanco.
     * @returns {Promise<AudioEngine>}
     */
    async init() {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioContext();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = CONFIG.AUDIO.MASTER_VOLUME;
        this.masterGain.connect(this.ctx.destination);

        // Buffer de 1 segundo de ruido blanco para los choques
        const len = Math.floor(this.ctx.sampleRate);
        this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const data = this.noiseBuffer.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

        return this;
    }

    /**
     * Reanuda el contexto si estaba suspendido. Se llama al detectar la primera
     * interacción del usuario (política de autoplay de los navegadores).
     */
    resume() {
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    /**
     * Actualiza el volumen maestro (0..1).
     * @param {number} value
     */
    updateMasterVolume(value) {
        if (this.masterGain && this.ctx) {
            this.masterGain.gain.setTargetAtTime(value, this.ctx.currentTime, 0.02);
        }
    }

    /**
     * Activa/desactiva todos los sonidos.
     * @param {boolean} enabled
     */
    setEnabled(enabled) {
        this.enabled = !!enabled;
    }

    /**
     * Arranca el grafo de sonido del motor (osciladores + filtro + ganancia).
     */
    startEngineSound() {
        if (!this.ctx || !this.enabled || this.engineNodes) return;

        const ctx = this.ctx;
        const a = CONFIG.AUDIO.ENGINE;

        const gain = ctx.createGain();
        gain.gain.value = 0;

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = a.LOWPASS_IDLE;
        filter.Q.value = 1.5;

        const osc1 = ctx.createOscillator();
        osc1.type = 'sawtooth';

        const osc2 = ctx.createOscillator();
        osc2.type = 'sawtooth';
        osc2.detune.value = 6;

        const osc1Gain = ctx.createGain();
        osc1Gain.gain.value = 0.6;
        const osc2Gain = ctx.createGain();
        osc2Gain.gain.value = 0.35;

        osc1.connect(osc1Gain);
        osc1Gain.connect(filter);
        osc2.connect(osc2Gain);
        osc2Gain.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);

        osc1.start();
        osc2.start();
        gain.gain.setTargetAtTime(a.IDLE_GAIN, ctx.currentTime, 0.2);

        this.engineNodes = { gain, filter, osc1, osc2, osc1Gain, osc2Gain };
    }

    /**
     * Detiene el sonido de motor (al destruir el vehículo, p. ej.).
     */
    stopEngineSound() {
        if (!this.engineNodes || !this.ctx) return;

        const nodes = this.engineNodes;
        this.engineNodes = null;

        try {
            nodes.osc1.stop();
            nodes.osc2.stop();
            nodes.gain.disconnect();
            nodes.filter.disconnect();
            nodes.osc1.disconnect();
            nodes.osc2.disconnect();
            nodes.osc1Gain.disconnect();
            nodes.osc2Gain.disconnect();
        } catch (e) { /* ya desconectado */ }
    }

    /**
     * Actualiza el sonido del motor con el régimen (0..1) y el pedal del acelerador (0..1).
     * - rpm01: régimen del motor (0 = ralentí, 1 = plena carga).
     * - throttle01: 0..1 de presión del acelerador.
     */
    setEngine(rpm01, throttle01) {
        if (!this.ctx || !this.enabled || !this.engineNodes) return;

        const ctx = this.ctx;
        const a = CONFIG.AUDIO.ENGINE;
        const t = ctx.currentTime;

        const rpm = Math.max(0, Math.min(1, rpm01));
        const throttle = Math.max(0, Math.min(1, throttle01));

        // Frecuencia del motor: ralentí -> plena carga (con un pequeño exceso de octava)
        const freq = a.IDLE_HZ * Math.pow(1 + rpm * (a.MAX_HZ / a.IDLE_HZ), 1);
        this.engineNodes.osc1.frequency.setTargetAtTime(freq, t, 0.03);
        this.engineNodes.osc2.frequency.setTargetAtTime(freq * 2, t, 0.03);

        // Filtro paso-bajo que suaviza los armónicos según el régimen
        this.engineNodes.filter.frequency.setTargetAtTime(
            a.LOWPASS_IDLE + rpm * (a.LOWPASS_MAX - a.LOWPASS_IDLE),
            t,
            0.05
        );

        const targetGain = a.IDLE_GAIN * (0.25 + 0.75 * throttle) * (0.3 + 0.7 * rpm);
        this.engineNodes.gain.gain.setTargetAtTime(targetGain, t, 0.05);
    }

    /**
     * Reproduce un choque con el cambio de velocidad del impacto (m/s).
     * Cuanto mayor es la velocidad, más fuerte y grave es el sonido.
     * @param {number} deltaV Cambio de velocidad del impacto (m/s).
     */
    playCrash(deltaV) {
        if (!this.ctx || !this.enabled || !this.noiseBuffer) return;

        const intensity = Math.min(1, Math.max(0, deltaV) / CONFIG.AUDIO.CRASH.MAX_VELOCITY);
        if (intensity <= 0) return;

        const ctx = this.ctx;
        const t = ctx.currentTime;
        const a = CONFIG.AUDIO.CRASH;
        const level = intensity * a.VOLUME;
        const dur = 0.2 + intensity * 0.6;

        // Capa 1: ruido blanco filtrado = "explosión" del impacto
        const src = ctx.createBufferSource();
        src.buffer = this.noiseBuffer;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = a.NOISE_LOWPASS * (0.6 + intensity);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(Math.max(0.001, 0.8 * level), t + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

        src.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        src.start(t);
        src.stop(t + dur + 0.05);
        src.onended = () => {
            src.disconnect();
            filter.disconnect();
            gain.disconnect();
        };

        // Capa 2: subgraveso con caída de frecuencia = golpe sordo
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(a.THUD_HZ * (1 + intensity), t);
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, a.THUD_HZ * 0.4), t + dur);

        const oscGain = ctx.createGain();
        oscGain.gain.setValueAtTime(0, t);
        oscGain.gain.linearRampToValueAtTime(Math.max(0.001, 0.9 * level), t + 0.004);
        oscGain.gain.exponentialRampToValueAtTime(0.001, t + dur);

        osc.connect(oscGain);
        oscGain.connect(this.masterGain);
        osc.start(t);
        osc.stop(t + dur + 0.05);
        osc.onended = () => {
            osc.disconnect();
            oscGain.disconnect();
        };
    }

    /**
     * Libera los recursos del audio al destruir el motor.
     */
    dispose() {
        if (this.engineNodes) {
            const nodes = this.engineNodes;
            this.engineNodes = null;
            try {
                nodes.osc1.stop();
                nodes.osc2.stop();
                nodes.gain.disconnect();
                nodes.filter.disconnect();
                nodes.osc1.disconnect();
                nodes.osc2.disconnect();
                nodes.osc1Gain.disconnect();
                nodes.osc2Gain.disconnect();
            } catch (e) { /* ya desconectado */ }
        }
        if (this.ctx) {
            this.ctx.close();
            this.ctx = null;
        }
        this.masterGain = null;
    }
}
