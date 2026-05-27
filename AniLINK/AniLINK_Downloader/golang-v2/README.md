# AniLINK Downloader Go v2

Termux-first Go port of `get-m3u.py`, preserving the Python downloader's behavior: M3U parsing, referer/subtitle support, HLS variant selection, ffmpeg remuxing to MKV, retries, existing-file prompts, debug logs, and a scrollable terminal progress UI.

## Termux

```sh
go build -o anilink ./cmd/anilink
./anilink
```

If ffmpeg is missing, the app offers to run `pkg install -y ffmpeg`.

## Windows

```powershell
go build -o AniLINK.exe ./cmd/anilink
.\AniLINK.exe
```

If ffmpeg is missing, the app offers to download a minimal gyan.dev build into `.ffmpeg` and adds it to PATH for the current run.

## Debug logs

```sh
./anilink --debug
```

Logs are written to `./debug` per attempt.
