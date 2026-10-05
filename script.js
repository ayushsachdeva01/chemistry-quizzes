/*
  ChemistryRecall
  Study-pack-first build
  Chapterwise quizzes are intentionally disabled and preserved in:
  disabled/chapterwise-quiz.js.disabled.txt
*/

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const STORAGE_KEY = 'chemistryRecallStudyPackV3';
const LEGACY_STORAGE_KEY = 'chemistryRecallStudyPackV2';
const DAILY_GOAL = 100;
const DAILY_MISSION = 10;

const AMINO_ACIDS = [
  ['Glycine','Gly','G'],['Alanine','Ala','A'],['Valine','Val','V'],['Leucine','Leu','L'],['Isoleucine','Ile','I'],
  ['Arginine','Arg','R'],['Lysine','Lys','K'],['Glutamic acid','Glu','E'],['Aspartic acid','Asp','D'],['Glutamine','Gln','Q'],
  ['Asparagine','Asn','N'],['Threonine','Thr','T'],['Serine','Ser','S'],['Cysteine','Cys','C'],['Methionine','Met','M'],
  ['Phenylalanine','Phe','F'],['Tyrosine','Tyr','Y'],['Tryptophan','Trp','W'],['Histidine','His','H'],['Proline','Pro','P']
];

const VITAMINS = [
  {vitamin:'Vitamin A',name:'Retinol',sources:'Fish liver oil, carrots, butter and milk',deficiency:'Xerophthalmia and night blindness'},
  {vitamin:'Vitamin B₁',name:'Thiamine',sources:'Yeast, milk, green vegetables and cereals',deficiency:'Beri-beri'},
  {vitamin:'Vitamin B₂',name:'Riboflavin',sources:'Milk, egg white, liver and kidney',deficiency:'Cheilosis and digestive disorders'},
  {vitamin:'Vitamin B₆',name:'Pyridoxine',sources:'Yeast, milk, egg yolk, cereals and grams',deficiency:'Convulsions'},
  {vitamin:'Vitamin B₁₂',name:'Cobalamin',sources:'Meat, fish, egg and curd',deficiency:'Pernicious anaemia'},
  {vitamin:'Vitamin C',name:'Ascorbic acid',sources:'Citrus fruits, amla and green leafy vegetables',deficiency:'Scurvy'},
  {vitamin:'Vitamin D',name:'Calciferol',sources:'Sunlight, fish and egg yolk',deficiency:'Rickets and osteomalacia'},
  {vitamin:'Vitamin E',name:'Tocopherols',sources:'Vegetable oils such as wheat germ and sunflower oil',deficiency:'Increased RBC fragility and muscular weakness'},
  {vitamin:'Vitamin K',name:null,sources:'Green leafy vegetables',deficiency:'Increased blood clotting time'},
  {vitamin:'Vitamin H',name:'Biotin',sources:'Yeast, avocados and nuts',deficiency:'Skin disease and hair loss'}
];

const LEVEL_TITLES = [
  [1,'Chemistry Starter'],
  [3,'Lab Apprentice'],
  [6,'Reaction Rookie'],
  [10,'Recall Builder'],
  [15,'Concept Hunter'],
  [21,'Chemistry Solver'],
  [30,'Reaction Tactician'],
  [40,'Memory Architect'],
  [55,'Chemistry Ace'],
  [75,'Organic Strategist'],
  [100,'Master of Recall'],
  [150,'Chemistry Legend']
];

const defaultState = {
  version: 2,
  grade: null,
  xp: {XI:0, XII:0},
  streak: {XI:0, XII:0},
  bestStreak: {XI:0, XII:0},
  activity: {XI:[], XII:[]},
  dayStamp: {XI:null, XII:null},
  todayXp: {XI:0, XII:0},
  daily: {
    XI:{date:null,answered:0,correct:0,complete:false},
    XII:{date:null,answered:0,correct:0,complete:false}
  },
  answered: {XI:0, XII:0},
  correct: {XI:0, XII:0},
  cards: {XI:{}, XII:{}},
  packStarts: {XI:0, XII:0},
  sessions: {XI:0, XII:0},
  perfectSessions: {XI:0, XII:0},
  bestCombo: {XI:0, XII:0},
  goalDays: {XI:0, XII:0},
  goalDates: {XI:[], XII:[]},
  achievements: {XI:[], XII:[]},
  achievementLevels: {XI:{}, XII:{}},
  recent: {XI:[], XII:[]},
  lastSession: {XI:null, XII:null}
};

function clone(value){ return JSON.parse(JSON.stringify(value)); }

function mergeState(base, saved){
  const out = clone(base);
  if(!saved || typeof saved !== 'object') return out;
  for(const key of Object.keys(base)){
    if(saved[key] === undefined) continue;
    if(base[key] && typeof base[key] === 'object' && !Array.isArray(base[key]) && saved[key] && typeof saved[key] === 'object' && !Array.isArray(saved[key])){
      out[key] = mergeState(base[key], saved[key]);
    }else{
      out[key] = saved[key];
    }
  }
  return out;
}

function loadState(){
  try{
    const current = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if(current) return mergeState(defaultState, current);
    const legacy = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY) || 'null');
    return mergeState(defaultState, legacy);
  }catch{
    return clone(defaultState);
  }
}

let state = loadState();
let activeGrade = state.grade;
let packCatalog = [];
let currentPack = null;
let selectedLength = 20;
let achievementFilter = 'all';

let session = {
  type:null,
  name:'STUDY PACK',
  items:[],
  index:0,
  score:0,
  xp:0,
  answered:false,
  combo:0,
  maxCombo:0,
  newCards:0,
  lastAnswer:null,
  endless:false,
  pack:null,
  currentItem:null,
  questionStarted:0
};

function save(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

function dateKey(date = new Date()){
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
function offsetDateKey(days){
  const d = new Date();
  d.setDate(d.getDate()+days);
  return dateKey(d);
}
function today(){ return dateKey(); }
function yesterday(){ return offsetDateKey(-1); }

function ensureDay(grade){
  const t = today();
  if(state.dayStamp[grade] !== t){
    state.dayStamp[grade] = t;
    state.todayXp[grade] = 0;
  }
  if(state.daily[grade].date !== t){
    state.daily[grade] = {date:t,answered:0,correct:0,complete:false};
  }
  save();
}

function levelThreshold(level){
  if(level <= 1) return 0;
  let total = 0;
  // Each level costs more than the one before it.
  for(let current=2; current<=level; current++){
    const cost = Math.max(100, Math.round(100 * Math.pow(1.09, current-2)));
    total += cost;
  }
  return total;
}
function levelInfo(xp){
  let level=1;
  while(levelThreshold(level+1) <= xp && level < 100000){ level++; }
  const start=levelThreshold(level);
  const next=levelThreshold(level+1);
  return {
    level, start, next,
    into:Math.max(0,xp-start),
    needed:Math.max(0,next-xp),
    span:Math.max(1,next-start),
    pct:Math.min(100,Math.max(0,((xp-start)/(next-start))*100))
  };
}
function levelTitle(level){
  let title = LEVEL_TITLES[0][1];
  for(const [min,name] of LEVEL_TITLES){
    if(level >= min) title = name;
  }
  return title;
}

function formatNumber(n){ return Number(n || 0).toLocaleString('en-IN'); }
function escapeHtml(value){
  return String(value ?? '').replace(/[&<>"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));
}
function escapeAttr(value){ return String(value ?? '').replace(/[^a-zA-Z0-9_-]/g,''); }
function shuffle(list){
  const copy = [...list];
  for(let i=copy.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [copy[i],copy[j]]=[copy[j],copy[i]];
  }
  return copy;
}

const ACHIEVEMENT_FAMILIES = [
  {
    key:'questions', icon:'quiz', label:'Question Grinder', description:'Answer questions and keep sharpening your recall.', unit:'questions',
    milestones:[1,5,10,25,50,100,250,500,1000,2500,5000,10000,25000,50000,100000],
    value:g=>state.answered[g],
  },
  {
    key:'xp', icon:'bolt', label:'XP Climber', description:'Keep earning XP and push your total higher.', unit:'XP',
    milestones:[100,250,500,1000,2500,5000,10000,25000,50000,100000,250000,500000,1000000],
    value:g=>state.xp[g],
    infinite:true,
  },
  {
    key:'streak', icon:'local_fire_department', label:'Streak Keeper', description:'Come back consistently and keep the streak alive.', unit:'days',
    milestones:[1,3,7,14,30,60,100,180,365,500,730,1000,2500],
    value:g=>state.streak[g],
    infinite:true,
  },
  {
    key:'unique', icon:'explore', label:'Explorer', description:'Discover more distinct cards across your study packs.', unit:'cards',
    milestones:[1,5,10,25,50,100,250,500,1000,2500,5000,10000],
    value:g=>Object.values(state.cards[g]||{}).filter(v=>v.seen>0).length,
    infinite:true,
  },
  {
    key:'perfect', icon:'workspace_premium', label:'Perfect Sessions', description:'Finish flawless sessions and raise your record.', unit:'perfect sessions',
    milestones:[1,3,5,10,25,50,100,250,500,1000],
    value:g=>state.perfectSessions[g],
    infinite:true,
  },
  {
    key:'sessions', icon:'school', label:'Session Maker', description:'Complete study sessions and keep the habit growing.', unit:'sessions',
    milestones:[1,3,5,10,25,50,100,250,500,1000,2500],
    value:g=>state.sessions[g],
    infinite:true,
  },
  {
    key:'combo', icon:'local_fire_department', label:'Combo Chaser', description:'Build longer runs of correct answers.', unit:'correct answers',
    milestones:[3,5,10,15,20,30,50,75,100],
    value:g=>state.bestCombo[g],
    infinite:true,
  },
  {
    key:'goaldays', icon:'calendar_month', label:'Daily Finisher', description:'Complete daily goals and make your study days count.', unit:'goals',
    milestones:[1,3,7,14,30,60,100,180,365,730],
    value:g=>state.goalDays[g],
    infinite:true,
  },
  {
    key:'packstarts', icon:'inventory_2', label:'Pack Collector', description:'Return to study packs and keep learning.', unit:'pack sessions',
    milestones:[1,3,5,10,25,50,100,250,500],
    value:g=>state.packStarts[g],
    infinite:true,
  }
];

function progressiveMilestones(family, value){
  const milestones=[...(family.milestones||[])];
  const target=Math.max(0,value);
  let last=milestones[milestones.length-1]||1;
  const growth = family.key==='streak' ? 1.65 : family.key==='combo' ? 1.6 : 2;
  while(family.infinite && last <= target){
    const next=Math.max(last+1, Math.ceil(last*growth));
    milestones.push(next);
    last=next;
    if(milestones.length>80) break;
  }
  return milestones;
}

function achievementProgress(grade,family){
  const value=Math.max(0,Number(family.value(grade)||0));
  const milestones=progressiveMilestones(family,value);
  let level=0;
  for(const threshold of milestones){
    if(value>=threshold) level++; else break;
  }
  let previous=level>0?milestones[level-1]:0;
  let next=milestones[level];
  if(next===undefined){
    next=Math.max(previous+1,Math.ceil(previous*(family.key==='streak'?1.65:2)));
  }
  const span=Math.max(1,next-previous);
  const pct=Math.min(100,Math.max(0,((value-previous)/span)*100));
  return {family,value,milestones,level,previous,next,pct};
}

function achievementDefs(grade){
  return ACHIEVEMENT_FAMILIES.map(family=>({
    ...achievementProgress(grade,family),
    id:family.key,
    icon:family.icon,
    title:family.label,
    description:family.description, unit:family.unit
  }));
}

function migrateAchievementLevels(grade){
  if(!state.achievementLevels) state.achievementLevels={XI:{},XII:{}};
  if(!state.achievementLevels[grade]) state.achievementLevels[grade]={};
  const legacy=Array.isArray(state.achievements?.[grade]) ? state.achievements[grade] : [];
  if(!legacy.length) return;
  for(const family of ACHIEVEMENT_FAMILIES){
    const ids=legacy.filter(id=>String(id).startsWith(`${family.key}_`));
    if(!ids.length) continue;
    let maxLevel=state.achievementLevels[grade][family.key]||0;
    for(const id of ids){
      const threshold=Number(String(id).split('_').pop());
      if(!Number.isFinite(threshold)) continue;
      const expanded=progressiveMilestones(family,Math.max(threshold,Number(family.value(grade)||0)));
      const idx=expanded.findIndex(v=>v===threshold);
      if(idx>=0) maxLevel=Math.max(maxLevel,idx+1);
    }
    state.achievementLevels[grade][family.key]=maxLevel;
  }
}

function checkAchievements(grade){
  migrateAchievementLevels(grade);
  const levels=state.achievementLevels[grade];
  const defs=achievementDefs(grade);
  const newly=[];
  for(const def of defs){
    const previousLevel=Number(levels[def.family.key]||0);
    if(def.level>previousLevel){
      levels[def.family.key]=def.level;
      for(let level=previousLevel+1; level<=def.level; level++){
        const threshold=def.milestones[level-1] ?? def.next;
        newly.push({...def,level,threshold,levelDescription:`Level ${level}`});
      }
    }
  }
  if(newly.length){
    // Achievement XP is intentionally modest so the badge system rewards progress
    // without creating a runaway self-reward loop.
    const bonus=Math.min(120,newly.reduce((sum,item)=>sum + Math.min(24,7+Math.floor(item.level/3)),0));
    addXP(grade,bonus);
    const high=newly[newly.length-1];
    const label=newly.length===1
      ? `${high.title} · Level ${high.level} unlocked · +${bonus} XP`
      : `${newly.length} achievement levels reached · +${bonus} XP`;
    toast(label);
    celebrate();
    setTimeout(()=>{renderAchievementsPreview(grade); if(!$('#achievementModal').hidden)renderAchievementsModal();},50);
  }
  save();
  return newly.length;
}

function ensureDaySilent(grade){
  const t=today();
  if(state.dayStamp[grade]!==t){
    state.dayStamp[grade]=t;
    state.todayXp[grade]=0;
  }
  if(state.daily[grade].date!==t){
    state.daily[grade]={date:t,answered:0,correct:0,complete:false};
  }
}

function addXP(grade, amount){
  ensureDaySilent(grade);
  state.xp[grade] += Math.max(0, amount);
  state.todayXp[grade] += Math.max(0, amount);
  if(state.todayXp[grade] >= DAILY_GOAL && !state.goalDates[grade].includes(today())){
    state.goalDates[grade].push(today());
    state.goalDays[grade] += 1;
    toast('Daily goal complete · 100 XP earned today.');
    celebrate();
  }
  save();
}

function recordActivity(grade){
  ensureDaySilent(grade);
  const t = today();
  const dates = state.activity[grade];
  if(!dates.includes(t)){
    const last = dates[dates.length-1];
    state.streak[grade] = last === yesterday() ? state.streak[grade] + 1 : 1;
    dates.push(t);
    if(dates.length > 730) state.activity[grade] = dates.slice(-730);
    state.bestStreak[grade] = Math.max(state.bestStreak[grade], state.streak[grade]);
  }
  save();
}

function getCardStat(grade, key){
  return state.cards[grade][key] || {seen:0,correct:0,wrong:0,lastSeen:0};
}

function touchCard(grade, key, correct){
  const previous = getCardStat(grade,key);
  const firstExposure = previous.seen === 0;
  const next = {
    seen:previous.seen + 1,
    correct:previous.correct + (correct?1:0),
    wrong:previous.wrong + (correct?0:1),
    lastSeen:Date.now()
  };
  state.cards[grade][key] = next;
  state.answered[grade] += 1;
  if(correct) state.correct[grade] += 1;
  return firstExposure;
}

function cardPriority(grade, item){
  const key = item.cardKey;
  const stat = getCardStat(grade,key);
  const missRate = stat.seen ? (stat.wrong/stat.seen) : 1;
  const mastery = stat.seen ? (stat.correct/stat.seen) : 0;
  const unseen = stat.seen === 0 ? 100000 : 0;
  const weakness = stat.wrong * 1800 + missRate * 1000 + (1-mastery)*600;
  const freshness = stat.lastSeen ? Math.max(0, 180000 - (Date.now()-stat.lastSeen))/1000 : 0;
  return unseen + weakness + freshness + Math.random()*500;
}

function selectPackCard(grade, cards, recentIds=[]){
  if(!cards.length) return null;
  const notRecent = cards.filter(c=>!recentIds.includes(c.cardKey));
  const candidates = notRecent.length ? notRecent : cards;
  return candidates.slice().sort((a,b)=>cardPriority(grade,b)-cardPriority(grade,a))[0];
}

function buildAdaptivePackSet(grade, cards, count){
  const chosen = [];
  const remaining = [...cards];
  while(chosen.length < count && cards.length){
    const pool = remaining.length ? remaining : [...cards];
    const candidate = selectPackCard(grade,pool,chosen.slice(-2).map(x=>x.cardKey));
    if(!candidate) break;
    chosen.push(candidate);
    const idx = remaining.findIndex(x=>x.cardKey===candidate.cardKey);
    if(idx>=0) remaining.splice(idx,1);
  }
  return chosen;
}

function chapterDisabledComment(){
  /*
    CHAPTERWISE QUIZZES ARE INTENTIONALLY DISABLED.
    The complete previous chapter engine + question bank is preserved in:
    disabled/chapterwise-quiz.js.disabled.txt
  */
}

const gradeScreen = $('#gradeScreen');
const dashboardScreen = $('#dashboardScreen');
const quizScreen = $('#quizScreen');
const completeScreen = $('#completeScreen');
const packList = $('#packList');
const questionArea = $('#questionArea');

function setScreen(screen){
  [gradeScreen,dashboardScreen,quizScreen,completeScreen].forEach(node => node.hidden = node !== screen);
}

function toast(message){
  const node = $('#toast');
  node.textContent = message;
  node.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => node.classList.remove('show'), 2200);
}

function celebrate(){
  const layer = $('#confettiLayer');
  if(!layer) return;
  layer.innerHTML='';
  for(let i=0;i<28;i++){
    const piece=document.createElement('span');
    piece.className='confetti';
    piece.style.left=`${Math.random()*100}%`;
    piece.style.setProperty('--dx',`${(Math.random()*2-1)*180}px`);
    piece.style.setProperty('--rot',`${(Math.random()*2-1)*700}deg`);
    piece.style.animationDelay=`${Math.random()*180}ms`;
    layer.appendChild(piece);
  }
  setTimeout(()=>layer.innerHTML='',1500);
}

function renderGradePicker(){
  $$('.grade-row').forEach(button=>{
    const grade=button.dataset.grade;
    const hasActivity=state.xp[grade]>0 || state.answered[grade]>0 || state.activity[grade]?.length;
    button.classList.toggle('active',!!hasActivity);
    button.querySelector('.grade-status').textContent=hasActivity?`Level ${levelInfo(state.xp[grade]).level}`:'Begin';
  });
}

function updateTopbar(){
  const has=!!activeGrade;
  $('#breadcrumb').hidden=!has;
  $('#xpChip').hidden=!has;
  $('#streakChip').hidden=!has;
  $('#classChip').hidden=!has;
  if(!has){
    $('#brandContext').textContent='A calmer way to remember chemistry';
    return;
  }
  ensureDaySilent(activeGrade);
  $('#brandContext').textContent=`Class ${activeGrade} Chemistry`;
  $('#breadcrumb').textContent=`CLASS ${activeGrade} · CHEMISTRY`;
  $('#xpChipValue').textContent=formatNumber(state.xp[activeGrade]);
  $('#streakChipValue').textContent=state.streak[activeGrade];
  $('#classChipValue').textContent=activeGrade;
}

function enterGrade(grade){
  activeGrade=grade;
  state.grade=grade;
  ensureDaySilent(grade);
  save();
  renderDashboard();
  setScreen(dashboardScreen);
  updateTopbar();
  window.scrollTo({top:0,behavior:'smooth'});
}
function home(){
  activeGrade=null;
  state.grade=null;
  save();
  setScreen(gradeScreen);
  renderGradePicker();
  updateTopbar();
  window.scrollTo({top:0,behavior:'smooth'});
}

async function loadPackCatalog(){
  try{
    const response=await fetch('packs/packs_config.json',{cache:'no-store'});
    if(!response.ok) throw new Error('config');
    const cfg=await response.json();
    packCatalog=(cfg.packs||[]).filter(pack=>(pack.grade||'XII')===activeGrade);
  }catch{
    packCatalog=[];
  }
  renderPackLibrary();
  renderDaily();
}

async function getPackCards(pack){
  const response=await fetch(pack.path,{cache:'no-store'});
  if(!response.ok) throw new Error('pack');
  const raw=await response.json();
  return raw
    .filter(card=>{
      const hasVersions=Array.isArray(card.versions) && card.versions.length>0;
      const hasQuestion=typeof card.question==='string' || (card.question && typeof card.question==='object');
      return (hasVersions || hasQuestion) && card.answer!=null;
    })
    .map((card,index)=>{
      const versions=Array.isArray(card.versions)?card.versions:[];
      const question=card.question!=null
        ? card.question
        : versions[Math.floor(Math.random()*versions.length)];
      return {
        id:`${pack.id}:${index}`,
        cardKey:`pack:${pack.id}:${index}`,
        packId:pack.id,
        group:card.group||pack.name,
        question,
        answer:card.answer
      };
    });
}

function packProgress(packId, total){
  const keys=Object.keys(state.cards[activeGrade]||{}).filter(key=>key.startsWith(`pack:${packId}:`));
  const seen=keys.filter(key=>getCardStat(activeGrade,key).seen>0).length;
  const stats=keys.map(key=>getCardStat(activeGrade,key));
  const answered=stats.reduce((sum,x)=>sum+x.seen,0);
  const correct=stats.reduce((sum,x)=>sum+x.correct,0);
  const accuracy=answered?Math.round(correct/answered*100):0;
  return {seen,total,answered,accuracy};
}

function packIcon(pack){
  const icons=['inventory_2','science','auto_awesome','menu_book','hub','bolt'];
  const index=Math.abs(String(pack.id).split('').reduce((a,c)=>a+c.charCodeAt(0),0))%icons.length;
  return icons[index];
}

async function renderPackLibrary(){
  if(!packList) return;
  $('#packCount').textContent=`${packCatalog.length} pack${packCatalog.length===1?'':'s'}`;
  if(!packCatalog.length){
    packList.innerHTML=`
      <div class="pack-empty">
        <span class="pack-empty-icon"><span class="material-symbols-rounded">add_to_photos</span></span>
        <div>
          <h3>Your study-pack library is ready.</h3>
          <p>No packs have been added to Class ${activeGrade} yet. Add a pack to <strong>packs/packs_config.json</strong> and its JSON file; it will appear here automatically.</p>
        </div>
      </div>`;
    return;
  }

  const cards = await Promise.all(packCatalog.map(async pack=>{
    try{
      const loaded=await getPackCards(pack);
      return {pack,total:loaded.length};
    }catch{
      return {pack,total:0};
    }
  }));

  const groups = new Map();
  cards.forEach(entry=>{
    const group=entry.pack.group||'Other Chemistry';
    if(!groups.has(group)) groups.set(group,[]);
    groups.get(group).push(entry);
  });

  packList.innerHTML=[...groups.entries()].map(([group,entries])=>`
    <section class="pack-group">
      <div class="pack-group-head">
        <span class="pack-group-rule"></span>
        <span class="pack-group-name">${escapeHtml(group)}</span>
        <span class="pack-group-count">${entries.length} pack${entries.length===1?'':'s'}</span>
      </div>
      <div class="pack-grid">
        ${entries.map(({pack,total})=>{
          const progress=packProgress(pack.id,total);
          const pct=total?Math.min(100,Math.round(progress.seen/total*100)):0;
          return `
            <article class="pack-card">
              <div>
                <div class="pack-card-top">
                  <span class="pack-card-icon"><span class="material-symbols-rounded">${escapeHtml(packIcon(pack))}</span></span>
                  <span class="pack-badge">${escapeHtml((pack.category||'CHEMISTRY').toUpperCase())}</span>
                </div>
                <h3>${escapeHtml(pack.name)}</h3>
                <p>${escapeHtml(pack.description||'A focused set of chemistry recall questions.')}</p>
              </div>
              <div class="pack-meta">
                <div class="pack-meta-copy">
                  <strong>${formatNumber(progress.seen)}</strong> / ${formatNumber(total)} seen
                  <div class="pack-progress"><i style="width:${pct}%"></i></div>
                </div>
                <button class="pack-study-btn" data-pack-open="${escapeAttr(pack.id)}" type="button">Start pack <span class="material-symbols-rounded">arrow_forward</span></button>
              </div>
            </article>`;
        }).join('')}
      </div>
    </section>`).join('');

  $$('[data-pack-open]').forEach(btn=>btn.onclick=()=>openPackLauncher(btn.dataset.packOpen));
}

function openPackLauncher(packId){
  const pack=packCatalog.find(p=>p.id===packId);
  if(!pack) return;
  currentPack=pack;
  selectedLength=20;
  $('#packModalTitle').textContent=pack.name;
  $('#packModalDescription').textContent=pack.description||'A focused set of chemistry recall questions.';
  $('#customLength').value=20;
  $$('.length-btn').forEach(btn=>btn.classList.toggle('active',btn.dataset.length==='20'));
  $('#startPackBtn').innerHTML='<span class="material-symbols-rounded">play_arrow</span><span>Start 20 questions</span>';
  fetchPackModalStats(pack).finally(()=>{$('#packModal').hidden=false});
}
async function fetchPackModalStats(pack){
  try{
    const cards=await getPackCards(pack);
    const p=packProgress(pack.id,cards.length);
    $('#packModalCards').textContent=formatNumber(cards.length);
    $('#packModalSeen').textContent=formatNumber(p.seen);
    $('#packModalAccuracy').textContent=p.answered?`${p.accuracy}%`:'—';
  }catch{
    $('#packModalCards').textContent='—';
    $('#packModalSeen').textContent='—';
    $('#packModalAccuracy').textContent='—';
  }
}

function closeModal(id){
  const modal=$(`#${id}`);
  if(modal) modal.hidden=true;
}

async function startSelectedPack(){
  if(!currentPack) return;
  let cards=[];
  try{cards=await getPackCards(currentPack);}catch{toast('We could not open that study pack. Please try again.');return}
  if(!cards.length){toast('This study pack does not have any usable questions yet.');return}
  const endless=selectedLength==='endless';
  const count=endless?0:Math.max(1,Math.min(5000,Number(selectedLength)||20));
  state.packStarts[activeGrade] += 1;
  addRecentPack(currentPack,0,0);
  save();
  closeModal('packModal');

  if(endless){
    beginPackSession(currentPack,cards,true,null);
  }else{
    const items=buildAdaptivePackSet(activeGrade,cards,count);
    beginPackSession(currentPack,cards,false,items);
  }
}

function beginPackSession(pack,cards,endless,items){
  const initial=items || [];
  session={
    type:'pack',
    name:pack.name,
    items:initial,
    index:0,
    score:0,
    xp:0,
    answered:false,
    combo:0,
    maxCombo:0,
    newCards:0,
    lastAnswer:null,
    endless,
    pack:{...pack,cards},
    currentItem:null,
    questionStarted:0
  };
  ensureDaySilent(activeGrade);
  $('#quizName').textContent=endless?`${pack.name} · Endless`:pack.name;
  $('#quizFinishBtn').textContent='End session';
  $('#comboBadge').hidden=true;
  setScreen(quizScreen);
  renderQuiz();
  window.scrollTo({top:0,behavior:'smooth'});
}

function nextEndlessCard(){
  const cards=session.pack?.cards||[];
  return selectPackCard(activeGrade,cards,session.items.slice(-3).map(x=>x.cardKey));
}

function renderQuiz(){
  if(session.endless && session.index >= session.items.length){
    const next=nextEndlessCard();
    if(!next){finishSession();return}
    session.items.push(next);
  }
  const current=session.items[session.index];
  if(!current){finishSession();return}

  const total=session.endless?'∞':session.items.length;
  $('#quizProgressText').textContent=session.endless?`${session.index+1} · ∞`:`${session.index+1} / ${total}`;
  $('#quizProgressFill').style.width=session.endless?'42%':`${(session.index/Math.max(1,total))*100}%`;
  $('#quizXp').textContent=formatNumber(session.xp);
  $('#comboValue').textContent=session.combo;
  $('#comboBadge').hidden=session.combo<2;
  session.answered=false;
  session.lastAnswer=null;
  session.currentItem=current;
  session.questionStarted=Date.now();

  if(current.kind==='amino-structure') renderAminoStructure(current,total);
  else if(current.kind==='amino-name') renderAminoName(current,total);
  else if(current.kind==='amino-mixed') (Math.random()<.5 ? renderAminoStructure : renderAminoName)(current,total);
  else if(current.kind==='vitamin') renderVitamin(current,total);
  else if(current.kind==='vitamin-mcq') renderVitaminMcq(current,total);
  else renderPack(current,total);
}

function renderPack(item,total){
  questionArea.innerHTML=`
    <article class="question-wrap">
      <div class="question-top">
        <span class="question-label">${escapeHtml(item.group||'STUDY PACK')}</span>
        <span class="question-count">${total==='∞'?'ENDLESS':`${total} questions`}</span>
      </div>
      <div id="packPrompt" class="pack-prompt rich-content"></div>
      <button id="revealPack" class="primary-cta" type="button"><span class="material-symbols-rounded">visibility</span> Reveal answer</button>
      <div id="packAnswer"></div>
    </article>`;
  CCFRenderer.renderRich($('#packPrompt'),item.question);
  $('#revealPack').onclick=()=>{
    session.answered=true;
    const stat=getCardStat(activeGrade,item.cardKey);
    const seenBefore=stat.seen;
    $('#packAnswer').innerHTML=`
      <div id="packAnswerContent" class="reveal-box rich-content"></div>
      <div class="subtle-note">Recall the answer before revealing it, then choose how well you remembered it.</div>
      <div class="self-grade">
        <button id="packKnow" class="grade-answer good" type="button">I remembered it</button>
        <button id="packMiss" class="grade-answer retry" type="button">I need another look</button>
      </div>`;
    CCFRenderer.renderRich($('#packAnswerContent'),item.answer);
    $('#revealPack').disabled=true;
    $('#packKnow').onclick=()=>finishPackAnswer(true,item,seenBefore);
    $('#packMiss').onclick=()=>finishPackAnswer(false,item,seenBefore);
  };
}

function finishPackAnswer(correct,item,seenBefore){
  $('#packKnow').disabled=true;
  $('#packMiss').disabled=true;
  gradeSessionItem(item,correct,seenBefore);
  finishOrNext();
}

function renderAminoStructure(item,total){
  const [name,three,code]=item.a;
  questionArea.innerHTML=`
    <article class="question-wrap">
      <div class="question-top"><span class="question-label">AMINO ACIDS · STRUCTURE → NAME</span><span class="question-count">${total} questions</span></div>
      <h2>Which amino acid is this?</h2>
      <div class="image-question"><img src="aminoAcids/${escapeAttr(code)}.png" alt="Amino acid structure"></div>
      <div class="amino-input"><input id="aminoAnswer" autocomplete="off" placeholder="Enter the full name, 3-letter code, or 1-letter code"><button id="aminoCheck" class="next-btn" type="button">Check answer</button></div>
      <div id="feedback"></div>
      <div class="question-footer"><span class="question-tip">Full names allow one typo. Codes must match exactly.</span><button id="nextQuestion" class="next-btn" type="button" disabled>Continue <span class="material-symbols-rounded">arrow_forward</span></button></div>
    </article>`;
  const input=$('#aminoAnswer');
  input.focus();
  $('#aminoCheck').onclick=()=>answerAminoStructure(item);
  input.addEventListener('keydown',e=>{if(e.key==='Enter') answerAminoStructure(item);});
}
function normalize(value){return String(value).toLowerCase().trim().replace(/[^a-z0-9]/g,'')}
function dist1(a,b){
  if(a===b)return true;
  if(Math.abs(a.length-b.length)>1)return false;
  if(a.length===b.length)return [...a].filter((c,i)=>c!==b[i]).length<=1;
  if(a.length>b.length)[a,b]=[b,a];
  let i=0,j=0,d=0;
  while(i<a.length&&j<b.length){
    if(a[i]===b[j]){i++;j++;}
    else{d++;j++;if(d>1)return false;}
  }
  return true;
}
function answerAminoStructure(item){
  if(session.answered)return;
  const [name,three,code]=item.a;
  const value=normalize($('#aminoAnswer').value);
  if(!value)return;
  session.answered=true;
  const correct=dist1(value,normalize(name))||value===normalize(three)||value===normalize(code);
  gradeSessionItem({...item,cardKey:`special:amino:${code}`},correct,getCardStat(activeGrade,`special:amino:${code}`).seen);
  feedback(correct,correct?`Correct — ${name} (${three}).`:`Correct answer: ${name} (${three}, ${code})`,correct?'':'Worth another look.');
  finishOrNext();
}

function renderAminoName(item,total){
  const [name,three]=item.a;
  const choices=shuffle(AMINO_ACIDS).map(a=>a[2]);
  questionArea.innerHTML=`
    <article class="question-wrap">
      <div class="question-top"><span class="question-label">AMINO ACIDS · NAME → STRUCTURE</span><span class="question-count">${total} questions</span></div>
      <h2>${escapeHtml(name)} <span style="color:var(--muted);font-size:.55em">(${escapeHtml(three)})</span></h2>
      <div class="structure-options">${choices.map(code=>`<button class="structure-option" data-code="${escapeAttr(code)}" type="button"><img src="aminoAcids/${escapeAttr(code)}.png" alt="Structure choice"></button>`).join('')}</div>
      <div id="feedback"></div>
      <div class="question-footer"><span class="question-tip">Choose the structure that matches the name.</span><button id="nextQuestion" class="next-btn" type="button" disabled>Continue <span class="material-symbols-rounded">arrow_forward</span></button></div>
    </article>`;
  $$('[data-code]').forEach(button=>button.onclick=()=>answerAminoName(item,button.dataset.code));
}
function answerAminoName(item,code){
  if(session.answered)return;
  session.answered=true;
  const answerCode=item.a[2];
  const key=`special:amino:${answerCode}`;
  const correct=code===answerCode;
  gradeSessionItem({...item,cardKey:key},correct,getCardStat(activeGrade,key).seen);
  $$('[data-code]').forEach(button=>{
    button.disabled=true;
    if(button.dataset.code===answerCode)button.classList.add('correct');
    if(button.dataset.code===code&&!correct)button.classList.add('wrong');
  });
  feedback(correct,correct?'Correct — that structure matches.':`Correct structure: ${item.a[0]} (${item.a[1]}).`,correct?'':'Worth another look.');
  finishOrNext();
}

function renderVitamin(item,total){
  const v=item.v;
  const type=['name','sources','deficiency'][Math.floor(Math.random()*3)];
  const prompt=type==='name'?`What is ${v.vitamin} also known as?`:type==='sources'?`Name a useful source of ${v.vitamin}.`:`What is a classic deficiency associated with ${v.vitamin}?`;
  const answer=type==='name'?(v.name||'Not specified'):type==='sources'?v.sources:v.deficiency;
  item.promptKey=type;
  item.currentAnswer=answer;
  const key=`special:vitamin:${v.vitamin}:${type}`;
  questionArea.innerHTML=`
    <article class="question-wrap">
      <div class="question-top"><span class="question-label">VITAMINS · LEARNER</span><span class="question-count">${total} questions</span></div>
      <h2>${escapeHtml(prompt)}</h2>
      <button id="revealVitamin" class="primary-cta" type="button"><span class="material-symbols-rounded">visibility</span> Reveal answer</button>
      <div id="vitAnswer"></div>
    </article>`;
  $('#revealVitamin').onclick=()=>{
    session.answered=true;
    $('#vitAnswer').innerHTML=`
      <div class="reveal-box">${escapeHtml(answer)}</div>
      <div class="subtle-note">Reveal the answer, then choose how well you remembered it.</div>
      <div class="self-grade"><button id="vitKnow" class="grade-answer good" type="button">I remembered it</button><button id="vitMiss" class="grade-answer retry" type="button">I need another look</button></div>`;
    $('#revealVitamin').disabled=true;
    $('#vitKnow').onclick=()=>finishSpecialAnswer(true,{...item,cardKey:key});
    $('#vitMiss').onclick=()=>finishSpecialAnswer(false,{...item,cardKey:key});
  };
}
function finishSpecialAnswer(correct,item){
  $('#vitKnow')?.setAttribute('disabled','disabled');
  $('#vitMiss')?.setAttribute('disabled','disabled');
  gradeSessionItem(item,correct,getCardStat(activeGrade,item.cardKey).seen);
  finishOrNext();
}

function renderVitaminMcq(item,total){
  const v=item.v;
  const prompts=[
    [`What is ${v.vitamin} also known as?`,v.name],
    [`Which deficiency is associated with ${v.vitamin}?`,v.deficiency],
    [`Which option is a source of ${v.vitamin}?`,v.sources]
  ];
  let [prompt,answer]=prompts[Math.floor(Math.random()*prompts.length)];
  if(!answer) [prompt,answer]=prompts.find(x=>x[1])||prompts[0];
  let distractors;
  if(prompt.includes('also known')) distractors=VITAMINS.filter(x=>x!==v&&x.name).map(x=>x.name);
  else if(prompt.includes('deficiency')) distractors=VITAMINS.filter(x=>x!==v).map(x=>x.deficiency);
  else distractors=VITAMINS.filter(x=>x!==v).map(x=>x.sources);
  const options=shuffle([answer,...shuffle(distractors).slice(0,3)]);
  const key=`special:vitamin:${v.vitamin}:mcq`;
  questionArea.innerHTML=`
    <article class="question-wrap">
      <div class="question-top"><span class="question-label">VITAMINS · MCQ</span><span class="question-count">${total} questions</span></div>
      <h2>${escapeHtml(prompt)}</h2>
      <div class="option-list">${options.map((option,i)=>`<button class="option-btn" data-vit-opt="${i}" type="button"><span class="option-letter">${String.fromCharCode(65+i)}</span><span class="option-text">${escapeHtml(option)}</span></button>`).join('')}</div>
      <div id="feedback"></div>
      <div class="question-footer"><span class="question-tip">Choose an answer and get instant feedback.</span><button id="nextQuestion" class="next-btn" type="button" disabled>Continue <span class="material-symbols-rounded">arrow_forward</span></button></div>
    </article>`;
  $$('[data-vit-opt]').forEach((button,i)=>button.onclick=()=>{
    if(session.answered)return;
    session.answered=true;
    const correct=options[i]===answer;
    gradeSessionItem({...item,cardKey:key},correct,getCardStat(activeGrade,key).seen);
    $$('[data-vit-opt]').forEach((node,j)=>{
      node.disabled=true;
      if(options[j]===answer)node.classList.add('correct');
      if(j===i&&!correct)node.classList.add('wrong');
    });
    feedback(correct,correct?'Correct — you remembered it.':`Correct answer: ${answer}`,correct?'':'Worth another look.');
    finishOrNext();
  });
}

function feedback(correct,text,sub=''){
  const el=$('#feedback');
  if(!el)return;
  el.innerHTML=`<div class="feedback ${correct?'':'wrong'}">${escapeHtml(text)}${sub?`<small>${escapeHtml(sub)}</small>`:''}</div>`;
}

function gradeSessionItem(item,correct,seenBefore){
  const grade=activeGrade;
  session.lastAnswer=correct;
  session.score += correct?1:0;

  if(correct) session.combo += 1;
  else session.combo = 0;
  session.maxCombo = Math.max(session.maxCombo,session.combo);
  state.bestCombo[grade] = Math.max(state.bestCombo[grade],session.maxCombo);

  const firstExposure = touchCard(grade,item.cardKey,correct);

  let gain = correct ? 12 : 4;
  if(firstExposure) gain += 5;
  if(correct && session.combo>=3) gain += Math.min(7,Math.floor(session.combo/3)*2);
  if(correct && state.streak[grade]>=7) gain += 2;
  if(session.endless && firstExposure) gain += 2;

  session.xp += gain;
  addXP(grade,gain);
  recordActivity(grade);

  if(!correct){
    // Misses are represented in card stats. No punitive score beyond the lower XP gain.
  }

  if(session.type==='daily'){
    const d=state.daily[grade];
    d.answered += 1;
    if(correct) d.correct += 1;
    if(d.answered>=DAILY_MISSION) d.complete=true;
  }

  if(firstExposure) session.newCards += 1;
  checkAchievements(grade);
  save();

  const comboText=correct && session.combo>=2?` · ${session.combo}× combo`:'';
  const newText=firstExposure?' · New card':'';
  toast(`+${gain} XP${comboText}${newText}`);
  $('#quizXp').textContent=formatNumber(session.xp);
  $('#comboValue').textContent=session.combo;
  $('#comboBadge').hidden=session.combo<2;
  $('#streakChipValue').textContent=state.streak[grade];
}

function finishOrNext(){
  const next=$('#nextQuestion');
  if(next){
    next.disabled=false;
    next.onclick=advanceQuestion;
  }else{
    setTimeout(advanceQuestion,380);
  }
}

function advanceQuestion(){
  if(!session.answered)return;
  if(session.endless){
    session.index += 1;
    renderQuiz();
    window.scrollTo({top:0,behavior:'smooth'});
    return;
  }
  if(session.index >= session.items.length-1){
    finishSession();
    return;
  }
  session.index += 1;
  renderQuiz();
  window.scrollTo({top:0,behavior:'smooth'});
}

function finishSession(){
  const grade=activeGrade;
  const total=session.items.length;
  const score=session.score;
  const accuracy=total?Math.round(score/total*100):0;
  const beforeLevel=levelInfo(state.xp[grade]).level;
  const perfect=total>0 && accuracy===100;

  state.sessions[grade] += 1;
  if(perfect) state.perfectSessions[grade] += 1;
  state.bestCombo[grade] = Math.max(state.bestCombo[grade],session.maxCombo);

  let sessionBonus=0;
  if(perfect) sessionBonus += 30;
  else if(accuracy>=90) sessionBonus += 15;
  else if(accuracy>=75) sessionBonus += 8;
  if(session.endless && total>=25) sessionBonus += 20;
  if(session.type==='daily' && state.daily[grade].complete && state.daily[grade].answered===DAILY_MISSION){
    sessionBonus += 50;
  }
  if(sessionBonus){
    session.xp += sessionBonus;
    addXP(grade,sessionBonus);
  }

  checkAchievements(grade);
  const afterLevel=levelInfo(state.xp[grade]).level;
  if(afterLevel>beforeLevel){
    toast(`Level ${afterLevel} unlocked · ${levelTitle(afterLevel)}`);
    celebrate();
  }

  state.lastSession[grade]={
    name:session.name,
    packId:session.pack?.id||null,
    score,
    total,
    accuracy,
    xp:session.xp,
    newCards:session.newCards,
    date:today(),
    endless:session.endless
  };
  addRecentPack(session.pack,score,total);
  save();

  $('#completeEyebrow').textContent=`${session.name.toUpperCase()} · ${session.endless?'ENDED':'COMPLETE'}`;
  $('#completeTitle').textContent=
    accuracy===100?'Clean sweep.':
    accuracy>=90?'Excellent work.':
    accuracy>=75?'Solid session.':
    'Good practice — keep building.';
  $('#completeMessage').textContent=
    session.endless
      ? `You worked through ${total} cards in Endless mode. The next run will continue surfacing less familiar questions.`
      : `You finished ${total} cards. Your next session will favour unseen and weaker questions.`;
  $('#completeScore').textContent=formatNumber(total);
  $('#completeAccuracy').textContent=`${accuracy}%`;
  $('#completeNew').textContent=formatNumber(session.newCards);
  $('#completeXp').textContent=`+${formatNumber(session.xp)} XP`;

  const bonusText=sessionBonus?` · +${sessionBonus} bonus XP`:'';
  $('#completionNote').textContent=
    perfect ? `Perfect session. ${sessionBonus?`You also earned a ${sessionBonus} XP bonus.`:'That was flawless.'}`
    : session.newCards>0 ? `${session.newCards} new cards are now in your memory history.${bonusText}`
    : `You are strengthening cards you have already seen.${bonusText}`;

  if(perfect || session.maxCombo>=5) celebrate();
  setScreen(completeScreen);
  updateTopbar();
  window.scrollTo({top:0,behavior:'smooth'});
}

function beginSpecialSession(name,items,kind){
  session={
    type:'special',
    name,
    items:items,
    index:0,
    score:0,
    xp:0,
    answered:false,
    combo:0,
    maxCombo:0,
    newCards:0,
    lastAnswer:null,
    endless:false,
    pack:null,
    currentItem:null,
    questionStarted:0,
    specialKind:kind
  };
  setScreen(quizScreen);
  $('#quizName').textContent=name;
  $('#quizFinishBtn').textContent='End session';
  renderQuiz();
  window.scrollTo({top:0,behavior:'smooth'});
}

function startSpecial(kind){
  if(kind==='amino-structure'){
    beginSpecialSession('Structure → Name',shuffle(AMINO_ACIDS).map(a=>({id:`amino-${a[2]}`,a,kind:'amino-structure'})),'amino-structure');
  }else if(kind==='amino-name'){
    beginSpecialSession('Name → Structure',shuffle(AMINO_ACIDS).map(a=>({id:`amino-${a[2]}`,a,kind:'amino-name'})),'amino-name');
  }else if(kind==='amino-mixed'){
    beginSpecialSession('Mixed amino practice',shuffle(AMINO_ACIDS).map(a=>({id:`amino-${a[2]}`,a,kind:'amino-mixed'})),'amino-mixed');
  }else if(kind==='vitamin'){
    beginSpecialSession('Vitamins Learner',shuffle(VITAMINS).map((v,i)=>({id:`vit-${i}`,v,kind:'vitamin'})),'vitamin');
  }else if(kind==='vitamin-mcq'){
    beginSpecialSession('Vitamins MCQ',shuffle(VITAMINS).map((v,i)=>({id:`vit-${i}`,v,kind:'vitamin-mcq'})),'vitamin-mcq');
  }
}

async function startDaily(){
  if(state.daily[activeGrade]?.complete){
    toast('Today’s mission is complete. Come back tomorrow for a fresh challenge.');
    return;
  }
  if(!packCatalog.length){
    toast(`Add a study pack to Class ${activeGrade} to unlock today’s mission.`);
    return;
  }
  const loaded=await Promise.all(packCatalog.map(async pack=>{
    try{
      const cards=await getPackCards(pack);
      return cards;
    }catch{return [];}
  }));
  const all=loaded.flat();
  if(!all.length){toast('Your study-pack library does not have any questions yet.');return;}
  const items=buildAdaptivePackSet(activeGrade,all,DAILY_MISSION);
  const virtualPack={id:'daily',name:`Daily Mission · Class ${activeGrade}`,description:'A fresh adaptive mix from your study packs.',cards:all};
  session={
    type:'daily',
    name:virtualPack.name,
    items,
    index:0,score:0,xp:0,answered:false,combo:0,maxCombo:0,newCards:0,lastAnswer:null,endless:false,
    pack:virtualPack,currentItem:null,questionStarted:0
  };
  setScreen(quizScreen);
  $('#quizName').textContent='Daily Mission';
  $('#quizFinishBtn').textContent='End session';
  renderQuiz();
}

function renderDaily(){
  ensureDaySilent(activeGrade);
  const daily=state.daily[activeGrade];
  $('#dailyCount').textContent=`${Math.min(daily.answered,DAILY_MISSION)} / ${DAILY_MISSION}`;
  $('#dailyFill').style.width=`${Math.min(100,daily.answered/DAILY_MISSION*100)}%`;
  const done=daily.complete;
  $('#dailyTitle').textContent=done?'Mission complete · well done.':'10 questions · 50 bonus XP';
  $('#dailyDescription').textContent=done?'Come back tomorrow for a fresh challenge.':'Complete today’s mission to earn the bonus and keep your streak moving.';
  $('#dailyButtonText').textContent=done?'Complete for today':'Start today’s mission';
  $('#dailyBtn').disabled=done || !packCatalog.length;
}

function addRecentPack(pack,score,total){
  if(!pack || !pack.id || pack.id==='daily') return;
  const list=state.recent[activeGrade];
  list.unshift({
    packId:pack.id,
    name:pack.name,
    score:score||0,
    total:total||0,
    date:today()
  });
  state.recent[activeGrade]=list.filter((item,index,arr)=>arr.findIndex(x=>x.packId===item.packId)===index).slice(0,5);
}

function renderRecent(){
  const list=$('#recentList');
  const recent=state.recent[activeGrade]||[];
  if(!recent.length){
    list.innerHTML='<div class="recent-empty">Your recent study sessions will appear here.</div>';
    return;
  }
  list.innerHTML=recent.map(item=>`
    <div class="recent-item">
      <div><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.date)}</small></div>
      <span class="recent-score">${formatNumber(item.score)} / ${formatNumber(item.total)}</span>
    </div>`).join('');
}

function achievementEarnedTotal(grade){
  return Object.values(state.achievementLevels?.[grade]||{}).reduce((sum,n)=>sum+Number(n||0),0);
}

function achievementProgressCopy(def){
  if(def.level===0){
    return `First milestone: ${formatNumber(def.next)} ${def.unit}.`;
  }
  const remaining=Math.max(0,def.next-def.value);
  return `Level ${def.level} · ${formatNumber(def.value)} ${def.unit} · ${formatNumber(remaining)} to Level ${def.level+1}.`;
}

function renderAchievementsPreview(grade=activeGrade){
  const defs=achievementDefs(grade);
  const earnedCount=achievementEarnedTotal(grade);
  $('#achievementCountTop').textContent=formatNumber(earnedCount);
  $('#badgeCount').textContent=formatNumber(earnedCount);
  const preview=defs
    .slice()
    .sort((a,b)=>b.level-a.level || b.pct-a.pct)
    .slice(0,5);
  $('#badgeList').innerHTML=preview.map(def=>`
    <div class="shelf-item ${def.level?'earned':''}">
      <span class="shelf-item-icon"><span class="material-symbols-rounded">${escapeHtml(def.icon)}</span></span>
      <span><strong>${escapeHtml(def.title)}</strong><small>${escapeHtml(achievementProgressCopy(def))}</small></span>
      <span class="shelf-state">${def.level?'Level '+def.level:'Next'}</span>
    </div>`).join('');
}

function renderAchievementsModal(){
  const defs=achievementDefs(activeGrade);
  const filtered=defs.filter(def=>{
    if(achievementFilter==='earned') return def.level>0;
    if(achievementFilter==='locked') return def.level===0;
    return true;
  });
  $('#achievementEarnedCount').textContent=formatNumber(achievementEarnedTotal(activeGrade));
  $('#achievementList').innerHTML=filtered.map(def=>`
    <article class="achievement-item ${def.level?'earned':''}">
      <div class="achievement-icon-wrap">
        <span class="achievement-icon"><span class="material-symbols-rounded">${escapeHtml(def.icon)}</span></span>
        <b>${def.level?'Level '+def.level:'Not yet'}</b>
      </div>
      <span class="achievement-copy">
        <strong>${escapeHtml(def.title)}</strong>
        <small>${escapeHtml(def.description)} ${escapeHtml(achievementProgressCopy(def))}</small>
        <span class="achievement-mini-track"><i style="width:${def.pct}%"></i></span>
      </span>
      <span class="achievement-state">${def.level?`Level ${def.level}`:'In progress'}</span>
    </article>`).join('');
}

function openAchievements(){
  achievementFilter='all';
  $$('.filter-btn').forEach(btn=>btn.classList.toggle('active',btn.dataset.achFilter==='all'));
  renderAchievementsModal();
  $('#achievementModal').hidden=false;
}

function renderStats(){
  const g=activeGrade;
  ensureDaySilent(g);
  const info=levelInfo(state.xp[g]);
  $('#statStreak').textContent=state.streak[g];
  $('#statBestStreak').textContent=`${state.bestStreak[g]} day${state.bestStreak[g]===1?'':'s'}`;
  $('#statXp').textContent=formatNumber(state.xp[g]);
  $('#statLevel').textContent=info.level;
  $('#statAnswered').textContent=formatNumber(state.answered[g]);
  $('#statAccuracy').textContent=state.answered[g]?`${Math.round(state.correct[g]/state.answered[g]*100)}%`:'0%';
  $('#statUnique').textContent=formatNumber(Object.values(state.cards[g]||{}).filter(x=>x.seen>0).length);

  $('#heroLevel').textContent=info.level;
  $('#heroLevelLabel').textContent=levelTitle(info.level);
  $('#heroLevelRank').textContent=levelTitle(info.level).toUpperCase();
  $('#heroLevelFill').style.width=`${info.pct}%`;
  $('#heroLevelInto').textContent=`${formatNumber(info.into)} XP`;
  $('#heroLevelRemaining').textContent=`${formatNumber(info.needed)} XP to reach Level ${info.level+1}`;
  $('#heroLevelNext').textContent=`Level ${info.level+1}`;
  $('#heroLevelMotivation').textContent=state.xp[g]===0
    ? 'Start with one question. Build the streak from there.'
    : `${formatNumber(info.needed)} XP stands between you and the next level.`;
  $('#heroLevelGlory').textContent=info.pct>=80
    ? 'Almost there — finish the bar and unlock the next level.'
    : `${formatNumber(info.into)} XP earned at this level · ${formatNumber(info.span)} XP to go in the full level span.`;
  $('#levelCard').style.setProperty('--level-angle', `${Math.max(0,info.pct)*3.6}deg`);

  $('#sideXp').textContent=formatNumber(state.xp[g]);
  $('#sideMomentumText').textContent=state.xp[g]===0?'Start with one question and build from there.':`${formatNumber(info.needed)} XP to reach Level ${info.level+1}.`;
  $('#sideLevelFill').style.width=`${info.pct}%`;
  $('#sideLevelName').textContent=`Level ${info.level}`;
  $('#sideNextLevel').textContent=`${formatNumber(info.needed)} XP to go`;

  renderAchievementsPreview(g);
  renderRecent();
}

function renderDashboard(){
  updateTopbar();
  $('#dashboardEyebrow').textContent=`CLASS ${activeGrade} · CHEMISTRY`;
  $('#dashboardTitle').textContent='Choose a pack. Build momentum.';
  $('#dashboardSubtitle').textContent=activeGrade==='XII'
    ? 'Study packs are the heart of ChemistryRecall. Choose a pack, set your pace, and let adaptive exposure keep every session useful.'
    : 'Your Class XI library is ready. Add study packs and start building momentum from day one.';

  $('#recallLab').hidden=activeGrade!=='XII';
  renderStats();
  renderDaily();
  loadPackCatalog();
}

function changeLength(value){
  selectedLength=value;
  $$('.length-btn').forEach(btn=>btn.classList.toggle('active',btn.dataset.length===String(value)));
  const label=value==='endless'?'Start Endless mode':`Start ${formatNumber(Number(value))} questions`;
  $('#startPackBtn').innerHTML=`<span class="material-symbols-rounded">${value==='endless'?'all_inclusive':'play_arrow'}</span><span>${label}</span>`;
}

function handleCustomLengthInput(){
  const value=Math.max(1,Math.min(5000,Number($('#customLength').value)||1));
  selectedLength=value;
  $$('.length-btn').forEach(btn=>btn.classList.remove('active'));
  $('#startPackBtn').innerHTML=`<span class="material-symbols-rounded">play_arrow</span><span>Start ${formatNumber(value)} questions</span>`;
}

$$('.grade-row').forEach(button=>button.onclick=()=>enterGrade(button.dataset.grade));
$('#brandBtn').onclick=()=>activeGrade?renderDashboard():home();
$('#classChip').onclick=home;
$('#xpChip').onclick=openAchievements;
$('#streakChip').onclick=()=>toast(`Streak: ${state.streak[activeGrade]} day${state.streak[activeGrade]===1?'':'s'} · Best: ${state.bestStreak[activeGrade]} day${state.bestStreak[activeGrade]===1?'':'s'}`);
$('#heroStudyBtn').onclick=()=>packCatalog[0]?openPackLauncher(packCatalog[0].id):toast('Add a study pack to begin your first session.');
$('#achievementsBtn').onclick=openAchievements;
$('#viewAchievementsBtn').onclick=openAchievements;
$('#levelDetailsBtn').onclick=openAchievements;
$('#dailyBtn').onclick=startDaily;

$$('[data-special]').forEach(button=>button.onclick=()=>startSpecial(button.dataset.special));
$$('[data-close-modal]').forEach(button=>button.onclick=()=>closeModal(button.dataset.closeModal));
$$('[data-length]').forEach(button=>button.onclick=()=>changeLength(button.dataset.length));
$('#customLength').addEventListener('input',handleCustomLengthInput);
$('#startPackBtn').onclick=startSelectedPack;

$$('[data-ach-filter]').forEach(button=>{
  button.onclick=()=>{
    achievementFilter=button.dataset.achFilter;
    $$('.filter-btn').forEach(btn=>btn.classList.toggle('active',btn===button));
    renderAchievementsModal();
  };
});

$('#quizBackBtn').onclick=()=>{
  setScreen(dashboardScreen);
  renderDashboard();
  window.scrollTo({top:0,behavior:'smooth'});
};
$('#quizFinishBtn').onclick=()=>{
  if(!session.answered && session.index===0){
    const confirmed=window.confirm('Leave this session? Nothing will be recorded.');
    if(confirmed){
      setScreen(dashboardScreen);
      renderDashboard();
    }
    return;
  }
  finishSession();
};
$('#completeAgainBtn').onclick=()=>{
  if(session.pack?.id && session.pack.id!=='daily') openPackLauncher(session.pack.id);
  else if(session.type==='special') startSpecial(session.specialKind || 'amino-mixed');
  else if(session.type==='daily') startDaily();
  else setScreen(dashboardScreen);
};
$('#completeHomeBtn').onclick=()=>{
  setScreen(dashboardScreen);
  renderDashboard();
  window.scrollTo({top:0,behavior:'smooth'});
};
$('#completeAchievementsBtn').onclick=openAchievements;

window.addEventListener('keydown',event=>{
  if(event.key==='Escape'){
    if(!$('#packModal').hidden)closeModal('packModal');
    if(!$('#achievementModal').hidden)closeModal('achievementModal');
  }
});

function ensureInitial(){
  migrateAchievementLevels('XI');
  migrateAchievementLevels('XII');
  save();
  renderGradePicker();
  updateTopbar();
  if(activeGrade){
    ensureDaySilent(activeGrade);
    renderDashboard();
    setScreen(dashboardScreen);
  }else{
    setScreen(gradeScreen);
  }
}

ensureInitial();
