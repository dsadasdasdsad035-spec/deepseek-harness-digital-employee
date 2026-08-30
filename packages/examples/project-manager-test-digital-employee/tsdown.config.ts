import { defineConfig } from 'tsdown'

/** Build every published project-manager fixture entry. */
export default defineConfig([
  'index',
  'tools',
  'skills',
  'project-data-mcp',
  'invariant',
].map(entry => ({
  entry: [`lib/types/${entry}.js`],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  outputOptions: { codeSplitting: false },
  dts: false,
  clean: false,
})))
