import adapter from "@sveltejs/adapter-node";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({ out: 'build' }),
    alias: {
      $components: "src/lib/components",
      $stores: "src/lib/stores",
      $styles: "src/lib/styles",
      $server: "src/lib/server",
    },
    prerender: {
      handleHttpError: "warn",
    },
  },
  compilerOptions: {
    runes: true,
  },
};

export default config;
