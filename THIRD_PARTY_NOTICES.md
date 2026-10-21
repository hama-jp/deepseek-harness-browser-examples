# Third-party notices

## Three.js

Aquascape and Sakura Pagoda include Three.js revision 160 (0.160.0).

- Project: https://threejs.org/
- Source: https://github.com/mrdoob/three.js/tree/r160
- Copyright © 2010–2023 three.js authors
- License: MIT; the full text is in [licenses/three-LICENSE.txt](licenses/three-LICENSE.txt) and in each distributed 3D HTML file.

The aquarium bundles the ES module build. The pagoda retains the UMD build used in its original generation. The applications do not fetch Three.js from a CDN at runtime.

## Build dependencies

The aquarium uses esbuild 0.20.2 (MIT) to create its standalone HTML. esbuild is a development dependency and is not included as an executable in this repository. The exact dependency versions and package integrity hashes are recorded in `apps/aquarium/package-lock.json`.

## Artwork and sound

The scenes and pinball graphics are drawn by the included application code. Pinball sound is synthesized with the Web Audio API. No stock audio, externally hosted fonts or remote image assets are required by the published applications.
