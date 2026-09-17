import {RepairHistory} from './repair.js';
import {analyze} from './core.js';
export function mountRepair({getSource, getRules, setSource, notice, download}) {
  const panel = document.createElement('section');
  panel.className = 'panel repair-panel';
  panel.innerHTML = `<h3>定位与修复</h3><p class="hint">点击问题旁的“定位 / 修复”。新值由你确认；只替换选中的字段，原文件不会被覆盖。手动编辑或载入新数据会开始新的修复会话。</p>
    <div id="repair-selection" hidden><p id="repair-location"></p><pre id="repair-context"></pre>
    <label class="label" for="repair-value">替换后的字段值（留空表示空值）</label><textarea id="repair-value" rows="2"></textarea>
    <button id="repair-preview">预览替换</button><pre id="repair-diff" hidden></pre><button id="repair-apply" hidden>确认应用并重新体检</button></div>
    <div class="exports"><button id="repair-undo" disabled>撤销上次修复</button><button id="repair-csv" disabled>下载当前 CSV</button><button id="repair-original" disabled>下载会话原始 CSV</button><button id="repair-log" disabled>下载修复记录</button></div>
    <p id="repair-count" class="hint">尚未修复。记录保留原值与新值，导出前请留意数据内容。</p>`;
  document.querySelector('.results').append(panel);
  const $ = id => panel.querySelector('#'+id);
  let history = new RepairHistory(getSource()), selected, preview;
  function clear() { selected = preview = null; $('repair-selection').hidden=true; $('repair-apply').hidden=true; $('repair-diff').hidden=true; }
  function refresh() {
    $('repair-undo').disabled=!history.stack.length;
    for (const id of ['repair-csv','repair-original','repair-log']) $(id).disabled=!history.events.length;
    $('repair-count').textContent=`当前保留 ${history.stack.length} 次修复，共 ${history.events.length} 次应用/撤销记录。手动编辑数据会重置记录，请先导出。`;
  }
  $('repair-value').oninput=()=>{preview=null;$('repair-apply').hidden=true;$('repair-diff').hidden=true;};
  $('repair-preview').onclick=()=>{
    try {
      if(!selected || getSource()!==history.current) throw Error('数据已变更，请重新体检。');
      preview=history.preview(selected,$('repair-value').value,JSON.parse(getRules()).delimiter??',');
      if(new TextEncoder().encode(preview.result).length>10*1024*1024) throw Error('修复后文件超过 10 MiB。');
      const result=JSON.parse(analyze(preview.result,getRules()));
      if(result.status==='error') throw Error(result.message);
      $('repair-diff').textContent=`原始字段：${JSON.stringify(preview.patch.before)}\n替换字段：${JSON.stringify(preview.patch.after)}\n重新体检：${result.issueCount} 条问题，${result.failedRows} 行异常。确认后才会应用。`;
      $('repair-diff').hidden=false;$('repair-apply').hidden=false;
    } catch(err) { preview=null;$('repair-apply').hidden=true;notice(err.message,'error'); }
  };
  $('repair-apply').onclick=()=>{
    try { if(!preview || getSource()!==preview.base) throw Error('预览已过期。');const result=history.apply(preview);clear();refresh();setSource(result); }
    catch(err){notice(err.message,'error');}
  };
  $('repair-undo').onclick=()=>{try{const result=history.undo();clear();refresh();setSource(result);}catch(err){notice(err.message,'error');}};
  $('repair-csv').onclick=()=>download(history.current,'text/csv;charset=utf-8','repaired.csv');
  $('repair-original').onclick=()=>download(history.original,'text/csv;charset=utf-8','original.csv');
  $('repair-log').onclick=async()=>{try{download(JSON.stringify(await history.audit(getRules()),null,2),'application/json','repairs.json');}catch(err){notice('导出失败：'+err.message,'error');}};
  return {
    invalidate: clear,
    reset(source) {clear();history=new RepairHistory(source);refresh();},
    select(issue) {
      clear();if(!issue.span) {notice('缺列或整行结构问题需先手动修正。','error');return;}
      selected=issue;const s=issue.span, source=getSource();
      $('repair-selection').hidden=false;
      $('repair-location').textContent=`${issue.column} · 第 ${s.startLine} 行 ${s.startColumn} 列 · UTF-8 字节 [${s.startByte}, ${s.endByte})`;
      const pre=$('repair-context');pre.replaceChildren();
      pre.append(document.createTextNode(source.slice(Math.max(0,s.startUtf16-60),s.startUtf16)));
      const mark=document.createElement('mark');mark.textContent=source.slice(s.startUtf16,s.endUtf16)||'〔空字段〕';pre.append(mark);
      pre.append(document.createTextNode(source.slice(s.endUtf16,s.endUtf16+60)));
      $('repair-value').value=issue.value;
      // textarea normalizes CRLF/CR to LF. Convert offsets only for selection.
      const area=document.getElementById('csv');area.focus();
      area.setSelectionRange(source.slice(0,s.startUtf16).replace(/\r\n?/g,'\n').length,source.slice(0,s.endUtf16).replace(/\r\n?/g,'\n').length);
      panel.scrollIntoView({behavior:'smooth',block:'nearest'});
    }
  };
}
