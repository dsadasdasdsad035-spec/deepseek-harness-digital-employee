import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import Companies, { createCompanyEmployeeId, type CompanyId } from '@deepseek-ai/dsh-company'
import { describe, expect, it } from 'vitest'
import { FileCompanyProvider } from '@deepseek-ai/dsh-company-file'

async function harness(path: string): Promise<{ ctx: Context; provider: FileCompanyProvider }> {
  const ctx = new Context()
  await ctx.plugin(Companies)
  const provider = new FileCompanyProvider(ctx, { path })
  await provider.initialize()
  ctx.companies.configureProvider(provider)
  return { ctx, provider }
}

describe('FileCompanyProvider', () => {
  it('seeds preset departments and restores companies across restarts', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-company-'))
    const path = join(root, 'companies.json')
    const first = await harness(path)
    const created = await first.ctx.companies.create({
      name: 'Acme',
      category: '科技',
      legalRepresentative: '张三',
      address: '北京市海淀区',
    })
    expect(created.departments.map(department => department.name)).toEqual(['总裁', '人力', '行政', 'IT', '销售'])

    const second = await harness(path)
    expect(await second.ctx.companies.list()).toEqual([expect.objectContaining({ id: created.id, name: 'Acme' })])
    expect(JSON.parse(await readFile(path, 'utf8'))).toMatchObject({ schemaVersion: 1 })
  })

  it('stores a per-company skin id and defaults legacy records to none', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-company-skin-'))
    const path = join(root, 'companies.json')
    const first = await harness(path)
    const plain = await first.ctx.companies.create({ name: 'Acme' })
    const skinned = await first.ctx.companies.create({ name: 'Beta', skinId: 'courtyard' })
    expect(plain.skinId).toBeUndefined()
    expect(skinned.skinId).toBe('courtyard')

    const switched = await first.ctx.companies.update({ companyId: plain.id, skinId: 'neon' })
    expect(switched.skinId).toBe('neon')

    const second = await harness(path)
    const restored = await second.ctx.companies.list()
    expect(restored.map(company => company.skinId)).toEqual(['neon', 'courtyard'])

    const legacy = JSON.parse(await readFile(path, 'utf8')) as { companies: Array<{ skinId?: string }> }
    const firstCompany = legacy.companies[0]
    if (firstCompany !== undefined) delete firstCompany.skinId
    await writeFile(path, JSON.stringify(legacy))
    const third = await harness(path)
    const legacyCompany = (await third.ctx.companies.list()).find(company => company.name === 'Acme')
    expect(legacyCompany?.skinId).toBeUndefined()
  })

  it('rejects blank company names on create and update', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-company-blank-'))
    const { ctx } = await harness(join(root, 'companies.json'))
    await expect(ctx.companies.create({ name: '  ' })).rejects.toThrow(/company name is required/)
    const company = await ctx.companies.create({ name: 'Acme' })
    await expect(ctx.companies.update({ companyId: company.id, name: '' })).rejects.toThrow(/company name is required/)
  })

  it('rejects an unsupported schema version instead of migrating', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-company-version-'))
    const path = join(root, 'companies.json')
    await writeFile(path, JSON.stringify({ schemaVersion: 99, companies: [], bindings: [] }))
    await expect(harness(path)).rejects.toThrow(/unsupported schema version 99/)
  })

  it('extends, renames, reorders, and deletes departments with unique-name enforcement', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-company-departments-'))
    const { ctx } = await harness(join(root, 'companies.json'))
    const company = await ctx.companies.create({ name: 'Acme' })
    const added = await ctx.companies.addDepartment({ companyId: company.id, name: '法务', position: 1 })
    expect(added.departments.map(department => department.name)).toEqual(['总裁', '法务', '人力', '行政', 'IT', '销售'])
    await expect(ctx.companies.addDepartment({ companyId: company.id, name: '法务' }))
      .rejects.toThrow(/already has a department named/)

    const renamed = await ctx.companies.renameDepartment({
      companyId: company.id,
      departmentId: added.departments[1]!.id,
      name: '合规',
    })
    expect(renamed.departments[1]!.name).toBe('合规')
    await expect(ctx.companies.renameDepartment({
      companyId: company.id,
      departmentId: added.departments[1]!.id,
      name: '总裁',
    })).rejects.toThrow(/already has a department named/)

    const reordered = await ctx.companies.reorderDepartments({
      companyId: company.id,
      orderedIds: [...renamed.departments.slice(1).map(department => department.id), renamed.departments[0]!.id],
    })
    expect(reordered.departments[0]!.name).toBe('合规')
    await expect(ctx.companies.reorderDepartments({
      companyId: company.id,
      orderedIds: reordered.departments.slice(1).map(department => department.id),
    })).rejects.toThrow(/exactly once/)

    const deleted = await ctx.companies.deleteDepartment({
      companyId: company.id,
      departmentId: reordered.departments[0]!.id,
    })
    expect(deleted.departments.some(department => department.name === '合规')).toBe(false)
  })

  it('moves members to the unassigned group when their department is deleted', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-company-unassigned-'))
    const { ctx } = await harness(join(root, 'companies.json'))
    const company = await ctx.companies.create({ name: 'Acme' })
    const instanceId = createCompanyEmployeeId('instance-1')
    await ctx.companies.assignEmployee({
      instanceId,
      companyId: company.id,
      departmentId: company.departments[0]!.id,
    })
    await ctx.companies.deleteDepartment({ companyId: company.id, departmentId: company.departments[0]!.id })
    expect(await ctx.companies.listBindings()).toEqual([
      { instanceId, companyId: company.id, departmentId: null },
    ])
  })

  it('replaces the previous binding when an instance is assigned again', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-company-assign-'))
    const { ctx } = await harness(join(root, 'companies.json'))
    const first = await ctx.companies.create({ name: 'Acme' })
    const second = await ctx.companies.create({ name: 'Beta' })
    const instanceId = createCompanyEmployeeId('instance-1')
    await ctx.companies.assignEmployee({
      instanceId,
      companyId: first.id,
      departmentId: first.departments[0]!.id,
    })
    await ctx.companies.assignEmployee({
      instanceId,
      companyId: second.id,
      departmentId: second.departments[1]!.id,
    })
    expect(await ctx.companies.listBindings()).toEqual([
      { instanceId, companyId: second.id, departmentId: second.departments[1]!.id },
    ])

    await ctx.companies.unassignEmployee({ instanceId })
    expect(await ctx.companies.listBindings()).toEqual([])
  })

  it('rejects assignments into unknown companies or departments', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-company-unknown-'))
    const { ctx } = await harness(join(root, 'companies.json'))
    const company = await ctx.companies.create({ name: 'Acme' })
    await expect(ctx.companies.assignEmployee({
      instanceId: createCompanyEmployeeId('instance-1'),
      companyId: 'missing' as CompanyId,
      departmentId: null,
    })).rejects.toThrow(/company "missing" does not exist/)
    await expect(ctx.companies.assignEmployee({
      instanceId: createCompanyEmployeeId('instance-1'),
      companyId: company.id,
      departmentId: 'missing' as never,
    })).rejects.toThrow(/does not exist in company/)
  })

  it('deleting a company unbinds every member', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-company-delete-'))
    const { ctx } = await harness(join(root, 'companies.json'))
    const company = await ctx.companies.create({ name: 'Acme' })
    const other = await ctx.companies.create({ name: 'Beta' })
    await ctx.companies.assignEmployee({
      instanceId: createCompanyEmployeeId('instance-1'),
      companyId: company.id,
      departmentId: company.departments[0]!.id,
    })
    await ctx.companies.assignEmployee({
      instanceId: createCompanyEmployeeId('instance-2'),
      companyId: other.id,
      departmentId: other.departments[0]!.id,
    })
    await ctx.companies.delete(company.id)
    expect((await ctx.companies.list()).map(entry => entry.name)).toEqual(['Beta'])
    expect(await ctx.companies.listBindings()).toEqual([
      { instanceId: createCompanyEmployeeId('instance-2'), companyId: other.id, departmentId: other.departments[0]!.id },
    ])
  })

  it('prunes bindings of deleted instances and keeps the rest', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-company-prune-'))
    const { ctx } = await harness(join(root, 'companies.json'))
    const company = await ctx.companies.create({ name: 'Acme' })
    await ctx.companies.assignEmployee({
      instanceId: createCompanyEmployeeId('gone'),
      companyId: company.id,
      departmentId: company.departments[0]!.id,
    })
    await ctx.companies.assignEmployee({
      instanceId: createCompanyEmployeeId('kept'),
      companyId: company.id,
      departmentId: company.departments[0]!.id,
    })
    const removed = await ctx.companies.pruneEmployeeBindings(id => id !== createCompanyEmployeeId('gone'))
    expect(removed).toBe(1)
    expect(await ctx.companies.listBindings()).toEqual([
      expect.objectContaining({ instanceId: createCompanyEmployeeId('kept') }),
    ])
  })

  it('serializes concurrent writes without losing updates', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-company-concurrent-'))
    const path = join(root, 'companies.json')
    const { ctx } = await harness(path)
    const company = await ctx.companies.create({ name: 'Acme' })
    await Promise.all(Array.from({ length: 8 }, (_, index) =>
      ctx.companies.assignEmployee({
        instanceId: createCompanyEmployeeId(`instance-${String(index)}`),
        companyId: company.id,
        departmentId: company.departments[index % company.departments.length]!.id,
      })))
    expect((await ctx.companies.listBindings()).length).toBe(8)

    const reloaded = await harness(path)
    expect((await reloaded.ctx.companies.listBindings()).length).toBe(8)
  })

  it('emits one companies/change event per mutation naming the affected company', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-company-events-'))
    const { ctx } = await harness(join(root, 'companies.json'))
    const seen: string[] = []
    ctx.on('companies/change', (companyId) => { seen.push(companyId) })
    const company = await ctx.companies.create({ name: 'Acme' })
    await ctx.companies.addDepartment({ companyId: company.id, name: '法务' })
    await ctx.companies.unassignEmployee({ instanceId: createCompanyEmployeeId('nobody') })
    expect(seen).toEqual([company.id, company.id])
  })
})
