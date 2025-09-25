import { readFile, access } from "node:fs/promises";
import { dirname, resolve as resolvePath } from "node:path";
import { pathToFileURL } from "node:url";

const nodeDir = dirname(process.execPath);
const typescriptPath = resolvePath(nodeDir, "..", "lib", "node_modules", "typescript", "lib", "typescript.js");
const ts = await import(pathToFileURL(typescriptPath).href);
const shimBase = new URL("./", import.meta.url);
const shimMap = new Map([
  ["@nestjs/common", new URL("@nestjs/common/index.js", shimBase).href],
  ["@nestjs/mongoose", new URL("@nestjs/mongoose/index.js", shimBase).href],
  ["@nestjs/graphql", new URL("@nestjs/graphql/index.js", shimBase).href],
  ["@nestjs/mercurius", new URL("@nestjs/mercurius/index.js", shimBase).href],
  ["@nestjs/platform-fastify", new URL("@nestjs/platform-fastify/index.js", shimBase).href],
  ["@fastify/cors", new URL("@fastify/cors/index.js", shimBase).href],
  ["mongoose", new URL("mongoose/index.js", shimBase).href],
  ["@trendpot/types", new URL("@trendpot/types/index.js", shimBase).href],
  ["@trendpot/utils", new URL("@trendpot/utils/index.js", shimBase).href],
  ["pino", new URL("pino/index.js", shimBase).href],
  ["react", new URL("react/index.js", shimBase).href],
  ["react/jsx-runtime", new URL("react/jsx-runtime/index.js", shimBase).href],
  ["react-dom/server", new URL("react-dom/server/index.js", shimBase).href],
  ["@tanstack/react-query", new URL("@tanstack/react-query/index.js", shimBase).href],
  ["@trendpot/ui", new URL("@trendpot/ui/index.js", shimBase).href]
]);

/**
 * Minimal loader that transpiles TypeScript on the fly so we can run the Node
 * test runner without pulling additional tooling.
 */
export async function resolve(specifier, context, defaultResolve) {
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    const parentUrl = context.parentURL ?? "file://";
    const resolved = new URL(specifier, parentUrl);
    if (!resolved.pathname.endsWith(".ts") && !resolved.pathname.endsWith(".tsx") && !resolved.pathname.endsWith(".js")) {
      const tsxUrl = new URL(`${specifier}.tsx`, parentUrl);
      try {
        await access(tsxUrl);
        return { url: tsxUrl.href, shortCircuit: true };
      } catch {
        const tsUrl = new URL(`${specifier}.ts`, parentUrl);
        return { url: tsUrl.href, shortCircuit: true };
      }
    }
  }

  if (shimMap.has(specifier)) {
    return { url: shimMap.get(specifier), shortCircuit: true };
  }

  return defaultResolve(specifier, context, defaultResolve);
}

export async function load(url, context, defaultLoad) {
  if (url.endsWith(".ts") || url.endsWith(".tsx")) {
    const source = await readFile(new URL(url), "utf8");
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ES2020,
        target: ts.ScriptTarget.ES2020,
        esModuleInterop: true,
        experimentalDecorators: true,
        jsx: ts.JsxEmit.ReactJSX
      },
      fileName: url
    });

    return {
      format: "module",
      source: outputText,
      shortCircuit: true
    };
  }

  return defaultLoad(url, context, defaultLoad);
}
