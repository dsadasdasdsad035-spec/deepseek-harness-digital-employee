import {
  generateMarketplaceTemplateArchives,
  MCP_EXAMPLE_ARCHIVE_PATH,
  MCP_TEMPLATE_ARCHIVE_PATH,
  SKILL_EXAMPLE_ARCHIVE_PATH,
  TEMPLATE_ARCHIVE_PATH,
  TOOL_EXAMPLE_ARCHIVE_PATH,
  TOOL_TEMPLATE_ARCHIVE_PATH,
} from './archive.ts'

await generateMarketplaceTemplateArchives()
console.log(`Generated ${TEMPLATE_ARCHIVE_PATH}`)
console.log(`Generated ${TOOL_TEMPLATE_ARCHIVE_PATH}`)
console.log(`Generated ${MCP_TEMPLATE_ARCHIVE_PATH}`)
console.log(`Generated ${SKILL_EXAMPLE_ARCHIVE_PATH}`)
console.log(`Generated ${TOOL_EXAMPLE_ARCHIVE_PATH}`)
console.log(`Generated ${MCP_EXAMPLE_ARCHIVE_PATH}`)
