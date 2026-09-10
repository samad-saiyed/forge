import tseslint from "typescript-eslint";

export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/coverage/**",
      "/.agent/**",
      "**/.agents/**",
      "**/docs/**",
    ],
  },

  ...tseslint.configs.recommended,
];
