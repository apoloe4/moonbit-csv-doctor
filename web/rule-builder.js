// Form-to-configuration adapter; all data validation still runs in MoonBit.
export function addColumnRule(configText, fields) {
  const config = JSON.parse(configText);
  if (!config || Array.isArray(config) || typeof config !== 'object') throw Error('规则必须是 JSON 对象');
  const columns = config.columns ?? [];
  if (!Array.isArray(columns)) throw Error('columns 必须是数组');
  if (!fields.column.trim()) throw Error('请填写列名');
  if (columns.some(r => r?.column === fields.column)) throw Error('该列已有规则，请在 JSON 中修改，避免覆盖已有设置');
  const rule = {column: fields.column, type: fields.type};
  if (!['string','number','integer','boolean'].includes(rule.type)) throw Error('不支持的类型');
  if (fields.required) rule.required = true;
  if (fields.unique) rule.unique = true;
  for (const key of ['min','max']) {
    const text = (fields[key] ?? '').trim();
    if (!text) continue;
    if (!['number','integer'].includes(rule.type)) throw Error('数值范围仅适用于 number 或 integer');
    const n = Number(text);
    if (!Number.isFinite(n)) throw Error('范围必须是有限数值');
    rule[key] = n;
  }
  if (rule.min !== undefined && rule.max !== undefined && rule.min > rule.max) throw Error('最小值不能大于最大值');
  if (fields.enumText?.trim()) {
    const values = JSON.parse(fields.enumText);
    if (!Array.isArray(values) || values.some(v => typeof v !== 'string')) throw Error('枚举必须是 JSON 字符串数组');
    rule.enum = values;
  }
  return JSON.stringify({...config, columns: [...columns, rule]}, null, 2);
}

export function mountRuleBuilder(textarea, onChange) {
  const panel = document.createElement('details');
  panel.className = 'rule-builder';
  panel.innerHTML = `<summary>用表单添加列规则</summary>
    <p>填写一列的检查要求，再添加到下方 JSON。已有配置会保留。</p>
    <label class="label">列名（与 CSV 标题一致）<input name="column" type="text" placeholder="amount"></label>
    <label class="label">数据类型<select name="type"><option value="string">文本 string</option><option value="number">数值 number</option><option value="integer">整数 integer</option><option value="boolean">布尔 boolean</option></select></label>
    <label><input name="required" type="checkbox"> 必填</label> <label><input name="unique" type="checkbox"> 唯一</label>
    <label class="label">最小值（可选）<input name="min" type="number" step="any"></label>
    <label class="label">最大值（可选）<input name="max" type="number" step="any"></label>
    <label class="label">枚举 JSON 数组（可选）<input name="enumText" type="text" placeholder='["paid","pending"]'></label>
    <button type="button" class="secondary">添加列规则</button><p role="status" aria-live="polite"></p>`;
  textarea.previousElementSibling.before(panel);
  const input = name => panel.querySelector(`[name="${name}"]`);
  const updateRange = () => {
    const disabled = !['number','integer'].includes(input('type').value);
    for (const key of ['min','max']) {input(key).disabled=disabled;if(disabled)input(key).value='';}
  };
  input('type').onchange=updateRange;updateRange();
  panel.querySelector('button').onclick=()=>{
    const status=panel.querySelector('[role="status"]');
    try {
      const fields={};
      for(const key of ['column','type','min','max','enumText'])fields[key]=input(key).value;
      for(const key of ['required','unique'])fields[key]=input(key).checked;
      textarea.value=addColumnRule(textarea.value,fields);
      onChange();status.textContent=`已添加 ${fields.column} 的规则，请重新体检。`;
    }catch(e){status.textContent=e.message;}
  };
}
