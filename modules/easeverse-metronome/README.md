# EaseVerse metronome

Local Expo module, autolinked from `modules/`. A new native binary is required.

- iOS: an AVAudioPlayerNode loops a rendered PCM bar on AVAudioEngine's sample clock.
- Android: AudioTrack MODE_STATIC loops the same kind of PCM bar.
- Web: Web Audio schedules clicks against AudioContext time.
- No audio callbacks run JavaScript, perform network requests, or seek a media player.
- Recording stays enabled in the shared iOS audio session. Configuring the session does not itself record or request microphone permission.
- Handles have unique owners: a delayed stop for an old screen cannot stop a newer screen's click.
- Stop on screen departure, background, interruption, and Android audio-focus loss. Retry is explicit. Startup failures are visible.

This matches a fixed BPM, not transport phase across devices. It does not sync an artist's audio hardware clock to Pro Tools, compensate Bluetooth latency, follow a tempo map, or change the Pro Tools click. Downbeat accent currently assumes four beats per bar unless a caller passes another beat count.

Sound Room's existing collaboration endpoint supplies producer BPM to the linked booth. Missing/unavailable producer BPM disables the click; local lyric tempo cannot override it. Polling can take up to five seconds. Personal Sing/Pocket practice uses the selected song and remains separate from the linked booth.
