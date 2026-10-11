import {useEffect, useRef} from 'react';
import {ArrowRight, BookOpen, ChevronRight, Focus, X} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Sheet, SheetContent, SheetTitle, SheetDescription} from '@/components/ui/sheet';
import type {Part} from './anatomy';
import type {CourseOverlay} from './course';
import type {AtlasLink} from './course-navigation';
import {serializeAtlasLink} from './course-navigation';
export {RegionControls} from './region-controls';
import {RegionControls} from './region-controls';
import {CopySceneLink} from './course-ui';
import {hasSourceSideConflict, type StudyLayer, type StudySide} from './study-region';

type Region = {id:string; label:string; elements:string[]};
const MAIN_REGIONS=['head','neck','thorax','abdomen','pelvis','back'];
const UPPER_REGIONS=['shoulder','arm','forearm','hand'];
const LOWER_REGIONS=['thigh','leg','foot'];
const UPPER_DETAILS=['elbow','wrist','upper-limb'];
const LOWER_DETAILS=['hip','knee','ankle','lower-limb'];
const regionLink=(regionId:string):AtlasLink=>({mode:'region',regionId,side:'both'});
const inOrder=(regions:Region[],ids:string[])=>ids.flatMap(id=>regions.filter(region=>region.id===id));
function RegionLinks({regions,onNavigate}: {regions:Region[];onNavigate:(link:AtlasLink)=>void}) {
  return <nav>{regions.map(region=><a key={region.id} href={serializeAtlasLink(regionLink(region.id))} onClick={event=>{event.preventDefault();onNavigate(regionLink(region.id));}}>{region.label}<ChevronRight size={14}/></a>)}</nav>;
}

export function RegionChooser({regions, course, loading, error, pending, courseStatus, onNavigate}: {
  regions:Region[]; course:CourseOverlay|null; loading:boolean; error:string; pending:boolean;
  courseStatus:string; onNavigate:(link:AtlasLink)=>void;
}) {
  return <main className="region-home" data-mode="chooser">
    <header className="home-header"><span className="brand">Human Atlas <small>3D</small></span><span>BodyParts3D</span></header>
    <div className="home-content">
      <div className="home-intro"><h1>Choose a region</h1></div>
      {error && <div className="route-notice" role="alert"><strong>This view could not be opened.</strong><span>{error}</span></div>}
      {pending&&<p className="catalogue-status" role="status">Resolving this view…</p>}
      {loading ? <p className="catalogue-status" role="status">Loading anatomy catalogue…</p> : <>
        <nav className="region-grid" aria-label="Head and trunk">{inOrder(regions,MAIN_REGIONS).map((region,index)=><a key={region.id} href={serializeAtlasLink(regionLink(region.id))} onClick={event=>{event.preventDefault();onNavigate(regionLink(region.id));}}><span className="region-number">{String(index+1).padStart(2,'0')}</span><strong>{region.label}</strong><ArrowRight size={20}/></a>)}</nav>
        <div className="limb-groups">{[{label:'Upper limb',base:UPPER_REGIONS,extra:UPPER_DETAILS},{label:'Lower limb',base:LOWER_REGIONS,extra:LOWER_DETAILS}].map(group=><section key={group.label}><h2>{group.label}</h2><RegionLinks regions={inOrder(regions,group.base)} onNavigate={onNavigate}/><details><summary>Joints & whole limb</summary><RegionLinks regions={inOrder(regions,group.extra)} onNavigate={onNavigate}/></details></section>)}</div>
        <div className="surface-entry"><RegionLinks regions={regions.filter(region=>![...MAIN_REGIONS,...UPPER_REGIONS,...LOWER_REGIONS,...UPPER_DETAILS,...LOWER_DETAILS].includes(region.id))} onNavigate={onNavigate}/></div>
      </>}
      {course && <section className="home-course" lang="sl"><div><BookOpen size={16}/><h2>UNI · Fizioterapija</h2><span>{course.selections.length} izborov</span></div><nav aria-label="Študijski izbori">{course.selections.map(selection=><a key={selection.id} href={serializeAtlasLink({mode:'course',courseId:course.courseId,selectionId:selection.id})} onClick={event=>{event.preventDefault();onNavigate({mode:'course',courseId:course.courseId,selectionId:selection.id});}}>{selection.region?.label??selection.label}<ChevronRight size={14}/></a>)}</nav></section>}
      {courseStatus==='error' && <p className="catalogue-status" role="status">UNI gradiva ni bilo mogoče preveriti. <button onClick={()=>location.reload()}>Ponovno naloži</button></p>}
      <div className="explorer-entry"><div><strong>Full Body Explorer</strong><span>All regions and systems.</span></div><a href="#explorer=1" onClick={event=>{event.preventDefault();onNavigate({mode:'explorer'});}}>Open explorer <ArrowRight size={16}/></a></div>
    </div>
    <footer className="home-footer">Adult male reference · BodyParts3D / DBCLS · CC BY 4.0</footer>
  </main>;
}

export function RegionPanel({regions, activeId, mobileOpen, onClose, onNavigate}: {regions:Region[];activeId?:string;mobileOpen:boolean;onClose:()=>void;onNavigate:(link:AtlasLink)=>void}) {
  const rows=(ids:string[])=><nav className="course-selection-list">{inOrder(regions,ids).map(region=><Button key={region.id} variant="ghost" aria-pressed={activeId===region.id} onClick={()=>onNavigate(regionLink(region.id))}><span>{region.label}</span><ChevronRight size={14}/></Button>)}</nav>;
  return <section className={`region-panel glass ${mobileOpen?'mobile-open':''}`} aria-label="Regions"><div className="panel-heading"><span>Regions</span><Button className="icon-button" variant="ghost" onClick={onClose} aria-label="Close regions"><X size={18}/></Button></div>{rows(MAIN_REGIONS)}{[{label:'Upper limb',ids:[...UPPER_REGIONS,...UPPER_DETAILS]},{label:'Lower limb',ids:[...LOWER_REGIONS,...LOWER_DETAILS]}].map(group=><details key={group.label} open={group.ids.includes(activeId??'')?true:undefined}><summary>{group.label}</summary>{rows(group.ids)}</details>)}{rows(regions.map(region=>region.id).filter(id=>![...MAIN_REGIONS,...UPPER_REGIONS,...LOWER_REGIONS,...UPPER_DETAILS,...LOWER_DETAILS].includes(id)))}</section>;
}

export function RegionInspector({region, parts, scope, selectedIds, selectedName, side, layer, isolate, open, onOpenChange, onView, onPart, onIsolate, onClear}: {
  region:Region;parts:Map<string,Part>;scope:string[];selectedIds:string[];selectedName?:string;side?:StudySide;layer?:StudyLayer;isolate:boolean;open:boolean;
  onOpenChange:(open:boolean)=>void;onView:(patch:{side?:StudySide;layer?:StudyLayer})=>void;onPart:(id:string)=>void;onIsolate:()=>void;onClear:()=>void;
}) {
  const heading=useRef<HTMLHeadingElement>(null),list=useRef<HTMLOListElement>(null);
  const selected=new Set(selectedIds), rows=scope.map(id=>parts.get(id)).filter((part):part is Part=>!!part).sort((a,b)=>a.name.localeCompare(b.name,'en',{numeric:true}));
  useEffect(()=>{list.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView({block:'nearest'});},[selectedIds,open]);
  return <Sheet open={open} modal={false} disablePointerDismissal onOpenChange={onOpenChange}><SheetContent initialFocus={heading} className="detail-sheet region-detail glass"><div className="detail-header"><span className="eyebrow">STRUCTURES</span><SheetTitle ref={heading} tabIndex={-1} className="structure-title">{region.label}</SheetTitle></div><RegionControls side={side} layer={layer} onChange={onView}/><SheetDescription className="sr-only">Select a structure to highlight it in the regional assembly.</SheetDescription><div className="region-selection" role="status"><strong>{selectedName??`${rows.length} structures`}</strong><span>{isolate?'Isolated':selectedName?'Highlighted in assembly':'Regional assembly'}</span>{hasSourceSideConflict(selectedIds)&&<small>Source side label conflicts with mesh position; both sides are shown.</small>}</div><div className="detail-scroll"><ol className="course-terms" ref={list} aria-label="Structures in region">{rows.map((part,index)=><li key={part.id}><Button variant="ghost" data-mesh={part.id} aria-pressed={selected.has(part.id)} onClick={()=>onPart(part.id)}><span className="course-index">{index+1}</span><span className="course-term-name"><strong>{part.name}</strong></span></Button></li>)}</ol></div><div className="detail-actions"><div className="region-actions">{selectedIds.length>0&&<><Button variant="outline" aria-pressed={isolate} onClick={onIsolate}><Focus size={16}/>{isolate?'Show assembly':'Isolate'}</Button><Button variant="ghost" onClick={onClear} aria-label="Clear highlight"><X size={16}/></Button></>}</div><CopySceneLink/></div></SheetContent></Sheet>;
}
