# 音效

来自 [Kenney Interface Sounds](https://kenney.nl/assets/interface-sounds)（**CC0**，可商用，无需署名）。

| 文件 | 用途 |
|------|------|
| flip.wav | 翻牌 |
| match.wav | 配对成功 |
| mismatch.wav | 配对失败 |
| win.wav | 过关 |
| fail.wav | 失败 |
| click.wav | 按钮 / 选关 |
| bgm.mp3 | 背景音乐（建议 &lt; 1MB，见下方压缩） |

替换 WAV 后刷新页面即可；文件名保持一致。

### 缩小 bgm.mp3

原文件约 3MB+ 时加载偏慢，建议压到 **96kbps** 左右（通常几百 KB～1MB）：

```powershell
winget install Gyan.FFmpeg
.\scripts\compress-bgm.ps1
```

或手动（需 [ffmpeg](https://ffmpeg.org/)）：

```bash
ffmpeg -i assets/sounds/bgm.mp3 -codec:a libmp3lame -b:a 96k -ar 44100 -ac 2 assets/sounds/bgm-small.mp3
```

仍嫌大可把 `96k` 改成 `64k`，或加 `-ac 1` 转单声道。
