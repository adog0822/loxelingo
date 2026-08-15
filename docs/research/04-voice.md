# 04 — Voice / Speech Input for LoxeLingo (Web)

**Scope:** What speech input is actually available to a **Next.js web app** in a browser, and what it costs.
**Out of scope (already settled elsewhere):** whether prosody scoring works. See streams 02/03. Established conclusions carried forward:
- Prosody cannot serve as anti-cheat. F0-alone spoof detection sits at 38–42% EER vs a 50% coin flip; energy alone is at or worse than chance. Modern neural TTS is at MOS parity with human read speech.
- For pedagogy, explicit F0-DTW correlates r ≈ 0.17 with expert raters, while the same DTW machinery over self-supervised features *exceeds* human agreement on segmental scoring (0.576 vs 0.536 human benchmark). Duration and intensity carry the signal; adding F0 made scoring *worse* (0.570 → 0.540).

So the question here is narrow: **what can a browser do, and what does it cost.**

**Notation:** every number is marked `[R]` (researched, with source + date) or `[E]` (estimated by me, with reasoning shown). Prices are not invented; where I could not find a current figure I say so.

**Research date:** 2026-08-15. Prices change; re-verify anything older than ~6 months before committing.

---

## 1. The Web Speech API (`SpeechRecognition`), in detail

This is the crux, because the "it's free, just use the OS recognizer" advice everyone gives assumes a **native mobile app**. We are on the web.

### 1.1 Support matrix

| Browser | Support | Version | Notes |
|---|---|---|---|
| Chrome desktop | Partial, `webkit`-prefixed | 25+ `[R]` | The reference implementation. `webkitSpeechRecognition`. Unprefixed `SpeechRecognition` also added in recent versions. |
| Chrome Android | Partial, `webkit`-prefixed `[R]` | current | Reported as the best-behaved mobile target. |
| Safari macOS | Partial, `webkit`-prefixed | 14.1+ `[R]` | Requires an explicit "Allow speech recognition" consent modal. |
| Safari iOS/iPadOS | Partial, `webkit`-prefixed | 14.5+ `[R]` | Works in Safari proper. **Does not reliably work in an installed PWA — see 1.5.** |
| Edge (desktop + Android) | **Effectively non-functional** `[R]` | — | Interface exists, no errors thrown, no results ever returned. See below. |
| Firefox desktop | Disabled by default `[R]` | 22–156 flagged | Behind `dom.webspeech.recognition.enable` in `about:config`. Not a shippable target. |
| Firefox Android | Not supported `[R]` | — | |
| Samsung Internet | Partial, `webkit`-prefixed | 4+ `[R]` | |

Sources: [caniuse.com/speech-recognition](https://caniuse.com/speech-recognition) (retrieved 2026-08-15); [MDN SpeechRecognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition).

**The Edge situation is worse than caniuse's "not supported" row suggests, and it is worth being precise about.** Edge ships the `webkitSpeechRecognition` interface, so naive feature detection (`'webkitSpeechRecognition' in window`) returns `true`. It then throws no error and returns no results, ever. This is filed as [mdn/browser-compat-data#22126](https://github.com/mdn/browser-compat-data/issues/22126) `[R]`. Microsoft's own docs describe an implementation backed by Azure Cognitive Services `[R]` ([MS Learn, Speech Recognition API](https://learn.microsoft.com/en-us/microsoft-edge/web-platform/speech-recognition-api)), and there is a `SpeechRecognitionEnabled` group policy that admins can turn off `[R]`. **Practical consequence: you cannot feature-detect your way to correctness. Any implementation needs a UA check or a timeout-and-fallback, not a capability check.** That is a real, non-obvious engineering cost.

Rough coverage math: taking Chrome + Safari + Samsung Internet as working and Firefox + Edge as not, roughly **10–15% of desktop web traffic lands on a browser where this silently does nothing** `[E]` (Edge ~5%, Firefox ~5–7%, plus in-app webviews of unknown behaviour). On mobile the working share is higher `[E]`, but iOS PWA breaks it back down (1.5).

### 1.2 Is it free? Where does the audio go?

**Free in dollars, not free in privacy.**

- **Chrome:** audio is uploaded to **Google's servers**. Along with the audio, Chrome sends the domain of the calling site, the browser's default language, and the page's declared language. Cookies are not attached. `[R]` (documented behaviour, see [addpipe deep dive](https://blog.addpipe.com/a-deep-dive-into-the-web-speech-api/), [MDN Using the Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API/Using_the_Web_Speech_API))
- **Safari:** audio goes to **Apple's servers** (the Siri/dictation backend). Safari surfaces its own consent modal asking permission to send audio to Apple. `[R]`
- **Edge:** **Azure Cognitive Services**, per Microsoft's docs — though the pipeline does not actually produce results, so this is theoretical. `[R]`

**This is a disclosure obligation, not a footnote.** Under GDPR, voice is biometric-adjacent personal data and we would be causing a third-party transfer to Google/Apple that the user did not choose. Our privacy policy must name Google and Apple as processors of speech audio. For a language-learning product whose users are disproportionately minors and non-EU-resident learners, that is a real compliance surface. Note also we cannot contract with Google over this — there is no DPA for the browser's built-in recognizer, because *we* are not the customer, the browser is.

**Emerging exception — on-device mode.** Chrome 139 (August 2025 `[R]`) shipped optional on-device recognition: `SpeechRecognition.available({ langs, processLocally: true })` and `SpeechRecognition.install({ langs, processLocally: true })`, plus a `processLocally` property on the recognizer. `[R]` ([MDN processLocally](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/processLocally), [W3C/WebAudio explainer](https://github.com/WebAudio/web-speech-api/blob/main/explainers/on-device-speech-recognition.md)). Edge has an experimental equivalent in Canary/Dev with a local model `[R]` ([Edge blog, 2026-06-02](https://blogs.windows.com/msedgedev/2026/06/02/expanding-on-device-ai-in-microsoft-edge-new-models-and-apis-for-the-web/)).

Do **not** plan on this yet. It is Chrome-desktop-first, it depends on the SODA component being downloaded, and there are open bugs: `available({processLocally:true})` regressing to `unavailable` on macOS ([crbug 444393111](https://issues.chromium.org/issues/444393111)) `[R]`, and Chromium-derivative browsers hanging forever in `"downloading"` because the SODA component never installs ([brave#55414](https://github.com/brave/brave-browser/issues/55414)) `[R]`. It is the right thing to re-check in 12 months; it is not something to build a feature on today.

### 1.3 Language coverage: en, ja, es

All three of our target languages are covered on the browsers that work at all `[R]`. Chrome's recognizer supports a large BCP-47 language list (order-of-100 language/locale pairs) that includes `en-US`/`en-GB`, `ja-JP`, and multiple Spanish locales (`es-ES`, `es-MX`, `es-AR`, …). Safari's list is bound to the OS dictation languages, which include English, Japanese, and Spanish.

**But language coverage is not the interesting variable, and it is worth saying why.** These are recognizers tuned for dictation by *native or fluent* speakers of the selected locale. Setting `lang = 'ja-JP'` and pointing it at a beginner English-L1 learner reading Japanese is exactly the off-distribution case these systems are worst at. See section 4 — this is the thing that actually decides whether voice is viable, not the support matrix.

A second, subtler problem specific to our use case: **the recognizer's language model actively hides pronunciation errors.** A strong LM will snap a mangled utterance onto the nearest plausible sentence — which is a feature for dictation and a bug for assessment. If a learner says something badly and the API returns the correct target sentence, we have learned nothing and will over-reward. There is no way to disable the LM or get phone-level output from the Web Speech API. `[E]` — this follows directly from the API surface, which exposes only transcript strings plus an opaque `confidence` float.

### 1.4 Reliability problems

- **Requires a user gesture.** Recognition must be started from within a user-interaction handler (click/tap). On iOS this is strictly enforced since 14.5. `[R]` Architecturally this means no ambient/always-listening design; every attempt needs a deliberate press.
- **Requires network.** In default (non-`processLocally`) mode, no connection means no recognition, on both Chrome and Safari. `[R]` Offline practice is impossible.
- **Silence timeout.** Chrome desktop self-terminates after roughly 7–10 seconds of silence `[R]`. Learners are slow and hesitant — they pause to think mid-sentence — so this fires spuriously on exactly our user population.
- **`continuous` is broken in Safari.** Developers report having to manually stop after ~5s or the mic never releases. `[R]` ([WICG/speech-api#96](https://github.com/WICG/speech-api/issues/96))
- **Siri interference on macOS.** With Siri enabled, `onresult` may never fire; with Siri disabled there is a 2–3s startup lag before audio is captured. `[R]`
- **`interimResults` semantics are undefined/inconsistent on iOS WebKit.** `[R]` ([Apple dev forums thread 775699](https://developer.apple.com/forums/thread/775699))
- **No timing, no phones, no confidence you can trust.** The API returns a transcript and an opaque per-alternative `confidence`. There is no word-level or phone-level alignment, no duration data, no intensity. Given that stream 03 concluded **duration and intensity carry the pedagogical signal**, this is disqualifying for scoring: the Web Speech API returns precisely the information we do not need and none of the information we do.

### 1.5 PWA behaviour

- **Android installed PWA:** works, since it is the same Chrome engine and the same permission model. `[E]` (no contrary reports found; treat as high confidence but unverified on device.)
- **iOS installed PWA (Add to Home Screen, standalone display mode): does not work.** The API is present so feature detection passes, and then nothing happens — no results, no error. `[R]` ([Apple dev forums thread 748048](https://developer.apple.com/forums/thread/748048); corroborated in PWA-capability trackers). The root cause appears to be that speech/microphone permission grants do not carry into the standalone context.

**This deserves emphasis because it is the single most damaging fact in section 1.** The PWA install is our substitute for an App Store presence — it is how a daily-habit language app earns a home-screen icon and push-adjacent retention. If the moment a user installs the PWA the voice feature silently dies, we have built a feature that breaks *as a direct result of our most desired user action*. That is worse than not having the feature.

---

## 2. In-browser Whisper via WASM / WebGPU

Two stacks: **transformers.js** (ONNX Runtime Web, WASM + WebGPU backends) and **whisper.cpp compiled to WASM**. Both are genuinely impressive engineering. Neither is production infrastructure for a consumer language app in 2026.

### 2.1 Model size over the wire

Real file sizes from the ONNX Community repos, retrieved 2026-08-15 `[R]`:

| Model | Variant | Encoder | Decoder (merged) | **Total download** |
|---|---|---|---|---|
| `whisper-tiny.en` | int8 quantized | 10.1 MB | 30.7 MB | **~41 MB** |
| `whisper-tiny.en` | fp16 | 16.5 MB | 59.6 MB | ~76 MB |
| `whisper-tiny.en` | q4 | 9.02 MB | 86.7 MB | ~96 MB |
| `whisper-tiny.en` | fp32 | 32.9 MB | 119 MB | ~152 MB |
| `whisper-base` | int8 quantized | 23.2 MB | 53.7 MB | **~77 MB** |
| `whisper-base` | fp16 | 41.3 MB | 105 MB | ~146 MB |

Sources: [onnx-community/whisper-tiny.en](https://huggingface.co/onnx-community/whisper-tiny.en/tree/main/onnx), [onnx-community/whisper-base](https://huggingface.co/onnx-community/whisper-base/tree/main/onnx).

Two things to note. First, `tiny.en` is **English-only** — for `ja` and `es` we need the multilingual `tiny`/`base`, which are larger (bigger vocab/embedding) and meaningfully worse per-language. Second, `q4` is *bigger* than int8 here because of how the decoder quantizes; the naive "just use q4, it's smallest" assumption is wrong.

**Cold load time.** At a realistic 10 Mbps effective mobile throughput, 41 MB ≈ **33 s** and 77 MB ≈ **62 s**, before any warmup or graph compilation `[E]` (arithmetic on the `[R]` sizes; real-world will be worse on congested mobile networks and better on wifi). This is a one-time cost — the weights cache in the Cache API / IndexedDB — but it is a one-time cost paid *at the exact moment a new user is deciding whether this app is worth their time*. A 30–60 s blocking download on first speaking exercise is a funnel-killer.

### 2.2 Inference speed

- **whisper.cpp WASM (SIMD, CPU):** the project's own README reports **~2–3× faster than real time for tiny and base on a modern desktop CPU** — a 60 s clip in roughly 20–30 s of compute `[R]` ([whisper.wasm README](https://github.com/ggml-org/whisper.cpp/blob/master/examples/whisper.wasm/README.md)). Models above `small` are described as having unsatisfactory memory and performance in-browser `[R]`.
- **whisper.cpp streaming WASM demo:** the project states it **requires a fast desktop or laptop, not a mobile phone** `[R]` ([ggml.ai stream.wasm](https://ggml.ai/whisper.cpp/stream.wasm/)). That is the maintainers telling us directly that mobile is out of scope.
- **WebGPU vs WASM:** transformers.js v3 (Oct 2024) added WebGPU; the speedup is real but wildly variable — reported anywhere from **10–15×** to a headline "up to 100×" depending on model and hardware `[R]` ([SitePoint benchmark](https://www.sitepoint.com/webgpu-vs-webasm-transformers-js/), [transformers.js#894](https://github.com/huggingface/transformers.js/issues/894)). Treat "up to 100×" as marketing; **10×** is the number to plan against `[E]`.

**Mid-range phone estimate.** Extrapolating from the desktop 2–3× RTF and the maintainers' explicit "not a phone" guidance, a mid-range Android on the WASM path lands around **0.7–1.5× real time for tiny** `[E]` — i.e. a 10 s learner utterance takes roughly 7–15 s to transcribe, on top of the model load, with the phone thermally throttling and the battery draining. There is no published mid-range-phone RTF benchmark I could find; this is an estimate and should be labelled as such in any decision doc.

### 2.3 Does it actually run on phones? Mostly no.

This is where it stops being a performance question and becomes a correctness question. The transformers.js issue tracker is unambiguous `[R]`:

- [#1241](https://github.com/huggingface/transformers.js/issues/1241) — `onnx-community/whisper-base` **crashes in Safari**.
- [#1298](https://github.com/huggingface/transformers.js/issues/1298) — the official Whisper web demo **does not work on iOS**.
- [#1242](https://github.com/huggingface/transformers.js/issues/1242) — v3 crashes on iOS (Safari *and* Chrome) from runaway memory; on macOS memory climbs past 10 GB before dying. Suspected root cause is iOS Safari's fp32/fp16 handling in ONNX Runtime Web. Reported workaround is **downgrading to `@xenova/transformers@2.15.1`** — i.e. abandoning WebGPU entirely.
- [#740](https://github.com/huggingface/transformers.js/issues/740) — **Chrome on Android crashes** when starting Whisper.
- [#860](https://github.com/huggingface/transformers.js/issues/860) — WebGPU Whisper pipeline **leaks tensors**, memory grows until OOM or device loss. Severe for our use case specifically, because a drill session means dozens of sequential transcriptions in one page lifetime.
- [#973](https://github.com/huggingface/transformers.js/issues/973), [#953](https://github.com/huggingface/transformers.js/issues/953), [#958](https://github.com/huggingface/transformers.js/issues/958) — Safari restarts, `RangeError: Out of memory`, and models that will not reload after a page close/reopen.

WebGPU availability itself is no longer the blocker: it ships by default in Chrome 113+, Firefox 147+, and Safari on iOS/iPadOS/macOS **26** `[R]` ([gpuweb Implementation Status](https://github.com/gpuweb/gpuweb/wiki/Implementation-Status)); Firefox Android is targeted for late 2026 `[R]`. The blocker is that the *stack on top of* WebGPU is not stable on the mobile devices our users hold.

### 2.4 Verdict on in-browser Whisper

**Demo, not product.** Specifically:

- On desktop Chrome with WebGPU, it works and is genuinely good. That is maybe 25–35% of our sessions `[E]`.
- On iOS — our highest-value segment for a paid language app — it crashes today, per the library's own issue tracker.
- Even where it runs, **Whisper-tiny/base are the weakest Whisper checkpoints, and section 4 shows the accuracy penalty on accented L2 speech is concentrated exactly in the small models.** We would be shipping the worst-performing model to the users least well served by it.
- And it still gives us transcript text only. The same objection as §1.4 applies: no reliable phone-level alignment out of the box, so it does not unlock the duration/intensity signal that stream 03 identified as the thing that actually works.

The one scenario where this becomes interesting: if we ever want **offline** practice, or a **zero-marginal-cost** high-volume free tier, this is the only lever that delivers it. Worth re-evaluating in ~12 months once the iOS memory bugs close.

---

## 3. Cloud STT pricing (retrieved 2026-08-15)

### 3.1 List prices

| Provider / model | Price per audio minute | Price per audio hour | Free tier | Notes |
|---|---|---|---|---|
| **Cloudflare Workers AI** `@cf/openai/whisper` | **$0.000453** `[E]` | $0.027 `[E]` | 10,000 neurons/day | 41.14 neurons/audio-min `[R]` × $0.011/1k neurons `[R]` |
| **Cloudflare Workers AI** `whisper-large-v3-turbo` | **$0.000513** `[E]` | $0.031 `[E]` | 10,000 neurons/day | 46.63 neurons/audio-min `[R]` |
| **Groq** `whisper-large-v3-turbo` | $0.000667 `[E]` | **$0.04** `[R]` | Free dev tier, rate-limited | **10-second minimum billing per request** `[R]` |
| **Groq** `whisper-large-v3` | $0.00185 `[E]` | **$0.111** `[R]` | as above | ~228–247× real time `[R]` |
| **OpenAI** `gpt-4o-mini-transcribe` | **$0.003** `[R]` | $0.18 | none | also billable as $1.25/$5.00 per 1M in/out tokens `[R]` |
| **OpenAI** `whisper-1` | **$0.006** `[R]` | $0.36 | none | rounds up per request `[R]` |
| **OpenAI** `gpt-4o-transcribe` | **$0.006** `[R]` | $0.36 | none | $2.50/$10.00 per 1M in/out tokens `[R]` |
| **Deepgram** Nova-3 mono, batch | **$0.0043–0.0048** `[R]` | ~$0.26–0.29 | **$200 credit** `[R]` | see caveat below |
| **Deepgram** Nova-3 mono, streaming | **$0.0077** `[R]` | ~$0.46 | as above | |
| **Deepgram** Nova-3 multilingual, streaming | $0.0058–0.0078 `[R]` | — | as above | needed for ja/es |

Sources: [Cloudflare Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/); [Deepgram pricing](https://deepgram.com/pricing); Groq and OpenAI figures corroborated across multiple 2026 pricing trackers ([Groq STT](https://apio.sh/apis/groq-speech-to-text), [OpenAI transcription costs, Aug 2026](https://costgoat.com/pricing/openai-transcription)).

**Caveat on the Deepgram batch number.** The live pricing page and secondary trackers disagree: trackers say $0.0043/min pre-recorded, the page as scraped reads $0.0048/min PAYG / $0.0042/min Growth. The streaming figure ($0.0077/min) is consistent across both. **I have used $0.0048 as the conservative batch figure. Verify on the pricing page before contracting.** I am flagging this rather than silently picking one, because the difference compounds at volume.

### 3.2 Rate and concurrency limits

- **Deepgram:** REST up to 50 concurrent connections, WebSocket 150–225, Whisper Cloud only 5. Higher on Growth. `[R]` Fifty concurrent batch requests is a real ceiling if a class of 30 students all tap "speak" in the same minute — plan a queue.
- **Groq:** free tier is rate-limited by requests/minute and audio-seconds/hour; paid tier is higher. The **10-second minimum billing per request is the operationally important constraint**, not the RPM limit. `[R]`
- **Cloudflare:** billed purely by neuron consumption; limits are account-level, and it runs inside our Worker so there is no cross-network hop. `[R]`
- **OpenAI:** standard org-level RPM/TPM tiers.

### 3.3 Per-user-per-month cost, with assumptions stated

**Assumptions** (all `[E]`, chosen to be plausible-to-slightly-pessimistic for a daily-habit language app):

- An **active** learner does 5 sessions/week.
- Each session contains **10 speaking prompts**.
- Each prompt yields **~6 seconds** of recorded audio (single sentence, read aloud).
- → 60 s = **1 audio-minute per session**; 5/wk × 4.33 wk = **~22 audio-minutes/active-user/month**.
- I use **20 min/user/month** as the round number, and **60 min** for a power user (3× engagement).

| Option | 20 min/user/mo | 60 min/user/mo (power) | At 10,000 active users (200k min/mo) |
|---|---|---|---|
| Cloudflare `whisper-large-v3-turbo` | **$0.010** `[E]` | $0.031 `[E]` | **~$103/mo** `[E]` |
| Groq turbo, **naive** (no batching) | $0.022 `[E]` | $0.067 `[E]` | ~$222/mo `[E]` |
| Groq turbo, ideal (batched to full min) | $0.013 `[E]` | $0.040 `[E]` | ~$133/mo `[E]` |
| OpenAI `gpt-4o-mini-transcribe` | $0.060 `[E]` | $0.180 `[E]` | ~$600/mo `[E]` |
| OpenAI `whisper-1` / `gpt-4o-transcribe` | $0.120 `[E]` | $0.360 `[E]` | ~$1,200/mo `[E]` |
| Deepgram Nova-3 batch @ $0.0048 | $0.096 `[E]` | $0.288 `[E]` | ~$960/mo `[E]` |
| Deepgram Nova-3 streaming @ $0.0077 | $0.154 `[E]` | $0.462 `[E]` | ~$1,540/mo `[E]` |

**The Groq minimum-billing trap, made concrete.** A 6-second utterance billed at a 10-second floor is a **1.67× cost inflation** `[E]`. At our usage shape — many very short clips — this is not a rounding error, it is the dominant term. Same class of problem applies to OpenAI's per-request rounding. **Any provider comparison done on list price alone will be wrong for us by ~1.5–2×**, because our audio arrives as dozens of 5-second fragments, not as hour-long files. The providers' pricing pages are designed around podcast and meeting transcription.

### 3.4 What the cost numbers actually mean

**Raw STT is not the expensive part, and this is the most important commercial finding in section 3.** At $0.01–0.15 per active user per month, transcription is somewhere between 0.1% and 1.5% of a $10/mo subscription. Even the worst option on the table is affordable.

That means **cost is not the constraint on shipping voice.** Anyone arguing about Deepgram vs Groq on price is optimizing the wrong variable. The constraints are, in order: (1) does it work in the browser the user actually has, (2) is it accurate enough on learner speech to justify showing a score, (3) engineering time. Cost comes fourth and is not close.

A corollary worth stating: **Cloudflare Workers AI at ~$0.0005/min is cheap enough to be effectively free at our scale, and we are already on Cloudflare.** If we ship voice, that is the default choice — not because of the price, but because it removes a vendor, a network hop, and a DPA from the critical path. The per-minute saving vs Deepgram (~$860/mo at 10k users) is a nice-to-have, not the argument.

---

## 4. Accuracy on non-native (L2) accented speech

This section decides the question. Every LoxeLingo user is, by definition, a learner. Accuracy on native speakers is irrelevant to us; accuracy on *learners* is the whole thing. And a mis-transcription is not a neutral failure — if it feeds a score, it is a **false accusation of a mistake the learner did not make**, which is the single most trust-destroying thing a learning app can do.

### 4.1 The read-speech number (closest to our use case)

On **L2-ARCTIC** (24 non-native English speakers, L1 = Arabic, Hindi, Korean, Mandarin, Spanish, Vietnamese; read sentences) vs **L1-ARCTIC** (identical prompts, native US speakers), with Whisper `medium.en` `[R]`:

| Condition | WER |
|---|---|
| L1-ARCTIC (native, read) | **4.63%** `[R]` |
| L2-ARCTIC (non-native, read) | **7.90%** `[R]` |

That is a **1.71× relative degradation** `[E]` on read speech. Source: [L2-ARCTIC corpus](https://psi.engr.tamu.edu/wp-content/uploads/2018/08/zhao2018interspeech.pdf) and evaluations built on it.

**This is the number to anchor on**, because our exercises are read-aloud prompts against a known target sentence — the easiest possible ASR condition. 7.9% WER on read L2 speech is genuinely usable for *transcription*. It is not obviously usable for *scoring* (see 4.3).

### 4.2 The conversational number (worse, and instructive about model size)

On **EdAcc** (Edinburgh International Accents of English Corpus, 40 h of dyadic conversation, 26 L2 English varieties, 51 different L1s) `[R]`, from [arXiv:2510.18374](https://arxiv.org/html/2510.18374v1):

| Model | WER on L2 speech | Min–max gap across accent groups |
|---|---|---|
| Whisper Large | **58.3%** `[R]` | **114.0 pp** `[R]` |
| Whisper Tiny | **96.0%** `[R]` | — |
| SeamlessM4T Large | 65.3% `[R]` | 52.7 pp `[R]` |
| SeamlessM4T Medium | 67.2% `[R]` | — |
| Whisper Large + fairness fine-tuning | 24.1% `[R]` | 30.8 pp `[R]` |

Two findings here matter enormously and neither is about the headline WER.

**Finding 1 — Whisper Tiny is at 96% WER on L2 speech.** Ninety-six percent word error rate is not degraded performance, it is noise. **This independently destroys the in-browser Whisper plan from section 2**, which was going to ship `tiny` because it is the only thing that fits in a 41 MB download and runs on a phone. Section 2 said the browser Whisper stack crashes on iOS; section 4 says that even where it runs, the only deployable checkpoint produces garbage on exactly our users. Those are two independent kills on the same option, which is about as clear as research findings get.

**Finding 2 — the 114-percentage-point spread across accent groups is the real problem, not the mean.** A uniformly-mediocre system can be calibrated around. A system that is fine for one L1 background and catastrophic for another cannot: it means **our scoring would be systematically harsher on some nationalities than others**. North American accents show the lowest error rates; Vietnamese and Thai the highest `[R]`. For a global language-learning product this is a discrimination problem with a product-liability shape, not just a quality problem. (The same literature reports 0.35 WER for Black speakers vs 0.19 for white speakers across five commercial ASR systems `[R]` — the bias is well-documented and not specific to L2 status.)

**Caveat, stated honestly:** EdAcc is spontaneous conversational speech, which is far harder than our read-aloud task. Do **not** quote 58.3% as "what we would get." Our expected operating point is much closer to the 7.9% L2-ARCTIC figure. But the *relative* findings — tiny models collapse, and the spread across accents is huge — transfer to our setting even if the absolute numbers do not.

### 4.3 The deeper problem: the language model hides the errors we want to find

For reference, Whisper Large-v3 reaches roughly **3–8% WER on clean native speech in Japanese and Spanish** `[R]` — both are high-resource languages and well served. So target-language coverage is not our problem.

Our problem is structural, and it is the same objection raised in §1.3. A strong ASR decoder is a *language model with an acoustic front-end*. Given a mangled utterance and a plausible sentence hypothesis, it snaps to the sentence. That is correct behaviour for dictation and exactly backwards for assessment:

- If the learner mispronounces and the ASR corrects it → we score them as correct → **the app teaches nothing and the user's errors fossilise.**
- If the learner is correct and the ASR mis-hears their accent → we score them as wrong → **the user loses trust and churns.**

The failure is asymmetric and both directions are bad. Worse, in a read-aloud drill we *give the model the target sentence*, so any prompt-conditioning or constrained decoding makes the snapping problem strictly worse.

This is why the pronunciation-assessment literature does **not** use transcripts. It uses GOP (Goodness of Pronunciation) over frame-level phone posteriors from a forced aligner, or newer segmentation-free variants, evaluated on corpora like **speechocean762** (5,000 utterances, 250 non-native speakers, half children, expert-annotated at sentence/word/phoneme level; 91,044 phoneme realisations of which 3,401 are mispronunciations) `[R]` ([arXiv:2104.01378](https://ar5iv.labs.arxiv.org/html/2104.01378)).

**Connecting to what streams 02/03 already established:** they found that DTW over *self-supervised features* beats human agreement on segmental scoring (0.576 vs 0.536), while explicit F0-DTW is near-useless (r ≈ 0.17), and that **duration and intensity carry the signal**. Every one of those methods needs **frame-level or phone-level representations**. A cloud STT API returns a string. **The API surface we can afford does not expose the signal we know works.** Building pronunciation scoring on top of transcripts would mean discarding stream 03's actual finding and substituting a worse proxy.

---

## 5. Can a web app reach the native OS speech engine?

**Plainly: no.** Not iOS `Speech` / `SFSpeechRecognizer` / the iOS 26 `SpeechAnalyzer`, and not Android `SpeechRecognizer`, from a page loaded in a browser.

The Web Speech API **is** the sandboxed bridge, and it is the only one. What sits behind that bridge is the browser vendor's choice, not the OS's:

- Safari's `webkitSpeechRecognition` is backed by Apple's dictation service, but we do not get `SFSpeechRecognizer`'s API surface — no on-device flag we control, no `requiresOnDeviceRecognition`, no segment timings, no per-word confidence, no alternatives control.
- Chrome's is backed by Google's cloud service (or SODA locally in 139+), **not** by Android's `SpeechRecognizer`.

There is no origin trial, no permission prompt, and no entitlement that changes this. The browser sandbox exists precisely to prevent it. This is settled and will not change.

### 5.1 Does a wrapper change it? Yes — completely, and that is the point.

A **Capacitor** (or Cordova/Tauri) shell changes the answer entirely, because the code is no longer in a browser sandbox — it is a native app that happens to render a WebView. Mature plugins exist and are maintained:

- [`@capgo/capacitor-speech-recognition`](https://github.com/Cap-go/capacitor-speech-recognition) — uses `SFSpeechRecognizer` on iOS (and the newer iOS 26 locale path where available), and the **on-device `SpeechRecognizer`** on recent Android. Supports Android, iOS, and Web. `[R]`
- [`@capacitor-community/speech-recognition`](https://www.npmjs.com/package/@capacitor-community/speech-recognition) — v7.x, actively maintained. `[R]`
- [Capawesome's plugin](https://capawesome.io/plugins/speech-recognition/) — multi-language, permission handling, event listeners. `[R]`

This is the path that makes all the "just use the free OS recognizer" advice true. **It is also the reason that advice keeps getting repeated at us and keeps being wrong: everyone giving it is describing a native app.**

### 5.2 What a wrapper actually costs us

This is not a technical decision, it is a distribution decision, and the costs are mostly non-engineering:

| Cost | Detail |
|---|---|
| **App Store review risk** | Guideline **4.2 (Minimum Functionality)** explicitly targets apps that are repackaged websites. A Capacitor shell around our existing Next.js app is the textbook case Apple rejects. Adding native speech is one of the few things that *helps* the argument, but approval is not assured and the appeal loop costs weeks. `[E]` |
| **Platform commission** | 15–30% of subscription revenue on iOS. Against ~$0.10/user/month of STT cost, **this is roughly 20–40× more expensive than the problem it solves.** `[E]` |
| **Release cadence collapse** | We go from continuous deploy to store review on every shipped change to native code. |
| **Two more build targets** | Xcode + signing certs + provisioning, Android keystore, two store listings, two review processes, crash reporting per platform. Ongoing, not one-time. |
| **Engineering** | Capacitor shell + plugin wiring: **1–2 weeks** `[E]`. Store submission, assets, review, first rejection cycle: **2–4 more weeks** `[E]`. |

**And here is the trap.** Having paid all of that, what we get back is `SFSpeechRecognizer` and Android `SpeechRecognizer` — **which return transcripts.** They are better than the Web Speech API (on-device, offline-capable, no vendor upload, no PWA breakage, some timing metadata) but they are still ASR, still snapped to a language model, still not phone-level GOP. **Going native fixes section 1's availability problem and section 3's cost problem — neither of which is our actual blocker — and does nothing about section 4, which is.**

If we ever go native, it should be because we want an App Store presence for distribution and payments, and voice comes along as a bonus. **Going native *in order to get voice* is paying a 30% revenue tax to solve a $0.10/month problem.**

---

## 6. Options compared

Cost is per active user per month at the §3.3 assumption of 20 audio-minutes.

| Option | Cost /user/mo | Browser availability | Accuracy on learner speech | Impl. effort | Privacy |
|---|---|---|---|---|---|
| **Web Speech API** | **$0** | Chrome ✓, Safari ✓, **Safari-in-PWA ✗**, Edge ✗ (silent no-op), Firefox ✗. ~10–15% desktop dead `[E]` | Unknown/unmeasurable — opaque `confidence`, no phone data. LM snapping hides errors | **Low (1 wk)** `[E]` but high hidden cost in per-browser workarounds + fallback | ✗ Audio → Google/Apple. Disclosure + GDPR exposure |
| **Cloudflare Workers AI** `whisper-large-v3-turbo` | **$0.010** `[E]` | **All browsers** (we record with `MediaRecorder`, POST the blob) | ~8% WER read L2 `[E]` (from L2-ARCTIC 7.9% `[R]`); large accent spread | **Low–medium (1–2 wk)** `[E]`; already on CF, no new vendor | ✓ Our infra, our DPA |
| **Groq** `whisper-large-v3-turbo` | $0.022 `[E]` (10 s min. billing) | All browsers | same as above | Low–medium `[E]` | New vendor + DPA |
| **OpenAI** `gpt-4o-mini-transcribe` | $0.060 `[E]` | All browsers | ~same tier `[E]` | Low `[E]` | New vendor + DPA |
| **Deepgram** Nova-3 multilingual | $0.096–0.154 `[E]` | All browsers | Strong on native; **not benchmarked on L2 by us** | Low–medium `[E]` | New vendor + DPA |
| **In-browser Whisper (WASM/WebGPU)** | **$0** marginal | Desktop Chrome ✓. **Crashes on iOS** `[R]`, crashes on Chrome Android `[R]` | **Whisper-tiny = 96% WER on L2** `[R]` — unusable | **High (4–6 wk)** `[E]` + 41–77 MB cold download `[R]` | ✓ Best possible — nothing leaves device |
| **Capacitor + native OS ASR** | **$0** | N/A — leaves the web | Better than Web Speech API; still transcript-only | **Very high (3–6 wk eng + 15–30% rev)** `[E]` | ✓ On-device |
| **Purpose-built pronunciation scoring** (GOP / SSL-feature DTW, self-hosted) | ~$0.02–0.10 `[E]` (GPU inference, unpriced) | All browsers | **The only option that measures what stream 03 showed works** | **Very high (8–12 wk)** `[E]` | ✓ Our infra |
| **Defer voice** | $0 | — | — | 0 | — |

---

## 7. Recommendation

### Defer voice. Do not ship it this round.

**Confidence: high (~85%)** that deferring is correct for this round.
**Confidence: medium (~65%)** on the specific re-entry conditions in §7.4 — those depend on product strategy I do not have full visibility into.

### 7.1 Why

The research question was "what can a browser do and what does it cost," and the answer came back **the opposite of what we expected on both axes**:

1. **Cost is a non-issue.** $0.01–0.15 per active user per month, against a subscription in the $10 range. If cost were the blocker we would ship tomorrow. It is not, so the cost analysis — the thing this brief was commissioned to produce — turns out not to be decision-relevant. Worth saying out loud so nobody re-litigates it.

2. **The free option is not free and not reliable.** The Web Speech API costs $0 in dollars, and costs us: a silent no-op on Edge that defeats feature detection, nothing at all on Firefox, **and a complete failure inside an installed iOS PWA** — i.e. it breaks precisely when a user takes the action we most want them to take. Plus a mandatory privacy disclosure naming Google and Apple as processors of our users' voices, with no DPA available to us.

3. **The offline option is a demo.** In-browser Whisper crashes on iOS and Chrome Android per the library's own tracker, needs a 41–77 MB cold download, and the only checkpoint small enough to ship posts **96% WER on L2 speech**. Two independent kills.

4. **And the thing that actually matters, we cannot buy.** Every affordable option returns **a transcript**. Streams 02/03 established that the pedagogically valid signal lives in **duration, intensity, and DTW over self-supervised frame-level features** — where that machinery *beats human raters* (0.576 vs 0.536). None of that is reachable through a string. Worse, the ASR language model **actively conceals** learner errors by snapping mangled audio onto the intended sentence, which for an assessment product is not a limitation but an inversion.

### 7.2 The honest framing of the trap

There is a version of this feature that is cheap and fast: wire up `webkitSpeechRecognition`, string-match the transcript against the target sentence, show a green tick or a red cross. **One week, zero dollars.** It will demo beautifully.

It will also:
- do nothing on Edge, Firefox, or any installed iOS PWA;
- pass learners whose pronunciation is bad, because the LM fixed it for them;
- fail learners whose pronunciation is fine, disproportionately those with Vietnamese, Thai, or other under-represented L1s (**114 pp spread across accent groups** `[R]`);
- and attach a **number** to that, which users will read as a judgment of their speech.

**A pronunciation score that is wrong in an accent-correlated way is worse than no pronunciation score.** It is the one failure mode a language-learning product cannot recover from, because the user's own belief about their pronunciation is exactly what they came to us to calibrate. We would be miscalibrating it, with a confident-looking number, unevenly by nationality.

I want to be clear this is the actual recommendation and not hedging: **ship no voice rather than ship that.**

### 7.3 What to do instead, this round

- **Ship nothing voice-shaped.** No mic button, no "coming soon" placeholder that implies it.
- **Do collect the cheap option value:** if there is appetite for *any* audio, ship **listening** (TTS playback of target sentences) rather than speaking. It is one-directional, has no accuracy or bias surface, works everywhere including iOS PWAs, and covers a real chunk of the pedagogical value at a fraction of the risk. `[E]`
- **Optional, low-cost, high-information:** a **shadowing / self-assessment** exercise — record the learner, play their audio back next to the reference, and let *them* judge. Uses `MediaRecorder` only, works in every browser, needs no ASR, costs nothing, produces zero false judgments, and — critically — **generates a corpus of real LoxeLingo learner audio** that we would need before we could ever evaluate a scoring model honestly. This is the highest-leverage thing on the list.

### 7.4 What would change this decision

Precisely these, roughly in order of how much they would move me:

1. **We decide to go native anyway** (App Store distribution, payments, push). Then Capacitor + on-device `SFSpeechRecognizer`/`SpeechRecognizer` is free, private, offline, and PWA-proof, and voice should ride along immediately. **This is the most likely trigger and it is a distribution decision, not a voice decision.**
2. **We accept transcript-only, non-scoring voice.** If voice is used for *input* (say the answer instead of typing it) rather than *assessment*, the entire section 4 objection evaporates — a wrong transcript is a mild annoyance, not a false accusation. **Cloudflare Workers AI `whisper-large-v3-turbo` at ~$0.010/user/month, server-side, all browsers, our own DPA.** If someone wants voice this round, *this* is the version to argue for, and I would support it. It is a different feature from the one being proposed.
3. **We commit to real pronunciation assessment as a differentiator** and staff it as an 8–12 week ML project — GOP or SSL-feature DTW, self-hosted, evaluated against `speechocean762` and on our own learner audio, with per-L1 error reporting as a release gate. Only worth it if voice is *the* wedge.
4. **The iOS PWA speech bug is fixed by Apple**, verified on device. Removes the worst availability failure and makes the free option genuinely free. Re-test each iOS release.
5. **transformers.js closes the iOS memory bugs** ([#1241](https://github.com/huggingface/transformers.js/issues/1241), [#1242](https://github.com/huggingface/transformers.js/issues/1242), [#1298](https://github.com/huggingface/transformers.js/issues/1298)) *and* a small multilingual checkpoint posts credible L2 WER. Both are needed; the second is the harder one and is not close.
6. **Chrome/Edge on-device `processLocally` matures** past its current bug set and reaches Safari. Solves privacy and offline, not accuracy.

**Suggested review date: ~6 months, or immediately upon any decision to ship a native app.**

### 7.5 What I could not establish

Stated so nobody mistakes silence for evidence:

- **No measured WER for any provider on our actual task** — Japanese and Spanish read-aloud by English-L1 beginners. The 7.9% L2-ARCTIC figure is *English* L2 speech. This is the single biggest gap, and closing it needs our own audio, which we do not have (see §7.3's shadowing suggestion).
- **No published mid-range-phone RTF** for browser Whisper. The 0.7–1.5× figure in §2.2 is my extrapolation, marked `[E]`.
- **Deepgram batch price is ambiguous** between $0.0043 and $0.0048/min across sources (§3.1). Immaterial to the recommendation; verify before contracting.
- **Android installed-PWA speech is untested on a real device** — I found no failure reports, so I inferred it works. Should be verified rather than assumed.
- **Deepgram Nova-3's L2/accented WER is not independently benchmarked here**; I did not find non-vendor L2 figures. If we later want the best transcript quality, this is worth a real bake-off against our own audio, not against vendor marketing.

---

### Sources

- [caniuse: Speech Recognition API](https://caniuse.com/speech-recognition)
- [MDN: SpeechRecognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition) · [processLocally](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/processLocally) · [Using the Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API/Using_the_Web_Speech_API)
- [mdn/browser-compat-data#22126 — Edge does not actually support SpeechRecognition](https://github.com/mdn/browser-compat-data/issues/22126)
- [Microsoft Learn: SpeechRecognition API in Edge](https://learn.microsoft.com/en-us/microsoft-edge/web-platform/speech-recognition-api) · [Edge blog, on-device AI, 2026-06-02](https://blogs.windows.com/msedgedev/2026/06/02/expanding-on-device-ai-in-microsoft-edge-new-models-and-apis-for-the-web/)
- [WebAudio/web-speech-api: on-device speech recognition explainer](https://github.com/WebAudio/web-speech-api/blob/main/explainers/on-device-speech-recognition.md) · [crbug 444393111](https://issues.chromium.org/issues/444393111) · [brave-browser#55414](https://github.com/brave/brave-browser/issues/55414)
- [Apple Developer Forums 748048 — webkitSpeechRecognition in PWA](https://developer.apple.com/forums/thread/748048) · [775699 — interimResults on iOS](https://developer.apple.com/forums/thread/775699) · [WICG/speech-api#96 — Safari issues](https://github.com/WICG/speech-api/issues/96)
- [addpipe: A Deep Dive into the Web Speech API](https://blog.addpipe.com/a-deep-dive-into-the-web-speech-api/)
- [onnx-community/whisper-tiny.en](https://huggingface.co/onnx-community/whisper-tiny.en/tree/main/onnx) · [onnx-community/whisper-base](https://huggingface.co/onnx-community/whisper-base/tree/main/onnx)
- [whisper.cpp whisper.wasm README](https://github.com/ggml-org/whisper.cpp/blob/master/examples/whisper.wasm/README.md) · [ggml.ai stream.wasm demo](https://ggml.ai/whisper.cpp/stream.wasm/)
- transformers.js issues: [#740](https://github.com/huggingface/transformers.js/issues/740) · [#860](https://github.com/huggingface/transformers.js/issues/860) · [#953](https://github.com/huggingface/transformers.js/issues/953) · [#958](https://github.com/huggingface/transformers.js/issues/958) · [#973](https://github.com/huggingface/transformers.js/issues/973) · [#1241](https://github.com/huggingface/transformers.js/issues/1241) · [#1242](https://github.com/huggingface/transformers.js/issues/1242) · [#1298](https://github.com/huggingface/transformers.js/issues/1298)
- [SitePoint: WebGPU vs WebAssembly, transformers.js](https://www.sitepoint.com/webgpu-vs-webasm-transformers-js/) · [gpuweb Implementation Status](https://github.com/gpuweb/gpuweb/wiki/Implementation-Status)
- [Cloudflare Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/) · [Deepgram pricing](https://deepgram.com/pricing) · [Groq STT pricing (apio)](https://apio.sh/apis/groq-speech-to-text) · [OpenAI transcription pricing, Aug 2026 (costgoat)](https://costgoat.com/pricing/openai-transcription)
- [L2-ARCTIC: A Non-native English Speech Corpus (Interspeech 2018)](https://psi.engr.tamu.edu/wp-content/uploads/2018/08/zhao2018interspeech.pdf)
- [Towards Fair ASR for Second Language Speakers using Fairness Prompted Finetuning (arXiv:2510.18374)](https://arxiv.org/html/2510.18374v1)
- [speechocean762 (arXiv:2104.01378)](https://ar5iv.labs.arxiv.org/html/2104.01378) · [Segmentation-free Goodness of Pronunciation (arXiv:2507.16838)](https://arxiv.org/html/2507.16838)
- [Evaluating OpenAI's Whisper ASR across accents and speaker traits (JASA Express Letters)](https://pubs.aip.org/asa/jel/article/4/2/025206/3267247/Evaluating-OpenAI-s-Whisper-ASR-Performance)
- Capacitor plugins: [@capgo/capacitor-speech-recognition](https://github.com/Cap-go/capacitor-speech-recognition) · [@capacitor-community/speech-recognition](https://www.npmjs.com/package/@capacitor-community/speech-recognition) · [Capawesome](https://capawesome.io/plugins/speech-recognition/)

