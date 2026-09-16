import {analyze} from './core.js';
self.onmessage = ({data}) => {
  try { self.postMessage({id:data.id,report:JSON.parse(analyze(data.csv,data.rules))}); }
  catch(e) {self.postMessage({id:data.id,report:{status:'error',message:e.message}});}
};
