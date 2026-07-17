# Tempo native wrappers (iOS · Windows)

Tempo already runs as an installable PWA on iPhone, Windows and any browser, and
**Web Push reminders work in that PWA** (iOS 16.4+ when added to the Home Screen,
Windows/desktop Chrome & Edge, macOS Safari) — no native app required.

This folder is the **scaffold for the deeper OS integration** that only a true
native shell can provide: App Store / Microsoft Store distribution, Home/Lock
Screen **widgets**, iOS **Live Activities**, the Action Button, and Apple Watch.

> ⚠️ **These require a build toolchain that can't run in a headless CI box.**
> iOS needs a **Mac with Xcode** (and an Apple Developer account to sign);
> Windows packaging needs **Visual Studio / MSIX tooling**. The files here are a
> correct starting point you compile on your own machine — they are intentionally
> *not* built or signed for you.

---

## Recommended approach: Capacitor

[Capacitor](https://capacitorjs.com) wraps the existing Tempo web app in a native
iOS (and Android) shell with almost no code — the web UI you already have becomes
the app, and you add native widgets/Live Activities alongside it.

### One-time setup (on your Mac)

```bash
cd tempo/native
npm install
# point the shell at your deployed Tempo server (or bundle the client — see below)
npx cap add ios
npx cap sync
npx cap open ios     # opens Xcode; set your signing team, then Run
```

`capacitor.config.json` is set to load your hosted Tempo URL, so the native app
is a thin, always-up-to-date shell over your server (same login, same data). To
ship a fully offline-capable bundle instead, copy `../public` into a `www/` folder
and remove the `server.url` line.

### Push in the native shell

Web Push already covers reminders in the PWA. In a Capacitor iOS build you can
additionally use **APNs** via `@capacitor/push-notifications` for the most
reliable delivery and Critical Alerts — register the device token and POST it to a
small `/api/apns/subscribe` endpoint (mirror `push_subs`), then send from the
server with an APNs library. This is the Phase-2 upgrade described in the design;
the Web Push path in `server/push.js` is the working baseline.

---

## iOS Home/Lock Screen widget (WidgetKit)

`ios-widget/TempoWidget.swift` is a working **WidgetKit** starting point: a
timeline provider that fetches today's tasks from your Tempo server and shows the
next few, plus a done/total count. Add it as a **Widget Extension** target in the
Xcode project Capacitor generates:

1. Xcode → File → New → Target → **Widget Extension** → name it `TempoWidget`.
2. Replace the generated Swift with `ios-widget/TempoWidget.swift`.
3. Set `tempoBaseURL` and a read token (store it in the App Group shared with the
   main app so a login carries over).
4. For a **Live Activity** focus timer, add `ActivityKit` and start an activity
   when a focus session begins (the web app can bridge via a Capacitor plugin).

## Windows

The simplest Windows "app" is the **installed PWA** (Edge/Chrome → Install Tempo),
which already gives a Start-menu entry, its own window, and Web Push. For a true
native desktop app with a tray and global hotkey, wrap the web client with
[Tauri](https://tauri.app) (`tauri.conf.json` pointing at your server URL) or
build a WinUI 3 shell hosting a WebView2 — both out of scope to build here, but
straightforward given the app is a standard web client.

---

## What's honestly done vs. pending

| Capability | Status |
| --- | --- |
| Cross-platform push reminders (PWA, app closed) | ✅ working (`server/push.js` + service worker) |
| Installable app on iOS / Windows / browser | ✅ working (PWA) |
| App Store / Store distribution | 🧩 scaffold — build in Xcode / VS |
| Home/Lock Screen widgets | 🧩 `TempoWidget.swift` starting point |
| Live Activities / Watch / Action Button | 🧩 documented next step |
| APNs Critical Alerts | 🧩 documented next step |
