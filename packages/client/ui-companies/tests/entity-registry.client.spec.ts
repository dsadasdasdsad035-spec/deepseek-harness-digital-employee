import { describe, expect, it } from 'vitest'
import { Vector2, Vector3 } from 'three'
import { EntityRegistry, resolveBlockedStep, seatedIdleDecision } from '../src/client/scene.ts'

/** @vitest-environment node */

/** Minimal visual stub satisfying the damage transform calls. */
function objectStub(): { rotateZ(): void; rotateX(): void; position: { y: number } } {
  return {
    rotateZ() {},
    rotateX() {},
    position: { y: 0 },
  }
}

function fixture(id: string, x: number, z: number, hx: number, hz: number, destructible = true) {
  return {
    id, kind: 'fixture' as const,
    position: new Vector3(x, 0, z),
    halfExtents: new Vector2(hx, hz),
    destructible,
  }
}

describe('EntityRegistry collision', () => {
  it('blocks a step whose AABB overlaps a fixture and clears when apart', () => {
    const registry = new EntityRegistry()
    registry.register(fixture('sofa', 4, 0, 2, 0.55))
    const moverHalf = new Vector2(0.28, 0.28)
    expect(registry.blockingFixture(new Vector3(3, 0, 0), moverHalf)).toBeDefined()
    expect(registry.blockingFixture(new Vector3(1.6, 0, 0), moverHalf)).toBeUndefined()
  })

  it('honors the ignore id (an NPC steps within its own desk footprint)', () => {
    const registry = new EntityRegistry()
    registry.register(fixture('desk-alice', 0, 0, 0.8, 0.45))
    const at = new Vector3(0, 0, 0)
    expect(registry.blockingFixture(at, new Vector2(0.28, 0.28))).toBeDefined()
    expect(registry.blockingFixture(at, new Vector2(0.28, 0.28), 'desk-alice')).toBeUndefined()
  })

  it('toppled rubble no longer blocks walkers', () => {
    const registry = new EntityRegistry()
    registry.register({ ...fixture('bench', 0, 0, 2, 0.45), object: objectStub() as never })
    registry.damageStep('bench')
    registry.damageStep('bench')
    expect(registry.blockingFixture(new Vector3(0, 0, 0), new Vector2(0.28, 0.28))).toBeUndefined()
  })

  it('damageStep advances the states and refuses non-destructibles', () => {
    const registry = new EntityRegistry()
    registry.register({ ...fixture('pc-alice', 0, 0, 0.35, 0.12), object: objectStub() as never })
    registry.register(fixture('wall', 5, 5, 1, 1, false))
    expect(registry.damageStep('wall')).toBeUndefined()
    expect(registry.damageStep('pc-alice')).toBe('damaged')
    expect(registry.damageStep('pc-alice')).toBe('destroyed')
    expect(registry.damageStep('pc-alice')).toBeUndefined()
    expect(registry.damageStep('missing')).toBeUndefined()
  })

  it('filters fixtures and cars for the per-class strategies', () => {
    const registry = new EntityRegistry()
    registry.register(fixture('desk', 0, 0, 0.8, 0.45))
    registry.register({ id: 'car-0', kind: 'car' as const, position: new Vector3(1, 0, 1), halfExtents: new Vector2(0.8, 1.6) })
    expect(registry.fixtures().map(entity => entity.id)).toEqual(['desk'])
    expect(registry.cars().map(entity => entity.id)).toEqual(['car-0'])
  })
})

describe('solid walls and traffic rules', () => {
  it('wall segments block while the door gap passes a body', () => {
    const registry = new EntityRegistry()
    // A room door wall: two 4-unit segments leaving a 2.4 gap centered at 0.
    registry.register(fixture('wall-a', -3.2, 0, 2.0, 0.08))
    registry.register(fixture('wall-b', 3.2, 0, 2.0, 0.08))
    const body = new Vector2(0.28, 0.28)
    expect(registry.blockingFixture(new Vector3(0, 0, 0), body)).toBeUndefined()
    expect(registry.blockingFixture(new Vector3(-3.2, 0, 0), body)).toBeDefined()
    expect(registry.blockingFixture(new Vector3(1.4, 0, 0), body)).toBeDefined()
  })

  it('accepts several ignore ids for the own seat fixtures', () => {
    const registry = new EntityRegistry()
    registry.register(fixture('fixture-desk-alice', 0, 0, 0.8, 0.45))
    registry.register(fixture('fixture-pc-alice', 0, -0.32, 0.35, 0.12))
    registry.register(fixture('fixture-desk-bob', 2, 0, 0.8, 0.45))
    const at = new Vector3(0, 0, 0)
    const body = new Vector2(0.28, 0.28)
    expect(registry.blockingFixture(at, body, 'fixture-desk-alice', 'fixture-pc-alice')).toBeUndefined()
    expect(registry.blockingFixture(new Vector3(2, 0, 0), body, 'fixture-desk-alice', 'fixture-pc-alice')).toBeDefined()
  })

  it('glass and perimeter walls are plain non-destructible blockers', () => {
    const registry = new EntityRegistry()
    registry.register(fixture('wall-ceo-glass', 0, 0, 5.5, 0.08, false))
    expect(registry.blockingFixture(new Vector3(0, 0, 0), new Vector2(0.28, 0.28))).toBeDefined()
    expect(registry.damageStep('wall-ceo-glass')).toBeUndefined()
  })
})

describe('whole-segment walk clearance', () => {
  const body = new Vector2(0.28, 0.28)

  it('reports a blocker between two clear endpoints', () => {
    // Regression: endpoint-only checks adopted detours whose entry leg is
    // blocked, so the walker never advanced and re-detoured forever.
    const registry = new EntityRegistry()
    registry.register(fixture('sofa', 0, 0, 0.5, 0.5))
    const from = new Vector3(-3, 0, 0)
    const to = new Vector3(3, 0, 0)
    expect(registry.blockingFixture(from, body)).toBeUndefined()
    expect(registry.blockingFixture(to, body)).toBeUndefined()
    expect(registry.segmentBlockingFixture(from, to, body)).toBeDefined()
  })

  it('passes a whole segment through a door gap wider than the body', () => {
    // Door gaps must stay traversable after whole-leg sampling: the layout's
    // doors (DOOR_W 2.4) leave far more room than the body (0.56 wide).
    const registry = new EntityRegistry()
    registry.register(fixture('wall-a', -3.2, 0, 2.0, 0.08))
    registry.register(fixture('wall-b', 3.2, 0, 2.0, 0.08))
    const inside = new Vector3(0, 0, 4)
    const outside = new Vector3(0, 0, -4)
    expect(registry.segmentBlockingFixture(inside, outside, body)).toBeUndefined()
  })

  it('clears a whole segment that stays out of every fixture', () => {
    const registry = new EntityRegistry()
    registry.register(fixture('sofa', 0, 5, 0.5, 0.5))
    expect(registry.segmentBlockingFixture(new Vector3(-3, 0, 0), new Vector3(3, 0, 0), body)).toBeUndefined()
  })

  it('rejects the straight cut but clears the door route at an offset seat', () => {
    // CEO-office geometry: the door wall spans x [-25.54, -21.4] at z 2.17 with
    // the gap on the +x side, and the seat sits off the door's axis. A walker in
    // the hall cannot cut straight across to the seat; it must cross at the gap.
    const registry = new EntityRegistry()
    registry.register(fixture('wall-ceo-office-3', -23.47, 2.17, 2.07, 0.08))
    const hall = new Vector3(-21.1, 0, 2.1)
    const seat = new Vector3(-23.3, 0, 7.09)
    // Straight cut: enter at the seat's x, then walk up to the seat -> crosses the wall.
    expect(registry.segmentBlockingFixture(hall, new Vector3(seat.x, 0, hall.z), body)).toBeDefined()
    // Door route: out to the gap's x on the hall line, through the gap, then across.
    const doorX = -20.2
    expect(registry.segmentBlockingFixture(hall, new Vector3(doorX, 0, hall.z), body)).toBeUndefined()
    expect(registry.segmentBlockingFixture(new Vector3(doorX, 0, hall.z), new Vector3(doorX, 0, seat.z), body)).toBeUndefined()
    expect(registry.segmentBlockingFixture(new Vector3(doorX, 0, seat.z), seat, body)).toBeUndefined()
  })

  it('honors ignored ids along the segment (own desk is not an obstacle)', () => {
    const registry = new EntityRegistry()
    registry.register(fixture('fixture-desk-alice', 0, 0, 0.8, 0.45))
    const from = new Vector3(-2, 0, 0)
    const to = new Vector3(2, 0, 0)
    expect(registry.segmentBlockingFixture(from, to, body)).toBeDefined()
    expect(registry.segmentBlockingFixture(from, to, body, 'fixture-desk-alice')).toBeUndefined()
  })
})

describe('blocked-step resolution', () => {
  const clear = (): boolean => true
  const blocked = (): boolean => false

  it('adopts a fully traversable detour without counting a block', () => {
    const side = new Vector3(1, 0, 1)
    const past = new Vector3(2, 0, 0)
    const out = resolveBlockedStep(
      { blockedSteps: 2, mood: 20, sidePoint: side, pastPoint: past, forward: 1 },
      { from: new Vector3(0, 0, 0), alongX: true, legClear: clear },
    )
    expect(out.detour).toEqual([side, past])
    expect(out.blockedSteps).toBe(0)
    expect(out.replan).toBe(false)
  })

  it('counts an untraversable frame and keeps the walker on the re-plan path', () => {
    const out = resolveBlockedStep(
      { blockedSteps: 0, mood: 10, forward: 1 },
      { from: new Vector3(0, 0, 0), alongX: true, legClear: blocked },
    )
    expect(out.detour).toBeUndefined()
    expect(out.blockedSteps).toBe(1)
    expect(out.mood).toBe(14)
    expect(out.replan).toBe(false)
  })

  it('re-plans once the block limit is reached with no open retreat', () => {
    const out = resolveBlockedStep(
      { blockedSteps: 3, mood: 10, forward: 1 },
      { from: new Vector3(0, 0, 0), alongX: true, legClear: blocked },
    )
    expect(out.replan).toBe(true)
    expect(out.retreat).toBeUndefined()
  })

  it('retreats perpendicular instead of re-planning when a side step is open', () => {
    const out = resolveBlockedStep(
      { blockedSteps: 3, mood: 10, forward: 1 },
      { from: new Vector3(0, 0, 0), alongX: true, legClear: clear },
    )
    expect(out.replan).toBe(false)
    expect(out.retreat).toBeDefined()
    expect(out.blockedSteps).toBe(0)
  })

  it('caps mood at 100', () => {
    const out = resolveBlockedStep(
      { blockedSteps: 0, mood: 99, forward: 1 },
      { from: new Vector3(0, 0, 0), alongX: true, legClear: blocked },
    )
    expect(out.mood).toBe(100)
  })

  it('never adopts a detour while blocked, so a stalled walker cannot grow its path', () => {
    // Regression: the old detour branch prepended two points every frame while
    // the walker stood still, growing an unbounded path (observed 353 -> 82955).
    // With no traversable leg, no frame may adopt a detour.
    let blockedSteps = 0
    let mood = 0
    let adopted = 0
    let replans = 0
    for (let frame = 0; frame < 200; frame++) {
      const out = resolveBlockedStep(
        { blockedSteps, mood, forward: 1 },
        { from: new Vector3(0, 0, 0), alongX: true, legClear: blocked },
      )
      if (out.detour !== undefined) adopted += 1
      if (out.replan) replans += 1
      blockedSteps = out.blockedSteps
      mood = out.mood
    }
    expect(adopted).toBe(0)
    expect(replans).toBeGreaterThan(0)
    expect(mood).toBeLessThanOrEqual(100)
  })
})

describe('seated idle decision', () => {
  it('leaves for an amenity once eligible when the leave draw is under the threshold', () => {
    const decision = seatedIdleDecision({
      time: 10, nextDecisionAt: 5, amenityCount: 4,
      leaveRoll: 0.1, pickRoll: 0.6, waitRoll: 0,
    })
    expect(decision.destination).toBe(2)
    // Leaving carries no new eligibility time; the walk itself takes over.
    expect(decision.nextDecisionAt).toBe(5)
  })

  it('waits and re-schedules when the leave draw is at or above the threshold', () => {
    const decision = seatedIdleDecision({
      time: 10, nextDecisionAt: 5, amenityCount: 4,
      leaveRoll: 0.9, pickRoll: 0, waitRoll: 0.5,
    })
    expect(decision.destination).toBeNull()
    // time + 4 (min) + 0.5 * 8 (span)
    expect(decision.nextDecisionAt).toBe(18)
  })

  it('waits while not yet eligible regardless of the leave draw', () => {
    const decision = seatedIdleDecision({
      time: 4, nextDecisionAt: 9, amenityCount: 4,
      leaveRoll: 0, pickRoll: 0, waitRoll: 0,
    })
    expect(decision.destination).toBeNull()
    expect(decision.nextDecisionAt).toBe(9)
  })

  it('cannot pick an amenity when the floor has none, even on a leave draw', () => {
    const decision = seatedIdleDecision({
      time: 10, nextDecisionAt: 0, amenityCount: 0,
      leaveRoll: 0, pickRoll: 0, waitRoll: 0,
    })
    expect(decision.destination).toBeNull()
    expect(decision.nextDecisionAt).toBe(14)
  })

  it('clamps a pick draw of exactly 1 to the last amenity', () => {
    const decision = seatedIdleDecision({
      time: 10, nextDecisionAt: 0, amenityCount: 3,
      leaveRoll: 0.5, pickRoll: 1, waitRoll: 0,
    })
    expect(decision.destination).toBe(2)
  })
})
