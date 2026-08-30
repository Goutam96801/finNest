import Typo from '@/components/Typo'
import {
  AudioModule,
  RecordingPresets,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio'
import { Check, Microphone, Trash } from 'phosphor-react-native'
import React, { useEffect, useRef, useState } from 'react'
import { Animated, TouchableOpacity, View } from 'react-native'

const MAX_BARS = 27
const METER_FLOOR_DB = -55
const BAR_MAX_HEIGHT = 28
const STATE_POLL_INTERVAL_MS = 90

const RECORDING_OPTIONS = {
  ...RecordingPresets.HIGH_QUALITY,
  isMeteringEnabled: true,
}

export type VoiceRecorderBarProps = {
  transcribe: (fileUri: string) => Promise<string>
  onTranscribed: (text: string) => void
  onCancel: () => void
  disabled?: boolean
}

type Phase = 'preparing' | 'recording' | 'processing' | 'error'

function normalizeMetering(db: number | undefined) {
  if (db === undefined || Number.isNaN(db)) return 0.04
  const clamped = Math.max(METER_FLOOR_DB, Math.min(0, db))
  return (clamped - METER_FLOOR_DB) / (0 - METER_FLOOR_DB)
}

function formatDuration(ms: number) {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

function RecordingDot() {
  const opacity = useRef(new Animated.Value(1)).current
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.25, duration: 650, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 650, useNativeDriver: true }),
      ])
    )
    pulse.start()
    return () => pulse.stop()
  }, [opacity])
  return <Animated.View className="h-2 w-2 rounded-full bg-red-500" style={{ opacity }} />
}

export default function VoiceRecorderBar({ transcribe, onTranscribed, onCancel, disabled }: VoiceRecorderBarProps) {
  const recorder = useAudioRecorder(RECORDING_OPTIONS)
  const recorderState = useAudioRecorderState(recorder, STATE_POLL_INTERVAL_MS)

  const [phase, setPhase] = useState<Phase>('preparing')
  const [levels, setLevels] = useState<number[]>(() => new Array(MAX_BARS).fill(0.04))
  const mountedRef = useRef(true)
  const startedRef = useRef(false)

  // Start recording exactly once per mount.
  useEffect(() => {
    mountedRef.current = true
    if (startedRef.current) return
    startedRef.current = true

    let cancelled = false

    const start = async () => {
      try {
        const permission = await AudioModule.requestRecordingPermissionsAsync()
        if (!permission.granted) {
          if (!cancelled) onCancel()
          return
        }
        await AudioModule.setAudioModeAsync({
          allowsRecording: true,
          playsInSilentMode: true,
        })
        if (cancelled) return

        await recorder.prepareToRecordAsync()
        if (cancelled) return

        recorder.record()
        if (mountedRef.current) setPhase('recording')
      } catch (err) {
        console.warn('Failed to start recording', err)
        if (mountedRef.current) setPhase('error')
      }
    }

    void start()

    return () => {
      mountedRef.current = false
      cancelled = true
      if (recorder.isRecording) {
        recorder.stop().catch(() => {})
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Feed the waveform off the recorder's live metering value.
  useEffect(() => {
    if (phase !== 'recording') return
    setLevels((current) => [...current.slice(1), normalizeMetering(recorderState.metering)])
  }, [recorderState.metering, phase])

  const stopAndTranscribe = async () => {
    if (phase !== 'recording') return
    setPhase('processing')
    try {
      await recorder.stop()
      const uri = recorder.uri
      if (!uri) throw new Error('No recording URI')

      const text = (await transcribe(uri)).trim()
      if (!mountedRef.current) return
      if (!text) {
        onCancel()
        return
      }
      onTranscribed(text)
    } catch (err) {
      console.warn('Transcription failed', err)
      if (mountedRef.current) setPhase('error')
    }
  }

  const cancelRecording = async () => {
    try {
      if (recorder.isRecording) await recorder.stop()
    } catch {
      // ignore — best-effort cleanup
    }
    onCancel()
  }

  if (phase === 'error') {
    return (
      <View className="min-h-[54px] flex-row items-center justify-between rounded-[20px] bg-neutral-800 px-4">
        <Typo size={13} className="flex-1 text-neutral-400">Couldn't transcribe that.</Typo>
        <TouchableOpacity
          accessibilityLabel="Dismiss"
          onPress={onCancel}
          className="h-9 w-9 items-center justify-center rounded-full bg-neutral-700"
        >
          <Trash size={16} color="#f5f5f5" weight="bold" />
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <View className="min-h-[54px] flex-row items-center gap-1 rounded-[20px] bg-neutral-800 pl-2 pr-1.5">
      <TouchableOpacity
        accessibilityLabel="Cancel recording"
        onPress={cancelRecording}
        disabled={disabled}
        className="h-[42px] w-[42px] items-center justify-center rounded-full"
      >
        <Trash size={18} color="#a3a3a3" weight="bold" />
      </TouchableOpacity>

      <View className="min-w-0 flex-1 flex-row items-center gap-2 px-1">
        {phase === 'recording' ? <RecordingDot /> : <View className="h-2 w-2 rounded-full bg-neutral-600" />}
        <View className="flex-1 flex-row items-center gap-[3px]" style={{ height: BAR_MAX_HEIGHT }}>
          {levels.map((level, index) => (
            <View
              key={index}
              style={{
                flex: 1,
                borderRadius: 2,
                height: Math.max(3, level * BAR_MAX_HEIGHT),
                backgroundColor: phase === 'processing' ? '#525252' : '#a3e635',
              }}
            />
          ))}
        </View>
        <Typo size={12} className="text-neutral-400">
          {formatDuration(recorderState.durationMillis ?? 0)}
        </Typo>
      </View>

      <TouchableOpacity
        accessibilityLabel={phase === 'processing' ? 'Transcribing' : 'Stop recording'}
        onPress={stopAndTranscribe}
        disabled={disabled || phase !== 'recording'}
        className={`h-[42px] w-[42px] items-center justify-center rounded-full ${phase === 'recording' ? 'bg-lime-400' : 'bg-neutral-700'}`}
      >
        {phase === 'processing' || phase === 'preparing' ? (
          <Microphone size={18} color="#737373" weight="bold" />
        ) : (
          <Check size={20} color="#171717" weight="bold" />
        )}
      </TouchableOpacity>
    </View>
  )
}