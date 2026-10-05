# Shortcut server

Run the porter on your computer and use it from an **iOS shortcut**: pick a photo on the
iPhone, and the patched HEIC comes back to your photo library a few seconds later.

The server runs the unmodified `photographic_style_port.py`, so results are identical to the
command-line tool, including the default encoder mode the iPhone cannot run on its own.
Photos are processed in a temporary folder and deleted as soon as they are sent back.

## Start it

Double-click the launcher for your system:

| System        | Launcher                                  |
| ------------- | ----------------------------------------- |
| Windows       | `Start Shalielie Server.cmd`              |
| macOS / Linux | `start-server.command` (Linux: run it in a terminal) |

A console window shows the address and a status page opens in your browser. Close the window
to stop the server.

Requirements are the same as for the command-line tool (see the [main README](../README.md#install-from-source)):
[uv](https://docs.astral.sh/uv/), plus `ffmpeg` for full results. Without `ffmpeg` the server
falls back to the [no-encoder mode](../README.md#no-encoder-mode) and says so on the status page.

## Address

```
http://shalielie.local:8765/patch
```

`shalielie.local` is announced over mDNS (Bonjour) by the optional `zeroconf` package, which
the launcher installs through uv. If the name does not resolve on your iPhone, use one of the
IP addresses printed in the console. VPN, proxy TUN (Clash/Mihomo), ZeroTier and virtual-machine
adapters are not advertised, since an iPhone on the same Wi-Fi cannot reach them.

The server only answers devices on the local network.

## First run

- **Windows** asks whether Python may use the network: allow it on **private networks**.
- **iPhone**: Shortcuts asks to access the **local network** the first time: allow it.
- The iPhone and the computer must be on the same Wi-Fi. Guest networks and routers with
  "AP isolation" block this.

## The shortcut

The status page walks through it, with your actual address filled in:

1. **Select Photos**
2. **Get Contents of URL** — URL `http://shalielie.local:8765/patch`, Method **POST**,
   Request Body **Form**, one **File** field `photo` = Photos
3. **Get Details of Files** → File Extension (of Contents of URL)
4. **If** File Extension is `heic` → **Save to Photo Album**; **Otherwise** → **Show Result**

## API

`POST /patch` with the HEIC as the raw body (`?name=IMG_1234.HEIC` optional) or as
`multipart/form-data`. Responses:

| Status | Body                                  | When                                              |
| ------ | ------------------------------------- | ------------------------------------------------- |
| 200    | patched HEIC (`image/heic`)           | `X-Shalielie-Mode: port` or `add-texture`         |
| 409    | text                                  | nothing to do (e.g. an iPhone 18 photo)           |
| 415    | text                                  | not a HEIC — usually a JPEG that iOS converted     |
| 422    | text                                  | the porter refused the photo; the message says why |

`GET /api/status` returns the server's mode, addresses and recent jobs as JSON.

Options: `--port`, `--name` (mDNS host name), `--ip` (advertise a specific address),
`--no-encoder`, `--no-browser`. Pass them after the launcher name, or run
`uv run --group server python shortcut-server/server.py --help`.
