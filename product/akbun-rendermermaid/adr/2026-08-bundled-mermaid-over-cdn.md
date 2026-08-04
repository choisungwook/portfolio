# Mermaid is bundled, not loaded from a CDN

## Decision

Depend on `mermaid` in `package.json` and let the build bundle it into the page's own JavaScript. Do not load it from a CDN `<script type="module">` at runtime.

## Reason

A CDN tag is the shorter version of this product. It removes the bundler, and with it Astro, `node_modules` and the build. That is a real simplification and it was the alternative worth arguing for.

It loses three things. The page stops working when the CDN does, which for a tool whose whole promise is that nothing leaves the browser is an odd dependency to carry. The version floats unless it is pinned in a URL, and a floating renderer is exactly what breaks the sizing code that reads mermaid's markup. And a third party sees a request every time somebody opens the page, which is not what "runs entirely in the browser" implies to whoever reads it.

Bundling costs a build and a 500 kB warning at the end of it. That warning is mermaid and it is not a defect: the bytes are needed to render anything, so splitting them out would only make the page fetch the same code in two requests instead of one.

Google Fonts is still loaded from the network, so the page is not fully self-contained. That is a stylesheet for the interface around the diagram; when it fails to load the fonts fall back and everything still works. Mermaid failing to load leaves nothing at all.
