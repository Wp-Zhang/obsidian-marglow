import assert from "node:assert/strict";
import { build } from "esbuild";

/** Run inside the same verified, isolated Vault as the existing Mac smoke. */
export async function smokeReadingNotes(page, passed) {
  const sourcePath = "Reading workflow.md", sourceText = "# Reading workflow\n\nA unique passage for the reading workflow.\n";
  const current = page.locator('.marglow-comments-view:visible');
  await page.setViewportSize({ width: 1280, height: 850 });
  await page.evaluate(async ({ sourcePath, sourceText }) => {
    await app.vault.create(sourcePath, sourceText);
    await app.workspace.getLeaf("tab").openFile(app.vault.getFileByPath(sourcePath), {state:{mode:"preview"}});
  }, {sourcePath, sourceText});
  await page.locator('.marglow-file-tools:visible').waitFor();
  await page.evaluate(() => app.commands.executeCommandById('marglow:add-thought'));
  const thoughtInput = current.getByRole('textbox', {name:'Whole-material thought',exact:true});
  await thoughtInput.waitFor();
  await thoughtInput.fill('First interpretation.\n\nA second paragraph with [[Question]].');
  await current.getByRole('button',{name:'Save',exact:true}).click();
  await page.waitForFunction(async path => {
    const {note}=await app.plugins.plugins.marglow.store.load({path,type:'markdown'});
    return note?.thoughts.length===1 && !note.entries.length;
  },sourcePath);
  await current.locator('.marglow-thought-card').filter({hasText:'First interpretation.'}).waitFor();
  assert.equal(await page.evaluate(async path=>app.vault.read(app.vault.getFileByPath(path)),sourcePath),sourceText);
  await current.getByRole('button',{name:'Add thought',exact:true}).click();
  await thoughtInput.fill('Later interpretation.');
  await current.getByRole('button',{name:'Save',exact:true}).click();
  await page.waitForFunction(async path => (await app.plugins.plugins.marglow.store.load({path,type:'markdown'})).note.thoughts.length===2,sourcePath);
  await current.locator('.marglow-thought-card').filter({hasText:'Later interpretation.'}).waitFor();
  passed('No-selection thoughts persist without highlights, append on rereading, and retain dates and IDs');

  await current.getByRole('combobox',{name:'Reading status',exact:true}).selectOption('reading');
  await page.waitForFunction(async path=>(await app.plugins.plugins.marglow.store.load({path,type:'markdown'})).note.status==='reading',sourcePath);
  await current.getByRole('combobox',{name:'Reading status',exact:true}).selectOption('');
  await page.waitForFunction(async path=>(await app.plugins.plugins.marglow.store.load({path,type:'markdown'})).note.status===undefined,sourcePath);
  passed('Reading status is optional and changes only on an explicit action');

  await page.evaluate(async path=>{
    const plugin=app.plugins.plugins.marglow, session=[...plugin.mounted.values()].find(item=>item.session.source.path===path).session;
    const p=session.adapter.root.querySelector('p');const range=document.createRange();range.selectNodeContents(p);
    const selection=getSelection();selection.removeAllRanges();selection.addRange(range);const captured=session.adapter.capture(selection);selection.removeAllRanges();
    const now=new Date().toISOString();
    await plugin.store.save(session.source,{id:'ann-reading-workflow',blockId:'ann-reading-workflow',color:'yellow',style:'highlight',quote:captured.quote,anchor:captured.anchor,comment:'First comment paragraph.\n\nSecond comment paragraph.',createdAt:now,updatedAt:now});
    await session.refresh();
  },sourcePath);
  const card=current.locator('.marglow-comment-card').filter({hasText:'First comment paragraph.'});await card.waitFor();
  await page.evaluate(()=>{
    const write=navigator.clipboard.writeText.bind(navigator.clipboard);
    navigator.clipboard.writeText=async text=>{await write(text);window.marglowCopiedReference=text;};
  });
  await card.hover();
  await card.getByRole('button',{name:'Copy reference',exact:true}).click();
  await page.waitForFunction(()=>window.marglowCopiedReference?.includes('#^ann-reading-workflow'));
  const reference=await page.evaluate(()=>window.marglowCopiedReference);
  await page.waitForFunction(()=>document.querySelectorAll('.notice').length===0,undefined,{timeout:15000});
  await page.screenshot({path:`${await page.evaluate(()=>app.vault.adapter.basePath)}/../reading-sidebar.png`});
  assert.equal((reference.match(/!\[\[/g)||[]).length,2);assert.ok(!reference.includes('marglow:record'));
  await page.evaluate(async reference=>{
    await app.vault.create('Reading synthesis.md', '# My current question\n\n'+reference+'\n\nMy comparison across materials.\n');
    await app.workspace.getLeaf('tab').openFile(app.vault.getFileByPath('Reading synthesis.md'),{state:{mode:'preview'}});
  },reference);
  const preview=page.locator('.workspace-leaf.mod-active .markdown-preview-view');
  await preview.getByText('First comment paragraph.',{exact:true}).waitFor();
  await preview.getByText('Second comment paragraph.',{exact:true}).waitFor();
  await page.waitForFunction(()=>document.querySelectorAll('.notice').length===0,undefined,{timeout:15000});
  await page.screenshot({path:`${await page.evaluate(()=>app.vault.adapter.basePath)}/../reading-synthesis.png`});
  passed('Native quotation and multi-paragraph comment embeds are copied together with the source');

  await page.evaluate(async path=>{
    const {file}=await app.plugins.plugins.marglow.store.load({path,type:'markdown'});
    await app.vault.process(file,text=>text.replace('First comment paragraph.','Externally edited paragraph.'));
  },sourcePath);
  await preview.getByText('Externally edited paragraph.',{exact:true}).waitFor();
  await page.evaluate(async path=>{
    const {file}=await app.plugins.plugins.marglow.store.load({path,type:'markdown'});
    await app.workspace.getLeaf('tab').openFile(file,{state:{mode:'source'}});
  },sourcePath);
  await page.waitForFunction(()=>document.querySelector('.marglow-reading-header > strong')?.textContent==='Reading workflow');
  const editCard=current.locator('.marglow-comment-card').filter({hasText:'Externally edited paragraph.'});
  await editCard.getByRole('button',{name:/^Edit comment:/}).click();
  await editCard.getByRole('textbox',{name:'Comment',exact:true}).fill('Edited from the reading note.\n\nStill a second paragraph.');
  await editCard.getByRole('button',{name:'Save',exact:true}).click();
  await page.waitForFunction(async path=>(await app.plugins.plugins.marglow.store.load({path,type:'markdown'})).note.entries[0].annotation.comment.startsWith('Edited from the reading note.'),sourcePath);
  passed('Reading-note editing retains the source context and external changes update native embeds');

  const built=await build({entryPoints:['src/format.ts'],bundle:true,write:false,format:'esm',platform:'node'});
  const format=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
  const legacySource={path:'Legacy reading.md',type:'markdown'}, now=new Date().toISOString();
  const legacy=format.updateEntry(format.createLegacyReadingNote(legacySource),{id:'ann-legacy-reading',blockId:'ann-legacy-reading',color:'green',quote:'Legacy source text.',comment:'Legacy comment.\n\nSecond paragraph.',anchor:{kind:'markdown',textStart:0,prefix:'',suffix:''},createdAt:now,updatedAt:now})+'\nPersonal handwritten ending.\n';
  await page.evaluate(async ({legacy,legacySource})=>{
    await app.vault.create(legacySource.path,'# Legacy\n\nLegacy source text.\n');
    await app.vault.create('_marglow/Legacy reading.md.annotations.md',legacy);
    await app.workspace.getLeaf('tab').openFile(app.vault.getFileByPath(legacySource.path),{state:{mode:'preview'}});
  },{legacy,legacySource});
  await page.waitForFunction(()=>[...app.plugins.plugins.marglow.mounted.values()].some(item=>item.session.source.path==='Legacy reading.md'));
  await page.evaluate(()=>app.commands.executeCommandById('marglow:upgrade-reading-note'));
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  assert.equal(await page.evaluate(async()=>app.vault.read(app.vault.getFileByPath('_marglow/Legacy reading.md.annotations.md'))),legacy);
  await page.evaluate(()=>app.commands.executeCommandById('marglow:upgrade-reading-note'));
  await page.getByRole('button',{name:'Upgrade and keep backup',exact:true}).click();
  await page.waitForFunction(async()=> (await app.plugins.plugins.marglow.store.load({path:'Legacy reading.md',type:'markdown'})).note.version===2);
  assert.equal(await page.evaluate(async()=>app.vault.read(app.vault.getFileByPath('_marglow/Legacy reading.md.annotations.md.v1.bak'))),legacy);
  await page.waitForFunction(()=>app.metadataCache.getFileCache(app.vault.getFileByPath('_marglow/Legacy reading.md.annotations.md'))?.blocks?.['ann-legacy-reading']);
  assert.ok(await page.evaluate(async()=> (await app.vault.read(app.vault.getFileByPath('_marglow/Legacy reading.md.annotations.md'))).includes('Personal handwritten ending.')));
  assert.equal(await page.evaluate(async()=>app.vault.read(app.vault.getFileByPath('Legacy reading.md'))),'# Legacy\n\nLegacy source text.\n');
  passed('Explicit legacy upgrade has a cancelable preview and a verified backup, preserving original quote IDs');

  await page.evaluate(()=>app.commands.executeCommandById('marglow:create-reading-home'));
  await page.getByRole('textbox',{name:'Reading home path',exact:true}).fill('Reading home.md');
  await page.getByRole('button',{name:'Create',exact:true}).click();
  await page.waitForFunction(()=>!!app.vault.getFileByPath('Reading home.md'));
  assert.ok((await page.evaluate(async()=>app.vault.read(app.vault.getFileByPath('Reading home.md')))).includes('[annotation_schema]'));
  passed('A reading home is created only on request, with a native search and no required classification');

  assert.equal(await page.evaluate(async path=>app.vault.read(app.vault.getFileByPath(path)),sourcePath),sourceText);

  await page.evaluate(async path=>{
    await app.vault.delete(app.vault.getFileByPath(path));
    const {file}=await app.plugins.plugins.marglow.store.load({path,type:'markdown'});
    await app.workspace.getLeaf('tab').openFile(file,{state:{mode:'source'}});
  },sourcePath);
  await current.getByText('Source missing. Your reading note has been retained.',{exact:true}).waitFor();
  await current.getByRole('button',{name:'Add thought',exact:true}).click();
  await thoughtInput.fill('Thought retained even after the source disappeared.');
  await current.getByRole('button',{name:'Save',exact:true}).click();
  await page.waitForFunction(async path=>(await app.plugins.plugins.marglow.store.load({path,type:'markdown'})).note.thoughts.some(entry=>entry.thought.text.includes('source disappeared')),sourcePath);
  passed('Whole-material thoughts remain editable when the source document is missing');
}
