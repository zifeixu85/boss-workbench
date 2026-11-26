// 对话附件（attachments.ts）：粘贴、拖进来、选的图片和文件存在数据库旁边的 对话附件/；这一句只认存过的编号，
// 不认网页传来的路径；图片作为图片输入、别的文件写上位置；不收的类型、空文件、太大的说清楚。运行：npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import os from 'node:os'

const dir = mkdtempSync(join(os.tmpdir(), 'wb-attach-'))
process.env.WORKBENCH_ROOT = dir
process.env.WORKBENCH_DB = join(dir, '数据', 'wb.db')
const { saveAttachment, resolveAttachments, attachmentPath, ATTACH_DIR } = await import('./attachments.ts')

test('存图片和 PDF：放进 对话附件/，按编号找回；图片进图片输入，所有附件在文字里列出位置', () => {
  const img = saveAttachment({ name: '截图-101530.png', data: `data:image/png;base64,${Buffer.from('png-bytes').toString('base64')}` })
  const pdf = saveAttachment({ name: '报价单.pdf', data: Buffer.from('%PDF-1.4').toString('base64') })
  assert.equal(img.kind, 'image'); assert.equal(pdf.kind, 'file')
  assert.equal(dirname(attachmentPath(img.id)!), ATTACH_DIR())
  assert.equal(readFileSync(attachmentPath(img.id)!, 'utf8'), 'png-bytes')
  const r = resolveAttachments([{ id: img.id, name: img.name }, { id: pdf.id, name: pdf.name }, { id: '../../etc/passwd' }, { id: 'af_00000000' }])
  assert.deepEqual(r.items.map((a) => a.name), ['截图-101530.png', '报价单.pdf'], '乱写的编号、没存过的都不认')
  assert.deepEqual(r.images, [attachmentPath(img.id)])
  assert.match(r.note, /报价单\.pdf：.*（需要的话自己打开读）/)
  assert.equal(resolveAttachments('不是列表').items.length, 0)
})

test('不收：别的类型、空文件、超过 15MB；名字里的斜杠换掉', () => {
  assert.throws(() => saveAttachment({ name: 'run.sh', data: 'eA==' }), /放不进来/)
  assert.throws(() => saveAttachment({ name: 'a.png', data: '' }), /空的/)
  assert.throws(() => saveAttachment({ name: 'a.png', data: Buffer.alloc(15 * 1024 * 1024 + 1).toString('base64') }), /太大/)
  const a = saveAttachment({ name: '../上级/图.png', data: 'eA==' })
  assert.equal(a.name, '.._上级_图.png')
  assert.ok(existsSync(attachmentPath(a.id)!))
})
