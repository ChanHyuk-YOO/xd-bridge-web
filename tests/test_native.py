import io
import json
import pathlib
import sys
import unittest
import zipfile

sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'src'))
from native import vector_network,native_bytes

class NativeTests(unittest.TestCase):
    def test_compound_path_holes_share_one_region(self):
        net,box=vector_network('M0 0 L20 0 L20 20 L0 20 Z M5 5 L5 15 L15 15 L15 5 Z')
        self.assertEqual(len(net['regions']),1)
        self.assertEqual(len(net['regions'][0]['loops']),2)
        self.assertEqual(box,[0.0,0.0,20.0,20.0])

    def test_cubic_handles_are_relative_to_vertices(self):
        net,_=vector_network('M10 20 C15 20 20 25 20 30')
        self.assertEqual(net['segments'][0]['ta'],[5,0])
        self.assertEqual(net['segments'][0]['tb'],[0,-5])

    def test_quadratic_is_converted_to_cubic(self):
        net,_=vector_network('M0 0 Q3 3 6 0')
        self.assertEqual(net['segments'][0]['ta'],[2,2])
        self.assertEqual(net['segments'][0]['tb'],[-2,2])

    def test_unsupported_arc_is_explicitly_rejected(self):
        with self.assertRaises(ValueError):vector_network('M0 0 A10 10 0 0 0 20 0')

    def test_archive_preserves_editable_text_and_has_no_external_paths(self):
        text={'id':'t','kind':'text','name':'한글','matrix':[1,0,0,1,10,20],'visible':True,'opacity':1,'text':{'font':{'family':'Inter','style':'Bold','size':20},'lines':[{'text':'한글','x':0,'y':16}],'svgLines':[[{'text':'한글','x':0,'y':16,'font':{'family':'Inter','style':'Bold','size':20},'color':'#000000','alpha':1}]],'color':'#000000','alpha':1,'anchor':'start','frame':{}}}
        board={'name':'테스트','width':100,'height':100,'background':'#ffffff','children':[text]}
        raw,warnings=native_bytes({'boards':[board]},0)
        with zipfile.ZipFile(io.BytesIO(raw)) as z:
            self.assertEqual(set(z.namelist()),{'document.json','XD-BRIDGE-REPORT.txt'})
            doc=json.loads(z.read('document.json'))
        n=next(n for n in doc['nodes'].values() if n['type']=='text')
        self.assertEqual(n['characters'],'한글');self.assertEqual(n['style']['font_style'],'Bold')
        self.assertEqual(doc['format'],'figcraft');self.assertEqual(warnings,[])

if __name__=='__main__':unittest.main()
