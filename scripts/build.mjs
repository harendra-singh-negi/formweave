// Builds dist/ from nothing: types and JavaScript from src/, then the stylesheets. Works the same on Windows.
import { cpSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

rmSync('dist', { recursive: true, force: true }) // a file removed from src/ must not linger in the package
execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.build.json'], { stdio: 'inherit' })
cpSync('src/styles/form.css', 'dist/style.css')
cpSync('src/styles/builder.css', 'dist/builder.css')
