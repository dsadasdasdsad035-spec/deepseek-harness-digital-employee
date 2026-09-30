import { Service } from '@qq296629801/cordis'

/** Service whose public annotations are intentionally absent. */
export class WritableService extends Service {
  value = 1

  echo(input = 'value') {
    return input
  }
}

declare module '@qq296629801/cordis' {
  interface Context {
    writable: WritableService
  }
}

export default WritableService
