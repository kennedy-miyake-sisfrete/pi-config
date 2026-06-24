import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["**/*.test.ts"],
		// No jsdom needed — we test pure logic + fetch mocking
	},
});
