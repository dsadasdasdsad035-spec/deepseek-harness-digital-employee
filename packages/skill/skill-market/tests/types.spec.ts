import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  skillMarketBannerRequestSchema,
  skillMarketBannerResultSchema,
  skillMarketInstallRequestSchema,
  skillMarketInstallResultSchema,
  skillMarketListResultSchema,
  skillMarketUninstallRequestSchema,
  skillMarketUninstallResultSchema,
  type SkillMarketFailure,
  type SkillMarketSkillId,
} from '../src/types.ts'

describe('skill marketplace wire types', () => {
  it('brands validated skill identifiers at the wire parser', () => {
    const request = skillMarketUninstallRequestSchema.parse({ skillId: 'demo-skill' })
    expect(request.skillId).toBe('demo-skill')
    expectTypeOf(request.skillId).toEqualTypeOf<SkillMarketSkillId>()

    expect(() => skillMarketBannerRequestSchema.parse({ skillId: 'Demo Skill' })).toThrow()
    expect(() => skillMarketUninstallRequestSchema.parse({
      skillId: 'demo-skill',
      extra: true,
    })).toThrow()
  })

  it('strictly validates requests and successful values without Host paths', () => {
    expect(skillMarketInstallRequestSchema.parse({
      filename: 'demo.zip',
      archiveBase64: 'UEsDBA==',
      replaceExisting: true,
    })).toEqual({
      filename: 'demo.zip',
      archiveBase64: 'UEsDBA==',
      replaceExisting: true,
    })
    expect(() => skillMarketInstallRequestSchema.parse({
      filename: 'demo.zip',
      archiveBase64: 'UEsDBA==',
      overwrite: true,
    })).toThrow()

    expect(skillMarketListResultSchema.parse({
      ok: true,
      value: {
        entries: [{
          skillId: 'demo-skill',
          description: 'Demo skill',
          version: '1.0.0',
          author: 'DeepSeek',
          tags: ['demo'],
          installedAt: 1,
          hasBanner: true,
        }],
      },
    })).not.toHaveProperty('value.entries.0.manifestPath')
    expect(skillMarketInstallResultSchema.parse({
      ok: true,
      value: { skillId: 'demo-skill', operation: 'installed' },
    })).toEqual({
      ok: true,
      value: { skillId: 'demo-skill', operation: 'installed' },
    })
    expect(skillMarketBannerResultSchema.parse({
      ok: true,
      value: {
        skillId: 'demo-skill',
        mediaType: 'image/png',
        dataBase64: 'iVBORw0KGgo=',
      },
    }).ok).toBe(true)
    expect(skillMarketUninstallResultSchema.parse({
      ok: true,
      value: { skillId: 'demo-skill' },
    }).ok).toBe(true)
  })

  it('keeps business failures closed and code-specific', () => {
    const failure = skillMarketInstallResultSchema.parse({
      ok: false,
      error: {
        code: 'managed-upgrade-required',
        skillId: 'demo-skill',
        installedVersion: '1.0.0',
        candidateVersion: '2.0.0',
      },
    })
    expect(failure.ok).toBe(false)

    expect(() => skillMarketInstallResultSchema.parse({
      ok: false,
      error: {
        code: 'managed-upgrade-required',
        skillId: 'demo-skill',
        reason: 'wrong detail row',
      },
    })).toThrow()
    expect(() => skillMarketUninstallResultSchema.parse({
      ok: false,
      error: {
        code: 'not-found',
        skillId: 'demo-skill',
        message: '/Users/example/.dsh/skills/demo-skill',
      },
    })).toThrow()
  })

  it('requires exhaustive failure-code handling', () => {
    const render = (failure: SkillMarketFailure): string => {
      switch (failure.code) {
        case 'invalid-archive':
        case 'resource-limit':
        case 'unsafe-entry':
        case 'invalid-descriptor':
        case 'invalid-banner':
        case 'managed-upgrade-required':
        case 'unmanaged-conflict':
        case 'manifest-incompatible':
        case 'not-found':
        case 'not-managed':
          return failure.code
        default:
          return failure satisfies never
      }
    }

    expect(render({
      code: 'not-found',
      skillId: 'missing-skill' as SkillMarketSkillId,
    })).toBe('not-found')
  })
})
