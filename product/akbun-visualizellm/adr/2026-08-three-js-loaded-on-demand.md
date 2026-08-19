# three.js for the 3D view, imported on first use

## Decision

Render the 3D view with three.js and its OrbitControls, in a module imported dynamically the first time the 3D button is pressed.

## Reason

The view needs orbiting, zooming, panning and pointer picking against a few hundred boxes. Hand rolling that on a 2D canvas means a projection, a painter's algorithm, and hit testing against projected polygons, which is more code than the box drawing itself and worse at the one thing that matters, reading depth. three.js does it with a raycaster and a camera.

Loading it eagerly would put roughly half a megabyte in front of a page whose first view is HTML boxes, so it is a dynamic import and lands in its own chunk. The scene layout stays in `src/lib/scene.js` with no three.js import, so the geometry is tested on plain node while only the instantiation depends on WebGL.
