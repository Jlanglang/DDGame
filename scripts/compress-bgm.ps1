# 压缩 assets/sounds/bgm.mp3（适合网页背景音乐）
# 用法: .\scripts\compress-bgm.ps1
# 需已安装 ffmpeg 并加入 PATH: winget install Gyan.FFmpeg

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Src = Join-Path $Root 'assets\sounds\bgm.mp3'
$Out = Join-Path $Root 'assets\sounds\bgm.compressed.mp3'
$Backup = Join-Path $Root 'assets\sounds\bgm.original.mp3'

if (-not (Test-Path $Src)) {
  Write-Error "找不到 $Src"
}

$ffmpeg = Get-Command ffmpeg -ErrorAction SilentlyContinue
if (-not $ffmpeg) {
  Write-Host '未找到 ffmpeg。请先安装：'
  Write-Host '  winget install Gyan.FFmpeg'
  Write-Host '安装后重新打开终端，再运行本脚本。'
  exit 1
}

$before = (Get-Item $Src).Length
Write-Host "原文件: $([math]::Round($before/1MB, 2)) MB"

# 96kbps 立体声 / 44.1kHz，小游戏 BGM 通常够用；要更小可改为 -b:a 64k 或 -ac 1
& ffmpeg -y -i $Src -codec:a libmp3lame -b:a 96k -ar 44100 -ac 2 $Out

if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$after = (Get-Item $Out).Length
Write-Host "压缩后: $([math]::Round($after/1MB, 2)) MB ($([math]::Round(100*$after/$before))%)"

if (-not (Test-Path $Backup)) {
  Copy-Item $Src $Backup
  Write-Host "已备份原文件 -> bgm.original.mp3"
}

Move-Item -Force $Out $Src
Write-Host '已替换 assets/sounds/bgm.mp3，刷新游戏即可。'
