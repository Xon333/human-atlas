import {Button} from '@/components/ui/button';
import type {StudySide,StudyLayer} from './study-region';

export function RegionControls({side='both', layer='bones', onChange, sl=false}: {
  side?:StudySide; layer?:StudyLayer; sl?:boolean; onChange:(patch:{side?:StudySide;layer?:StudyLayer})=>void;
}) {
  return <div className="region-controls"><div className="region-sides" role="group" aria-label={sl?'Stran telesa':'Body side'}>{(['right','left','both'] as const).map(value=><Button key={value} variant="ghost" aria-pressed={side===value} onClick={()=>onChange({side:value})}>{sl?({right:'Desno',left:'Levo',both:'Obe'}[value]):({right:'Right',left:'Left',both:'Both'}[value])}</Button>)}</div><label className="region-layer"><span className="sr-only">{sl?'Plasti predela':'Region layers'}</span><select aria-label={sl?'Plasti predela':'Region layers'} value={layer} onChange={event=>onChange({layer:event.target.value as StudyLayer})}><option value="bones">{sl?'Kosti':'Bones'}</option><option value="muscles">{sl?'Kosti in mišice':'Bones + muscles'}</option><option value="all">{sl?'Vse plasti':'All layers'}</option></select></label></div>;
}

