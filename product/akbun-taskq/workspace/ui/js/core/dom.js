// Builds nodes with createElement. Text always goes through textContent, never innerHTML.
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag)
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue
    if (key === 'class') node.className = value
    else if (key === 'text') node.textContent = String(value)
    else if (key === 'style') Object.assign(node.style, value)
    else if (key === 'dataset') Object.assign(node.dataset, value)
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value)
    else node.setAttribute(key, value === true ? '' : String(value))
  }
  for (const child of children.flat()) {
    if (child === undefined || child === null || child === false) continue
    node.append(child instanceof Node ? child : document.createTextNode(String(child)))
  }
  return node
}

export function svg(tag, attrs = {}) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag)
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value))
  return node
}

export function clear(node) {
  node.replaceChildren()
  return node
}

// Replaces a node's children, skipping null, undefined and false the way el() does.
export function fill(node, ...children) {
  node.replaceChildren(...children.flat().filter((child) => child !== null && child !== undefined && child !== false))
  return node
}

export function area(name, root = document) {
  const node = root.querySelector(`[data-area="${name}"]`)
  if (!node) throw new Error(`missing data-area ${name}`)
  return node
}
