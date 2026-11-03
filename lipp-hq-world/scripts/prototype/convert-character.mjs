/** Converte somente o Casual Male CC0; não executa scripts nem importa arquivos do repositório de origem. */
import {readFileSync,writeFileSync} from 'node:fs';
import {FBXLoader} from 'three/examples/jsm/loaders/FBXLoader.js';
import {MeshStandardMaterial} from 'three';
import {GLTFExporter} from 'three/examples/jsm/exporters/GLTFExporter.js';
globalThis.FileReader=class {readAsArrayBuffer(b){b.arrayBuffer().then(r=>{this.result=r;this.onloadend?.()})} readAsDataURL(b){b.arrayBuffer().then(r=>{this.result='data:application/octet-stream;base64,'+Buffer.from(r).toString('base64');this.onloadend?.()})}};
const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error('Uso: node scripts/prototype/convert-character.mjs entrada.fbx saida.glb');
const bytes=readFileSync(input);
if (bytes.length > 20_000_000 || !bytes.subarray(0, 18).toString().startsWith('Kaydara FBX Binary')) throw new Error('FBX binário esperado, até 20 MB');
const root=new FBXLoader().parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
console.log('animations',root.animations.map(c=>[c.name,c.duration]));
root.traverse(n=>{if(n.isMesh){console.log('mesh',n.name,Array.isArray(n.material)?n.material.map(m=>[m.name,m.color.getHexString()]):[n.material.name,n.material.color.getHexString()]);}});
const colors={Skin:'#c58d6c',Shirt:'#3b82f6',Pants:'#33363d',Belt:'#40332a',Face:'#ece7db',Hair:'#3b281d'};
root.traverse(n=>{if(n.isMesh){n.material=n.material.map(m=>new MeshStandardMaterial({name:m.name,color:colors[m.name]??'#777777',roughness:0.86}));}});
root.traverse(n=>{if(n.isMesh){
 const g=n.geometry;
 // Agrupa triângulos por material antes de exportar: FBX chega com 96 grupos.
 const old=g.index?Array.from(g.index.array):Array.from({length:g.attributes.position.count},(_,i)=>i);
 const sorted=[];const groups=[...g.groups];g.clearGroups();
 for(let mat=0;mat<n.material.length;mat++){const start=sorted.length;for(const group of groups.filter(g=>g.materialIndex===mat)){sorted.push(...old.slice(group.start,group.start+group.count));}if(sorted.length>start)g.addGroup(start,sorted.length-start,mat);}
 g.setIndex(sorted);n.normalizeSkinWeights();
}});
const head=root.getObjectByName('Head'); if(head)head.scale.setScalar(0.52);
for(const clip of root.animations)clip.tracks=clip.tracks.filter(t=>t.name!=='Head.scale');
root.animations=root.animations.filter(c=>/Idle|SitDown/.test(c.name));
const out=await new GLTFExporter().parseAsync(root,{binary:true,animations:root.animations});
writeFileSync(output,Buffer.from(out));
