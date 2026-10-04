import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Agent worktrees live under .claude/; don't run their copies of the tests.
    exclude: [...configDefaults.exclude, ".claude/**"],
  },
});
