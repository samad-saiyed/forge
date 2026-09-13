import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ProjectCreationOptions } from "./options.js";
import { getVersion } from "../version.js";

/**
 * Scaffolds project files and directory structure based on ProjectCreationOptions.
 */
export async function scaffoldProject(options: ProjectCreationOptions): Promise<void> {
  const version = getVersion();
  const forgeDepVersion = `^${version}`;

  mkdirSync(options.directory, { recursive: true });

  if (options.language === "typescript") {
    // 1. forge.config.ts
    writeFile(
      join(options.directory, "forge.config.ts"),
      `import { defineConfig } from "@forge/core";

export default defineConfig({
  server: {
    port: 3000,
    host: "127.0.0.1",
  },
});
`,
    );

    // 2. package.json
    const pkgContent = {
      name: options.name,
      version: "0.1.0",
      private: true,
      type: "module",
      scripts: {
        dev: "forge dev",
        build: "forge build",
        start: "forge start",
      },
      dependencies: {
        "@forge/core": forgeDepVersion,
      },
      devDependencies: {
        "@forge/cli": forgeDepVersion,
        typescript: "^5.0.0",
      },
    };
    writeFile(join(options.directory, "package.json"), JSON.stringify(pkgContent, null, 2) + "\n");

    // 3. tsconfig.json
    const tsconfigContent = {
      compilerOptions: {
        target: "ES2022",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        esModuleInterop: true,
        strict: true,
        skipLibCheck: true,
        outDir: "dist",
      },
      include: ["src/**/*", "forge.config.ts"],
    };
    writeFile(
      join(options.directory, "tsconfig.json"),
      JSON.stringify(tsconfigContent, null, 2) + "\n",
    );

    // 4. src/app/route.ts
    writeFile(
      join(options.directory, "src", "app", "route.ts"),
      `import type { ForgeRequest, ForgeResponse } from "@forge/core";

export const GET = async (_req: ForgeRequest, res: ForgeResponse) => {
  return res.json({ message: "Hello from Forge!" });
};
`,
    );
  } else {
    // JavaScript project scaffolding
    // 1. forge.config.js
    writeFile(
      join(options.directory, "forge.config.js"),
      `import { defineConfig } from "@forge/core";

export default defineConfig({
  server: {
    port: 3000,
    host: "127.0.0.1",
  },
});
`,
    );

    // 2. package.json
    const pkgContent = {
      name: options.name,
      version: "0.1.0",
      private: true,
      type: "module",
      scripts: {
        dev: "forge dev",
        start: "forge start",
      },
      dependencies: {
        "@forge/core": forgeDepVersion,
      },
      devDependencies: {
        "@forge/cli": forgeDepVersion,
      },
    };
    writeFile(join(options.directory, "package.json"), JSON.stringify(pkgContent, null, 2) + "\n");

    // 3. src/app/route.js
    writeFile(
      join(options.directory, "src", "app", "route.js"),
      `export const GET = async (_req, res) => {
  return res.json({ message: "Hello from Forge!" });
};
`,
    );
  }

  // Common files
  // .gitignore
  writeFile(
    join(options.directory, ".gitignore"),
    `node_modules/
dist/
.env
*.log
`,
  );
}

function writeFile(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
}
