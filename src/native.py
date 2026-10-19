"""Experimental, dependency-free FigCraft v1 writer. No Figma or native CLI.

Native schema reference: https://github.com/storytold/figcraft (MIT/Apache-2.0).
This is original implementation; font metrics remain approximate.
"""
import base64
import hashlib
import io
import json
import math
import re
import struct
import xml.etree.ElementTree as ET
import zipfile

def rgba(hex_value,alpha=1):
    return {**{k:int(hex_value[i:i+2],16)/255 for k,i in zip('rgb',(1,3,5))},'a':float(alpha)}

def solid(value,alpha=1):
    return {'type':'solid','color':rgba(value,alpha),'opacity':1,'visible':True,'blend':'normal'}

def moved(matrix,x,y):
    a,b,c,d,tx,ty=matrix
    return [a,b,c,d,tx+a*x+c*y,ty+b*x+d*y]

def vector_network(path):
    tokens=re.findall(r'[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?',path)
    sizes={'M':2,'L':2,'H':1,'V':1,'C':6,'S':4,'Q':4,'T':2}
    vertices=[];segments=[];loops=[];loop=[];current=None;start=None;last_control=None;previous='';i=0;cmd='M'
    def vertex(x,y):
        vertices.append({'x':x,'y':y,'radius':0});return len(vertices)-1
    def edge(end,c1=None,c2=None):
        nonlocal current
        a=vertices[current];b=vertices[end]
        seg={'a':current,'b':end,'ta':[0,0] if c1 is None else [c1[0]-a['x'],c1[1]-a['y']],'tb':[0,0] if c2 is None else [c2[0]-b['x'],c2[1]-b['y']]}
        loop.append(len(segments));segments.append(seg);current=end
    while i<len(tokens):
        if tokens[i].isalpha():
            cmd=tokens[i];i+=1
            if cmd.upper()=='Z':
                if current is not None and start is not None:
                    if current!=start:edge(start)
                    if loop:loops.append(loop);loop=[]
                previous='Z';last_control=None;continue
        u=cmd.upper();num=sizes.get(u)
        if not num:raise ValueError('지원하지 않는 벡터 명령: '+cmd)
        if i+num>len(tokens):raise ValueError('벡터 데이터 길이 오류')
        v=list(map(float,tokens[i:i+num]));i+=num
        ox=vertices[current]['x'] if current is not None else 0;oy=vertices[current]['y'] if current is not None else 0
        rel=cmd.islower()
        def point(j):return [v[j]+(ox if rel else 0),v[j+1]+(oy if rel else 0)]
        control=None
        if u=='M':
            if loop:loop=[]
            current=start=vertex(*point(0));cmd='l' if rel else 'L'
        elif current is None:raise ValueError('시작점 없는 벡터')
        elif u=='L':edge(vertex(*point(0)))
        elif u=='H':edge(vertex(v[0]+(ox if rel else 0),oy))
        elif u=='V':edge(vertex(ox,v[0]+(oy if rel else 0)))
        elif u=='C':
            c1=point(0);c2=point(2);edge(vertex(*point(4)),c1,c2);control=c2
        elif u=='S':
            c1=[2*ox-last_control[0],2*oy-last_control[1]] if previous in ('C','S') and last_control else [ox,oy]
            c2=point(0);edge(vertex(*point(2)),c1,c2);control=c2
        elif u in ('Q','T'):
            q=point(0) if u=='Q' else ([2*ox-last_control[0],2*oy-last_control[1]] if previous in ('Q','T') and last_control else [ox,oy])
            end=point(2) if u=='Q' else point(0)
            c1=[ox+2*(q[0]-ox)/3,oy+2*(q[1]-oy)/3];c2=[end[0]+2*(q[0]-end[0])/3,end[1]+2*(q[1]-end[1])/3]
            edge(vertex(*end),c1,c2);control=q
        previous=u;last_control=control
    if not vertices:raise ValueError('빈 벡터')
    minx=min(v['x'] for v in vertices);miny=min(v['y'] for v in vertices)
    maxx=max(v['x'] for v in vertices);maxy=max(v['y'] for v in vertices)
    for v in vertices:v['x']-=minx;v['y']-=miny
    return {'vertices':vertices,'segments':segments,'regions':[{'loops':loops,'winding':'nonZero'}] if loops else []},[minx,miny,max(.01,maxx-minx),max(.01,maxy-miny)]

def image_size(raw):
    if raw.startswith(b'\x89PNG'):return struct.unpack('>II',raw[16:24])
    if raw.startswith(b'GIF8'):return struct.unpack('<HH',raw[6:10])
    if raw.startswith(b'\xff\xd8'):
        i=2
        while i+4<len(raw):
            if raw[i]!=255:i+=1;continue
            marker=raw[i+1];i+=2
            if marker in (0xd8,0xd9):continue
            length=int.from_bytes(raw[i:i+2],'big')
            if marker in (0xc0,0xc1,0xc2,0xc3):return (int.from_bytes(raw[i+5:i+7],'big'),int.from_bytes(raw[i+3:i+5],'big'))
            if length<2:break
            i+=length
    if raw.startswith(b'RIFF') and raw[8:12]==b'WEBP' and raw[12:16]==b'VP8X':return (1+int.from_bytes(raw[24:27],'little'),1+int.from_bytes(raw[27:30],'little'))
    raise ValueError('이미지 크기를 읽을 수 없습니다. SVG 출력을 이용하세요.')

class Writer:
    def __init__(self,package,board):
        self.package=package;self.board=board;self.nodes={};self.next_id=1;self.images={};self.image_index=[];self.warnings=[]
    def add(self,typ,name,parent=None,matrix=None,width=1,height=1,**extra):
        nid=self.next_id;self.next_id+=1
        n={'id':nid,'type':typ,'name':name,'width':max(.01,width),'height':max(.01,height),**extra}
        if parent is not None:n['parent']=parent;self.nodes[str(parent)].setdefault('children',[]).append(nid)
        if matrix:n['transform']=matrix
        self.nodes[str(nid)]=n;return n
    def paint(self,element,attribute,defs):
        value=element.get(attribute,'none')
        if value=='none':return []
        if value.startswith('#'):return [solid(value,element.get(attribute+'-opacity',1))]
        if value.startswith('url(#'):
            key=value[5:-1];definition=next((d for d in defs if d.get('id')==key),None)
            if definition is not None and definition.tag=='pattern':
                image=definition.find('image');url=image.get('href','') if image is not None else ''
                if not url.startswith('data:image/'):return []
                raw=base64.b64decode(url.split(',',1)[1]);digest=hashlib.sha256(raw).hexdigest()
                if digest not in self.images:
                    w,h=image_size(raw);self.image_index.append({'hash':digest,'width':w,'height':h});self.images[digest]=raw
                return [{'type':'image','image':digest,'scale_mode':'fill','opacity':1,'visible':True,'blend':'normal'}]
            if definition is not None and definition.tag=='linearGradient':
                self.warnings.append('FigCraft 직접 저장: 선형 그라디언트를 첫 색으로 근사')
                stop=definition.find('stop')
                if stop is not None:return [solid(stop.get('stop-color','#000000'),stop.get('stop-opacity',1))]
        return []
    def shape(self,src,parent):
        element=ET.fromstring(src['markup']);defs=list(ET.fromstring('<defs>'+src.get('defs','')+'</defs>'))
        typ=element.tag;g=lambda key,default=0:float(element.get(key,default))
        extra={}
        if typ=='rect':
            kind='rectangle';bb=[g('x'),g('y'),g('width',1),g('height',1)]
            extra['corners']={'radii':[g('rx')]*4,'smoothing':0}
        elif typ=='ellipse':kind='ellipse';bb=[g('cx')-g('rx'),g('cy')-g('ry'),2*g('rx'),2*g('ry')]
        else:
            kind='vector'
            if typ=='path':path=element.get('d','')
            elif typ=='line':path=f'M {g("x1")} {g("y1")} L {g("x2")} {g("y2")}'
            elif typ=='polygon':
                pts=re.findall(r'[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?',element.get('points',''))
                path=' '.join(('M' if i==0 else 'L')+' '+pts[i]+' '+pts[i+1] for i in range(0,len(pts),2))+' Z'
            else:raise ValueError('미지원 도형 '+typ)
            network,bb=vector_network(path);extra['network']=network
        fills=self.paint(element,'fill',defs);strokes=self.paint(element,'stroke',defs)
        n=self.add(kind,src['name'],parent,moved(src['matrix'],bb[0],bb[1]),bb[2],bb[3],fills=fills,strokes=strokes,**extra)
        if strokes:n['stroke']={'weight':g('stroke-width',1),'align':'center','join':element.get('stroke-linejoin','miter'),'dashes':[float(v) for v in element.get('stroke-dasharray','').split()]}
        return n
    def text(self,src,parent):
        t=src['text'];f=t['font'];lines=t.get('svgLines',[])
        if not lines:return None
        # Recreate each original line, merging regular lines to one editable box.
        first=lines[0][0];size=float(f['size']);ys=[float(l[0].get('y',0)) for l in lines]
        pitch=ys[1]-ys[0] if len(ys)>1 else size*1.2
        if pitch<=0:pitch=size*1.2
        width=float(t.get('frame',{}).get('width',0))
        if not width:
            old=t.get('lines',[])
            if t.get('anchor')=='middle' and old:width=max(.01,max(-2*l['x'] for l in old))
            elif t.get('anchor')=='end' and old:width=max(.01,max(-l['x'] for l in old))
            else:width=max(.01,max(sum(size*(1 if ord(c)>255 else .6) for c in ''.join(s['text'] for s in line)) for line in lines))
        anchor=t.get('anchor','start');factor={'start':0,'middle':.5,'end':1}[anchor]
        x=float(first.get('x',0))-width*factor
        # Font-specific metrics remain approximate and are reported, never claimed exact.
        ascent=size*(.854 if 'nanumbarungothic' in f['family'].lower() else .8)
        y=float(first.get('y',0))-ascent
        text='\n'.join(''.join(s['text'] for s in line) for line in lines)
        style={'font_family':f['family'],'font_style':f.get('style','Regular'),'font_size':size,'line_height':{'unit':'pixels','value':pitch},'letter_spacing':{'unit':'percent','value':0}}
        runs=[];offset=0
        for line in lines:
            for span in line:
                end=offset+len(span['text'].encode('utf-8'));own=span['font']
                own_style={**style,'font_family':own.get('family',f['family']),'font_style':own.get('style',f.get('style','Regular')),'font_size':own.get('size',size),'fills':[solid(span['color'],span['alpha'])]}
                runs.append({'start':offset,'end':end,'style':own_style});offset=end
            offset+=1
        return self.add('text',src['name'],parent,moved(src['matrix'],x,y),width,max(size,len(lines)*pitch),characters=text,style=style,runs=runs,align_h={'start':'left','middle':'center','end':'right'}[anchor],auto_resize='widthAndHeight',fills=[solid(t['color'],t['alpha'])])
    def node(self,src,parent):
        try:
            if src['kind']=='shape':n=self.shape(src,parent)
            elif src['kind']=='text':n=self.text(src,parent)
            else:
                n=self.add('group',src['name'],parent,src['matrix'],1,1,children=[])
                for child in src.get('children',[]):self.node(child,n['id'])
            if n:n['visible']=src['visible'];n['opacity']=src['opacity']
        except (ValueError,KeyError,TypeError,ET.ParseError) as error:
            self.warnings.append(src['name']+': '+str(error))
    def write(self):
        page=self.add('page','XD 변환',children=[])
        b=self.board
        board=self.add('frame',b['name'],page['id'],[1,0,0,1,0,0],b['width'],b['height'],clip=True,children=[],fills=[] if b['background']=='none' else [solid(b['background'])])
        for child in b.get('children',[]):self.node(child,board['id'])
        doc={'format':'figcraft','version':1,'name':b['name'],'next_id':self.next_id,'pages':[page['id']],'current_page':page['id'],'nodes':self.nodes,'imageIndex':self.image_index,'styles':[],'variables':{'collections':[],'variables':[]},'comments':[]}
        stream=io.BytesIO()
        with zipfile.ZipFile(stream,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
            z.writestr('document.json',json.dumps(doc,ensure_ascii=False))
            for key,raw in self.images.items():z.writestr('images/'+key,raw)
            z.writestr('XD-BRIDGE-REPORT.txt','실험적 FigCraft 직접 출력. 텍스트 기준선과 너비는 근사값입니다.\n'+'\n'.join(self.warnings))
        return stream.getvalue(),self.warnings

def native_bytes(package,index):
    return Writer(package,package['boards'][index]).write()
