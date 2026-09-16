#!/usr/bin/env node
import {readFileSync, mkdirSync, writeFileSync} from 'node:fs';
import {dirname, basename, resolve} from 'node:path';
import {analyze} from './web/core.js';
import {reportHTML} from './web/report.js';
const help = `CSV Doctor — MoonBit CSV 数据体检
Usage: node cli.mjs <input.csv> [--rules rules.json] [--json report.json] [--html report.html]
       node cli.mjs --help
Exit codes: 0 passed, 1 validation issues, 2 invalid input/configuration/IO.
Input: strict UTF-8, maximum 10 MiB. Without --rules, only CSV structure is checked.
JSON is always written to stdout. Diagnostics go to stderr.`;
function main() {
  const args = process.argv.slice(2);
  if(args.length === 1 && ['--help','-h'].includes(args[0])) {console.log(help); return 0;}
  if(!args.length) throw new Error(help);
  const options = {};
  let input;
  for(let i=0;i<args.length;i++) {
    const arg = args[i];
    if(['--rules','--json','--html'].includes(arg)) {
      if(options[arg] || !args[i+1] || args[i+1].startsWith('--')) throw new Error(`Invalid or repeated option ${arg}`);
      options[arg] = args[++i];
    } else if(arg.startsWith('-') || input) throw new Error(`Unexpected argument: ${arg}`);
    else input = arg;
  }
  if(!input) throw new Error('Missing CSV input path');
  const sources = [input, options['--rules']].filter(Boolean).map(p=>resolve(p));
  const destinations = [options['--json'],options['--html']].filter(Boolean).map(p=>resolve(p));
  const canonical = p => process.platform === 'win32' ? p.toLowerCase() : p;
  const sourceSet = new Set(sources.map(canonical));
  if(destinations.some(p=>sourceSet.has(canonical(p))) || new Set(destinations.map(canonical)).size !== destinations.length) throw new Error('Report paths must be distinct from inputs and each other');
  const read = path => {
    const bytes = readFileSync(path);
    if(bytes.length > 10*1024*1024) throw new Error('File exceeds the 10 MiB limit');
    return new TextDecoder('utf-8', {fatal:true}).decode(bytes);
  };
  const report = JSON.parse(analyze(read(input), options['--rules'] ? read(options['--rules']) : '{}'));
  const json = JSON.stringify(report,null,2)+'\n';
  const save = (path,content) => {if(path){mkdirSync(dirname(resolve(path)),{recursive:true});writeFileSync(path,content);}};
  save(options['--json'],json);
  save(options['--html'],reportHTML(report,basename(input)));
  process.stdout.write(json);
  if(report.status === 'error') {console.error(report.message); return 2;}
  console.error(`${report.rows} rows · ${report.failedRows} failed · ${report.issueCount} issues`);
  return report.status === 'pass' ? 0 : 1;
}
try { process.exitCode = main(); } catch(e) {console.error(e.message);process.exitCode=2;}
