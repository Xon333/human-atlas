import {useRef, useState} from 'react';
import {ArrowLeft, ArrowUpRight, BookOpen, ChevronLeft, ChevronRight, Focus, Link2, ListOrdered, X} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Badge} from '@/components/ui/badge';
import {Sheet, SheetContent, SheetTitle, SheetDescription} from '@/components/ui/sheet';
import type {Part} from './anatomy';
import type {CourseOverlay, CourseLinks, CourseConcept, CourseSelection, UnmappedObjective, Evidence, Laterality} from './course';
import {obsidianUrl, spaceoSourceUrl} from './course-navigation';

const SIDES: Record<Laterality, string> = {right: 'Desno', left: 'Levo', bilateral: 'Obe strani', midline: 'Sredinska'};
const EVIDENCE: Record<Evidence, string> = {'course-material': 'Učno gradivo', 'student-reported-emphasis': 'Poudarek po zapisu študenta', bonus: 'Dodatno · bonus'};

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
  return <section className={`course-panel glass ${mobileOpen ? 'mobile-open' : ''}`} aria-label="Študijski izbori" lang="sl">
    <div className="panel-heading"><span><BookOpen size={16}/> Študijski izbori</span><Badge variant="secondary">{course.selections.length}</Badge><Button variant="ghost" className="course-mobile-close icon-button" onClick={onClose} aria-label="Zapri izbore"><X size={18}/></Button></div>
    <div className="course-panel-scroll">
      <nav className="course-selection-list" aria-label="Anatomski izbori">{course.selections.map((selection, index) => <Button variant="ghost" key={selection.id} aria-pressed={selectionId === selection.id && !objectiveId} onClick={() => onSelection(selection)}>
        <span className="course-index">{String(index + 1).padStart(2, '0')}</span><span>{selection.label}</span><ChevronRight size={14}/>
      </Button>)}</nav>
      {course.unmappedObjectives.length > 0 && <details className="unmapped-list" open={objectiveId ? true : undefined}>
        <summary>Prepoznaj v viru <Badge variant="outline">{course.unmappedObjectives.length}</Badge></summary>
        <p>Za te cilje ni ločenega modela ali preverjene točke v atlasu.</p>
        {course.unmappedObjectives.map(objective => <Button variant="ghost" key={objective.id} aria-pressed={objective.id === objectiveId} onClick={() => onObjective(objective)}><span>{objective.shortLabel || objective.labels.sl}<small lang="la">{objective.labels.la}</small></span><ArrowUpRight size={14}/></Button>)}
      </details>}
    </div>
    <div className="course-scope"><span>Obseg izbora</span><p>{course.scopeNote}</p></div>
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

export function CourseInspector({course, links, selection, term, objective, mesh, parts, open, isolate, context, onOpenChange, onTerm, onPart, onSelection, onContext, onIsolate}: {
  course: CourseOverlay; links: CourseLinks; selection?: CourseSelection; term?: CourseConcept; objective?: UnmappedObjective;
  mesh?: Part; parts: Map<string, Part>; open: boolean; isolate: boolean; context: boolean;
  onOpenChange: (open: boolean) => void; onTerm: (term: CourseConcept) => void; onPart: (id: string) => void;
  onSelection: (selection: CourseSelection) => void; onContext: () => void; onIsolate: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const terms = new Map(course.concepts.map(item => [item.id, item]));
  const title = objective ? (objective.shortLabel || objective.labels.sl) : term ? term.labels.sl : selection?.label;
  const evidence = objective?.evidence ?? selection?.evidence;
  const bindings = objective?.noteBindingIds ?? term?.noteBindingIds ?? selection?.noteBindingIds ?? [];
  const members = selection?.conceptIds.map(id => terms.get(id)!).filter(Boolean) ?? [];
  const position = members.findIndex(member => member.id === term?.id);
  const meshSide = mesh?.name.match(/^(left|right)\b/i)?.[1].toLowerCase() as 'left' | 'right' | undefined;
  return <Sheet open={open} modal={false} disablePointerDismissal onOpenChange={onOpenChange}>
    <SheetContent initialFocus={heading} className={`detail-sheet course-detail glass ${isolate || context ? 'is-isolated' : ''}`} lang="sl">
      <div className="detail-header">
        <div className="eyebrow">{objective ? 'PREPOZNAVA V VIRU' : term ? 'STRUKTURA' : 'ANATOMSKI IZBOR'}</div>
        <SheetTitle ref={heading} tabIndex={-1} className="structure-title">{title}</SheetTitle>
        {evidence && <Badge variant="outline" className={`course-evidence ${evidence}`}>{EVIDENCE[evidence]}</Badge>}
      </div>
      <div className="detail-scroll" key={objective?.id ?? `${selection?.id}-${term?.id}-${mesh?.id}`}>
        <SheetDescription className={objective ? 'unmapped-notice' : 'sr-only'}>{objective ? 'Ni preslikano v 3D. Atlas nima ločene preverjene geometrije za ta cilj. Prepoznaj ga na povezani sliki in v zapisku.' : 'Izbor iz predmeta anatomija z izrazi, stranjo telesa in neposrednimi viri v SpaceO.'}</SheetDescription>
        {objective ? <>
          <div className="course-terminology"><span>Slovensko<strong>{objective.labels.sl}</strong></span><span>Latinsko<strong lang="la">{objective.labels.la}</strong></span></div>
          {context && <p className="context-explanation" role="status">Prikazane so le okoliške kosti. Cilj ni označen.</p>}
          <details className="mapping-reason"><summary>Omejitev modela</summary><p lang="en">{objective.reason}</p></details>
        </> : term ? <>
          <div className="course-terminology"><span>Slovensko<strong>{term.labels.sl}</strong></span><span>Latinsko<strong lang="la">{term.labels.la}</strong></span><span>English<strong lang="en">{term.name}</strong></span></div>
          <div className="course-term-meta"><Badge variant="secondary">{mesh ? (meshSide ? `Izbrano: ${SIDES[meshSide].toLowerCase()}` : 'En model') : SIDES[term.laterality]}</Badge><span>{term.id} · {mesh ? 1 : term.elements.length} {mesh || term.elements.length === 1 ? 'model' : 'modelov'}</span></div>
          {mesh && <div className="course-mesh-selection">Pojem: {SIDES[term.laterality].toLowerCase()}<strong lang="en">{mesh.name}</strong></div>}
          {term.elements.length > 1 && <div className="course-meshes"><h3>Posamezni modeli</h3>{term.elements.map(id => <Button key={id} variant="ghost" aria-pressed={mesh?.id === id} onClick={() => onPart(id)}><span lang="en">{parts.get(id)?.name ?? id}</span><ChevronRight size={13}/></Button>)}</div>}
        </> : <>
          {selection?.orderDescription && <p className="course-order"><ListOrdered size={16}/>{selection.orderDescription}</p>}
          <ol className="course-terms" aria-label="Strukture po učnem zaporedju">{members.map((member, index) => <li key={member.id}><Button variant="ghost" onClick={() => onTerm(member)}>
            <span className="course-index">{index + 1}</span><span className="course-term-name"><strong>{member.labels.sl}</strong><span lang="la">{member.labels.la}</span><small lang="en">{member.name}</small></span><span className="course-side">{SIDES[member.laterality]}</span>
          </Button></li>)}</ol>
        </>}
        <SourceLinks course={course} links={links} ids={bindings}/>
      </div>
      <div className="detail-actions">
        {term && selection ? <div className="course-stepper"><Button variant="ghost" disabled={position <= 0} onClick={() => onTerm(members[position - 1])} aria-label="Prejšnja struktura"><ChevronLeft size={19}/></Button><Button variant="ghost" onClick={() => onSelection(selection)}><ArrowLeft size={15}/> Vseh {members.length}</Button><Button variant="ghost" disabled={position < 0 || position >= members.length - 1} onClick={() => onTerm(members[position + 1])} aria-label="Naslednja struktura"><ChevronRight size={19}/></Button></div> : null}
        {objective ? <Button variant="outline" className="primary-action context-action" onClick={onContext}><Focus size={17}/>{context ? 'Skrij okoliške kosti' : 'Pokaži okoliške kosti'}</Button> : <Button className={`primary-action ${isolate ? 'active' : ''}`} onClick={onIsolate}><Focus size={17}/>{isolate ? 'Pokaži v telesu' : 'Izoliraj izbor'}<ChevronRight size={16}/></Button>}
        <CopySceneLink sl/>
      </div>
    </SheetContent>
  </Sheet>;
}
