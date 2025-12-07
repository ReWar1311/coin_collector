import { useCallback, useEffect, useRef, useState } from 'react';

const BGM_TRACKS = [
  // '/bgm/323839__littlerobotsoundfactory__loop_driftingthroughspace_06.wav',
  '/bgm/323846__littlerobotsoundfactory__loop_treasurehunter_04.wav',
  '/bgm/323870__littlerobotsoundfactory__loop_reflections_05.wav',
];

const SFX = {
  countdown3: '/music/3_sec_countdown.wav',
  go: '/music/go.wav',
  coin: '/music/coin.wav',
  tenSeconds: '/music/10_sec_countdown.flac',
  gameOver: '/music/game_over.wav',
};

function playOneShot(src, volume) {
  const audio = new Audio(src);
  audio.volume = volume;
  audio.play().catch(() => {});
}

export function useSoundBoard() {
  const [bgmVolume, setBgmVolume] = useState(0.4);
  const [sfxVolume, setSfxVolume] = useState(0.8);
  const [isBgmActive, setIsBgmActive] = useState(false);
  const bgmRef = useRef(null);
  const playlistIndexRef = useRef(0);

  const ensureBgm = useCallback(() => {
    if (!bgmRef.current) {
      const audio = new Audio(BGM_TRACKS[playlistIndexRef.current] || BGM_TRACKS[0]);
      audio.loop = true;
      audio.volume = bgmVolume;
      bgmRef.current = audio;
    }
    return bgmRef.current;
  }, [bgmVolume]);

  const toggleBgm = useCallback(async () => {
    const bgm = ensureBgm();
    if (!bgm) return;
    if (bgm.paused) {
      try {
        await bgm.play();
        setIsBgmActive(true);
      } catch (error) {
        // playback blocked by browser gesture
      }
    } else {
      bgm.pause();
      bgm.currentTime = 0;
      setIsBgmActive(false);
    }
  }, [ensureBgm]);

  useEffect(() => {
    const audio = bgmRef.current;
    if (audio) {
      audio.volume = bgmVolume;
    }
  }, [bgmVolume]);

  useEffect(() => {
    return () => {
      if (bgmRef.current) {
        bgmRef.current.pause();
        bgmRef.current = null;
      }
    };
  }, []);

  const playCountdown3 = useCallback(() => playOneShot(SFX.countdown3, sfxVolume), [sfxVolume]);
  const playGo = useCallback(() => playOneShot(SFX.go, sfxVolume), [sfxVolume]);
  const playCoin = useCallback(() => playOneShot(SFX.coin, sfxVolume), [sfxVolume]);
  const playTenSeconds = useCallback(() => playOneShot(SFX.tenSeconds, sfxVolume), [sfxVolume]);
  const playGameOver = useCallback(() => playOneShot(SFX.gameOver, sfxVolume), [sfxVolume]);

  return {
    bgmVolume,
    sfxVolume,
    isBgmActive,
    setBgmVolume,
    setSfxVolume,
    toggleBgm,
    playCountdown3,
    playGo,
    playCoin,
    playTenSeconds,
    playGameOver,
  };
}
