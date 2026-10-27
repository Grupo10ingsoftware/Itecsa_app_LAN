import { useCallback, useEffect, useRef } from 'react'

// Browser interaction unlocks the existing brief cue. No message content enters audio.
export function useMessageSound() {
  const sound = useRef(null)
  useEffect(() => {
    function unlock() {
      const AudioContext = window.AudioContext || window.webkitAudioContext
      if (!AudioContext) return
      try { sound.current ??= new AudioContext(); void sound.current.resume().catch(() => {}) } catch { /* Visual notice remains available. */ }
    }
    document.addEventListener('pointerdown', unlock)
    document.addEventListener('keydown', unlock)
    return () => {
      document.removeEventListener('pointerdown', unlock)
      document.removeEventListener('keydown', unlock)
      void sound.current?.close().catch(() => {})
      sound.current = null
    }
  }, [])
  return useCallback(() => {
    const context = sound.current
    if (context?.state !== 'running') return
    const oscillator = context.createOscillator(), gain = context.createGain()
    oscillator.connect(gain); gain.connect(context.destination)
    oscillator.frequency.setValueAtTime(880, context.currentTime)
    oscillator.frequency.setValueAtTime(1174, context.currentTime + .1)
    gain.gain.setValueAtTime(0, context.currentTime)
    gain.gain.linearRampToValueAtTime(.06, context.currentTime + .015)
    gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + .28)
    oscillator.start(); oscillator.stop(context.currentTime + .3)
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect() }
  }, [])
}
