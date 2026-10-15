import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync,mkdirSync,writeFileSync,readFileSync,symlinkSync,existsSync,rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
const area=mkdtempSync(join(process.env.BOSS_KB_TEST_ROOT||tmpdir(),'kb-realpath-'))
const root=join(area,'root'),outside=join(area,'outside'),prefix=join(area,'root-neighbor')
for(const p of [join(root,'资料'),outside,prefix])mkdirSync(p,{recursive:true})
process.env.WORKBENCH_ROOT=root
process.env.WORKBENCH_DB=join(area,'isolated-data/workbench.db')
process.env.DEMO_TODAY='off'
const {kbPath,readKb,writeKb,backupKbFile,kbTree,findClientNote}=await import('./kb.ts')
after(()=>rmSync(area,{recursive:true,force:true}))
const denied=(fn:()=>unknown)=>assert.throws(fn,(error:unknown)=>error instanceof Error&&'status'in error&&error.status===400&&!error.message.includes('OUTSIDE_SENTINEL'))

test('普通文件和规范化后仍在根内的路径照常读取',()=>{
 writeFileSync(join(root,'资料/normal.md'),'# NORMAL')
 assert.equal(readKb('资料/normal.md').body,'# NORMAL')
 assert.equal(readKb('资料/../资料/normal.md').body,'# NORMAL')
})
test('根内合法文件链接可读取、备份和写入',()=>{
 writeFileSync(join(root,'资料/inside.md'),'# INSIDE')
 symlinkSync(join(root,'资料/inside.md'),join(root,'资料/inside-link.md'))
 assert.equal(readKb('资料/inside-link.md').body,'# INSIDE')
 const backup=backupKbFile('资料/inside-link.md','safe-link')
 assert.ok(backup)
 writeKb('资料/inside-link.md','# CHANGED')
 assert.equal(readKb('资料/inside.md').body,'# CHANGED')
 const backupAbs=backup!.startsWith('/')?backup!:join(root,backup!)
 assert.equal(readFileSync(backupAbs,'utf8'),'# INSIDE')
})
test('根内合法目录链接允许读取和新增文件',()=>{
 mkdirSync(join(root,'资料/inside-dir'))
 writeFileSync(join(root,'资料/inside-dir/existing.md'),'# EXISTING')
 symlinkSync(join(root,'资料/inside-dir'),join(root,'资料/dir-link'),'dir')
 assert.equal(readKb('资料/dir-link/existing.md').body,'# EXISTING')
 writeKb('资料/dir-link/new.md','# NEW INSIDE')
 assert.equal(readFileSync(join(root,'资料/inside-dir/new.md'),'utf8'),'# NEW INSIDE')
})
test('根外文件链接：read/backup/write 都拒绝，不返回正文也不改目标',()=>{
 const target=join(outside,'secret.md');writeFileSync(target,'OUTSIDE_SENTINEL')
 symlinkSync(target,join(root,'资料/outside-file.md'))
 denied(()=>readKb('资料/outside-file.md'))
 denied(()=>backupKbFile('资料/outside-file.md','outside-copy'))
 denied(()=>writeKb('资料/outside-file.md','UNAUTHORIZED'))
 assert.equal(readFileSync(target,'utf8'),'OUTSIDE_SENTINEL')
})
test('根外目录链接：已有文件与尚不存在的写入路径均拒绝',()=>{
 writeFileSync(join(outside,'existing.md'),'OUTSIDE_SENTINEL')
 symlinkSync(outside,join(root,'资料/outside-dir'),'dir')
 denied(()=>readKb('资料/outside-dir/existing.md'))
 denied(()=>writeKb('资料/outside-dir/deeper/new.md','UNAUTHORIZED'))
 assert.equal(existsSync(join(outside,'deeper/new.md')),false)
})
test('同名前缀邻居目录不算根目录内',()=>{
 writeFileSync(join(prefix,'neighbor.md'),'OUTSIDE_SENTINEL')
 symlinkSync(join(prefix,'neighbor.md'),join(root,'资料/prefix.md'))
 denied(()=>readKb('资料/prefix.md'))
})
test('不存在的合法路径仍可定位、新建；read 404，backup null',()=>{
 const rel='资料/new/deep/note.md'
 assert.equal(kbPath(rel),join(root,rel))
 assert.throws(()=>readKb(rel),(e:unknown)=>e instanceof Error&&'status'in e&&e.status===404)
 assert.equal(backupKbFile(rel,'missing'),null)
 writeKb(rel,'# CREATED')
 assert.equal(readKb(rel).body,'# CREATED')
})
test('悬空链接不能借不存在路径检查绕出根目录',()=>{
 const target=join(outside,'not-created.md')
 symlinkSync(target,join(root,'资料/dangling.md'))
 denied(()=>kbPath('资料/dangling.md'))
 denied(()=>writeKb('资料/dangling.md','UNAUTHORIZED'))
 assert.equal(existsSync(target),false)
})
test('目录浏览跳过越界或悬空链接，仍保留合法根内文件',()=>{
 const flatten=(xs:ReturnType<typeof kbTree>):string[]=>xs.flatMap(x=>[x.path,...(x.children?flatten(x.children):[])])
 const paths=flatten(kbTree())
 assert.ok(paths.includes('资料/normal.md'))
 assert.ok(paths.includes('资料/inside-link.md'))
 for(const p of ['资料/outside-file.md','资料/prefix.md','资料/dangling.md'])assert.ok(!paths.includes(p),p)
 assert.equal(findClientNote({id:'missing',name:'OUTSIDE_SENTINEL'}).path,null)
})
test('原有目录、扩展名和越界路径限制保持',()=>{
 for(const rel of ['../outside/secret.md','资料/note.txt','.hidden/note.md','工作台/数据/notes.md'])denied(()=>kbPath(rel))
})
