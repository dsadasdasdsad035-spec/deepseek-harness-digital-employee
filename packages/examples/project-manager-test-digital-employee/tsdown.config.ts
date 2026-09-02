import { defineConfig } from 'tsdown'

function entry(name: string) {
  return {
    entry: [`lib/types/${name}.js`],
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  outputOptions: { codeSplitting: false },
    dts: false,
    clean: false,
  }
}

/** Build every published project-manager fixture entry. */
export default defineConfig([
  entry('index'),
  entry('tools'),
  entry('skills'),
  entry('project-data-mcp'),
  {
    ...entry('invariant'),
    entry: ['lib/types/invariant.js'],
  },
])
