import { corsHeaders, json } from '../_shared/cors.ts'
import { getAuthedUserClient } from '../_shared/auth.ts'

const GROQ_TRANSCRIPTION_URL = 'https://api.groq.com/openai/v1/audio/transcriptions'
const MAX_AUDIO_BYTES = 25 * 1024 * 1024 // Whisper's file size ceiling

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  try {
    // Reuses your existing auth pattern — only signed-in users can transcribe.
    await getAuthedUserClient(req)

    const groqKey = Deno.env.get('GROQ_API_KEY')
    if (!groqKey) {
      throw new Error('Server not configured: missing GROQ_API_KEY')
    }

    const incomingForm = await req.formData()
    const audioFile = incomingForm.get('audio')

    if (!audioFile || !(audioFile instanceof File)) {
      return json({ error: 'Missing audio file' }, 400)
    }

    if (audioFile.size === 0) {
      return json({ error: 'Empty audio file' }, 400)
    }

    if (audioFile.size > MAX_AUDIO_BYTES) {
      return json({ error: 'Audio file too large (max 25MB)' }, 413)
    }

    // Groq exposes an OpenAI-compatible /audio/transcriptions endpoint —
    // same multipart shape, just a different bearer key and base URL.
    const upstreamForm = new FormData()
    upstreamForm.append('file', audioFile, audioFile.name || 'recording.m4a')
    upstreamForm.append('model', 'whisper-large-v3-turbo')
    upstreamForm.append('response_format', 'json')

    const upstreamResponse = await fetch(GROQ_TRANSCRIPTION_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${groqKey}`,
      },
      body: upstreamForm,
    })

    if (!upstreamResponse.ok) {
      const errorBody = await upstreamResponse.text().catch(() => '')
      console.error('Groq transcription failed', upstreamResponse.status, errorBody)
      return json({ error: 'Transcription provider error' }, 502)
    }

    const result = await upstreamResponse.json()
    const text = typeof result?.text === 'string' ? result.text : ''

    return json({ text })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    const status = message === 'Missing authorization' || message === 'Unauthorized' ? 401 : 500
    console.error('transcribe function error', message)
    return json({ error: message }, status)
  }
})