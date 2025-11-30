import { useEffect, useRef } from 'react';

const GameCanvas = ({ map, snapshots, avatarLookup }) => {
  const canvasRef = useRef(null);
  const snapshotRef = useRef([]);
  const coinImageRef = useRef(null);
  const avatarImagesRef = useRef(new Map());

  useEffect(() => {
    snapshotRef.current = snapshots || [];
  }, [snapshots]);

  useEffect(() => {
    const coinImage = new Image();
    coinImage.src = '/coin.svg';
    coinImageRef.current = coinImage;
  }, []);

  useEffect(() => {
    const cache = new Map();
    Object.entries(avatarLookup || {}).forEach(([key, src]) => {
      if (!src) return;
      const img = new Image();
      img.src = src;
      cache.set(key, img);
    });
    avatarImagesRef.current = cache;
  }, [avatarLookup]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !map) return;
    const ctx = canvas.getContext('2d');
    canvas.width = map.width;
    canvas.height = map.height;
    let raf;

    const render = () => {
      raf = requestAnimationFrame(render);
      drawScene({ ctx, map, snapshots: snapshotRef.current, coinImageRef, avatarImagesRef });
    };

    render();
    return () => cancelAnimationFrame(raf);
  }, [map]);

  return <canvas ref={canvasRef} className="game-canvas" aria-label="Live arena feed" />;
};

function drawScene({ ctx, map, snapshots, coinImageRef, avatarImagesRef }) {
  ctx.save();
  ctx.clearRect(0, 0, map.width, map.height);
  ctx.fillStyle = '#05070f';
  ctx.fillRect(0, 0, map.width, map.height);

  const snapshot = snapshots?.[snapshots.length - 1];
  if (!snapshot) {
    ctx.fillStyle = '#ffffff40';
    ctx.font = '24px Space Grotesk, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Awaiting first server snapshot…', map.width / 2, map.height / 2 - 12);
    ctx.restore();
    return;
  }

  snapshot.hazards?.forEach((hazard) => {
    ctx.beginPath();
    ctx.strokeStyle = '#ff5f5f55';
    ctx.fillStyle = '#ff5f5f15';
    ctx.lineWidth = 2;
    ctx.arc(hazard.x, hazard.y, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  });

  snapshot.coins?.forEach((coin) => {
    const coinImage = coinImageRef.current;
    if (coinImage?.complete) {
      const size = 28;
      ctx.drawImage(coinImage, coin.x - size / 2, coin.y - size / 2, size, size);
    } else {
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.arc(coin.x, coin.y, 14, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  snapshot.players?.forEach((player) => {
    const sprite = avatarImagesRef.current.get(player.avatarKey) || avatarImagesRef.current.get('default');
    if (sprite?.complete) {
      const size = 40;
      ctx.drawImage(sprite, player.position.x - size / 2, player.position.y - size / 2, size, size);
    } else {
      ctx.beginPath();
      ctx.fillStyle = '#7dd3fc';
      ctx.arc(player.position.x, player.position.y, 18, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.font = '14px Space Grotesk, sans-serif';
    ctx.fillStyle = '#e5e7eb';
    ctx.textAlign = 'center';
    ctx.fillText(player.name || player.id, player.position.x, player.position.y - 28);
  });

  ctx.restore();
}

export default GameCanvas;
