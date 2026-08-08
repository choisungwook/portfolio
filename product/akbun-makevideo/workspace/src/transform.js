'use strict';

(function () {

const MIN_SIZE = 16;

function projectPoint(point, stage, project) {
  return {
    x: (point.x * project.width) / stage.width,
    y: (point.y * project.height) / stage.height,
  };
}

function displayPoint(point, stage, project) {
  return {
    x: (point.x * stage.width) / project.width,
    y: (point.y * stage.height) / project.height,
  };
}

function centre(transform) {
  return {
    x: transform.x + transform.width / 2,
    y: transform.y + transform.height / 2,
  };
}

function radians(degrees) {
  return (degrees * Math.PI) / 180;
}

function rotate(point, around, degrees) {
  const angle = radians(degrees);
  const x = point.x - around.x;
  const y = point.y - around.y;
  return {
    x: around.x + x * Math.cos(angle) - y * Math.sin(angle),
    y: around.y + x * Math.sin(angle) + y * Math.cos(angle),
  };
}

function localPoint(point, transform) {
  return rotate(point, centre(transform), -transform.rotation);
}

function containsPoint(item, point) {
  const transform = item.transform;
  const local = localPoint(point, transform);
  return local.x >= transform.x && local.x <= transform.x + transform.width
    && local.y >= transform.y && local.y <= transform.y + transform.height;
}

function visibleItems(project, frame) {
  const items = [];
  for (let trackIndex = 0; trackIndex < project.tracks.length; trackIndex += 1) {
    const track = project.tracks[trackIndex];
    if (track.kind !== 'video' || track.hidden) continue;
    for (let itemIndex = 0; itemIndex < (track.visualItems || []).length; itemIndex += 1) {
      const item = track.visualItems[itemIndex];
      if (item.start <= frame && frame < item.start + item.duration) {
        items.push({ item, trackIndex, itemIndex });
      }
    }
  }
  return items.sort((a, b) =>
    a.trackIndex - b.trackIndex || a.item.zIndex - b.item.zIndex || a.itemIndex - b.itemIndex
  );
}

function handlePoints(transform, offset) {
  const halfWidth = transform.width / 2;
  const halfHeight = transform.height / 2;
  const centrePoint = centre(transform);
  const points = {
    nw: { x: -halfWidth, y: -halfHeight },
    n: { x: 0, y: -halfHeight },
    ne: { x: halfWidth, y: -halfHeight },
    e: { x: halfWidth, y: 0 },
    se: { x: halfWidth, y: halfHeight },
    s: { x: 0, y: halfHeight },
    sw: { x: -halfWidth, y: halfHeight },
    w: { x: -halfWidth, y: 0 },
    rotate: { x: 0, y: -halfHeight - offset },
  };
  return Object.fromEntries(
    Object.entries(points).map(([name, point]) => [name, rotate({
      x: centrePoint.x + point.x,
      y: centrePoint.y + point.y,
    }, centrePoint, transform.rotation)])
  );
}

function hitHandle(transform, point, radius, rotateOffset) {
  for (const [handle, at] of Object.entries(handlePoints(transform, rotateOffset))) {
    if (Math.hypot(point.x - at.x, point.y - at.y) <= radius) return handle;
  }
  return null;
}

function hitItem(project, frame, point, selectedId, options = {}) {
  const items = visibleItems(project, frame);
  const selected = items.find(({ item }) => item.id === selectedId);
  if (selected) {
    const handle = hitHandle(
      selected.item.transform,
      point,
      options.handleRadius || 8,
      options.rotateOffset || 24
    );
    if (handle) return { item: selected.item, action: handle === 'rotate' ? 'rotate' : 'resize', handle };
    if (containsPoint(selected.item, point)) return { item: selected.item, action: 'move' };
  }
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const candidate = items[index].item;
    if (candidate.id !== selectedId && containsPoint(candidate, point)) {
      return { item: candidate, action: 'move' };
    }
  }
  return null;
}

function normalizeDegrees(value) {
  const normalized = ((value + 180) % 360 + 360) % 360 - 180;
  return normalized === -180 ? 180 : normalized;
}

function transformForDrag(initial, action, start, point) {
  if (action === 'move') {
    return {
      ...initial,
      x: initial.x + point.x - start.x,
      y: initial.y + point.y - start.y,
    };
  }
  const initialCentre = centre(initial);
  if (action === 'rotate') {
    const from = Math.atan2(start.y - initialCentre.y, start.x - initialCentre.x);
    const to = Math.atan2(point.y - initialCentre.y, point.x - initialCentre.x);
    return { ...initial, rotation: normalizeDegrees(initial.rotation + ((to - from) * 180) / Math.PI) };
  }

  const local = localPoint(point, initial);
  const moveWest = action.includes('w');
  const moveEast = action.includes('e');
  const moveNorth = action.includes('n');
  const moveSouth = action.includes('s');
  const left = moveWest ? Math.min(local.x, initial.x + initial.width - MIN_SIZE) : initial.x;
  const right = moveEast ? Math.max(local.x, initial.x + MIN_SIZE) : initial.x + initial.width;
  const top = moveNorth ? Math.min(local.y, initial.y + initial.height - MIN_SIZE) : initial.y;
  const bottom = moveSouth ? Math.max(local.y, initial.y + MIN_SIZE) : initial.y + initial.height;
  const nextCentre = rotate({ x: (left + right) / 2, y: (top + bottom) / 2 }, initialCentre, initial.rotation);
  const width = right - left;
  const height = bottom - top;
  return {
    ...initial,
    x: nextCentre.x - width / 2,
    y: nextCentre.y - height / 2,
    width,
    height,
  };
}

const exported = {
  MIN_SIZE,
  projectPoint,
  displayPoint,
  centre,
  rotate,
  localPoint,
  containsPoint,
  visibleItems,
  handlePoints,
  hitHandle,
  hitItem,
  transformForDrag,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = exported;
} else {
  globalThis.transformLib = exported;
}
})();
