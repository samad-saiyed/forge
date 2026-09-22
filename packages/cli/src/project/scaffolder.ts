import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ProjectCreationOptions } from "./options.js";
import { getVersion } from "../version.js";

/**
 * Scaffolds project files and directory structure based on ProjectCreationOptions.
 */
export async function scaffoldProject(options: ProjectCreationOptions): Promise<void> {
  const version = getVersion();
  const kyuuDepVersion = `^${version}`;

  mkdirSync(options.directory, { recursive: true });

  if (options.language === "typescript") {
    // 1. kyuu.config.ts
    writeFile(
      join(options.directory, "kyuu.config.ts"),
      `import { defineConfig } from "@kyuujs/core";

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
        dev: "kyuu dev",
        build: "kyuu build",
        start: "kyuu start",
      },
      dependencies: {
        "@kyuujs/core": kyuuDepVersion,
      },
      devDependencies: {
        "@kyuujs/cli": kyuuDepVersion,
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
      include: ["src/**/*", "kyuu.config.ts"],
    };
    writeFile(
      join(options.directory, "tsconfig.json"),
      JSON.stringify(tsconfigContent, null, 2) + "\n",
    );

    // 4. src/app/route.ts
    writeFile(
      join(options.directory, "src", "app", "route.ts"),
      `import type { Request, Response } from "@kyuujs/core";

export const GET = async (_req: Request, res: Response) => {
  return res.json({ message: "Hello from Kyuu!" });
};
`,
    );
  } else {
    // JavaScript project scaffolding
    // 1. kyuu.config.js
    writeFile(
      join(options.directory, "kyuu.config.js"),
      `import { defineConfig } from "@kyuujs/core";

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
        dev: "kyuu dev",
        start: "kyuu start",
      },
      dependencies: {
        "@kyuujs/core": kyuuDepVersion,
      },
      devDependencies: {
        "@kyuujs/cli": kyuuDepVersion,
      },
    };
    writeFile(join(options.directory, "package.json"), JSON.stringify(pkgContent, null, 2) + "\n");

    // 3. src/app/route.js
    writeFile(
      join(options.directory, "src", "app", "route.js"),
      `export const GET = async (_req, res) => {
  return res.json({ message: "Hello from Kyuu!" });
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
.kyuu/
.env
*.log
`,
  );
}

function writeFile(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
}
