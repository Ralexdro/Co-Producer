// TECHNICAL SPIKE ONLY — minimal 140 BPM pattern model, clock, renderer, and verifier.
// No microphone, UI, persistence, or production Co-Producer behavior is included here.

type PatternTrack = {
  id: string
  asset: AudioTrackAsset
  pattern: string
}

@component
export class CoProducerPattern140Spike extends BaseScriptComponent {
  @input kick: AudioTrackAsset
  @input snare: AudioTrackAsset
  @input bass: AudioTrackAsset
  @input crash: AudioTrackAsset
  @input remoteMedia: RemoteMediaModule
  @input renderedPlayer: AudioComponent

  private static readonly BPM = 140
  private static readonly STEPS = 16
  private static readonly STEP_SECONDS = 60 / CoProducerPattern140Spike.BPM / 4
  private static readonly LOOP_SECONDS = CoProducerPattern140Spike.STEP_SECONDS * CoProducerPattern140Spike.STEPS
  private tracks: PatternTrack[] = []
  private voices: Map<string, AudioComponent[]> = new Map<string, AudioComponent[]>()
  private voiceCursor: Map<string, number> = new Map<string, number>()
  private running = false
  private startTime = 0
  private nextAbsoluteStep = 0
  private automaticComparisonStop = true
  private renderedTrack: AudioTrackAsset | null = null
  private maximumDispatchLatenessMs = 0

  onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => this.start())
    this.createEvent("UpdateEvent").bind(() => this.updateClock())
    this.createEvent("TapEvent").bind(() => this.toggleLivePlayback())
  }

  private start(): void {
    // This is the single structured source of truth shared by live playback and PCM rendering.
    this.tracks = [
      { id: "Kick", asset: this.kick, pattern: "1000101000100001" },
      { id: "Snare", asset: this.snare, pattern: "0010000010001000" },
      { id: "Bass", asset: this.bass, pattern: "0010000010001000" },
      { id: "Crash", asset: this.crash, pattern: "0000000000001000" },
    ]
    if (!this.validateComposition()) return
    this.createVoicePools()
    this.renderPatternToWav()
  }

  private validateComposition(): boolean {
    for (let i = 0; i < this.tracks.length; i++) {
      const track = this.tracks[i]
      if (track.pattern.length !== CoProducerPattern140Spike.STEPS || !/^[01]+$/.test(track.pattern)) {
        console.error("[Pattern140] Invalid pattern for " + track.id)
        return false
      }
      if (!track.asset || !(track.asset.control as FileAudioTrackProvider)) {
        console.error("[Pattern140] " + track.id + " does not expose FileAudioTrackProvider")
        return false
      }
    }
    console.log("[Pattern140] Data validated: BPM=140, stepSeconds=" + CoProducerPattern140Spike.STEP_SECONDS + ", loopSeconds=" + CoProducerPattern140Spike.LOOP_SECONDS + ", expected events: S1=Kick; S3=Snare+Bass; S5=Kick; S6=none; S9=Snare+Bass; S13=Snare+Bass+Crash; S16=Kick")
    return true
  }

  private createVoicePools(): void {
    // Round-robin pools allow overlapping tails within a track as well as across tracks.
    for (let t = 0; t < this.tracks.length; t++) {
      const track = this.tracks[t]
      const pool: AudioComponent[] = []
      for (let voice = 0; voice < 8; voice++) {
        const object = global.scene.createSceneObject("Pattern140_" + track.id + "_Voice_" + voice)
        object.setParent(this.sceneObject)
        const component = object.createComponent("Component.AudioComponent") as AudioComponent
        component.audioTrack = track.asset
        component.playbackMode = Audio.PlaybackMode.LowLatency
        pool.push(component)
      }
      this.voices.set(track.id, pool)
      this.voiceCursor.set(track.id, 0)
    }
  }

  private startLivePlayback(stopForComparison: boolean): void {
    this.stopLivePlayback()
    this.startTime = getTime()
    this.nextAbsoluteStep = 0
    this.running = true
    this.automaticComparisonStop = stopForComparison
    this.maximumDispatchLatenessMs = 0
    this.triggerDueSteps()
    console.log("[Pattern140] Live sequencer started; tap toggles start/stop after the automated comparison.")
  }

  private stopLivePlayback(): void {
    this.running = false
  }

  private toggleLivePlayback(): void {
    if (this.running) {
      this.stopLivePlayback()
      console.log("[Pattern140] Live sequencer stopped by tap")
    } else {
      this.startLivePlayback(false)
    }
  }

  private updateClock(): void {
    if (!this.running) return
    if (this.automaticComparisonStop && getTime() - this.startTime >= CoProducerPattern140Spike.LOOP_SECONDS * 2) {
      this.stopLivePlayback()
      console.log("[Pattern140] Two complete live loops finished; max dispatch lateness=" + this.maximumDispatchLatenessMs + "ms. Allowing sample tails to clear before independent rendered-WAV playback")
      const playback = this.createEvent("DelayedCallbackEvent")
      playback.bind(() => {
        if (this.renderedTrack) {
          this.renderedPlayer.audioTrack = this.renderedTrack
          this.renderedPlayer.playbackMode = Audio.PlaybackMode.LowLatency
          this.renderedPlayer.play(1)
          console.log("[Pattern140] Independently playing one rendered 16-step WAV loop")
        }
      })
      playback.reset(0.75)
      return
    }
    this.triggerDueSteps()
  }

  private triggerDueSteps(): void {
    const elapsed = getTime() - this.startTime
    // Compare against absolute schedule positions. A delayed frame catches up without clock drift.
    while (this.nextAbsoluteStep * CoProducerPattern140Spike.STEP_SECONDS <= elapsed + 0.000001) {
      const latenessMs = Math.max(0, Math.round((elapsed - this.nextAbsoluteStep * CoProducerPattern140Spike.STEP_SECONDS) * 1000))
      this.maximumDispatchLatenessMs = Math.max(this.maximumDispatchLatenessMs, latenessMs)
      const step = this.nextAbsoluteStep % CoProducerPattern140Spike.STEPS
      const loop = Math.floor(this.nextAbsoluteStep / CoProducerPattern140Spike.STEPS) + 1
      const triggered: string[] = []
      for (let t = 0; t < this.tracks.length; t++) {
        const track = this.tracks[t]
        if (track.pattern.charAt(step) === "1") {
          this.playVoice(track.id)
          triggered.push(track.id)
        }
      }
      console.log("[Pattern140] live loop=" + loop + " step=" + (step + 1) + " lateMs=" + latenessMs + " triggers=" + (triggered.length ? triggered.join("+") : "none"))
      this.nextAbsoluteStep++
    }
  }

  private playVoice(trackId: string): void {
    const pool = this.voices.get(trackId)!
    const cursor = this.voiceCursor.get(trackId)!
    const voice = pool[cursor]
    this.voiceCursor.set(trackId, (cursor + 1) % pool.length)
    voice.play(1)
  }

  private renderPatternToWav(): void {
    const firstProvider = this.tracks[0].asset.control as FileAudioTrackProvider
    const sampleRate = Math.floor(firstProvider.sampleRate)
    const totalSamples = Math.round(CoProducerPattern140Spike.LOOP_SECONDS * sampleRate)
    const mix = new Float32Array(totalSamples)
    const sourceById = new Map<string, Float32Array>()
    let truncatedTailSamples = 0

    for (let t = 0; t < this.tracks.length; t++) {
      const track = this.tracks[t]
      const provider = track.asset.control as FileAudioTrackProvider
      const source = this.readAllMono(provider)
      const pcm = Math.floor(provider.sampleRate) === sampleRate ? source : this.resample(source, provider.sampleRate, sampleRate)
      sourceById.set(track.id, pcm)
    }

    for (let t = 0; t < this.tracks.length; t++) {
      const track = this.tracks[t]
      const source = sourceById.get(track.id)!
      for (let step = 0; step < CoProducerPattern140Spike.STEPS; step++) {
        if (track.pattern.charAt(step) !== "1") continue
        const destinationStart = Math.round(step * CoProducerPattern140Spike.STEP_SECONDS * sampleRate)
        const writable = Math.min(source.length, mix.length - destinationStart)
        for (let i = 0; i < writable; i++) mix[destinationStart + i] += source[i]
        truncatedTailSamples += source.length - writable
      }
    }

    const peakBeforeNormalization = this.peak(mix)
    const gain = peakBeforeNormalization > 0.95 ? 0.95 / peakBeforeNormalization : 1
    for (let i = 0; i < mix.length; i++) mix[i] *= gain
    const wav = this.makeMonoPcm16Wav(mix, sampleRate)
    console.log("[Pattern140] Rendered same data: samples=" + mix.length + ", rate=" + sampleRate + ", bytes=" + wav.length + ", peakBefore=" + peakBeforeNormalization + ", gain=" + gain + ", truncatedTailSamples=" + truncatedTailSamples + ". Boundary is exactly one 16-step loop; overflow tails are deliberately truncated.")

    this.remoteMedia.loadResourceAsAudioTrackAsset(
      DynamicResource.createWithBuffer(wav),
      (track) => {
        this.renderedTrack = track
        console.log("[Pattern140] In-memory PCM16 WAV reloaded successfully and is ready for independent playback")
        // Do not let synchronous decoding/loading time become part of the musical clock.
        const warmup = this.createEvent("DelayedCallbackEvent")
        warmup.bind(() => this.startLivePlayback(true))
        warmup.reset(0.25)
      },
      (error) => console.error("[Pattern140] Rendered WAV reload failed: " + error),
    )
  }

  private readAllMono(provider: FileAudioTrackProvider): Float32Array {
    const total = Math.max(0, Math.ceil(provider.duration * provider.sampleRate))
    const result = new Float32Array(total)
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

  private resample(source: Float32Array, sourceRate: number, targetRate: number): Float32Array {
    const output = new Float32Array(Math.round(source.length * targetRate / sourceRate))
    for (let i = 0; i < output.length; i++) {
      const at = i * sourceRate / targetRate
      const left = Math.floor(at)
      const fraction = at - left
      output[i] = left < source.length ? source[left] * (1 - fraction) + (left + 1 < source.length ? source[left + 1] * fraction : 0) : 0
    }
    return output
  }

  private peak(samples: Float32Array): number {
    let peak = 0
    for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]))
    return peak
  }

  private makeMonoPcm16Wav(samples: Float32Array, sampleRate: number): Uint8Array {
    const bytes = new Uint8Array(44 + samples.length * 2)
    const view = new DataView(bytes.buffer)
    const writeTag = (offset: number, tag: string) => { for (let i = 0; i < tag.length; i++) view.setUint8(offset + i, tag.charCodeAt(i)) }
    writeTag(0, "RIFF"); view.setUint32(4, bytes.length - 8, true); writeTag(8, "WAVE"); writeTag(12, "fmt ")
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true)
    view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); writeTag(36, "data"); view.setUint32(40, samples.length * 2, true)
    for (let i = 0; i < samples.length; i++) { const x = Math.max(-1, Math.min(1, samples[i])); view.setInt16(44 + i * 2, x < 0 ? x * 32768 : x * 32767, true) }
    return bytes
  }
}
