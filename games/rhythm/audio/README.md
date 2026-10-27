# 节奏豆豆 · 采样

游戏里的**鼓、旋律、木鱼、铃声**都是真取样，不是合成音。共 10 个 one-shot，合计 **178 KB**，
全部 22050 Hz / 单声道 / 16-bit。

## 来源

### 鼓机 —— [`MckAudio/MckSamplePacks`](https://github.com/MckAudio/MckSamplePacks)

**CC0-1.0（公有领域）**。作者 MckAudio，采样自他手上的鼓机（TR-8 的 808/909 套件、RD-6 等）。

| 游戏内文件 | 上游文件 | 长度 | 大小 |
|---|---|---|---|
| `kick909.wav` | `TR8/BD/004_909_Bass_Drum_1.wav` | 450 ms | 19 KB |
| `kick808.wav` | `TR8/BD/001_808_Bass_Drum_1.wav` | 550 ms | 24 KB |
| `snare909.wav` | `TR8/SD/005_909_Snare_Drum_1.wav` | 320 ms | 14 KB |
| `hatC.wav` | `TR8/HATS/008_909_Closed_HiHat.wav` | 100 ms | 4 KB |
| `hatO.wav` | `TR8/HATS/007_909_Open_HiHat.wav` | 550 ms | 24 KB |
| `clap.wav` | `RD6/CLAP/003.wav` | 320 ms | 14 KB |

### 乐器 —— [`sgossner/VSCO-2-CE`](https://github.com/sgossner/VSCO-2-CE)

**CC0-1.0（公有领域）**，Versilian Studios Chamber Orchestra 2 Community Edition。

| 游戏内文件 | 上游文件 | 用途 | 长度 | 大小 |
|---|---|---|---|---|
| `mariC4.wav` | `Percussion/Marimba/Marimba_hit_Outrigger_C4_loud_01.wav` | 旋律低音区（基音 261.63 Hz） | 550 ms | 24 KB |
| `mariC6.wav` | `Percussion/Marimba/Marimba_hit_Outrigger_C6_loud_01.wav` | 旋律高音区（基音 1046.50 Hz） | 450 ms | 19 KB |
| `claves.wav` | `Percussion/Claves1_Hit_v1_rr1_Sum.wav` | 「啵」和节拍器 | 140 ms | 6 KB |
| `bell.wav` | `Percussion/BellTree_Stroke1_v1_Sum.wav` | 接听关的铃声 | 700 ms | 30 KB |

`kick808.wav` 和 `hatO.wav` 目前没被 `music.js` 用上，留着给以后的关卡换音色。

## 处理

用 `prep-samples.py` 统一处理：

1. 混成单声道
2. 重采样到 **22050 Hz**（线性插值，体积减半）
3. 按峰值 2% 的阈值裁掉开头静音（保留 2ms 余量）
4. 按上表长度截断
5. 末尾 12ms 淡出（避免截断爆音）
6. 峰值归一化到 **0.89（−1 dBFS）**
7. 存成 16-bit PCM

## 播放

`music.js` 的 `Engine.loadSamples()` 在 `init()` 时 `fetch` + `decodeAudioData`，结果缓存在
`_samples` 里，之后一直复用（不重复请求）。

**起音乐前会等采样就绪**：`game.js` 在 `audio.unlock()` 之后 `await audio.ready()`，
所以第一声就是采样，不会出现「开头一声是合成音」的落差。
采样缺失（文件删了、断网）时才回落到原来的合成音色，游戏不会静音。

变调方式：马林巴按 `f / 基音` 设 `playbackRate`，低音区用 C4、高音区（≥700Hz）用 C6；
木鱼和铃是固定音高，只给「啵」按谱面轻微变调。

采样默认从页面相对的 `audio/` 取；离线渲染时可以改 `engine.sampleBase`。
