import { createDigitalEmployeeTemplateId, createExpertId } from "@deepseek-ai/dsh-digital-employee";
//#region src/index.ts
const ROOT = import.meta.dirname;
const REVIEWER_ID = createExpertId("reviewer");
const EMPTY_AUTHORITY = {
	skills: [],
	tools: [],
	mcpServers: [],
	experts: [],
	allowSubagents: false
};
const common = {
	id: createDigitalEmployeeTemplateId("operations-coordinator"),
	display: {
		name: "Operations Coordinator",
		description: "Coordinates operational work with a continuable independent reviewer."
	},
	personality: "Calm, precise, and explicit about permissions.",
	instructions: {
		kind: "file",
		root: ROOT,
		path: "../AGENTS.md",
		revision: "operations-coordinator-v1"
	},
	preset: "standard",
	experts: [{
		id: REVIEWER_ID,
		name: "Independent Reviewer",
		responsibility: "Review delegated work and identify missing evidence.",
		instructions: {
			kind: "file",
			root: ROOT,
			path: "../experts/reviewer/AGENTS.md",
			revision: "operations-reviewer-v1"
		},
		modelSettings: {},
		capabilities: EMPTY_AUTHORITY,
		memoryAccess: ["task", "session"],
		delegation: {
			mode: "continuable",
			maxDepth: 0,
			maxConcurrency: 1,
			timeoutMs: 3e4
		}
	}],
	delegation: {
		maxDepth: 1,
		maxConcurrency: 2,
		timeoutMs: 3e4
	}
};
const templates = [{
	...common,
	version: "1.0.0",
	capabilities: {
		...EMPTY_AUTHORITY,
		experts: [REVIEWER_ID]
	}
}, {
	...common,
	version: "2.0.0",
	instructions: {
		...common.instructions,
		revision: "operations-coordinator-v2"
	},
	capabilities: {
		...EMPTY_AUTHORITY,
		experts: [REVIEWER_ID],
		allowSubagents: true
	}
}];
const name = "digital-employee-example-template";
const inject = ["digitalEmployees"];
/** Register the immutable example template versions for the current plugin lifetime. */
function apply(ctx) {
	for (const template of templates) ctx.digitalEmployees.registerTemplate(template);
}
//#endregion
export { apply, inject, name };
