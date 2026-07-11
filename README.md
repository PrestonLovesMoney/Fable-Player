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
- **SoundCloud Client ID & Secret**: To use SoundCloud authorization, you need to configure your SoundCloud credentials. You can set them in your environment variables or in `.env` inside the desktop app directory.

### Quick Start

1. Clone or navigate to the project directory.
2. Go to the desktop app folder:
   ```bash
   cd src/apps/desktop/electron/fableplayer

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
│   │           ├── src/
│   │           │   ├── main/
│   │           │   ├── preload/
│   │           │   └── renderer/