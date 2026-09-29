# Kkrieger single-file browser build

This directory turns the open-source `.kkrieger` WebAssembly/WebGL2 port into one autonomous HTML file.

Source is pinned to:

- `MasonDye/kkrieger-wasm@3bf0ff017372e640e966c2785a4d95a998cec242`
- Emscripten `6.0.9`

The build keeps the original C/C++ engine and Emscripten browser port. It changes packaging only:

- `--preload-file` -> `--embed-file`
- adds `-sSINGLE_FILE=1`
- embeds required BSD and MojoShader license notices into the generated HTML

The browser smoke gate requires:

- WebGL2
- at least 85% visible primary game surface
- actual runtime log activity
- non-blank rendered pixels
- no browser console/page errors
- no external runtime sidecar tags

Generated production file: `kkrieger/index.html`.
