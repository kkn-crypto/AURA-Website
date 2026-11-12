# AURA Desktop UI

React 19, Vite 8, and Electron 44 UI for a local AURA Python backend. The package lockfile is included. `node_modules/` and generated `dist/` output are intentionally not included.

## Prerequisites

- macOS 12 or later for the current Electron workflow.
- Node.js 22.12+ and npm 10+.
- CPython 3.10+; CPython 3.12 is recommended. Install shared dependencies from the submission-root `requirements.txt`.
- macOS camera permission for the launching application/terminal when real vision is explicitly started.
- Bundled YuNet/SFace model files under `legacy_face_app/models/`.

## Development start

From the submission root, first create the Python environment as shown in `read.txt`. Then in Terminal 1:

```sh
cd ui
npm install
AURA_PYTHON_EXECUTABLE="../.venv/bin/python" npm run dev
```

`npm run dev` starts Vite on a free loopback port and launches Electron. In the UI, select **Connect backend** to spawn the local Python backend. This starts the API in camera-free mode. In Preferences, select **Start real vision** to load local models and acquire cameras. Stop real vision to release the stereo pair; stop the backend when finished.

`npm run build` creates `ui/dist/`; `npm start` launches the built Electron application after the build. `npm run dev:web` starts only the web dev server and does not provide the Electron-managed backend lifecycle.

## Backend boundary

Electron starts `../backend/server.py` through `electron/backendClient.cjs`. It generates a random bearer token in the main process, accepts the backend's dynamically assigned loopback port, and uses an authenticated HTTP client. The renderer sees only a narrow context-isolated preload bridge; it cannot select arbitrary backend URLs or access Node APIs. `AURA_PYTHON_EXECUTABLE` overrides the default `python3` executable. The integrated adapter binds only to `127.0.0.1`.

The UI's **Start local simulation** path is mock UI state. **Connect backend** uses the Python adapter; cameras remain off until **Start real vision**. Even real vision currently means camera-paired face detection/tracking/recognition. Metric stereo depth remains `UNAVAILABLE` / `UNVALIDATED` and no distance is returned. Pan/tilt values are simulated; ESP32 is disconnected.

## Environment variables

| Variable | Default | Behavior |
|---|---|---|
| `AURA_PYTHON_EXECUTABLE` | `python3` | Electron child interpreter for `backend/server.py`. |
| `AURA_LEFT_CAMERA` | `1` | Physical stereo LEFT index; must be 0 or 1. |
| `AURA_RIGHT_CAMERA` | `0` | Physical stereo RIGHT index; must differ from LEFT. |
| `AURA_FACE_CAMERA` | LEFT index | Camera index used for face processing; must be one of the pair. |
| `AURA_CAMERA_WIDTH` / `AURA_CAMERA_HEIGHT` | `640` / `480` | Requested camera dimensions. |
| `AURA_MAX_STEREO_SKEW_S` / `AURA_MAX_FRAME_AGE_S` | `0.030` / `0.250` | Software read timestamp pairing and freshness limits. Not sensor synchronization. |
| `AURA_FACE_MATCH_THRESHOLD` | `0.6` | Local recognition match threshold in [0,1]. |
| `AURA_YUNET_MODEL` / `AURA_SFACE_MODEL` | bundled model paths | Optional model path overrides; no download occurs in integrated backend. |
| `AURA_IDENTITY_DATABASE` | `~/.aura_stereo/faces_db.json` | Local identity database path. The database is not shipped. |
| `AURA_STEREO_SOURCE` | `../AURA_Stereo_Vision/src` resolved from package root | Packaged source-path override for the camera/face modules. |

`AURA_DEV_SERVER_URL` and `AURA_UI_PORT` are internal variables set by `npm run dev` for Electron/Vite coordination; do not set manually during normal use.

## Tests and build

```sh
npm test
npm run build
```

Backend tests run from the submission root: `python -m unittest discover -s backend -p 'test_*.py' -v`. See `../docs/TESTING.md` for the completed check record.

## Troubleshooting

If Electron reports a backend startup/import error, confirm the Python venv and model files exist, then verify `AURA_PYTHON_EXECUTABLE` is correct. Camera errors occur only after explicitly starting real vision; allow macOS camera permissions and close other camera applications. Face identity data stays local. AWS is not configured. Software STOP is not a physical emergency stop.
