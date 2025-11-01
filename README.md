# Drawnix

## Features

- 💯 Free and Open Source
- ⚒️ Mind Maps and Flowcharts
- 🖌 Freehand
- 😀 Image Support
- 🚀 Plugin-based Architecture - Extensible
- 🖼️ 📃 Export to PNG, JPG, JSON(.drawnix)
- 💾 Auto-save (Browser Storage)
- ⚡ Edit Features: Undo, Redo, Copy, Paste, etc.
- 🌌 Infinite Canvas: Zoom, Pan
- 🎨 Theme Support
- 📱 Mobile-friendly
- 📈 Support mermaid syntax conversion to flowchart
- ✨ Support markdown text conversion to mind map


## About the Name

***Drawnix*** is born from the interweaving of ***Draw*** and ***Phoenix***, a fusion of artistic inspiration.

The *Phoenix* symbolizes endless creativity, while *Draw* represents humanity's most fundamental form of expression. Here, each creation is an artistic rebirth, every stroke a renaissance of inspiration.

Like a Phoenix, creativity must rise from the flames to be reborn, and ***Drawnix*** stands as the guardian of both technical and creative fire.

*Draw Beyond, Rise Above.*

## About Plait Drawing Framework


*Drawnix* uses a *plugin architecture*, which is technically more complex than the previously mentioned *open-source* tools. However, this *plugin architecture* has its advantages: it supports multiple *UI frameworks* (*Angular*, *React*), integrates with different *rich text frameworks* (currently only supporting *Slate* framework), enables better business layer separation in development, allows development of various fine-grained reusable plugins, and can expand to more whiteboard application scenarios.

## Repository Structure

```
drawnix/
├── apps/
│   ├── web                   # drawnix.com
│   │    └── index.html       # HTML
├── dist/                     # Build artifacts
├── packages/
│   └── drawnix/              # Whiteboard application core
│   └── react-board/          # Whiteboard react view layer
│   └── react-text/           # Text rendering module
├── package.json
├── ...
└── README.md
└── README_en.md

```


## Development

```
npm install

npm run start
```

## Docker
To build a Docker image for Drawnix, use the following command:
```
docker build -f ./Dockerfile -t drawnix .
```

Or build up with docker-compose:
```
docker-compose up -d
```

## Dependencies

- [plait](https://github.com/worktile/plait) - Open source drawing framework
- [slate](https://github.com/ianstormtaylor/slate) - Rich text editor framework
- [floating-ui](https://github.com/floating-ui/floating-ui) - An awesome library for creating floating UI elements


## License

MIT