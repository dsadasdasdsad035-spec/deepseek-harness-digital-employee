import { describe, expect, it } from 'vitest'
import { Vector2, Vector3 } from 'three'
import { EntityRegistry } from '../src/client/scene.ts'

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
