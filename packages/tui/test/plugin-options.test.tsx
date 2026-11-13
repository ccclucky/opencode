import { expect, test } from "bun:test"
import { mkdir, symlink } from "fs/promises"
import path from "node:path"
import { createAppFixture } from "./fixture/app"
import { directory as fixtureDirectory, json, worktree } from "./fixture/tui-client"
import { tmpdir } from "./fixture/fixture"

// Regression for #63806: a plugin declared outside the CLI config (project config) reaches the TUI
// only through the server inventory, so its options must ride the inventory; without them setup
// always saw `{}`.
const pluginSource = `import { Plugin } from "@opencode/plugin/tui"

export default Plugin.define({
  id: "fixture.options-probe",
  async setup(context) {
    context.ui.toast.show({
      title: "options-probe",
      message: "TUI options = " + JSON.stringify(context.options),
      duration: 99999,
    })
  },
})
`

async function copyProbePlugin() {
  const root = await tmpdir()
  const directory = path.join(root.path, "options-probe")
  await mkdir(directory)
  await symlink(path.join(import.meta.dir, "../../node_modules"), path.join(directory, "node_modules"))
  await Bun.write(path.join(directory, "tui.tsx"), pluginSource)
  return { directory, [Symbol.asyncDispose]: root[Symbol.asyncDispose] }
}

test("TUI setup receives the options the server inventory carries for the plugin", async () => {
  await using plugin = await copyProbePlugin()
  const inventory = [
    {
      id: "fixture.options-probe",
      source: { type: "local", path: plugin.directory },
      features: { server: true, tui: true },
      state: { status: "active" },
      options: { myOption: ["some", "value"] },
    },
  ]
  await using setup = await createAppFixture({
    config: { animations: false },
    fetch: (url) => {
      if (url.pathname === "/api/plugin")
        return json({
          location: { directory: fixtureDirectory, project: { id: "proj_test", directory: worktree, canonical: worktree } },
          data: inventory,
        })
      return undefined
    },
  })
  await setup.ready
  await setup.waitForFrame((frame) => frame.includes("TUI options"))
  expect(setup.captureCharFrame()).toContain(`TUI options = {"myOption":["some","value"]}`)
})
