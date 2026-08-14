# SolarView — Interactive Solar System

An interactive, browser-based 3D visualization of the solar system built with Three.js. Drag to orbit, scroll to zoom, and click any planet to inspect it.

## Features

- **3D solar system** rendered with [Three.js](https://threejs.org/)
- **Orbit camera controls** — drag to rotate, scroll to zoom
- **Click-to-inspect** — select any celestial body to view details in a side info panel
- **Time controls**
  - Play / pause orbital motion
  - Reverse time direction
  - Adjustable simulation speed: Real-time, 1 hour/sec, 1 day/sec, 1 week/sec, 1 month/sec, 1 year/sec
  - "Now" button to jump back to the real current time
- **Live clock HUD** showing simulated date/time (IST)
- **Zoom controls** with reset
- **Loading screen** with texture load progress

## Tech Stack

- HTML5 / CSS3
- Vanilla JavaScript (ES modules)
- [Three.js](https://threejs.org/) (loaded via CDN import map, v0.160.1)
- Google Fonts: Space Grotesk, Inter

## Project Structure

```
Solar-system/
├── index.html      # App shell, HUD, and controls
├── script.js        # Three.js scene, orbits, interactions, and simulation logic
├── style.css         # Styling for HUD, panels, and layout
└── images/           # Planet/texture assets
```

## Getting Started

No build step or dependencies to install — it's a static site.

1. Clone the repo:
   ```bash
   git clone https://github.com/NimishPowar/Solar-system.git
   cd Solar-system
   ```
2. Serve the folder with any local static server (required because it uses ES modules, which most browsers block over `file://`):
   ```bash
   # Python
   python3 -m http.server 8000

   # or Node
   npx serve .
   ```
3. Open `http://localhost:8000` in your browser.

## Controls

| Action | Control |
|---|---|
| Rotate view | Click + drag |
| Zoom | Scroll wheel / `+` `−` buttons |
| Select a planet | Click on it |
| Pause/resume orbits | Play/Pause button |
| Reverse time | ⏪ button |
| Change simulation speed | Rate buttons (Real, 1h/s, 1d/s, 1wk/s, 1mo/s, 1yr/s) |
| Reset to current time | "Now" button |

## Roadmap / Ideas

- [ ] Add moons for major planets
- [ ] Add asteroid belt and Kuiper belt visualization
- [ ] Mobile touch control refinements
- [ ] Deploy live demo (GitHub Pages)

## License

No license specified yet — consider adding one (e.g., MIT) if you intend for others to use or contribute.
