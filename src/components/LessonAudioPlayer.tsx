import { useEffect, useRef, useState } from 'react'
import { Headphones, LoaderCircle, Pause, Turtle } from 'lucide-react'
import { getLessonAudioUrl } from '../features/lessons/repository'
import type { AudioStatus, AudioVariant } from '../types/domain'

let activeAudio: HTMLAudioElement | null = null

type PlayerState = 'idle' | 'loading' | 'playing' | 'paused' | 'error'

interface LessonAudioPlayerProps {
  blockId: number
  status: AudioStatus
}

export function LessonAudioPlayer({ blockId, status }: LessonAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const variantRef = useRef<AudioVariant | null>(null)
  const [playerState, setPlayerState] = useState<PlayerState>('idle')
  const [message, setMessage] = useState('')

  useEffect(() => () => {
    if (activeAudio === audioRef.current) activeAudio = null
    audioRef.current?.pause()
  }, [])

  async function toggle(variant: AudioVariant) {
    if (status !== 'ready') return
    const current = audioRef.current
    if (current && variantRef.current === variant) {
      if (!current.paused) {
        current.pause()
        setPlayerState('paused')
      } else {
        await current.play()
        activeAudio = current
        setPlayerState('playing')
      }
      return
    }

    setPlayerState('loading')
    setMessage('')
    variantRef.current = variant
    try {
      activeAudio?.pause()
      const url = await getLessonAudioUrl(blockId, variant)
      const audio = new Audio(url)
      audioRef.current?.pause()
      audioRef.current = audio
      audio.addEventListener('ended', () => setPlayerState('idle'), { once: true })
      audio.addEventListener('error', () => {
        setMessage('Não foi possível carregar o áudio.')
        setPlayerState('error')
      }, { once: true })
      await audio.play()
      activeAudio = audio
      setPlayerState('playing')
    } catch {
      setMessage('Não foi possível carregar o áudio.')
      setPlayerState('error')
    }
  }

  if (status !== 'ready') {
    return <p className="audio-unavailable" role="status">Áudio indisponível.</p>
  }

  return <div className="lesson-audio" aria-label="Controles de áudio">
    <button type="button" className="audio-button" aria-pressed={variantRef.current === 'normal' && playerState === 'playing'} disabled={playerState === 'loading'} onClick={() => void toggle('normal')}>
      {playerState === 'loading' ? <LoaderCircle className="is-spinning" aria-hidden="true" /> : variantRef.current === 'normal' && playerState === 'playing' ? <Pause aria-hidden="true" /> : <Headphones aria-hidden="true" />}
      Normal
    </button>
    <button type="button" className="audio-button" aria-pressed={variantRef.current === 'slow' && playerState === 'playing'} disabled={playerState === 'loading'} onClick={() => void toggle('slow')}>
      {variantRef.current === 'slow' && playerState === 'playing' ? <Pause aria-hidden="true" /> : <Turtle aria-hidden="true" />}
      Devagar
    </button>
    {message ? <span className="audio-error" role="alert">{message} <button type="button" onClick={() => variantRef.current && void toggle(variantRef.current)}>Tentar novamente</button></span> : null}
  </div>
}
