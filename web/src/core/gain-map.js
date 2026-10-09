// ISO tone-map derived images reference [base image, gain-map image] via dimg.
// Apple exports can omit the older hdrgainmap auxC label on that second image.
export function tmapGainMap(infos,dimg,primary){
  const candidates=new Set();
  for(const [id,info]of infos){
    if(info.type!=='tmap')continue;
    const inputs=dimg.get(id);
    if(inputs?.length!==2||inputs[0]!==primary||inputs[1]===primary)continue;
    const gain=inputs[1],type=infos.get(gain)?.type;
    if(type==='hvc1'||type==='grid'&&dimg.get(gain)?.length
      &&dimg.get(gain).every(tile=>infos.get(tile)?.type==='hvc1'))candidates.add(gain);
  }
  return candidates.size===1?[...candidates][0]:null;
}
