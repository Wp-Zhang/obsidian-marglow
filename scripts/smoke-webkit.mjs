import assert from "node:assert/strict";
import { readFile, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "esbuild";
import { webkit } from "playwright";

await mkdir("dev", { recursive: true });
const output = await mkdtemp(resolve("dev/webkit-"));
const css = await readFile("styles.css", "utf8");
const bundle = await build({ stdin: { contents: 'export {overlayRect} from \"./overlay-geometry\"; export {PdfAdapter} from \"./pdf-adapter\";', resolveDir: resolve('src') }, bundle: true, write: false, format: "iife", globalName: "MarglowGeometry" });
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
    .text { position:absolute; left:40px; top:50px; font:20px serif; white-space:nowrap; }
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
    const displayed=adapter.locate(annotation)[0], expected=range.getBoundingClientRect();
    return {quote:captured.quote,unchanged:saved===JSON.stringify(annotation.anchor),error:Math.max(...['left','top','width','height'].map(k=>Math.abs(displayed[k]-expected[k]))),inside:captured.anchor.segments[0].rects.every(r=>r[0]>=0&&r[2]<=400&&r[1]>=0&&r[3]<=600)};
  });
  assert.equal(captureCheck.quote,'passage');assert.equal(captureCheck.unchanged,true);assert.equal(captureCheck.inside,true);assert.ok(captureCheck.error<1);
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
  await writeFile(`${output}/report.json`, JSON.stringify({ engine: 'Playwright WebKit', version: browser.version(), mobileViewport: '402x874', checks: ['host-safe-inset toolbar placement', 'touch action delivery', 'dynamic header inset', 'joint hide/restore without reserved-space or scroll jumps', 'page geometry at four CSS scales', 'page-bound clipping', 'partial PDF selection capture and cross-scale saved-anchor display'], physicalIOS: false }, null, 2));
  console.log(`PASS WebKit mobile layout, touch, and scaled/clipped page geometry. ${output}`);
} finally { await browser.close(); }
