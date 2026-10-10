// Uses the existing browser, renderer, screenshot assertions and real private export.
import assert from 'node:assert/strict';
import {parseAtlasLink,resolveAtlasLink} from '../app/course-navigation.ts';

export async function regionalChecks({page,course,atlas,runtime,base,state,hash,ready,screenshot,record,insideViewport,openSearch,report}) {
 assert.ok(course?.selections.every(s=>s.region),'Regional checks require the real regional export');
 report.course=true;
 const selectionLink=s=>({mode:'course',courseId:course.courseId,selectionId:s.id});
 const expected=s=>resolveAtlasLink(selectionLink(s),atlas,course).scopeElements;
 const selected=()=>page.locator('.course-terms [aria-pressed="true"]');
 const region=s=>page.locator('.course-selection-list button').filter({hasText:s.region?.label??s.label}).first();
 const choose=async s=>{await region(s).click();const current=parseAtlasLink(new URL(page.url()).hash);assert.equal(current.selectionId,s.id);await state('data-scope-count',resolveAtlasLink(current,atlas,course).scopeElements.length);await state('data-selected-count',0);await state('data-isolate',false);};
 const first=course.selections[0];
 await state('data-mode','course');
 const hrefs=new Set();
 for(const s of course.selections){
  await choose(s);
  assert.ok(expected(s).length>=s.elements.filter(id=>expected(s).includes(id)).length);
  const displayed=await page.locator('.course-terms button').count();
  assert.ok(displayed>0);
  assert.equal(await selected().count(),0,'Opening a region must not tint every bone');
  for (const id of s.conceptIds) {
   const term=course.concepts.find(item=>item.id===id);
   if (!term.elements.some(mesh=>expected(s).includes(mesh))) continue;
   const row=page.locator('.course-terms button[data-course-term="true"]').filter({hasText:term.labels.sl}).filter({hasText:term.labels.la});
   assert.equal(await row.count(),1,'Each visible teaching term retains its source labels and authored order');
   assert.ok((await row.getAttribute('title')).includes(term.name),'The English catalogue name remains available');
  }
  for(const href of await page.locator('.course-sources a').evaluateAll(a=>a.map(x=>x.getAttribute('href')))){
   if(href.startsWith('/api/course/sources/'))hrefs.add(href.split('#')[0]);
  }
  (report.regions??=[]).push({id:s.id,scope:expected(s).length,rows:displayed,teachingTargets:s.elements.length});
 }
 record('All regional selections show surrounding catalogue anatomy without painting all meshes as selected');
 await choose(first);
 const neutral=await screenshot('region-hand-neutral',false,true);
 assert.ok(neutral.neutral.pixels>1000,'Neutral hand geometry must be visible before choosing a target');
 const count=await page.locator('.course-terms button').count();
 const reset=await page.locator('main').getAttribute('data-camera-reset');
 await page.locator('.course-terms button').first().click();
 await state('data-selected-count',1);await state('data-isolate',false);
 assert.equal(await page.locator('.course-terms button').count(),count,'Selecting must not replace the regional list with a single-object screen');
 assert.equal(await page.locator('main').getAttribute('data-camera-reset'),reset,'Selecting within a region must preserve the user camera');
 assert.equal(await selected().count(),1);
 const highlighted=await screenshot('region-hand-highlighted',true,true);
 assert.ok(highlighted.neutral.pixels>highlighted.pixels,'Surrounding bones must remain visibly present around the target');
 await page.mouse.click(highlighted.sample.x,highlighted.sample.y);
 await state('data-selected-count',1);await state('data-isolate',false);
 assert.ok(new URL(page.url()).hash.includes('mesh='),'The existing picker must identify the visible mesh');
 assert.equal(await selected().count(),1,'A canvas click must select the corresponding persistent list row');
 record('Existing list/picker highlighting preserves the whole hand, camera and synchronized names');

 const other=page.locator('.course-terms button[data-course-term="false"]').first();
 const extra=await other.getAttribute('data-mesh');
 await other.click();
 await state('data-selected-count',1);await state('data-mode','course');await state('data-isolate',false);
 assert.equal(new URLSearchParams(new URL(page.url()).hash.slice(1)).get('mesh'),extra);
 assert.equal(await page.locator('main').getAttribute('data-camera-reset'),reset);
 assert.ok(await other.getAttribute('aria-pressed')==='true');
 await page.getByRole('button',{name:'Samo izbrano',exact:true}).click();await state('data-isolate',true);
 await page.getByRole('button',{name:'Nazaj v predel',exact:true}).click();await state('data-isolate',false);
 await page.getByRole('button',{name:'Samo izbrano',exact:true}).click();
 await page.locator('.course-terms button').first().click();await state('data-isolate',false);
 record('Structures beyond the lecture seed are selectable in UNI; isolation is explicit and another selection restores context');

 for(const side of ['left','both','right']){
  await page.getByRole('group',{name:'Stran telesa'}).getByRole('button',{name:side==='both'?'Obe':side==='left'?'Levo':'Desno',exact:true}).click();
  await state('data-selected-count',0);
  const view=resolveAtlasLink({...selectionLink(first),side},atlas,course);
  await state('data-scope-count',view.scopeElements.length);
 }
 await page.getByLabel('Plasti predela').selectOption('muscles');
 await state('data-scope-count',resolveAtlasLink({...selectionLink(first),layer:'muscles'},atlas,course).scopeElements.length);
 const muscleIds=atlas.parts.filter(p=>p.system==='muscular').map(p=>p.id);
 const muscle=await page.locator('.course-terms button[data-mesh]').evaluateAll((buttons,ids)=>buttons.map(b=>b.dataset.mesh).find(id=>ids.includes(id)),muscleIds);
 assert.ok(muscle,'The regional muscle layer must expose additional structures');
 await page.locator(`.course-terms button[data-mesh="${muscle}"]`).click();
 await state('data-selected-count',1);await state('data-isolate',false);
 await screenshot('region-hand-muscle',true,true);
 const saved=page.url();
 await page.reload({waitUntil:'domcontentloaded'});await ready();
 assert.equal(page.url(),saved);await state('data-selected-count',1);await state('data-isolate',false);
 assert.equal(await page.getByLabel('Plasti predela').inputValue(),'muscles');
 await choose(first);
 assert.equal(await page.getByLabel('Plasti predela').inputValue(),'muscles','Returning to the active region must preserve its chosen layer');
 await page.goBack();await state('data-selected-count',1);await state('data-isolate',false);
 await page.goForward();await state('data-selected-count',0);
 record('Side/layer filters, a muscle selection, reload and browser history retain regional context');

 await page.getByLabel('Plasti predela').selectOption('bones');
 const firstTerm=course.concepts.find(c=>c.id===first.conceptIds[0]);
 for(const label of [firstTerm.labels.sl,firstTerm.labels.la,firstTerm.name]){
  await openSearch(label);await page.getByRole('option').first().click();await state('data-active-structure',firstTerm.id);await state('data-isolate',false);
 }
 await page.getByRole('button',{name:'Kopiraj povezavo do trenutnega izbora',exact:true}).click();
 await page.locator('.copy-fallback input').waitFor();
 assert.equal(await page.locator('.copy-fallback input').inputValue(),page.url());
 await page.locator('.copy-fallback input').press('Escape');
 assert.ok(await page.locator('.course-detail').isVisible());
 record('Trilingual search reuses the same target and clipboard fallback keeps the list open');

 // Existing note links predate selection/region parameters. They must acquire
 // their authored region without changing the taught target or isolating it.
 for(const target of [{structure:firstTerm.id},{mesh:firstTerm.elements[0]}]){
  await hash({course:course.courseId,...target});
  const link=resolveAtlasLink({mode:'course',courseId:course.courseId,...(target.structure?{structureId:target.structure}:{meshId:target.mesh})},atlas,course);
  await state('data-mode','course');await state('data-scope-count',link.scopeElements.length);
  await state('data-selected-count',link.elements.length);await state('data-isolate',false);
  assert.ok(await page.locator('.course-terms button').count()>link.elements.length);
  await page.reload({waitUntil:'domcontentloaded'});await ready();
  await state('data-scope-count',link.scopeElements.length);await state('data-isolate',false);
 }
 await choose(first);
 const historyLength=await page.evaluate(()=>history.length);
 await choose(first);
 assert.equal(await page.evaluate(()=>history.length),historyLength,'Choosing the active region must not duplicate browser history');
 for(const view of ['front','back','side']){
  await page.getByRole('button',{name:`${view} view`,exact:true}).click();
  assert.equal(new URLSearchParams(new URL(page.url()).hash.slice(1)).get('view'),view);
  assert.equal(await page.getByRole('button',{name:`${view} view`,exact:true}).getAttribute('aria-pressed'),'true');
 }
 await page.getByRole('button',{name:'front view',exact:true}).click();
 record('Existing direct structure/mesh links retain whole regions; camera controls and duplicate-free history remain usable');

 const beforeRotation=await page.evaluate(()=>window.__atlasResourceProbe.frames);
 await page.getByRole('button',{name:'Rotate body',exact:true}).click();
 await page.waitForFunction(before=>window.__atlasResourceProbe.frames>=before+3,beforeRotation,{polling:100,timeout:30_000});
 await page.getByRole('button',{name:'Pause rotation',exact:true}).click();
 await page.waitForFunction(()=>window.__atlasResourceProbe.pending.size===0,null,{polling:100,timeout:30_000});
 record('The regional rotation control animates the whole region and stops when paused');

 await hash({course:course.courseId,selection:first.id,mesh:'FJ1469'});
 await state('data-mode','course');await state('data-selected-count',1);await state('data-isolate',false);
 assert.equal(await page.getByRole('group',{name:'Stran telesa'}).getByRole('button',{name:'Obe',exact:true}).getAttribute('aria-pressed'),'true');
 await page.getByText('Neskladna oznaka strani v viru',{exact:true}).waitFor();
 const conflicting=atlas.parts.find(p=>p.id==='FJ1469M');
 await openSearch(conflicting.name);
 await page.getByRole('option').filter({hasText:conflicting.name}).first().click();
 await state('data-selected-count',1);
 assert.equal(await page.getByRole('group',{name:'Stran telesa'}).getByRole('button',{name:'Obe',exact:true}).getAttribute('aria-pressed'),'true');
 await page.getByText('Neskladna oznaka strani v viru',{exact:true}).waitFor();
 record('Conflicting source-side labels retain exact target access with both sides and an explicit source warning');

 // A useful default frame must fit complete regions, not merely the seed meshes.
 for(const s of course.selections.slice(1)){
  await choose(s);
  const image=await screenshot(`region-${s.id}`,false,true);
  assert.ok(image.neutral.pixels>100,'Regional bone geometry must remain visible');
 }
 await choose(first);
 for(const [width,height] of [[1024,768],[768,820],[390,844],[320,568],[844,390]]){
  await page.setViewportSize({width,height});
  await insideViewport('.course-detail');
  assert.ok(await page.locator('.course-detail .detail-scroll').evaluate(e=>e.clientHeight>=40));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  const image=await screenshot(`region-pane-${width}x${height}`,false,true);
  assert.ok(image.neutral.pixels>=80&&image.neutral.height>=24,'A resized pane must retain visible regional geometry');
 }
 record('Whole-region framing and persistent lists survive desktop, narrow Obsidian panes, portrait and landscape');
 await page.setViewportSize({width:390,height:844});
 await page.getByRole('button',{name:'Prikaži strukture v predelu',exact:true}).click();
 await page.locator('.course-detail').waitFor({state:'hidden'});
 await screenshot('region-mobile-unobstructed',false,true);
 await page.getByRole('button',{name:'Odpri študijske izbore',exact:true}).click();
 await page.locator('.course-selection-list button').last().click();
 assert.equal(await page.locator('.course-detail').count(),0);
 await page.getByRole('button',{name:'Prikaži strukture v predelu',exact:true}).click();
 await page.locator('.course-terms button').first().click();await state('data-isolate',false);
 assert.ok(await page.locator('.course-terms button').count()>1);
 record('Mobile drawers can leave anatomy unobstructed and retain context while using the list');

 await page.setViewportSize({width:1440,height:1000});
 for(const objective of course.unmappedObjectives){
  await hash({course:course.courseId,objective:objective.id,context:'1'});
  await state('data-selected-count',0);
  const result=resolveAtlasLink({mode:'course',courseId:course.courseId,objectiveId:objective.id,context:true},atlas,course);
  await state('data-context-count',result.contextElements.length);
  await page.locator('.unmapped-notice').waitFor();
  for(const href of await page.locator('.course-sources a').evaluateAll(a=>a.map(x=>x.getAttribute('href'))))if(href.startsWith('/api/course/sources/'))hrefs.add(href.split('#')[0]);
 }
 const contextImage=await screenshot('region-unmapped-context',false,true);
 assert.equal(contextImage.pixels,0,'Neutral objective context must never use the target highlight');
 for(const href of hrefs){
  const response=await page.request.head(new URL(href,base).href);assert.equal(response.status(),200);assert.match(response.headers()['cache-control'],/no-store/);
 }
 const source=await page.request.get(new URL(`/api/course/sources/${encodeURIComponent(Object.keys(course.noteBindings)[0])}/pdf`,base).href,{headers:{Range:'bytes=0-4'}});
 assert.equal(source.status(),206);assert.equal((await source.body()).toString(),'%PDF-','Tests use an actual PDF, not synthetic media');
 report.sourceCount=hrefs.size;
 record('All unmapped objectives remain neutral; registered sources and actual PDF byte ranges remain private and usable');
 await hash({course:course.courseId,selection:first.id,mesh:'missing'});
 await state('data-mode','explorer');await state('data-selected-count',0);await page.locator('.course-status').waitFor();
 await hash({explorer:'1'});await state('data-mode','explorer');
 await page.getByRole('button',{name:'Skeleton',exact:true}).click();
 const femur=atlas.concepts.find(c=>c.name==='femur');
 await openSearch('femur');await page.getByRole('option').filter({hasText:'femur'}).first().click();
 await state('data-isolate',false);await state('data-selected-count',femur.elements.length);
 const explorer=await screenshot('region-preserved-full-body-highlight',true,true);
 assert.ok(explorer.neutral.pixels>explorer.pixels);
 record('Invalid targets fail visibly, and the original full-body contextual highlighting is preserved');
}
