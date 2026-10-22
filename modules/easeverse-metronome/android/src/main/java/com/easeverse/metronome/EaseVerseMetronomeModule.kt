package com.easeverse.metronome

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.functions.Queues
import kotlin.math.*

class EaseVerseMetronomeModule : Module() {
  private var track: AudioTrack? = null
  private var owner: String? = null
  private var manager: AudioManager? = null
  private var focus: AudioFocusRequest? = null
  private val listener = AudioManager.OnAudioFocusChangeListener { change ->
    if (change == AudioManager.AUDIOFOCUS_LOSS || change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT) {
      val id = owner
      stopCurrent()
      if (id != null) sendEvent("stopped", mapOf("id" to id, "message" to "Audio was interrupted. Tap the metronome to restart."))
    }
  }
  override fun definition() = ModuleDefinition {
    Name("EaseVerseMetronome")
    Events("stopped")
    AsyncFunction("start") { id: String, bpm: Double, beats: Int ->
      require(bpm.isFinite() && bpm in 20.0..400.0 && beats in 1..12) { "Choose a tempo from 20 to 400 BPM." }
      stopCurrent()
      val context = requireNotNull(appContext.reactContext)
      val attributes = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build()
      manager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
      val granted = if (Build.VERSION.SDK_INT >= 26) {
        focus = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK).setAudioAttributes(attributes).setOnAudioFocusChangeListener(listener).build()
        manager!!.requestAudioFocus(focus!!)
      } else {
        @Suppress("DEPRECATION")
        manager!!.requestAudioFocus(listener, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
      }
      if (granted != AudioManager.AUDIOFOCUS_REQUEST_GRANTED) { stopCurrent(); error("Audio output is busy. Retry the metronome.") }
      try {
        val rate = 48000
        val frames = (beats * 60.0 / bpm * rate).roundToInt()
        val samples = ShortArray(frames)
        for (beat in 0 until beats) {
          val first = (beat * 60.0 / bpm * rate).roundToInt()
          val frequency = if (beat == 0) 1500.0 else 900.0
          for (j in 0 until min(1440, frames - first)) {
            val t = j.toDouble() / rate
            samples[first + j] = (sin(2 * PI * frequency * t) * exp(-t * 160) * (if (beat == 0) 0.36 else 0.25) * 32767).roundToInt().toShort()
          }
        }
        val output = AudioTrack.Builder().setAudioAttributes(attributes)
          .setAudioFormat(AudioFormat.Builder().setEncoding(AudioFormat.ENCODING_PCM_16BIT).setSampleRate(rate).setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build())
          .setTransferMode(AudioTrack.MODE_STATIC).setBufferSizeInBytes(frames * 2).build()
        track = output; owner = id
        check(output.write(samples, 0, frames, AudioTrack.WRITE_BLOCKING) == frames) { "Could not load metronome audio." }
        check(output.setLoopPoints(0, frames, -1) == AudioTrack.SUCCESS) { "Could not loop metronome audio." }
        output.play()
      } catch (error: Exception) { stopCurrent(); throw error }
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("stop") { id: String -> if (owner == id) stopCurrent() }.runOnQueue(Queues.MAIN)
    OnActivityEntersBackground {
      val id = owner
      stopCurrent()
      if (id != null) sendEvent("stopped", mapOf("id" to id, "message" to "Metronome stopped while the app was in the background."))
    }
    OnDestroy { stopCurrent() }
  }
  private fun stopCurrent() {
    val output = track
    track = null; owner = null
    try { output?.pause(); output?.flush(); output?.release() } catch (_: Exception) {}
    if (Build.VERSION.SDK_INT >= 26) focus?.let { manager?.abandonAudioFocusRequest(it) }
    else { @Suppress("DEPRECATION") manager?.abandonAudioFocus(listener) }
    focus = null; manager = null
  }
}
