import test from 'node:test';
import assert from 'node:assert/strict';
import {analyze} from './core.js';
import {RepairHistory, fieldPatch, applyPatch} from './repair.js';
const rules=JSON.stringify({columns:[{column:'n',type:'integer',required:true}]});
const inspect=source=>JSON.parse(analyze(source,rules));
test('MoonBit field spans locate original UTF-8 / UTF-16 with BOM, emoji, CRLF and multiline quotes',()=>{
  const source='\uFEFFid,n\r\n"中😀\r\nx","bad"\r\ny,2';
  const report=inspect(source);assert.equal(report.status,'fail');
  const issue=report.issues[0], start=source.indexOf('"bad"');
  assert.equal(issue.line,2);
  assert.deepEqual(issue.span,{startUtf16:start,endUtf16:start+5,
    startByte:Buffer.byteLength(source.slice(0,start)),endByte:Buffer.byteLength(source.slice(0,start+5)),
    startLine:3,startColumn:4,endLine:3,endColumn:9});
  assert.equal(source.slice(issue.span.startUtf16,issue.span.endUtf16),'"bad"');
});
test('all line ending styles and non-BMP delimiters yield usable spans',()=>{
  for(const newline of ['\n','\r','\r\n']) for(const delimiter of [',',';','😀']){
    const source=`id${delimiter}n${newline}中${delimiter}"bad"${newline}`;
    const report=JSON.parse(analyze(source,JSON.stringify({delimiter,columns:[{column:'n',type:'integer'}]})));
    const issue=report.issues[0];assert.equal(issue.span.startLine,2);assert.equal(issue.span.startColumn,3);
    const patch=fieldPatch(source,issue,'3',delimiter);
    assert.equal(applyPatch(source,patch),source.replace('"bad"','"3"'));
  }
});
test('empty real fields are repairable; absent cells and width errors have no span',()=>{
  for(const source of ['id,n\nA,','id,n\nA,\r\n','id,n\nA,""']){
    const issue=inspect(source).issues.find(i=>i.code==='required');assert.ok(issue.span);
    assert.equal(inspect(applyPatch(source,fieldPatch(source,issue,'5'))).status,'pass');
  }
  const report=inspect('id,n\nA');
  assert.equal(report.issues.find(i=>i.code==='required').span,undefined);
  assert.equal(report.issues.find(i=>i.code==='column_count').span,undefined);
  assert.throws(()=>fieldPatch('id,n\nA',report.issues[0],'5'),/范围/);
});
test('surgical patch preserves BOM, mixed newlines and other quoting; undo restores exact bytes',async()=>{
  const source='\uFEFFid,n\r\n"中😀\n""x""",bad\rB,no\n';
  const history=new RepairHistory(source);
  const first=history.preview(inspect(history.current).issues[0],'7',',');history.apply(first);
  assert.equal(history.current,source.replace('bad','"7"'));
  history.apply(history.preview(inspect(history.current).issues[0],'8',','));assert.equal(inspect(history.current).status,'pass');
  assert.equal(history.undo(),first.result);assert.equal(history.undo(),source);
  assert.deepEqual(Buffer.from(history.current),Buffer.from(source));
  const audit=await history.audit(rules);assert.equal(audit.originalSha256,audit.resultSha256);
  assert.equal(audit.events.length,4);
  let replay=source;for(const event of audit.events) replay=applyPatch(replay,event.patch);
  assert.equal(replay,source);
});
test('replacement quotes delimiter, quotes and newlines without creating additional cells',()=>{
  const source='id,n\nA,bad';const issue=inspect(source).issues[0];
  const value='a,"x"\r\nb';const result=applyPatch(source,fieldPatch(source,issue,value));
  const report=inspect(result);assert.equal(report.rows,1);assert.equal(report.issues[0].value,value);
  assert.equal(report.issues.some(i=>i.code==='column_count'),false);
});
test('reject stale previews and no-op values; duplicate diagnostics cannot reapply an old offset',()=>{
  const history=new RepairHistory('id,n\nA,bad');const issue=inspect(history.current).issues[0];
  const preview=history.preview(issue,'22',',');history.apply(preview);
  assert.throws(()=>history.apply(preview),/过期/);
  assert.throws(()=>fieldPatch('id,n\nA,bad',issue,'bad'),/相同/);
  assert.throws(()=>fieldPatch('😀id,n\nA,bad',issue,'3'),/位置/);
});
