import { defineConfig } from "vite";
export default defineConfig({
  base: "./",
  build: {
    target: "es2022",
    rolldownOptions: { input: { game: "index.html", author: "author.html" } },
  },
});
