import assert from "node:assert/strict";

/** Real host interactions in the identity-checked synthetic test Vault. */
export async function smokeAnnotationUX(page, passed, output) {
  const path='Interaction.md', source='# Annotation interactions\n\nAn already highlighted passage can be selected again for a smaller annotation.\n';
  await page.setViewportSize({width:1280,height:850});
  await page.evaluate(async ({path,source})=>{
    app.workspace.rightSplit.collapse();
    await app.vault.create(path,source); await app.workspace.getLeaf('tab').openFile(app.vault.getFileByPath(path),{state:{mode:'preview'}});
  },{path,source});
  await page.locator('.workspace-leaf.mod-active .marglow-file-tools').waitFor();
  await page.evaluate(async path=>{
    const plugin=app.plugins.plugins.marglow,session=[...plugin.mounted.values()].find(m=>m.session.source.path===path).session;
    const p=session.adapter.root.querySelector('p'),range=document.createRange();range.selectNodeContents(p);
    const sel=getSelection();sel.removeAllRanges();sel.addRange(range);const captured=session.adapter.capture(sel);sel.removeAllRanges();
    const now=new Date().toISOString();await plugin.store.save(session.source,{id:'ann-ux-original',blockId:'ann-ux-original',quote:captured.quote,anchor:captured.anchor,color:'yellow',style:'highlight',comment:'A concise comment.\n\nAnother paragraph for context.',createdAt:now,updatedAt:now});await session.refresh();
  },path);
  const root=page.locator('.workspace-leaf.mod-active .markdown-preview-view'), tools=page.locator('.marglow-file-tools:visible');
  const passage=root.locator('p').first();
  await root.locator('.marglow-comment-indicator').waitFor();
  await page.waitForFunction(()=>document.querySelectorAll('.notice').length===0,undefined,{timeout:15000});
  await passage.hover();
  const preview=page.getByRole('note',{name:'Comment preview',exact:true});await preview.waitFor();
  assert.ok((await preview.textContent()).includes('Another paragraph for context.'));
  assert.equal(await page.locator('body > .marglow-composer').count(),0);
  await preview.hover(); assert.equal(await preview.isVisible(),true);
  await page.screenshot({path:`${output}/comment-hover.png`});
  passed('Comment icons and safe, multi-paragraph hover previews appear without a click or editor');

  await passage.evaluate(p=>{
    const range=document.createRange();range.setStart(p.firstChild,11);range.setEnd(p.firstChild,30);
    getSelection().removeAllRanges();getSelection().addRange(range);
  });
  await page.waitForFunction(()=>document.querySelector('.workspace-leaf.mod-active .marglow-source')?.classList.contains('marglow-selecting'));
  assert.equal(await root.locator('.marglow-overlay').evaluate(el=>getComputedStyle(el).visibility),'hidden');
  assert.equal(await preview.count(),0);
  const selected=await page.evaluate(()=>getSelection().toString());
  await tools.getByRole('button',{name:'Choose green',exact:true}).click();
  await page.waitForFunction(async path=>(await app.plugins.plugins.marglow.store.load({path,type:'markdown'})).note.entries.length===2,path);
  assert.equal(await root.locator('.marglow-overlay').evaluate(el=>getComputedStyle(el).visibility),'visible');
  assert.ok(await page.evaluate(async ({path,selected})=>(await app.plugins.plugins.marglow.store.load({path,type:'markdown'})).note.entries.some(e=>e.annotation.id!=='ann-ux-original'&&e.annotation.quote===selected),{path,selected}));
  passed('Native text selection hides annotation paint and permits an additional partial highlight');

  const clickOriginal=async()=>{const box=await passage.boundingBox();await passage.click({position:{x:4,y:box.height/2}});};
  await clickOriginal();
  const composer=page.locator('body > .marglow-composer');await composer.waitFor();
  const noteBefore=await page.evaluate(async path=>{const {file}=await app.plugins.plugins.marglow.store.load({path,type:'markdown'});return app.vault.read(file);},path);
  await composer.getByRole('textbox',{name:'Comment',exact:true}).fill('Keep this draft while moving.');
  const handle=composer.getByRole('button',{name:'Move comment window',exact:true}), before=await composer.boundingBox(), grip=await handle.boundingBox();
  await page.mouse.move(grip.x+30,grip.y+grip.height/2);await page.mouse.down();await page.mouse.move(grip.x+180,grip.y+grip.height/2+130,{steps:8});await page.mouse.up();
  const moved=await composer.boundingBox();assert.ok(moved.x>before.x+100 && moved.y>before.y+90,JSON.stringify({before,moved}));
  assert.equal(await composer.getByRole('textbox',{name:'Comment',exact:true}).inputValue(),'Keep this draft while moving.');
  assert.equal(await page.evaluate(async path=>{const {file}=await app.plugins.plugins.marglow.store.load({path,type:'markdown'});return app.vault.read(file);},path),noteBefore);
  await page.setViewportSize({width:980,height:650});
  await page.waitForFunction(()=>{const r=document.querySelector('body > .marglow-composer')?.getBoundingClientRect();return r && r.left>=11 && r.top>=11 && r.right<=innerWidth-11 && r.bottom<=innerHeight-11;});
  await page.screenshot({path:`${output}/draggable-comment.png`});
  const appearancePosition=await composer.boundingBox();
  await composer.getByRole('button',{name:'Highlight blue',exact:true}).click();
  await page.waitForFunction(async path=>(await app.plugins.plugins.marglow.store.load({path,type:'markdown'})).note.entries.find(e=>e.annotation.id==='ann-ux-original').annotation.color==='blue',path);
  await composer.getByRole('button',{name:'Underline',exact:true}).click();
  await page.waitForFunction(async path=>(await app.plugins.plugins.marglow.store.load({path,type:'markdown'})).note.entries.find(e=>e.annotation.id==='ann-ux-original').annotation.style==='underline',path);
  await composer.getByRole('button',{name:'Highlight pink',exact:true}).click();
  await page.waitForFunction(async path=>(await app.plugins.plugins.marglow.store.load({path,type:'markdown'})).note.entries.find(e=>e.annotation.id==='ann-ux-original').annotation.color==='pink',path);
  assert.equal(await composer.getByRole('textbox',{name:'Comment',exact:true}).inputValue(),'Keep this draft while moving.');
  const retainedPosition=await composer.boundingBox();assert.ok(Math.abs(retainedPosition.x-appearancePosition.x)<1 && Math.abs(retainedPosition.y-appearancePosition.y)<1);
  const kept=await page.evaluate(async path=>(await app.plugins.plugins.marglow.store.load({path,type:'markdown'})).note.entries.find(e=>e.annotation.id==='ann-ux-original').annotation,path);
  assert.equal(kept.style,'underline');assert.equal(kept.comment,'A concise comment.\n\nAnother paragraph for context.');
  await composer.getByRole('button',{name:'Highlight',exact:true}).click();
  await page.waitForFunction(async path=>(await app.plugins.plugins.marglow.store.load({path,type:'markdown'})).note.entries.find(e=>e.annotation.id==='ann-ux-original').annotation.style==='highlight',path);
  passed('Floating appearance changes remain open at the dragged position and preserve the unsaved comment draft across repeated writes');
  await composer.getByRole('button',{name:'Cancel',exact:true}).click();
  passed('Floating comments drag without losing or saving input and remain reachable after viewport resize');

  await clickOriginal();await composer.waitFor();
  await tools.getByRole('button',{name:'Choose pink',exact:true}).click();
  await page.waitForFunction(async path=>(await app.plugins.plugins.marglow.store.load({path,type:'markdown'})).note.entries.find(e=>e.annotation.id==='ann-ux-original').annotation.color==='pink',path);
  const original=await page.evaluate(async path=>(await app.plugins.plugins.marglow.store.load({path,type:'markdown'})).note.entries.find(e=>e.annotation.id==='ann-ux-original').annotation,path);
  await tools.getByRole('button',{name:'Underline',exact:true}).click();
  await page.waitForFunction(async path=>(await app.plugins.plugins.marglow.store.load({path,type:'markdown'})).note.entries.find(e=>e.annotation.id==='ann-ux-original').annotation.style==='underline',path);
  await tools.getByRole('button',{name:'Highlight',exact:true}).click();
  await page.waitForFunction(async path=>(await app.plugins.plugins.marglow.store.load({path,type:'markdown'})).note.entries.find(e=>e.annotation.id==='ann-ux-original').annotation.style==='highlight',path);
  const after=await page.evaluate(async path=>(await app.plugins.plugins.marglow.store.load({path,type:'markdown'})).note.entries.find(e=>e.annotation.id==='ann-ux-original').annotation,path);
  assert.equal(after.blockId,original.blockId);assert.equal(after.commentBlockId,original.commentBlockId);assert.equal(after.comment,original.comment);
  passed('The page toolbar recolors and switches a selected annotation style with the sidebar closed, preserving IDs and comments');

  await tools.getByRole('button',{name:/^Reading notes/}).click();
  const sidebar=page.locator('.marglow-comments-view:visible'), emptyCard=sidebar.locator('.marglow-comment-card').filter({has:page.locator('.marglow-add-comment')});
  assert.ok(!(await sidebar.textContent()).includes('Record a question'));
  assert.equal(await sidebar.getByRole('button',{name:'Open complete note',exact:true}).textContent(),'');
  assert.equal(await sidebar.getByRole('button',{name:'Add thought',exact:true}).textContent(),'');
  assert.equal(await sidebar.getByRole('button',{name:'Copy reference',exact:true}).first().textContent(),'');
  await emptyCard.waitFor();assert.equal(await emptyCard.locator('.marglow-comment-text, textarea').count(),0);assert.ok(!(await emptyCard.textContent()).includes('no comment'));
  assert.ok(!(await emptyCard.textContent()).includes('Add comment'));
  assert.equal(await emptyCard.locator('.marglow-record-actions .marglow-add-comment svg').count(),1);
  await sidebar.locator('.marglow-reading-header').hover();
  assert.equal(await emptyCard.locator('.marglow-record-actions').evaluate(el=>getComputedStyle(el).opacity),'0');
  const idleHeight=(await emptyCard.boundingBox()).height;
  await emptyCard.hover();
  assert.equal(await emptyCard.locator('.marglow-record-actions').evaluate(el=>getComputedStyle(el).opacity),'1');
  assert.equal((await emptyCard.boundingBox()).height,idleHeight);
  await emptyCard.getByRole('button',{name:/^Go to annotation:/}).click();
  await sidebar.locator('.marglow-reading-header').hover();
  assert.equal(await emptyCard.locator('.marglow-record-actions').evaluate(el=>getComputedStyle(el).opacity),'0');
  await emptyCard.getByRole('button',{name:/^Go to annotation:/}).focus();
  await page.keyboard.press('Tab');
  assert.equal(await emptyCard.locator('.marglow-record-actions').evaluate(el=>getComputedStyle(el).opacity),'1');
  passed('Annotation footer icons reveal together on card hover or keyboard focus, hide after mouse exit, and do not change card height');
  await emptyCard.hover();
  const emptyId=await emptyCard.getAttribute('data-annotation-id');
  await emptyCard.getByRole('button',{name:/^Add comment:/}).click();
  await emptyCard.getByRole('textbox',{name:'Comment',exact:true}).fill('A newly added comment.');
  await emptyCard.getByRole('button',{name:'Save',exact:true}).click();
  await page.waitForFunction(async ({path,emptyId})=>(await app.plugins.plugins.marglow.store.load({path,type:'markdown'})).note.entries.find(e=>e.annotation.id===emptyId).annotation.comment==='A newly added comment.',{path,emptyId});
  assert.equal(await page.evaluate(async path=>app.vault.read(app.vault.getFileByPath(path)),path),source);
  passed('Empty sidebar comments omit placeholders and add a comment in place without changing annotation identity');
  await sidebar.getByRole('textbox',{name:'Comment',exact:true}).waitFor({state:'detached'});
  await sidebar.getByText('A newly added comment.',{exact:true}).waitFor();
  await page.screenshot({path:`${output}/refined-reading-sidebar.png`});
  await sidebar.screenshot({path:`${output}/refined-sidebar-detail.png`});

  await page.evaluate(async path=>{
    const store=app.plugins.plugins.marglow.store,source={path,type:'markdown'},note=(await store.load(source)).note;
    const original=note.entries.find(e=>e.annotation.id==='ann-ux-original').annotation;
    await store.save(source,{...original,id:'ann-ux-other-style',blockId:'ann-ux-other-style',commentBlockId:undefined,style:'underline',comment:'An independent underline comment.'});
  },path);
  await sidebar.locator('[data-annotation-id="ann-ux-original"] .marglow-comment-jump').click();
  const beforeCollision=await page.evaluate(async path=>{const {file}=await app.plugins.plugins.marglow.store.load({path,type:'markdown'});return app.vault.read(file);},path);
  const collisionMessage='Marglow: This selection already has an underline. Select that annotation to edit it.';
  await page.evaluate(message=>window.marglowExpectedNotices.push(message),collisionMessage);
  await tools.getByRole('button',{name:'Underline',exact:true}).click();
  await page.getByText(collisionMessage,{exact:true}).waitFor();
  assert.equal(await page.evaluate(async path=>{const {file}=await app.plugins.plugins.marglow.store.load({path,type:'markdown'});return app.vault.read(file);},path),beforeCollision);

  passed('Style switching preserves both records when the same range already has the target style');

  await page.evaluate(async()=>{app.workspace.rightSplit.collapse();await app.workspace.getLeaf('tab').openFile(app.vault.getFileByPath('Dense.pdf'));});
  await page.waitForSelector('.workspace-leaf.mod-active .page .textLayer span');
  await page.waitForFunction(()=>[...app.plugins.plugins.marglow.mounted.values()].some(m=>m.session.source.path==='Dense.pdf'));
  await page.evaluate(async()=>{
    const plugin=app.plugins.plugins.marglow,session=[...plugin.mounted.values()].find(m=>m.session.source.path==='Dense.pdf').session;
    const spans=session.adapter.root.querySelectorAll('.page .textLayer span');const range=document.createRange();range.setStart(spans[0].firstChild,0);range.setEnd(spans[2].firstChild,spans[2].textContent.length);
    const selection=getSelection();selection.removeAllRanges();selection.addRange(range);const captured=session.adapter.capture(selection);selection.removeAllRanges();
    const now=new Date().toISOString();await plugin.store.save(session.source,{id:'ann-ux-dense-pdf',blockId:'ann-ux-dense-pdf',quote:captured.quote,anchor:captured.anchor,color:'yellow',comment:'Three closely spaced lines.',createdAt:now,updatedAt:now});await session.refresh();
  });
  await page.waitForSelector('.workspace-leaf.mod-active .marglow-highlight');
  const geometry=await page.evaluate(()=>{
    const page=document.querySelector('.workspace-leaf.mod-active .page'),rects=[...page.querySelectorAll('.marglow-highlight')].map(el=>el.getBoundingClientRect());
    const spans=[...page.querySelectorAll('.textLayer span')].slice(0,3).map(el=>el.getBoundingClientRect());
    return {count:rects.length,heightError:Math.max(...rects.map((r,i)=>Math.abs(r.height-spans[i].height))),overlap:rects.some((r,i)=>rects.slice(i+1).some(b=>Math.min(r.right,b.right)-Math.max(r.left,b.left)>0.5&&Math.min(r.bottom,b.bottom)-Math.max(r.top,b.top)>0.5))};
  });
  assert.equal(geometry.count,3);assert.ok(geometry.heightError<1,JSON.stringify(geometry));assert.equal(geometry.overlap,false);
  await page.screenshot({path:`${output}/pdf-tight-line-height.png`});
  passed('Tightly spaced PDF lines use text-run height and draw without overlapping color blocks');
}
