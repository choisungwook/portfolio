// 3D view: one 88-key piano seen from above the player, keys that sink and light up, and two virtual hands whose
// fingertips move onto the sounding keys. Fingers come from the score's fingering when it has one; otherwise the
// nearest finger of a hand that shifts only as far as it must, which is how a player moves.

import * as THREE from 'three'
import type { Hand } from '../core/model.ts'
import { isBlackKey } from '../core/pitch.ts'
import type { KeyMark } from './keyboard.ts'

const LOW = 21
const HIGH = 108
const W = 1 // white key pitch
const WHITE = { w: 0.94, h: 0.7, d: 6 }
const BLACK = { w: 0.56, h: 0.6, d: 3.8, z: -1.1 }
const PRESS = 0.22
// Finger length from knuckle to tip, thumb first. Two segments of half this each, bending at the middle joint.
const FINGER_LENGTH = [3.2, 4.0, 4.3, 4.1, 3.4]
// The finger lifts off once this much of the note has sounded, so a repeated note shows a new strike.
const LIFT_AT = 0.8
const UP = new THREE.Vector3(0, 1, 0)

// Puts a unit-height cylinder between two points.
function place(mesh: THREE.Mesh, from: THREE.Vector3, to: THREE.Vector3): void {
  mesh.position.copy(from).add(to).multiplyScalar(0.5)
  mesh.scale.set(1, Math.max(0.01, from.distanceTo(to)), 1)
  mesh.quaternion.setFromUnitVectors(UP, to.clone().sub(from).normalize())
}

// Middle joint of a two-segment finger: when knuckle and tip are closer than the finger is long, the joint rises.
export function middleJoint(knuckle: THREE.Vector3, tip: THREE.Vector3, length: number): THREE.Vector3 {
  const mid = knuckle.clone().add(tip).multiplyScalar(0.5)
  const span = knuckle.distanceTo(tip)
  if (span >= length) return mid
  const along = tip.clone().sub(knuckle).normalize()
  const bend = UP.clone().sub(along.clone().multiplyScalar(UP.dot(along))).normalize()
  return mid.add(bend.multiplyScalar(Math.sqrt((length / 2) ** 2 - (span / 2) ** 2)))
}

type Key = { mesh: THREE.Mesh; material: THREE.MeshStandardMaterial; base: THREE.Color; x: number; black: boolean; press: number; number?: THREE.Mesh }
type Finger = { inner: THREE.Mesh; outer: THREE.Mesh; joint: THREE.Mesh; tip: THREE.Mesh; at: THREE.Vector3 }
type HandModel = { palm: THREE.Mesh; fingers: Finger[]; anchor: number; dir: 1 | -1 }

function cssColor(name: string, fallback: string): THREE.Color {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return new THREE.Color(value || fallback)
}

// Finger numbers 1-5 drawn on a sounding key, white on the hand color.
const FINGER_TEXTURES: THREE.CanvasTexture[] = []
function fingerTexture(finger: number): THREE.CanvasTexture {
  if (!FINGER_TEXTURES[finger]) {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 64
    const g = canvas.getContext('2d')!
    g.fillStyle = '#ffffff'
    g.font = '800 60px system-ui'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(String(finger), 32, 35)
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    FINGER_TEXTURES[finger] = texture
  }
  return FINGER_TEXTURES[finger]
}

function labelTexture(text: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 64
  const g = canvas.getContext('2d')!
  g.fillStyle = '#9a968c'
  g.font = '600 40px system-ui'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(text, 64, 34)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

export class Piano3D {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(24, 1, 1, 200)
  private keys = new Map<number, Key>()
  private hands: Record<Hand, HandModel>
  private marks: KeyMark[] = []
  private frame = 0
  private observer: ResizeObserver
  private container: HTMLElement

  constructor(container: HTMLElement) {
    this.container = container
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    this.renderer.setPixelRatio(window.devicePixelRatio || 1)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    container.append(this.renderer.domElement)

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x404048, 1.6))
    const sun = new THREE.DirectionalLight(0xffffff, 1.6)
    sun.position.set(-8, 30, 14)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 1024)
    Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 8, bottom: -8, near: 1, far: 80 })
    this.scene.add(sun)

    this.buildPiano()
    this.hands = { R: this.buildHand(1), L: this.buildHand(-1) }
    this.hands.R.anchor = this.keyX(60)
    this.hands.L.anchor = this.keyX(55)

    this.observer = new ResizeObserver(() => this.resize())
    this.observer.observe(container)
    this.resize()
  }

  setHandsVisible(visible: boolean): void {
    for (const hand of Object.values(this.hands)) {
      hand.palm.visible = visible
      for (const finger of hand.fingers) for (const part of [finger.inner, finger.outer, finger.joint, finger.tip]) part.visible = visible
    }
  }

  setMarks(marks: KeyMark[]): void {
    this.marks = marks
  }

  start(): void {
    if (this.frame) return
    const loop = () => {
      this.step()
      this.renderer.render(this.scene, this.camera)
      this.frame = requestAnimationFrame(loop)
    }
    loop()
  }

  stop(): void {
    cancelAnimationFrame(this.frame)
    this.frame = 0
  }

  private keyX(pitch: number): number {
    const key = this.keys.get(Math.min(HIGH, Math.max(LOW, pitch)))
    return key ? key.x : 0
  }

  private buildPiano(): void {
    const whites = Array.from({ length: HIGH - LOW + 1 }, (_, i) => LOW + i).filter((p) => !isBlackKey(p))
    const offset = ((whites.length - 1) * W) / 2
    const whiteGeometry = new THREE.BoxGeometry(WHITE.w, WHITE.h, WHITE.d)
    const blackGeometry = new THREE.BoxGeometry(BLACK.w, BLACK.h, BLACK.d)
    const whiteColor = new THREE.Color('#f5f1e8')
    const blackColor = new THREE.Color('#1c1b1f')

    whites.forEach((pitch, i) => {
      const material = new THREE.MeshStandardMaterial({ color: whiteColor, roughness: 0.45 })
      const mesh = new THREE.Mesh(whiteGeometry, material)
      const x = i * W - offset
      mesh.position.set(x, -WHITE.h / 2, 0)
      mesh.castShadow = mesh.receiveShadow = true
      if (pitch % 12 === 0) {
        const label = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.45), new THREE.MeshBasicMaterial({ map: labelTexture(`C${pitch / 12 - 1}`), transparent: true }))
        label.rotation.x = -Math.PI / 2
        label.position.set(0, WHITE.h / 2 + 0.01, 2.2)
        mesh.add(label)
      }
      this.scene.add(mesh)
      this.keys.set(pitch, { mesh, material, base: whiteColor, x, black: false, press: 0 })
    })
    for (let pitch = LOW; pitch <= HIGH; pitch++) {
      if (!isBlackKey(pitch)) continue
      const material = new THREE.MeshStandardMaterial({ color: blackColor, roughness: 0.3 })
      const mesh = new THREE.Mesh(blackGeometry, material)
      const x = this.keys.get(pitch - 1)!.x + W / 2
      mesh.position.set(x, BLACK.h / 2, BLACK.z)
      mesh.castShadow = mesh.receiveShadow = true
      this.scene.add(mesh)
      this.keys.set(pitch, { mesh, material, base: blackColor, x, black: true, press: 0 })
    }

    const body = new THREE.Mesh(new THREE.BoxGeometry(whites.length * W + 2, 1, 9), new THREE.MeshStandardMaterial({ color: '#141416', roughness: 0.6 }))
    body.position.set(0, -1.25, -0.6)
    body.receiveShadow = true
    const felt = new THREE.Mesh(new THREE.BoxGeometry(whites.length * W, 0.3, 0.25), new THREE.MeshStandardMaterial({ color: '#7a1f24' }))
    felt.position.set(0, 0.1, -3.15)
    this.scene.add(body, felt)
  }

  private buildHand(dir: 1 | -1): HandModel {
    const skin = new THREE.MeshStandardMaterial({ color: '#e9c2a6', roughness: 0.7, transparent: true, opacity: 0.88 })
    const palm = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.55, 2.2), skin)
    palm.castShadow = true
    this.scene.add(palm)
    const fingers: Finger[] = []
    for (let f = 0; f < 5; f++) {
      const radius = f === 0 ? 0.3 : 0.26
      const segment = new THREE.CylinderGeometry(radius, radius, 1, 12)
      const ball = new THREE.SphereGeometry(radius, 12, 10)
      const parts = [new THREE.Mesh(segment, skin), new THREE.Mesh(segment, skin), new THREE.Mesh(ball, skin), new THREE.Mesh(ball, skin)]
      for (const part of parts) part.castShadow = true
      this.scene.add(...parts)
      const [inner, outer, joint, tip] = parts
      fingers.push({ inner, outer, joint, tip, at: new THREE.Vector3(0, 1.4, 2) })
    }
    return { palm, fingers, anchor: 0, dir }
  }

  private resize(): void {
    const width = this.container.clientWidth
    const height = this.container.clientHeight
    if (!width || !height) return
    this.renderer.setSize(width, height)
    this.camera.aspect = width / height
    // Fit the whole keyboard: distance where the horizontal field of view covers 54 units, seen 66 degrees from level.
    const halfWidth = 27
    const tanH = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * this.camera.aspect
    const distance = Math.max(halfWidth / tanH, 22)
    const tilt = THREE.MathUtils.degToRad(66)
    this.camera.position.set(0, distance * Math.sin(tilt), distance * Math.cos(tilt) + 2.2)
    this.camera.lookAt(0, 0, 2.2)
    this.camera.updateProjectionMatrix()
  }

  // Which finger takes which key for one hand. Finger 1 is the thumb: lowest for the right hand, highest for the left.
  private assign(hand: HandModel, notes: { pitch: number; finger?: number }[]): Map<number, number> {
    const result = new Map<number, number>()
    const slot = (f: number) => hand.anchor + hand.dir * (f - 1) * W
    const fingered = notes.filter((n) => n.finger)
    if (fingered.length) {
      hand.anchor = fingered.reduce((s, n) => s + this.keyX(n.pitch) - hand.dir * (n.finger! - 1) * W, 0) / fingered.length
    } else if (notes.length) {
      // Move the hand only as far as needed to reach every note.
      const xs = notes.map((n) => this.keyX(n.pitch))
      const low = Math.min(...xs)
      const high = Math.max(...xs)
      const span = 4 * W
      const left = hand.dir === 1 ? hand.anchor : hand.anchor - span
      const shift = low < left ? low - left : high > left + span ? high - (left + span) : 0
      hand.anchor += shift
    }
    for (const note of fingered) result.set(note.finger! - 1, note.pitch)
    const rest = notes.filter((n) => !n.finger).sort((a, b) => (a.pitch - b.pitch) * hand.dir)
    for (const note of rest) {
      const x = this.keyX(note.pitch)
      const free = [0, 1, 2, 3, 4].filter((f) => !result.has(f))
      if (!free.length) break
      free.sort((a, b) => Math.abs(slot(a + 1) - x) - Math.abs(slot(b + 1) - x))
      result.set(free[0], note.pitch)
    }
    return result
  }

  private step(): void {
    const guide = cssColor('--right', '#2f6fdf')
    const colors: Record<string, THREE.Color> = {
      R: guide,
      L: cssColor('--left', '#1f9d6b'),
      played: cssColor('--played', '#e8892b'),
      wrong: cssColor('--wrong', '#d64545'),
      missed: cssColor('--missed', '#9a9aa0'),
    }
    const byPitch = new Map<number, KeyMark>()
    for (const mark of this.marks) if (!byPitch.has(mark.pitch) || mark.tone !== 'played') byPitch.set(mark.pitch, mark)

    for (const [pitch, key] of this.keys) {
      const mark = byPitch.get(pitch)
      key.press += ((mark ? PRESS : 0) - key.press) * 0.45
      key.mesh.position.y = (key.black ? BLACK.h / 2 : -WHITE.h / 2) - key.press
      const target = !mark ? key.base : mark.tone === 'guide' ? colors[mark.hand ?? 'R'] : colors[mark.tone]
      key.material.color.lerp(target, 0.35)
      const finger = mark?.tone === 'guide' ? mark.finger : undefined
      if (finger) {
        if (!key.number) {
          const size = key.black ? 0.56 : 0.94
          key.number = new THREE.Mesh(new THREE.PlaneGeometry(size, size * 1.3), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }))
          key.number.rotation.x = -Math.PI / 2
          // Near the front edge, where the fingertips do not cover it.
          key.number.position.set(0, (key.black ? BLACK.h : WHITE.h) / 2 + 0.01, key.black ? 1.3 : 2.2)
          key.mesh.add(key.number)
        }
        const material = key.number.material as THREE.MeshBasicMaterial
        if (material.map !== fingerTexture(finger)) {
          material.map = fingerTexture(finger)
          material.needsUpdate = true
        }
        key.number.visible = true
      } else if (key.number) key.number.visible = false
    }

    for (const handName of ['R', 'L'] as Hand[]) {
      const hand = this.hands[handName]
      const marks = this.marks.filter((m) => m.hand === handName)
      const notes = marks.map((m) => ({ pitch: m.pitch, finger: m.finger }))
      const assigned = this.assign(hand, notes)
      const palmX = hand.anchor + hand.dir * 2 * W
      hand.palm.position.lerp(new THREE.Vector3(palmX, 2.5, 5.6), 0.3)
      hand.fingers.forEach((finger, f) => {
        const pitch = assigned.get(f)
        const key = pitch !== undefined ? this.keys.get(pitch) : undefined
        const progress = marks.find((m) => m.pitch === pitch)?.progress
        const down = !!key && (progress === undefined || progress < LIFT_AT)
        // The thumb plays nearer the front edge; the middle finger reaches furthest in.
        const reach = f === 0 ? 0.9 : f === 4 ? 0.4 : f === 2 ? -0.2 : 0
        const x = key ? key.x : hand.anchor + hand.dir * f * W
        const z = key?.black ? -0.9 + reach : 1.5 + reach
        const y = down ? (key!.black ? BLACK.h : 0) - key!.press + 0.26 : 1.5
        // Strike fast, lift slower: that difference is what reads as playing.
        finger.at.lerp(new THREE.Vector3(x, y, z), down ? 0.6 : 0.3)
        const knuckle = new THREE.Vector3(palmX + hand.dir * (f - 2) * 0.78, 2.4, f === 0 ? 5.4 : 4.5)
        const joint = middleJoint(knuckle, finger.at, FINGER_LENGTH[f])
        place(finger.inner, knuckle, joint)
        place(finger.outer, joint, finger.at)
        finger.joint.position.copy(joint)
        finger.tip.position.copy(finger.at)
      })
    }
  }
}
