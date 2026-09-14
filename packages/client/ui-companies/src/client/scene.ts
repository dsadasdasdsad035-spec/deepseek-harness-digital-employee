/** Imperative Three.js scene graph for the company campus console. */

import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { resolveCompanySkin, type CompanySkin, type SkinDecoration } from './skins.ts'

/** One company house rendered on the campus. */
export interface CampusCompany {
  readonly id: string
  readonly name: string
  readonly category: string
  readonly address: string
  readonly memberCount: number
  readonly busyCount: number
  /** Per-company rendering skin; unknown ids fall back to the default preset. */
  readonly skinId?: string
}

/** One seated employee in the floor view. */
export interface FloorMember {
  readonly key: string
  readonly displayName: string
  readonly busy: boolean
  /** Trailing real-session texts for the bound computer screen. */
  readonly chatTail?: readonly string[]
}

/** One department zone in the floor view. */
export interface FloorDepartment {
  readonly key: string | null
  readonly name: string
  readonly color: string
  readonly members: readonly FloorMember[]
  /** Empty desks rendered after the seated members. */
  readonly emptySeats: number
}

/** Interaction callbacks surfaced to React. */
export interface CompanySceneCallbacks {
  onCompanyClick?: (companyId: string) => void
  onMemberClick?: (memberKey: string) => void
  onSeatClick?: (departmentKey: string | null) => void
}

/** Draw a text label as a canvas-backed sprite. */
function labelSprite(text: string, options: { size?: number; color?: string; background?: string } = {}): THREE.Sprite {
  const fontSize = options.size ?? 44
  const canvas = document.createElement('canvas')
  const measure = canvas.getContext('2d')
  if (measure === null) throw new Error('company scene: canvas 2d context unavailable')
  measure.font = `600 ${String(fontSize)}px system-ui, "PingFang SC", "Microsoft YaHei", sans-serif`
  const width = Math.ceil(measure.measureText(text).width) + fontSize
  canvas.width = width
  canvas.height = fontSize * 1.6
  const draw = canvas.getContext('2d')
  if (draw === null) throw new Error('company scene: canvas 2d context unavailable')
  if (options.background !== undefined) {
    draw.fillStyle = options.background
    draw.beginPath()
    draw.roundRect(0, 0, canvas.width, canvas.height, fontSize * 0.35)
    draw.fill()
  }
  draw.font = `600 ${String(fontSize)}px system-ui, "PingFang SC", "Microsoft YaHei", sans-serif`
  draw.fillStyle = options.color ?? '#1f2937'
  draw.textAlign = 'center'
  draw.textBaseline = 'middle'
  draw.fillText(text, canvas.width / 2, canvas.height / 2)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }))
  sprite.scale.set(canvas.width / 160, canvas.height / 160, 1)
  return sprite
}

/** Interior plan constants: room box, waist-height walls, door and corridor widths. */
const ROOM_W = 11
const ROOM_D = 10
const WALL_H = 1.15
const WALL_T = 0.16
const DOOR_W = 2.4
const ENTRANCE_W = 3.4
const HALL_D = 4.5
const BAND_GAP = 1.5

/** City plan constants: ring road, outer grid, transit lines, and river placement. */
const RING_HALF = 26
const ROAD_W = 4
const GRID_COORD = 44
const GRID_EXTENT = 66
const TRAM_Z = -36
const RAIL_Z = -56
const HSR_X = 58
const HSR_Y = 6
const METRO_X = -58
const METRO_Y = 4.5
const RIVER_Z = 60
const RIVER_W = 12

/** Y offset sinking a standing figure into a seated posture at a desk. */
const SEAT_SINK = -0.24
/** NPC body half extents for fixture collision probes. */
const NPC_HALF_EXTENTS = new THREE.Vector2(0.28, 0.28)

/** NPC walking speed in world units per second. */
const NPC_WALK_SPEED = 1.7

/** One registered world entity: located, bounded, optionally destructible. */
export interface WorldEntity {
  /** Stable registry id (builder-scoped for fixtures, mover id for dynamics). */
  readonly id: string
  /** Entity class used by the collision strategies. */
  readonly kind: 'fixture' | 'npc' | 'car'
  /** Center position in world coordinates; dynamics refresh it per frame. */
  position: THREE.Vector3
  /** Half extents on the ground plane (x, z) describing the AABB. */
  readonly halfExtents: THREE.Vector2
  /** Fixture may take visual damage; dynamics never register destructible. */
  readonly destructible?: boolean
  /** Fixture damage state, advanced by furious-NPC kicks. */
  damage: 'intact' | 'damaged' | 'destroyed'
  /** Fixture visual root; damage steps tilt or topple it in place. */
  object?: THREE.Object3D
}

/** Per-scene registry of every located, bounded entity. */
export class EntityRegistry {
  private readonly entities = new Map<string, WorldEntity>()

  /** Register one entity; ids are unique per scene instance.
   * @param entity - the located entity to record.
   * @returns the registered entity.
   */
  register(entity: Omit<WorldEntity, 'damage'> & Partial<Pick<WorldEntity, 'damage'>>): WorldEntity {
    const stored: WorldEntity = { damage: 'intact', ...entity }
    this.entities.set(entity.id, stored)
    return stored
  }

  /** Drop every entity; the scene rebuilds.
   * @returns when the registry is empty.
   */
  clear(): void {
    this.entities.clear()
  }

  /** All static fixtures for NPC step probing.
   * @returns fixture entities (kind === 'fixture').
   */
  fixtures(): WorldEntity[] {
    return [...this.entities.values()].filter(entity => entity.kind === 'fixture')
  }

  /** All cars for the car-following gap.
   * @returns car entities.
   */
  cars(): WorldEntity[] {
    return [...this.entities.values()].filter(entity => entity.kind === 'car')
  }

  /** Whether one AABB at a candidate position overlaps any fixture.
   * @param position - the candidate center.
   * @param halfExtents - the mover's half extents.
   * @param ignore - entity id excluded (e.g. the mover's own seat fixture).
   * @returns the blocking fixture, or undefined when the step is clear.
   */
  blockingFixture(position: THREE.Vector3, halfExtents: THREE.Vector2, ignore?: string): WorldEntity | undefined {
    for (const fixture of this.entities.values()) {
      if (fixture.kind !== 'fixture' || fixture.id === ignore) continue
      // Toppled rubble stays visible but no longer blocks walkers.
      if (fixture.damage === 'destroyed') continue
      const dx = Math.abs(position.x - fixture.position.x)
      const dz = Math.abs(position.z - fixture.position.z)
      if (dx < halfExtents.x + fixture.halfExtents.x && dz < halfExtents.y + fixture.halfExtents.y) return fixture
    }
    return undefined
  }

  /** Advance one destructible fixture's damage state by one step.
   * @param id - the fixture id.
   * @returns the next state, or undefined for unknown/already-destroyed.
   */
  damageStep(id: string): 'damaged' | 'destroyed' | undefined {
    const entity = this.entities.get(id)
    if (entity === undefined || entity.destructible !== true) return undefined
    if (entity.damage === 'intact') {
      entity.damage = 'damaged'
      entity.object?.rotateZ(0.22)
      if (entity.object !== undefined) entity.object.position.y -= 0.06
      return 'damaged'
    }
    if (entity.damage === 'damaged') {
      entity.damage = 'destroyed'
      entity.object?.rotateX(1.15)
      if (entity.object !== undefined) entity.object.position.y -= 0.12
      return 'destroyed'
    }
    return undefined
  }
}

/** One wandering member's runtime record. */
type FloorNpc = {
  /** Owning member key for durable visit reporting. */
  readonly memberKey: string
  /** Irritation 0..100: crowding and blocked steps accumulate, time decays. */
  mood: number
  /** Head-top mood chip while irritated or worse; removed when calm returns. */
  moodChip: THREE.Sprite | null
  /** Consecutive blocked steps; too many trigger a re-plan. */
  blockedSteps: number
  readonly person: THREE.Group
  label: THREE.Sprite
  readonly screen: THREE.Mesh
  readonly seat: THREE.Vector3
  /** Corridor entrance of the owning room: door x plus z just outside the door. */
  readonly door: THREE.Vector3
  busy: boolean
  phase: 'sit' | 'walk' | 'amenity'
  destination: 'desk' | number
  path: readonly THREE.Vector3[]
  pathIndex: number
  dwellUntil: number
  nextDecisionAt: number
}

/** One seated member plan handed from a zone builder to the NPC spawner. */
interface NpcSeatPlan {
  readonly member: FloorMember
  /** Seat offset local to the owning room group. */
  readonly seat: THREE.Vector3
  /** The desk screen whose emissive lights while the member works seated. */
  readonly screen: THREE.Mesh
  /** The desk group for fixture-damage visuals. */
  readonly deskGroup: THREE.Group
}

/** Deterministic tree offsets inside one cluster (seeded LCG, no Math.random). */
function treeOffsets(count: number, spread: number, seed: number): Array<{ x: number; z: number }> {
  let state = seed >>> 0
  const next = (): number => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0x100000000
  }
  return Array.from({ length: count }, () => ({ x: (next() - 0.5) * spread, z: (next() - 0.5) * spread }))
}

/** The status chip above one employee; colors are status semantics, not skin. */
function statusLabel(busy: boolean): THREE.Sprite {
  return labelSprite(busy ? '在忙' : '空闲', {
    size: 26,
    color: busy ? '#fef2f2' : '#ecfdf5',
    background: busy ? '#b91c1cd9' : '#047857d9',
  })
}

/** Deterministic hue for one category label; -1 when uncategorized. */
function categoryColor(category: string): number {
  if (category === '') return -1
  let hash = 0
  for (const char of category) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0
  return new THREE.Color().setHSL((hash % 360) / 360, 0.55, 0.45).getHex()
}

/** The roof color for one house: the category hue tinted into the skin's roof palette. */
function roofColor(skin: CompanySkin, category: string): THREE.Color {
  const base = new THREE.Color(skin.campus.roofBase)
  const hue = categoryColor(category)
  if (hue === -1) return base
  return base.lerp(new THREE.Color(hue), 0.45)
}

/** Ground material for one skin's ground style. */
function groundMaterial(skin: CompanySkin): THREE.Material {
  const style = skin.campus.groundStyle
  if (style === 'night-grid') return new THREE.MeshStandardMaterial({ color: skin.campus.ground, metalness: 0.4, roughness: 0.5 })
  if (style === 'reflective') return new THREE.MeshPhysicalMaterial({ color: skin.campus.ground, metalness: 0.2, roughness: 0.25 })
  if (style === 'grass') return new THREE.MeshStandardMaterial({ color: skin.campus.ground, roughness: 1 })
  return new THREE.MeshStandardMaterial({ color: skin.campus.ground, roughness: 0.9 })
}

/** Owns the renderer, camera, controls, both scene graphs, and the animation loop. */
export class CompanyScene {
  private readonly renderer: THREE.WebGLRenderer
  private readonly camera: THREE.PerspectiveCamera
  private readonly controls: OrbitControls
  private readonly raycaster = new THREE.Raycaster()
  private readonly pointer = new THREE.Vector2()
  private readonly campus: THREE.Scene
  private readonly floor: THREE.Scene
  private readonly campusGroup = new THREE.Group()
  private readonly floorGroup = new THREE.Group()
  private readonly campusLights: THREE.HemisphereLight[] = []
  private readonly floorLights: THREE.HemisphereLight[] = []
  /** One wandering employee NPC: person figure, desk references, and behavior. */
  private readonly floorNpcs = new Map<string, FloorNpc>()
  /** Corridor z-line of the current floor; NPCs route walks through it. */
  private floorHallZ = 0
  /** Car registry records aligned with the roadCars array order. */
  private readonly worldEntities = new Map<string, WorldEntity>()
  /** Located, bounded entities of the active floor (fixtures + movers). */
  private readonly floorRegistry = new EntityRegistry()
  /** Amenity place names aligned with the anchors. */
  private floorAmenityNames: string[] = []
  /** Amenity place names aligned with the anchors. */
  private floorAmenities: THREE.Vector3[] = []
  /** Durable-visit reporter injected by the plugin; absent in tests. */
  visitReporter: ((employeeId: string, place: string) => void) | null = null
  /** Road network graph nodes with adjacency; cars wander its edges randomly. */
  private roadGraph: Array<{ position: THREE.Vector3; neighbors: number[] }> = []
  /** Cars wandering the road graph with random edge choices and speeds. */
  private readonly roadCars: Array<{ object: THREE.Object3D; from: number; to: number; t: number; speed: number }> = []
  /** Rail runs randomizing direction, speed, and off-screen dwell per pass. */
  private readonly randomRails: Array<{
    object: THREE.Object3D
    from: THREE.Vector3
    to: THREE.Vector3
    t: number
    speed: number
    direction: 1 | -1
    dwell: number
    readonly minSpeed: number
    readonly maxSpeed: number
  }> = []
  /** Signal lamp material triples cycled on a fixed plan. */
  private readonly trafficLamps: Array<{
    red: THREE.MeshStandardMaterial
    yellow: THREE.MeshStandardMaterial
    green: THREE.MeshStandardMaterial
    readonly offset: number
  }> = []
  private readonly resizeObserver: ResizeObserver
  private readonly clock = new THREE.Clock()
  private raf = 0
  private view: 'campus' | 'floor' = 'campus'
  private floorSkin: CompanySkin = resolveCompanySkin(undefined)
  private disposed = false

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly callbacks: CompanySceneCallbacks = {},
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400)
    this.controls = new OrbitControls(this.camera, canvas)
    this.controls.enableDamping = true
    this.controls.maxPolarAngle = Math.PI / 2.15
    const initial = resolveCompanySkin(undefined)
    this.campus = new THREE.Scene()
    this.campus.background = new THREE.Color(initial.campus.sky)
    this.floor = new THREE.Scene()
    this.floor.background = new THREE.Color(initial.campus.sky)
    for (const scene of [this.campus, this.floor]) {
      const hemisphere = new THREE.HemisphereLight(0xffffff, 0xb8b4a6, initial.office.ambient)
      scene.add(hemisphere)
      ;(scene === this.campus ? this.campusLights : this.floorLights).push(hemisphere)
      const sun = new THREE.DirectionalLight(0xfff4e0, 1.6)
      sun.position.set(14, 22, 10)
      scene.add(sun)
    }
    this.campus.add(this.campusGroup)
    this.floor.add(this.floorGroup)
    this.setCamera('campus')
    this.resizeObserver = new ResizeObserver(() => { this.resize() })
    this.resizeObserver.observe(canvas)
    this.resize()
    canvas.addEventListener('pointerdown', this.handlePointerDown)
    this.animate()
  }

  /** Resize the renderer and camera to the observed canvas box. */
  private resize(): void {
    const width = this.canvas.clientWidth || 1
    const height = this.canvas.clientHeight || 1
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
  }

  /** Position the camera for one view.
   * @param view - campus or floor framing.
   */
  setCamera(view: 'campus' | 'floor'): void {
    this.view = view
    if (view === 'campus') {
      this.camera.position.set(18, 16, 24)
      this.controls.target.set(0, 0, 0)
    } else {
      this.camera.position.set(0, 22, 34)
      this.controls.target.set(0, 0, 1)
    }
    this.controls.update()
  }

  /** Replace the campus content with the current company list.
   * @param companies - company houses to render, each with its own skin id.
   * @param promoImages - admitted promo images keyed by company id.
   */
  setCampus(companies: readonly CampusCompany[], promoImages: ReadonlyMap<string, string>): void {
    clearGroup(this.campusGroup)
    // One campus has one sky: the first company's skin sets the environment
    // while each house carries its own skin's house, plot, and decorations.
    const environment = resolveCompanySkin(companies[0]?.skinId)
    ;(this.campus.background as THREE.Color).setHex(environment.campus.sky)
    for (const light of this.campusLights) light.intensity = environment.office.ambient

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(140, 140),
      groundMaterial(environment),
    )
    ground.rotation.x = -Math.PI / 2
    ground.position.y = -0.02
    this.campusGroup.add(ground)
    if (environment.campus.groundStyle === 'grid' || environment.campus.groundStyle === 'night-grid') {
      const night = environment.campus.groundStyle === 'night-grid'
      const grid = new THREE.GridHelper(140, 70, night ? 0x22d3ee : 0xcbc6b6, night ? 0x1e3a5f : 0xded9c9)
      grid.position.y = -0.01
      this.campusGroup.add(grid)
    }

    this.roadGraph = []
    this.roadCars.length = 0
    this.worldEntities.clear()
    this.randomRails.length = 0
    this.trafficLamps.length = 0
    this.floorNpcs.clear()
    this.floorAmenities = []
    this.buildCity(environment)

    const districts: Array<[number, number]> = [[-14, -14], [14, -14], [-14, 14], [14, 14]]
    const names = ['一区', '二区', '三区', '四区']
    const perDistrict = companies.length > 16 ? 8 : 4
    for (let index = 0; index < districts.length; index++) {
      const district = districts[index]
      if (district === undefined) continue
      const [cx, cz] = district
      const slice = companies.slice(index * perDistrict, (index + 1) * perDistrict)
      this.campusGroup.add(this.buildDistrict(cx, cz, names[index] ?? `${String(index + 1)}区`, slice, promoImages))
    }

    if (companies.length === 0) {
      this.campusGroup.add(labelSprite('暂无公司 · 在右侧面板创建', { size: 40, color: '#6b7280' }))
      this.setCamera('campus')
      return
    }
    this.setCamera('campus')
  }

  /** Build one planned district: hedge, gate, driveways, and its company houses.
   * @param centerX - district center x (a ring-interior quadrant).
   * @param centerZ - district center z.
   * @param name - district sign name (一区..四区).
   * @param companies - companies assigned to this district, in plot order.
   * @param promoImages - admitted promo images keyed by company id.
   */
  private buildDistrict(
    centerX: number,
    centerZ: number,
    name: string,
    companies: readonly CampusCompany[],
    promoImages: ReadonlyMap<string, string>,
  ): THREE.Group {
    const group = new THREE.Group()
    const half = 10
    const gateSideX = centerX < 0 ? 1 : -1
    const gateX = centerX + gateSideX * half

    const hedgeMaterial = new THREE.MeshStandardMaterial({ color: 0x3f6212, roughness: 1 })
    for (const side of [-1, 1]) {
      const long = new THREE.Mesh(new THREE.BoxGeometry(2 * half, 0.45, 0.3), hedgeMaterial)
      long.position.set(centerX, 0.22, centerZ + side * half)
      group.add(long)
    }
    const farSideX = -gateSideX
    const farShort = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.45, 2 * half), hedgeMaterial)
    farShort.position.set(centerX + farSideX * half, 0.22, centerZ)
    group.add(farShort)
    // The gate-side hedge splits around a 3.6-wide gate gap at mid-depth.
    for (const side of [-1, 1]) {
      const segment = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.45, half - 1.8), hedgeMaterial)
      segment.position.set(gateX, 0.22, centerZ + side * (1.8 + (half - 1.8) / 2))
      group.add(segment)
    }

    const driveway = new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness: 1 })
    // Gate → main-road stub, then the spine from the gate to the district center.
    this.appendStrip(group, gateX, centerZ, centerX + gateSideX * 1.5, centerZ, 1.6, driveway)
    this.appendStrip(group, gateX, centerZ, centerX, centerZ, 1.6, driveway)

    const gateMaterial = new THREE.MeshStandardMaterial({ color: 0x78350f })
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.28, 1.7, 0.28), gateMaterial)
      post.position.set(gateX, 0.85, centerZ + side * 2.1)
      group.add(post)
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.24, 4.6), gateMaterial)
    beam.position.set(gateX, 1.8, centerZ)
    group.add(beam)
    const sign = labelSprite(name, { size: 30, color: '#fef3c7', background: '#78350fdd' })
    sign.position.set(gateX, 2.5, centerZ)
    group.add(sign)

    const dense = companies.length > 6
    const spacing = dense ? 6.6 : 9
    const scaleCap = dense ? 1.15 : 1.6
    const cells: Array<[number, number]> = dense
      ? [[-1, -1], [0, -1], [1, -1], [-1, 1], [0, 1], [1, 1]]
      : [[-1, -1], [1, -1], [-1, 1], [1, 1]]
    companies.forEach((company, index) => {
      const cell = cells[index]
      if (cell === undefined) return
      const [dx, dz] = cell
      const skin = resolveCompanySkin(company.skinId)
      const house = this.buildHouse(company, skin, promoImages.get(company.id), scaleCap)
      const x = centerX + dx * spacing
      const z = centerZ + dz * spacing
      house.position.set(x, 0, z)
      // Face the driveway spine along z = centerZ: north rows face south,
      // south rows face north, so every front door meets its stub path.
      house.rotation.y = dz < 0 ? 0 : Math.PI
      group.add(house)
      this.appendStrip(group, x, centerZ, x, z - dz * 2.2, 1, driveway)
    })
    return group
  }

  /** Append one axis-aligned ground strip (driveways, paths) to a group.
   * @param group - the group receiving the strip mesh.
   * @param x1 - start x.
   * @param z1 - start z.
   * @param x2 - end x.
   * @param z2 - end z.
   * @param width - strip width.
   * @param material - strip material.
   */
  private appendStrip(
    group: THREE.Group,
    x1: number,
    z1: number,
    x2: number,
    z2: number,
    width: number,
    material: THREE.Material,
  ): void {
    const lengthX = Math.abs(x2 - x1)
    const lengthZ = Math.abs(z2 - z1)
    const length = Math.max(lengthX, lengthZ)
    if (length < 0.05) return
    const strip = new THREE.Mesh(
      lengthX >= lengthZ ? new THREE.PlaneGeometry(length, width) : new THREE.PlaneGeometry(width, length),
      material,
    )
    strip.rotation.x = -Math.PI / 2
    strip.position.set((x1 + x2) / 2, 0.012, (z1 + z2) / 2)
    group.add(strip)
  }

  /** Build one company house group rendered in its own skin.
   * @param company - the campus row for this house.
   * @param skin - the company's rendering skin.
   * @param promoDataUrl - admitted promo image, if any.
   * @param scaleCap - district plot cap clamping the headcount scale.
   */
  private buildHouse(
    company: CampusCompany,
    skin: CompanySkin,
    promoDataUrl: string | undefined,
    scaleCap = 2.6,
  ): THREE.Group {
    const group = new THREE.Group()
    const scale = company.memberCount === 0 ? 1 : Math.min(1 + Math.log2(company.memberCount + 1) * 0.35, scaleCap)
    const campus = skin.campus
    const night = campus.groundStyle === 'night-grid'

    const plot = new THREE.Mesh(
      new THREE.PlaneGeometry(6.2 * scale, 5.4 * scale),
      groundMaterial(skin),
    )
    plot.rotation.x = -Math.PI / 2
    plot.position.y = -0.01
    group.add(plot)

    const bodyMaterial = campus.roofForm === 'glass'
      ? new THREE.MeshPhysicalMaterial({ color: campus.body, transparent: true, opacity: 0.55, metalness: 0.1, roughness: 0.15 })
      : new THREE.MeshStandardMaterial({ color: campus.body })
    const body = new THREE.Mesh(new THREE.BoxGeometry(3.4 * scale, 2.2 * scale, 2.8 * scale), bodyMaterial)
    body.position.y = 1.1 * scale
    group.add(body)

    group.add(this.buildRoof(campus.roofForm, roofColor(skin, company.category), scale))
    for (const decoration of campus.decorations) {
      group.add(this.buildDecoration(decoration, skin, scale))
    }

    const name = labelSprite(company.name, { size: 40, color: night ? '#e2e8f0' : '#111827' })
    name.position.y = (2.2 + 1.9) * scale
    group.add(name)
    const summary = labelSprite(
      `${company.category === '' ? '未分类' : company.category} · ${String(company.memberCount)} 人 · 在忙 ${String(company.busyCount)}`,
      { size: 30, color: '#eef2ff', background: '#1e293bcc' },
    )
    summary.position.y = (2.2 + 1.55) * scale
    group.add(summary)

    const billboardMaterial: THREE.MeshStandardMaterial = promoDataUrl === undefined
      ? new THREE.MeshStandardMaterial({ color: 0xf8fafc, side: THREE.DoubleSide })
      : (() => {
        const loader = new THREE.TextureLoader()
        const texture = loader.load(promoDataUrl)
        texture.colorSpace = THREE.SRGBColorSpace
        return new THREE.MeshStandardMaterial({ map: texture, side: THREE.DoubleSide })
      })()
    const billboard = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.2), billboardMaterial)
    billboard.position.set(-(1.7 + 0.9) * scale, 1.1, 1.4 * scale * 0.5)
    group.add(billboard)
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 1.1),
      new THREE.MeshStandardMaterial({ color: 0x9ca3af }),
    )
    post.position.set(billboard.position.x, 0.55, billboard.position.z)
    group.add(post)

    if (company.address !== '') {
      const sign = labelSprite(company.address, { size: 26, color: night ? '#cbd5e1' : '#4b5563' })
      sign.position.set(0, 0.35, 1.45 * scale)
      group.add(sign)
    }

    group.userData = { kind: 'company', companyId: company.id }
    return group
  }

  /** Build the roof for one form family at the house's scale. */
  private buildRoof(form: CompanySkin['campus']['roofForm'], color: THREE.Color, scale: number): THREE.Object3D {
    const holder = new THREE.Group()
    const material = new THREE.MeshStandardMaterial({ color, flatShading: true })
    if (form === 'pitched') {
      const roof = new THREE.Mesh(new THREE.ConeGeometry(2.6 * scale, 1.5 * scale, 4), material)
      roof.position.y = (2.2 + 0.75) * scale
      roof.rotation.y = Math.PI / 4
      holder.add(roof)
      return holder
    }
    if (form === 'flat') {
      const slab = new THREE.Mesh(new THREE.BoxGeometry(3.7 * scale, 0.28 * scale, 3.1 * scale), material)
      slab.position.y = (2.2 + 0.14) * scale
      holder.add(slab)
      const parapet = new THREE.Mesh(new THREE.BoxGeometry(3.7 * scale, 0.16 * scale, 0.1), material)
      parapet.position.set(0, (2.2 + 0.36) * scale, 1.5 * scale)
      holder.add(parapet)
      return holder
    }
    if (form === 'curved') {
      const slab = new THREE.Mesh(new THREE.BoxGeometry(4.1 * scale, 0.18 * scale, 3.4 * scale), material)
      slab.position.y = (2.2 + 0.5) * scale
      holder.add(slab)
      const ridge = new THREE.Mesh(new THREE.BoxGeometry(2.8 * scale, 0.34 * scale, 0.5 * scale), material)
      ridge.position.y = (2.2 + 0.75) * scale
      holder.add(ridge)
      for (const corner of [-1, 1]) {
        const eave = new THREE.Mesh(new THREE.BoxGeometry(0.5 * scale, 0.14 * scale, 0.5 * scale), material)
        eave.position.set(corner * 1.95 * scale, (2.2 + 0.68) * scale, 1.55 * scale)
        eave.rotation.z = corner * -0.5
        holder.add(eave)
      }
      return holder
    }
    const glassRoof = new THREE.Mesh(
      new THREE.BoxGeometry(3.6 * scale, 0.5 * scale, 3.0 * scale),
      new THREE.MeshPhysicalMaterial({ color: color.getHex(), transparent: true, opacity: 0.5, roughness: 0.1 }),
    )
    glassRoof.position.y = (2.2 + 0.3) * scale
    holder.add(glassRoof)
    return holder
  }

  /** Build one procedural decoration kind beside a house. */
  private buildDecoration(decoration: SkinDecoration, skin: CompanySkin, scale: number): THREE.Object3D {
    if (decoration === 'trees') {
      const group = new THREE.Group()
      for (const offset of [-1, 1]) {
        const trunk = new THREE.Mesh(
          new THREE.CylinderGeometry(0.08, 0.1, 0.7),
          new THREE.MeshStandardMaterial({ color: 0x7c4a21 }),
        )
        trunk.position.set(offset * 2.1 * scale, 0.35, -1.6 * scale)
        const crown = new THREE.Mesh(
          new THREE.ConeGeometry(0.5, 1.1, 8),
          new THREE.MeshStandardMaterial({ color: 0x4d7c3f, flatShading: true }),
        )
        crown.position.set(offset * 2.1 * scale, 1.2, -1.6 * scale)
        group.add(trunk, crown)
      }
      return group
    }
    if (decoration === 'lanterns') {
      const group = new THREE.Group()
      for (const offset of [-1, 1]) {
        const lantern = new THREE.Mesh(
          new THREE.SphereGeometry(0.24, 10, 8),
          new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xdc2626, emissiveIntensity: 0.7 }),
        )
        lantern.position.set(offset * 1.9 * scale, 2.7 * scale, 1.5 * scale)
        lantern.scale.set(1, 1.25, 1)
        group.add(lantern)
      }
      return group
    }
    if (decoration === 'neon-edges') {
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(3.4 * scale, 2.2 * scale, 2.8 * scale)),
        new THREE.LineBasicMaterial({ color: skin.campus.roofBase }),
      )
      edges.position.y = 1.1 * scale
      return edges
    }
    const chimney = new THREE.Mesh(
      new THREE.BoxGeometry(0.5 * scale, 0.9 * scale, 0.5 * scale),
      new THREE.MeshStandardMaterial({ color: 0x5c4033 }),
    )
    chimney.position.set(0.9 * scale, (2.2 + 0.85) * scale, -0.5 * scale)
    return chimney
  }

  /** Build the whole city environment around the campus and register its movers.
   * @param skin - the environment skin (the first company's).
   */
  private buildCity(skin: CompanySkin): void {
    const night = skin.campus.groundStyle === 'night-grid'
    this.buildRoad(0, -RING_HALF, 2 * RING_HALF + ROAD_W, true)
    this.buildRoad(0, RING_HALF, 2 * RING_HALF + ROAD_W, true)
    this.buildRoad(-RING_HALF, 0, 2 * RING_HALF, false)
    this.buildRoad(RING_HALF, 0, 2 * RING_HALF, false)
    // The vertical grid roads stop at the river bank; bridges carry them across.
    for (const side of [-1, 1]) {
      this.buildRoad(0, side * GRID_COORD, 2 * GRID_EXTENT, true)
      this.buildRoad(side * GRID_COORD, -(GRID_EXTENT + RIVER_Z) / 2, GRID_EXTENT - RIVER_Z + 6, false)
    }
    this.buildRiver()

    const tramStrip = new THREE.Mesh(
      new THREE.PlaneGeometry(2 * GRID_EXTENT, 3.4),
      new THREE.MeshStandardMaterial({ color: 0x86bb6c, roughness: 1 }),
    )
    tramStrip.rotation.x = -Math.PI / 2
    tramStrip.position.set(0, 0.004, TRAM_Z)
    this.campusGroup.add(tramStrip)
    this.campusGroup.add(this.buildRails(2 * GRID_EXTENT, 0.05))
    this.campusGroup.children.at(-1)?.position.set(0, 0, TRAM_Z)

    const embankment = new THREE.Mesh(
      new THREE.BoxGeometry(2 * GRID_EXTENT, 0.8, 3.2),
      new THREE.MeshStandardMaterial({ color: 0x8d8577 }),
    )
    embankment.position.set(0, 0.4, RAIL_Z)
    this.campusGroup.add(embankment)
    const railTop = this.buildRails(2 * GRID_EXTENT, 0.85)
    railTop.position.set(0, 0, RAIL_Z)
    this.campusGroup.add(railTop)

    this.buildViaduct(HSR_X, HSR_Y, 3)
    this.buildViaduct(METRO_X, METRO_Y, 2.6)
    for (const side of [-1, 1]) this.campusGroup.add(this.buildSubwayKiosk(side * 20, RING_HALF + 4))
    this.buildTrafficLight(GRID_COORD + 2.8, GRID_COORD + 2.8, Math.PI, 0)
    this.buildTrafficLight(-(GRID_COORD + 2.8), GRID_COORD + 2.8, Math.PI, 5.75)

    const clusters: Array<[number, number, number]> = [
      [34, 34, 11], [-34, 34, 23], [34, -30, 37], [-34, -30, 41], [52, 50, 53], [-52, 50, 67], [0, -64, 71],
    ]
    for (const [x, z, seed] of clusters) this.campusGroup.add(this.buildTreeCluster(x, z, 7, seed))

    // Internal cross roads and the four ring→outer connectors complete the
    // main-road network the district gates plug into.
    this.buildRoad(0, 0, 2 * RING_HALF, true)
    this.buildRoad(0, 0, 2 * RING_HALF, false)
    for (const side of [-1, 1]) {
      this.buildRoad(0, side * (RING_HALF + GRID_COORD) / 2, GRID_COORD - RING_HALF, false)
      this.buildRoad(side * (RING_HALF + GRID_COORD) / 2, 0, GRID_COORD - RING_HALF, true)
    }
    this.buildRoadGraph()

    const carColors = [0xef4444, 0x3b82f6, 0xf59e0b, 0x10b981, 0x8b5cf6, 0xf8fafc, 0xf97316, 0x64748b]
    for (let index = 0; index < 12; index++) {
      const color = carColors[Math.floor(Math.random() * carColors.length)] ?? 0xef4444
      const car = this.buildCar(color, night)
      this.campusGroup.add(car)
      const from = Math.floor(Math.random() * this.roadGraph.length)
      const node = this.roadGraph[from]
      if (node === undefined) continue
      const to = node.neighbors[Math.floor(Math.random() * node.neighbors.length)]
      if (to === undefined) continue
      this.roadCars.push({ object: car, from, to, t: Math.random(), speed: 3.5 + Math.random() * 4.5 })
      this.worldEntities.set(`car-${String(this.roadCars.length - 1)}`, this.floorRegistry.register({
        id: `car-${String(this.roadCars.length - 1)}`,
        kind: 'car',
        position: car.position.clone(),
        halfExtents: new THREE.Vector2(0.8, 1.6),
      }))
    }

    const rails: Array<[THREE.Group, number, number, number, number, number, number]> = [
      [this.buildTram(), -62, 62, TRAM_Z, 0, 4, 6],
      [this.buildTrain(), -95, 95, RAIL_Z, 0.91, 6, 10],
      [this.buildHighSpeedRail(), HSR_X, HSR_X, -95, HSR_Y + 0.37, 11, 17],
      [this.buildMetro(), METRO_X, METRO_X, -95, METRO_Y + 0.32, 8, 13],
    ]
    for (const [object, x1, x2, zOrStart, y, minSpeed, maxSpeed] of rails) {
      this.campusGroup.add(object)
      const alongZ = x1 === x2
      const from = new THREE.Vector3(x1, y, zOrStart)
      const to = alongZ ? new THREE.Vector3(x2, y, -zOrStart) : new THREE.Vector3(x2, y, zOrStart)
      const direction = Math.random() < 0.5 ? 1 : -1
      this.randomRails.push({
        object, from, to, t: direction === 1 ? 0 : 1,
        speed: minSpeed + Math.random() * (maxSpeed - minSpeed),
        direction, dwell: 0, minSpeed, maxSpeed,
      })
    }
  }

  /** Build the road-graph adjacency the wandering cars traverse. */
  private buildRoadGraph(): void {
    const node = (x: number, z: number): number => {
      this.roadGraph.push({ position: new THREE.Vector3(x, 0, z), neighbors: [] })
      return this.roadGraph.length - 1
    }
    const link = (a: number, b: number): void => {
      const left = this.roadGraph[a]
      const right = this.roadGraph[b]
      if (left === undefined || right === undefined) return
      left.neighbors.push(b)
      right.neighbors.push(a)
    }
    const ring = [
      node(-RING_HALF, -RING_HALF), node(0, -RING_HALF), node(RING_HALF, -RING_HALF), node(RING_HALF, 0),
      node(RING_HALF, RING_HALF), node(0, RING_HALF), node(-RING_HALF, RING_HALF), node(-RING_HALF, 0),
    ]
    const outer = [
      node(-GRID_COORD, -GRID_COORD), node(0, -GRID_COORD), node(GRID_COORD, -GRID_COORD), node(GRID_COORD, 0),
      node(GRID_COORD, GRID_COORD), node(0, GRID_COORD), node(-GRID_COORD, GRID_COORD), node(-GRID_COORD, 0),
    ]
    const center = node(0, 0)
    for (let index = 0; index < 8; index++) {
      link(ring[index] ?? -1, ring[(index + 1) % 8] ?? -1)
      link(outer[index] ?? -1, outer[(index + 1) % 8] ?? -1)
    }
    for (const index of [1, 3, 5, 7]) {
      link(center, ring[index] ?? -1)
      link(ring[index] ?? -1, outer[index] ?? -1)
    }
  }

  /** Advance wandering cars: random next edge at every arrival, random speed.
   * @param delta - frame delta seconds.
   */
  private advanceRoadCars(delta: number): void {
    for (const car of this.roadCars) {
      let fromNode = this.roadGraph[car.from]
      let toNode = this.roadGraph[car.to]
      if (fromNode === undefined || toNode === undefined) continue
      const length = fromNode.position.distanceTo(toNode.position)
      // Car-following: hold while a same-direction leader on this edge sits
      // inside the gap; cars queue instead of passing through each other.
      const leaderGap = Math.min(...this.roadCars
        .filter(other => other !== car && other.from === car.from && other.to === car.to && other.t > car.t)
        .map(other => (other.t - car.t) * length), Number.POSITIVE_INFINITY)
      if (leaderGap < 6) continue
      car.t += (car.speed * delta) / Math.max(length, 0.001)
      while (car.t >= 1) {
        car.t -= 1
        const previous = car.from
        car.from = car.to
        const options = toNode.neighbors.filter(neighbor => neighbor !== previous)
        const pool = options.length > 0 ? options : toNode.neighbors
        const next = pool[Math.floor(Math.random() * pool.length)]
        if (next === undefined) break
        car.to = next
        car.speed = 3.5 + Math.random() * 4.5
        fromNode = this.roadGraph[car.from]
        toNode = this.roadGraph[car.to]
        if (fromNode === undefined || toNode === undefined) break
      }
      if (fromNode === undefined || toNode === undefined) continue
      car.object.position.lerpVectors(fromNode.position, toNode.position, car.t)
      car.object.lookAt(toNode.position)
    }
    for (const [index, car] of this.roadCars.entries()) {
      this.worldEntities.get(`car-${String(index)}`)?.position.copy(car.object.position)
    }
  }

  /** Advance randomized rail runs: dwell, then re-enter with a fresh roll.
   * @param delta - frame delta seconds.
   */
  private advanceRandomRails(delta: number): void {
    for (const rail of this.randomRails) {
      if (rail.dwell > 0) {
        rail.dwell -= delta
        continue
      }
      const length = rail.from.distanceTo(rail.to)
      rail.t += (rail.direction * rail.speed * delta) / Math.max(length, 0.001)
      if (rail.t >= 1 || rail.t <= 0) {
        rail.t = rail.direction === 1 ? 1 : 0
        rail.dwell = 0.5 + Math.random() * 2.5
        rail.direction = Math.random() < 0.5 ? 1 : -1
        rail.speed = rail.minSpeed + Math.random() * (rail.maxSpeed - rail.minSpeed)
        rail.t = rail.direction === 1 ? 0 : 1
        rail.object.position.lerpVectors(rail.from, rail.to, rail.t)
        const heading = rail.direction === 1 ? rail.to : rail.from
        rail.object.lookAt(heading)
        continue
      }
      rail.object.position.lerpVectors(rail.from, rail.to, rail.t)
      const heading = rail.direction === 1 ? rail.to : rail.from
      rail.object.lookAt(heading)
    }
  }

  /** Build one road plane with dashed lane markings.
   * @param centerX - road center x.
   * @param centerZ - road center z.
   * @param length - road length.
   * @param alongX - whether the road runs along the x axis.
   */
  private buildRoad(centerX: number, centerZ: number, length: number, alongX: boolean): void {
    const road = new THREE.Mesh(
      alongX ? new THREE.PlaneGeometry(length, ROAD_W) : new THREE.PlaneGeometry(ROAD_W, length),
      new THREE.MeshStandardMaterial({ color: 0x374151, roughness: 1 }),
    )
    road.rotation.x = -Math.PI / 2
    road.position.set(centerX, 0.005, centerZ)
    this.campusGroup.add(road)
    for (let index = 0; index < Math.floor(length / 3); index++) {
      const along = -length / 2 + 1.5 + index * 3
      const dash = new THREE.Mesh(
        new THREE.PlaneGeometry(alongX ? 1.3 : 0.14, alongX ? 0.14 : 1.3),
        new THREE.MeshStandardMaterial({ color: 0xe5e7eb }),
      )
      dash.rotation.x = -Math.PI / 2
      dash.position.set(centerX + (alongX ? along : 0), 0.011, centerZ + (alongX ? 0 : along))
      this.campusGroup.add(dash)
    }
  }

  /** Build one pair of rails running along the x axis.
   * @param length - rail length.
   * @param height - rail top height.
   */
  private buildRails(length: number, height: number): THREE.Group {
    const group = new THREE.Group()
    for (const offset of [-0.75, 0.75]) {
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(length, 0.06, 0.12),
        new THREE.MeshStandardMaterial({ color: 0x9ca3af, metalness: 0.5, roughness: 0.4 }),
      )
      rail.position.set(0, height, offset)
      group.add(rail)
    }
    return group
  }

  /** Build the elevated rail viaduct: deck, piers, and rails running along z.
   * @param x - line position x.
   * @param height - deck center height.
   * @param deckWidth - deck slab width.
   */
  private buildViaduct(x: number, height: number, deckWidth: number): void {
    const concrete = new THREE.MeshStandardMaterial({ color: 0xd1d5db })
    const deck = new THREE.Mesh(new THREE.BoxGeometry(deckWidth, 0.5, 2 * GRID_EXTENT), concrete)
    deck.position.set(x, height, 0)
    this.campusGroup.add(deck)
    for (let z = -60; z <= 60; z += 12) {
      const pier = new THREE.Mesh(new THREE.BoxGeometry(1, height, 1), concrete)
      pier.position.set(x, height / 2, z)
      this.campusGroup.add(pier)
    }
    const rails = this.buildRails(2 * GRID_EXTENT, height + 0.3)
    rails.rotation.y = Math.PI / 2
    rails.position.set(x, 0, 0)
    this.campusGroup.add(rails)
  }

  /** Build the river band with banks and the two road bridges. */
  private buildRiver(): void {
    const river = new THREE.Mesh(
      new THREE.PlaneGeometry(2 * GRID_EXTENT, RIVER_W),
      new THREE.MeshStandardMaterial({ color: 0x3b82f6, roughness: 0.25, metalness: 0.2 }),
    )
    river.rotation.x = -Math.PI / 2
    river.position.set(0, 0.008, RIVER_Z)
    this.campusGroup.add(river)
    for (const side of [-1, 1]) {
      const bank = new THREE.Mesh(
        new THREE.PlaneGeometry(2 * GRID_EXTENT, 2.2),
        new THREE.MeshStandardMaterial({ color: 0xd6cda4, roughness: 1 }),
      )
      bank.rotation.x = -Math.PI / 2
      bank.position.set(0, 0.006, RIVER_Z + side * (RIVER_W / 2 + 1.1))
      this.campusGroup.add(bank)
    }
    for (const side of [-1, 1]) {
      const bridge = new THREE.Group()
      const deck = new THREE.Mesh(
        new THREE.BoxGeometry(ROAD_W + 1, 0.35, RIVER_W + 4),
        new THREE.MeshStandardMaterial({ color: 0x6b7280 }),
      )
      deck.position.y = 0.175
      bridge.add(deck)
      const surface = new THREE.Mesh(
        new THREE.PlaneGeometry(ROAD_W, RIVER_W + 4),
        new THREE.MeshStandardMaterial({ color: 0x374151, roughness: 1 }),
      )
      surface.rotation.x = -Math.PI / 2
      surface.position.y = 0.36
      bridge.add(surface)
      for (const railSide of [-1, 1]) {
        const railing = new THREE.Mesh(
          new THREE.BoxGeometry(0.1, 0.5, RIVER_W + 4),
          new THREE.MeshStandardMaterial({ color: 0xd1d5db }),
        )
        railing.position.set(railSide * (ROAD_W / 2 + 0.45), 0.6, 0)
        bridge.add(railing)
      }
      bridge.position.set(side * GRID_COORD, 0, RIVER_Z)
      this.campusGroup.add(bridge)
    }
  }

  /** Build one tree cluster with deterministic offsets.
   * @param centerX - cluster center x.
   * @param centerZ - cluster center z.
   * @param count - tree count.
   * @param seed - LCG seed fixing the offsets.
   */
  private buildTreeCluster(centerX: number, centerZ: number, count: number, seed: number): THREE.Group {
    const group = new THREE.Group()
    treeOffsets(count, 9, seed).forEach((offset, index) => {
      const tree = this.buildTree(0.8 + ((seed + index) % 3) * 0.15)
      tree.position.set(centerX + offset.x, 0, centerZ + offset.z)
      group.add(tree)
    })
    return group
  }

  /** Build one procedural tree at unit scale.
   * @param scale - trunk and crown scale.
   */
  private buildTree(scale: number): THREE.Group {
    const group = new THREE.Group()
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12 * scale, 0.16 * scale, 0.9 * scale),
      new THREE.MeshStandardMaterial({ color: 0x7c4a21 }),
    )
    trunk.position.y = 0.45 * scale
    const lower = new THREE.Mesh(
      new THREE.ConeGeometry(0.75 * scale, 1.3 * scale, 8),
      new THREE.MeshStandardMaterial({ color: 0x4d7c3f, flatShading: true }),
    )
    lower.position.y = 1.4 * scale
    const upper = new THREE.Mesh(
      new THREE.ConeGeometry(0.55 * scale, 1.0 * scale, 8),
      new THREE.MeshStandardMaterial({ color: 0x4d7c3f, flatShading: true }),
    )
    upper.position.y = 2.1 * scale
    group.add(trunk, lower, upper)
    return group
  }

  /** Build one subway entrance kiosk with a 地铁 sign.
   * @param x - kiosk position x.
   * @param z - kiosk position z.
   */
  private buildSubwayKiosk(x: number, z: number): THREE.Group {
    const group = new THREE.Group()
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 1.7, 1.6),
      new THREE.MeshStandardMaterial({ color: 0x475569 }),
    )
    body.position.y = 0.85
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(2.7, 0.16, 1.9),
      new THREE.MeshStandardMaterial({ color: 0x1e293b }),
    )
    roof.position.y = 1.78
    const entrance = new THREE.Mesh(
      new THREE.PlaneGeometry(1.6, 1.2),
      new THREE.MeshStandardMaterial({ color: 0x0f172a }),
    )
    entrance.position.set(0, 0.65, 0.82)
    const sign = labelSprite('地铁', { size: 30, color: '#f8fafc', background: '#2563ebdd' })
    sign.position.y = 2.5
    group.add(body, roof, entrance, sign)
    group.position.set(x, 0, z)
    return group
  }

  /** Build one traffic light and register its lamps on the signal plan.
   * @param x - pole position x.
   * @param z - pole position z.
   * @param rotationY - heading rotation toward the intersection.
   * @param offset - phase offset seconds on the shared cycle.
   */
  private buildTrafficLight(x: number, z: number, rotationY: number, offset: number): void {
    const group = new THREE.Group()
    const dark = new THREE.MeshStandardMaterial({ color: 0x334155 })
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 3.9, 8), dark)
    pole.position.y = 1.95
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.09, 0.09), dark)
    arm.position.set(0.8, 3.85, 0)
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.25, 0.32), dark)
    head.position.set(1.6, 3.25, 0)
    group.add(pole, arm, head)
    const red = new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xef4444, emissiveIntensity: 0.05 })
    const yellow = new THREE.MeshStandardMaterial({ color: 0xf59e0b, emissive: 0xf59e0b, emissiveIntensity: 0.05 })
    const green = new THREE.MeshStandardMaterial({ color: 0x22c55e, emissive: 0x22c55e, emissiveIntensity: 0.05 })
    for (const [material, y] of [[red, 3.7], [yellow, 3.3], [green, 2.9]] as const) {
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), material)
      lamp.position.set(1.6, y, 0.17)
      group.add(lamp)
    }
    group.position.set(x, 0, z)
    group.rotation.y = rotationY
    this.campusGroup.add(group)
    this.trafficLamps.push({ red, yellow, green, offset })
  }

  /** Build one car oriented nose-forward along +Z.
   * @param color - body color.
   * @param night - whether headlights read brighter on a night skin.
   */
  private buildCar(color: number, night: boolean): THREE.Group {
    const group = new THREE.Group()
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 0.5, 3.1),
      new THREE.MeshStandardMaterial({ color }),
    )
    body.position.y = 0.55
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(1.3, 0.42, 1.5),
      new THREE.MeshStandardMaterial({ color, roughness: 0.4 }),
    )
    cabin.position.set(0, 1.0, -0.25)
    group.add(body, cabin)
    const wheelGeometry = new THREE.CylinderGeometry(0.3, 0.3, 0.22, 10)
    const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x1f2937 })
    for (const x of [-0.78, 0.78]) {
      for (const z of [-1.0, 1.0]) {
        const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial)
        wheel.rotation.z = Math.PI / 2
        wheel.position.set(x, 0.3, z)
        group.add(wheel)
      }
    }
    for (const x of [-0.42, 0.42]) {
      const headlight = new THREE.Mesh(
        new THREE.BoxGeometry(0.2, 0.1, 0.06),
        new THREE.MeshStandardMaterial({ color: 0xfff4d6, emissive: 0xfff4d6, emissiveIntensity: night ? 1.2 : 0.5 }),
      )
      headlight.position.set(x, 0.6, 1.58)
      const taillight = new THREE.Mesh(
        new THREE.BoxGeometry(0.2, 0.1, 0.06),
        new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xef4444, emissiveIntensity: night ? 1.0 : 0.4 }),
      )
      taillight.position.set(x, 0.6, -1.58)
      group.add(headlight, taillight)
    }
    return group
  }

  /** Build a two-segment tram with a pantograph, nose-forward along +Z. */
  private buildTram(): THREE.Group {
    const group = new THREE.Group()
    for (const z of [-2.5, 2.5]) {
      const segment = new THREE.Mesh(
        new THREE.BoxGeometry(2, 1.5, 4.4),
        new THREE.MeshStandardMaterial({ color: 0x16a34a }),
      )
      segment.position.set(0, 1.05, z)
      const windows = new THREE.Mesh(
        new THREE.BoxGeometry(2.04, 0.5, 3.8),
        new THREE.MeshStandardMaterial({ color: 0x1e293b }),
      )
      windows.position.set(0, 1.3, z)
      group.add(segment, windows)
    }
    const pantograph = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.7, 0.06),
      new THREE.MeshStandardMaterial({ color: 0x334155 }),
    )
    pantograph.position.set(0, 2.15, 0)
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.05, 0.08),
      new THREE.MeshStandardMaterial({ color: 0x334155 }),
    )
    bar.position.set(0, 2.5, 0)
    group.add(pantograph, bar)
    return group
  }

  /** Build a freight train: locomotive plus four wagons, nose-forward along +Z. */
  private buildTrain(): THREE.Group {
    const group = new THREE.Group()
    const locomotive = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 2.2, 5.4),
      new THREE.MeshStandardMaterial({ color: 0xdc2626 }),
    )
    locomotive.position.set(0, 1.35, 8.2)
    const chimney = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.22, 0.7, 8),
      new THREE.MeshStandardMaterial({ color: 0x1f2937 }),
    )
    chimney.position.set(0, 2.75, 9.6)
    group.add(locomotive, chimney)
    for (let index = 0; index < 4; index++) {
      const wagon = new THREE.Mesh(
        new THREE.BoxGeometry(2.2, 2.0, 5.2),
        new THREE.MeshStandardMaterial({ color: 0x9ca3af }),
      )
      wagon.position.set(0, 1.25, 2.2 - index * 5.6)
      group.add(wagon)
    }
    return group
  }

  /** Build a high-speed train: three white cars with a stretched nose, along +Z. */
  private buildHighSpeedRail(): THREE.Group {
    const group = new THREE.Group()
    const white = new THREE.MeshStandardMaterial({ color: 0xf8fafc, metalness: 0.2, roughness: 0.3 })
    for (let index = 0; index < 3; index++) {
      const z = 14.6 - index * 14.4
      const car = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.2, 13), white)
      car.position.set(0, 1.15, z)
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(2.44, 0.5, 13),
        new THREE.MeshStandardMaterial({ color: 0x2563eb }),
      )
      stripe.position.set(0, 1.35, z)
      group.add(car, stripe)
    }
    const nose = new THREE.Mesh(new THREE.SphereGeometry(1.15, 12, 10), white)
    nose.scale.set(1, 0.95, 2.4)
    nose.position.set(0, 1.1, 21.3)
    group.add(nose)
    return group
  }

  /** Build a metro train: three blue cars with a white stripe, along +Z. */
  private buildMetro(): THREE.Group {
    const group = new THREE.Group()
    const blue = new THREE.MeshStandardMaterial({ color: 0x2563eb })
    for (let index = 0; index < 3; index++) {
      const z = 12.2 - index * 12.2
      const car = new THREE.Mesh(new THREE.BoxGeometry(2.3, 2.0, 11.5), blue)
      car.position.set(0, 1.05, z)
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(2.34, 0.4, 11.5),
        new THREE.MeshStandardMaterial({ color: 0xf8fafc }),
      )
      stripe.position.set(0, 1.25, z)
      group.add(car, stripe)
    }
    return group
  }

  /** Replace the floor content with one company's roomed office plan.
   * @param companyName - title label over the floor.
   * @param skinId - the company's rendering skin; unknown ids fall back to the default.
   * @param departments - department zones with seated members and spare desks.
   */
  setFloor(companyName: string, skinId: string | undefined, departments: readonly FloorDepartment[]): void {
    clearGroup(this.floorGroup)
    const skin = resolveCompanySkin(skinId)
    this.floorSkin = skin
    ;(this.floor.background as THREE.Color).setHex(skin.campus.sky)
    for (const light of this.floorLights) light.intensity = skin.office.ambient

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(160, 160),
      new THREE.MeshStandardMaterial({ color: skin.office.floor }),
    )
    ground.rotation.x = -Math.PI / 2
    this.floorGroup.add(ground)

    const night = skin.campus.groundStyle === 'night-grid'
    const ceo = departments.find(department => department.name === '总裁')
    const offices = departments.filter(department => department !== ceo)

    const columns = Math.min(4, Math.max(1, offices.length))
    const rows = Math.ceil(offices.length / columns)
    const backW = columns * ROOM_W + (columns - 1) * BAND_GAP
    const backD = rows * ROOM_D + (rows - 1) * BAND_GAP
    const pantryW = ceo === undefined ? 10 : 8
    const loungeW = ceo === undefined ? 12 : 10
    const toiletW = ceo === undefined ? 7 : 6
    const smokingW = ceo === undefined ? 7 : 6
    const frontPieces = ceo === undefined
      ? [pantryW, loungeW, toiletW, smokingW]
      : [ROOM_W, pantryW, loungeW, toiletW, smokingW]
    const frontW = frontPieces.reduce((sum, width) => sum + width, 0) + (frontPieces.length - 1) * BAND_GAP
    const slabW = Math.max(backW, frontW, 26)
    const slabD = backD + HALL_D + ROOM_D
    this.floorHallZ = -slabD / 2 + backD + HALL_D / 2
    this.floorAmenities = []
    this.floorAmenityNames = []
    this.floorNpcs.clear()
    this.floorRegistry.clear()

    const slab = new THREE.Mesh(
      new THREE.PlaneGeometry(slabW, slabD),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(skin.office.floor).lerp(new THREE.Color(0xffffff), 0.3).getHex(),
      }),
    )
    slab.rotation.x = -Math.PI / 2
    slab.position.y = 0.02
    this.floorGroup.add(slab)

    this.floorGroup.add(this.buildPerimeter(slabW, slabD, skin))
    const entrance = this.buildEntrance(skin)
    entrance.position.set(0, 0, slabD / 2 - WALL_T / 2)
    this.floorGroup.add(entrance)

    const title = labelSprite(companyName, { size: 48, color: night ? '#e2e8f0' : '#111827' })
    title.position.set(0, 4.6, -slabD / 2 - 1)
    this.floorGroup.add(title)

    offices.forEach((department, index) => {
      const room = new THREE.Group()
      const seatPlans: NpcSeatPlan[] = []
      room.add(this.buildRoom(ROOM_W, ROOM_D, skin, { door: 'south' }))
      room.add(this.buildDepartmentZone(department, skin, seatPlans))
      const column = index % columns
      const row = Math.floor(index / columns)
      room.position.set(
        (column - (columns - 1) / 2) * (ROOM_W + BAND_GAP),
        0,
        -slabD / 2 + row * (ROOM_D + BAND_GAP) + ROOM_D / 2,
      )
      this.spawnNpcs(seatPlans, room.position, 'south')
      this.floorGroup.add(room)
    })

    let cursor = -frontW / 2
    const frontCenterZ = slabD / 2 - WALL_T - ROOM_D / 2
    const pantryIndex = ceo === undefined ? 0 : 1
    const loungeIndex = pantryIndex + 1
    const toiletIndex = loungeIndex + 1
    frontPieces.forEach((pieceW, index) => {
      const x = cursor + pieceW / 2
      cursor += pieceW + BAND_GAP
      if (ceo !== undefined && index === 0) {
        const room = new THREE.Group()
        const seatPlans: NpcSeatPlan[] = []
        room.add(this.buildRoom(ROOM_W, ROOM_D, skin, { glass: true, door: 'north' }))
        room.add(this.buildDepartmentZone(ceo, skin, seatPlans))
        const plate = labelSprite('总裁办公室', { size: 30, color: '#f8fafc', background: '#7f1d1dd9' })
        plate.position.set(0, 2.3, -ROOM_D / 2)
        room.add(plate)
        room.position.set(x, 0, frontCenterZ)
        this.spawnNpcs(seatPlans, room.position, 'north')
        this.floorGroup.add(room)
        return
      }
      let fixture: THREE.Group
      if (index === pantryIndex) {
        fixture = this.buildPantry(skin, pieceW)
        this.floorRegistry.register({ id: 'fixture-pantry-counter', kind: 'fixture', position: new THREE.Vector3(x, 0, frontCenterZ + pieceW / 4), halfExtents: new THREE.Vector2((pieceW - 2.5) / 2, 0.35), destructible: true, object: fixture })
        this.floorAmenityNames.push('茶水区')
        this.floorAmenities.push(new THREE.Vector3(x + pieceW / 4, 0, frontCenterZ))
      } else if (index === loungeIndex) {
        fixture = this.buildLounge(skin, pieceW)
        this.floorRegistry.register({ id: 'fixture-lounge-sofa', kind: 'fixture', position: new THREE.Vector3(x - pieceW / 4, 0, frontCenterZ + 1.8), halfExtents: new THREE.Vector2(2, 0.55), destructible: true, object: fixture })
        this.floorRegistry.register({ id: 'fixture-lounge-table', kind: 'fixture', position: new THREE.Vector3(x, 0, frontCenterZ), halfExtents: new THREE.Vector2(0.9, 0.48), destructible: true, object: fixture })
        this.floorAmenityNames.push('休息区')
        this.floorAmenities.push(new THREE.Vector3(x - pieceW / 4, 0, frontCenterZ))
      } else if (index === toiletIndex) {
        fixture = this.buildToilet(skin, pieceW)
        for (const offset of [-1, 1]) {
          this.floorRegistry.register({ id: `fixture-toilet-sink-${offset}`, kind: 'fixture', position: new THREE.Vector3(x + offset * 0.9, 0, frontCenterZ + pieceW / 4), halfExtents: new THREE.Vector2(0.4, 0.35), destructible: true, object: fixture })
        }
        this.floorAmenityNames.push('厕所')
        this.floorAmenities.push(new THREE.Vector3(x, 0, frontCenterZ))
      } else {
        fixture = this.buildSmokingArea(skin, pieceW)
        this.floorRegistry.register({ id: 'fixture-smoking-bench', kind: 'fixture', position: new THREE.Vector3(x, 0, frontCenterZ + pieceW / 4), halfExtents: new THREE.Vector2((pieceW - 2) / 2, 0.45), destructible: true, object: fixture })
        this.floorRegistry.register({ id: 'fixture-smoking-ashtray', kind: 'fixture', position: new THREE.Vector3(x + pieceW / 2 - 1.4, 0, frontCenterZ + pieceW / 4 - 1), halfExtents: new THREE.Vector2(0.25, 0.25), destructible: true, object: fixture })
        this.floorAmenityNames.push('吸烟区')
        this.floorAmenities.push(new THREE.Vector3(x, 0, frontCenterZ))
      }
      fixture.position.set(x, 0, frontCenterZ)
      this.floorGroup.add(fixture)
    })
    this.setCamera('floor')
  }

  /** Register one room's seated members as wandering NPCs in world coordinates.
   * @param seatPlans - per-member seat offsets local to the room group, with screens.
   * @param roomOrigin - the room group's world position (room center).
   * @param doorSide - which side of the room opens onto the corridor.
   */
  private spawnNpcs(seatPlans: readonly NpcSeatPlan[], roomOrigin: THREE.Vector3, doorSide: 'north' | 'south'): void {
    for (const plan of seatPlans) {
      const seat = plan.seat.clone().add(roomOrigin)
      this.floorRegistry.register({
        id: `fixture-desk-${plan.member.key}`,
        kind: 'fixture',
        position: seat.clone(),
        halfExtents: new THREE.Vector2(0.8, 0.45),
        destructible: true,
        object: plan.deskGroup,
      })
      this.floorRegistry.register({
        id: `fixture-pc-${plan.member.key}`,
        kind: 'fixture',
        position: seat.clone().add(new THREE.Vector3(0, 0, -0.32)),
        halfExtents: new THREE.Vector2(0.35, 0.12),
        destructible: true,
        object: plan.screen,
      })
      const figure = this.buildPerson(plan.member)
      figure.person.position.copy(seat).add(new THREE.Vector3(0, 0, 0.5))
      figure.person.position.y = SEAT_SINK
      this.floorGroup.add(figure.person)
      this.floorNpcs.set(plan.member.key, {
        memberKey: plan.member.key,
        mood: 0,
        moodChip: null,
        blockedSteps: 0,
        person: figure.person,
        label: figure.label,
        screen: plan.screen,
        seat,
        door: roomOrigin.clone().add(new THREE.Vector3(0, 0, doorSide === 'north' ? -ROOM_D / 2 - 0.5 : ROOM_D / 2 + 0.5)),
        busy: plan.member.busy,
        phase: 'sit',
        destination: 'desk',
        path: [],
        pathIndex: 0,
        dwellUntil: 0,
        nextDecisionAt: 4 + Math.random() * 8,
      })
    }
  }

  /** Build one straight wall segment; horizontal runs span x, vertical runs span z.
   * @param length - wall length in world units.
   * @param horizontal - whether the run spans the x axis.
   * @param skin - the floor's rendering skin.
   * @param glass - whether the wall renders as translucent glass.
   */
  private buildWallRun(length: number, horizontal: boolean, skin: CompanySkin, glass: boolean): THREE.Mesh {
    const material = glass
      ? new THREE.MeshPhysicalMaterial({ color: skin.office.wall, transparent: true, opacity: 0.4, roughness: 0.15 })
      : new THREE.MeshStandardMaterial({ color: skin.office.wall })
    const mesh = new THREE.Mesh(
      horizontal ? new THREE.BoxGeometry(length, WALL_H, WALL_T) : new THREE.BoxGeometry(WALL_T, WALL_H, length),
      material,
    )
    mesh.position.y = WALL_H / 2
    return mesh
  }

  /** Build one wall run spanning x with a centered door gap.
   * @param width - total run length.
   * @param gapCenter - door gap center offset from the run center.
   * @param gapWidth - door gap width.
   * @param skin - the floor's rendering skin.
   * @param glass - whether the wall renders as translucent glass.
   */
  private buildWallWithDoor(
    width: number,
    gapCenter: number,
    gapWidth: number,
    skin: CompanySkin,
    glass: boolean,
  ): THREE.Group {
    const group = new THREE.Group()
    const west = -width / 2 + WALL_T / 2
    const east = width / 2 - WALL_T / 2
    const gapStart = gapCenter - gapWidth / 2
    const gapEnd = gapCenter + gapWidth / 2
    if (gapStart - west > 0.05) {
      const segment = this.buildWallRun(gapStart - west, true, skin, glass)
      segment.position.x = (west + gapStart) / 2
      group.add(segment)
    }
    if (east - gapEnd > 0.05) {
      const segment = this.buildWallRun(east - gapEnd, true, skin, glass)
      segment.position.x = (gapEnd + east) / 2
      group.add(segment)
    }
    return group
  }

  /** Build one partitioned room: four waist-height walls with a door gap.
   * @param width - room width along x.
   * @param depth - room depth along z.
   * @param skin - the floor's rendering skin.
   * @param options - glass walls and which side (north/south) carries the door.
   */
  private buildRoom(
    width: number,
    depth: number,
    skin: CompanySkin,
    options: { glass?: boolean; door: 'north' | 'south'; doorOffset?: number },
  ): THREE.Group {
    const group = new THREE.Group()
    const glass = options.glass === true
    for (const side of [-1, 1]) {
      const wall = this.buildWallRun(depth - WALL_T, false, skin, glass)
      wall.position.x = side * (width / 2 - WALL_T / 2)
      group.add(wall)
    }
    const back = this.buildWallRun(width - WALL_T, true, skin, glass)
    back.position.z = (options.door === 'south' ? -1 : 1) * (depth / 2 - WALL_T / 2)
    group.add(back)
    const doorWall = this.buildWallWithDoor(width - WALL_T, options.doorOffset ?? 0, DOOR_W, skin, glass)
    doorWall.position.z = (options.door === 'south' ? 1 : -1) * (depth / 2 - WALL_T / 2)
    group.add(doorWall)
    return group
  }

  /** Build the perimeter walls of one interior slab with a south entrance gap.
   * @param width - slab width along x.
   * @param depth - slab depth along z.
   * @param skin - the floor's rendering skin.
   */
  private buildPerimeter(width: number, depth: number, skin: CompanySkin): THREE.Group {
    const group = new THREE.Group()
    const north = this.buildWallRun(width, true, skin, false)
    north.position.z = -(depth / 2 - WALL_T / 2)
    group.add(north)
    for (const side of [-1, 1]) {
      const wall = this.buildWallRun(depth, false, skin, false)
      wall.position.x = side * (width / 2 - WALL_T / 2)
      group.add(wall)
    }
    const south = this.buildWallWithDoor(width, 0, ENTRANCE_W, skin, false)
    south.position.z = depth / 2 - WALL_T / 2
    group.add(south)
    return group
  }

  /** Build one department zone rendered in the company's office skin. */
  private buildDepartmentZone(department: FloorDepartment, skin: CompanySkin, npcSink?: NpcSeatPlan[]): THREE.Group {
    const group = new THREE.Group()
    const office = skin.office
    const capacity = department.members.length + department.emptySeats
    const zoneDepth = Math.max(4, Math.ceil(capacity / 3) * 1.9 + 1.6)
    const carpet = new THREE.Mesh(
      new THREE.PlaneGeometry(10.5, zoneDepth),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(department.color).getHex(),
        transparent: true,
        opacity: office.carpetOpacity,
      }),
    )
    carpet.rotation.x = -Math.PI / 2
    carpet.position.y = 0.01
    group.add(carpet)

    const header = labelSprite(`${department.name} · ${String(department.members.length)} 人`, {
      size: 34,
      color: '#f8fafc',
      background: `${department.color}dd`,
    })
    header.position.set(0, 2.6, -zoneDepth / 2 + 0.4)
    group.add(header)

    const seats: Array<{ member: FloorMember; empty: false } | { member: undefined; empty: true }> = [
      ...department.members.map(member => ({ member, empty: false as const })),
    ]
    for (let index = 0; index < department.emptySeats; index++) seats.push({ member: undefined, empty: true as const })
    const seatRows = Math.ceil(seats.length / 3)
    seats.forEach((seat, index) => {
      const row = Math.floor(index / 3)
      const column = index % 3
      const position = new THREE.Vector3((column - 1) * 3.1, 0, (row - (seatRows - 1) / 2) * 1.9)
      if (seat.member === undefined) {
        const desk = this.buildDesk(skin)
        desk.position.copy(position)
        desk.userData = { kind: 'seat', departmentKey: department.key }
        group.add(desk)
        return
      }
      const desk = this.buildMemberDesk(skin, seat.member.busy)
      desk.group.position.copy(position)
      group.add(desk.group)
      npcSink?.push({ member: seat.member, seat: position.clone(), screen: desk.screen, deskGroup: desk.group })
      this.applyChatTail(desk.panel, seat.member)
    })
    return group
  }

  /** Build the toilet amenity: stalls along the back, a sink counter, and a label. */
  private buildToilet(skin: CompanySkin, width: number): THREE.Group {
    const group = new THREE.Group()
    const fixture = new THREE.MeshStandardMaterial({ color: skin.office.fixture })
    const ceramic = new THREE.MeshStandardMaterial({ color: 0xf8fafc })
    const stallCount = Math.max(2, Math.floor(width / 2.6))
    for (let index = 0; index < stallCount; index++) {
      const stall = new THREE.Group()
      const booth = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 1.5), ceramic)
      booth.position.set(0, 0.8, -width / 4)
      stall.add(booth)
      const doorGap = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 1.2, 0.08),
        new THREE.MeshStandardMaterial({ color: skin.office.wall }),
      )
      doorGap.position.set(0, 0.8, -width / 4 + 0.78)
      stall.add(doorGap)
      stall.position.set((index - (stallCount - 1) / 2) * 2.2, 0, 0)
      group.add(stall)
    }
    const counter = new THREE.Mesh(new THREE.BoxGeometry(width - 2.5, 0.8, 0.7), fixture)
    counter.position.set(0, 0.4, width / 4)
    group.add(counter)
    for (const offset of [-0.9, 0.9]) {
      const sink = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.16, 0.45), ceramic)
      sink.position.set(offset, 0.88, width / 4)
      group.add(sink)
    }
    const label = labelSprite('厕所', { size: 32, color: '#f8fafc', background: '#0e7490dd' })
    label.position.set(0, 2.4, -width / 4)
    group.add(label)
    return group
  }

  /** Build the smoking area: a bench, an ashtray stand, a plant, and a label. */
  private buildSmokingArea(skin: CompanySkin, width: number): THREE.Group {
    const group = new THREE.Group()
    const fixture = new THREE.MeshStandardMaterial({ color: skin.office.fixture })
    const bench = new THREE.Mesh(new THREE.BoxGeometry(width - 2, 0.4, 0.9), fixture)
    bench.position.set(0, 0.22, width / 4)
    group.add(bench)
    const ashtray = new THREE.Group()
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 8), fixture)
    pole.position.y = 0.45
    const tray = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.16, 0.18, 10), fixture)
    tray.position.y = 0.98
    ashtray.add(pole, tray)
    ashtray.position.set(width / 2 - 1.4, 0, width / 4 - 1)
    group.add(ashtray)
    const plant = new THREE.Group()
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.18, 0.35, 10), new THREE.MeshStandardMaterial({ color: 0x8a5a33 }))
    pot.position.y = 0.18
    const crown = new THREE.Mesh(
      new THREE.ConeGeometry(0.42, 1.0, 8),
      new THREE.MeshStandardMaterial({ color: 0x4d7c3f, flatShading: true }),
    )
    crown.position.y = 0.95
    plant.add(pot, crown)
    plant.position.set(-(width / 2 - 1.4), 0, width / 4)
    group.add(plant)
    const label = labelSprite('吸烟区', { size: 32, color: '#f8fafc', background: '#b45309dd' })
    label.position.set(0, 2.4, width / 4)
    group.add(label)
    return group
  }

  /** Build the south entrance: double glass doors ajar, posts, lintel, and mat. */
  private buildEntrance(skin: CompanySkin): THREE.Group {
    const group = new THREE.Group()
    const glass = new THREE.MeshPhysicalMaterial({
      color: skin.office.fixture,
      transparent: true,
      opacity: 0.45,
      roughness: 0.1,
    })
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group()
      pivot.position.set(side * ENTRANCE_W / 2, 0.75, 0)
      const panel = new THREE.Mesh(new THREE.BoxGeometry(ENTRANCE_W / 2 - 0.1, 1.5, 0.07), glass)
      panel.position.x = -side * (ENTRANCE_W / 4 - 0.05)
      pivot.add(panel)
      pivot.rotation.y = -side * 0.55
      group.add(pivot)
      const post = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 1.7, 0.14),
        new THREE.MeshStandardMaterial({ color: skin.office.fixture }),
      )
      post.position.set(side * (ENTRANCE_W / 2 + 0.07), 0.85, 0)
      group.add(post)
    }
    const lintel = new THREE.Mesh(
      new THREE.BoxGeometry(ENTRANCE_W + 0.5, 0.3, 0.18),
      new THREE.MeshStandardMaterial({ color: skin.office.fixture }),
    )
    lintel.position.y = 1.8
    group.add(lintel)
    const plate = labelSprite('大门', { size: 26, color: '#f8fafc', background: '#334155dd' })
    plate.position.y = 2.35
    group.add(plate)
    const mat = new THREE.Mesh(
      new THREE.PlaneGeometry(ENTRANCE_W, 1.3),
      new THREE.MeshStandardMaterial({ color: skin.office.fixture, roughness: 1 }),
    )
    mat.rotation.x = -Math.PI / 2
    mat.position.y = 0.025
    group.add(mat)
    return group
  }

  /** Build the pantry amenity: counter, coffee machine, water dispenser, and cups. */
  private buildPantry(skin: CompanySkin, width: number): THREE.Group {
    const group = new THREE.Group()
    const fixture = new THREE.MeshStandardMaterial({ color: skin.office.fixture })
    const counter = new THREE.Mesh(new THREE.BoxGeometry(width - 3, 0.9, 0.8), fixture)
    counter.position.set(0, 0.45, width / 2 - 2)
    group.add(counter)
    const machine = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.5, 0.45), new THREE.MeshStandardMaterial({ color: 0x1f2937 }))
    machine.position.set(-1.6, 1.15, width / 2 - 2)
    group.add(machine)
    const dispenser = new THREE.Group()
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.4, 12), fixture)
    tank.position.y = 1.35
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 1.1, 12), new THREE.MeshStandardMaterial({ color: 0xf8fafc }))
    body.position.y = 0.55
    dispenser.add(tank, body)
    dispenser.position.set(width / 2 - 2.2, 0, width / 2 - 2)
    group.add(dispenser)
    for (const offset of [0.4, 0.75, 1.1]) {
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.06, 0.18, 8), new THREE.MeshStandardMaterial({ color: 0xf8fafc }))
      cup.position.set(offset, 1.0, width / 2 - 1.8)
      group.add(cup)
    }
    const label = labelSprite('茶水区', { size: 32, color: '#f8fafc', background: '#0f766edd' })
    label.position.set(0, 2.4, -width / 4)
    group.add(label)
    return group
  }

  /** Build the lounge amenity: rug, two facing sofas, a coffee table, and plants. */
  private buildLounge(skin: CompanySkin, width: number): THREE.Group {
    const group = new THREE.Group()
    const fixture = new THREE.MeshStandardMaterial({ color: skin.office.fixture })
    const rug = new THREE.Mesh(
      new THREE.PlaneGeometry(width - 4, 6.4),
      new THREE.MeshStandardMaterial({ color: skin.office.fixture, roughness: 1, transparent: true, opacity: 0.55 }),
    )
    rug.rotation.x = -Math.PI / 2
    rug.position.y = 0.03
    group.add(rug)
    for (const side of [-1, 1]) {
      const sofa = new THREE.Group()
      const seat = new THREE.Mesh(new THREE.BoxGeometry(4, 0.45, 1.1), fixture)
      seat.position.y = 0.25
      const back = new THREE.Mesh(new THREE.BoxGeometry(4, 0.55, 0.25), fixture)
      back.position.set(0, 0.7, side * 0.45)
      sofa.add(seat, back)
      sofa.position.set(0, 0, side * 1.8)
      group.add(sofa)
    }
    const table = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.35, 0.95), fixture)
    table.position.y = 0.18
    group.add(table)
    for (const side of [-1, 1]) {
      const plant = new THREE.Group()
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.18, 0.35, 10), new THREE.MeshStandardMaterial({ color: 0x8a5a33 }))
      pot.position.y = 0.18
      const crown = new THREE.Mesh(
        new THREE.ConeGeometry(0.42, 1.0, 8),
        new THREE.MeshStandardMaterial({ color: 0x4d7c3f, flatShading: true }),
      )
      crown.position.y = 0.95
      plant.add(pot, crown)
      plant.position.set(side * (width / 2 - 1.6), 0, -3.2)
      group.add(plant)
    }
    const label = labelSprite('休息区', { size: 32, color: '#f8fafc', background: '#047857dd' })
    label.position.set(0, 2.4, -3.2)
    group.add(label)
    return group
  }

  /** Build one empty desk offering a bind action. */
  private buildDesk(skin: CompanySkin): THREE.Group {
    const group = new THREE.Group()
    const office = skin.office
    const top = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 0.09, 0.8),
      new THREE.MeshStandardMaterial({ color: office.desk.top }),
    )
    top.position.y = 0.62
    group.add(top)
    for (const offset of [-0.62, 0.62]) {
      const leg = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.6, 0.08),
        new THREE.MeshStandardMaterial({ color: office.desk.leg }),
      )
      leg.position.set(offset, 0.3, 0)
      group.add(leg)
    }
    const hint = labelSprite('+ 绑定员工', { size: 24, color: '#64748b' })
    hint.position.y = 1.05
    group.add(hint)
    return group
  }

  /** Build one seated employee with a screen and status label. */
  private buildMemberDesk(skin: CompanySkin, busy: boolean): { group: THREE.Group; screen: THREE.Mesh; panel: THREE.Mesh } {
    const group = this.buildDesk(skin)
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(0.62, 0.4),
      new THREE.MeshStandardMaterial({
        color: 0x0f172a,
        emissive: new THREE.Color(skin.office.screenBusy),
        emissiveIntensity: busy ? 0.9 : 0,
      }),
    )
    screen.position.set(0, 1.02, -0.32)
    group.add(screen)
    const stand = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 0.2),
      new THREE.MeshStandardMaterial({ color: 0x334155 }),
    )
    stand.position.set(0, 0.76, -0.32)
    group.add(stand)
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(0.78, 0.5),
      new THREE.MeshStandardMaterial({ color: 0xf8fafc }),
    )
    panel.position.set(0, 1.02, 0.34)
    panel.rotation.y = Math.PI
    group.add(panel)
    return { group, screen, panel }
  }

  /** Paint one employee's real-session tail onto the bound screen panel.
   * @param panel - the side screen mesh of the member's desk.
   * @param member - the seated member whose latest texts render.
   */
  private applyChatTail(panel: THREE.Mesh, member: FloorMember): void {
    const tail = member.chatTail ?? []
    const canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = 164
    const draw = canvas.getContext('2d')
    if (draw === null) return
    draw.fillStyle = '#0b1220'
    draw.fillRect(0, 0, canvas.width, canvas.height)
    draw.font = '13px system-ui, "PingFang SC", sans-serif'
    draw.fillStyle = '#a5f3fc'
    let y = 20
    for (const line of tail.slice(-3)) {
      for (const chunk of line.slice(0, 60).match(/.{1,18}/g) ?? []) {
        draw.fillText(chunk, 8, y)
        y += 16
        if (y > canvas.height - 8) break
      }
      if (y > canvas.height - 8) break
    }
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    const material = panel.material as THREE.MeshStandardMaterial
    material.map = texture
    material.color.setHex(0xffffff)
    material.needsUpdate = true
  }

  /** Build one independent person figure carrying its name and status chip.
   * @param member - the seated member the figure represents.
   * @returns the person group plus the parts whose presentation flips live.
   */
  private buildPerson(member: FloorMember): { person: THREE.Group; label: THREE.Sprite } {
    const person = new THREE.Group()
    const torso = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.22, 0.42, 4, 10),
      new THREE.MeshStandardMaterial({ color: 0x6366f1 }),
    )
    torso.position.y = 0.62
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.17, 12, 10),
      new THREE.MeshStandardMaterial({ color: 0xf5d0a9 }),
    )
    head.position.y = 1.05
    person.add(torso, head)
    const label = statusLabel(member.busy)
    label.position.set(0, 1.75, 0)
    person.add(label)
    const name = labelSprite(member.displayName, {
      size: 24,
      color: this.floorSkin.campus.groundStyle === 'night-grid' ? '#cbd5e1' : '#334155',
    })
    name.position.set(0, 1.42, 0)
    person.add(name)
    person.userData = { kind: 'member', memberKey: member.key }
    return { person, label }
  }

  /** Start one NPC walking to the desk or an amenity through the corridor.
   * Legs through the owning room always pass its door gap on the hall side.
   * @param npc - the wandering member record.
   * @param destination - walk target: the desk or an amenity anchor index.
   */
  private beginWalk(npc: FloorNpc, destination: 'desk' | number): void {
    const toDesk = destination === 'desk'
    const target = toDesk
      ? npc.seat.clone().add(new THREE.Vector3(0, 0, 0.5))
      : this.floorAmenities[destination]?.clone() ?? npc.seat.clone()
    const from = npc.person.position.clone()
    const inRoom = from.distanceTo(npc.seat) < ROOM_D / 2 + 1
    const points: THREE.Vector3[] = []
    const push = (x: number, z: number): void => {
      const last = points.at(-1)
      if (last !== undefined && Math.abs(last.x - x) < 0.3 && Math.abs(last.z - z) < 0.3) return
      if (Math.abs(from.x - x) < 0.3 && Math.abs(from.z - z) < 0.3) return
      points.push(new THREE.Vector3(x, 0, z))
    }
    if (inRoom && !toDesk) {
      push(npc.door.x, from.z)
      push(npc.door.x, this.floorHallZ)
    } else if (!inRoom && toDesk) {
      push(from.x, this.floorHallZ)
      push(npc.door.x, this.floorHallZ)
      push(npc.door.x, npc.seat.z)
    } else if (!inRoom && !toDesk) {
      push(from.x, this.floorHallZ)
    }
    push(target.x, this.floorHallZ)
    push(target.x, target.z)
    npc.path = points
    npc.pathIndex = 0
    npc.destination = destination
    npc.phase = 'walk'
    npc.person.position.y = 0
    if (!toDesk) this.setScreen(npc, false)
  }

  /** Flip one desk screen's working emissive.
   * @param npc - the member whose desk screen changes.
   * @param on - whether the screen presents work in progress.
   */
  private setScreen(npc: FloorNpc, on: boolean): void {
    ;(npc.screen.material as THREE.MeshStandardMaterial).emissiveIntensity = on ? 0.9 : 0
  }

  /** Advance every NPC one frame: decisions, walking, and seated presentation.
   * @param delta - frame delta seconds.
   * @param time - elapsed scene seconds.
   */
  private advanceNpcs(delta: number, time: number): void {
    // Pairwise crowding: close walkers yield (skip this frame's step) and
    // both accumulate irritation; O(n^2) over a room-scale roster.
    const walkers = [...this.floorNpcs.values()].filter(npc => npc.phase === 'walk')
    const yielding = new Set<string>()
    for (let i = 0; i < walkers.length; i++) {
      for (let j = i + 1; j < walkers.length; j++) {
        const left = walkers[i]
        const right = walkers[j]
        if (left === undefined || right === undefined) continue
        if (left.person.position.distanceTo(right.person.position) < 0.7) {
          yielding.add(right.person.uuid)
          left.mood = Math.min(100, left.mood + 2)
          right.mood = Math.min(100, right.mood + 2)
        }
      }
    }
    for (const npc of this.floorNpcs.values()) {
      npc.mood = Math.max(0, npc.mood - delta * 1.5)
      this.syncMoodChip(npc)
      if (npc.phase === 'sit') {
        npc.person.position.y = SEAT_SINK + (npc.busy ? Math.abs(Math.sin(time * 6)) * 0.03 : 0)
        if (!npc.busy && time >= npc.nextDecisionAt) {
          if (this.floorAmenities.length > 0 && Math.random() < 0.55) {
            this.beginWalk(npc, Math.floor(Math.random() * this.floorAmenities.length))
          } else {
            npc.nextDecisionAt = time + 4 + Math.random() * 8
          }
        }
        continue
      }
      if (npc.busy && npc.destination !== 'desk') {
        this.beginWalk(npc, 'desk')
      }
      if (npc.phase === 'walk') {
        const waypoint = npc.path[npc.pathIndex]
        if (waypoint === undefined) {
          if (npc.destination === 'desk') {
            npc.phase = 'sit'
            if (this.visitReporter !== null) this.visitReporter(npc.memberKey, '工位')
            npc.person.position.copy(npc.seat.clone().add(new THREE.Vector3(0, 0, 0.5)))
            npc.person.position.y = SEAT_SINK
            npc.person.rotation.y = Math.PI
            this.setScreen(npc, npc.busy)
          } else {
            npc.phase = 'amenity'
            npc.dwellUntil = time + 3 + Math.random() * 5
            const place = this.floorAmenityNames[typeof npc.destination === 'number' ? npc.destination : 0]
            if (place !== undefined && this.visitReporter !== null) {
              this.visitReporter(npc.memberKey, place)
            }
          }
          continue
        }
        if (yielding.has(npc.person.uuid)) continue
        const step = NPC_WALK_SPEED * delta
        const distance = npc.person.position.distanceTo(waypoint)
        if (distance <= step) {
          npc.person.position.copy(waypoint)
          npc.pathIndex += 1
        } else {
          const next = npc.person.position.clone().lerp(waypoint, step / distance)
          // Fixture AABB blocks the step: try sliding along x, then z; a fully
          // blocked mover gains irritation and eventually re-plans home.
          const blockedBy = this.floorRegistry.blockingFixture(next, NPC_HALF_EXTENTS)
          if (blockedBy === undefined) {
            npc.person.position.copy(next)
            npc.blockedSteps = 0
            npc.person.lookAt(waypoint.x, 0, waypoint.z)
          } else {
            const slideX = next.clone(); slideX.x = npc.person.position.x
            const slideZ = next.clone(); slideZ.z = npc.person.position.z
            if (this.floorRegistry.blockingFixture(slideX, NPC_HALF_EXTENTS) === undefined) {
              npc.person.position.copy(slideX)
            } else if (this.floorRegistry.blockingFixture(slideZ, NPC_HALF_EXTENTS) === undefined) {
              npc.person.position.copy(slideZ)
            } else {
              npc.blockedSteps += 1
              npc.mood = Math.min(100, npc.mood + 4)
              if (npc.blockedSteps >= 6) this.beginWalk(npc, 'desk')
            }
            // A furious passer-by kicks the blocker one damage step.
            if (npc.mood >= 85 && Math.random() < 0.4) {
              this.floorRegistry.damageStep(blockedBy.id)
              npc.mood = Math.max(0, npc.mood - 40)
            }
          }
        }
        continue
      }
      // amenity dwell
      npc.person.position.y = Math.abs(Math.sin(time * 2 + npc.seat.x)) * 0.02
      if (npc.busy) continue
      if (time >= npc.dwellUntil) {
        const chain = this.floorAmenities.length > 0 && Math.random() < 0.3
        this.beginWalk(npc, chain ? Math.floor(Math.random() * this.floorAmenities.length) : 'desk')
      }
    }
  }

  /** Show or clear the head-top mood chip at the irritation threshold.
   * @param npc - the member whose mood presentation syncs.
   */
  private syncMoodChip(npc: FloorNpc): void {
    const irritated = npc.mood >= 50
    if (irritated && npc.moodChip === null) {
      const chip = labelSprite('😡', { size: 30 })
      chip.position.set(0, 2.15, 0)
      npc.person.add(chip)
      npc.moodChip = chip
    } else if (!irritated && npc.moodChip !== null) {
      npc.person.remove(npc.moodChip)
      npc.moodChip.material.dispose()
      npc.moodChip = null
    }
  }

  /** Flip one member's live busy presentation without rebuilding the scene.
   * @param memberKey - the member's stable key.
   * @param busy - whether the member is now busy.
   */
  updateBusy(memberKey: string, busy: boolean): void {
    const npc = this.floorNpcs.get(memberKey)
    if (npc === undefined) return
    npc.busy = busy
    const next = statusLabel(busy)
    next.position.copy(npc.label.position)
    npc.person.children.splice(npc.person.children.indexOf(npc.label), 1, next)
    const oldMap = npc.label.material.map
    npc.label.material.dispose()
    if (oldMap !== null) oldMap.dispose()
    npc.label = next
    if (busy) {
      // Working members head straight home; the screen lights on arrival.
      if (npc.phase !== 'sit') this.beginWalk(npc, 'desk')
      else this.setScreen(npc, true)
    } else {
      this.setScreen(npc, false)
      npc.nextDecisionAt = 0
    }
  }

  /** Render loop: damped controls, the busy typing animation, and the city movers. */
  private animate = (): void => {
    if (this.disposed) return
    this.raf = requestAnimationFrame(this.animate)
    const active = this.view === 'campus' ? this.campus : this.floor
    const delta = this.clock.getDelta()
    const time = this.clock.elapsedTime
    if (this.view === 'floor') {
      this.advanceNpcs(delta, time)
    } else {
      this.advanceRoadCars(delta)
      this.advanceRandomRails(delta)
      this.updateTrafficLamps(time)
    }
    this.controls.update()
    this.renderer.render(active, this.camera)
  }

  /** Flip traffic lamp emissives on the fixed green→yellow→red plan.
   * @param time - elapsed scene seconds.
   */
  private updateTrafficLamps(time: number): void {
    const cycle = 11.5
    for (const lamp of this.trafficLamps) {
      const phase = (time + lamp.offset) % cycle
      lamp.red.emissiveIntensity = phase >= 6.5 ? 1 : 0.05
      lamp.yellow.emissiveIntensity = phase >= 5 && phase < 6.5 ? 1 : 0.05
      lamp.green.emissiveIntensity = phase < 5 ? 1 : 0.05
    }
  }

  /** Raycast a pointer event against interactive groups. */
  private handlePointerDown = (event: PointerEvent): void => {
    const bounds = this.canvas.getBoundingClientRect()
    this.pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1
    this.pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1
    this.raycaster.setFromCamera(this.pointer, this.camera)
    const active = this.view === 'campus' ? this.campusGroup : this.floorGroup
    const hits = this.raycaster.intersectObjects(active.children, true)
    for (const hit of hits) {
      const data = findUserData(hit.object)
      if (data === undefined) continue
      if (data.kind === 'company' && this.callbacks.onCompanyClick !== undefined) {
        this.callbacks.onCompanyClick(data.companyId as string)
        return
      }
      if (data.kind === 'member' && this.callbacks.onMemberClick !== undefined) {
        this.callbacks.onMemberClick(data.memberKey as string)
        return
      }
      if (data.kind === 'seat' && this.callbacks.onSeatClick !== undefined) {
        this.callbacks.onSeatClick((data.departmentKey ?? null) as string | null)
        return
      }
    }
  }

  /** Tear down the renderer, observers, listeners, and every tracked GPU resource. */
  dispose(): void {
    this.disposed = true
    cancelAnimationFrame(this.raf)
    this.resizeObserver.disconnect()
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown)
    this.controls.dispose()
    this.roadGraph = []
    this.roadCars.length = 0
    this.randomRails.length = 0
    this.trafficLamps.length = 0
    this.floorNpcs.clear()
    this.floorAmenities = []
    clearGroup(this.campusGroup)
    clearGroup(this.floorGroup)
    this.renderer.dispose()
  }
}

/** Walk up to the nearest group carrying interaction data. */
function findUserData(object: THREE.Object3D): Record<string, unknown> | undefined {
  for (let current: THREE.Object3D | null = object; current !== null; current = current.parent) {
    if ('kind' in current.userData) return current.userData as Record<string, unknown>
  }
  return undefined
}

/** Dispose every GPU resource under one group and clear its children. */
function clearGroup(group: THREE.Group): void {
  const geometries = new Set<THREE.BufferGeometry>()
  const materials = new Set<THREE.Material>()
  const textures = new Set<THREE.Texture>()
  group.traverse((child) => {
    const mesh = child as Partial<THREE.Mesh>
    if (mesh.geometry !== undefined) geometries.add(mesh.geometry)
    const material = mesh.material
    if (material !== undefined) {
      for (const entry of Array.isArray(material) ? material : [material]) materials.add(entry)
    }
    const map = (material as THREE.MeshStandardMaterial | undefined)?.map
    if (map !== undefined && map !== null) textures.add(map)
    const spriteMap = (child as Partial<THREE.Sprite>).material?.map
    if (spriteMap !== undefined && spriteMap !== null) textures.add(spriteMap)
  })
  for (const texture of textures) texture.dispose()
  for (const material of materials) material.dispose()
  for (const geometry of geometries) geometry.dispose()
  group.clear()
}
