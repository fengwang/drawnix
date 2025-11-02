# Drawnix

## Features

- 💯 Free and Open Source
- ⚒️ Mind Maps and Flowcharts
- 🖌 Freehand
- 😀 Image Support
- 🚀 Plugin-based Architecture - Extensible
- 🖼️ 📃 Export to PNG, JPG, JSON(.drawnix)
- 💾 Persistent storage backed by a shared `/storage` volume
- 📁 Web UI to create, browse, edit, and share `.drawnix` files
- ⚡ Edit Features: Undo, Redo, Copy, Paste, etc.
- 🌌 Infinite Canvas: Zoom, Pan
- 🎨 Theme Support
- 📱 Mobile-friendly
- 📈 Support mermaid syntax conversion to flowchart
- ✨ Support markdown text conversion to mind map
- 📄 Support opening Markdown (.md) and Mermaid (.mmd) files directly from `Menu → Open`


## Repository Structure

```
drawnix/
├── apps/
│   ├── web                   # Drawnix Web UI
│   │    └── index.html       # HTML
│   └── storage-server        # HTTP API + static hosting bundle
├── dist/                     # Build artifacts
├── packages/
│   └── drawnix/              # Whiteboard application core
│   └── react-board/          # Whiteboard react view layer
│   └── react-text/           # Text rendering module
├── package.json
├── Dockerfile
├── docker-compose.yml
├── ...
└── README.md

```


## Development

```
npm install

# terminal 1 – start the storage API (defaults to port 3000)
npx ts-node --project apps/storage-server/tsconfig.app.json apps/storage-server/src/main.ts
# or: npx nx serve storage-server

# terminal 2 – run the Drawnix Web UI (Vite dev server on port 7200)
npm run start
```

The Vite dev server proxies requests for `/api` and `/public` to
`http://localhost:3000`. Set `DRAWNIX_API_PROXY` to override the proxy target
during development, or export `VITE_API_BASE` when building/serving the client
from a different origin.

## Docker Deployment
Build the storage-enabled image:

```
docker build -f ./Dockerfile -t drawnix-storage .
```

Run it with a host storage mount (exposes port `3000` inside the container):

```
docker run -p 17183:3000 -v "$(pwd)/data/storage:/storage" drawnix-storage
```

The Web UI and API will then be reachable at <http://localhost:17183>. The
container reads and writes `.drawnix` files inside `/storage`.

### Opening files

- Drawnix JSON (`.drawnix`, `.json`) loads the saved board state.
- Markdown documents (`.md`, `.markdown`, `.mdown`, `.mkd`, `.mdtxt`) are converted on import using the built-in Markdown-to-Drawnix parser.
- Mermaid diagrams (`.mmd`, `.mermaid`, `.mm`) are rendered automatically during import.

Or spin it up with Docker Compose (uses the same volume mapping):

```
docker-compose up -d
```

## Storage API

The container exposes a simple JSON API for managing `.drawnix` files in
`/storage`:

- `GET /api/files` – list stored files with size, modified timestamp, and public URL.
- `POST /api/files` – create a new file (`{ name, content }`). Rejects duplicates.
- `GET /api/files/{name}` – download a file's JSON content.
- `PUT /api/files/{name}` – update content and optionally rename (`{ name?, content }`).
- `DELETE /api/files/{name}` – remove a file.
- `GET /public/{name}` – public, read-only link that streams the raw `.drawnix` file.

All filenames are normalised to retain the `.drawnix` extension. Keep payload
sizes reasonable when uploading large boards.

## Dependencies

- [plait](https://github.com/worktile/plait) - Open source drawing framework
- [slate](https://github.com/ianstormtaylor/slate) - Rich text editor framework
- [floating-ui](https://github.com/floating-ui/floating-ui) - An awesome library for creating floating UI elements


## License

MIT
