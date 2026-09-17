import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {analyze} from '../web/core.js';
import {reportHTML} from '../web/report.js';
const root=fileURLToPath(new URL('../',import.meta.url));
const run=(...args)=>spawnSync(process.execPath,['cli.mjs',...args],{cwd:root,encoding:'utf8'});
const inspect=(csv,rules={})=>JSON.parse(analyze(csv,JSON.stringify(rules)));
test('CLI reports six known defects and exits 1',()=>{
  const result=run('examples/orders.csv','--rules','examples/rules.json');assert.equal(result.status,1);
  const r=JSON.parse(result.stdout);assert.deepEqual([r.rows,r.passedRows,r.failedRows,r.issueCount],[6,3,3,6]);
  assert.deepEqual(r.issues.map(i=>i.code),['min','unique','enum','required','type','type']);
});
test('clean input exits 0',()=>{const r=run('examples/clean.csv','--rules','examples/rules.json');assert.equal(r.status,0);assert.equal(JSON.parse(r.stdout).status,'pass');});
test('invalid options and missing files exit 2',()=>{
  for(const args of [[],['missing.csv'],['examples/clean.csv','--oops'],['examples/clean.csv','--rules'],['examples/clean.csv','--rules','missing.json']])assert.equal(run(...args).status,2);
  assert.equal(run('--help').status,0);
});
test('exports, invalid UTF-8 and overwrite guard',()=>{
  const dir=mkdtempSync(join(tmpdir(),'csv-doctor-'));
  try{
    const html=join(dir,'report.html'),json=join(dir,'report.json');
    assert.equal(run('examples/orders.csv','--rules','examples/rules.json','--html',html,'--json',json).status,1);
    assert.equal(JSON.parse(readFileSync(json,'utf8')).issueCount,6);assert.match(readFileSync(html,'utf8'),/数据质量报告/);
    const bad=join(dir,'bad.csv');writeFileSync(bad,Buffer.from([0xff,0xfe,0xff]));assert.equal(run(bad).status,2);
    assert.equal(run('examples/clean.csv','--json','examples/clean.csv').status,2);
    assert.equal(run('examples/clean.csv','--html',html,'--json',html).status,2);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
test('HTML escapes untrusted values and filename',()=>{
  const html=reportHTML(inspect('name\n<script>alert(1)</script>',{columns:[{column:'name',enum:['ok']}]}),'<img src=x onerror=alert(2)>');
  assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<img'));assert.ok(html.includes('&lt;script&gt;'));
});
test('delimiters and unicode',()=>{
  assert.equal(inspect('姓名;标签\n张三;😀',{delimiter:';'}).status,'pass');
  assert.equal(inspect('a💠b\nx💠y',{delimiter:'💠'}).status,'pass');
});
test('strict configuration',()=>{
  for(const rules of [{columns:[{column:'a',requred:true}]},{columns:[{column:'a'},{column:'a'}]},{columns:[{column:'a',type:'date'}]},{columns:[{column:'a',type:'number',min:5,max:3}]},{delimiter:'"'},{columns:[{column:'a',unique:null}]}])assert.equal(inspect('a\n1',rules).status,'error');
});
test('generated CSV corpus: escaped quotes, commas, unicode and physical lines',()=>{
  const values=['','simple','a,b','"quoted"','line\nbreak','carriage\rreturn','CR\r\nLF','中文😀','<>&',' spaced '];
  const quote=s=>'"'+s.replaceAll('"','""')+'"';
  for(let seed=0;seed<50;seed++){
    const cells=Array.from({length:10},(_,i)=>values[(seed*3+i*7)%values.length]);
    const csv='id,value\r\n'+cells.map((s,i)=>`${i},${quote(s)}`).join('\r\n');
    const r=inspect(csv,{columns:[{column:'id',unique:true,type:'integer'},{column:'value',enum:values}]});
    assert.equal(r.status,'pass',JSON.stringify(r));assert.equal(r.rows,10);
  }
});
test('20,000 rows: deterministic duplicate counts',()=>{
  const csv='id,value\n'+Array.from({length:20000},(_,i)=>`${i%10000},${i}`).join('\n');
  const r=inspect(csv,{columns:[{column:'id',unique:true},{column:'value',type:'number',min:0}]});
  assert.equal(r.rows,20000);assert.equal(r.failedRows,10000);assert.equal(r.issueCount,10000);
});

test('CLI preserves CSV BOM byte offsets while accepting BOM-prefixed rule JSON',()=>{
  const dir=mkdtempSync(join(tmpdir(),'csv-doctor-bom-'));
  try {
    const csv=join(dir,'source.csv'),rules=join(dir,'rules.json');
    const source='\uFEFFid,n\r\n😀,bad\r\n';
    writeFileSync(csv,source);writeFileSync(rules,'\uFEFF'+JSON.stringify({columns:[{column:'n',type:'integer'}]}));
    const result=run(csv,'--rules',rules);assert.equal(result.status,1);
    const span=JSON.parse(result.stdout).issues[0].span;
    assert.equal(span.startByte,Buffer.byteLength(source.slice(0,source.indexOf('bad'))));
    assert.equal(span.startUtf16,source.indexOf('bad'));
  } finally {rmSync(dir,{recursive:true,force:true});}
});
