// TECHNICAL SPIKE ONLY — remove this file and its SpikeAudioProbe scene object together.
// This intentionally does not use the microphone or attempt runtime file I/O.

@component
export class CoProducerAudioExportSpike extends BaseScriptComponent {
  @input gasTrack: AudioTrackAsset
  @input heartbeatTrack: AudioTrackAsset
  @input remoteMedia: RemoteMediaModule
  @input generatedPlayer: AudioComponent
  @input editorWrittenTrack: AudioTrackAsset
  @input editorWrittenPlayer: AudioComponent

  onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => this.run())
  }

  private run(): void {
    const gas = this.gasTrack.control as FileAudioTrackProvider
    const heartbeat = this.heartbeatTrack.control as FileAudioTrackProvider
    if (!gas || !heartbeat) {
      console.error("[CoProducerSpike] Imported tracks do not expose FileAudioTrackProvider")
      return
    }

    const sampleRate = Math.floor(gas.sampleRate)
    if (sampleRate !== Math.floor(heartbeat.sampleRate)) {
      console.error("[CoProducerSpike] Sample-rate mismatch: gas=" + gas.sampleRate + ", heartbeat=" + heartbeat.sampleRate)
      return
    }

    // Fixed, digital sequence: gas from t=0; heartbeat begins at t=0.50s.
    const durationSeconds = Math.min(3, gas.duration)
    const gasPcm = this.readMono(gas, durationSeconds)
    const heartbeatPcm = this.readMono(heartbeat, durationSeconds - 0.5)
    const mix = new Float32Array(gasPcm.length)
    mix.set(gasPcm)
    const heartbeatOffset = Math.floor(sampleRate * 0.5)
    for (let i = 0; i < heartbeatPcm.length && i + heartbeatOffset < mix.length; i++) {
      mix[i + heartbeatOffset] += heartbeatPcm[i] * 0.8
    }
    this.normalize(mix)

    console.log("[CoProducerSpike] PCM read OK: gas=" + gasPcm.length + ", heartbeat=" + heartbeatPcm.length + ", rate=" + sampleRate + ", gasPeak=" + this.peak(gasPcm) + ", heartbeatPeak=" + this.peak(heartbeatPcm) + ", mixPeak=" + this.peak(mix))

    // This produces a valid PCM16 WAV byte buffer in Lens memory, not a persisted runtime file.
    const wav = this.makeMonoPcm16Wav(mix, sampleRate)
    const resource = DynamicResource.createWithBuffer(wav)
    this.remoteMedia.loadResourceAsAudioTrackAsset(
      resource,
      (generatedTrack) => {
        this.generatedPlayer.audioTrack = generatedTrack
        this.generatedPlayer.playbackMode = Audio.PlaybackMode.LowPower
        this.generatedPlayer.play(1)
        console.log("[CoProducerSpike] Generated WAV reloaded and played independently: bytes=" + wav.length)
        const editorPlayback = this.createEvent("DelayedCallbackEvent")
        editorPlayback.bind(() => {
          this.editorWrittenPlayer.audioTrack = this.editorWrittenTrack
          this.editorWrittenPlayer.playbackMode = Audio.PlaybackMode.LowPower
          this.editorWrittenPlayer.play(1)
          console.log("[CoProducerSpike] Persisted editor-written CoProducerTestMix.wav played as an independent FileAudioTrack")
        })
        editorPlayback.reset(3.25)
      },
      (error) => console.error("[CoProducerSpike] Generated WAV reload failed: " + error),
    )
  }

  private readMono(provider: FileAudioTrackProvider, seconds: number): Float32Array {
    const count = Math.max(0, Math.floor(seconds * provider.sampleRate))
    const result = new Float32Array(count)
    provider.position = 0
    provider.loops = 1
    let offset = 0
    while (offset < result.length) {
      const wanted = Math.min(provider.maxFrameSize, result.length - offset)
      const frame = new Float32Array(wanted)
      const shape = provider.getAudioBuffer(frame, wanted)
      const read = Math.min(wanted, Math.max(0, Math.floor(shape.x)))
      if (read === 0) break
      result.set(frame.subarray(0, read), offset)
      offset += read
    }
    return result
  }

  private normalize(samples: Float32Array): void {
    const peak = this.peak(samples)
    if (peak > 0.98) {
      const multiplier = 0.98 / peak
      for (let i = 0; i < samples.length; i++) samples[i] *= multiplier
    }
  }

  private peak(samples: Float32Array): number {
    let peak = 0
    for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]))
    return peak
  }

  private makeMonoPcm16Wav(samples: Float32Array, sampleRate: number): Uint8Array {
    const bytes = new Uint8Array(44 + samples.length * 2)
    const view = new DataView(bytes.buffer)
    const writeTag = (offset: number, tag: string) => {
      for (let i = 0; i < tag.length; i++) view.setUint8(offset + i, tag.charCodeAt(i))
    }
    writeTag(0, "RIFF")
    view.setUint32(4, bytes.length - 8, true)
    writeTag(8, "WAVE")
    writeTag(12, "fmt ")
    view.setUint32(16, 16, true)
    view.setUint16(20, 1, true)
    view.setUint16(22, 1, true)
    view.setUint32(24, sampleRate, true)
    view.setUint32(28, sampleRate * 2, true)
    view.setUint16(32, 2, true)
    view.setUint16(34, 16, true)
    writeTag(36, "data")
    view.setUint32(40, samples.length * 2, true)
    for (let i = 0; i < samples.length; i++) {
      const sample = Math.max(-1, Math.min(1, samples[i]))
      view.setInt16(44 + i * 2, sample < 0 ? sample * 32768 : sample * 32767, true)
    }
    return bytes
  }
}
