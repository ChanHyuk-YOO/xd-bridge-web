"""Local XD -> SVG + Figma import package. Python standard library only."""
import argparse
import base64
import collections
import copy
import html
import json
import math
import pathlib
import re
import shutil
import subprocess
import sys
import zipfile

VERSION = 'xd-bridge/1'
IDENTITY = [1, 0, 0, 1, 0, 0]

def font_attributes(font):
    """CSS styling is essential: family alone silently turns Bold into Regular."""
    style=font.get('style','Regular').lower().replace(' ','').replace('-','')
    weights=[('ultralight',200),('extralight',200),('thin',100),('semibold',600),('demibold',600),('extrabold',800),('ultrabold',800),('black',900),('heavy',900),('bold',700),('medium',500),('light',300)]
    weight=next((v for k,v in weights if k in style),400)
    italic='italic' if 'italic' in style or 'oblique' in style else 'normal'
    return f'font-family="{esc(font.get("family","Inter"))}" font-size="{font.get("size",16)}" font-weight="{weight}" font-style="{italic}"'

def esc(s):
    return html.escape(str(s), quote=True)

def matrix(n):
    # XD top-level children often carry document coordinates in transform and
    # artboard-relative coordinates in localTransform. Prefer the latter.
    t = n.get('meta', {}).get('ux', {}).get('localTransform') or n.get('transform', {})
    return [t.get(k, v) for k, v in zip(('a','b','c','d','tx','ty'), IDENTITY)]

def color(c):
    c = c or {}
    v = c.get('value', {})
    if isinstance(v, int):
        return '#%06x' % (v & 0xffffff), ((v >> 24) & 255) / 255
    if not isinstance(v, dict):
        return '#000000', 1
    return '#%02x%02x%02x' % tuple(max(0, min(255, round(v.get(k, 0)))) for k in 'rgb'), c.get('alpha', 1)

def children(n):
    return n.get(n.get('type'), {}).get('children', n.get('group', {}).get('children', n.get('children', [])))

def bounds(shape):
    """Conservative SVG bounds; Bézier control hull includes the curve."""
    typ=shape.get('type'); points=[]
    if shape.get('path'):
        tokens=re.findall(r'[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?',shape['path'])
        i=0;x=y=sx=sy=0;cmd='M'
        sizes={'M':2,'L':2,'H':1,'V':1,'C':6,'S':4,'Q':4,'T':2,'A':7}
        while i<len(tokens):
            if tokens[i].isalpha():
                cmd=tokens[i];i+=1
                if cmd.upper()=='Z':x,y=sx,sy;continue
            size=sizes.get(cmd.upper())
            if not size or i+size>len(tokens):raise ValueError('Invalid SVG path')
            v=list(map(float,tokens[i:i+size]));i+=size
            relative=cmd.islower();u=cmd.upper();ox,oy=x,y
            if u=='H':x=v[0]+(x if relative else 0);points.append((x,y))
            elif u=='V':y=v[0]+(y if relative else 0);points.append((x,y))
            elif u=='A':
                x=v[5]+(ox if relative else 0);y=v[6]+(oy if relative else 0)
                r=2*(abs(v[0])+abs(v[1])+math.hypot(x-ox,y-oy))
                points.extend([(min(x,ox)-r,min(y,oy)-r),(max(x,ox)+r,max(y,oy)+r)])
            else:
                pts=[(v[j]+(ox if relative else 0),v[j+1]+(oy if relative else 0)) for j in range(0,size,2)]
                points.extend(pts);x,y=pts[-1]
                if u=='M':sx,sy=x,y;cmd='l' if relative else 'L'
                if u in ('S','T'):
                    # Reflected control points may extend beyond explicit points.
                    points.extend([(2*ox-px,2*oy-py) for px,py in pts])
    elif typ=='rect':
        x=shape.get('x',0);y=shape.get('y',0)
        points=[(x,y),(x+shape.get('width',1),y+shape.get('height',1))]
    elif typ in ('circle','ellipse'):
        x=shape.get('cx',0);y=shape.get('cy',0);rx=shape.get('rx',shape.get('r',1));ry=shape.get('ry',shape.get('r',1))
        points=[(x-rx,y-ry),(x+rx,y+ry)]
    elif typ=='line':points=[(shape.get('x1',0),shape.get('y1',0)),(shape.get('x2',0),shape.get('y2',0))]
    elif typ=='polygon':points=[(p['x'],p['y']) for p in shape.get('points',[])]
    if not points:return [0,0,1,1]
    x=min(p[0] for p in points);y=min(p[1] for p in points)
    return [x,y,max(0.01,max(p[0] for p in points)-x),max(0.01,max(p[1] for p in points)-y)]

class Engine:
    def __init__(self, archive):
        self.z = archive
        self.issues = collections.Counter()
        self.stats = collections.Counter()
        self.uid = 0
        self.symbols = {}
        self.boards = {}
        self.assets = {}
        self.docs = []
        infos = archive.infolist()
        if sum(i.file_size for i in infos) > 512 * 1024 * 1024:
            raise ValueError('압축 해제 크기가 512MB를 초과합니다.')
        for i in infos:
            if i.filename.endswith('graphicContent.agc'):
                d = json.loads(archive.read(i))
                self.docs.append((i.filename, d))
                if isinstance(d.get('artboards'), dict) and 'href' not in d['artboards']:
                    self.boards.update(d['artboards'])
                self.index(d)
        if not self.docs:
            raise ValueError('XD scenegraph가 없습니다. 로컬 .xd 파일인지 확인하세요.')

    def index(self, v):
        if isinstance(v, dict):
            if v.get('type') in ('group', 'shape', 'text'):
                for k in ('id', 'guid'):
                    if v.get(k):
                        self.symbols.setdefault(v[k], v)
            for x in v.values():
                self.index(x)
        elif isinstance(v, list):
            for x in v:
                self.index(x)

    def warn(self, message):
        self.issues[message] += 1

    def image(self, pattern):
        uid=pattern.get('meta',{}).get('ux',{}).get('uid')
        candidates=['resources/'+str(uid),pattern.get('href','').lstrip('/')]
        for path in candidates:
            if path in self.z.namelist():
                raw=self.z.read(path)
                if raw.startswith(b'\x89PNG'):mime='image/png'
                elif raw.startswith(b'\xff\xd8'):mime='image/jpeg'
                elif raw.startswith(b'GIF8'):mime='image/gif'
                elif raw.startswith(b'RIFF') and raw[8:12]==b'WEBP':mime='image/webp'
                else:self.warn('지원하지 않는 내장 이미지 형식');return None
                key=uid or path
                self.assets[key]={'mime':mime,'base64':base64.b64encode(raw).decode('ascii')}
                return key
        self.warn('내장 이미지 없음: 외부 이미지 파일을 자동으로 읽지 않음')
        return None

    def paint(self, p, defs):
        if not p or p.get('type') == 'none':
            return 'none', 1
        typ = p.get('type', 'solid')
        if typ == 'solid':
            return color(p.get('color'))
        if typ == 'gradient':
            g = p.get('gradient', {})
            resource = g.get('meta', {}).get('ux', {}).get('gradientResources', g)
            stops = resource.get('stops', [])
            if resource.get('type', 'linear') != 'linear' or not stops:
                self.warn('지원하지 않는 그라디언트: 첫 색 또는 투명으로 대체')
                return color(stops[0].get('color')) if stops else ('none', 1)
            self.uid += 1
            key = 'gradient' + str(self.uid)
            parts = []
            for s in stops:
                c, a = color(s.get('color'))
                parts.append(f'<stop offset="{s.get("offset",0)}" stop-color="{c}" stop-opacity="{a}"/>')
            defs.append(f'<linearGradient id="{key}" x1="{g.get("x1",0)}" y1="{g.get("y1",0)}" x2="{g.get("x2",1)}" y2="{g.get("y2",0)}">{"".join(parts)}</linearGradient>')
            return 'url(#' + key + ')', 1
        if typ == 'pattern':
            ptn=p.get('pattern',{});key=self.image(ptn)
            if key:
                self.uid+=1;pid='image'+str(self.uid);asset=self.assets[key]
                w=ptn.get('width',1);h=ptn.get('height',1)
                defs.append(f'<pattern id="{pid}" width="1" height="1" patternUnits="objectBoundingBox" viewBox="0 0 {w} {h}" preserveAspectRatio="xMidYMid slice"><image width="{w}" height="{h}" href="data:{asset["mime"]};base64,{asset["base64"]}"/></pattern>')
                self.warn('이미지 크롭을 중앙 채우기로 근사')
                return 'url(#'+pid+')',1
        else:
            self.warn('지원하지 않는 채우기: ' + typ)
        return 'none', 1

    def styling(self, n, defs):
        s = n.get('style', {})
        f, fa = self.paint(s.get('fill'), defs)
        st, sa = self.paint(s.get('stroke'), defs)
        stroke = s.get('stroke', {})
        if stroke.get('align', 'center') != 'center' and st != 'none':
            self.warn('안쪽/바깥쪽 선을 중앙 선으로 근사')
        attrs = f'fill="{f}" fill-opacity="{fa}" stroke="{st}" stroke-opacity="{sa}" stroke-width="{stroke.get("width",1)}"'
        if stroke.get('dash'):
            attrs += ' stroke-dasharray="' + ' '.join(map(str,stroke['dash'])) + '"'
        if stroke.get('cap'):
            attrs += f' stroke-linecap="{esc(stroke["cap"])}"'
        if stroke.get('join'):
            attrs += f' stroke-linejoin="{esc(stroke["join"])}"'
        filters = s.get('filters', []) + s.get('effects', [])
        if any(f.get('visible', True) for f in filters):
            self.warn('그림자/블러 효과 미변환')
        if s.get('blendMode', 'normal') != 'normal':
            self.warn('혼합 모드 미변환')
        return attrs

    def shape(self, n, defs):
        s = n.get('shape', {})
        typ = s.get('type')
        a = self.styling(n, defs)
        if s.get('path'):
            return f'<path d="{esc(s["path"])}" {a}/>'
        if typ == 'rect':
            r = s.get('r', [0])
            if isinstance(r, list):
                if len(set(r)) > 1:
                    self.warn('서로 다른 모서리 반경을 첫 반경으로 근사')
                r = r[0] if r else 0
            return f'<rect x="{s.get("x",0)}" y="{s.get("y",0)}" width="{s.get("width",1)}" height="{s.get("height",1)}" rx="{r}" {a}/>'
        if typ in ('ellipse', 'circle'):
            return f'<ellipse cx="{s.get("cx",0)}" cy="{s.get("cy",0)}" rx="{s.get("rx",s.get("r",1))}" ry="{s.get("ry",s.get("r",1))}" {a}/>'
        if typ == 'line':
            return '<line ' + ' '.join(f'{k}="{s.get(k,0)}"' for k in ('x1','y1','x2','y2')) + f' {a}/>'
        if typ == 'polygon':
            points = s.get('points', [])
            return '<polygon points="' + ' '.join(f'{p["x"]},{p["y"]}' for p in points) + f'" {a}/>'
        self.warn('지원하지 않는 도형: ' + str(typ))
        return ''

    def text(self, n):
        t = n.get('text', {})
        font = n.get('style', {}).get('font', {})
        size = font.get('size', 16)
        raw = t.get('rawText', '')
        lines = []
        svg_lines = []
        alignment=n.get('style',{}).get('textAttributes',{}).get('paragraphAlign','left')
        frame=t.get('frame',{})
        frame_width=frame.get('width',0) if frame.get('type') not in ('positioned','autoWidth','auto-width') else 0
        anchor={'center':'middle','right':'end'}.get(alignment,'start')
        encoded=raw.encode('utf-16-le')
        ranges=n.get('meta',{}).get('ux',{}).get('rangedStyles',[])
        # Metadata is sometimes stale (e.g. length=1 on a four-character label).
        # Only apply range offsets when they cover the actual UTF-16 text.
        range_spans=[]
        if sum(r.get('length',0) for r in ranges)==len(encoded)//2:
            cursor=0
            for r in ranges:
                end=cursor+r.get('length',0)
                range_spans.append((cursor,end,r));cursor=end
        def make_span(run,start,end,first):
            value=encoded[start*2:end*2].decode('utf-16-le',errors='replace')
            ranged=next((r for a,b,r in range_spans if a<=start<b),{})
            own=run.get('style',{})
            f=dict(font)
            for src,dst in [('fontFamily','family'),('fontStyle','style'),('fontSize','size')]:
                if src in ranged:f[dst]=ranged[src]
            f.update(own.get('font',{}))
            fill=own.get('fill') or ({'color':ranged['fill']} if 'fill' in ranged else n.get('style',{}).get('fill',{}))
            c,a=color(fill.get('color',fill))
            span={'text':value,'font':f,'color':c,'alpha':a}
            if first:
                if 'x' in run:span['x']=run['x']
                if 'y' in run:span['y']=run['y']
            decoration=[]
            if ranged.get('underline'):decoration.append('underline')
            if ranged.get('strikethrough'):decoration.append('line-through')
            if decoration:span['decoration']=' '.join(decoration)
            if ranged.get('charSpacing'):self.warn('0이 아닌 텍스트 자간은 아직 수동 확인 필요')
            return span
        for para in t.get('paragraphs', []):
            for line in para.get('lines', []):
                spans=[]
                for run in line:
                    # XD offsets count UTF-16 code units, as does Figma.
                    start=run.get('from',0);end=run.get('to',len(encoded)//2)
                    value = encoded[start*2:end*2].decode('utf-16-le',errors='replace')
                    lines.append({'text':value,'x':run.get('x',0),'y':run.get('y',0)})
                    cuts=sorted({start,end}|{p for a,b,_ in range_spans for p in (a,b) if start<p<end})
                    for j,(a,b) in enumerate(zip(cuts,cuts[1:])):
                        spans.append(make_span(run,a,b,j==0))
                if spans:
                    # Only the first chunk of a line defaults to (0,0). Later
                    # chunks with no x/y must continue the SVG text cursor.
                    spans[0].setdefault('x',0);spans[0].setdefault('y',0)
                    if anchor in ('middle','end'):
                        # XD stores centered/right run x relative to the anchor,
                        # while an area-text transform locates the box's left.
                        # SVG text-anchor preserves alignment across fonts and
                        # gives FigCraft one consistent anchor for all lines.
                        spans[0]['x']=frame_width*(0.5 if anchor=='middle' else 1)
                    svg_lines.append(spans)
        if not lines:
            lines = [{'text':raw,'x':0,'y':0}]
            svg_lines=[[dict(make_span({'x':0,'y':0},0,len(encoded)//2,True))]]
        if len(ranges)>1 and not range_spans:
            self.warn('길이가 맞지 않는 혼합 스타일 메타데이터: 실제 줄 구간 스타일 우선')
        self.warn('텍스트 렌더링은 대상 앱의 설치 글꼴/메트릭에 따라 달라질 수 있음')
        c,a = color(n.get('style',{}).get('fill',{}).get('color'))
        return {'lines':lines,'svgLines':svg_lines,'anchor':anchor,'rawText':raw,'frame':t.get('frame',{}),'font':{'family':font.get('family','Inter'),'style':font.get('style','Regular'),'size':size},'color':c,'alpha':a}

    def node(self, n, stack=()):
        typ = n.get('type', 'unknown')
        self.stats[typ] += 1
        if typ == 'syncRef':
            key = n.get('ref') or n.get('syncSourceGuid')
            if key in stack:
                self.warn('순환 컴포넌트 참조 생략')
                return None
            ref = self.symbols.get(key)
            if ref:
                merged = copy.deepcopy(ref)
                merged.update({k:v for k,v in n.items() if k not in ('type','ref','syncSourceGuid')})
                merged['type'] = ref['type']
                self.warn('컴포넌트를 독립 레이어로 변환: 연결/상태/오버라이드 보존 안 됨')
                return self.node(merged, stack+(key,))
            if not children(n):
                self.warn('해결하지 못한 컴포넌트 참조 생략')
                return None
            self.warn('컴포넌트 참조를 내부 레이어로 변환')
        ux = n.get('meta',{}).get('ux',{})
        if ux.get('interactions'):
            self.warn('프로토타입 상호작용 미변환')
        if n.get('group',{}).get('clipPath') or ux.get('mask'):
            self.warn('클리핑 마스크 미변환')
        out = {'id':n.get('id',n.get('guid','')),'name':n.get('name',typ),'kind':typ,'matrix':matrix(n),'visible':n.get('visible',True),'opacity':n.get('opacity',n.get('style',{}).get('opacity',1))}
        if typ == 'shape':
            defs = []
            out['markup'] = self.shape(n, defs)
            out['defs'] = ''.join(defs)
            bb=bounds(n.get('shape',{}))
            pad=n.get('style',{}).get('stroke',{}).get('width',0)*2+1
            out['bounds']=[bb[0]-pad,bb[1]-pad,bb[2]+pad*2,bb[3]+pad*2]
            fill=n.get('style',{}).get('fill',{})
            if fill.get('type')=='pattern' and n.get('shape',{}).get('type')=='rect':
                key=self.image(fill.get('pattern',{}))
                if key:
                    out['image']=key;out['imageBounds']=bb
                    out['imageRadius']=n['shape'].get('r',[0])
                    self.warn('이미지 사각형의 선은 Figma 가져오기에서 생략')
            if not out['markup']:
                return None
        elif typ == 'text':
            out['text'] = self.text(n)
        elif children(n) or typ in ('group','syncRef','artboard'):
            out['children'] = [r for c in children(n) if (r:=self.node(c,stack)) is not None]
        else:
            self.warn('지원하지 않는 레이어: ' + typ)
            return None
        return out

    def convert(self):
        boards = []
        for path, doc in self.docs:
            if not path.startswith('artwork/'):
                continue
            for node in doc.get('children', []):
                if node.get('type') != 'artboard':
                    self.warn('아트보드 밖 붙여넣기 영역 생략')
                    continue
                spec = self.boards.get(node.get('id'), node.get('artboard', {}))
                out = self.node(node)
                out.update({'name':spec.get('name',out['name']),'width':spec.get('width',1920),'height':spec.get('height',1080),'x':spec.get('x',len(boards)*2100),'y':spec.get('y',0)})
                # Artboard children in older XD files can use document coordinates
                # without localTransform. The board's document origin is separate.
                originals={c.get('id',c.get('guid','')):c for c in children(node)}
                for converted in out.get('children',[]):
                    original=originals.get(converted['id'],{})
                    if not original.get('meta',{}).get('ux',{}).get('localTransform'):
                        converted['matrix'][4] -= spec.get('x',0)
                        converted['matrix'][5] -= spec.get('y',0)
                defs=[]
                out['background'] = self.paint(node.get('style',{}).get('fill'), defs)[0]
                if out['background'].startswith('url('):
                    out['background']='none'
                    self.warn('아트보드 그라디언트 배경 미변환')
                boards.append(out)
        if not boards:
            raise ValueError('변환할 아트보드가 없습니다.')
        if any(n.startswith('interactions/') for n in self.z.namelist()):
            self.warn('프로토타입 연결/애니메이션 미변환 (디자인 레이어만 변환)')
        return {'format':VERSION,'boards':boards,'assets':self.assets,'report':{'counts':dict(self.stats),'warnings':dict(self.issues)}}

def render(n):
    a,b,c,d,x,y=n['matrix']
    attrs=f'transform="matrix({a} {b} {c} {d} {x} {y})" opacity="{n["opacity"]}"'
    if not n['visible']:
        attrs+=' display="none"'
    body=n.get('markup','')
    if n.get('defs'):
        body='<defs>'+n['defs']+'</defs>'+body
    if 'text' in n:
        t=n['text'];f=t['font']
        spans=[]
        for line in t.get('svgLines',[[dict(l,font=f,color=t['color'],alpha=t['alpha'])] for l in t['lines']]):
            for s in line:
                position=' '.join(f'{k}="{s[k]}"' for k in ('x','y') if k in s)
                deco=f' text-decoration="{s["decoration"]}"' if s.get('decoration') else ''
                spans.append(f'<tspan {position} {font_attributes(s["font"])} fill="{s["color"]}" fill-opacity="{s["alpha"]}"{deco}>{esc(s["text"])}</tspan>')
        # One text element per original XD text node lets FigCraft group lines
        # and preserve editable text rather than making unrelated fragments.
        body=f'<text id="xd-{esc(n["id"])}" xml:space="preserve" {font_attributes(f)} text-anchor="{t.get("anchor","start")}">'+''.join(spans)+'</text>'
    body+=''.join(render(c) for c in n.get('children',[]))
    return f'<g {attrs}><title>{esc(n["name"])}</title>{body}</g>'

def convert_file(source, output, figcraft_cli=None):
    source=pathlib.Path(source);output=pathlib.Path(output)
    with zipfile.ZipFile(source) as z:
        result=Engine(z).convert()
    output.mkdir(parents=True,exist_ok=True)
    (output/'design.xdbridge.json').write_text(json.dumps(result,ensure_ascii=False),encoding='utf-8')
    (output/'report.json').write_text(json.dumps(result['report'],ensure_ascii=False,indent=2),encoding='utf-8')
    svg_dir=output/'svg';svg_dir.mkdir(exist_ok=True)
    for i,b in enumerate(result['boards'],1):
        safe=re.sub(r'[<>:"/\\|?*\x00-\x1f]','_',b['name'])[:90].strip('. ') or 'artboard'
        content=f'<svg xmlns="http://www.w3.org/2000/svg" width="{b["width"]}" height="{b["height"]}" viewBox="0 0 {b["width"]} {b["height"]}"><rect width="100%" height="100%" fill="{b["background"]}"/>'+''.join(render(c) for c in b.get('children',[]))+'</svg>'
        svg_path=svg_dir/f'{i:03d}-{safe}.svg'
        svg_path.write_text(content,encoding='utf-8')
        if figcraft_cli:
            native_dir=output/'figcraft';native_dir.mkdir(exist_ok=True)
            subprocess.run([str(figcraft_cli),'convert',str(svg_path),str(native_dir/(svg_path.stem+'.figcraft'))],check=True,capture_output=True)
    return result

def main():
    parser=argparse.ArgumentParser(description='무료 로컬 XD 변환기: SVG + Figma 플러그인용 JSON')
    parser.add_argument('source',nargs='?');parser.add_argument('-o','--output');parser.add_argument('--gui',action='store_true')
    parser.add_argument('--figcraft-cli',help='SVG를 네이티브 .figcraft로 저장할 CLI 경로')
    args=parser.parse_args()
    if args.gui or not args.source:
        import tkinter as tk
        from tkinter import filedialog,messagebox
        root=tk.Tk();root.withdraw()
        source=filedialog.askopenfilename(title='변환할 XD 파일',filetypes=[('Adobe XD','*.xd')])
        if not source:return
        output=filedialog.askdirectory(title='변환 결과를 저장할 폴더')
        if not output:return
        try:
            cli=args.figcraft_cli or shutil.which('figcraft-cli')
            if not cli and pathlib.Path('C:/Program Files/FigCraft/figcraft-cli.exe').exists():cli='C:/Program Files/FigCraft/figcraft-cli.exe'
            result=convert_file(source,pathlib.Path(output)/(pathlib.Path(source).stem+'-converted'),cli)
            messagebox.showinfo('변환 완료',f'{len(result["boards"])}개 아트보드 변환 완료.\nFigCraft에서 figcraft 폴더의 .figcraft 파일을 여세요.\n해당 폴더가 없으면 svg 폴더의 SVG를 가져오세요.\n제한 사항은 report.json에 기록했습니다.')
        except Exception as e:messagebox.showerror('변환 실패',str(e))
    else:
        output=args.output or str(pathlib.Path(args.source).with_suffix(''))+'-converted'
        result=convert_file(args.source,output,args.figcraft_cli)
        print(json.dumps({'artboards':len(result['boards']),'output':output,'report':result['report']},ensure_ascii=True))

if __name__=='__main__':
    main()
