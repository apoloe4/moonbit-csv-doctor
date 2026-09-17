// Patches operate on the original source, never on a re-serialized CSV table.
const encoder = new TextEncoder();
export function fieldPatch(source, issue, value, delimiter = ',') {
  const s = issue?.span;
  if (!s) throw Error('此问题没有可替换的字段范围，请手动修正 CSV 结构。');
  if (typeof value !== 'string' || [...delimiter].length !== 1 || /["\r\n\uFEFF]/u.test(delimiter)) throw Error('无效的字段值或分隔符。');
  const {startUtf16: start, endUtf16: end} = s;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end > source.length) throw Error('字段范围无效。');
  if (encoder.encode(source.slice(0, start)).length !== s.startByte || encoder.encode(source.slice(0, end)).length !== s.endByte) throw Error('字段位置与当前源文件不一致，请重新体检。');
  // Always quote the replacement, including empty strings and embedded newlines.
  const after = '"' + value.replaceAll('"', '""') + '"';
  const before = source.slice(start, end);
  if (value === issue.value) throw Error('新值与当前字段值相同。');
  return {startUtf16: start, endUtf16: end, startByte: s.startByte, endByte: s.endByte,
    before, after, row: issue.row, column: issue.column, reason: issue.code};
}
export function applyPatch(source, patch) {
  if (source.slice(patch.startUtf16, patch.endUtf16) !== patch.before) throw Error('补丁原文不匹配，请重新体检。');
  return source.slice(0, patch.startUtf16) + patch.after + source.slice(patch.endUtf16);
}
export class RepairHistory {
  constructor(source) { this.original = source; this.current = source; this.stack = []; this.events = []; }
  preview(issue, value, delimiter) {
    const patch = fieldPatch(this.current, issue, value, delimiter);
    return {base: this.current, patch, result: applyPatch(this.current, patch)};
  }
  apply(preview) {
    if (this.events.length >= 100) throw Error('本轮操作已达到 100 次，请先导出文件与修复记录。');
    if (preview.base !== this.current || applyPatch(this.current, preview.patch) !== preview.result) throw Error('预览已过期，请重新体检。');
    this.current = preview.result;
    this.stack.push(preview.patch);
    this.events.push({action: 'replace', patch: {...preview.patch}});
    return this.current;
  }
  undo() {
    const patch = this.stack.pop();
    if (!patch) throw Error('没有可撤销的修复。');
    const inverse = {...patch, endUtf16: patch.startUtf16 + patch.after.length,
      endByte: patch.startByte + encoder.encode(patch.after).length, before: patch.after, after: patch.before};
    this.current = applyPatch(this.current, inverse);
    this.events.push({action: 'undo', patch: inverse});
    return this.current;
  }
  async audit(rules) {
    const sha256 = async text => [...new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(text)))].map(n => n.toString(16).padStart(2, '0')).join('');
    // Capture a single consistent state before the asynchronous digests.
    const original = this.original, current = this.current, events = structuredClone(this.events);
    return {format: 'csv-doctor-repair-log/v1', offsetConvention: 'zero-based half-open; each patch applies to the previous result',
      originalSha256: await sha256(original), resultSha256: await sha256(current),
      rulesSha256: await sha256(rules), events};
  }
}
