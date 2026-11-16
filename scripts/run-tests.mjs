// Bundles each test file with esbuild (so tests can import the app's TypeScript libs and the
// "@/..." alias) and runs it with Node's built-in test runner. Usage: node scripts/run-tests.mjs unit|integration
import { readdirSync, mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const kind = process.argv[2] || "unit";
const root = resolve(new URL("..", import.meta.url).pathname);
const dir = join(root, "tests", kind);
const out = join(root, ".test-build", kind);
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

let esbuild;
try { esbuild = createRequire(import.meta.url)("esbuild"); }
catch { esbuild = createRequire("/opt/npm-tools/node_modules/")("esbuild"); }

// Integration tests use the real `pg` when it is installed (CI); otherwise a tiny local stand-in.
let hasPg = true;
try { createRequire(join(root, "package.json")).resolve("pg"); } catch { hasPg = false; }

const files = readdirSync(dir).filter((f) => /\.test\.(m?js|ts)$/.test(f));
for (const f of files) {
  esbuild.buildSync({
    entryPoints: [join(dir, f)], bundle: true, platform: "node", format: "esm", target: "node20",
    outfile: join(out, f.replace(/\.ts$/, ".mjs").replace(/\.js$/, ".mjs")),
    alias: kind === "unit"
      ? { "@": root, pg: join(root, "tests/stubs/pg.js"), "next/headers": join(root, "tests/stubs/next-headers.js") }
      : { "@": root, "next/headers": join(root, "tests/stubs/next-headers.js"), ...(hasPg ? {} : { pg: join(root, "tests/stubs/pg-wire.js") }) },
    external: kind === "unit" ? ["next", "react", "react-dom"] : [...(hasPg ? ["pg"] : []), "next", "react", "react-dom"],
    logLevel: "error",
    banner: { js: "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);" },
  });
}
const built = readdirSync(out).map((f) => join(out, f));
const r = spawnSync(process.execPath, ["--test", "--test-reporter=spec", ...built], { stdio: "inherit", cwd: root, env: process.env });
process.exit(r.status ?? 1);
