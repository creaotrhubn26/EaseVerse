# Hugging Face practice transcription: measured prototype and production boundary

The existing `server/whisper-stt.ts` can run public Hugging Face ONNX Whisper models in Node using Transformers.js. This is self-hosted inference: the audio is processed on the machine running Node, not by a free Hugging Face cloud API. The current Netlify practice-analysis route uses OpenAI and does not invoke this local worker. Do not silently substitute providers behind its existing consent copy.

## Local probe, 21 October 2026

CPU on the development Mac, q8, 16 kHz mono PCM converted from newly generated synthetic English/Norwegian speech. Model files cached on the external test disk. Neither real user recordings nor paid inference were used.

| Model | English words matched | Norwegian words matched | Digital silence rejected |
| --- | --- | --- | --- |
| Xenova/whisper-base | 11 / 11 | 3 / 7 | Yes, after signal gate |
| Xenova/whisper-small | 11 / 11 | 4 / 7 | Yes, after signal gate |
| onnx-community/whisper-large-v3-turbo | 11 / 11 | 7 / 7 | Yes, after signal gate |

For large-v3-turbo the cached-model Norwegian call took 1,579 ms. The first English call took 306,882 ms including initial model download/load and transcription, so it is not representative of warm inference latency. One measurement on a fast development Mac is not a production performance guarantee. English, Norwegian and 8-second silence are only three fixtures; this is not validation of singing, band mixes, accents or phonetic assessment.

The raw recogniser generated text for digital silence. `shared/audio-signal.ts` now blocks finite, digital/near-silent input before local inference. This gate is not speech/music separation, a noise classifier or a pronunciation score. Real music/noise adversarial fixtures and long pauses remain necessary.

## Recommended integration

- Keep native Apple/Android offline recognition optional, capability-checked and honest about failure. Do not run Transformers.js as a JavaScript main-thread replacement inside React Native.
- Place the pinned multilingual Whisper model in a separate warm worker with persistent model storage; do not download/load a gigabyte-scale model during every Netlify function invocation. Keep it isolated from the main CreatorHub request process.
- Route both clients through authenticated EaseVerse APIs. Server-derived project/account access and limits remain authoritative. No service tokens in the mobile app.
- Expose the configured processing destination before consent, bind each submission to that provider choice and reject a stale provider choice. Never automatically send audio to another third party after failure.
- Use private, expiring audio objects and asynchronous jobs for long recordings. The app must recover a job across navigation/restart, show queued/running/failed/completed state, cancel best-effort, and retrieve a result idempotently. Bounded worker concurrency and backpressure must protect the main backend. Retry only retriable failures, without duplicate charge/job creation.
- Store provider/model revision, language, method and measured word comparison with a result. Treat recognised text as fallible and expose it for listening/checking. Reject uncertainty/unusable audio rather than filling missing metrics with invented scores.
- Do not equate transcript agreement with phonetic pronunciation or musical timing. Those require separate calibrated acoustic/reference measurements and language-specific validation.

## Go/no-go gates

Before configuring a production service, choose hosting capacity/budget and pin a verified model revision. Then validate real singing in Norwegian and English (with consented evaluation material), quiet and noisy vocals, backing music, silence, clipping, unsupported languages, maximum duration, network interruption, provider unavailability, repeated jobs, quota concurrency, deletion/expiry and native/store-signed behavior on both platforms. No Hugging Face service or additional paid infrastructure has been provisioned by this investigation.

Official references:
- https://huggingface.co/onnx-community/whisper-large-v3-turbo
- https://huggingface.co/docs/transformers.js/guides/node-audio-processing
- https://huggingface.co/docs/inference-providers/main/pricing
- https://huggingface.co/docs/inference-endpoints/autoscaling
