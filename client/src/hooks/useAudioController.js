import { useCallback, useEffect, useRef, useState } from 'react';

export function useAudioController() {
  const audioCtxRef = useRef(null);
  const bgmNodesRef = useRef(null);
  const bgmGainRef = useRef(null);
  const sfxGainRef = useRef(null);
  const [bgmVolume, setBgmVolume] = useState(0.35);
  const [sfxVolume, setSfxVolume] = useState(0.7);
  const [isBgmActive, setIsBgmActive] = useState(false);

  const ensureContext = useCallback(() => {
    if (audioCtxRef.current) {
      return audioCtxRef.current;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) {
      return null;
    }
    const context = new Ctx();
    const masterGain = context.createGain();
    masterGain.gain.value = 1;
    masterGain.connect(context.destination);

    const bgmGain = context.createGain();
    const sfxGain = context.createGain();
    bgmGain.connect(masterGain);
    sfxGain.connect(masterGain);

    audioCtxRef.current = context;
    bgmGainRef.current = bgmGain;
    sfxGainRef.current = sfxGain;
    return context;
  }, []);

  useEffect(() => {
    if (bgmGainRef.current) {
      bgmGainRef.current.gain.linearRampToValueAtTime(
        bgmVolume,
        audioCtxRef.current?.currentTime || 0
      );
    }
  }, [bgmVolume]);

  useEffect(() => {
    if (sfxGainRef.current) {
      sfxGainRef.current.gain.linearRampToValueAtTime(
        sfxVolume,
        audioCtxRef.current?.currentTime || 0
      );
    }
  }, [sfxVolume]);

  const stopBgm = useCallback(() => {
    if (bgmNodesRef.current) {
      const { baseOsc, lfo } = bgmNodesRef.current;
      try {
        baseOsc.stop();
        lfo.stop();
      } catch (error) {
        // Oscillators already stopped.
      }
      bgmNodesRef.current = null;
    }
    setIsBgmActive(false);
  }, []);

  const startBgm = useCallback(async () => {
    const context = ensureContext();
    if (!context || bgmNodesRef.current) {
      return;
    }
    if (context.state === 'suspended') {
      await context.resume();
    }
    if (!bgmGainRef.current) {
      return;
    }

    const baseOsc = context.createOscillator();
    baseOsc.type = 'sawtooth';
    baseOsc.frequency.value = 85;

    const lfo = context.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.12;

    const lfoGain = context.createGain();
    lfoGain.gain.value = 220;

    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    filter.Q.value = 0.7;

    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    baseOsc.connect(filter);
    filter.connect(bgmGainRef.current);

    baseOsc.start();
    lfo.start();

    bgmNodesRef.current = { baseOsc, lfo };
    setIsBgmActive(true);
  }, [ensureContext]);

  const toggleBgm = useCallback(() => {
    if (isBgmActive) {
      stopBgm();
    } else {
      startBgm();
    }
  }, [isBgmActive, startBgm, stopBgm]);

  const triggerSfx = useCallback(
    async (frequency, durationMs, type = 'triangle') => {
      const context = ensureContext();
      if (!context) return;
      if (context.state === 'suspended') {
        await context.resume();
      }
      if (!sfxGainRef.current) {
        return;
      }

      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = type;
      osc.frequency.value = frequency;
      gain.gain.value = 1;
      osc.connect(gain);
      gain.connect(sfxGainRef.current);

      const now = context.currentTime;
      gain.gain.setValueAtTime(1, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + durationMs / 1000);

      osc.start();
      osc.stop(now + durationMs / 1000);
    },
    [ensureContext]
  );

  const playCoin = useCallback(() => {
    triggerSfx(520, 180, 'triangle');
  }, [triggerSfx]);

  const playHazard = useCallback(() => {
    triggerSfx(180, 260, 'sawtooth');
  }, [triggerSfx]);

  return {
    bgmVolume,
    sfxVolume,
    setBgmVolume,
    setSfxVolume,
    isBgmActive,
    toggleBgm,
    playCoin,
    playHazard,
  };
}
