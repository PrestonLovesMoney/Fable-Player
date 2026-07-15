# FablePlayer 🎵

FablePlayer is an open-source music player designed to unify your music experience. It connects to platforms like SoundCloud (and Spotify in the future) to let you listen to all your music in one gorgeous, ad-free app.

## Features (v1 MVP)

- **SoundCloud Integration**: Secure user authentication using SoundCloud's latest OAuth 2.1 protocol with PKCE.
- **Unified Interface**: Premium dark-cream interface featuring smooth layouts, glassmorphism, responsive sidebar navigation, and subtle micro-animations.
- **Frameless Window**: Custom drag-and-drop title bar and OS window controls.
- **SoundCloud API Client**: Fetch user profile, playlist lists, liked tracks, and search SoundCloud catalog.

---

## Technology Stack

- **Core Framework**: Electron (Desktop platform)
- **Frontend library**: React (Vite-powered renderer)
- **Programming Language**: TypeScript
- **Styling**: Vanilla CSS with unified Design Tokens variables

---

## Setup & Installation

### Prerequisites

- **Node.js** (v18 or higher recommended)
- **SoundCloud Client ID & Secret**: Configure credentials in environment variables or in `.env` inside the desktop Electron app folder under `src/apps/desktop/electron/`.

### Quick Start

1. Clone or navigate to the project directory.

2. Go to the desktop app folder:

```bash
cd src/apps/desktop/electron/fableplayer

If that path is missing, run:

.\scripts\rename-app-folder.ps1

from the repo root, then retry.

Enter your SoundCloud credentials in .env and register:
fableplayer://callback

as the redirect URI in the SoundCloud app settings.

Install dependencies:
npm install
Run the application:
npm run dev
Repository Structure
FablePlayer/
├── src/
│   ├── apps/
│   │   └── desktop/
│   │       └── electron/
│   │           └── fableplayer/
│   │               ├── src/main/      # Main process (OS, protocol, OAuth)
│   │               ├── src/preload/   # Secure bridge
│   │               └── src/renderer/  # React UI
├── serverbackend/                     # Optional backend (OAuth proxy & API)