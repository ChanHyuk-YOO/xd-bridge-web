/* All input bytes remain in this worker. No conversion API or uploads. */
let runtime;
let generation=0;
function state(message){self.postMessage({type:'status',message});}
async function ready(){
 if(runtime)return runtime;
 state('변환 프로그램을 준비하고 있어요. 처음에는 잠시 걸릴 수 있습니다.');
 importScripts('/runtime/pyodide.js');
 runtime=await loadPyodide({indexURL:'/runtime/'});
 const [engine,native]=await Promise.all(['/engine.py','/native.py'].map(async url=>{const r=await fetch(url);if(!r.ok)throw Error('변환 프로그램을 불러오지 못했습니다.');return r.text();}));
 runtime.FS.writeFile('/home/pyodide/engine.py',engine);runtime.FS.writeFile('/home/pyodide/native.py',native);
 await runtime.runPythonAsync(`import engine, native, zipfile, json, io, re\npackage = None\ndef svg_for(index):\n    board=package['boards'][index]\n    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{board["width"]}" height="{board["height"]}" viewBox="0 0 {board["width"]} {board["height"]}"><rect width="100%" height="100%" fill="{board["background"]}"/>' + ''.join(engine.render(child) for child in board.get('children',[]))+'</svg>'\ndef zip_svgs():\n    result=io.BytesIO()\n    with zipfile.ZipFile(result,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:\n        for i,b in enumerate(package['boards']):\n            name=re.sub(r'[<>:"/\\\\|?*\\x00-\\x1f]','_',b['name'])[:90].strip('. ') or 'artboard'\n            z.writestr(f'{i+1:03d}-{name}.svg',svg_for(i))\n        z.writestr('report.json',json.dumps(package['report'],ensure_ascii=False,indent=2))\n        z.writestr('README.txt','FigCraft에서 SVG를 가져오세요. 글꼴·텍스트 위치·지원하지 않는 기능을 원본과 비교하세요. 이 파일은 브라우저에서 생성됐습니다.')\n    return result.getvalue()`);
 return runtime;
}
self.onmessage=async event=>{
 const {id,type,index,buffer}=event.data;
 try{
  const py=await ready();
  if(type==='analyze'){
   const bytes=new Uint8Array(buffer);
   if(bytes.length>100*1024*1024)throw Error('100MB 이하의 XD 파일을 선택해 주세요.');
   state('XD 파일에서 아트보드와 텍스트를 읽고 있어요.');
   py.FS.writeFile('/input.xd',bytes);
   const summary=await py.runPythonAsync(`with zipfile.ZipFile('/input.xd') as archive:\n    package=engine.Engine(archive).convert()\njson.dumps({'boards':[{'name':b['name'],'width':b['width'],'height':b['height']} for b in package['boards']],'report':package['report']},ensure_ascii=False)`);
   py.FS.unlink('/input.xd');generation++;
   self.postMessage({id,type:'analyzed',data:JSON.parse(summary)});
  }else if(type==='preview'||type==='svg'){
   py.globals.set('board_index',index);
   const svg=await py.runPythonAsync('svg_for(board_index)');
   self.postMessage({id,type,svg,index});
  }else if(type==='zip'){
   state('아트보드를 ZIP으로 묶고 있어요.');
   const proxy=await py.runPythonAsync('zip_svgs()');const bytes=proxy.toJs();proxy.destroy();
   self.postMessage({id,type,buffer:bytes.buffer},[bytes.buffer]);
  }else if(type==='native'){
   state('FigCraft 파일을 생성하고 있어요.');py.globals.set('board_index',index);
   await py.runPythonAsync('native_result,native_warnings=native.native_bytes(package,board_index)');
   const proxy=py.globals.get('native_result');const bytes=proxy.toJs();proxy.destroy();
   const warnings=JSON.parse(await py.runPythonAsync('json.dumps(native_warnings,ensure_ascii=False)'));
   self.postMessage({id,type,index,buffer:bytes.buffer,warnings},[bytes.buffer]);
   await py.runPythonAsync('native_result=None');
  }
 }catch(error){self.postMessage({id,type:'error',message:String(error.message||error).split('\n').filter(Boolean).slice(-3).join('\n')});}
};
