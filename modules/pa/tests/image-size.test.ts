// 图片的宽高：读文件开头认 PNG、GIF、WebP、JPEG、SVG；认不出给 null（瀑布流先按宽高留位置，图片加载时不跳）
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { imageSize } from '../files/server/modules/pa/image-size.ts'

test('PNG、SVG 认得出宽高；SVG 没写宽高用 viewBox；别的给 null', () => {
  const d = mkdtempSync(join(tmpdir(), 'pa-img-'))
  const png = Buffer.alloc(33); png.writeUInt32BE(0x89504e47, 0); png.writeUInt32BE(3, 16); png.writeUInt32BE(2, 20)
  writeFileSync(join(d, 'a.png'), png)
  writeFileSync(join(d, 'a.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="400px" height="300"><g/></svg>')
  writeFileSync(join(d, 'b.svg'), '<?xml version="1.0"?>\n<svg viewBox="0 0 1600 900" xmlns="http://www.w3.org/2000/svg"></svg>')
  writeFileSync(join(d, 'c.txt'), 'hello')
  assert.deepEqual(imageSize(join(d, 'a.png')), { width: 3, height: 2 })
  assert.deepEqual(imageSize(join(d, 'a.svg')), { width: 400, height: 300 })
  assert.deepEqual(imageSize(join(d, 'b.svg')), { width: 1600, height: 900 })
  assert.equal(imageSize(join(d, 'c.txt')), null)
  assert.equal(imageSize(join(d, '没有.png')), null)
})
