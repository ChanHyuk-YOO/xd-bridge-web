const $=id=>document.getElementById(id);
let worker,sequence=0,pending=new Map(),data=null,selected=0,filename='',busy=false,previewSequence=0,previewURL=null,stateRevision=0;
const controls=['download-svg','download-native','download-zip'];
function status(message,kind=''){ $('status-text').textContent=message;$('status').className='status '+kind;}
function setBusy(value){busy=value;controls.forEach(id=>$(id).disabled=value);$('cancel').hidden=!value;}
function createWorker(){
 worker=new Worker('/worker.js');
 worker.onmessage=e=>{const m=e.data;if(m.type==='status'){status(m.message,'busy');return;}const p=pending.get(m.id);if(!p)return;pending.delete(m.id);m.type==='error'?p.reject(Error(m.message)):p.resolve(m);};
 worker.onerror=()=>{for(const p of pending.values())p.reject(Error('변환 프로그램을 불러오지 못했습니다. 페이지를 새로고침해 주세요.'));pending.clear();};
}
function request(type,extra={},transfer=[]){if(!worker)createWorker();const id=++sequence;return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});worker.postMessage({id,type,...extra},transfer);});}
function download(value,name,type){const blob=new Blob([value],{type});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
function safeName(name){return name.replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').slice(0,90).replace(/[. ]+$/,'')||'artboard';}
function reset(){
 stateRevision++;
 if(worker){worker.terminate();worker=null;}for(const p of pending.values())p.reject(Error('취소됐습니다.'));pending.clear();previewSequence++;data=null;filename='';$('file').value='';$('file-info').hidden=true;$('dropzone').hidden=false;$('board-controls').hidden=true;$('downloads').hidden=true;$('report').hidden=true;$('error-state').hidden=true;$('empty-state').hidden=false;$('preview-container').hidden=true;$('preview').removeAttribute('src');if(previewURL){URL.revokeObjectURL(previewURL);previewURL=null;}$('canvas-meta').textContent='선택한 파일이 이곳에 표시됩니다';setBusy(false);status('파일을 선택하면 변환기가 준비됩니다.');
}
function showError(error){status(error.message,'error');$('error-message').textContent=error.message;$('error-state').hidden=false;$('empty-state').hidden=true;$('preview-container').hidden=true;}
function renderBoards(){
 const q=$('board-search').value.trim().toLocaleLowerCase();$('board-list').replaceChildren();
 data.boards.forEach((b,i)=>{if(!b.name.toLocaleLowerCase().includes(q))return;const button=document.createElement('button');button.className='board-button'+(i===selected?' active':'');button.setAttribute('aria-pressed',String(i===selected));button.title=b.name;const title=document.createElement('span');title.textContent=b.name;const dim=document.createElement('small');dim.textContent=`${Math.round(b.width)}×${Math.round(b.height)}`;button.append(title,dim);button.onclick=()=>preview(i);$('board-list').append(button);});
 if(!$('board-list').children.length){const p=document.createElement('p');p.textContent='일치하는 아트보드가 없습니다.';p.style.fontSize='11px';$('board-list').append(p);}
}
async function preview(index){
 selected=index;renderBoards();const seq=++previewSequence;
 try{
  const m=await request('preview',{index});if(seq!==previewSequence)return;
  const b=data.boards[index];$('empty-state').hidden=true;$('error-state').hidden=true;$('preview-container').hidden=false;
  $('canvas-meta').textContent=`${Math.round(b.width)} × ${Math.round(b.height)} px`;
  // SVG image mode disables scripting and external subresources. User markup
  // is never injected into the page DOM or executed as a document.
  if(previewURL)URL.revokeObjectURL(previewURL);
  previewURL=URL.createObjectURL(new Blob([m.svg],{type:'image/svg+xml'}));
  $('preview').src=previewURL;await $('preview').decode();
  if(seq!==previewSequence)return;
  status(`${data.boards.length}개 아트보드를 읽었습니다. 변환 보고서도 확인해 주세요.`);
 }catch(error){if(seq===previewSequence)showError(error);}
}
async function openFile(file){
 if(!file)return;
 if(!/\.xd$/i.test(file.name)){showError(Error('.xd 확장자의 로컬 XD 파일을 선택해 주세요.'));return;}
 if(file.size>100*1024*1024){showError(Error('100MB 이하의 XD 파일을 선택해 주세요.'));return;}
 reset();const revision=stateRevision;filename=file.name;$('filename').textContent=file.name;$('filesize').textContent=(file.size/1024/1024).toFixed(2)+' MB';$('file-info').hidden=false;$('dropzone').hidden=true;setBusy(true);status('파일을 읽고 있어요.','busy');
 try{
  const buffer=await file.arrayBuffer();if(revision!==stateRevision)return;const m=await request('analyze',{buffer},[buffer]);if(revision!==stateRevision)return;data=m.data;selected=0;
  $('board-search').value='';$('board-controls').hidden=false;$('board-total').textContent=data.boards.length+'개';$('downloads').hidden=false;$('report').hidden=false;
  const warnings=Object.entries(data.report.warnings);$('warning-total').textContent=warnings.length+'가지 확인 항목';$('warning-list').replaceChildren();
  for(const [message,count]of warnings){const li=document.createElement('li');li.textContent=message+' ('+count+'건)';$('warning-list').append(li);}
  await preview(0);
 }catch(error){if(revision===stateRevision&&error.message!=='취소됐습니다.')showError(error);}
 finally{if(revision===stateRevision)setBusy(false);}
}
$('file').onchange=()=>openFile($('file').files[0]);
for(const type of ['dragenter','dragover'])$('dropzone').addEventListener(type,e=>{e.preventDefault();$('dropzone').classList.add('dragover');});
for(const type of ['dragleave','drop'])$('dropzone').addEventListener(type,e=>{e.preventDefault();$('dropzone').classList.remove('dragover');if(type==='drop')openFile(e.dataTransfer.files[0]);});
document.addEventListener('dragover',e=>e.preventDefault());document.addEventListener('drop',e=>e.preventDefault());
$('reset').onclick=reset;$('cancel').onclick=reset;$('retry').onclick=()=>$('file').click();$('board-search').oninput=()=>{if(data)renderBoards();};
$('report-toggle').onclick=()=>{const open=$('report-details').hidden;$('report-details').hidden=!open;$('report-toggle').setAttribute('aria-expanded',String(open));$('report-arrow').textContent=open?'−':'＋';};
$('download-report').onclick=()=>{if(data)download(JSON.stringify(data.report,null,2),safeName(filename)+'.report.json','application/json');};
for(const [id,type]of [['download-svg','svg'],['download-native','native'],['download-zip','zip']])$(id).onclick=async()=>{
 if(!data||busy)return;setBusy(true);const index=selected;const revision=stateRevision;
 try{const m=await request(type,{index});const name=safeName(data.boards[index].name);
  if(type==='svg')download(m.svg,name+'.svg','image/svg+xml');
  else if(type==='native')download(m.buffer,name+'.figcraft','application/zip');
  else download(m.buffer,safeName(filename.replace(/\.xd$/i,''))+'-svg.zip','application/zip');
  status(type==='native'?'실험적 FigCraft 파일을 저장했습니다. 텍스트 위치·그라디언트를 원본과 비교하세요.':'다운로드가 준비됐습니다. 원본과 비교한 뒤 편집해 주세요.');
 }catch(error){if(revision===stateRevision&&error.message!=='취소됐습니다.')status(error.message,'error');}finally{if(revision===stateRevision)setBusy(false);}
};
