# Co-Producer

**A spatial music sequencer for creating and remixing loops.**

Co-Producer is a spatial music creation tool built in Lens Studio. It allows users to choose samples from a curated library, add them as dynamic channels, and build rhythmic patterns using a 16-step sequencer.

Patterns can be edited while playback is running, making it possible to experiment with loops in real time without stopping the composition.

## Features

- Curated sample library organized by category
- Dynamic sample channels
- Up to 6 simultaneous channels
- 16-step loop sequencer
- Real-time pattern editing during playback
- Play, Stop, and Clear controls
- Fixed 140 BPM / 4/4 sequencing
- World-anchored spatial interface
- Visual feedback for samples currently in use
- Reactive 3D vinyl records and speakers
- Animated aurora-style playback visual

## Interaction

1. Select a sample from the library.
2. A new 16-step channel is created.
3. Toggle steps ON or OFF to build a pattern.
4. Press PLAY to start the loop.
5. Continue editing the pattern while it is playing.
6. Add more samples to build a layered composition.

The first active channel also drives the reactive speaker animation.

## Technical Approach

Co-Producer uses a shared composition state that drives both the interface and the live sequencer.

Playback uses absolute-time scheduling based on `getTime()` rather than accumulated frame delta, helping the loop maintain rhythmic consistency.

Each channel uses a small round-robin voice pool so overlapping sample tails can play naturally.

The interface is placed once relative to the user's starting position and then remains fixed in world space.

## Built With

- Lens Studio
- CLAD
- Codex
- Blender

## Development Process

CLAD was used throughout the project to:

- investigate Lens Studio audio capabilities
- validate real-time sample sequencing
- build the core sequencer
- create the spatial UI
- debug and iterate through Preview testing
- integrate world-space behavior
- add reactive 3D elements
- prepare the final demo

## Audio Assets

The project uses a curated set of CC0 audio samples selected from the modern LMMS assets library and converted to WAV for use inside Lens Studio.

## Status

Demo-ready hackathon prototype.
