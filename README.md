# Weld Inspection Planner

A **frontend-only** web tool for importing CAD models, identifying spot weld locations, defining an inspection sequence, and exporting structured data for robotic inspection systems.

## Features

- **CAD file import** — drag-and-drop or file picker for STEP (`.step`, `.stp`), IGES (`.iges`, `.igs`), and BREP (`.brep`) files.
- **Client-side parsing** — all geometry processing runs in the browser via WebAssembly; no file is ever sent to a server.
- **3D viewer** — orbit, pan, and zoom around the loaded model with face hover highlighting.
- **Weld placement** — click any face in Select mode to place a weld point; position (centroid) and orientation (face normal) are extracted automatically.
- **Weld management** — rename welds (double-click), delete, and reorder the inspection sequence via drag-and-drop.
- **Visual markers** — each weld is shown as a sphere with a normal-direction arrow and sequence label.
- **JSON export** — exports a structured file compatible with downstream robotic inspection systems.

### Export format

```json
{
  "part_id": "my-part.stp",
  "origin": [0, 0, 0],
  "welds": [
    {
      "id": "W001",
      "position": [100.0, 50.0, 25.0],
      "normal": [0, 0, 1],
      "sequence": 1,
      "approach_distance": 30,
      "label": "W001"
    }
  ]
}
```

## Tech Stack

| Layer | Technology |
|---|---|
| UI framework | React 19 + TypeScript |
| Build tool | Vite 6 |
| 3D rendering | Three.js |
| CAD parsing | OpenCascade (OCCT) via WebAssembly (`occt-import-js`) |
| State management | Zustand |

## How It Works

1. **Upload** — the user selects a STEP/IGES/BREP file. The raw bytes are read with the browser `File` API.
2. **Parse** — `occt-import-js` (an Emscripten-compiled build of OpenCascade) processes the file entirely in-browser and returns tessellated mesh data with B-Rep face metadata.
3. **Render** — `Three.js` builds `BufferGeometry` objects from the mesh data and renders them in a WebGL scene with orbit controls.
4. **Select** — a `Three.js` raycaster intersects the scene on mouse click. The hit face's centroid becomes the weld position and its vertex normal becomes the weld orientation.
5. **Manage** — weld points are stored in a `Zustand` store. The panel supports renaming, deletion, and drag-and-drop reordering which updates all sequence numbers automatically.
6. **Export** — the store state is serialised to JSON and downloaded via a Blob URL.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or newer

### Install & run

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in a modern browser (Chrome, Edge, or Firefox).

### Build for production

```bash
npm run build
npm run preview
```

### Sample file

A sample STEP assembly is included at `public/samples/sample-assembly.stp` for quick testing.

## Project Structure

```
src/
  cadParser.ts          # OCCT WASM loader and STEP/IGES/BREP parsing
  store.ts              # Zustand global state (welds, model, UI mode)
  types.ts              # TypeScript interfaces
  App.tsx / App.css     # Root layout and global styles
  components/
    FileUpload.tsx       # Drag-and-drop upload screen
    Viewer3D.tsx         # Three.js 3D viewer with raycasting
    WeldPanel.tsx        # Weld list, reordering, and export
    Toolbar.tsx          # Mode switcher and file controls
    LoadingOverlay.tsx   # Loading indicator
public/
  occt-import-js.js     # OCCT WASM glue script (UMD)
  occt-import-js.wasm   # OpenCascade compiled to WebAssembly
  samples/              # Sample STEP file for testing
```

## License

[MIT](LICENSE)