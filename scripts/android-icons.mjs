import { readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const temp = mkdtempSync(join(tmpdir(), 'na-icons-'))
try {
  const logo = readFileSync(join(root, 'public/brand/na-logo-cutout.png')).toString('base64')
  // Keep the site's original logo; a solid brand background fills launcher masks.
  writeFileSync(join(temp, 'icon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1280" height="1280" viewBox="0 0 1280 1280"><rect width="1280" height="1280" fill="#079dc5"/><image width="1280" height="1280" xlink:href="data:image/png;base64,${logo}"/></svg>`)
  writeFileSync(join(temp, 'foreground.png'), Buffer.from(logo, 'base64'))
  writeFileSync(join(temp, 'manifest.json'), JSON.stringify({
    default: 'icon.svg',
    bg_color: '#079dc5',
    android_fg: 'foreground.png',
    android_fg_scale: 75,
  }))
  const result = spawnSync(process.execPath, [
    join(root, 'node_modules/@tauri-apps/cli/tauri.js'), 'icon',
    join(temp, 'manifest.json'), '--output', join(root, 'src-tauri/icons'),
  ], { cwd: root, stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`Icon generation failed: ${result.status}`)
  // Tauri writes Android resources directly into the initialized Android project.
  const adaptive = join(root, 'src-tauri/gen/android/app/src/main/res/mipmap-anydpi-v26')
  mkdirSync(adaptive, { recursive: true })
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
  <background android:drawable="@color/ic_launcher_background" />
  <foreground android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
`
  for (const name of ['ic_launcher.xml', 'ic_launcher_round.xml']) {
    writeFileSync(join(adaptive, name), xml)
  }
} finally {
  rmSync(temp, { recursive: true, force: true })
}
