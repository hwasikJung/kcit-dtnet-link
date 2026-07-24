// .output/public(정적 빌드 산출물) + deploy/WEB-INF를 zip으로 묶어 .output/dtent-link.war를 만든다.
// 사용: pnpm war (= nuxt generate 후 이 스크립트 실행)
// 상세 배포 절차: docs/DEPLOY-WAR.md
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

const root = path.resolve(import.meta.dirname, '..')
const publicDir = path.join(root, '.output', 'public')
const webInfDir = path.join(root, 'deploy', 'WEB-INF')
const zipPath = path.join(root, '.output', 'dtent-link.zip')
const warPath = path.join(root, '.output', 'dtent-link.war')

if (!fs.existsSync(path.join(publicDir, 'index.html'))) {
  console.error('오류: .output/public 이 없습니다. 먼저 `pnpm generate`를 실행하세요.')
  process.exit(1)
}

// 스테이징: 정적 파일 + WEB-INF를 한 폴더에 모은다
const stage = path.join(os.tmpdir(), 'dtent-link-war-stage')
fs.rmSync(stage, { recursive: true, force: true })
fs.mkdirSync(stage, { recursive: true })
fs.cpSync(publicDir, stage, { recursive: true })
fs.cpSync(webInfDir, path.join(stage, 'WEB-INF'), { recursive: true })

// tar(bsdtar)는 확장자로 포맷을 정하므로 반드시 .zip으로 만든 뒤 .war로 개명한다 (docs/DEPLOY-WAR.md 참고)
// Windows에서는 System32의 bsdtar를 명시한다 — Git Bash 등에서 GNU tar가 잡히면 zip을 만들지 못한다
fs.rmSync(zipPath, { force: true })
fs.rmSync(warPath, { force: true })
const tarBin =
  process.platform === 'win32'
    ? path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe')
    : 'tar'
const entries = fs.readdirSync(stage)
const tar = spawnSync(tarBin, ['-a', '-c', '-f', zipPath, ...entries], {
  cwd: stage,
  stdio: 'inherit',
})
if (tar.status !== 0) {
  console.error('오류: tar로 zip 생성에 실패했습니다.')
  process.exit(1)
}
fs.renameSync(zipPath, warPath)

// zip 시그니처(PK) 검증 — tar 형식으로 잘못 만들어지면 WAS가 풀지 못한다
const head = Buffer.alloc(2)
const fd = fs.openSync(warPath, 'r')
fs.readSync(fd, head, 0, 2, 0)
fs.closeSync(fd)
if (head.toString('ascii') !== 'PK') {
  console.error('오류: 생성된 파일이 zip 형식이 아닙니다 (선두 바이트가 PK가 아님).')
  process.exit(1)
}

const sizeKb = Math.round(fs.statSync(warPath).size / 1024)
console.log(`완료: ${path.relative(root, warPath)} (${sizeKb}KB, zip 시그니처 확인됨)`)
