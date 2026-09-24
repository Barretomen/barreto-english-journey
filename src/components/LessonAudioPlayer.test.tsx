import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LessonAudioPlayer } from './LessonAudioPlayer'
import { getLessonAudioUrl } from '../features/lessons/repository'

vi.mock('../features/lessons/repository', () => ({
  getLessonAudioUrl: vi.fn()
}))

class FakeAudio {
  paused = true
  constructor(public src: string) {}
  play = vi.fn(() => { this.paused = false; return Promise.resolve() })
  pause = vi.fn(() => { this.paused = true })
  addEventListener = vi.fn()
}

const mockedGetUrl = vi.mocked(getLessonAudioUrl)

describe('LessonAudioPlayer', () => {
  beforeEach(() => {
    vi.stubGlobal('Audio', FakeAudio)
    mockedGetUrl.mockReset()
    mockedGetUrl.mockResolvedValue('https://example.test/signed-audio.mp3')
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('shows an unavailable state without requesting a URL', () => {
    render(<LessonAudioPlayer blockId={9} status="missing" />)
    expect(screen.getByText('Áudio ainda não preparado.')).toBeInTheDocument()
    expect(mockedGetUrl).not.toHaveBeenCalled()
  })

  it('distinguishes generating and failed states', () => {
    const { rerender } = render(<LessonAudioPlayer blockId={9} status="generating" />)
    expect(screen.getByText('Áudio sendo preparado.')).toBeInTheDocument()
    rerender(<LessonAudioPlayer blockId={9} status="failed" />)
    expect(screen.getByText(/precisa ser revisado/)).toBeInTheDocument()
  })

  it('loads separate signed URLs for normal and slow audio', async () => {
    const user = userEvent.setup()
    render(<LessonAudioPlayer blockId={9} status="ready" />)
    await user.click(screen.getByRole('button', { name: 'Normal' }))
    await waitFor(() => expect(mockedGetUrl).toHaveBeenCalledWith(9, 'normal'))
    await user.click(screen.getByRole('button', { name: 'Devagar' }))
    await waitFor(() => expect(mockedGetUrl).toHaveBeenCalledWith(9, 'slow'))
  })

  it('offers a retry when a signed URL cannot be loaded', async () => {
    mockedGetUrl.mockRejectedValueOnce(new Error('expired'))
    const user = userEvent.setup()
    render(<LessonAudioPlayer blockId={9} status="ready" />)
    await user.click(screen.getByRole('button', { name: 'Normal' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar o áudio.')
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    await waitFor(() => expect(mockedGetUrl).toHaveBeenCalledTimes(2))
  })
})
