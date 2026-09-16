import {spawnSync} from 'node:child_process';
import {mkdirSync, copyFileSync, existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const result = spawnSync('moon', ['build', '--target', 'js', '--release'], {cwd:root, stdio:'inherit'});
if(result.error) { console.error('Install MoonBit and add moon to PATH:', result.error.message); process.exit(2); }
if(result.status !== 0) process.exit(result.status ?? 2);
const built = ['_build/js/release/build/core.js','target/js/release/build/core.js'].map(p=>resolve(root,p)).find(existsSync);
if(!built) throw new Error('MoonBit output not found; inspect the build directory.');
mkdirSync(resolve(root,'web'), {recursive:true});
copyFileSync(built,resolve(root,'web/core.js'));
console.log('Compiled MoonBit core → web/core.js');
