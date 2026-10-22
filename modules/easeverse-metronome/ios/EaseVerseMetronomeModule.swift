import AVFoundation
import ExpoModulesCore

public final class EaseVerseMetronomeModule: Module {
  private var engine: AVAudioEngine?
  private var player: AVAudioPlayerNode?
  private var owner: String?
  private var observers: [NSObjectProtocol] = []

  public func definition() -> ModuleDefinition {
    Name("EaseVerseMetronome")
    Events("stopped")
    OnCreate {
      self.observers.append(NotificationCenter.default.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { [weak self] note in
        if (note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt) == AVAudioSession.InterruptionType.began.rawValue {
          self?.interrupt("Audio was interrupted. Tap the metronome to restart.")
        }
      })
      self.observers.append(NotificationCenter.default.addObserver(forName: AVAudioSession.routeChangeNotification, object: nil, queue: .main) { [weak self] note in
        if (note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt) == AVAudioSession.RouteChangeReason.oldDeviceUnavailable.rawValue {
          self?.interrupt("The audio output changed. Check your headphones and restart the metronome.")
        }
      })
    }
    AsyncFunction("start") { (id: String, bpm: Double, beats: Int) in
      guard bpm.isFinite, bpm >= 20, bpm <= 400, beats >= 1, beats <= 12 else {
        throw Exception(name: "InvalidTempo", description: "Choose a tempo from 20 to 400 BPM.")
      }
      self.stopCurrent()
      let engine = AVAudioEngine()
      let player = AVAudioPlayerNode()
      let rate = 48000.0
      let count = AVAudioFrameCount((Double(beats) * 60.0 / bpm * rate).rounded())
      guard let format = AVAudioFormat(standardFormatWithSampleRate: rate, channels: 1),
            let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: count),
            let output = buffer.floatChannelData?[0] else {
        throw Exception(name: "ClickUnavailable", description: "Could not prepare metronome audio.")
      }
      buffer.frameLength = count
      // One complete bar. Native buffer looping uses the audio sample clock;
      // JS timers never seek or retrigger the click sound.
      for i in 0..<Int(count) { output[i] = 0 }
      for beat in 0..<beats {
        let first = Int((Double(beat) * 60.0 / bpm * rate).rounded())
        let frequency = beat == 0 ? 1500.0 : 900.0
        for j in 0..<min(1440, Int(count) - first) {
          let t = Double(j) / rate
          output[first + j] = Float(sin(2 * .pi * frequency * t) * exp(-t * 160) * (beat == 0 ? 0.36 : 0.25))
        }
      }
      engine.attach(player)
      engine.connect(player, to: engine.mainMixerNode, format: format)
      self.engine = engine; self.player = player; self.owner = id
      do {
        try engine.start()
        player.scheduleBuffer(buffer, at: nil, options: .loops)
        player.play()
      } catch { self.stopCurrent(); throw error }
    }.runOnQueue(.main)
    AsyncFunction("stop") { (id: String) in
      if self.owner == id { self.stopCurrent() }
    }.runOnQueue(.main)
    OnAppEntersBackground { self.interrupt("Metronome stopped while the app was in the background.") }
    OnDestroy {
      self.stopCurrent()
      self.observers.forEach { NotificationCenter.default.removeObserver($0) }
      self.observers.removeAll()
    }
  }
  private func stopCurrent() {
    player?.stop(); engine?.stop()
    player = nil; engine = nil; owner = nil
  }
  private func interrupt(_ message: String) {
    guard let id = owner else { return }
    stopCurrent()
    sendEvent("stopped", ["id": id, "message": message])
  }
}
