import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

const FALLBACK_SERVER = typeof window !== 'undefined' ? `ws://${window.location.hostname}:8080` : 'ws://localhost:8080'
const INTERPOLATION_DELAY = 200
const PLAYER_SIZE = 32
const COLORS = ['#38bdf8', '#f472b6', '#facc15', '#34d399']
const defaultKeys = { up: false, down: false, left: false, right: false }
const COIN_DRAW_SIZE = 28
const AVATAR_POOL = [
  '/Avatars/black.svg',
  '/Avatars/brown.svg',
  '/Avatars/red.svg',
  '/Avatars/skyblue.svg',
  '/Avatars/white.svg',
  '/Avatars/yellow.svg',
]
const CRITICAL_TIME_MS = 10000

function App() {
  const canvasRef = useRef(null)
  const socketRef = useRef(null)
  const reconnectRef = useRef(null)
  const keysRef = useRef({ ...defaultKeys })
  const keyListenersRef = useRef({ down: null, up: null })
  const snapshotsRef = useRef([])
  const clockDriftRef = useRef(0)
  const animationRef = useRef(null)
  const mapRef = useRef({ width: 960, height: 640 })
  const hazardsRef = useRef([])
  const lastUiUpdateRef = useRef(0)
  const coinSpriteRef = useRef(null)
  const audioBankRef = useRef({})
  const avatarAssignmentsRef = useRef({})
  const coinCountRef = useRef(null)
  const tenSecondWarningRef = useRef(false)
  const countdownCueRef = useRef(false)
  const goCueRef = useRef(false)
  const gameOverCueRef = useRef(false)
  const goFlashTimerRef = useRef(null)

  const [connectionState, setConnectionState] = useState('disconnected')
  const [statusMessage, setStatusMessage] = useState('Booting up...')
  const [localPlayerId, setLocalPlayerId] = useState(null)
  const [availableModes, setAvailableModes] = useState({})
  const [availableDifficulties, setAvailableDifficulties] = useState({})
  const [selection, setSelection] = useState({ modeKey: 'countdown', difficultyKey: 'striker' })
  const [queueInfo, setQueueInfo] = useState({ status: 'idle' })
  const [matchMeta, setMatchMeta] = useState(null)
  const [phase, setPhase] = useState('lobby')
  const [latencyBudget, setLatencyBudget] = useState(INTERPOLATION_DELAY)
  const [nameInput, setNameInput] = useState('')
  const [mapSize, setMapSize] = useState(mapRef.current)
  const [scoreboard, setScoreboard] = useState([])
  const [matchClock, setMatchClock] = useState(null)
  const [toast, setToast] = useState(null)
  const [goFlash, setGoFlash] = useState(false)

  const serverUrl = useMemo(() => import.meta.env.VITE_SERVER_URL || FALLBACK_SERVER, [])

  useEffect(() => {
    connect()
    setupInputListeners()
    startRenderLoop()
    return () => {
      teardownInputListeners()
      stopRenderLoop()
      cleanupSocket()
    }
  }, [])

  useEffect(() => {
    const img = new Image()
    img.src = '/coin.svg'
    coinSpriteRef.current = img
    return () => {
      img.onload = null
    }
  }, [])

  useEffect(() => {
    const createClip = (src, volume = 1) => {
      const audio = new Audio(src)
      audio.preload = 'auto'
      audio.volume = volume
      return audio
    }
    audioBankRef.current = {
      countdown3: createClip('/music/3_sec_countdown.wav', 0.75),
      go: createClip('/music/go.wav', 0.85),
      coin: createClip('/music/coin.wav', 0.6),
      ten: createClip('/music/10_sec_countdown.flac', 0.8),
      gameOver: createClip('/music/game_over.wav', 0.8),
    }
    return () => {
      Object.values(audioBankRef.current || {}).forEach((clip) => {
        clip.pause()
      })
    }
  }, [])

  useEffect(() => () => {
    if (goFlashTimerRef.current) {
      clearTimeout(goFlashTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(timer)
  }, [toast])

  function playSound(key) {
    const clip = audioBankRef.current?.[key]
    if (!clip) return
    try {
      clip.currentTime = 0
      clip.play()
    } catch {
      // autoplay might be blocked before user interaction; ignore
    }
  }

  function avatarSrcForPlayer(playerId, slot = 0) {
    if (!playerId) {
      return AVATAR_POOL[slot % AVATAR_POOL.length]
    }
    const idKey = String(playerId)
    if (!avatarAssignmentsRef.current[idKey]) {
      const hash = [...idKey].reduce((acc, char) => acc + char.charCodeAt(0), slot * 31)
      avatarAssignmentsRef.current[idKey] = AVATAR_POOL[hash % AVATAR_POOL.length]
    }
    return avatarAssignmentsRef.current[idKey]
  }

  function resetMatchFeedback() {
    coinCountRef.current = null
    tenSecondWarningRef.current = false
    countdownCueRef.current = false
    goCueRef.current = false
    gameOverCueRef.current = false
    setGoFlash(false)
    if (goFlashTimerRef.current) {
      clearTimeout(goFlashTimerRef.current)
      goFlashTimerRef.current = null
    }
  }

  function connect(delay = 0) {
    if (socketRef.current || reconnectRef.current) return
    reconnectRef.current = setTimeout(() => {
      reconnectRef.current = null
      const ws = new WebSocket(serverUrl)
      socketRef.current = ws
      setConnectionState('connecting')
      setStatusMessage('Connecting to mission control...')

      ws.onopen = () => {
        setConnectionState('connected')
        setStatusMessage('Connected. Pick a mode and queue up!')
      }

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)
          handleServerMessage(message)
        } catch (error) {
          console.warn('Invalid packet', error)
        }
      }

      ws.onerror = () => {
        setConnectionState('error')
        setStatusMessage('Socket error. Retrying...')
        ws.close()
      }

      ws.onclose = () => {
        setConnectionState('disconnected')
        setStatusMessage('Disconnected. Attempting reconnection...')
        cleanupSocket()
        connect(1500)
      }
    }, delay)
  }

  function cleanupSocket() {
    if (socketRef.current) {
      try {
        socketRef.current.close()
      } catch {}
    }
    socketRef.current = null
    if (reconnectRef.current) {
      clearTimeout(reconnectRef.current)
      reconnectRef.current = null
    }
    snapshotsRef.current = []
    hazardsRef.current = []
    setQueueInfo({ status: 'idle' })
    setMatchMeta(null)
    setScoreboard([])
    setMatchClock(null)
    setPhase('lobby')
    resetMatchFeedback()
  }

  function setupInputListeners() {
    if (keyListenersRef.current.down || keyListenersRef.current.up) return
    const down = (event) => handleKey(event, true)
    const up = (event) => handleKey(event, false)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    keyListenersRef.current = { down, up }
  }

  function teardownInputListeners() {
    const { down, up } = keyListenersRef.current
    if (down) window.removeEventListener('keydown', down)
    if (up) window.removeEventListener('keyup', up)
    keyListenersRef.current = { down: null, up: null }
  }

  function handleKey(event, isDown) {
    if (phase === 'countdown' && matchClock?.countdownEndsAt && syncedNow() < matchClock.countdownEndsAt) {
      return
    }
    const mapping = {
      ArrowUp: 'up',
      KeyW: 'up',
      ArrowDown: 'down',
      KeyS: 'down',
      ArrowLeft: 'left',
      KeyA: 'left',
      ArrowRight: 'right',
      KeyD: 'right',
    }
    const key = mapping[event.code]
    if (!key) return
    event.preventDefault()
    if (keysRef.current[key] === isDown) return
    keysRef.current = { ...keysRef.current, [key]: isDown }
    send({ type: 'input', keys: keysRef.current })
  }

  function send(payload) {
    const ws = socketRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload))
    }
  }

  function handleServerMessage(message) {
    switch (message.type) {
      case 'welcome':
        setLocalPlayerId(message.playerId)
        setLatencyBudget(message.latencyMs ?? INTERPOLATION_DELAY)
        hydrateOptions(message)
        break
      case 'queue':
        setQueueInfo(message)
        setStatusMessage(queueCopy(message))
        break
      case 'matchAssignment':
        setMatchMeta({
          roomId: message.roomId,
          mode: message.mode,
          difficulty: message.difficulty,
          slot: message.slot,
          roster: message.opponents,
        })
        setStatusMessage('Match found! Brace for countdown...')
        setPhase('staging')
        resetMatchFeedback()
        snapshotsRef.current = []
        hazardsRef.current = []
        break
      case 'state':
        setPhase(message.match?.phase ?? 'playing')
        ingestSnapshot(message)
        break
      case 'matchEvent':
        handleMatchEvent(message)
        break
      default:
        break
    }
  }

  function hydrateOptions(message) {
    if (message.map) {
      mapRef.current = message.map
      setMapSize(message.map)
    }
    if (message.modes) {
      const keyed = Object.fromEntries(message.modes.map((mode) => [mode.key, mode]))
      setAvailableModes(keyed)
      if (!keyed[selection.modeKey]) {
        setSelection((prev) => ({ ...prev, modeKey: message.modes[0]?.key || prev.modeKey }))
      }
    }
    if (message.difficulties) {
      const keyed = Object.fromEntries(
        message.difficulties.map((difficulty) => [difficulty.key, difficulty])
      )
      setAvailableDifficulties(keyed)
      if (!keyed[selection.difficultyKey]) {
        setSelection((prev) => ({ ...prev, difficultyKey: message.difficulties[0]?.key || prev.difficultyKey }))
      }
    }
    send({ type: 'setName', name: nameInput || `Pilot-${message.playerId}` })
  }

  function handleMatchEvent(message) {
    switch (message.event) {
      case 'started':
        setPhase('countdown')
        setMatchClock({ countdownEndsAt: message.countdownEndsAt, matchEndsAt: message.matchEndsAt })
        setStatusMessage('Countdown started! Get ready...')
        if (!countdownCueRef.current) {
          countdownCueRef.current = true
          playSound('countdown3')
        }
        goCueRef.current = false
        tenSecondWarningRef.current = false
        gameOverCueRef.current = false
        break
      case 'ended':
        setPhase('results')
        setMatchClock(null)
        setStatusMessage('Match complete. Queue up again!')
        setToast(
          message.winnerId
            ? `Winner: ${lookupName(message.winnerId, message.scores)} (${formatScore(
                message.scores,
                message.winnerId,
              )})`
            : 'Draw!'
        )
        if (!gameOverCueRef.current) {
          gameOverCueRef.current = true
          playSound('gameOver')
        }
        break
      case 'playerLeft':
        setToast('Opponent disconnected. Re-queueing recommended.')
        break
      case 'roster':
        setMatchMeta((prev) => (prev ? { ...prev, roster: message.roster } : prev))
        break
      default:
        break
    }
  }

  function lookupName(playerId, scores = []) {
    const fromRoster = matchMeta?.roster?.find((p) => p.id === playerId)
    if (fromRoster) return fromRoster.name
    const fromScore = scores.find((score) => score.id === playerId)
    if (fromScore?.name) return fromScore.name
    return playerId
  }

  function formatScore(scores, playerId) {
    return scores.find((score) => score.id === playerId)?.score ?? 0
  }

  function ingestSnapshot(message) {
    const now = Date.now()
    const drift = now - message.timestamp
    clockDriftRef.current = clockDriftRef.current
      ? clockDriftRef.current * 0.9 + drift * 0.1
      : drift

    const snapshot = {
      timestamp: message.timestamp,
      players: Object.fromEntries(message.players.map((p) => [p.id, { ...p }])),
      coins: (message.coins || []).map((coin) => ({ ...coin })),
      hazards: (message.hazards || []).map((hazard) => ({ ...hazard })),
      match: message.match,
    }

    hazardsRef.current = snapshot.hazards
    const prevCoinCount = coinCountRef.current
    if (typeof prevCoinCount === 'number' && snapshot.coins.length < prevCoinCount) {
      playSound('coin')
    }
    coinCountRef.current = snapshot.coins.length
    snapshotsRef.current.push(snapshot)
    if (snapshotsRef.current.length > 80) {
      snapshotsRef.current.shift()
    }

    const lastUi = lastUiUpdateRef.current
    if (now - lastUi > 150) {
      lastUiUpdateRef.current = now
      setScoreboard(snapshot.players ? Object.values(snapshot.players) : [])
      setMatchClock(snapshot.match)
    }
  }

  function startRenderLoop() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    const draw = () => {
      drawFrame(ctx)
      animationRef.current = requestAnimationFrame(draw)
    }
    animationRef.current = requestAnimationFrame(draw)
  }

  function stopRenderLoop() {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current)
      animationRef.current = null
    }
  }

  function drawFrame(ctx) {
    const { width, height } = ctx.canvas
    ctx.fillStyle = '#030712'
    ctx.fillRect(0, 0, width, height)

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.08)'
    ctx.lineWidth = 1
    for (let x = 0; x <= width; x += 48) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, height)
      ctx.stroke()
    }
    for (let y = 0; y <= height; y += 48) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(width, y)
      ctx.stroke()
    }

    const renderTime = syncedNow() - INTERPOLATION_DELAY
    const snapshot = sampleSnapshot(renderTime)
    if (!snapshot) return
    const predicted = applyLocalPrediction(snapshot)

    drawHazards(ctx, predicted.hazards)
    drawCoins(ctx, predicted.coins)
    drawPlayers(ctx, predicted.players)
  }

  function drawCoins(ctx, coins) {
    const sprite = coinSpriteRef.current
    coins.forEach((coin) => {
      if (sprite && sprite.complete) {
        const size = COIN_DRAW_SIZE
        const half = size / 2
        ctx.save()
        ctx.shadowColor = '#facc15'
        ctx.shadowBlur = 18
        ctx.drawImage(sprite, coin.x - half, coin.y - half, size, size)
        ctx.restore()
      } else {
        ctx.beginPath()
        ctx.fillStyle = '#fbbf24'
        ctx.strokeStyle = '#f59e0b'
        ctx.lineWidth = 3
        ctx.arc(coin.x, coin.y, 12, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
      }
    })
  }

  function drawHazards(ctx, hazards = []) {
    hazards.forEach((hazard) => {
      ctx.beginPath()
      ctx.fillStyle = 'rgba(124, 58, 237, 0.25)'
      ctx.strokeStyle = '#a855f7'
      ctx.lineWidth = 2
      ctx.arc(hazard.x, hazard.y, 18, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    })
  }

  function drawPlayers(ctx, players) {
    Object.values(players).forEach((player, index) => {
      const color = COLORS[player.slot - 1] || COLORS[index % COLORS.length]
      const half = PLAYER_SIZE / 2
      ctx.fillStyle = player.id === localPlayerId ? color : `${color}cc`
      ctx.strokeStyle = '#0f172a'
      ctx.lineWidth = 2
      ctx.beginPath()
      if (ctx.roundRect) {
        ctx.roundRect(player.position.x - half, player.position.y - half, PLAYER_SIZE, PLAYER_SIZE, 8)
      } else {
        ctx.rect(player.position.x - half, player.position.y - half, PLAYER_SIZE, PLAYER_SIZE)
      }
      ctx.fill()
      ctx.stroke()

      ctx.fillStyle = '#e2e8f0'
      ctx.font = '13px "JetBrains Mono", monospace'
      ctx.textAlign = 'center'
      ctx.fillText(player.name ?? '—', player.position.x, player.position.y - half - 12)
    })
  }

  function sampleSnapshot(targetTime) {
    const buffer = snapshotsRef.current
    if (!buffer.length) return null
    if (buffer.length === 1) return buffer[0]

    let older = buffer[0]
    for (let i = 1; i < buffer.length; i += 1) {
      const newer = buffer[i]
      if (targetTime <= newer.timestamp) {
        const span = Math.max(1, newer.timestamp - older.timestamp)
        const t = Math.min(Math.max((targetTime - older.timestamp) / span, 0), 1)
        return blendSnapshots(older, newer, t)
      }
      older = newer
    }
    return buffer[buffer.length - 1]
  }

  function applyLocalPrediction(snapshot) {
    if (!snapshot || !localPlayerId) return snapshot
    const me = snapshot.players[localPlayerId]
    if (!me) return snapshot

    const predicted = { ...snapshot, players: { ...snapshot.players } }
    const clone = {
      ...me,
      position: { ...me.position },
    }
    const dirX = (keysRef.current.right ? 1 : 0) - (keysRef.current.left ? 1 : 0)
    const dirY = (keysRef.current.down ? 1 : 0) - (keysRef.current.up ? 1 : 0)
    if (dirX !== 0 || dirY !== 0) {
      const length = Math.hypot(dirX, dirY)
      const dt = INTERPOLATION_DELAY / 1000
      const speed = availableDifficulties[selection.difficultyKey]?.playerSpeed || 220
      clone.position.x += ((dirX / length) * speed * dt)
      clone.position.y += ((dirY / length) * speed * dt)
      clampToArena(clone.position)
    }
    predicted.players[localPlayerId] = clone
    return predicted
  }

  function clampToArena(pos) {
    const half = PLAYER_SIZE / 2
    pos.x = Math.max(half, Math.min(mapRef.current.width - half, pos.x))
    pos.y = Math.max(half, Math.min(mapRef.current.height - half, pos.y))
  }

  function blendSnapshots(older, newer, t) {
    const players = {}
    const ids = new Set([...Object.keys(older.players), ...Object.keys(newer.players)])
    ids.forEach((id) => {
      const o = older.players[id]
      const n = newer.players[id]
      if (o && n) {
        players[id] = {
          ...n,
          position: {
            x: lerp(o.position.x, n.position.x, t),
            y: lerp(o.position.y, n.position.y, t),
          },
        }
      } else {
        players[id] = { ...(n || o) }
      }
    })
    return {
      timestamp: lerp(older.timestamp, newer.timestamp, t),
      players,
      coins: newer.coins,
      hazards: newer.hazards,
      match: newer.match,
    }
  }

  function lerp(a, b, t) {
    return a + (b - a) * t
  }

  function syncedNow() {
    return Date.now() - clockDriftRef.current
  }

  function queueCopy(info) {
    if (info.status === 'waiting') {
      return `Searching: ${info.position}/${info.needed} pilots`
    }
    if (info.status === 'idle') {
      return 'Idle. Tap Join Queue when ready.'
    }
    return statusMessage
  }

  function joinQueue() {
    send({ type: 'joinQueue', modeKey: selection.modeKey, difficultyKey: selection.difficultyKey })
    setQueueInfo({ status: 'waiting', position: 1 })
  }

  function leaveQueue() {
    send({ type: 'leaveQueue' })
    setQueueInfo({ status: 'idle' })
  }

  function updateSelection(partial) {
    setSelection((prev) => ({ ...prev, ...partial }))
  }

  const countdownMs = matchClock?.countdownEndsAt
    ? Math.max(0, matchClock.countdownEndsAt - syncedNow())
    : null
  const remainingMs = matchClock?.matchEndsAt
    ? Math.max(0, matchClock.matchEndsAt - syncedNow())
    : null
  const isCriticalTimer = typeof remainingMs === 'number' && remainingMs > 0 && remainingMs <= CRITICAL_TIME_MS
  const countdownActive = phase === 'countdown' && countdownMs !== null
  const showCountdownOverlay = (countdownActive && countdownMs > 0) || goFlash
  const countdownLabel = countdownActive && countdownMs !== null && countdownMs > 0
    ? Math.ceil(countdownMs / 1000)
    : goFlash
      ? 'GO!'
      : null

  const sortedScores = [...scoreboard].sort((a, b) => b.score - a.score)

  useEffect(() => {
    if (remainingMs !== null && remainingMs > 0 && remainingMs <= CRITICAL_TIME_MS) {
      if (!tenSecondWarningRef.current) {
        tenSecondWarningRef.current = true
        playSound('ten')
      }
    }
    if (remainingMs === null || remainingMs > CRITICAL_TIME_MS) {
      tenSecondWarningRef.current = false
    }
  }, [remainingMs])

  useEffect(() => {
    if (!countdownActive) return
    if (countdownMs !== null && countdownMs <= 0 && !goCueRef.current) {
      goCueRef.current = true
      playSound('go')
      setGoFlash(true)
      if (goFlashTimerRef.current) {
        clearTimeout(goFlashTimerRef.current)
      }
      goFlashTimerRef.current = setTimeout(() => {
        setGoFlash(false)
      }, 1000)
    }
  }, [countdownActive, countdownMs])

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <header>
          <h1>Coin Collector</h1>
          <p className="status-line">{statusMessage}</p>
        </header>

        <div className="field">
          <label htmlFor="name">Callsign</label>
          <div className="name-row">
            <input
              id="name"
              value={nameInput}
              placeholder="Nova"
              onChange={(event) => setNameInput(event.target.value)}
            />
            <button onClick={() => send({ type: 'setName', name: nameInput })} disabled={!nameInput}>
              Save
            </button>
          </div>
        </div>

        <section className="panel">
          <h2>Difficulty</h2>
          <div className="grid">
            {Object.values(availableDifficulties).map((difficulty) => (
              <button
                key={difficulty.key}
                className={`pill ${selection.difficultyKey === difficulty.key ? 'active' : ''}`}
                onClick={() => updateSelection({ difficultyKey: difficulty.key })}
              >
                <span>{difficulty.label}</span>
                <small>{difficulty.description}</small>
              </button>
            ))}
          </div>
        </section>

        <section className="panel">
          <h2>Mode</h2>
          <div className="grid">
            {Object.values(availableModes).map((mode) => (
              <button
                key={mode.key}
                className={`pill ${selection.modeKey === mode.key ? 'active' : ''}`}
                onClick={() => updateSelection({ modeKey: mode.key })}
              >
                <span>{mode.label}</span>
                <small>{mode.description}</small>
              </button>
            ))}
          </div>
        </section>

        <section className="panel queue-panel">
          <h2>Matchmaking</h2>
          <p>State: {connectionState}</p>
          <p>
            Queue: {queueInfo.status}
            {queueInfo.position && ` (${queueInfo.position}/${queueInfo.needed})`}
          </p>
          <div className="queue-actions">
            <button className="primary" onClick={joinQueue} disabled={connectionState !== 'connected'}>
              Join Queue
            </button>
            <button className="ghost" onClick={leaveQueue}>
              Leave
            </button>
          </div>
        </section>

        <section className="panel">
          <h2>Telemetry</h2>
          <p>Phase: {phase}</p>
          <p>Latency budget: {latencyBudget}ms</p>
          <p>Countdown: {countdownMs ? `${Math.ceil(countdownMs / 1000)}s` : '—'}</p>
          <p>
            Timer:{' '}
            <span className={`timer-chip ${isCriticalTimer ? 'critical' : ''}`}>
              {remainingMs ? `${Math.ceil(remainingMs / 1000)}s` : '—'}
            </span>
          </p>
          <p>Controls: WASD / Arrows</p>
        </section>
      </aside>

      <main>
        <div className="playfield">
          <div className="hud">
            <div>
              <span className="label">Mode</span>
              <strong>{matchMeta?.mode?.label || '—'}</strong>
            </div>
            <div>
              <span className="label">Difficulty</span>
              <strong>{matchMeta?.difficulty?.label || '—'}</strong>
            </div>
            <div>
              <span className="label">Room</span>
              <strong>{matchMeta?.roomId || '—'}</strong>
            </div>
          </div>
          <canvas ref={canvasRef} width={mapSize.width} height={mapSize.height} />
          {showCountdownOverlay && countdownLabel !== null && (
            <div className={`countdown-overlay ${goFlash ? 'go' : ''}`}>
              <span>{countdownLabel}</span>
            </div>
          )}
          <div className="scoreboard">
            {sortedScores.map((player, index) => {
              const displayName = player.name ?? '—'
              const rowKey = player.id ?? `${displayName}-${index}`
              return (
                <div key={rowKey} className={`score-row ${player.id === localPlayerId ? 'me' : ''}`}>
                  <div className="score-meta">
                    <img
                      src={avatarSrcForPlayer(player.id, player.slot ?? 0)}
                      alt={`${displayName} avatar`}
                    />
                    <span>{displayName}</span>
                  </div>
                  <strong>{player.score}</strong>
                </div>
              )
            })}
          </div>
          {toast && <div className="toast">{toast}</div>}
        </div>
      </main>
    </div>
  )
}

export default App
