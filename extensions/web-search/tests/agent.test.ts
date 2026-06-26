/**
 * Tests for agent.ts — Phase 1
 *
 * Covers: tool registration, goal management, state transitions,
 * output formatting (inactive, empty, with queries/fetches).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { __resetState, __getState } from "../agent";

// ---------------------------------------------------------------------------
// Fake ExtensionAPI
// ---------------------------------------------------------------------------
interface RegisteredTool {
	name: string;
	label: string;
	description: string;
	parameters: unknown;
	execute: (
		toolCallId: string,
		params: unknown,
		signal: AbortSignal | undefined,
	) => Promise<{
		content: Array<{ type: "text"; text: string }>;
		details: Record<string, unknown>;
	}>;
}

function createFakeAPI() {
	const tools: RegisteredTool[] = [];
	return {
		registerTool: vi.fn((def: RegisteredTool) => {
			tools.push(def);
		}),
		on: vi.fn(),
		getTools: () => tools,
		// Tools are retrieved by name for testing
		getTool: (name: string) => tools.find((t) => t.name === name),
	};
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Load agent module fresh (re-exports registerWebAgent) */
async function loadAgent() {
	// Dynamic import to get fresh state each time
	return await import("../agent");
}

// ---------------------------------------------------------------------------
// State management
// ---------------------------------------------------------------------------
describe("agent state management", () => {
	beforeEach(() => {
		__resetState();
	});

	it("starts with inactive state", () => {
		const state = __getState();
		expect(state.goal).toBeNull();
		expect(state.queries.size).toBe(0);
		expect(state.fetches.size).toBe(0);
	});

	it("isNewGoal returns true when goal is null", async () => {
		const { registerWebAgent } = await loadAgent();
		const api = createFakeAPI();
		registerWebAgent(api);

		const tool = api.getTool("web_agent")!;
		const result = await tool.execute("id1", { goal: "test goal" }, undefined);

		expect(result.details.goal).toBe("test goal");

		const state = __getState();
		expect(state.goal).toBe("test goal");
	});

	it("same goal preserves state", async () => {
		const { registerWebAgent } = await loadAgent();
		const api = createFakeAPI();
		registerWebAgent(api);
		const tool = api.getTool("web_agent")!;

		// First call sets goal
		await tool.execute("id1", { goal: "same goal" }, undefined);
		const state1 = __getState();
		expect(state1.goal).toBe("same goal");

		// Second call with same goal
		await tool.execute("id2", { goal: "same goal" }, undefined);
		const state2 = __getState();
		expect(state2.goal).toBe("same goal");
	});

	it("different goal resets state", async () => {
		const { registerWebAgent } = await loadAgent();
		const api = createFakeAPI();
		registerWebAgent(api);
		const tool = api.getTool("web_agent")!;

		await tool.execute("id1", { goal: "first goal" }, undefined);
		expect(__getState().goal).toBe("first goal");

		// Different goal — resets
		await tool.execute("id2", { goal: "second goal" }, undefined);
		const state = __getState();
		expect(state.goal).toBe("second goal");
	});
});

// ---------------------------------------------------------------------------
// Output formatting
// ---------------------------------------------------------------------------
describe("agent output formatting", () => {
	beforeEach(() => {
		__resetState();
	});

	it("inactive state when no goal provided", async () => {
		const { registerWebAgent } = await loadAgent();
		const api = createFakeAPI();
		registerWebAgent(api);
		const tool = api.getTool("web_agent")!;

		const result = await tool.execute("id1", {}, undefined);

		expect(result.content[0].type).toBe("text");
		expect(result.content[0].text).toContain("Research: (inactive)");
		expect(result.details.goal).toBeNull();
	});

	it("empty state when goal provided (no searches yet)", async () => {
		const { registerWebAgent } = await loadAgent();
		const api = createFakeAPI();
		registerWebAgent(api);
		const tool = api.getTool("web_agent")!;

		const result = await tool.execute("id1", { goal: "my research" }, undefined);

		expect(result.content[0].type).toBe("text");
		expect(result.content[0].text).toContain('Research: "my research"');
		expect(result.content[0].text).toContain("Searches (0)");
		expect(result.content[0].text).toContain("Pages Fetched (0)");
		expect(result.content[0].text).toContain("Suggestions");
		expect(result.details.goal).toBe("my research");
	});

	it("empty string goal treated as no goal", async () => {
		const { registerWebAgent } = await loadAgent();
		const api = createFakeAPI();
		registerWebAgent(api);
		const tool = api.getTool("web_agent")!;

		// First set a goal
		await tool.execute("id1", { goal: "real goal" }, undefined);
		expect(__getState().goal).toBe("real goal");

		// Empty string — should NOT reset, just return current state
		const result = await tool.execute("id2", { goal: "" }, undefined);
		expect(result.content[0].text).toContain('Research: "real goal"');
		expect(__getState().goal).toBe("real goal");
	});

	it("details include goal, queries, and fetches arrays", async () => {
		const { registerWebAgent } = await loadAgent();
		const api = createFakeAPI();
		registerWebAgent(api);
		const tool = api.getTool("web_agent")!;

		const result = await tool.execute("id1", { goal: "test" }, undefined);

		expect(result.details).toHaveProperty("goal", "test");
		expect(result.details).toHaveProperty("queries");
		expect(Array.isArray(result.details.queries)).toBe(true);
		expect(result.details).toHaveProperty("fetches");
		expect(Array.isArray(result.details.fetches)).toBe(true);
	});

	it("tool is registered with correct metadata", async () => {
		const { registerWebAgent } = await loadAgent();
		const api = createFakeAPI();
		registerWebAgent(api);

		expect(api.registerTool).toHaveBeenCalledTimes(1);
		const call = api.registerTool.mock.calls[0][0];
		expect(call.name).toBe("web_agent");
		expect(call.label).toBe("Web Research Agent");
		expect(call.description).toBeTruthy();
		expect(call.parameters).toBeTruthy();
		expect(typeof call.execute).toBe("function");
	});
});
