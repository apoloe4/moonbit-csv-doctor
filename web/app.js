import {reportHTML, escapeHTML as e} from './report.js';
import {mountRuleBuilder} from './rule-builder.js';
const $ = id=>document.getElementById(id);
const sampleCSV = 'order_id,customer,amount,status,paid\nORD-001,张三,128.50,paid,true\nORD-002,李四,-20,pending,false\nORD-001,王五,99,unknown,true\nORD-004,,abc,paid,yes\nORD-005,"赵六,公司",350,paid,true\nORD-006,"跨行\n客户",240,pending,false\n';
const sampleRules = {delimiter:',',columns:[{column:'order_id',required:true,unique:true},{column:'customer',required:true},{column:'amount',type:'number',required:true,min:0,max:100000},{column:'status',enum:['paid','pending','cancelled']},{column:'paid',type:'boolean'}]};
let report, filename='粘贴的数据.csv', worker, serial=0;
const notice = (text,kind='') => {$('notice').textContent=text;$('notice').className='notice '+kind;};
function invalidate() {
  serial++; worker?.terminate(); worker=null;
  report=null;$('run').disabled=false;$('run').innerHTML='开始体检 <span>→</span>';
  $('export-json').disabled=true;$('export-html').disabled=true;
  $('report').hidden=true;$('empty').hidden=false;
  notice('数据或规则已更新，请重新体检。');
}
$('csv').addEventListener('input',()=>{filename='粘贴的数据.csv';$('filename').textContent=filename;invalidate();});
$('rules').addEventListener('input',invalidate);
mountRuleBuilder($('rules'), invalidate);
$('reset').onclick=()=>{$('rules').value='{"columns":[]}';invalidate();};
$('sample').onclick=()=>{$('csv').value=sampleCSV;$('rules').value=JSON.stringify(sampleRules,null,2);filename='示例订单.csv';$('filename').textContent=filename;invalidate();run();};
async function loadFile(file) {
  if(!file) return;
  invalidate(); const ticket=serial;
  try {
    if(file.size>10*1024*1024) throw Error('文件超过 10 MiB，请先拆分文件。');
    const text = new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer());
    if(ticket!==serial)return;
    $('csv').value=text;filename=file.name;$('filename').textContent=`${file.name} · ${(file.size/1024).toFixed(1)} KiB`;
    notice('文件已载入，请配置规则并开始体检。');
  }catch(err){if(ticket===serial)notice('无法读取文件：'+err.message,'error');}
}
$('file').onchange=ev=>loadFile(ev.target.files[0]);
for(const event of ['dragover','dragleave','drop']) $('drop').addEventListener(event,ev=>{ev.preventDefault();$('drop').classList.toggle('over',event==='dragover');if(event==='drop')loadFile(ev.dataTransfer.files[0]);});
function run() {
  invalidate();
  const csv=$('csv').value,rules=$('rules').value;
  if(new TextEncoder().encode(csv).length>10*1024*1024 || new TextEncoder().encode(rules).length>1024*1024){notice('CSV 最大 10 MiB，规则最大 1 MiB。','error');return;}
  $('run').disabled=true;$('run').textContent='正在体检…';notice('MoonBit 引擎正在检查数据…');
  const id=serial;
  worker=new Worker(new URL('./worker.js',import.meta.url),{type:'module'});
  worker.onmessage=({data})=>{
    if(data.id!==serial)return;
    worker.terminate();worker=null;$('run').disabled=false;$('run').innerHTML='开始体检 <span>→</span>';
    if(data.report.status==='error'){notice(data.report.message,'error');return;}
    report=data.report;render();
  };
  worker.onerror=()=>{if(id!==serial)return;invalidate();notice('核心引擎加载失败，请使用 npm start 打开页面。','error');};
  worker.postMessage({id,csv,rules});
}
$('run').onclick=run;
function render() {
  $('empty').hidden=true;$('report').hidden=false;$('export-json').disabled=false;$('export-html').disabled=false;
  $('rows').textContent=report.rows;$('passed').textContent=report.passedRows;$('failed').textContent=report.failedRows;$('issues').textContent=report.issueCount;
  const rate=report.rows?report.passedRows/report.rows*100:100;
  $('rate').textContent=rate.toFixed(1)+'%';$('bar').style.width=rate+'%';
  notice(report.status==='pass'?'体检完成：全部数据通过当前规则检查。':`体检完成：${report.failedRows} 行数据存在问题，共 ${report.issueCount} 条。` ,report.status==='pass'?'success':'');
  $('profiles').innerHTML=report.profiles.map(p=>`<span>${e(p.column)}<b>${p.missing}</b></span>`).join('');
  $('filter').value='all';renderIssues();
}
function renderIssues(){
  if(!report)return;
  const list=report.issues.filter(i=>$('filter').value==='all'||i.code===$('filter').value);
  $('issue-list').innerHTML=list.slice(0,200).map(i=>`<tr><td>${i.line}</td><td><strong>${e(i.column||'整行')}</strong><code>${e(i.value||'（空）')}</code></td><td><span class="pill">${e(i.code)}</span>${e(i.message)}</td></tr>`).join('')||'<tr><td colspan="3">当前筛选下没有问题。</td></tr>';
  $('table-note').textContent=`共 ${list.length} 条${list.length>200?'，页面展示前 200 条，导出包含全部结果':''}。行号对应记录在原文件中的起始行。`;
}
$('filter').onchange=renderIssues;
function download(content,type,suffix){const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=filename.replace(/\.[^.]+$/,'')+'-report.'+suffix;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('export-json').onclick=()=>report&&download(JSON.stringify(report,null,2),'application/json','json');
$('export-html').onclick=()=>report&&download(reportHTML(report,filename),'text/html','html');
