import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const rootPkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const desktopPkgPath = join(root, "desktop", "package.json");
const desktopPkg = JSON.parse(readFileSync(desktopPkgPath, "utf8"));

// Keep the packaged Electron metadata in lockstep with the release version.
if (desktopPkg.version !== rootPkg.version) {
  desktopPkg.version = rootPkg.version;
  writeFileSync(desktopPkgPath, JSON.stringify(desktopPkg, null, 2) + "\n");
  console.log(`>> desktop version -> ${rootPkg.version}`);
}

// The server and launcher read APP_ROOT/package.json for the installed version.
// Stage it under a different source name so electron-builder does not exclude
// the app's own package.json from app.asar as a duplicate extra resource.
const runtimePkg = {
  name: rootPkg.name,
  version: rootPkg.version,
  description: rootPkg.description,
  author: rootPkg.author,
  license: rootPkg.license,
};
mkdirSync(join(root, ".desktop-build"), { recursive: true });
writeFileSync(
  join(root, ".desktop-build", "package.json"),
  JSON.stringify(runtimePkg, null, 2) + "\n",
);
