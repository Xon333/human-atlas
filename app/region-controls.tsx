import type {StudySide,StudyLayer} from './study-region';

export function RegionControls({side='both', layer='bones', onChange, sl=false}: {
  side?:StudySide; layer?:StudyLayer; sl?:boolean; onChange:(patch:{side?:StudySide;layer?:StudyLayer})=>void;
}) {
  return <div className="region-controls">
    <label className="region-side"><span>{sl?'Stran':'Body side'}</span><select aria-label={sl?'Stran telesa':'Body side'} value={side} onChange={event=>onChange({side:event.target.value as StudySide})}>{(['right','left','both'] as const).map(value=><option key={value} value={value}>{sl?({right:'Desno',left:'Levo',both:'Obe'}[value]):({right:'Right',left:'Left',both:'Both'}[value])}</option>)}</select></label>
    <label className="region-layer"><span>{sl?'Plasti':'Layers'}</span><select aria-label={sl?'Plasti predela':'Region layers'} value={layer} onChange={event=>onChange({layer:event.target.value as StudyLayer})}><option value="bones">{sl?'Kosti':'Bones'}</option><option value="muscles">{sl?'Kosti in mišice':'Bones + muscles'}</option><option value="all">{sl?'Vse plasti':'All layers'}</option></select></label>
  </div>;
}
