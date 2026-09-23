export interface SpeechSettings {
  region: string
  voice: string
  locale: string
  normalRate: string
  slowRate: string
  outputFormat: string
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function assertRate(value: string): string {
  if (!/^[+-]?\d{1,3}%$/.test(value)) throw new Error('Invalid speech rate configuration.')
  return value
}

export function getSpeechSettings(overrides: Record<string, unknown> = {}): SpeechSettings {
  const voice = typeof overrides.voice === 'string' ? overrides.voice : Deno.env.get('AZURE_SPEECH_VOICE') ?? 'en-US-JennyNeural'
  const locale = typeof overrides.locale === 'string' ? overrides.locale : Deno.env.get('AZURE_SPEECH_LOCALE') ?? 'en-US'
  const normalRate = typeof overrides.normalRate === 'string' ? overrides.normalRate : Deno.env.get('AZURE_SPEECH_NORMAL_RATE') ?? '0%'
  const slowRate = typeof overrides.slowRate === 'string' ? overrides.slowRate : Deno.env.get('AZURE_SPEECH_SLOW_RATE') ?? '-20%'
  const region = Deno.env.get('AZURE_SPEECH_REGION')
  if (!region) throw new Error('Azure Speech is not configured.')
  return {
    region,
    voice,
    locale,
    normalRate: assertRate(normalRate),
    slowRate: assertRate(slowRate),
    outputFormat: 'audio-24khz-48kbitrate-mono-mp3',
  }
}

export async function synthesizeSpeech(text: string, rate: string, settings: SpeechSettings): Promise<ArrayBuffer> {
  const key = Deno.env.get('AZURE_SPEECH_KEY')
  if (!key) throw new Error('Azure Speech is not configured.')
  const ssml = `<speak version="1.0" xml:lang="${escapeXml(settings.locale)}"><voice name="${escapeXml(settings.voice)}"><prosody rate="${escapeXml(rate)}">${escapeXml(text)}</prosody></voice></speak>`
  const response = await fetch(`https://${settings.region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': key,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': settings.outputFormat,
      'User-Agent': 'BarretoEnglishJourney',
    },
    body: ssml,
  })
  if (!response.ok) throw new Error(`Azure Speech request failed (${response.status}).`)
  return response.arrayBuffer()
}
