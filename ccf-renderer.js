/* ChemistryRecall — CCF v1 renderer
 * CCF is intentionally isolated from the quiz/session engine so the app only
 * needs to understand the stable format contract.
 *
 * Primary SMILES engine: SmilesDrawer 2.4.1 when available. A self-contained
 * vector fallback is provided so CCF still renders without a network library.
 */
(function(){
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const DEFAULTS = {
    textSize: 28,
    textColor: '#17221f',
    weight: 400,
    align: 'left',
    valign: 'top',
    rotation: 0,
    opacity: 1,
    smileScale: 1,
    smileOpacity: 1,
  };

  const SAFE_COLORS = /^#[0-9a-fA-F]{6}$/;
  const ALIGN = new Set(['left','center','right']);
  const VALIGN = new Set(['top','middle','bottom']);

  function number(value, fallback){
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function clamp(value, min, max){ return Math.min(max, Math.max(min, value)); }

  function bool(value, fallback=false){
    if(typeof value==='boolean') return value;
    const s=String(value??'').trim().toLowerCase();
    if(['true','1','yes','on'].includes(s)) return true;
    if(['false','0','no','off'].includes(s)) return false;
    return fallback;
  }

  function parseQuoted(value){
    const s = String(value ?? '').trim();
    if(s.length >= 2 && s[0] === '"' && s[s.length-1] === '"'){
      try { return JSON.parse(s); } catch(_) { return s.slice(1,-1); }
    }
    if(s.length >= 2 && s[0] === "'" && s[s.length-1] === "'") return s.slice(1,-1);
    return s;
  }

  function splitProps(line){
    const parts=[]; let current=''; let quote=null; let escaped=false;
    for(const ch of String(line)){
      if(escaped){ current += ch; escaped=false; continue; }
      if(ch === '\\' && quote){ current += ch; escaped=true; continue; }
      if((ch === '"' || ch === "'") && (!quote || quote===ch)) quote = quote ? null : ch;
      if(ch === ';' && !quote){ parts.push(current.trim()); current=''; }
      else current += ch;
    }
    if(current.trim()) parts.push(current.trim());
    return parts;
  }

  function propMap(lines){
    const props={};
    for(const raw of lines){
      const line=String(raw).trim();
      const m=line.match(/^([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*)$/);
      if(m) props[m[1].toLowerCase()] = parseQuoted(m[2]);
    }
    return props;
  }

  function parseInlineToken(inner){
    const parts=splitProps(inner);
    let smiles=parseQuoted(parts.shift() || '').trim();
    if(/^smiles\s*:/i.test(smiles)) smiles=parseQuoted(smiles.replace(/^smiles\s*:\s*/i,''));
    const props={};
    for(const part of parts){
      const m=part.match(/^([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*)$/);
      if(m) props[m[1].toLowerCase()] = parseQuoted(m[2]);
    }
    return {smiles,props};
  }

  function extractInlineParts(text){
    const source=String(text ?? '');
    const parts=[]; let cursor=0; const re=/\[\[smiles:([\s\S]*?)\]\]/gi; let m;
    while((m=re.exec(source))){
      if(m.index>cursor) parts.push({type:'text',value:source.slice(cursor,m.index)});
      parts.push({type:'smiles',...parseInlineToken(m[1])});
      cursor=re.lastIndex;
    }
    if(cursor<source.length) parts.push({type:'text',value:source.slice(cursor)});
    return parts;
  }

  function parseObjectHeader(line){
    const parts=line.trim().split(/\s+/);
    return parts;
  }

  function parseCCF(source){
    const lines=String(source ?? '').replace(/\r/g,'').split('\n');
    let i=0;
    while(i<lines.length && !lines[i].trim()) i++;
    const versionMatch=(lines[i]||'').trim().match(/^@ccf\s+(\d+)$/i);
    if(!versionMatch) throw new Error('CCF document must begin with @ccf 1.');
    const version=Number(versionMatch[1]);
    if(version!==1) throw new Error(`CCF v${version} is not supported. This renderer supports CCF v1.`);
    i++;
    while(i<lines.length && !lines[i].trim()) i++;
    const canvasMatch=(lines[i]||'').trim().match(/^@canvas\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)$/i);
    if(!canvasMatch) throw new Error('CCF v1 requires @canvas WIDTH HEIGHT immediately after the version header.');
    const width=number(canvasMatch[1],0), height=number(canvasMatch[2],0);
    if(width<=0 || height<=0 || width>20000 || height>20000) throw new Error('Canvas dimensions must be between 1 and 20,000.');
    i++;

    const objects=[];
    while(i<lines.length){
      while(i<lines.length && !lines[i].trim()) i++;
      if(i>=lines.length) break;
      const line=lines[i].trim();
      if(line.startsWith('//') || line.startsWith('#')){ i++; continue; }
      if(!line.startsWith('@')) throw new Error(`Unexpected CCF content near line ${i+1}.`);

      if(/^@text\b/i.test(line)){
        const h=parseObjectHeader(line);
        if(h.length<5) throw new Error(`Invalid @text header near line ${i+1}.`);
        const obj={type:'text',x:number(h[1],0),y:number(h[2],0),width:number(h[3],0),height:number(h[4],0),props:{},text:''};
        if([obj.x,obj.y,obj.width,obj.height].some(v=>!Number.isFinite(v) || v<0) || obj.width<=0 || obj.height<=0) throw new Error(`Invalid @text geometry near line ${i+1}.`);
        i++;
        const body=[];
        for(;i<lines.length && lines[i].trim().toLowerCase()!=='@end';i++) body.push(lines[i]);
        if(i>=lines.length) throw new Error('Missing @end for @text.');
        obj.props=propMap(body);
        const contentLines=body.filter(x=>{
          const t=x.trim();
          return t && !/^[A-Za-z][A-Za-z0-9_-]*\s*:\s*/.test(t);
        });
        obj.text=contentLines.map(x=>{
          const t=x.trim();
          return parseQuoted(t);
        }).join('\n');
        validateTextProps(obj.props);
        objects.push(obj); i++; continue;
      }

      if(/^@smiles\b/i.test(line)){
        const h=parseObjectHeader(line);
        if(h.length<5) throw new Error(`Invalid @smiles header near line ${i+1}.`);
        const obj={type:'smiles',x:number(h[1],0),y:number(h[2],0),width:number(h[3],0),height:number(h[4],0),props:{},source:''};
        if([obj.x,obj.y,obj.width,obj.height].some(v=>!Number.isFinite(v) || v<0) || obj.width<=0 || obj.height<=0) throw new Error(`Invalid @smiles geometry near line ${i+1}.`);
        i++;
        const body=[];
        for(;i<lines.length && lines[i].trim().toLowerCase()!=='@end';i++) body.push(lines[i]);
        if(i>=lines.length) throw new Error('Missing @end for @smiles.');
        obj.props=propMap(body);
        obj.source=String(obj.props.source||'').trim();
        if(!obj.source) throw new Error('@smiles requires source: "SMILES".');
        validateSmileProps(obj.props);
        objects.push(obj); i++; continue;
      }

      if(/^@arrow\b/i.test(line)){
        const h=parseObjectHeader(line);
        if(h.length<5) throw new Error(`Invalid @arrow header near line ${i+1}.`);
        const obj={type:'arrow',x1:number(h[1],0),y1:number(h[2],0),x2:number(h[3],0),y2:number(h[4],0),props:{}};
        if([obj.x1,obj.y1,obj.x2,obj.y2].some(v=>!Number.isFinite(v) || v<0)) throw new Error(`Invalid @arrow coordinates near line ${i+1}.`);
        i++;
        const body=[];
        for(;i<lines.length && lines[i].trim().toLowerCase()!=='@end';i++) body.push(lines[i]);
        if(i>=lines.length) throw new Error('Missing @end for @arrow.');
        obj.props=propMap(body);
        validateArrowProps(obj.props);
        objects.push(obj); i++; continue;
      }

      if(/^@reaction\b/i.test(line)){
        const h=parseObjectHeader(line);
        if(h.length<5) throw new Error(`Invalid @reaction header near line ${i+1}.`);
        const obj={type:'reaction',x:number(h[1],0),y:number(h[2],0),width:number(h[3],0),height:number(h[4],0),reactants:[],products:[],reagents:{top:[],bottom:[]}};
        if([obj.x,obj.y,obj.width,obj.height].some(v=>!Number.isFinite(v) || v<0) || obj.width<=0 || obj.height<=0) throw new Error(`Invalid @reaction geometry near line ${i+1}.`);
        i++;
        const block=[];
        for(;i<lines.length && lines[i].trim().toLowerCase()!=='@end';i++) block.push(lines[i]);
        if(i>=lines.length) throw new Error('Missing @end for @reaction.');
        parseReactionBlock(block,obj);
        objects.push(obj); i++; continue;
      }

      throw new Error(`Unknown CCF object "${line.split(/\s+/)[0]}" near line ${i+1}.`);
    }
    return {version,width,height,objects};
  }

  function parseReactionBlock(lines,obj){
    let section=null, subsection=null, current=null;
    const finish=()=>{
      if(!current) return;
      if(section==='reactants') obj.reactants.push(current);
      else if(section==='products') obj.products.push(current);
      else if(section==='reagents') obj.reagents[subsection||'top'].push(current);
      current=null;
    };
    for(let raw of lines){
      const t=raw.trim();
      if(!t || /^#|^\/\//.test(t)) continue;
      if(/^reactants\s*:\s*$/i.test(t)){finish();section='reactants';subsection=null;continue;}
      if(/^products\s*:\s*$/i.test(t)){finish();section='products';subsection=null;continue;}
      if(/^reagents\s*:\s*$/i.test(t)){finish();section='reagents';subsection=null;continue;}
      if(section==='reagents' && /^top\s*:\s*$/i.test(t)){finish();subsection='top';continue;}
      if(section==='reagents' && /^bottom\s*:\s*$/i.test(t)){finish();subsection='bottom';continue;}
      const itemMatch=t.match(/^[-•]\s*(text|smiles)\s*:\s*(.*)$/i);
      if(itemMatch){
        finish();
        current={type:itemMatch[1].toLowerCase(),value:parseQuoted(itemMatch[2])};
        if(section==='reagents' && current.type==='smiles') throw new Error('Reagents cannot contain standalone SMILES in CCF v1. Use text with [[smiles:...]] instead.');
        continue;
      }
      const prop=t.match(/^([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*)$/);
      if(prop && current){
        const key=prop[1].toLowerCase();
        current[key]=parseQuoted(prop[2]);
        continue;
      }
      throw new Error(`Invalid reaction entry: ${t}`);
    }
    finish();
    if(!obj.reactants.length) throw new Error('A reaction requires at least one reactant.');
    if(!obj.products.length) throw new Error('A reaction requires at least one product.');
    for(const list of [obj.reactants,obj.products]){
      for(const component of list){
        if(component.subtitle!=null && String(component.subtitle).length===0) delete component.subtitle;
        if(component.type==='smiles' && !String(component.value||'').trim()) throw new Error('Reaction SMILES component cannot be empty.');
        if(component.type==='smiles') validateSmileProps(component);
        if(component.type==='text' && String(component.value||'').length===0) throw new Error('Reaction text component cannot be empty.');
        if(component.type==='text' && component.atoms!=null) throw new Error('The atoms property applies to SMILES reaction components, not text components. Use inline [[smiles:...; atoms:true]] inside text.');
      }
    }
    for(const side of ['top','bottom']){
      for(const component of obj.reagents[side]){
        if(component.subtitle!=null) throw new Error('Reagents cannot have subtitles in CCF v1.');
        if(!String(component.value||'').trim()) throw new Error('Reaction reagent cannot be empty.');
      }
    }
  }

  function validateTextProps(props){
    if(props.color && !SAFE_COLORS.test(String(props.color))) throw new Error('CCF text color must be a 6-digit hex color.');
    if(props.align && !ALIGN.has(String(props.align))) throw new Error('CCF text align must be left, center, or right.');
    if(props.valign && !VALIGN.has(String(props.valign))) throw new Error('CCF text valign must be top, middle, or bottom.');
    if(props.opacity!=null && (number(props.opacity,-1)<0 || number(props.opacity,-1)>1)) throw new Error('CCF opacity must be between 0 and 1.');
  }
  function validateSmileProps(props){
    if(props.opacity!=null && (number(props.opacity,-1)<0 || number(props.opacity,-1)>1)) throw new Error('CCF opacity must be between 0 and 1.');
    if(props.scale!=null && number(props.scale,-1)<=0) throw new Error('CCF SMILES scale must be greater than 0.');
    if(props.atoms!=null){
      const raw=String(props.atoms).trim().toLowerCase();
      if(!['true','false','1','0','yes','no','on','off'].includes(raw)) throw new Error('CCF SMILES atoms must be true or false.');
    }
  }
  function validateArrowProps(props){
    if(props.color && !SAFE_COLORS.test(String(props.color))) throw new Error('CCF arrow color must be a 6-digit hex color.');
    if(props.width!=null && number(props.width,-1)<=0) throw new Error('CCF arrow width must be greater than 0.');
    if(props.opacity!=null && (number(props.opacity,-1)<0 || number(props.opacity,-1)>1)) throw new Error('CCF opacity must be between 0 and 1.');
  }

  // ---------------------------------------------------------------------------
  // SMILES fallback parser
  // ---------------------------------------------------------------------------
  const ATOM_RE = /^(Br|Cl|Si|Na|Li|Al|Ca|Mg|Fe|Cu|Zn|Ag|Au|Hg|Sn|Pb|B|C|N|O|P|S|F|I|b|c|n|o|p|s|\*)/;

  function tokenizeSmiles(smiles){
    const s=String(smiles??'').replace(/\s+/g,'');
    const tokens=[];
    let i=0;
    const bondChars=new Set(['-','=',' #',':','/','\\','~','#']);
    while(i<s.length){
      const ch=s[i];
      if(ch==='['){
        const j=s.indexOf(']',i+1);
        if(j<0) throw new Error('Unclosed bracket atom in SMILES.');
        tokens.push({kind:'atom',raw:s.slice(i,j+1)}); i=j+1; continue;
      }
      if(ch==='(' || ch===')' || ch==='.' || ch==='%' || /\d/.test(ch)){
        if(ch==='%'){
          const num=s.slice(i+1,i+3);
          if(!/^\d{2}$/.test(num)) throw new Error('Invalid multi-digit ring closure in SMILES.');
          tokens.push({kind:'ring',value:num}); i+=3; continue;
        }
        if(/\d/.test(ch)){tokens.push({kind:'ring',value:ch});i++;continue;}
        tokens.push({kind:ch==='.'?'dot':ch});i++;continue;
      }
      if(['-','=','%','~','#',':','/','\\'].includes(ch)){
        tokens.push({kind:'bond',value:ch}); i++; continue;
      }
      if(ch==='@'){
        tokens.push({kind:'stereo',value:'@'}); i++; if(s[i]==='@') i++; continue;
      }
      if(ch==='+' || ch==='-'){
        // Outside brackets, +/- is not standard atom syntax; preserve as text token
        tokens.push({kind:'text',value:ch}); i++; continue;
      }
      const rem=s.slice(i);
      const m=rem.match(ATOM_RE);
      if(m){ tokens.push({kind:'atom',raw:m[1]}); i+=m[1].length; continue; }
      throw new Error(`Unsupported SMILES character "${ch}".`);
    }
    return tokens;
  }

  function prettyBracket(raw){
    let inner=raw.slice(1,-1);
    inner=inner.replace(/@+/g,'');
    inner=inner.replace(/:(\d+)$/,'');
    const m=inner.match(/^(\d+)?([A-Za-z*][a-z]?)(.*)$/);
    if(!m) return inner;
    let label=(m[1]||'')+(m[2]||'');
    const rest=m[3]||'';
    const h=rest.match(/H(\d*)/i);
    if(h){ label += 'H'+(h[1]||''); }
    const charge=rest.match(/([+-]+\d*)/);
    if(charge){
      let c=charge[1];
      c=c.replace(/([+-])\1+/g,(x)=>x[0]+String(x.length));
      label += c;
    }
    return label;
  }

  function parseSmilesGraph(smiles){
    const tokens=tokenizeSmiles(smiles);
    const nodes=[]; const edges=[]; const rings=new Map();
    const branches=[]; let current=null; let pending='single'; let component=0;
    function addNode(raw){
      const aromatic=/^[a-z]/.test(raw) || (raw[0]==='[' && /[a-z]/.test(raw));
      let element=raw;
      let bracket=false;
      if(raw[0]==='['){ bracket=true; const m=raw.match(/\[\d*([A-Za-z]{1,2}|\*)/); element=(m&&m[1])?m[1]:raw; }
      else element=raw;
      const display=bracket?prettyBracket(raw):(aromatic?element.toUpperCase():element);
      const visible=bracket || !['C','c','B'].includes(element);
      const node={id:nodes.length,raw,element:element.length?element:'C',display,aromatic,visible,component,x:0,y:0};
      nodes.push(node);
      if(current!=null) edges.push({a:current,b:node.id,order:bondOrder(pending)});
      current=node.id; pending='single';
      return node.id;
    }
    for(const token of tokens){
      if(token.kind==='atom') addNode(token.raw);
      else if(token.kind==='bond') pending=token.value==='#'?'triple':token.value==='='?'double':token.value===':'?'aromatic':'single';
      else if(token.kind==='(') { if(current==null) throw new Error('SMILES branch has no anchor atom.'); branches.push(current); }
      else if(token.kind===')') { if(!branches.length) throw new Error('SMILES branch close without open branch.'); current=branches.pop(); pending='single'; }
      else if(token.kind==='dot'){ current=null; component+=1; pending='single'; }
      else if(token.kind==='ring'){
        const key=token.value;
        if(current==null) throw new Error('SMILES ring closure has no atom.');
        if(!rings.has(key)) rings.set(key,{node:current,bond:pending});
        else { const first=rings.get(key); edges.push({a:first.node,b:current,order:pending!=='single'?bondOrder(pending):first.bond!=='single'?bondOrder(first.bond):'single'}); rings.delete(key); pending='single'; }
      }
    }
    if(rings.size) throw new Error('Unclosed SMILES ring closure.');
    return {nodes,edges,components:component+1};
  }

  function bondOrder(kind){ return kind==='double'?'double':kind==='triple'?'triple':kind==='aromatic'?'aromatic':'single'; }

  function layoutGraph(graph,width,height){
    const nodes=graph.nodes, edges=graph.edges;
    if(!nodes.length) throw new Error('Empty SMILES.');

    const adjacency=nodes.map(()=>[]);
    edges.forEach(e=>{
      adjacency[e.a].push(e.b);
      adjacency[e.b].push(e.a);
    });

    const components=Math.max(...nodes.map(n=>n.component))+1;
    const compNodes=Array.from({length:components},()=>[]);
    nodes.forEach(n=>compNodes[n.component].push(n.id));

    const componentBounds=[];
    let globalX=0;

    function edgeFor(a,b){
      return edges.find(e=>(e.a===a&&e.b===b)||(e.a===b&&e.b===a));
    }

    function findSimpleCycle(ids){
      const inComp=new Set(ids);
      const degree=new Map(ids.map(id=>[id,adjacency[id].filter(v=>inComp.has(v)).length]));
      const queue=ids.filter(id=>degree.get(id)<2);
      const removed=new Set();
      let q=0;
      while(q<queue.length){
        const id=queue[q++];
        if(removed.has(id)) continue;
        removed.add(id);
        for(const n of adjacency[id]){
          if(!inComp.has(n)||removed.has(n)) continue;
          const d=degree.get(n)-1;
          degree.set(n,d);
          if(d<2) queue.push(n);
        }
      }
      const core=ids.filter(id=>!removed.has(id));
      if(core.length<3) return null;
      const coreSet=new Set(core);
      const coreEdges=edges.filter(e=>coreSet.has(e.a)&&coreSet.has(e.b));
      if(coreEdges.length!==core.length) return null;
      // The 2-core is one simple cycle.
      const startId=core[0], cycle=[startId], seen=new Set([startId]);
      let prev=null,current=startId;
      while(true){
        const nexts=adjacency[current].filter(v=>coreSet.has(v)&&v!==prev);
        const next=nexts.find(v=>!seen.has(v));
        if(next==null){
          const closing=nexts.find(v=>v===startId);
          if(closing===startId && cycle.length===core.length) return cycle;
          break;
        }
        cycle.push(next); seen.add(next); prev=current; current=next;
        if(cycle.length>core.length) break;
      }
      return cycle.length===core.length ? cycle : null;
    }

    for(let c=0;c<components;c++){
      const ids=compNodes[c];
      if(!ids.length) continue;

      const cycle=findSimpleCycle(ids);

      if(cycle){
        const radius=Math.max(32, Math.min(width,height)*0.28);
        const cycleSet=new Set(cycle);
        const centerX=0, centerY=0;

        cycle.forEach((id,k)=>{
          const angle=-Math.PI/2 + 2*Math.PI*k/cycle.length;
          nodes[id].x=centerX+Math.cos(angle)*radius;
          nodes[id].y=centerY+Math.sin(angle)*radius;
        });

        // Place substituent trees outside the ring.
        const placed=new Set(cycle);
        function placeBranch(id,parent,angle,depth){
          const children=adjacency[id].filter(v=>v!==parent && !cycleSet.has(v) && !placed.has(v));
          if(!children.length) return;
          const spread=Math.min(Math.PI*0.70, Math.max(Math.PI/5,(children.length-1)*Math.PI/5));
          const startAngle=angle-spread/2;
          children.forEach((child,index)=>{
            const childAngle=children.length===1
              ? angle
              : startAngle+spread*(index/(children.length-1));
            const bond=edgeFor(id,child);
            const len=bond&&bond.order==='triple'?68:64;
            nodes[child].x=nodes[id].x+Math.cos(childAngle)*len;
            nodes[child].y=nodes[id].y+Math.sin(childAngle)*len;
            placed.add(child);
            placeBranch(child,id,childAngle,depth+1);
          });
        }

        cycle.forEach(id=>{
          const ringAngle=Math.atan2(nodes[id].y-centerY,nodes[id].x-centerX);
          placeBranch(id,null,ringAngle,0);
        });

        // Safety placement for anything not attached by the branch walk.
        ids.forEach((id,index)=>{
          if(!placed.has(id)){
            nodes[id].x=Math.cos(index)*64;
            nodes[id].y=Math.sin(index)*64;
          }
        });
      }else{
        // Stable, non-diverging tree layout.
        const root=ids[0];
        const placed=new Set([root]);
        nodes[root].x=0;
        nodes[root].y=0;

        function placeChildren(id,parent,depth,inAngle){
          const children=adjacency[id].filter(v=>v!==parent && !placed.has(v));
          if(!children.length) return;

          let angles=[];
          if(children.length===1){
            const a = parent==null ? 0 : (depth%2===0 ? Math.PI/3 : -Math.PI/3);
            angles=[a];
          }else{
            const spread=Math.min(2*Math.PI/3, Math.max(Math.PI/3,(children.length-1)*Math.PI/3));
            const start=inAngle-spread/2;
            angles=children.map((_,idx)=>start+spread*(idx/(children.length-1)));
          }

          children.forEach((child,idx)=>{
            const angle=angles[idx];
            const bond=edgeFor(id,child);
            const len=bond&&bond.order==='triple'?68:64;
            nodes[child].x=nodes[id].x+Math.cos(angle)*len;
            nodes[child].y=nodes[id].y+Math.sin(angle)*len;
            placed.add(child);
            placeChildren(child,id,depth+1,angle);
          });
        }

        placeChildren(root,null,0,0);

        ids.forEach(id=>{
          if(!placed.has(id)){
            nodes[id].x=globalX+64;
            nodes[id].y=0;
            placed.add(id);
          }
        });
      }

      let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
      ids.forEach(id=>{
        minX=Math.min(minX,nodes[id].x);
        minY=Math.min(minY,nodes[id].y);
        maxX=Math.max(maxX,nodes[id].x);
        maxY=Math.max(maxY,nodes[id].y);
      });

      const compW=Math.max(1,maxX-minX);
      const compH=Math.max(1,maxY-minY);
      componentBounds.push({ids,minX,minY,maxX,maxY,width:compW,height:compH});
      globalX += compW + 55;
    }

    if(components>1){
      let totalW=componentBounds.reduce((s,b)=>s+b.width,0)+Math.max(0,components-1)*55;
      let cursor=-totalW/2;
      componentBounds.forEach(b=>{
        const shiftX=cursor-(b.minX+b.maxX)/2;
        b.ids.forEach(id=>{nodes[id].x+=shiftX;});
        cursor+=b.width+55;
      });
    }

    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    nodes.forEach(n=>{
      minX=Math.min(minX,n.x);
      minY=Math.min(minY,n.y);
      maxX=Math.max(maxX,n.x);
      maxY=Math.max(maxY,n.y);
    });

    const margin=18;
    const rawW=Math.max(1,maxX-minX);
    const rawH=Math.max(1,maxY-minY);
    const scale=Math.min((width-2*margin)/rawW,(height-2*margin)/rawH);
    const finalScale=clamp(scale,0.35,4);

    const outW=rawW*finalScale;
    const outH=rawH*finalScale;
    const ox=(width-outW)/2-minX*finalScale;
    const oy=(height-outH)/2-minY*finalScale;

    nodes.forEach(n=>{
      n.x=n.x*finalScale+ox;
      n.y=n.y*finalScale+oy;
    });

    return graph;
  }

  const ELEMENT_COLOR={
    O:'#b44a43',N:'#315f9b',S:'#9b7627',P:'#8b5f2c',F:'#64866f',Cl:'#64866f',Br:'#78623f',I:'#70528b',B:'#636e67',Si:'#636e67',Na:'#4f6b83',K:'#4f6b83',Mg:'#6b6b78',Ca:'#6b6b78'
  };

  function createSvg(w,h){
    const svg=document.createElementNS(SVG_NS,'svg');
    svg.setAttribute('viewBox',`0 0 ${w} ${h}`); svg.setAttribute('width','100%'); svg.setAttribute('height','100%');
    svg.setAttribute('preserveAspectRatio','xMidYMid meet');
    svg.setAttribute('aria-hidden','true');
    return svg;
  }
  function svgEl(name,attrs={}){ const el=document.createElementNS(SVG_NS,name); Object.entries(attrs).forEach(([k,v])=>el.setAttribute(k,String(v))); return el; }
  function lineTrim(a,b,amount){
    const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy)||1;
    return {x1:a.x+dx/d*amount,y1:a.y+dy/d*amount,x2:b.x-dx/d*amount,y2:b.y-dy/d*amount};
  }
  function renderFallbackSmiles(smiles,w,h,options={}){
    const atoms=bool(options.atoms,false);
    const graph=layoutGraph(parseSmilesGraph(smiles),w,h);
    const svg=createSvg(w,h);
    const g=svgEl('g',{'stroke-linecap':'round','stroke-linejoin':'round'}); svg.appendChild(g);
    for(const e of graph.edges){
      const a=graph.nodes[e.a],b=graph.nodes[e.b];
      const trimmed=lineTrim(a,b,(atoms||a.visible||b.visible)?13:2);
      const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy)||1,nx=-dy/d,ny=dx/d;
      const offset=e.order==='double'?3:e.order==='triple'?4:2.5;
      const drawLine=(ox)=>g.appendChild(svgEl('line',{x1:trimmed.x1+nx*ox,y1:trimmed.y1+ny*ox,x2:trimmed.x2+nx*ox,y2:trimmed.y2+ny*ox,stroke:'#17221f','stroke-width':e.order==='single'?'2.2':'1.7'}));
      if(e.order==='single') drawLine(0);
      else if(e.order==='double'){drawLine(offset);drawLine(-offset);}
      else if(e.order==='triple'){drawLine(offset);drawLine(0);drawLine(-offset);}
      else {g.appendChild(svgEl('line',{x1:trimmed.x1+nx*offset,y1:trimmed.y1+ny*offset,x2:trimmed.x2+nx*offset,y2:trimmed.y2+ny*offset,stroke:'#17221f','stroke-width':'1.5'}));g.appendChild(svgEl('line',{x1:trimmed.x1-nx*offset,y1:trimmed.y1-ny*offset,x2:trimmed.x2-nx*offset,y2:trimmed.y2-ny*offset,stroke:'#17221f','stroke-width':'1.5'}));}
    }
    for(const node of graph.nodes){
      if(!atoms && !node.visible) continue;
      const color=ELEMENT_COLOR[node.element]||'#17221f';
      const display=node.display;
      const t=svgEl('text',{x:node.x,y:node.y+7,'text-anchor':'middle','font-family':'Arial, sans-serif','font-size':display.length>3?16:20,'font-weight':'600','fill':color,'paint-order':'stroke','stroke':'#fffdf8','stroke-width':atoms?'4.5':'5','stroke-linejoin':'round'});
      t.textContent=display;
      svg.appendChild(t);
    }
    // Aromatic circles for simple aromatic rings.
    const aromaticIds=graph.nodes.filter(n=>n.aromatic).map(n=>n.id);
    const aromaticSimpleRing = aromaticIds.length>=5 && aromaticIds.length===graph.nodes.length &&
      graph.edges.length===graph.nodes.length && aromaticIds.every(id=>{
        const degree=graph.edges.filter(e=>e.a===id||e.b===id).length;
        return degree===2;
      });
    if(aromaticSimpleRing){
      const pts=aromaticIds.map(id=>graph.nodes[id]);
      const cx=pts.reduce((s,p)=>s+p.x,0)/pts.length,cy=pts.reduce((s,p)=>s+p.y,0)/pts.length;
      const ringRadius=Math.min(...pts.map(p=>Math.hypot(p.x-cx,p.y-cy)));
      const r=Math.max(7,Math.min(ringRadius*0.56,ringRadius-16));
      const c=svgEl('circle',{cx,cy,r,fill:'none',stroke:'#17221f','stroke-width':'1.45','stroke-dasharray':'2 3','opacity':'.85'});
      svg.insertBefore(c,svg.firstChild);
    }
    return svg;
  }

  function loadSmilesDrawer(){
    if(window.SmilesDrawer) return Promise.resolve(true);
    if(window.__chemistryRecallSmilesLoader) return window.__chemistryRecallSmilesLoader;
    window.__chemistryRecallSmilesLoader = new Promise(resolve=>{
      let done=false;
      const finish=v=>{ if(done)return; done=true; resolve(v); };
      const s=document.createElement('script');
      s.src='https://unpkg.com/smiles-drawer@2.4.1/dist/smiles-drawer.min.js';
      s.async=true;
      s.onload=()=>finish(!!window.SmilesDrawer);
      s.onerror=()=>finish(false);
      document.head.appendChild(s);
      setTimeout(()=>finish(!!window.SmilesDrawer),3500);
    }).then(ready=>{ if(ready) upgradeFallbackSmiles(); return ready; });
    return window.__chemistryRecallSmilesLoader;
  }

  function renderWithBestEngine(target,smiles,width,height,options={}){
    target.innerHTML='';
    target.setAttribute('data-smiles-source',smiles);
    target.setAttribute('data-smiles-width',String(width));
    target.setAttribute('data-smiles-height',String(height));
    target.dataset.smilesFallback='1';
    target.dataset.smilesOptions=JSON.stringify({atoms:bool(options.atoms,false)});

    const fallback=()=>{
      try{
        target.innerHTML='';
        const svg=renderFallbackSmiles(smiles,width,height,options);
        target.appendChild(svg);
        target.dataset.smilesFallback='1';
      }catch(err){
        target.dataset.smilesFallback='error';
        target.innerHTML='';
        const message=document.createElement('div');
        message.className='ccf-smiles-error';
        message.textContent='Unable to render SMILES';
        target.appendChild(message);
      }
    };

    // Always put a deterministic vector result on screen first. This makes
    // the renderer usable offline and guarantees that network latency never
    // produces a blank molecule.
    fallback();

    // Upgrade to the full chemistry renderer when the library is available.
    const upgrade=()=>{
      if(!window.SmilesDrawer || !window.SmilesDrawer.SvgDrawer || !window.SmilesDrawer.parse) return;
      try{
        window.SmilesDrawer.parse(
          smiles,
          tree=>{
            try{
              const svg=document.createElementNS(SVG_NS,'svg');
              svg.setAttribute('viewBox',`0 0 ${width} ${height}`);
              svg.setAttribute('width','100%');
              svg.setAttribute('height','100%');
              svg.setAttribute('preserveAspectRatio','xMidYMid meet');
              svg.setAttribute('role','img');
              svg.setAttribute('aria-label',`Molecule ${smiles}`);

              const atoms=bool(options.atoms,false);
              const drawer=new window.SmilesDrawer.SvgDrawer({
                width,
                height,
                bondLength: Math.max(26, Math.min(44, width/9)),
                compactDrawing:!atoms,
                experimentalSSSR:true,
                showCarbons:atoms?'all':'default',
                explicitHydrogens:atoms,
                fontFamily:'Arial, Helvetica, sans-serif',
                themes:{
                  light:{
                    FOREGROUND:'#17221f',
                    BACKGROUND:'transparent',
                    C:'#17221f',
                    O:'#b44a43',
                    N:'#315f9b',
                    F:'#64866f',
                    CL:'#64866f',
                    BR:'#78623f',
                    I:'#70528b',
                    P:'#8b5f2c',
                    S:'#9b7627',
                    B:'#636e67',
                    SI:'#636e67',
                    H:'#17221f'
                  }
                }
              });

              target.innerHTML='';
              target.appendChild(svg);
              drawer.draw(tree,svg,'light',false);
              svg.setAttribute('width','100%');
              svg.setAttribute('height','100%');
              svg.setAttribute('preserveAspectRatio','xMidYMid meet');
              target.dataset.smilesFallback='0';
            }catch(_){
              fallback();
            }
          },
          ()=>fallback()
        );
      }catch(_){
        fallback();
      }
    };

    if(window.SmilesDrawer && window.SmilesDrawer.SvgDrawer && window.SmilesDrawer.parse){
      upgrade();
    }else{
      loadSmilesDrawer().then(upgrade).catch(()=>{});
    }
  }

  function upgradeFallbackSmiles(){
    if(!window.SmilesDrawer || !window.SmilesDrawer.SvgDrawer || !window.SmilesDrawer.parse) return;
    document.querySelectorAll('[data-smiles-fallback="1"]').forEach(target=>{
      const smiles=target.dataset.smilesSource;
      if(!smiles) return;
      let options={};
      try{ options=JSON.parse(target.dataset.smilesOptions||'{}')||{}; }catch(_){}
      renderWithBestEngine(
        target,
        smiles,
        number(target.dataset.smilesWidth,180),
        number(target.dataset.smilesHeight,100),
        options
      );
    });
  }

  function makeInlineSmile(smiles,props){
    const size=number(props.size,DEFAULTS.textSize);
    const width=number(props.width,Math.max(52,size*2.45));
    const height=number(props.height,Math.max(32,size*1.55));
    const scale=number(props.scale,1);
    const rotation=number(props.rotation,0);
    const opacity=clamp(number(props.opacity,1),0,1);
    const atoms=bool(props.atoms,false);
    const valign=VALIGN.has(String(props.valign||'middle'))?String(props.valign||'middle'):'middle';
    const wrap=document.createElement('span');
    wrap.className='ccf-inline-smiles';
    wrap.style.width=`${width}px`;wrap.style.height=`${height}px`;wrap.style.opacity=String(opacity);wrap.style.verticalAlign=valign==='top'?'text-top':valign==='bottom'?'text-bottom':'middle';
    wrap.style.transform=`scale(${scale}) rotate(${rotation}deg)`;
    wrap.style.transformOrigin='center center';
    const svgHost=document.createElement('span'); svgHost.className='ccf-smiles-host'; wrap.appendChild(svgHost);
    renderWithBestEngine(svgHost,smiles,Math.max(40,Math.round(width)),Math.max(28,Math.round(height)),{atoms});
    return wrap;
  }

  function appendInlineContent(target,text){
    target.innerHTML='';
    for(const part of extractInlineParts(text)){
      if(part.type==='text'){
        target.appendChild(document.createTextNode(part.value));
      }else{
        target.appendChild(makeInlineSmile(part.smiles,part.props));
      }
    }
  }

  function createTextObject(obj){
    const props=obj.props||{};
    const div=document.createElement('div');
    div.className='ccf-text-object';
    div.style.left=`${obj.x}px`;div.style.top=`${obj.y}px`;div.style.width=`${obj.width}px`;div.style.height=`${obj.height}px`;
    div.style.fontSize=`${number(props.size,DEFAULTS.textSize)}px`;
    div.style.color=SAFE_COLORS.test(String(props.color||''))?String(props.color):DEFAULTS.textColor;
    div.style.fontWeight=String(number(props.weight,DEFAULTS.weight));
    div.style.textAlign=ALIGN.has(String(props.align||''))?String(props.align):DEFAULTS.align;
    const valign=VALIGN.has(String(props.valign||''))?String(props.valign):DEFAULTS.valign;
    div.style.justifyContent=valign==='top'?'flex-start':valign==='bottom'?'flex-end':'center';
    div.style.alignItems='stretch';
    div.style.opacity=String(clamp(number(props.opacity,1),0,1));
    div.style.transform=`rotate(${number(props.rotation,0)}deg)`;
    div.style.transformOrigin='center center';
    div.setAttribute('role','img');
    const flow=document.createElement('div');
    flow.className='ccf-text-flow';
    appendInlineContent(flow,obj.text);
    div.appendChild(flow);
    return div;
  }

  function createStandaloneSmile(obj){
    const props=obj.props||{};
    const host=document.createElement('div'); host.className='ccf-smiles-object';
    host.style.left=`${obj.x}px`;host.style.top=`${obj.y}px`;host.style.width=`${obj.width}px`;host.style.height=`${obj.height}px`;
    host.style.opacity=String(clamp(number(props.opacity,1),0,1));
    host.style.transform=`rotate(${number(props.rotation,0)}deg) scale(${number(props.scale,1)})`;
    host.style.transformOrigin='center center';
    renderWithBestEngine(host,obj.source,obj.width,obj.height,{atoms:bool(props.atoms,false)});
    return host;
  }

  function createArrow(obj){
    const svg=createSvg(Math.max(obj.x1,obj.x2,100)+20,Math.max(obj.y1,obj.y2,100)+20);
    // We use a local viewBox around the two endpoints and then position the
    // whole SVG in canvas coordinates.
    const minX=Math.min(obj.x1,obj.x2), minY=Math.min(obj.y1,obj.y2);
    const maxX=Math.max(obj.x1,obj.x2), maxY=Math.max(obj.y1,obj.y2);
    const pad=28;
    const w=Math.max(1,maxX-minX)+pad*2,h=Math.max(1,maxY-minY)+pad*2;
    svg.setAttribute('viewBox',`0 0 ${w} ${h}`); svg.style.position='absolute';svg.style.left=`${minX-pad}px`;svg.style.top=`${minY-pad}px`;svg.style.width=`${w}px`;svg.style.height=`${h}px`;
    const x1=obj.x1-minX+pad,y1=obj.y1-minY+pad,x2=obj.x2-minX+pad,y2=obj.y2-minY+pad;
    const color=SAFE_COLORS.test(String(obj.props.color||''))?String(obj.props.color):'#17634e';
    const width=number(obj.props.width,4); const opacity=clamp(number(obj.props.opacity,1),0,1);
    svg.setAttribute('aria-hidden','true');
    const line=svgEl('line',{x1,y1,x2,y2,stroke:color,'stroke-width':width,'stroke-linecap':'round',opacity}); svg.appendChild(line);
    const head=String(obj.props.head||'triangle').toLowerCase();
    if(head!=='none'){
      const angle=Math.atan2(y2-y1,x2-x1), headLen=Math.max(10,width*3.2), headW=Math.max(5,width*1.8);
      const bx=x2-Math.cos(angle)*headLen,by=y2-Math.sin(angle)*headLen;
      const p1=[x2,y2],p2=[bx+Math.sin(angle)*headW,by-Math.cos(angle)*headW],p3=[bx-Math.sin(angle)*headW,by+Math.cos(angle)*headW];
      const polygon=svgEl('polygon',{points:[p1,p2,p3].map(p=>p.join(',')).join(' '),fill:color,opacity});svg.appendChild(polygon);
    }
    return svg;
  }

  function componentNode(component,small=false){
    const wrap=document.createElement('div'); wrap.className='ccf-reaction-component';
    const visual=document.createElement('div'); visual.className='ccf-reaction-visual';
    if(component.type==='smiles'){
      const host=document.createElement('div');host.className='ccf-reaction-smiles';
      renderWithBestEngine(host,String(component.value),small?110:145,small?78:100,{atoms:bool(component.atoms,false)});
      visual.appendChild(host);
    }else{
      const text=document.createElement('div');text.className='ccf-reaction-text';
      appendInlineContent(text,String(component.value||''));
      visual.appendChild(text);
    }
    wrap.appendChild(visual);
    if(component.subtitle!=null){
      const sub=document.createElement('div');sub.className='ccf-reaction-subtitle';appendInlineContent(sub,String(component.subtitle));wrap.appendChild(sub);
    }
    return wrap;
  }

  function makePlus(){const span=document.createElement('span');span.className='ccf-reaction-plus';span.textContent='+';return span;}

  function componentSide(list,sideClass){
    const side=document.createElement('div');side.className=`ccf-reaction-side ${sideClass}`;
    list.forEach((component,index)=>{
      if(index) side.appendChild(makePlus());
      side.appendChild(componentNode(component,list.length>=5));
    });
    return side;
  }

  function createReaction(obj){
    const reaction=document.createElement('div');reaction.className='ccf-reaction-object';
    reaction.style.left=`${obj.x}px`;reaction.style.top=`${obj.y}px`;reaction.style.width=`${obj.width}px`;reaction.style.height=`${obj.height}px`;
    const core=document.createElement('div');core.className='ccf-reaction-core';
    core.style.setProperty('--reactant-count',Math.min(8,obj.reactants.length));core.style.setProperty('--product-count',Math.min(8,obj.products.length));
    core.appendChild(componentSide(obj.reactants,'ccf-reactants'));
    const arrowBox=document.createElement('div');arrowBox.className='ccf-reaction-arrow-box';
    function fillReagents(items,position){
      if(!items.length)return;
      const row=document.createElement('div');
      row.className=`ccf-reagents ccf-reagents-${position}`;
      row.setAttribute('aria-label',position==='top'?'Reaction reagents':'Reaction conditions');
      items.forEach(item=>{
        const cell=document.createElement('div');cell.className='ccf-reagent';appendInlineContent(cell,String(item.value||''));row.appendChild(cell);
      });
      arrowBox.appendChild(row);
    }
    fillReagents(obj.reagents.top,'top');
    const arrow=document.createElementNS(SVG_NS,'svg');arrow.setAttribute('viewBox','0 0 260 70');arrow.setAttribute('preserveAspectRatio','none');arrow.setAttribute('aria-hidden','true');
    const ln=svgEl('line',{x1:10,y1:35,x2:232,y2:35,stroke:'#17634e','stroke-width':'3.5','stroke-linecap':'round'});arrow.appendChild(ln);
    const poly=svgEl('polygon',{points:'232,35 210,23 210,47',fill:'#17634e'});arrow.appendChild(poly);arrowBox.appendChild(arrow);
    fillReagents(obj.reagents.bottom,'bottom');
    core.appendChild(arrowBox);
    core.appendChild(componentSide(obj.products,'ccf-products'));
    reaction.appendChild(core);
    return reaction;
  }

  function showError(target,message){
    target.innerHTML=''; target.classList.add('ccf-error-state');
    const icon=document.createElement('span');icon.className='material-symbols-rounded';icon.textContent='error';
    const title=document.createElement('strong');title.textContent='CCF could not be rendered';
    const text=document.createElement('span');text.textContent=message;
    target.append(icon,title,text);
  }

  function renderCCF(target,source){
    try{
      const doc=parseCCF(source);
      target.classList.add('ccf-stage'); target.classList.remove('ccf-error-state'); target.innerHTML='';
      target.style.setProperty('--ccf-width',doc.width);target.style.setProperty('--ccf-height',doc.height);
      const canvas=document.createElement('div');canvas.className='ccf-canvas';canvas.style.width=`${doc.width}px`;canvas.style.height=`${doc.height}px`;
      target.appendChild(canvas);
      const resize=()=>{ const scale=target.clientWidth/doc.width; canvas.style.transform=`scale(${scale})`; canvas.style.height=`${doc.height}px`; };
      if(window.ResizeObserver){ const ro=new ResizeObserver(resize);ro.observe(target);target.__ccfResizeObserver=ro; }
      else window.addEventListener('resize',resize);
      requestAnimationFrame(resize);
      doc.objects.forEach(obj=>{
        if(obj.type==='text') canvas.appendChild(createTextObject(obj));
        else if(obj.type==='smiles') canvas.appendChild(createStandaloneSmile(obj));
        else if(obj.type==='arrow') canvas.appendChild(createArrow(obj));
        else if(obj.type==='reaction') canvas.appendChild(createReaction(obj));
      });
      return true;
    }catch(err){ showError(target,err?.message||String(err)); return false; }
  }

  function normalizeRichText(value){
    return String(value??'')
      .replace(/\\r\\n/g,'\n')
      .replace(/\\n/g,'\n')
      .replace(/\\r/g,'\n');
  }

  function renderRich(target,content){
    if(!target) return false;
    if(content && typeof content==='object' && String(content.format||'').toLowerCase()==='ccf') return renderCCF(target,String(content.content||''));
    const text=normalizeRichText(content);
    if(/^\s*@ccf\s+1\b/i.test(text)){ return renderCCF(target,text); }
    target.classList.remove('ccf-error-state','ccf-stage');
    target.innerHTML='';
    target.classList.add('rich-content');
    appendInlineContent(target,text);
    return true;
  }

  function init(){ loadSmilesDrawer(); }
  window.CCFRenderer={
    renderRich,
    renderCCF,
    parseCCF,
    extractInlineParts,
    loadSmilesDrawer,
    upgradeFallbackSmiles,
    version:1
  };
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true}); else init();
})();
