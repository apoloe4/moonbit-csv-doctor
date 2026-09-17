import test from 'node:test';
import assert from 'node:assert/strict';
import {addColumnRule as add} from './rule-builder.js';
const fields={column:'amount',type:'number',required:true,min:'0',max:'100',enumText:'["1","2"]'};
test('builder preserves existing rules and delimiter',()=>{
 const r=JSON.parse(add('{"delimiter":";","columns":[{"column":"id","unique":true}]}',fields));
 assert.equal(r.delimiter,';');assert.equal(r.columns.length,2);assert.equal(r.columns[0].unique,true);assert.equal(r.columns[1].min,0);assert.deepEqual(r.columns[1].enum,['1','2']);
});
test('builder rejects malformed, duplicate and contradictory input',()=>{
 assert.throws(()=>add('{',fields));assert.throws(()=>add('{}',{...fields,min:'200'}));
 assert.throws(()=>add('{}',{...fields,type:'string'}));assert.throws(()=>add('{}',{...fields,enumText:'[1]'}));
 assert.throws(()=>add(add('{}',fields),fields));assert.throws(()=>add('{}',{...fields,column:' '}));
});
