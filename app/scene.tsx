import {useEffect,useMemo,useRef} from 'react';
import SceneRenderer from './scene-renderer';
import {projectGeometry,requestedGeometry} from './scene-scope';
import type {Atlas,SceneState} from './anatomy';
interface Props {atlas:Atlas;state:SceneState;onSelect:(id:string)=>void;onProgress:(n:number)=>void;onError:(s:string)=>void}
/** Reuse the accepted renderer without retaining the rest of the body for a region. */
export default function AnatomyScene(props:Props){
 const requested=requestedGeometry(props.state),key=JSON.stringify(requested??null);
 const projected=useMemo(()=>projectGeometry(props.atlas,requested),[props.atlas,key]);
 const progress=useRef(props.onProgress);progress.current=props.onProgress;
 useEffect(()=>{progress.current(projected.parts.length?0:100);},[projected]);
 if(!projected.parts.length)return <div className="scene" data-geometry-parts="0"/>;
 return <SceneRenderer {...props} atlas={projected}/>;
}
