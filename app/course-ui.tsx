import {useEffect, useRef, useState} from 'react';
import {ArrowUpRight, BookOpen, ChevronRight, Focus, Link2, X} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Badge} from '@/components/ui/badge';
import {Sheet, SheetContent, SheetTitle, SheetDescription} from '@/components/ui/sheet';
import type {Part, Concept} from './anatomy';
import {partSide, type StudySide, type StudyLayer} from './study-region';
import type {CourseOverlay, CourseLinks, CourseConcept, CourseSelection, UnmappedObjective, Evidence, Laterality} from './course';
import {obsidianUrl, spaceoSourceUrl} from './course-navigation';

const SIDES: Record<Laterality, string> = {right: 'Desno', left: 'Levo', bilateral: 'Obe strani', midline: 'Sredinska'};
const EVIDENCE: Record<Evidence, string> = {'course-material': 'Učno gradivo', 'student-reported-emphasis': 'Poudarek · zapis študenta', bonus: 'Dodatno · bonus'};

export function CopySceneLink({sl = false}: {sl?: boolean}) {
  const [copied, setCopied] = useState(false), [reveal, setReveal] = useState(false);
  const copy = async () => {
    try {await navigator.clipboard.writeText(location.href); setCopied(true); setTimeout(() => setCopied(false), 2200);}
    catch {setReveal(true);}
  };
  return <div className="scene-link-control">
    <Button variant="ghost" onClick={copy} aria-label={sl ? 'Kopiraj povezavo do trenutnega izbora' : 'Copy a link to this selection'}><Link2 size={15}/>{copied ? (sl ? 'Kopirano' : 'Copied') : (sl ? 'Povezava' : 'Copy link')}</Button>
    <span role="status" className="sr-only">{copied ? (sl ? 'Povezava je kopirana.' : 'Link copied.') : ''}</span>
    {reveal && <label className="copy-fallback">{sl ? 'Kopiraj naslov' : 'Copy this address'}<input autoFocus readOnly value={location.href} onFocus={event => event.currentTarget.select()} onBlur={() => setReveal(false)} onKeyDown={event => {if (event.key === 'Escape') {event.stopPropagation(); setReveal(false);}}}/></label>}
  </div>;
}

export function CoursePanel({course, selectionId, objectiveId, mobileOpen, onClose, onSelection, onObjective}: {
  course: CourseOverlay; selectionId?: string; objectiveId?: string; mobileOpen: boolean;
  onClose: () => void; onSelection: (selection: CourseSelection) => void; onObjective: (objective: UnmappedObjective) => void;
}) {
  return <section className={`course-panel glass ${mobileOpen ? 'mobile-open' : ''}`} aria-label="Predeli" lang="sl">
    <div className="panel-heading"><span><BookOpen size={16}/> Predeli</span><Badge variant="secondary">{course.selections.length}</Badge><Button variant="ghost" className="course-mobile-close icon-button" onClick={onClose} aria-label="Zapri izbore"><X size={18}/></Button></div>
    <div className="course-panel-scroll">
      <nav className="course-selection-list" aria-label="Anatomski izbori">{course.selections.map((selection, index) => <Button variant="ghost" key={selection.id} aria-pressed={selectionId === selection.id && !objectiveId} onClick={() => onSelection(selection)}>
        <span className="course-index">{String(index + 1).padStart(2, '0')}</span><span>{selection.label}</span><ChevronRight size={14}/>
      </Button>)}</nav>
      {course.unmappedObjectives.length > 0 && <details className="unmapped-list" open={objectiveId ? true : undefined}>
        <summary>Prepoznaj v viru <Badge variant="outline">{course.unmappedObjectives.length}</Badge></summary>
        
        {course.unmappedObjectives.map(objective => <Button variant="ghost" key={objective.id} aria-pressed={objective.id === objectiveId} onClick={() => onObjective(objective)}><span>{objective.shortLabel || objective.labels.sl}<small lang="la">{objective.labels.la}</small></span><ArrowUpRight size={14}/></Button>)}
      </details>}
    </div>
    <details className="course-scope"><summary>O gradivu</summary><p>{course.scopeNote}</p></details>
  </section>;
}

function SourceLinks({course, links, ids}: {course: CourseOverlay; links: CourseLinks; ids: string[]}) {
  return <section className="course-sources" aria-label="Zapiski in viri"><h3><BookOpen size={14}/> Zapiski in viri</h3>
    {ids.map(id => {
      const binding = course.noteBindings[id];
      if (!binding) return null;
      let native: string | null = null, browser: string | null = null;
      // Optional deployment links must not take down valid anatomy or source PDFs.
      try {if (links.vaultName) native = obsidianUrl(binding.note.path, links.vaultName, {heading: binding.note.heading, vaultRoot: links.vaultRoot});} catch { /* Show the exact unresolved note below. */ }
      try {if (links.noteBaseUrl) browser = spaceoSourceUrl(binding.note.route, links.noteBaseUrl);} catch { /* Keep other source routes usable. */ }
      const base = `/api/course/sources/${encodeURIComponent(id)}`;
      return <div className="course-source-binding" key={id}>
        <span className="source-heading">{binding.note.heading}</span>
        <div className="course-source-actions">
          {native && <a href={native}><BookOpen size={13}/> Zapisek</a>}
          {browser && <a href={browser} target="_blank" rel="noreferrer">{native ? 'Zapisek v brskalniku' : 'Zapisek'} <ArrowUpRight size={12}/></a>}
          <a href={`${base}/pdf#page=${binding.courseSource.page}`} target="_blank" rel="noreferrer">PDF · {binding.courseSource.page}<ArrowUpRight size={12}/></a>
          {binding.figures.map((figure, index) => <a href={`${base}/figure/${index}`} key={figure.path} target="_blank" rel="noreferrer">Slika{binding.figures.length > 1 ? ` ${index + 1}` : ''}{figure.laterality ? ` · ${SIDES[figure.laterality].toLowerCase()}` : ''}<ArrowUpRight size={12}/></a>)}
          {binding.capture && <a className="capture-link" href={`${base}/capture`} target="_blank" rel="noreferrer">Prvotni zapis <ArrowUpRight size={12}/></a>}
        </div>
        {!native && !browser && <p className="course-source-unavailable">Pot do zapiska še ni nastavljena. Cilj: <span>{binding.note.path} → {binding.note.heading}</span></p>}
      </div>;
    })}
  </section>;
}

export function CourseInspector({course, links, selection, term, objective, mesh, parts, open, isolate, context, onOpenChange, onTerm, onPart, onSelection, onContext, onIsolate, scopeElements, selectedIds, target, side, layer, onRegionView}: {
  course: CourseOverlay; links: CourseLinks; selection?: CourseSelection; term?: CourseConcept; objective?: UnmappedObjective;
  mesh?: Part; parts: Map<string, Part>; open: boolean; isolate: boolean; context: boolean;
  scopeElements?: string[]; selectedIds: string[]; target?: Concept; side?: StudySide; layer?: StudyLayer;
  onRegionView: (patch: {side?: StudySide; layer?: StudyLayer}) => void;
  onOpenChange: (open: boolean) => void; onTerm: (term: CourseConcept) => void; onPart: (id: string) => void;
  onSelection: (selection: CourseSelection) => void; onContext: () => void; onIsolate: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null), list = useRef<HTMLOListElement>(null);
  const terms = new Map(course.concepts.map(item => [item.id, item]));
  const scope = new Set(scopeElements ?? selection?.elements ?? []), selected = new Set(selectedIds);
  const title = objective ? (objective.shortLabel || objective.labels.sl) : selection?.label;
  const bindings = objective?.noteBindingIds ?? term?.noteBindingIds ?? selection?.noteBindingIds ?? [];
  const taught = selection?.conceptIds.map(id => terms.get(id)!).filter(Boolean) ?? [];
  const claimed = new Set<string>();
  const rows: {id:string; label:string; latin?:string; english:string; elements:string[]; term?:CourseConcept; part?:Part}[] = [];
  // Keep the authored learning order, but never use that list as the region's visibility limit.
  for (const item of taught) {
    const elements = item.elements.filter(id => scope.has(id));
    if (!elements.length) continue;
    elements.forEach(id => claimed.add(id));
    rows.push({id:item.id, label:item.labels.sl, latin:item.labels.la, english:item.name, elements, term:item});
  }
  const other = [...scope].filter(id => !claimed.has(id)).map(id => parts.get(id)).filter((part):part is Part => !!part).sort((a,b) => a.name.localeCompare(b.name,'en',{numeric:true}));
  for (const part of other) rows.push({id:part.id, label:part.name, english:part.name, elements:[part.id], part});
  useEffect(() => {
    const current = list.current?.querySelector<HTMLElement>('[aria-pressed="true"]');
    current?.scrollIntoView({block:'nearest', inline:'nearest'});
  }, [selectedIds, open]);
  const pickedName = mesh && !term ? mesh.name : term?.labels.sl ?? target?.name;
  const pickedSide = mesh ? partSide(mesh) : side === 'both' ? null : side;
  return <Sheet open={open} modal={false} disablePointerDismissal onOpenChange={onOpenChange}>
    <SheetContent initialFocus={heading} className={`detail-sheet course-detail glass ${isolate || context ? 'is-isolated' : ''}`} lang="sl">
      <div className="detail-header">
        <div className="eyebrow">{objective ? 'PREPOZNAVA V VIRU' : 'STRUKTURE V PREDELU'}</div>
        <SheetTitle ref={heading} tabIndex={-1} className="structure-title">{title}</SheetTitle>
        {!objective && selection?.region && <div className="region-controls">
          <div className="region-sides" role="group" aria-label="Stran telesa">{(['right','left','both'] as const).map(value => <Button key={value} variant="ghost" aria-pressed={side === value} onClick={() => onRegionView({side:value})}>{value === 'both' ? 'Obe' : SIDES[value]}</Button>)}</div>
          <label className="region-layer"><span className="sr-only">Plasti predela</span><select aria-label="Plasti predela" value={layer ?? 'bones'} onChange={event => onRegionView({layer:event.target.value as StudyLayer})}><option value="bones">Kosti</option><option value="muscles">Kosti in mišice</option><option value="all">Vse plasti</option></select></label>
        </div>}
      </div>
      <div className="detail-scroll" key={objective?.id ?? selection?.id}>
        <SheetDescription className="sr-only">{objective ? 'Cilj brez preverjene geometrije. Uporabi izvirni vir.' : 'Izberi ime ali model: struktura se označi v nespremenjenem predelu.'}</SheetDescription>
        {objective ? <>
          <p className="unmapped-notice">Ni označeno v 3D — prepoznaj na sliki.</p>
          <div className="course-terminology"><span>Latinsko<strong lang="la">{objective.labels.la}</strong></span></div>
          {context && <p className="context-explanation" role="status">Okoliške strukture; cilj ni označen.</p>}
          <details className="mapping-reason"><summary>Vir in omejitev</summary><p>{EVIDENCE[objective.evidence]}</p><p lang="en">{objective.reason}</p></details>
          <SourceLinks course={course} links={links} ids={bindings}/>
        </> : <>
          <div className="region-selection" role="status" aria-live="polite">
            {pickedName ? <><strong>{pickedName}</strong>{pickedSide && <span className="picked-side">{SIDES[pickedSide]}</span>}{term?.labels.la && <small lang="la">{term.labels.la}</small>}</> : <span>Izberi ime ali strukturo</span>}
          </div>
          <ol className="course-terms" ref={list} aria-label="Strukture v predelu">{rows.map((row,index) => <li key={row.id}>
            <Button variant="ghost" aria-pressed={row.elements.some(id => selected.has(id))} data-mesh={row.part?.id} data-course-term={row.term ? 'true' : 'false'} title={row.term ? `${row.english} · oznaka iz gradiva` : `${row.english} · izvorno ime v atlasu, brez potrjene oznake iz gradiva`} onClick={() => row.term ? onTerm(row.term) : onPart(row.part!.id)}>
              <span className="course-index">{index + 1}</span><span className="course-term-name"><strong lang={row.term ? 'sl' : 'en'}>{row.label}</strong>{row.latin && <span lang="la">{row.latin}</span>}</span>{row.term && <span className="course-source-dot" aria-label="V gradivu"/>}
            </Button>
          </li>)}</ol>
          <div className="region-legend"><span className="course-source-dot"/> Iz gradiva · ostalo: izvorna imena</div>
          {selection?.orderDescription && <details className="course-order"><summary>Zaporedje in poudarek</summary><p>{selection.orderDescription}</p><p>{EVIDENCE[selection.evidence]}</p></details>}
          {bindings.length > 0 && <details className="source-disclosure"><summary>{term ? 'Zapisek in viri' : 'Viri predela'}</summary><SourceLinks course={course} links={links} ids={bindings}/></details>}
          {target && <details className="mapping-reason"><summary>Podatki o strukturi</summary><p lang="en">{target.name}</p><p>{target.id}{mesh ? ` · ${mesh.id}` : ''}</p>{term ? <p>{SIDES[term.laterality]} · izraz iz gradiva</p> : <p>Izvorno ime v atlasu. Izpitna zahteva ni določena.</p>}</details>}
        </>}
      </div>
      <div className="detail-actions">
        {objective ? <Button variant="outline" className="primary-action context-action" onClick={onContext}><Focus size={17}/>{context ? 'Skrij okolico' : 'Pokaži okolico'}</Button> : target ? <div className="region-actions"><Button variant="outline" onClick={onIsolate} aria-pressed={isolate}><Focus size={16}/>{isolate ? 'Nazaj v predel' : 'Samo izbrano'}</Button>{selection && <Button variant="ghost" onClick={() => onSelection(selection)} aria-label="Odstrani oznako"><X size={16}/></Button>}</div> : null}
        <CopySceneLink sl/>
      </div>
    </SheetContent>
  </Sheet>;
}
