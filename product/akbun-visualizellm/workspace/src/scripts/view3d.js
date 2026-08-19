// The 3D view. Every weight matrix of the model is a box, sized by its shape
// and placed along the flow by src/lib/scene.js, which is where the arithmetic
// lives. This file only turns that list into three.js objects and hides the
// ones the filter has switched off.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { buildScene, visibleBlocks, bounds } from '../lib/scene.js';

const TONE_VARS = {
  embed: '--t-embed',
  attn: '--t-attn',
  norm: '--t-norm',
  mlp: '--t-mlp',
  head: '--t-head',
  io: '--t-io',
};

export const LEGEND = [
  ['embed', 'Embedding'],
  ['norm', 'Normalization'],
  ['attn', 'Attention'],
  ['mlp', 'Feed-forward'],
  ['head', 'Output head'],
];

const ALL_TONES = LEGEND.map(([tone]) => tone);

// Experts are all the same matrix, so a handful of copies reads as "many"
// without putting a thousand boxes on the screen.
const MAX_COPIES = 5;

/**
 * Mount the 3D view on a canvas.
 * @param {{canvas: HTMLCanvasElement, legend: HTMLElement, onHover: Function}} options
 * @returns {object} the view handle
 */
export function createSceneView({ canvas, legend, onHover }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 8000);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;

  scene.add(new THREE.HemisphereLight(0xffffff, 0x404050, 2.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(1, 2, 1.5);
  scene.add(sun);

  const group = new THREE.Group();
  scene.add(group);

  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let boxes = [];
  let marks = [];
  let pickable = [];
  let hovered = null;
  let frame = null;
  let currentModel = null;
  let layout = null;
  // layer null means the whole stack; tones is the set of parts left switched on.
  const filter = { layer: null, tones: [...ALL_TONES] };

  legend.innerHTML = LEGEND.map(([tone, label]) => `
    <button class="legend-row is-on" type="button" data-tone="${tone}" aria-pressed="true">
      <span class="legend-dot" style="background: var(${TONE_VARS[tone]})"></span>${label}
    </button>
  `).join('');
  for (const button of legend.querySelectorAll('[data-tone]')) {
    button.addEventListener('click', () => toggleTone(button.dataset.tone));
  }

  function cssColor(name) {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return new THREE.Color(value || '#888888');
  }

  function clear() {
    for (const child of group.children) {
      if (child.material?.map) child.material.map.dispose();
      if (child.material) child.material.dispose();
    }
    group.clear();
    boxes = [];
    marks = [];
    pickable = [];
    hovered = null;
  }

  function build(model) {
    clear();
    scene.background = cssColor('--scene-bg');
    layout = buildScene(model);
    const materials = new Map();
    const materialFor = (tone, activation) => {
      const key = `${tone}:${activation}`;
      if (!materials.has(key)) {
        materials.set(key, new THREE.MeshLambertMaterial({
          color: cssColor(TONE_VARS[tone] ?? '--t-io'),
          transparent: activation,
          opacity: activation ? 0.35 : 1,
        }));
      }
      return materials.get(key);
    };

    for (const block of layout.blocks) {
      const material = materialFor(block.tone, block.kind === 'activation');
      const copies = Math.min(block.copies ?? 1, MAX_COPIES);
      for (let c = 0; c < copies; c += 1) {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.scale.set(block.w, block.h, block.d);
        mesh.position.set(block.x, block.h / 2 + 0.35, c * 0.5);
        mesh.userData.block = block;
        group.add(mesh);
        boxes.push(mesh);
      }
    }

    // The residual stream: the one thing that runs the whole length of the
    // model, drawn as the rail every block sits on. No filter hides it.
    const rail = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ color: cssColor('--t-residual') }));
    rail.scale.set(layout.span + 2, 0.12, 0.12);
    rail.position.set(layout.span / 2 - 1, 0.06, 0);
    rail.userData.always = true;
    rail.userData.block = {
      label: 'Residual stream',
      shape: `hidden ${model.dims.hidden} per token`,
      role: 'The vector every block reads from and writes back into. It is never replaced, only added to, which is why the model can be this deep.',
      params: 0,
    };
    group.add(rail);
    boxes.push(rail);

    addLabels(model);
    currentModel = model;
    filter.layer = null;
    filter.tones = [...ALL_TONES];
    applyFilter();
    focusStart();
  }

  function addLabels(model) {
    const step = Math.max(1, Math.round(model.dims.layers / 6));
    const wanted = [{ x: layout.blocks[0].x, text: 'Embedding', y: -2.6, layer: null }];
    for (let i = 0; i < model.dims.layers; i += step) {
      const first = layout.blocks.find((block) => block.layer === i);
      if (first) wanted.push({ x: first.x, text: `Layer ${i}`, y: -1.2, layer: i });
    }
    wanted.push({ x: layout.blocks.at(-1).x, text: 'LM Head', y: -2.6, layer: null });
    for (const mark of wanted) {
      const sprite = textSprite(mark.text);
      sprite.position.set(mark.x, mark.y, 0);
      sprite.userData.layer = mark.layer;
      group.add(sprite);
      marks.push(sprite);
    }
  }

  function textSprite(text) {
    const canvasEl = document.createElement('canvas');
    canvasEl.width = 256;
    canvasEl.height = 64;
    const ctx = canvasEl.getContext('2d');
    ctx.fillStyle = `#${cssColor('--text').getHexString()}`;
    ctx.font = '600 34px Outfit, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 32);
    const texture = new THREE.CanvasTexture(canvasEl);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }));
    sprite.scale.set(6, 1.5, 1);
    return sprite;
  }

  // Which boxes a layer choice and the legend switches leave standing. The
  // decision itself is in scene.js so it can be tested; here it only turns into
  // visibility flags and a new pick list.
  function applyFilter() {
    if (!layout) return;
    const shown = new Set(visibleBlocks(layout, filter));
    pickable = [];
    for (const mesh of boxes) {
      mesh.visible = mesh.userData.always === true || shown.has(mesh.userData.block);
      if (mesh.visible) pickable.push(mesh);
    }
    for (const sprite of marks) {
      sprite.visible = filter.layer === null || sprite.userData.layer === null || sprite.userData.layer === filter.layer;
    }
    if (hovered && !shown.has(hovered)) {
      hovered = null;
      onHover(null);
    }
  }

  function setLayer(value) {
    filter.layer = value;
    applyFilter();
    if (value === null) {
      focusStart();
      return;
    }
    const extent = bounds(visibleBlocks(layout, { layer: value, tones: filter.tones }).filter((b) => b.layer === value));
    if (extent) look(new THREE.Vector3(extent.centerX, 3, 0), new THREE.Vector3(extent.centerX - extent.width * 0.6, extent.width * 0.55, extent.width * 1.1));
  }

  function toggleTone(tone) {
    const on = filter.tones.includes(tone);
    filter.tones = on ? filter.tones.filter((t) => t !== tone) : [...filter.tones, tone];
    const button = legend.querySelector(`[data-tone="${tone}"]`);
    button.classList.toggle('is-on', !on);
    button.setAttribute('aria-pressed', String(!on));
    applyFilter();
  }

  // A whole model is hundreds of units long and a few units wide, so framing all
  // of it turns every matrix into a speck. The opening shot is the first layers
  // at reading distance; "Fit all" is a button for when the shape is the point.
  function focusStart() {
    if (!layout) return;
    const reach = Math.max(layout.layerSpan * 2.2, 22);
    const x = Math.min(layout.layerSpan * 0.7, layout.span / 2);
    look(new THREE.Vector3(x, 3, 0), new THREE.Vector3(x - reach * 0.55, reach * 0.42, reach * 0.8));
  }

  function fitAll() {
    if (!layout) return;
    const center = new THREE.Vector3(layout.span / 2, 2, 0);
    look(center, new THREE.Vector3(center.x - layout.span * 0.25, layout.span * 0.3, layout.span * 0.45));
  }

  function look(target, position) {
    controls.target.copy(target);
    camera.position.copy(position);
    camera.updateProjectionMatrix();
    controls.update();
  }

  function resize() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width === 0 || height === 0) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function pick(event) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(pickable, false)[0];
    hovered = hit?.object.userData.block ?? null;
    onHover(hovered, event);
  }

  canvas.addEventListener('pointermove', pick);
  canvas.addEventListener('pointerleave', () => {
    hovered = null;
    onHover(null);
  });

  const observer = new ResizeObserver(resize);
  observer.observe(canvas);

  function tick() {
    frame = requestAnimationFrame(tick);
    controls.update();
    renderer.render(scene, camera);
  }

  return {
    show(model) {
      if (model !== currentModel) build(model);
      resize();
      if (frame === null) tick();
    },
    focusStart,
    fitAll,
    setLayer,
    hide() {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      hovered = null;
    },
  };
}
