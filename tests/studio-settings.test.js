import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { DEFAULT_SETTINGS, buildObfuscateOptions } from "../web/state.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

test("AST transform defaults are independent and start enabled/disabled as intended", () => {
  expect(DEFAULT_SETTINGS.renameVariables).toBe(true);
  expect(DEFAULT_SETTINGS.encodeStrings).toBe(true);
  expect(DEFAULT_SETTINGS.minifyCode).toBe(false);
});

test("buildObfuscateOptions maps AST toggles to pipeline flags", () => {
  const settings = {
    ...DEFAULT_SETTINGS,
    renameVariables: false,
    encodeStrings: false,
    minifyCode: true,
    luraph: { ...DEFAULT_SETTINGS.luraph },
  };
  expect(buildObfuscateOptions(settings, "4242")).toMatchObject({
    profile: "balanced",
    target: "roblox",
    noRename: true,
    encodeStrings: false,
    oneLine: true,
    seed: 4242,
    polymorphicSeed: 4242,
  });
});

test("omitted AST toggles leave profile defaults untouched", () => {
  const settings = { ...DEFAULT_SETTINGS, luraph: { ...DEFAULT_SETTINGS.luraph } };
  delete settings.renameVariables;
  delete settings.encodeStrings;
  delete settings.minifyCode;
  const options = buildObfuscateOptions(settings, "");
  expect(options).not.toHaveProperty("noRename");
  expect(options).not.toHaveProperty("encodeStrings");
  expect(options).not.toHaveProperty("oneLine");
});

test("all studio pages cache-bust the shared web assets", () => {
  for (const page of ["index.html", "analyzer.html", "obfuscator.html", "docs.html"]) {
    const html = readFileSync(join(ROOT, "public", page), "utf8");
    expect(html).toContain("/assets/studio.css?v=");
    expect(html).toContain("/assets/studio.js?v=");
  }
});
