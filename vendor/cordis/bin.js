#!/usr/bin/env node

import { Context } from '@qq296629801/cordis'
import { pathToFileURL } from 'node:url'
import Loader from '@qq296629801/cordis-plugin-loader'

const ctx = new Context()
ctx.baseUrl = pathToFileURL(process.cwd()).href + '/'

await ctx.plugin(Loader)
await ctx.loader.create({
  name: '@qq296629801/cordis-plugin-include',
  config: {
    path: './cordis.yml',
  },
})
