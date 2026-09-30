import obsidianmd from "eslint-plugin-obsidianmd";

export default [
  { ignores: ["dev/**", "dist/**", "main.js", "tests/**", "scripts/**", "*.mjs"] },
  ...obsidianmd.configs.recommended,
  { files: ["src/**/*.ts"], languageOptions: { parserOptions: { projectService: true } } },
];
