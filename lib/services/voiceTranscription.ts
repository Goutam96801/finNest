import { supabase } from '@/lib/supabase'

export async function transcribeAudio(fileUri: string): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session?.access_token) {
    throw new Error('Not signed in')
  }

  const formData = new FormData()
  formData.append('audio', {
    uri: fileUri,
    name: 'recording.m4a',
    type: 'audio/m4a',
  } as unknown as Blob)

  const response = await fetch(
    `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/transcribe`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
      body: formData,
    }
  )

  if (!response.ok) {
    throw new Error('Transcription request failed')
  }

  const data = await response.json()
  return typeof data.text === 'string' ? data.text : ''
}