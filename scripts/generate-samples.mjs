import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { Image, encodePng } from "image-js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(__dirname, "..", "public", "images")

const samples = [
  { name: "sample-1.png", width: 512, height: 384, fill: (x, y) => [x % 256, y % 256, 128, 255] },
  { name: "sample-2.png", width: 768, height: 512, fill: (x, y) => [y % 256, x % 256, 64, 255] },
  { name: "sample-3.png", width: 1024, height: 768, fill: (x, y) => [(x + y) % 256, 96, 192, 255] },
]

await mkdir(outDir, { recursive: true })

for (const sample of samples) {
  const image = new Image(sample.width, sample.height, { kind: "RGBA" })
  for (let y = 0; y < sample.height; y += 1) {
    for (let x = 0; x < sample.width; x += 1) {
      const i = (y * sample.width + x) * 4
      const [r, g, b, a] = sample.fill(x, y)
      image.data[i] = r
      image.data[i + 1] = g
      image.data[i + 2] = b
      image.data[i + 3] = a
    }
  }
  const png = encodePng(image)
  await writeFile(path.join(outDir, sample.name), png)
  console.log(`Wrote ${sample.name} (${sample.width}x${sample.height})`)
}
