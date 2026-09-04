import {BackPlate} from "SpectaclesUIKit.lspkg/Scripts/BackPlate"
import {RectangleButton} from "SpectaclesUIKit.lspkg/Scripts/Components/Button/RectangleButton"
import {ElementContent} from "SpectaclesUIKit.lspkg/Scripts/Components/Content/ElementContent"
import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider"

type LibraryEntry = { id: string; category: string; name: string; displayName: string; asset: AudioTrackAsset }
type VoiceSlot = { object: SceneObject; audio: AudioComponent }
type Channel = { id: string; name: string; asset: AudioTrackAsset; steps: boolean[]; voices: VoiceSlot[]; voiceCursor: number }
type Composition = { bpm: number; channels: Channel[] }

const sample = (id: string, category: string, name: string, asset: AudioTrackAsset, displayName: string = name): LibraryEntry => ({
  id, category, name, displayName, asset,
})

const VINYL_PREFAB = requireAsset("../Decor/Vinilo_simple.fbx") as ObjectPrefab
const SPEAKER_PREFAB = requireAsset("../Decor/Speaker_simple.fbx") as ObjectPrefab
const AURORA_MATERIAL = requireAsset("../Materials/CoProducerAurora.mat") as Material

// Production sample-library data. It is intentionally separate from playback and UI code.
const LIBRARY: LibraryEntry[] = [
  sample("bell-cowbell-3", "Bell", "Cowbell 3", requireAsset("../App samples/Bell/Cowbell 3.wav") as AudioTrackAsset),
  sample("bell-cowbell-4", "Bell", "Cowbell 4", requireAsset("../App samples/Bell/Cowbell 4.wav") as AudioTrackAsset),
  sample("bell-synth-a5", "Bell", "Synth Bell A5", requireAsset("../App samples/Bell/Synth Bell - A5.wav") as AudioTrackAsset),
  sample("crash-2", "Crash", "Crash 2", requireAsset("../App samples/Crash/Crash 2.wav") as AudioTrackAsset),
  sample("crash-cymbal-2", "Crash", "Cymbal Crash 2", requireAsset("../App samples/Crash/Cymbal Crash 2.wav") as AudioTrackAsset),
  sample("crash-ds-3", "Crash", "DS Crash 3", requireAsset("../App samples/Crash/DS Crash 3.wav") as AudioTrackAsset),
  sample("crash-splash-1", "Crash", "DS Splash 1", requireAsset("../App samples/Crash/DS Splash 1.wav") as AudioTrackAsset),
  sample("fx-sub-drop", "FX", "Sub Drop", requireAsset("../App samples/FX/Sub Drop.wav") as AudioTrackAsset),
  sample("fx-vinyl-backspin", "FX", "Vinyl Backspin", requireAsset("../App samples/FX/Vinyl Backspin.wav") as AudioTrackAsset),
  sample("hat-chh-3", "Hi-Hat", "CHH 3", requireAsset("../App samples/Hi-Hat/CHH 3.wav") as AudioTrackAsset),
  sample("hat-cymbal-10", "Hi-Hat", "Cymbal CHH 10", requireAsset("../App samples/Hi-Hat/Cymbal CHH 10.wav") as AudioTrackAsset),
  sample("hat-cymbal-14", "Hi-Hat", "Cymbal CHH 14", requireAsset("../App samples/Hi-Hat/Cymbal-CHH-14.wav") as AudioTrackAsset),
  sample("hat-ohh-3", "Hi-Hat", "OHH 3", requireAsset("../App samples/Hi-Hat/OHH-3.wav") as AudioTrackAsset),
  sample("kick-basic", "Kick", "Basic Kick", requireAsset("../App samples/Kick/Basic-Kick.wav") as AudioTrackAsset),
  sample("kick-dnb", "Kick", "DnB Kick", requireAsset("../App samples/Kick/DnB-Kick.wav") as AudioTrackAsset),
  sample("kick-dub", "Kick", "Dub Kick", requireAsset("../App samples/Kick/Dub-Kick-1.wav") as AudioTrackAsset),
  sample("kick-future", "Kick", "Future Kick", requireAsset("../App samples/Kick/Future-Kick-1.wav") as AudioTrackAsset),
  sample("kick-house", "Kick", "House Kick", requireAsset("../App samples/Kick/House-Kick-3.wav") as AudioTrackAsset),
  sample("misc-snap-2", "Misc", "Snap 2", requireAsset("../App samples/Misc/Snap 2.wav") as AudioTrackAsset),
  sample("misc-whoop-1", "Misc", "Whoop 1", requireAsset("../App samples/Misc/unfa Whoop 1.wav") as AudioTrackAsset),
  sample("misc-whoop-2", "Misc", "Whoop 2", requireAsset("../App samples/Misc/unfa Whoop 2.wav") as AudioTrackAsset),
  sample("perc-experimental-2", "Percussion", "Experimental Perc 2", requireAsset("../App samples/Percussion/Experimental Perc 2.wav") as AudioTrackAsset, "Exp Perc 2"),
  sample("snare-future-2", "Snare", "Future Snare 2", requireAsset("../App samples/Snare/Future Snare 2.wav") as AudioTrackAsset),
  sample("snare-hard-1", "Snare", "Hard Snare 1", requireAsset("../App samples/Snare/Hard Snare 1.wav") as AudioTrackAsset),
  sample("snare-punch-2", "Snare", "Punch Snare 2", requireAsset("../App samples/Snare/Punch Snare 2.wav") as AudioTrackAsset),
  sample("snare-trap-1", "Snare", "Trap Snare 1", requireAsset("../App samples/Snare/Trap Snare 1.wav") as AudioTrackAsset),
]

@component
export class CoProducerCore extends BaseScriptComponent {
  private static readonly BPM = 140
  private static readonly STEPS = 16
  private static readonly STEP_SECONDS = 60 / CoProducerCore.BPM / 4
  private static readonly MAX_CHANNELS = 6
  private composition: Composition = { bpm: CoProducerCore.BPM, channels: [] }
  private consoleRoot: SceneObject | null = null
  private libraryRoot: SceneObject | null = null
  private sequencerRoot: SceneObject | null = null
  private playButton: RectangleButton | null = null
  private transportConsoleRotation: quat | null = null
  private vinylRoots: SceneObject[] = []
  private vinylBaseRotations: quat[] = []
  private speakerRoots: SceneObject[] = []
  private speakerBaseScales: vec3[] = []
  private auroraRoot: SceneObject | null = null
  private auroraMeshBuilder: MeshBuilder | null = null
  private vinylRotationRadians = 0
  private speakerPulse = 0
  private playing = false
  private playbackStartTime = 0
  private nextAbsoluteStep = 0

  onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => this.buildConsole())
    this.createEvent("UpdateEvent").bind(() => this.updateSequencer())
  }

  private buildConsole(): void {
    const worldCamera = WorldCameraFinderProvider.getInstance()
    const cameraPosition = worldCamera.getWorldPosition()
    const stationPosition = worldCamera.getForwardPosition(110).add(worldCamera.up().uniformScale(-8))
    this.consoleRoot = this.obj(this.sceneObject, "CoProducerConsole")
    this.consoleRoot.getTransform().setWorldPosition(stationPosition)
    this.consoleRoot.getTransform().setWorldRotation(quat.lookAt(cameraPosition.sub(stationPosition), worldCamera.up()))
    this.consoleRoot.createComponent("Component.Canvas")
    this.makePlate(this.consoleRoot, "ConsoleBacking", new vec3(0, 4, 0), new vec2(146, 78), "dark")
    this.addText(this.consoleRoot, "LibraryTitle", "SAMPLE LIBRARY", new vec3(-49, 38, 0.8), 56, 38)
    this.addText(this.consoleRoot, "SequencerTitle", "SEQUENCER  •  140 BPM", new vec3(28, 38, 0.7), 34)
    this.makePlate(this.consoleRoot, "SequencerHeaderMask", new vec3(28, 38, 0.72), new vec2(68, 6.5), "dark")
    this.addText(this.consoleRoot, "SequencerHeader", "SEQUENCER", new vec3(28, 38, 0.8), 48, 68)
    this.buildLibrary()
    this.makeTransport()
    this.buildStageDecor()
    this.buildAurora()
    this.rebuildSequencerUi()
    console.log("[CoProducer] Core ready: 26 samples, 8 categories, 6-channel limit, 16-step absolute-time sequencer")
  }

  private buildLibrary(): void {
    if (!this.consoleRoot) return
    if (this.libraryRoot) this.libraryRoot.destroy()
    this.libraryRoot = this.obj(this.consoleRoot, "SampleLibraryDynamic", new vec3(0, 0, 0.5))
    const categoryColumns = [
      {x: -60, categories: ["Bell", "Crash", "FX", "Hi-Hat"]},
      {x: -40, categories: ["Kick", "Misc", "Percussion", "Snare"]},
    ]
    for (let column = 0; column < categoryColumns.length; column++) {
      const layout = categoryColumns[column]
      let categoryY = 31
      for (let c = 0; c < layout.categories.length; c++) {
        const category = layout.categories[c]
        const entries = LIBRARY.filter((entry) => entry.category === category)
        this.addText(this.libraryRoot, "Category_" + category, category.toUpperCase(), new vec3(layout.x, categoryY, 0.3), 54, 19)
        for (let i = 0; i < entries.length; i++) {
          const entry = entries[i]
          const inUse = this.composition.channels.some((channel) => channel.id === entry.id)
          const label = inUse ? entry.displayName + "\nIN USE" : entry.displayName
          this.makeButton(this.libraryRoot, "Library_" + entry.id, label, new vec3(layout.x, categoryY - 3.3 - i * 4, 0.4), new vec3(16.5, 3.5, 0.4), () => this.addChannel(entry), inUse ? "Special" : "PrimaryNeutral", inUse ? 42 : 52)
        }
        categoryY -= 3.3 + entries.length * 4 + 1
      }
    }
  }

  private makeTransport(): void {
    const transportRoot = this.obj(this.consoleRoot!, "TransportConsole", new vec3(25, -48, 9))
    transportRoot.getTransform().setLocalRotation(quat.fromEulerAngles(-Math.PI / 4, 0, 0))
    // The decor reads this actual authored transform instead of duplicating an angle.
    this.transportConsoleRotation = transportRoot.getTransform().getLocalRotation()
    this.makePlate(transportRoot, "TransportBacking", new vec3(0, 0, 0), new vec2(70, 16), "simple")
    this.addText(transportRoot, "TempoLabel", "BPM", new vec3(-27, 2.5, 1), 42, 10)
    this.addText(transportRoot, "TempoValue", "140", new vec3(-27, -2.5, 1), 72, 12)
    this.playButton = this.makeButton(transportRoot, "Play", "PLAY", new vec3(-12, 0, 1), new vec3(15, 6, 0.45), () => this.play(), "PrimaryNeutral", 56)
    this.playButton.setIsToggleable(true)
    this.playButton.isOn = this.playing
    this.makeButton(transportRoot, "Stop", "STOP", new vec3(6, 0, 1), new vec3(15, 6, 0.45), () => this.stop(), "PrimaryNeutral", 56)
    this.makeButton(transportRoot, "Clear", "CLEAR", new vec3(24, 0, 1), new vec3(15, 6, 0.45), () => this.clearSteps(), "PrimaryNeutral", 56)
  }

  private buildStageDecor(): void {
    if (!this.transportConsoleRotation) return
    // FBX local axes need a one-time correction after the console inclination.
    // This corrected base remains stored for every later vinyl spin update.
    const decorBaseRotation = this.transportConsoleRotation.multiply(quat.fromEulerAngles(Math.PI / 2, 0, 0))
    const decorRoot = this.obj(this.consoleRoot!, "DecorStage", new vec3(0, 0, 0.2))
    this.createVinyl(decorRoot, "VinylLeft", new vec3(-21, -48, 10), new vec3(0.11, 0.11, 0.11), decorBaseRotation)
    this.createVinyl(decorRoot, "VinylRight", new vec3(71, -48, 10), new vec3(0.11, 0.11, 0.11), decorBaseRotation)
    this.createSpeaker(decorRoot, "SpeakerLeft", new vec3(-1, -40, -1), new vec3(0.10, 0.10, 0.10), decorBaseRotation)
    this.createSpeaker(decorRoot, "SpeakerRight", new vec3(51, -40, -1), new vec3(0.10, 0.10, 0.10), decorBaseRotation)
  }

  private createVinyl(parent: SceneObject, name: string, position: vec3, scale: vec3, baseRotation: quat): void {
    const vinyl = VINYL_PREFAB.instantiate(parent)
    vinyl.name = name
    vinyl.getTransform().setLocalPosition(position)
    vinyl.getTransform().setLocalScale(scale)
    vinyl.getTransform().setLocalRotation(baseRotation)
    this.vinylRoots.push(vinyl)
    this.vinylBaseRotations.push(vinyl.getTransform().getLocalRotation())
  }

  private createSpeaker(parent: SceneObject, name: string, position: vec3, scale: vec3, baseRotation: quat): void {
    const speaker = SPEAKER_PREFAB.instantiate(parent)
    speaker.name = name
    speaker.getTransform().setLocalPosition(position)
    speaker.getTransform().setLocalScale(scale)
    speaker.getTransform().setLocalRotation(baseRotation)
    this.speakerRoots.push(speaker)
    this.speakerBaseScales.push(scale)
  }

  private buildAurora(): void {
    // A station-local, non-interactive procedural ribbon: no UI plate, collider, or
    // Interactable is created for this decorative element.
    this.auroraRoot = this.obj(this.consoleRoot!, "AuroraRibbon", new vec3(28, 42, 1.6))
    this.auroraRoot.enabled = false
    const mesh = this.createAuroraRibbonMesh()
    const layers = [
      {name: "AuroraRibbonCyan", offset: new vec3(0, 0, 0), scale: new vec3(1, 1, 1), color: new vec4(0.20, 0.62, 0.92, 0.24)},
      {name: "AuroraRibbonViolet", offset: new vec3(0, 1.0, 0.08), scale: new vec3(0.92, 0.72, 1), color: new vec4(0.56, 0.30, 0.92, 0.18)},
      {name: "AuroraRibbonMint", offset: new vec3(0, -1.1, 0.16), scale: new vec3(0.84, 0.56, 1), color: new vec4(0.22, 0.88, 0.64, 0.14)},
    ]
    for (let i = 0; i < layers.length; i++) {
      const layer = this.obj(this.auroraRoot, layers[i].name, layers[i].offset)
      layer.getTransform().setLocalScale(layers[i].scale)
      const visual = layer.createComponent("Component.RenderMeshVisual") as RenderMeshVisual
      visual.mesh = mesh
      const material = AURORA_MATERIAL.clone()
      material.mainPass.baseColor = layers[i].color
      material.mainPass.blendMode = BlendMode.Screen
      material.mainPass.depthWrite = false
      material.mainPass.twoSided = true
      visual.mainMaterial = material
      visual.renderOrder = 30
    }
  }

  private createAuroraRibbonMesh(): RenderMesh {
    const segments = 14
    const builder = new MeshBuilder([{name: "position", components: 3}])
    builder.topology = MeshTopology.Triangles
    builder.indexType = MeshIndexType.UInt16
    const vertices: number[] = []
    const indices: number[] = []
    for (let i = 0; i <= segments; i++) {
      const progress = i / segments
      const x = -27 + progress * 54
      const centerY = Math.sin(progress * Math.PI * 2) * 2.0 + Math.sin(progress * Math.PI * 5) * 0.55
      const halfWidth = 1.35 + Math.sin(progress * Math.PI) * 0.55
      vertices.push(x, centerY - halfWidth, 0, x, centerY + halfWidth, 0)
      if (i < segments) {
        const current = i * 2
        const next = current + 2
        // CCW when viewed from the station's forward (+Z) visual side.
        indices.push(current, next, current + 1, current + 1, next, next + 1)
      }
    }
    builder.appendVerticesInterleaved(vertices)
    builder.appendIndices(indices)
    builder.updateMesh()
    this.auroraMeshBuilder = builder
    return builder.getMesh()
  }

  private rebuildSequencerUi(): void {
    if (!this.consoleRoot) return
    if (this.sequencerRoot) this.sequencerRoot.destroy()
    this.sequencerRoot = this.obj(this.consoleRoot, "SequencerDynamic", new vec3(0, 0, 0.5))
    // Four aligned group plates establish darker/lighter beat columns behind every possible channel row.
    for (let group = 0; group < 4; group++) {
      const x = 8.5 + group * 17.5
      this.makePlate(this.sequencerRoot, "StepGroup_" + group, new vec3(x, 5, -0.05), new vec2(16.5, 56), group % 2 === 0 ? "dark" : "simple")
    }
    for (let channelIndex = 0; channelIndex < this.composition.channels.length; channelIndex++) {
      const channel = this.composition.channels[channelIndex]
      const y = 26 - channelIndex * 9
      this.addText(this.sequencerRoot, "ChannelName_" + channel.id, this.wrapChannelName(channel.name), new vec3(-13.5, y, 0.25), 42, 14)
      this.makeButton(this.sequencerRoot, "Remove_" + channel.id, "REMOVE", new vec3(-13.5, y - 3.4, 0.25), new vec3(14.5, 3.2, 0.35), () => this.removeChannel(channel.id), "PrimaryNeutral", 28)
      // per-tile factory — Hard Rule 3 grid-cell carve-out (N = 96 maximum step cells)
      for (let step = 0; step < CoProducerCore.STEPS; step++) {
        const group = Math.floor(step / 4)
        const withinGroup = step % 4
        const x = 1.7 + group * 17.5 + withinGroup * 4.1
        this.makeToggle(this.sequencerRoot, "Step_" + channel.id + "_" + step, new vec3(x, y - 0.4, 0.3), channel.steps[step], () => this.toggleStep(channel.id, step))
      }
    }
  }

  private addChannel(entry: LibraryEntry): void {
    if (this.composition.channels.some((channel) => channel.id === entry.id)) {
      console.log("[CoProducer] Duplicate sample blocked: " + entry.name)
      return
    }
    if (this.composition.channels.length >= CoProducerCore.MAX_CHANNELS) {
      console.log("[CoProducer] Six-channel limit reached; selection ignored: " + entry.name)
      return
    }
    const channel: Channel = { id: entry.id, name: entry.displayName, asset: entry.asset, steps: Array(CoProducerCore.STEPS).fill(false), voices: [], voiceCursor: 0 }
    for (let i = 0; i < 8; i++) {
      const voiceObject = this.obj(this.sceneObject, "CoProducerVoice_" + entry.id + "_" + i)
      const audio = voiceObject.createComponent("Component.AudioComponent") as AudioComponent
      audio.audioTrack = entry.asset
      audio.playbackMode = Audio.PlaybackMode.LowLatency
      channel.voices.push({ object: voiceObject, audio })
    }
    this.composition.channels.push(channel)
    this.buildLibrary()
    this.rebuildSequencerUi()
    console.log("[CoProducer] Channel added: " + entry.name)
  }

  private removeChannel(id: string): void {
    const index = this.composition.channels.findIndex((channel) => channel.id === id)
    if (index < 0) return
    const channel = this.composition.channels[index]
    for (let i = 0; i < channel.voices.length; i++) {
      channel.voices[i].audio.stop(false)
      channel.voices[i].object.destroy()
    }
    this.composition.channels.splice(index, 1)
    this.buildLibrary()
    this.rebuildSequencerUi()
    console.log("[CoProducer] Channel removed: " + channel.name)
  }

  private toggleStep(channelId: string, step: number): void {
    const channel = this.composition.channels.find((item) => item.id === channelId)
    if (!channel) return
    channel.steps[step] = !channel.steps[step]
    this.rebuildSequencerUi()
    console.log("[CoProducer] " + channel.name + " step " + (step + 1) + "=" + (channel.steps[step] ? "ON" : "OFF"))
  }

  private play(): void {
    if (this.playing) {
      this.updatePlayVisual()
      return
    }
    this.playbackStartTime = getTime()
    this.nextAbsoluteStep = 0
    this.playing = true
    this.setAuroraVisible(true)
    this.updatePlayVisual()
    this.dispatchDueSteps()
    console.log("[CoProducer] PLAY")
  }

  private stop(): void {
    this.playing = false
    this.setAuroraVisible(false)
    this.updatePlayVisual()
    for (let c = 0; c < this.composition.channels.length; c++) {
      for (let v = 0; v < this.composition.channels[c].voices.length; v++) this.composition.channels[c].voices[v].audio.stop(false)
    }
    console.log("[CoProducer] STOP")
  }

  private clearSteps(): void {
    for (let c = 0; c < this.composition.channels.length; c++) this.composition.channels[c].steps.fill(false)
    this.rebuildSequencerUi()
    console.log("[CoProducer] CLEAR (channels retained=" + this.composition.channels.length + ")")
  }

  private updateSequencer(): void {
    if (this.playing) this.dispatchDueSteps()
    this.updateStageDecor()
  }

  private dispatchDueSteps(): void {
    const elapsed = getTime() - this.playbackStartTime
    while (this.nextAbsoluteStep * CoProducerCore.STEP_SECONDS <= elapsed + 0.000001) {
      const step = this.nextAbsoluteStep % CoProducerCore.STEPS
      const snapshot = this.composition.channels.slice()
      const triggered: string[] = []
      for (let c = 0; c < snapshot.length; c++) {
        const channel = snapshot[c]
        if (channel.steps[step] && this.composition.channels.indexOf(channel) >= 0) {
          this.playVoice(channel)
          // The live first channel is intentionally the only pulse source.  Looking it
          // up at dispatch time means removing channel zero immediately promotes the
          // next channel without changing composition or playback behavior.
          if (channel === this.composition.channels[0]) this.triggerSpeakerPulse()
          triggered.push(channel.name)
        }
      }
      if (triggered.length > 0) console.log("[CoProducer] step " + (step + 1) + " trigger: " + triggered.join(", "))
      this.nextAbsoluteStep++
    }
  }

  private playVoice(channel: Channel): void {
    const voice = channel.voices[channel.voiceCursor]
    channel.voiceCursor = (channel.voiceCursor + 1) % channel.voices.length
    voice.audio.play(1)
  }

  // Decorative animation only: all musical timing and audio dispatch remain in the
  // absolute getTime()-based sequencer above.
  private updateStageDecor(): void {
    if (this.playing) {
      this.vinylRotationRadians += getDeltaTime() * 1.8
      const clockwiseSpin = quat.angleAxis(-this.vinylRotationRadians, new vec3(0, 1, 0))
      for (let i = 0; i < this.vinylRoots.length; i++) {
        this.vinylRoots[i].getTransform().setLocalRotation(this.vinylBaseRotations[i].multiply(clockwiseSpin))
      }
    }

    this.speakerPulse = Math.max(0, this.speakerPulse - getDeltaTime() * 4.5)
    const pulseScale = 1 + this.speakerPulse * 0.10
    for (let i = 0; i < this.speakerRoots.length; i++) {
      this.speakerRoots[i].getTransform().setLocalScale(this.speakerBaseScales[i].uniformScale(pulseScale))
    }
    this.updateAuroraMotion()
  }

  private setAuroraVisible(visible: boolean): void {
    if (!this.auroraRoot) return
    this.auroraRoot.enabled = visible
  }

  private updateAuroraMotion(): void {
    if (!this.auroraRoot || !this.playing) return
    const time = getTime()
    const transform = this.auroraRoot.getTransform()
    transform.setLocalPosition(new vec3(28, 42 + Math.sin(time * 0.75) * 0.65, 1.6))
    transform.setLocalRotation(quat.fromEulerAngles(0, 0, Math.sin(time * 0.48) * 0.025))
  }

  private triggerSpeakerPulse(): void {
    this.speakerPulse = 1
  }

  private makePlate(parent: SceneObject, name: string, position: vec3, size: vec2, style: "default" | "dark" | "simple"): void {
    const object = this.obj(parent, name, position)
    const plate = object.createComponent(BackPlate.getTypeName()) as BackPlate
    // These are purely visual layers. Their default InteractionPlanes would sit
    // in front of the controls and swallow button targeting.
    ;(plate as unknown as { _enableInteractionPlane: boolean })._enableInteractionPlane = false
    plate.size = size
    plate.style = style
    plate.onInitialized.add(() => {
      const backgroundCollider = object.getComponent("ColliderComponent") as ColliderComponent
      if (backgroundCollider) backgroundCollider.destroy()
    })
  }

  private makeButton(parent: SceneObject, name: string, label: string, position: vec3, size: vec3, action: () => void, style: "PrimaryNeutral" | "Primary" | "Secondary" | "Special" | "Ghost" = "PrimaryNeutral", textSize: number = 20): RectangleButton {
    const object = this.obj(parent, name, position)
    const button = object.createComponent(RectangleButton.getTypeName()) as RectangleButton
    button.setThemeOverride("SnapOS2")
    ;(button as unknown as { _styleSnapOS2: string })._styleSnapOS2 = style
    button.size = size
    const content = object.createComponent(ElementContent.getTypeName()) as ElementContent
    content.text = label
    content.textSize = textSize
    button.onInitialized.add(() => button.onTriggerUp.add(() => action()))
    return button
  }

  private makeToggle(parent: SceneObject, name: string, position: vec3, isOn: boolean, action: () => void): void {
    const object = this.obj(parent, name, position)
    const button = object.createComponent(RectangleButton.getTypeName()) as RectangleButton
    button.setThemeOverride("SnapOS2")
    ;(button as unknown as { _styleSnapOS2: string })._styleSnapOS2 = "Primary"
    button.size = new vec3(3.6, 3.6, 0.35)
    button.setIsToggleable(true)
    button.isOn = isOn
    const content = object.createComponent(ElementContent.getTypeName()) as ElementContent
    content.text = isOn ? "ON" : "-"
    content.textSize = isOn ? 30 : 24
    button.onInitialized.add(() => button.onTriggerUp.add(() => action()))
  }

  private addText(parent: SceneObject, name: string, value: string, position: vec3, size: number, width: number = 24): void {
    const object = this.obj(parent, name, position)
    const text = object.createComponent("Component.Text") as Text
    text.text = value
    text.size = size
    text.depthTest = true
    text.horizontalAlignment = HorizontalAlignment.Center
    text.verticalAlignment = VerticalAlignment.Center
    text.layoutRect = Rect.create(-width / 2, width / 2, -3, 3)
  }

  private wrapChannelName(name: string): string {
    if (name.length <= 13) return name
    const words = name.split(" ")
    return words.length > 1 ? words.slice(0, -1).join(" ") + "\n" + words[words.length - 1] : name
  }

  private updatePlayVisual(): void {
    if (this.playButton) this.playButton.isOn = this.playing
  }

  private obj(parent: SceneObject, name: string, position?: vec3): SceneObject {
    const object = global.scene.createSceneObject(name)
    object.setParent(parent)
    if (position) object.getTransform().setLocalPosition(position)
    return object
  }
}
