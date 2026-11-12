# Cockpit QA Lab

An interview-ready, **BMW M4-inspired simulated infotainment test bench**. A Python state machine drives a visible cockpit, connectivity events, simulated vehicle signals, and automated validation with expected versus actual evidence.

> The cabin, Android Auto status, Bluetooth, USB and vehicle signals are simulated. The **AAOS LIVE** switch can display and touch a real Android Automotive OS emulator in the multimedia screen. It does not connect to a BMW, CarPlay, or a real Android Auto head unit.

## Run the cockpit

Requires Python 3.10+; the app itself has no third-party dependencies.

```bash
cd cockpit-qa-lab
python3 server.py
```

Open **http://127.0.0.1:8765**. Stop with `Ctrl+C`.

In **Cockpit**, use the event controls to change phone, Bluetooth, USB, reverse gear, door and speed. In **Validação**, select a scenario and click **Run validation**. The browser switches to the cockpit while the Python runner drives it, then returns to the report. Enable **Inject a reproducible defect** to demonstrate a failing reconnection test. **Telemetria** shows current signals and the event timeline. The report can be downloaded as JSON.

### Show the real Android Automotive emulator in the dashboard

This uses the official AAOS image, ADB screen capture, and ADB touch input. The emulator image is a large download. From `cockpit-qa-lab`, in a second terminal:

```bash
bash scripts/setup_aaos.sh
bash scripts/start_aaos.sh
```

Wait until `adb -s emulator-5556 shell getprop sys.boot_completed` returns `1`. The **AAOS READY · SHOW LIVE** button then appears in the multimedia header. Click it to switch from the simulated media UI to the actual Android Automotive screen. Clicking the image sends a touch to the emulated Android device. The speed slider also sets the real AAOS VHAL speed, gear and parking brake; 72 km/h in the cockpit appeared as approximately 45 mph on the emulated instrument cluster. Without `/dev/kvm`, the first boot can be slow. The Web cockpit still runs independently.

The live Android screen is **a separate integration track**: the Python media recovery scenarios currently assert the simulated connectivity state, not AAOS system behavior or VHAL properties.

## Interview demo (2 minutes)

1. Show the cockpit and explain that it is a visual HMI backed by a deterministic Python simulator.
2. Run **Phone reconnection & media recovery** without fault injection. It should pass 3/3 assertions.
3. Run it again with fault injection. It should fail 2/3 assertions, showing expected versus actual `media_playing` state.
4. Open **Telemetria** and explain how the event trail helps root cause analysis.
5. If AAOS is running, switch the multimedia display to **AAOS LIVE** and show the actual emulated Android UI.

## Architecture

```text
Browser HMI (HTML/CSS/JS)
    │ REST + polling
    ▼
Python HTTP server ──► Cockpit state machine ──► event log
    │                         ▲
    └──► Python QA runner ────┘
              │
              ▼
      JSON report: steps, expected/actual, final state

Optional: Selenium → browser HMI
Optional: Appium/UiAutomator2 → AAOS UI smoke test
Optional: SocketCAN → demo signal adapter → REST API
```

## Run automated tests

Core tests, no dependencies:

```bash
python3 -m unittest discover -s tests -p 'test_cockpit.py' -v
```

Browser test, with Chromium/Chrome and matching driver installed:

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/python -m unittest discover -s tests -p 'test_ui_selenium.py' -v
```

If `python3 -m venv` is unavailable, use `uv venv .venv` and `uv pip install --python .venv/bin/python -r requirements-dev.txt`. The Selenium test starts its own local server, checks that the BMW cockpit is visible, injects a reproducible fault, checks the failed assertion and saves screenshots to `artifacts/`.

## Android Appium smoke test

With AAOS booted, install the Appium server, UiAutomator2 driver, and Python client:

```bash
npm install
APPIUM_HOME="$PWD/.appium" ./node_modules/.bin/appium driver install uiautomator2
python3 -m venv .venv
.venv/bin/pip install -r requirements-android.txt
ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-$HOME/android-sdk}" ANDROID_HOME="${ANDROID_SDK_ROOT:-$HOME/android-sdk}" APPIUM_HOME="$PWD/.appium" npm run appium
```

In another terminal, run `.venv/bin/python adapters/appium_android_smoke.py`. It reads the Android UI hierarchy, sends a BACK key, and saves a real emulator screenshot. This is separate from the simulated media recovery scenario.

## Other integrations

- **SocketCAN:** `adapters/socketcan_bridge.py vcan0` receives frames from a Linux CAN interface and forwards demo speed, gear and door signals to the cockpit. IDs `0x100`, `0x101`, `0x102` are a **project-defined demo contract**, not BMW vehicle IDs or a BMW DBC. A `vcan0` interface must be created outside the app first.
- **Android Auto:** Google's [Desktop Head Unit](https://developer.android.com/training/cars/testing/dhu) can be used for a later hardware-backed track with a phone. This demo does not automate the DHU.
- **CarPlay/iOS:** future hardware-backed track; no simulated result is presented as an Apple integration.

## Stack mapping

| Job requirement | Evidence here |
|---|---|
| Python | Simulator, HTTP API, QA runner, assertions |
| Selenium / Web | Real browser smoke test and screenshots |
| Appium / UI Automator / Android | Official AAOS emulator displayed in the dashboard; Appium smoke adapter |
| Linux Shell | Local commands, optional SocketCAN adapter |
| Bluetooth / USB / Android Auto | Simulated connectivity state and scenarios |
| CAN / embedded systems | Simulated vehicle signals, optional SocketCAN input, live AAOS VHAL speed injection |
| Git / CI | Source-controlled app and GitHub Actions workflow |
| Root cause analysis | Timestamped events, expected/actual values, exported JSON |

The UI uses the BMW name for a portfolio simulation and contains an original CSS dashboard and steering wheel. It is not affiliated with BMW.
