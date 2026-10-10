// Uses the existing browser, renderer, screenshot assertions and runtime fixture.
import assert from 'node:assert/strict';
import {resolveAtlasLink} from '../app/course-navigation.ts';

export async function regionalChecks({page,course,atlas,runtime,base,state,hash,ready,screenshot,record,insideViewport,openSearch,report}) {
 assert.ok(course?.selections.every(s=>s.region),'Regional checks require the real regional export');
 report.course=true;
 const selectionLink=s=>({mode:'course',courseId:course.courseId,selectionId:s.id});
 const expected=s=>resolveAtlasLink(selectionLink(s),atlas,course).scopeElements;
 const selected=()=>page.locator('.course-terms [aria-pressed="true"]');
 const region=s=>page.locator('.course-selection-list button').filter({hasText:s.label}).first();
 const choose=async s=>{await region(s).click();await state('data-scope-count',expected(s).length);await state('data-selected-count',0);await state('data-isolate',false);};
 const first=course.selections[0];
 await state('data-mode','course');
 const hrefs=new Set();
 for(const s of course.selections){
  await choose(s);
  assert.ok(expected(s).length>=s.elements.filter(id=>expected(s).includes(id)).length);
  const displayed=await page.locator('.course-terms button').count();
  assert.ok(displayed>0);
  assert.equal(await selected().count(),0,'Opening a region must not tint every bone');
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
 const binding=course.noteBindings[Object.keys(course.noteBindings)[0]];
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
