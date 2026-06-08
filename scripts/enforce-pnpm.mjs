import { execSync } from "node:child_process"

try {
  execSync("pnpm -v", { stdio: "ignore" })
} catch {
  console.error("This project uses pnpm. Install it: https://pnpm.io/installation")
  process.exit(1)
}
