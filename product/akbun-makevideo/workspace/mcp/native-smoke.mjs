import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

if (!process.env.AKBUN_MAKEVIDEO_SOCKET) throw new Error('Start a dedicated development editor and set AKBUN_MAKEVIDEO_SOCKET explicitly.');
const output = await mkdtemp(path.join(os.tmpdir(), 'makevideo-native-'));
const source = path.join(output,'source.mp4');
execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','color=c=red:s=640x360:r=30:d=2','-c:v','libx264','-pix_fmt','yuv420p',source]);
const client = new Client({name:'makevideo-native-smoke',version:'1'});
await client.connect(new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('./server.mjs',import.meta.url))],env:{...process.env}}));
async function call(name,args={}) {
  const result=await client.callTool({name,arguments:args},undefined,{timeout:120000});
  if(result.isError) throw new Error(`${name}: ${result.content[0].text}`);
  return JSON.parse(result.content[0].text);
}
let initial;
try {
  initial = await call('create_checkpoint',{label:'Native MCP smoke initial state'});
  let current=await call('get_project');
  current=await call('new_project',{stateToken:current.stateToken,settings:{width:640,height:360,rate:{num:30,den:1}}});
  current=await call('import_media',{stateToken:current.stateToken,paths:[source]});
  assert.equal(current.document.project.assets.length,1);
  const asset=current.document.project.assets[0];
  const sample=await client.callTool({name:'sample_asset',arguments:{assetId:asset.id,startMs:0,endMs:2000}},undefined,{timeout:120000});
  assert.equal(sample.isError,undefined);
  assert.equal(sample.content.filter(item=>item.type==='image').length,8);
  const before=current.stateToken;
  current=await call('apply_edits',{stateToken:before,label:'Video, cut and caption',commands:[
    {op:'insertSource',assetId:asset.id,videoTrackId:'t1',audioTrackId:null,start:0,inPoint:0,outPoint:60,rippleAllTracks:false},
    {op:'splitAt',frame:30,clipId:null},
    {op:'addTrack',trackKind:'subtitle',id:'captions'},
    {op:'addVisualItem',trackId:'captions',id:'caption-1',content:{kind:'text',text:'MCP test',style:{fontFamily:'sans-serif',fontSize:32,color:'#ffffff'}},start:0,duration:60,transform:{x:80,y:280,width:480,height:60,rotation:0,opacity:1},zIndex:0},
  ]});
  assert.equal(current.document.project.tracks[0].clips.length,2);
  const stale=await client.callTool({name:'apply_edits',arguments:{stateToken:before,label:'stale',commands:[{op:'splitAt',frame:15,clipId:null}]}});
  assert.equal(stale.isError,true);
  current=await call('undo',{stateToken:current.stateToken});
  assert.equal(current.document.project.tracks[0].clips.length,0);
  current=await call('redo',{stateToken:current.stateToken});
  assert.equal(current.document.project.tracks[0].clips.length,2);
  const projectPath=path.join(output,'project.akbunvideo');
  current=await call('save_project',{stateToken:current.stateToken,path:projectPath});
  current=await call('open_project',{stateToken:current.stateToken,path:projectPath});
  assert.equal(JSON.parse(await readFile(projectPath,'utf8')).tracks[0].clips.length,2);
  const video=path.join(output,'result.mp4');
  await call('export_video',{stateToken:current.stateToken,path:video,preset:'fhd'});
  let render;
  for(let n=0;n<90;n++) {
    await new Promise(resolve=>setTimeout(resolve,1000));
    render=await call('render_status');
    if(!render.running && render.result) break;
  }
  assert.equal(render.result?.ok,true,JSON.stringify(render));
  assert.ok((await stat(video)).size>1000);
  console.log(JSON.stringify({output,mediaImport:true,frames:8,cuts:true,captions:true,undoRedo:true,staleRejected:true,saveOpen:true,render:render.result}));
} finally {
  if(initial) {
    const current=await call('get_project');
    await call('restore_checkpoint',{stateToken:current.stateToken,checkpointId:initial.checkpointId});
  }
  await client.close();
}
