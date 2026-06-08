import { defineConfig } from "vite"
import react, { reactCompilerPreset } from "@vitejs/plugin-react"
import babel from "@rolldown/plugin-babel"

const babelInclude = [/[/\\]src[/\\].*\.[cm]?[jt]sx?$/]
const babelExclude = [/[/\\]node_modules[/\\]/]

export default defineConfig({
  plugins: [
    react({
      include: babelInclude,
      exclude: babelExclude,
    }),
    babel({
      include: babelInclude,
      exclude: babelExclude,
      presets: [reactCompilerPreset({ target: "19" })],
    }),
  ],
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/compiler-runtime",
      "pixi.js",
      "@pixi/react",
      "image-js",
    ],
  },
})
