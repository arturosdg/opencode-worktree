#!/usr/bin/env bun

import { $ } from "bun";

try {
  await $`npm publish --access public`;
} catch (error) {
  console.error("Publish failed.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
