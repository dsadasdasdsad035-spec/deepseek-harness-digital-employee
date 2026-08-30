import { generateTemplateArchive, TEMPLATE_ARCHIVE_PATH } from './archive.ts'

await generateTemplateArchive()
console.log(`Generated ${TEMPLATE_ARCHIVE_PATH}`)
