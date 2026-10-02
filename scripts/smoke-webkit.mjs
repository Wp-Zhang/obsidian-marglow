import assert from "node:assert/strict";
import { readFile, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "esbuild";
import { webkit } from "playwright";

await mkdir("dev", { recursive: true });
const output = await mkdtemp(resolve("dev/webkit-"));
const css = await readFile("styles.css", "utf8");
const bundle = await build({ stdin: { contents: 'export {overlayRect} from \"./overlay-geometry\"; export {PdfAdapter, pdfTextRect} from \"./pdf-adapter\"; export {AnnotationUI} from \"./ui\"; export {AnnotationSession} from \"./session\";', resolveDir: resolve('src') }, bundle: true, write: false, format: "iife", globalName: "MarglowGeometry", plugins:[{name:'fixture-host-icon',setup(build){build.onResolve({filter:/^obsidian$/},()=>({path:'fixture-obsidian',namespace:'fixture'}));build.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export function setIcon(element,name){element.setAttribute("data-icon",name);}',loader:'js'}));}}] });
const browser = await webkit.launch();
try {
  const context = await browser.newContext({ viewport: { width: 402, height: 874 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await page.setContent(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>
    body { margin:0; --view-top-spacing-markdown:125px; --safe-area-inset-top:59px; --view-header-height:50px; --background-primary:#fff; --text-normal:#222; --text-muted:#666; --background-modifier-border:#ddd; --font-ui-small:14px; }
    .header { position:fixed; top:var(--safe-area-inset-top); height:var(--view-header-height); width:100%; background:white; z-index:10; }
    .markdown-reading-view { height:600px; } .markdown-preview-view { padding-top:var(--view-top-spacing-markdown); overflow:auto; box-sizing:border-box; }
    .page { position:relative; width:400px; height:600px; border:1px solid #ddd; margin-top:20px; transform-origin:top left; }
    .text { position:absolute; left:40px; top:50px; font:20px/1 serif; white-space:nowrap; }
    ${css}
    </style><body class="is-phone is-floating-nav"><div class="header">Native navigation reserved area</div><div class="mod-root"><div class="workspace-leaf-content"><div class="view-content"><div class="markdown-reading-view marglow-reading-container"><div class="marglow-ui marglow-file-tools marglow-mobile"><button type="button">Highlight</button><button type="button">Reading notes</button></div><div class="markdown-preview-view">Reading content</div></div></div></div></div><div class="page" data-page-number="1"><div class="canvasWrapper" style="position:absolute;inset:0"></div><div class="textLayer" style="position:absolute;inset:0"><span class="text">A passage worth remembering.</span></div><div class="marglow-overlay"><div class="marglow-highlight marglow-yellow marglow-underline"></div></div></div>`);
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const toolbar = page.locator('.marglow-file-tools');
  const top = await toolbar.evaluate(el => el.getBoundingClientRect().top);
  assert.ok(Math.abs(top - 109) < 1);
  assert.equal(await page.locator('.markdown-preview-view').evaluate(el => getComputedStyle(el).paddingTop), '182px');
  await page.evaluate(() => document.querySelector('button').addEventListener('click', event => event.currentTarget.dataset.tapped = 'true'));
  await page.getByRole('button', { name: 'Highlight', exact: true }).tap();
  assert.equal(await page.getByRole('button', { name: 'Highlight', exact: true }).getAttribute('data-tapped'), 'true');
  await page.evaluate(() => document.body.style.setProperty('--safe-area-inset-top', '30px'));
  assert.ok(Math.abs(await toolbar.evaluate(el => el.getBoundingClientRect().top) - 80) < 1);
  const beforeHide=await page.evaluate(()=>{
    const root=document.querySelector('.markdown-preview-view');
    for(let i=0;i<50;i++){const p=document.createElement('p');p.textContent='Reading paragraph '+i;root.append(p);}
    root.scrollTop=300;return {top:root.getBoundingClientRect().top,scroll:root.scrollTop};
  });
  await page.evaluate(()=>document.body.classList.add('is-hidden-nav'));
  await toolbar.waitFor({state:'hidden'});
  assert.equal(await toolbar.evaluate(el=>getComputedStyle(el).visibility),'hidden');
  assert.equal(await toolbar.evaluate(el=>getComputedStyle(el).pointerEvents),'none');
  assert.deepEqual(await page.evaluate(()=>{const root=document.querySelector('.markdown-preview-view');return {top:root.getBoundingClientRect().top,scroll:root.scrollTop};}),beforeHide);
  await page.evaluate(()=>document.body.classList.remove('is-hidden-nav'));
  await toolbar.waitFor({state:'visible'});
  await page.getByRole('button',{name:'Highlight',exact:true}).tap();

  for (const scale of [0.7, 1, 1.7, 2.5]) {
    const delta = await page.evaluate(scale => {
      const host = document.querySelector('.page'); host.style.transform = `scale(${scale})`;
      const range = document.createRange(); range.selectNodeContents(host.querySelector('.text'));
      const measured = range.getBoundingClientRect(); const rect = MarglowGeometry.overlayRect(measured, host);
      const overlay = host.querySelector('.marglow-overlay');
      overlay.style.width = `${host.clientWidth}px`; overlay.style.height = `${host.clientHeight}px`;
      const highlight = host.querySelector('.marglow-highlight');
      Object.assign(highlight.style, { left:`${rect.left}px`, top:`${rect.top}px`, width:`${rect.width}px`, height:`${rect.height}px` });
      const drawn = highlight.getBoundingClientRect();
      return { error: Math.max(...['left','top','width','height'].map(key => Math.abs(measured[key] - drawn[key]))), clipping: getComputedStyle(overlay).overflow, width: parseFloat(overlay.style.width), pageWidth:host.clientWidth };
    }, scale);
    assert.ok(delta.error < 1, JSON.stringify({ scale, ...delta }));
    assert.equal(delta.clipping, 'hidden'); assert.equal(delta.width, delta.pageWidth);
  }
  const captureCheck=await page.evaluate(()=>{
    const host=document.querySelector('.page'),layer=host.querySelector('.textLayer');
    const pageView={div:host,viewport:{width:400,height:600,convertToPdfPoint:(x,y)=>[x,600-y],convertToViewportRectangle:r=>[r[0],600-r[1],r[2],600-r[3]]}};
    const viewer={pagesCount:1,getPageView:()=>pageView};
    const adapter=new MarglowGeometry.PdfAdapter(host.parentElement,{viewer:{child:{pdfViewer:{pdfViewer:viewer}}}},'webkit-fixture');
    host.style.transform='scale(1.7)';layer.querySelector('span').style.transform='scaleX(.72)';layer.querySelector('span').style.transformOrigin='top left';
    const range=document.createRange();range.setStart(layer.querySelector('span').firstChild,2);range.setEnd(layer.querySelector('span').firstChild,9);
    const selection=getSelection();selection.removeAllRanges();selection.addRange(range);
    const captured=adapter.capture(selection);selection.removeAllRanges();
    const annotation={quote:captured.quote,anchor:JSON.parse(JSON.stringify(captured.anchor))};
    const saved=JSON.stringify(annotation.anchor);
    host.style.transform='scale(.7)';
    const displayed=adapter.locate(annotation)[0], expected=MarglowGeometry.pdfTextRect(range);
    return {quote:captured.quote,unchanged:saved===JSON.stringify(annotation.anchor),error:Math.max(...['left','top','width','height'].map(k=>Math.abs(displayed[k]-expected[k]))),inside:captured.anchor.segments[0].rects.every(r=>r[0]>=0&&r[2]<=400&&r[1]>=0&&r[3]<=600)};
  });
  assert.equal(captureCheck.quote,'passage');assert.equal(captureCheck.unchanged,true);assert.equal(captureCheck.inside,true);assert.ok(captureCheck.error<1);
  await page.evaluate(()=>{
    window.createEl=tag=>document.createElement(tag);window.createDiv=()=>document.createElement('div');window.createSpan=()=>document.createElement('span');
    Object.defineProperty(Node.prototype,'win',{configurable:true,get(){return window;}});
    const drawer=document.createElement('div');drawer.className='marglow-comments-view marglow-mobile webkit-reading-drawer';
    Object.assign(drawer.style,{position:'fixed',inset:'90px 12px 16px',background:'white',zIndex:'2000'});
    drawer.innerHTML='<div class="marglow-reading-header"><strong>Reading notes</strong></div><div class="marglow-thought-section"><div class="marglow-sidebar-header">Thought</div><div class="marglow-thought-list"><article class="marglow-thought-card"></article></div></div>';
    document.body.append(drawer);
    window.webkitThoughtSaves=[];window.webkitThoughtFailures=[];window.webkitFailOnce=true;
    window.webkitThoughtUI=new MarglowGeometry.AnnotationUI(document,true,message=>window.webkitThoughtFailures.push(message));
    window.webkitThoughtUI.navigationContainer=drawer;
    window.webkitThoughtUI.showThought(drawer.querySelector('article'),'',async text=>{if(window.webkitFailOnce){window.webkitFailOnce=false;throw new Error('Simulated persistence failure');}window.webkitThoughtSaves.push(text);});
    window.webkitThoughtEvents=[];
    for(const type of ['pointerdown','pointerup','click']) drawer.addEventListener(type,event=>window.webkitThoughtEvents.push([type,event.target.tagName,event.target.textContent?.slice(0,20)]),true);
  });
  const drawer=page.locator('.webkit-reading-drawer'), thoughtInput=drawer.getByRole('textbox',{name:'Whole-material thought',exact:true});
  await thoughtInput.fill('A touch-entered thought.\n\nSecond paragraph.');
  await page.setViewportSize({width:402,height:560});
  const save=drawer.getByRole('button',{name:'Save',exact:true});await save.scrollIntoViewIfNeeded();
  const box=await save.boundingBox();assert.ok(box.height>=44&&box.y>=0&&box.y+box.height<=560);
  await save.tap();
  try { await drawer.getByRole('alert').waitFor({timeout:3000}); }
  catch(error){console.log(await page.evaluate(()=>({events:window.webkitThoughtEvents,failures:window.webkitThoughtFailures,saves:window.webkitThoughtSaves,draft:window.webkitThoughtUI.hasDraft,busy:window.webkitThoughtUI.isBusy,viewport:{width:innerWidth,height:innerHeight},html:document.querySelector('.webkit-reading-drawer').innerHTML})));await page.screenshot({path:`${output}/thought-failure.png`});throw error;}
  assert.equal(await thoughtInput.inputValue(),'A touch-entered thought.\n\nSecond paragraph.');
  await save.tap();await thoughtInput.waitFor({state:'detached'});
  assert.deepEqual(await page.evaluate(()=>window.webkitThoughtSaves),['A touch-entered thought.\n\nSecond paragraph.']);
  assert.equal(await drawer.isVisible(),true);
  await page.evaluate(()=>{window.webkitThoughtUI.dispose();document.querySelector('.webkit-reading-drawer').remove();});
  await page.setViewportSize({width:402,height:874});
  console.log('PASS WebKit touch thought input, reachable save controls, retained failure draft, and retry');
  await page.evaluate(()=>{
    window.createSvg=tag=>document.createElementNS('http://www.w3.org/2000/svg',tag);
    if(!crypto.randomUUID)Object.defineProperty(crypto,'randomUUID',{value:()=> '00000000-0000-4000-8000-000000000001'});
    const host=document.createElement('div');host.className='webkit-source-fixture';Object.assign(host.style,{position:'fixed',inset:'90px 12px 20px',background:'white',zIndex:'500'});
    const root=document.createElement('div');root.className='markdown-preview-view';root.innerHTML='<p>A touch selection.</p>';host.append(root);document.body.append(host);
    const p=root.querySelector('p'),range=document.createRange();range.selectNodeContents(p);
    const adapter={root,refreshLayout(){},dispose(){},capture(selection){if(selection.isCollapsed||!p.contains(selection.getRangeAt(0).commonAncestorContainer))return null;return {quote:selection.toString(),anchor:{kind:'markdown',textStart:0,prefix:'',suffix:''},rect:selection.getRangeAt(0).getBoundingClientRect()};},locate(){return [range.getBoundingClientRect()];},matches(a,s){return a.quote===s.quote;}};
    window.webkitSavedAnnotation=null;window.webkitTouchErrors=[];
    const store={async save(_source,annotation){window.webkitSavedAnnotation=annotation;return {annotation,raw:'saved'};},async load(){return {note:{entries:window.webkitSavedAnnotation?[{annotation:window.webkitSavedAnnotation,raw:'saved'}]:[]}};}};
    const callbacks={report(message){window.webkitTouchErrors.push(message);},isReassociating(){return false;},async reassociate(){},cancelReassociation(){},onUiClosed(){},async toggleComments(){},isCommentsVisible(){return false;},async revealSource(){},isActive(){return true;}};
    window.webkitSourceSession=new MarglowGeometry.AnnotationSession({path:'Fixture.md',type:'markdown'},adapter,store,true,callbacks);
    getSelection().removeAllRanges();getSelection().addRange(range);
  });
  await page.locator('.webkit-source-fixture').getByRole('button',{name:'Choose yellow',exact:true}).tap();
  await page.waitForFunction(()=>window.webkitSavedAnnotation?.quote==='A touch selection.');
  const savedId=await page.evaluate(()=>window.webkitSavedAnnotation.id);
  const sourceFixture=page.locator('.webkit-source-fixture');
  await sourceFixture.locator('p').tap({position:{x:20,y:10}});
  await page.locator('body > .marglow-toolbar').waitFor();
  const toolBounds=await page.locator('body > .marglow-toolbar').evaluate(panel=>[...panel.querySelectorAll('button')].map(button=>button.getBoundingClientRect().toJSON()));
  assert.ok(toolBounds.every(box=>box.left>=11 && box.right<=391 && box.width>=32 && box.height>=44),JSON.stringify(toolBounds));
  await sourceFixture.getByRole('button',{name:'Underline',exact:true}).tap();
  await page.waitForFunction(()=>window.webkitSavedAnnotation?.style==='underline');
  assert.equal(await page.evaluate(()=>window.webkitSavedAnnotation.id),savedId);
  await sourceFixture.getByRole('button',{name:'Choose pink',exact:true}).tap();
  await page.waitForFunction(()=>window.webkitSavedAnnotation?.color==='pink');
  await sourceFixture.getByRole('button',{name:'Highlight',exact:true}).tap();
  await page.waitForFunction(()=>window.webkitSavedAnnotation?.style==='highlight');
  await sourceFixture.getByRole('button',{name:'Comment',exact:true}).tap();
  const floating=page.locator('body > .marglow-composer');await floating.waitFor();
  await floating.getByRole('textbox',{name:'Comment',exact:true}).fill('A movable WebKit draft.');
  await floating.getByRole('button',{name:'Highlight blue',exact:true}).tap();
  await page.waitForFunction(()=>window.webkitSavedAnnotation.color==='blue');
  await floating.getByRole('button',{name:'Underline',exact:true}).tap();
  await page.waitForFunction(()=>window.webkitSavedAnnotation.style==='underline');
  assert.equal(await floating.getByRole('textbox',{name:'Comment',exact:true}).inputValue(),'A movable WebKit draft.');
  assert.equal(await page.evaluate(()=>window.webkitSavedAnnotation.comment),'');
  const grip=await floating.getByRole('button',{name:'Move comment window',exact:true}).boundingBox();
  await page.mouse.move(grip.x+40,grip.y+grip.height/2);await page.mouse.down();await page.mouse.move(grip.x+40,grip.y+grip.height/2-120,{steps:6});await page.mouse.up();
  assert.equal(await floating.getByRole('textbox',{name:'Comment',exact:true}).inputValue(),'A movable WebKit draft.');
  await page.setViewportSize({width:402,height:560});
  const floatingBox=await floating.boundingBox();assert.ok(floatingBox.x>=11 && floatingBox.y>=11 && floatingBox.x+floatingBox.width<=391 && floatingBox.y+floatingBox.height<=549);
  await floating.getByRole('button',{name:'Cancel',exact:true}).tap();
  assert.equal(await page.evaluate(()=>window.webkitSavedAnnotation.comment),'');
  await page.setViewportSize({width:402,height:874});
  assert.deepEqual(await page.evaluate(()=>window.webkitTouchErrors),[]);
  await page.evaluate(()=>{window.webkitSourceSession.dispose();document.querySelector('.webkit-source-fixture').remove();getSelection().removeAllRanges();});
  console.log('PASS WebKit touch appearance changes keep the popup/draft open; toolbar edits and draggable bounds remain correct');
  assert.deepEqual(errors, []);
  const safariCheck = `<script>
    const status=document.createElement('p');status.setAttribute('role','status');status.style.cssText='position:fixed;bottom:8px;left:8px;right:8px;z-index:99;padding:12px;background:#def6e3;color:#14532d;font:14px sans-serif';document.body.append(status);
    try {
      const toolbar=document.querySelector('.marglow-file-tools');
      if(Math.abs(toolbar.getBoundingClientRect().top-80)>1)throw new Error('toolbar inset');
      const host=document.querySelector('.page'),span=host.querySelector('.text'),range=document.createRange();range.setStart(span.firstChild,2);range.setEnd(span.firstChild,9);
      const view={div:host,viewport:{width:400,height:600,convertToPdfPoint:(x,y)=>[x,600-y],convertToViewportRectangle:r=>[r[0],600-r[1],r[2],600-r[3]]}};
      const adapter=new MarglowGeometry.PdfAdapter(host.parentElement,{viewer:{child:{pdfViewer:{pdfViewer:{pagesCount:1,getPageView:()=>view}}}}},'safari-fixture');
      const selection=getSelection();selection.removeAllRanges();selection.addRange(range);const captured=adapter.capture(selection);selection.removeAllRanges();
      host.style.transform='scale(1.7)';const measured=adapter.locate({quote:captured.quote,anchor:captured.anchor})[0];const expected=range.getBoundingClientRect();
      if(captured.quote!=='passage'||Math.abs(measured.width-expected.width)>1)throw new Error('PDF capture/geometry');
      status.textContent='PASS Safari: toolbar inset, partial PDF selection, cross-scale geometry, page clipping.';
    }catch(error){status.textContent='FAIL Safari: '+error.message;status.style.background='#fee';}
  </script>`;
  await writeFile(`${output}/safari-fixture.html`, (await page.content()).replace('</body>',safariCheck+'</body>'));
  await page.screenshot({ path: `${output}/webkit-layout.png`, fullPage: true });
  await writeFile(`${output}/report.json`, JSON.stringify({ engine: 'Playwright WebKit', version: browser.version(), mobileViewport: '402x874', checks: ['host-safe-inset toolbar placement', 'touch action delivery', 'dynamic header inset', 'joint hide/restore without reserved-space or scroll jumps', 'page geometry at four CSS scales', 'page-bound clipping', 'partial PDF selection capture and cross-scale saved-anchor display','whole-material touch input and 44px save at reduced viewport','retained simulated persistence-failure draft and retry','toolbar touch preserves and highlights its selected text','selected annotation touch recolor and style switching preserve identity','floating composer drag and reduced-viewport draft retention','repeated touch appearance changes retain the popup and unsaved draft'], physicalIOS: false }, null, 2));
  console.log(`PASS WebKit mobile layout, touch, and scaled/clipped page geometry. ${output}`);
} finally { await browser.close(); }
