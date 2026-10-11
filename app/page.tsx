import {flushSync} from 'react-dom';
import {registerAtlasTools} from './agent-tools';
import {lazy,Suspense,useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {Activity,ArrowUpRight,ChevronRight,Focus,Info,Layers3,Pause,RotateCcw,RotateCw,Search,X} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Badge} from '@/components/ui/badge';
import {Slider} from '@/components/ui/slider';
import {Switch} from '@/components/ui/switch';
import {Sheet,SheetContent,SheetTitle,SheetDescription} from '@/components/ui/sheet';
import {Combobox,ComboboxInput,ComboboxContent,ComboboxList,ComboboxItem,ComboboxEmpty} from '@/components/ui/combobox';
import {atlasRegions} from './atlas-regions';
import {RegionChooser,RegionPanel,RegionInspector,RegionControls} from './region-ui';
import {DEFAULT_VISIBLE,SYSTEMS,EXPLANATIONS,explanation,type Atlas,type Concept,type SceneState,type SystemId,type View} from './anatomy';
import {usePrivateCourse} from './course-client';
import {CourseInspector,CoursePanel,CopySceneLink} from './course-ui';
import {resolveAtlasRoute,resolveAtlasLink,serializeAtlasLink,publicTargetLink,type AtlasLink} from './course-navigation';
import type {CourseConcept,CourseSelection,UnmappedObjective} from './course';
import {regionElements,partSide,hasSourceSideConflict,type StudySide,type StudyLayer} from './study-region';
// Defining lazy does not fetch the renderer; only a validated route renders it.
const AnatomyScene=lazy(()=>import('./scene'));
const initial:SceneState={explode:0,visible:DEFAULT_VISIBLE,selected:[],isolate:false,view:'three-quarter',rotate:false,reset:0};
export default function Home(){
 const detailTitle=useRef<HTMLHeadingElement>(null);
 const [atlas,setAtlas]=useState<Atlas|null>(null),[state,setState]=useState(initial),[progress,setProgress]=useState(0),[error,setError]=useState(''),[panel,setPanel]=useState<'layers'|'search'|'course'|'regions'|null>(null),[details,setDetails]=useState(false),[about,setAbout]=useState(false),[query,setQuery]=useState(''),[chosen,setChosen]=useState<Concept|null>(null);
 const [catalogue,setCatalogue]=useState(''),[activeLink,setActiveLink]=useState<AtlasLink>({mode:'explorer'}),[linkError,setLinkError]=useState('');
 const [sceneReady,setSceneReady]=useState(false),[routeLoading,setRouteLoading]=useState(false),[selectionError,setSelectionError]=useState('');
 const [explorerTarget,setExplorerTarget]=useState<AtlasLink|null>(null);
 const currentLink=useRef<AtlasLink>({mode:'explorer'}),appliedHash=useRef<string|null>(null),sceneState=useRef(state);sceneState.current=state;
 const privateCourse=usePrivateCourse(atlas,catalogue),runtime=privateCourse.runtime,course=runtime?.course??null,courseMode=sceneReady&&activeLink.mode==='course'&&!!course;
 useEffect(()=>{const abort=new AbortController();setProgress(0);setError('');setAtlas(null);setChosen(null);setDetails(false);setState({...initial,visible:DEFAULT_VISIBLE});fetch('/models/atlas.json',{signal:abort.signal,cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('The anatomy catalogue could not be loaded.');return r.text();}).then(raw=>{setCatalogue(raw);setAtlas(JSON.parse(raw) as Atlas);}).catch(e=>{if(e.name!=='AbortError')setError(e.message);});return()=>abort.abort();},[]);
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){setPanel(null);setDetails(false);}if(e.key==='/'&&!(e.target instanceof HTMLInputElement)&&!(e.target instanceof HTMLTextAreaElement)&&!(e.target instanceof HTMLElement&&e.target.isContentEditable)){e.preventDefault();setPanel('search');setDetails(false);}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[]);
 const regions=useMemo(()=>atlas?atlasRegions(atlas):[],[atlas]);
 const publicRegion=activeLink.mode==='region'?regions.find(region=>region.id===activeLink.regionId):undefined;
 const regional=courseMode||!!publicRegion;
 const parts=useMemo(()=>new Map(atlas?.parts.map(p=>[p.id,p])),[atlas]);
 const counts=useMemo(()=>Object.fromEntries(SYSTEMS.map(s=>[s.id,atlas?.parts.filter(p=>p.system===s.id).length??0])),[atlas]);
 const activeSystems=SYSTEMS.filter(s=>counts[s.id]>0);
 const selectedParts=state.selected.map(id=>parts.get(id)).filter(p=>!!p),selected=selectedParts[0],system=SYSTEMS.find(s=>s.id===selected?.system);
 const visibleCount=atlas?.parts.filter(p=>state.context?.length?state.context.includes(p.id):state.isolate?state.selected.includes(p.id):state.scope?state.scope.includes(p.id):state.visible.includes(p.system)||state.selected.includes(p.id)).length??0;
 const courseTerms=useMemo(()=>new Map(course?.concepts.map(term=>[term.id,term])),[course]);
 const courseTerm=activeLink.mode==='course'?(activeLink.structureId?courseTerms.get(activeLink.structureId):activeLink.meshId?course?.concepts.find(term=>term.elements.includes(activeLink.meshId!)):undefined):undefined;
 const courseSelection=course?.selections.find(selection=>selection.id===activeLink.selectionId)??(courseTerm?course?.selections.find(selection=>selection.conceptIds.includes(courseTerm.id)):undefined);
 const objective=course?.unmappedObjectives.find(item=>item.id===activeLink.objectiveId);
 const results=useMemo(()=>{
  if(!atlas)return[];
  const normalize=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const queryText=normalize(query).trim(),scope=new Set(publicRegion?.elements??courseSelection?.region?.elements??courseSelection?.elements??[]);
  const inRegion=(c:Concept)=>c.elements.length>0&&c.elements.every(id=>scope.has(id));
  const shown=new Set(state.scope??[]),inView=(c:Concept)=>c.elements.some(id=>shown.has(id));
  if(!queryText&&!regional)return ['heart','brain','liver','stomach','spleen','pancreas','urinary bladder','trachea'].map(name=>atlas.concepts.find(c=>c.name.toLowerCase()===name)).filter((x):x is Concept=>!!x);
  return atlas.concepts.filter(c=>{
   if(!queryText)return inRegion(c);
   const alias=courseTerms.get(c.id);
   return normalize([c.name,c.id,alias?.labels.sl,alias?.labels.la].filter(Boolean).join(' ')).includes(queryText);
  }).sort((a,b)=>Number(regional&&inRegion(b))-Number(regional&&inRegion(a))||Number(regional&&inView(b))-Number(regional&&inView(a))||Number(courseMode&&courseTerms.has(b.id))-Number(courseMode&&courseTerms.has(a.id))||a.name.length-b.name.length).slice(0,80);
 },[atlas,query,courseMode,regional,publicRegion,courseSelection,courseTerms,state.scope]);
 const invalidateLink=useCallback((message:string)=>{const neutral:AtlasLink={mode:'explorer'};currentLink.current=neutral;setActiveLink(neutral);setSceneReady(false);setRouteLoading(false);setLinkError(message);setChosen(null);setDetails(false);setPanel(null);setState(s=>({...initial,visible:DEFAULT_VISIBLE,reset:s.reset+1}));},[]);
 const applyLink=useCallback((request:AtlasLink,preserveExplorerView=false):AtlasLink|null=>{
  if(!atlas)return null;
  try{
   const next={...request},before=currentLink.current;
   if(next.mode==='course'&&course&&!next.selectionId&&!next.structureId&&!next.meshId&&!next.objectiveId)next.selectionId=course.selections[0].id;
   const resolved=resolveAtlasLink(next,atlas,course);
   if(resolved.selectionId)next.selectionId=resolved.selectionId;
   const sameRegion=before.mode===next.mode&&((next.mode==='course'&&before.selectionId===next.selectionId&&!before.objectiveId&&!next.objectiveId)||(next.mode==='region'&&before.regionId===next.regionId));
   const preserve=preserveExplorerView&&((before.mode==='explorer'&&next.mode==='explorer')||sameRegion);
   if(preserve){
    next.view=next.view??sceneState.current.view;
   }
   const target=!!(next.structureId||next.meshId);
   const selected=next.mode!=='explorer'&&!target&&!next.isolate?[]:resolved.elements;
   const part=next.meshId?atlas.parts.find(p=>p.id===next.meshId):undefined;
   const concept=next.structureId?atlas.concepts.find(c=>c.id===next.structureId):undefined;
   const selection=course?.selections.find(s=>s.id===next.selectionId);
   setChosen(next.objectiveId?null:part?{id:concept?.id??part.conceptId,name:part.name,elements:selected}:concept?{...concept,elements:selected}:selection?{id:selection.id,name:selection.region?.label??selection.label,elements:selected}:null);
   setState(s=>({...s,selected,scope:resolved.scopeElements??(next.objectiveId?[]:undefined),context:resolved.contextElements,visible:next.mode!=='explorer'?['skeletal']:before.mode==='explorer'?s.visible:DEFAULT_VISIBLE,isolate:next.objectiveId?false:next.isolate??false,explode:preserve?s.explode:0,rotate:false,view:next.view??'three-quarter',reset:preserve?s.reset:s.reset+1}));
   const route:AtlasLink={...next,...(resolved.side?{side:resolved.side}:{}),...(resolved.layer?{layer:resolved.layer}:{})};
   currentLink.current=route;setActiveLink(route);setDetails(open=>next.mode!=='explorer'?(sameRegion&&open)||!!next.objectiveId:target);setPanel(null);setLinkError('');setSelectionError('');setExplorerTarget(null);setRouteLoading(false);setSceneReady(true);return route;
  }catch(e){invalidateLink(e instanceof Error?e.message:'This atlas link is unavailable.');return null;}
 },[atlas,course,invalidateLink]);
 const navigate=useCallback((next:AtlasLink,replace=false,preserveExplorerView=false)=>{const resolved=applyLink(next,preserveExplorerView);if(!resolved)return;const hash=serializeAtlasLink(resolved);history[replace||location.hash===hash?'replaceState':'pushState'](null,'',`${location.pathname}${location.search}${hash}`);appliedHash.current=hash;},[applyLink]);
 useEffect(()=>{
  const sync=()=>{
   if(appliedHash.current===location.hash)return;
   try{
    const route=resolveAtlasRoute(location.hash,atlas,course,privateCourse.status);
    if(route.status==='chooser'){setSceneReady(false);setRouteLoading(false);setLinkError('');setDetails(false);setPanel(null);setChosen(null);appliedHash.current=location.hash;return;}
    if(route.status==='pending'){setSceneReady(false);setRouteLoading(true);return;}
    applyLink(route.request);appliedHash.current=location.hash;
   }catch(e){invalidateLink(e instanceof Error?e.message:'Invalid atlas link.');appliedHash.current=location.hash;}
  };
  sync();window.addEventListener('hashchange',sync);window.addEventListener('popstate',sync);return()=>{window.removeEventListener('hashchange',sync);window.removeEventListener('popstate',sync);};
 },[atlas,course,privateCourse.status,applyLink,invalidateLink]);
 useEffect(()=>{document.documentElement.lang=sceneReady&&courseMode?'sl':'en';document.title=sceneReady&&courseMode?`${objective?.shortLabel??objective?.labels.sl??courseTerm?.labels.sl??(courseSelection?.region?.label??courseSelection?.label)??'UNI'} · Human Atlas`:sceneReady&&publicRegion?`${publicRegion.label} · Human Atlas`:'Human Atlas';},[sceneReady,courseMode,courseTerm,courseSelection,objective,publicRegion]);
 const selectCourse=(selection:CourseSelection)=>{if(course)navigate({mode:'course',courseId:course.courseId,selectionId:selection.id,side:selection.id===activeLink.selectionId?activeLink.side:undefined,layer:selection.id===activeLink.selectionId?activeLink.layer:undefined});};
 const selectObjective=(item:UnmappedObjective)=>{if(course)navigate({mode:'course',courseId:course.courseId,objectiveId:item.id});};
 const choose=useCallback((c:Concept,meshId?:string)=>{
  const ids=meshId?[meshId]:c.elements;
  const contains=(selection:CourseSelection)=>ids.every(id=>(selection.region?.elements??selection.elements).includes(id));
  const candidate=courseSelection&&contains(courseSelection)?courseSelection:course?.selections.find(contains);
  if(courseMode&&course&&candidate){
   const same=candidate.id===activeLink.selectionId;
   let side=same?activeLink.side:candidate.region?.defaultSide,layer=same?activeLink.layer:candidate.region?.defaultLayer;
   if(candidate.region){
    const raw=candidate.region.elements;
    if(hasSourceSideConflict(ids))side='both';
    // Searching the other side/layer changes that filter deliberately, never isolates the target.
    if(!regionElements(atlas!,raw,side??'both','all').some(id=>ids.includes(id))){
     const sides=new Set(atlas!.parts.filter(p=>ids.includes(p.id)).map(partSide).filter(Boolean));
     side=sides.size===1?[...sides][0]??'both':'both';
    }
    if(!regionElements(atlas!,raw,side??'both',layer??'all').some(id=>ids.includes(id)))
     layer=regionElements(atlas!,raw,side??'both','muscles').some(id=>ids.includes(id))?'muscles':'all';
   }
   navigate({mode:'course',courseId:course.courseId,selectionId:candidate.id,structureId:c.id,meshId,side,layer,isolate:false},false,true);
  }else if(atlas){try{navigate(publicTargetLink(atlas,{structureId:c.id,meshId},sceneReady?currentLink.current:undefined),false,true);}catch(e){setPanel(null);setSelectionError(e instanceof Error?e.message:'This structure cannot be opened in a region.');setExplorerTarget({mode:'explorer',structureId:c.id,meshId,isolate:false});}}
 },[atlas,sceneReady,courseMode,course,courseSelection,activeLink.selectionId,activeLink.side,activeLink.layer,navigate]);
 const selectTerm=(term:CourseConcept)=>choose(term);
 useEffect(()=>{if(!atlas)return;return registerAtlasTools(atlas,c=>flushSync(()=>{choose(c);setDetails(true);}));},[atlas,choose]);
 const choosePart=(id:string)=>{
  const part=parts.get(id);if(!part||!atlas)return;
  const taught=courseMode?course?.concepts.find(term=>term.elements.includes(id)):undefined;
  const concept=taught??atlas.concepts.find(item=>item.id===part.conceptId);
  if(concept)choose(concept,id);
 };
 const clearRoute=()=>{const next:AtlasLink={mode:'explorer'};currentLink.current=next;setActiveLink(next);setChosen(null);setDetails(false);setLinkError('');const hash=serializeAtlasLink(next);history.replaceState(null,'',`${location.pathname}${location.search}${hash}`);appliedHash.current=hash;};
 const setLayers=(visible:SystemId[])=>{clearRoute();setState(s=>({...s,selected:[],scope:undefined,context:undefined,isolate:false,visible}));};
 const toggle=(id:SystemId)=>setLayers(state.visible.includes(id)?state.visible.filter(x=>x!==id):[...state.visible,id]);
 const reset=()=>{if(publicRegion){navigate({mode:'region',regionId:publicRegion.id,side:activeLink.side,layer:activeLink.layer,view:'three-quarter'},true);}else if(courseMode){navigate({mode:'course',courseId:course!.courseId,selectionId:courseSelection?.id??course?.selections.find(s=>s.id===objective?.contextSelectionId)?.id,side:activeLink.side,layer:activeLink.layer,view:'three-quarter'},true);}else{clearRoute();setState(s=>({...initial,visible:DEFAULT_VISIBLE,reset:s.reset+1}));setPanel(null);}};
 const openPanel=(next:'layers'|'search'|'course'|'regions')=>{setDetails(false);setPanel(p=>p===next?null:next);};
 const patchSceneLink=(patch:Partial<AtlasLink>)=>{const next={...currentLink.current,...patch};const hash=serializeAtlasLink(next);currentLink.current=next;setActiveLink(next);history.replaceState(null,'',`${location.pathname}${location.search}${hash}`);appliedHash.current=hash;};
 const changeRegionView=(patch:{side?:StudySide;layer?:StudyLayer})=>{if(publicRegion)navigate({mode:'region',regionId:publicRegion.id,side:activeLink.side,layer:activeLink.layer,...patch,view:state.view});else if(course&&courseSelection)navigate({mode:'course',courseId:course.courseId,selectionId:courseSelection.id,side:activeLink.side,layer:activeLink.layer,...patch,view:state.view});};
 const isolate=()=>{const next=!state.isolate;setState(s=>({...s,isolate:next,context:undefined,explode:0}));patchSceneLink({isolate:next});};
 const changeView=(view:View)=>{setState(s=>({...s,view,reset:s.reset+1,rotate:false}));patchSceneLink({view});};
 const home=()=>{history.pushState(null,'',`${location.pathname}${location.search}`);appliedHash.current='';setSceneReady(false);setRouteLoading(false);setLinkError('');setDetails(false);setPanel(null);};
 const regionTitle=courseSelection?.region?.label??courseSelection?.label??publicRegion?.label;
 if(!sceneReady)return <RegionChooser regions={regions} course={course} loading={!atlas&&!error} error={linkError||error} pending={routeLoading} courseStatus={privateCourse.status} onNavigate={next=>{if(!atlas)return;navigate(next);}}/>;
 return <main className={`studio ${courseMode?'course-mode':''} ${regional?'regional-mode':''}`} data-mode={courseMode?'course':publicRegion?'region':'explorer'} data-region={publicRegion?.id??''} data-selected-count={state.selected.length} data-context-count={state.context?.length??0} data-active-structure={activeLink.structureId??''} data-scope-count={state.scope?.length??0} data-isolate={String(state.isolate)} data-camera-reset={state.reset}>
  {atlas&&<Suspense fallback={null}><AnatomyScene atlas={atlas} state={{...state,inspectorOpen:details&&(regional||selectedParts.length>0||!!objective)}} onSelect={choosePart} onProgress={n=>{setProgress(n);if(n===100)setError('');}} onError={setError}/></Suspense>}
  <div className="vignette"/>
  <header className="studio-header identity"><Button variant="ghost" className="brand" onClick={home}>Human Atlas <small>3D</small></Button><span className="header-divider"/><h1 className="current-view">{courseMode?'UNI · '+(regionTitle??'Fizioterapija'):publicRegion?.label??'Full Body Explorer'}</h1><nav className="top-actions" aria-label="Atlas controls"><Button variant="ghost" onClick={()=>openPanel(regional?(courseMode?'course':'regions'):'layers')} aria-expanded={panel===(regional?(courseMode?'course':'regions'):'layers')}><Layers3 size={16}/><span>{courseMode?'Predeli':publicRegion?'Regions':'Systems'}</span></Button><Button variant="ghost" className={panel==='search'?'active':''} onClick={()=>openPanel('search')} aria-label={courseMode?'Poišči strukturo':'Search anatomy'}><Search size={17}/><span>{courseMode?'Poišči':'Search'}</span><kbd>/</kbd></Button><Button variant="ghost" className="icon-button" aria-label="Source and credits" onClick={()=>{setDetails(false);setPanel(null);setAbout(true);}}><Info size={17}/></Button></nav></header>
  <div className="scene-state" role="status"><span className="state-region">{regionTitle??'Full Body Explorer'}</span><i className="state-region"/><span>{state.isolate?(courseMode?'Samo izbrano':'Isolated'):state.context?.length?(courseMode?'Okolica · cilj ni označen':'Context'):courseMode?(objective?'Cilj ni preslikan v 3D':'Sestavljen predel'):regional?'Regional assembly':'Full body'}</span>{regional&&!objective&&<><i/>{activeLink.side==='right'?(courseMode?'Desno':'Right'):activeLink.side==='left'?(courseMode?'Levo':'Left'):(courseMode?'Obe strani':'Both sides')}<i/>{activeLink.layer==='all'?(courseMode?'Vse plasti':'All layers'):activeLink.layer==='muscles'?(courseMode?'Kosti in mišice':'Bones + muscles'):(courseMode?'Kosti':'Bones')}</>}{state.selected.length>0&&<><i/><strong>{courseTerm?.labels.sl??chosen?.name}</strong></>}</div>
  {selectionError&&<div className="selection-notice" role="alert"><span>{selectionError}</span>{explorerTarget&&<Button variant="outline" onClick={()=>navigate(explorerTarget)}>Open in Explorer</Button>}<Button variant="ghost" onClick={()=>setSelectionError('')} aria-label="Dismiss selection notice"><X size={14}/></Button></div>}
  {publicRegion&&<RegionPanel regions={regions} activeId={publicRegion.id} mobileOpen={panel==='regions'} onClose={()=>setPanel(null)} onNavigate={navigate}/>}
  {courseMode&&course&&<CoursePanel course={course} selectionId={courseSelection?.id} objectiveId={objective?.id} mobileOpen={panel==='course'} onClose={()=>setPanel(null)} onSelection={selectCourse} onObjective={selectObjective}/>}
  {!regional&&<section className={`layers-panel glass ${panel==='layers'?'mobile-open':''}`} aria-label="Anatomical layers">
   <div className="panel-heading"><span>Systems</span><Button variant="ghost" className="mobile-only icon-button" onClick={()=>setPanel(null)} aria-label="Close systems"><X size={18}/></Button><Badge variant="secondary" className="desktop-only small-number">{activeSystems.length}</Badge></div>
   <div className="layer-presets"><Button variant="ghost" aria-pressed={activeSystems.every(x=>state.visible.includes(x.id))} onClick={()=>setLayers(activeSystems.map(x=>x.id))}>All</Button><Button variant="ghost" aria-pressed={state.visible.length===1&&state.visible[0]==='skeletal'} onClick={()=>setLayers(['skeletal'])}>Skeleton</Button><Button variant="ghost" aria-pressed={state.visible.length===6&&['cardiac','respiratory','digestive','urinary','endocrine','reproductive'].every(id=>state.visible.includes(id as SystemId))} onClick={()=>setLayers(['cardiac','respiratory','digestive','urinary','endocrine','reproductive'])}>Organs</Button></div>
   <div className="system-list">{activeSystems.map(s=><div className={`system-row ${state.visible.includes(s.id)?'enabled':''}`} key={s.id}><Button variant="ghost" className="system-name" title={`Show only ${s.name.toLowerCase()}`} onClick={()=>setLayers([s.id])}><span className="system-dot" style={{background:s.color}}/>{s.name}<span className="system-count">{counts[s.id]}</span></Button><Switch checked={state.visible.includes(s.id)} onCheckedChange={()=>toggle(s.id)} aria-label={`Show ${s.name.toLowerCase()}`} /></div>)}</div>
   <div className="panel-foot"><span>{visibleCount.toLocaleString()} pieces visible</span><Button variant="ghost" onClick={()=>setLayers([])}>Hide all</Button></div>
  </section>}
  {panel==='search'&&<section className="search-panel glass" aria-label="Find anatomy"><div className="panel-heading"><span>{courseMode?'Poišči strukturo':'Find a structure'}</span><Button variant="ghost" className="icon-button" onClick={()=>setPanel(null)} aria-label="Close search"><X size={18}/></Button></div><Combobox<Concept> items={results} value={null} onValueChange={value=>{if(value)choose(value);}} inputValue={query} onInputValueChange={setQuery} itemToStringLabel={c=>c.name} filter={null} open onOpenChange={open=>{if(!open)setPanel(null);}}><ComboboxInput autoFocus placeholder={courseMode?'Slovensko, latinsko, English…':'Heart, femur, cranial nerve…'} aria-label="Search named anatomical structures" showTrigger={false}/><ComboboxContent className="anatomy-search-results"><ComboboxEmpty>{courseMode?'Ni zadetkov.':'No structures match your search.'}</ComboboxEmpty><ComboboxList>{(c:Concept)=><ComboboxItem key={c.id} value={c}><span className="search-result-name">{courseMode&&courseTerms.has(c.id)?<><strong>{courseTerms.get(c.id)!.labels.sl}</strong><small>{courseTerms.get(c.id)!.labels.la} · {c.name}</small></>:c.name}</span><span className="small-number">{c.elements.length} {c.elements.length===1?'piece':'pieces'}</span></ComboboxItem>}</ComboboxList></ComboboxContent></Combobox><p className="search-note">{courseMode?'Najprej predel, nato celoten atlas.':query?'Showing up to 80 matches. Refine your search to find smaller structures.':'Start with a major organ, or search every named structure.'}</p></section>}
  <nav className="view-controls glass" aria-label="Camera controls">{(['three-quarter','front','side','back'] as View[]).map((v,i)=><Button variant="ghost" key={v} className={state.view===v?'active':''} aria-pressed={state.view===v} disabled={state.explode>.8&&v!=='front'} onClick={()=>changeView(v)} title={`${v} view`} aria-label={`${v} view`}><span>{['¾','F','S','B'][i]}</span></Button>)}<i/><Button variant="ghost" disabled={state.explode>=.4||state.isolate||!!state.context?.length} aria-label={state.rotate?'Pause rotation':'Rotate body'} title="Auto rotate" className={state.rotate?'active':''} onClick={()=>setState(s=>({...s,rotate:!s.rotate}))}>{state.rotate?<Pause size={17}/>:<RotateCw size={18}/>}</Button><Button variant="ghost" aria-label="Reset view and layers" title="Reset" onClick={reset}><RotateCcw size={17}/></Button></nav>
  <div className={`bottom-dock glass ${courseMode?'course-dock':''}`}>
   {regional&&<Button variant="ghost" className="dock-current" onClick={()=>{setPanel(null);setDetails(value=>!value);}} aria-expanded={details}><span>{courseMode?'Strukture':'Structures'}</span><small>{state.scope?.length??0} <ChevronRight size={12}/></small></Button>}
   {regional&&!objective&&<RegionControls side={activeLink.side} layer={activeLink.layer} onChange={changeRegionView} sl={courseMode}/>}
   <div className="explode-control"><div className="explode-label"><label id="explode-label">{courseMode?'Razmak':'Explode'}</label><output>{Math.round(state.explode*100)}%</output></div><Slider aria-labelledby="explode-label" min={0} max={100} step={1} value={[state.explode*100]} disabled={state.isolate||!!objective} onValueChange={v=>setState(s=>({...s,explode:(Array.isArray(v)?v[0]:v)/100,view:(Array.isArray(v)?v[0]:v)>80?'front':s.view,rotate:false}))}/></div>
   {state.selected.length>0&&<Button variant="ghost" className="dock-isolate" aria-pressed={state.isolate} onClick={isolate}><Focus size={16}/><span>{state.isolate?(courseMode?'Predel':'Assembly'):(courseMode?'Samo izbrano':'Isolate')}</span></Button>}
   <CopySceneLink sl={courseMode}/>
  </div>
  <footer className="studio-footer"><span>{state.explode>.8?'Drag to pan':'Drag to orbit'} <b>·</b> Pinch to zoom <b>·</b> Tap to inspect</span><Button variant="ghost" onClick={()=>{setDetails(false);setPanel(null);setAbout(true);}}>Source & credits <ArrowUpRight size={12}/></Button></footer>
  {progress<100&&!error&&<div className="loading glass" role="status"><Activity size={18}/><div><strong>{courseMode?'Priprava predela':'Preparing anatomy'}</strong><span>{progress}% · {state.scope?.length??state.context?.length??atlas?.parts.length??0} pieces</span><div className="loading-track"><i style={{width:`${progress}%`}}/></div></div></div>}
  {error&&<div className="loading glass error" role="alert"><p>{error}</p><Button variant="ghost" onClick={()=>location.reload()}>Reload viewer</Button></div>}
  <Sheet open={!regional&&details&&selectedParts.length>0} modal={false} disablePointerDismissal onOpenChange={setDetails}><SheetContent initialFocus={detailTitle} className={`detail-sheet glass ${state.isolate?'is-isolated':''}`} showCloseButton={true}><div className="detail-header"><div className="detail-accent" style={{background:system?.color}}/><div className="eyebrow">{system?.name??'ANATOMY'}</div><SheetTitle ref={detailTitle} tabIndex={-1} className="structure-title">{chosen?.name}</SheetTitle></div><div className="detail-scroll" key={`${chosen?.id}-${state.isolate}`}><details className="structure-explanation"><summary>About this structure</summary><SheetDescription className="structure-description">{chosen&&selected?explanation(chosen.name,selected.system):''}</SheetDescription></details>{chosen&&!EXPLANATIONS[chosen.name.toLowerCase()]&&<span className="context-note">System overview · structure identified from source anatomy</span>}<div className="structure-meta"><span>Atlas reference<strong>{chosen?.id}</strong></span><span>Selected pieces<strong>{state.selected.length.toLocaleString()}</strong></span></div>{selectedParts.length>1&&<div className="member-list"><h3>Included structures</h3>{selectedParts.slice(0,50).map(p=><Button variant="ghost" key={p.id} onClick={()=>choosePart(p.id)}><span>{p.name}</span><ChevronRight size={14}/></Button>)}{selectedParts.length>50&&<p>And {selectedParts.length-50} more modeled pieces.</p>}</div>}<a className="source-link" href="https://lifesciencedb.jp/bp3d/" target="_blank" rel="noreferrer">View anatomical source <ArrowUpRight size={14}/></a></div><div className="detail-actions"><Button className={`primary-action ${state.isolate?'active':''}`} onClick={isolate}><Focus size={18}/>{state.isolate?'Show surrounding anatomy':'Isolate structure'}<ChevronRight size={16}/></Button><Button variant="ghost" className="secondary-action" onClick={()=>{clearRoute();setState(s=>({...s,selected:[],context:undefined,isolate:false}));}}>Clear selection</Button><CopySceneLink/></div></SheetContent></Sheet>
  {publicRegion&&<RegionInspector region={publicRegion} parts={parts} scope={state.scope??[]} selectedIds={state.selected} selectedName={chosen?.name} side={activeLink.side} layer={activeLink.layer} isolate={state.isolate} open={details} onOpenChange={setDetails} onView={changeRegionView} onPart={choosePart} onIsolate={isolate} onClear={()=>navigate({mode:'region',regionId:publicRegion.id,side:activeLink.side,layer:activeLink.layer,view:state.view},false,true)}/>}
  {courseMode&&course&&runtime&&<CourseInspector course={course} links={runtime.links} scopeElements={state.scope} selectedIds={state.selected} target={activeLink.structureId||activeLink.meshId?chosen??undefined:undefined} side={activeLink.side} layer={activeLink.layer} onRegionView={changeRegionView} selection={courseSelection} term={courseTerm} objective={objective} mesh={activeLink.meshId?parts.get(activeLink.meshId):undefined} parts={parts} open={details} isolate={state.isolate} context={!!state.context?.length} onOpenChange={setDetails} onTerm={selectTerm} onPart={choosePart} onSelection={selectCourse} onContext={()=>navigate({...activeLink,context:!activeLink.context})} onIsolate={isolate}/>}
  <Sheet open={about} onOpenChange={setAbout}><SheetContent className="about-sheet glass"><div className="eyebrow">SOURCE & SCOPE</div><SheetTitle className="structure-title">Source & credits</SheetTitle><SheetDescription>Explore the adult male reference anatomy from BodyParts3D.</SheetDescription><div className="about-copy"><p><strong>Male · BodyParts3D</strong><br/>2,234 individual meshes and 3,432 named concepts from an adult male reference anatomy.</p><p>This reference does not contain every human structure or variation. Named concepts can contain multiple pieces; each source mesh is rendered once.</p><p>Colors and system groupings are designed for exploration. The geometry is simplified for the web, and short explanations provide general educational context. This is an anatomical reference, not a diagnostic or surgical tool.</p><h3>Source</h3><p>BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International.</p><a href="https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html" target="_blank" rel="noreferrer">Dataset license <ArrowUpRight size={14}/></a><a href="https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html" target="_blank" rel="noreferrer">Original geometry & metadata <ArrowUpRight size={14}/></a><a href="https://academic.oup.com/nar/article/37/suppl_1/D782/1000752" target="_blank" rel="noreferrer">Read the source publication <ArrowUpRight size={14}/></a></div></SheetContent></Sheet>
 </main>;
}
