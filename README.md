# FablePlayer 🎵

FablePlayer is an elegant, open-source desktop music player designed to unify your music libraries. It connects directly to platforms like SoundCloud, allowing you to listen to all your music in one ad-free app with a premium, responsive interface.

---

## Repository Structure

- **`/src/apps/desktop/electron/fableplayer`**: The desktop client application (Electron, Vite, React, TypeScript).
- **`/serverbackend`** (External/separate folder): The authentication & API proxy backend server.

---

## Features

- **SoundCloud Integration**: OAuth 2.1 authentication with PKCE via backend proxy.
- **Unified Interface**: Modern dark-cream design with smooth layouts, glassmorphism, and micro-animations.
- **Discord Presence**: Rich Presence support showing your currently playing tracks.
- **Custom Frameless Window**: Custom draggable titlebar with custom OS window controls.

---

## Getting Started

### 1. Run the Backend Server
Make sure your backend server is configured (e.g. `.env` with SoundCloud Client ID/Secret) and running on `http://16.16.74.196:3000`.

### 2. Run the Desktop App
Navigate to the desktop app folder:
```bash
cd src/apps/desktop/electron/fableplayer
```

Install dependencies:
```bash
npm install
```

Start the application in development mode:
```bash
npm run dev
```

Build the production installer (Windows):
```bash
npm run build:win
```
The output installer will be generated in the `./dist` folder as `fableplayer-<version>-setup.exe`.
