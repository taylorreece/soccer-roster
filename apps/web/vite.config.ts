import { reactRouter } from "@react-router/dev/vite"
import tailwindcss from "@tailwindcss/vite"
import { execSync } from "node:child_process"
import { defineConfig } from "vite"

/**
 * Stamp the build with the commit it came from, so a deployed page can say
 * which version you are looking at. CI hands us the commit in an env var
 * (Netlify uses COMMIT_REF); locally we ask git directly.
 */
function buildInfo() {
  const sha = process.env.COMMIT_REF ?? process.env.GITHUB_SHA ?? git("rev-parse HEAD")
  const remote = process.env.REPOSITORY_URL ?? git("remote get-url origin")
  const repo = remote.replace(/^git@([^:]+):/, "https://$1/").replace(/\.git$/, "")
  return {
    ref: sha ? sha.slice(0, 7) : "unknown",
    url: sha && repo.startsWith("http") ? `${repo}/commit/${sha}` : null,
  }
}

function git(args: string) {
  try {
    return execSync(`git ${args}`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim()
  } catch {
    // No git available (a bare source tarball, say) — the build is still fine.
    return ""
  }
}

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [tailwindcss(), reactRouter()],
  define: { __BUILD__: JSON.stringify(buildInfo()) },
})
