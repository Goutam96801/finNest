/**
 * Fail if package.json deps are missing from package-lock.json packages[].
 * Catches the Windows npm install / EAS `npm ci` drift (optional peers, etc.).
 */
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'))
const packages = lock.packages || {}

const sections = ['dependencies', 'devDependencies', 'optionalDependencies']
const missing = []

for (const section of sections) {
  for (const name of Object.keys(pkg[section] || {})) {
    if (!packages[`node_modules/${name}`]) {
      missing.push(`${section}: ${name}`)
    }
  }
}

if (missing.length) {
  console.error('package-lock.json is missing entries for:')
  for (const item of missing) console.error(`  - ${item}`)
  console.error('\nRun: npm install <pkg> --save-exact (or restore optionalDependencies entries)')
  console.error('Then verify with: npx npm@10.8.2 ci --include=dev')
  process.exit(1)
}

console.log('lockfile: all package.json deps have package-lock entries')
