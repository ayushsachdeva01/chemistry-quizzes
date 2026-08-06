

// ===== Weighted Question Engine =====
const __weightedStats = new Map();
let __lastQuestionKey = null;

function __stats(key){
  if(!__weightedStats.has(key)){
    __weightedStats.set(key,{shown:0,correct:0,wrong:0});
  }
  return __weightedStats.get(key);
}
function __resetWeightedStats() {
  __weightedStats.clear();
  __lastQuestionKey = null;
}
function __weightedPick(items, keyFn) {
  const unseen = [];
  const weighted = [];

  for (const item of items) {
    const key = keyFn(item);

    // Never repeat the previous question
    if (key === __lastQuestionKey) continue;

    const s = __stats(key);

    // Larger base keeps weights from diverging too much
    let w = 400;

    // Very strong first-pass coverage
    if (s.shown === 0) {
      w += 300;
    }

    // Smooth diminishing penalty
    w /= (1 + s.shown * 0.25);

    // Wrong answers should matter,
    // but not dominate the distribution
    w += Math.min(s.wrong, 6) * 35;

    // Small reduction for correct answers
    w -= s.correct * 2;

    // Minimum probability
    if (w < 25) w = 25;

    const e = { item, key, w };
    weighted.push(e);

    if (s.shown === 0) {
      unseen.push(e);
    }
  }

  let pool = weighted;

  // Until every question has appeared,
  // heavily prioritize unseen ones
  if (unseen.length && Math.random() < 0.90) {
    pool = unseen;
  }

  const total = pool.reduce((a, b) => a + b.w, 0);
  let r = Math.random() * total;

  for (const e of pool) {
    r -= e.w;

    if (r <= 0) {
      __stats(e.key).shown++;
      __lastQuestionKey = e.key;
      return e.item;
    }
  }

  const e = pool[pool.length - 1];
  __stats(e.key).shown++;
  __lastQuestionKey = e.key;
  return e.item;
}
function debugQuestionStats(items, keyFn) {
    console.table(
        items.map(item => {
            const key = keyFn(item);
            const s = __stats(key);

            let weight = 300;

            if (s.shown === 0) weight += 250;

            weight /= (1 + s.shown * 0.30);
            weight += s.wrong * 50;
            weight -= s.correct * 3;

            return {
                id: key,
                shown: s.shown,
                correct: s.correct,
                wrong: s.wrong,
                weight: Math.round(weight)
            };
        })
    );
}
// ===== End Weighted Question Engine =====

const AMINO_ACIDS = [
  ["Glycine","Gly","G"],["Alanine","Ala","A"],["Valine","Val","V"],["Leucine","Leu","L"],
  ["Isoleucine","Ile","I"],["Arginine","Arg","R"],["Lysine","Lys","K"],["Glutamic acid","Glu","E"],
  ["Aspartic acid","Asp","D"],["Glutamine","Gln","Q"],["Asparagine","Asn","N"],["Threonine","Thr","T"],
  ["Serine","Ser","S"],["Cysteine","Cys","C"],["Methionine","Met","M"],["Phenylalanine","Phe","F"],
  ["Tyrosine","Tyr","Y"],["Tryptophan","Trp","W"],["Histidine","His","H"],["Proline","Pro","P"]
];

let quizMode="mixed", currentMode=null, current=null, score=0, total=0, wrongPool=[], answered=false;
const $ = s => document.querySelector(s);
const startScreen=$("#startScreen"), quizScreen=$("#quizScreen"), questionArea=$("#questionArea");

function normalize(s){return s.toLowerCase().trim().replace(/[^a-z0-9]/g,"")}
function editDistanceAtMostOne(a,b){
  a=normalize(a); b=normalize(b);
  if(a===b)return true;
  if(Math.abs(a.length-b.length)>1)return false;
  if(a.length===b.length)return [...a].filter((c,i)=>c!==b[i]).length<=1;
  if(a.length>b.length)[a,b]=[b,a];
  let i=0,j=0,d=0;
  while(i<a.length&&j<b.length){if(a[i]===b[j]){i++;j++}else{d++;j++;if(d>1)return false}}
  return true;
}
function imagePath(code){ return `aminoAcids/${code}.png`; }
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function updateStats(){
  $("#scoreText").textContent = `${score} / ${total}`;

  const unseen = AMINO_ACIDS.filter(
    a => __stats(a[2]).shown === 0
  ).length;

  $("#missedBadge").textContent =
    unseen === 0
      ? "All questions seen"
      : `${unseen} unseen`;
}
function goHome(){
  vitaminModeActive=false; vitaminMcqModeActive=false; flashcardModeActive=false; quizScreen.hidden=true; startScreen.hidden=false; $("#scorePill").hidden=true; questionArea.innerHTML="";
}
function startQuiz(mode){
  __resetWeightedStats();
  quizMode=mode; score=0; total=0; wrongPool=[]; startScreen.hidden=true; quizScreen.hidden=false; $("#scorePill").hidden=false; nextQuestion();
}
function chooseAminoAcid(){
  return __weightedPick(AMINO_ACIDS,a=>a[2]);
}
function nextQuestion(){
  answered=false; current=chooseAminoAcid();
  currentMode=quizMode==="mixed"?(Math.random()<.5?"structure_name":"name_structure"):quizMode;
  $("#modeLabel").textContent=currentMode==="structure_name"?"STRUCTURE → NAME":"NAME → STRUCTURE";
  updateStats();
  currentMode==="structure_name"?showStructureToName():showNameToStructure();
}
function safeImg(code, cls=""){
  return `<img class="${cls}" src="${imagePath(code)}" alt="Amino acid structure" onerror="this.closest('.question-card')?.classList.add('image-error'); this.alt='Missing image: ${code}.png';">`;
}
function showStructureToName(){
  const [name,three,code]=current;
  questionArea.innerHTML=`<article class="question-card">
    <div class="question-title"><p class="prompt">Identify the molecule</p><h2>Which amino acid is this?</h2></div>
    <div class="structure-large">${safeImg(code)}</div>
    <div class="answer-row"><input id="answerInput" class="answer-input" autocomplete="off" placeholder="Type name, 3-letter or 1-letter code" />
    <button id="actionBtn" class="primary-btn">Check</button></div>
    <div id="feedback"></div><p class="hint">One typo is accepted for full amino-acid names. Abbreviations must be exact.</p>
  </article>`;
  const input=$("#answerInput"); input.focus();
  $("#actionBtn").onclick=checkName;
  input.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key==="ArrowRight")checkName()});
}
function nameAnswerCorrect(answer){
  const [name,three,code]=current, a=normalize(answer);
  return editDistanceAtMostOne(a,normalize(name)) || [normalize(three),normalize(code)].includes(a);
}
function feedback(correct,text){
  $("#feedback").innerHTML=`<div class="feedback ${correct?"correct":"wrong"}">${text}</div>`;
}
function addWrong(){
  if(!wrongPool.some(a=>a[2]===current[2])) wrongPool.push(current);
}
function removeWrong(){wrongPool=wrongPool.filter(a=>a[2]!==current[2])}
function checkName(){
  if(answered){nextQuestion();return}
  const input=$("#answerInput"), answer=input.value.trim(); if(!answer)return;
  answered=true; total++;
  const [name,three,code]=current;
  if(nameAnswerCorrect(answer)){score++; __stats(current[2]).correct++; removeWrong(); feedback(true,`✓ Correct — ${name} (${three}, ${code})`)}
  else{__stats(current[2]).wrong++; addWrong(); feedback(false,`✕ Correct answer: ${name} (${three}, ${code})`)}
  input.disabled=true; const b=$("#actionBtn"); b.textContent="Next"; b.onclick=nextQuestion; updateStats();
}
function showNameToStructure(){
  const [name,three,code]=current, choices=shuffle([...AMINO_ACIDS]);
  questionArea.innerHTML=`<article class="question-card">
    <div class="question-title"><p class="prompt">Choose the matching structure</p><h2>${name} <span style="color:#7e94aa;font-size:.55em">(${three}, ${code})</span></h2></div>
    <div id="feedback"></div>
    <div class="structure-grid">${choices.map(a=>`<button class="choice" data-code="${a[2]}" aria-label="Choose structure">${safeImg(a[2])}</button>`).join("")}</div>
    <div class="next-wrap" id="nextWrap"></div>
  </article>`;
  document.querySelectorAll(".choice").forEach(btn=>btn.onclick=()=>checkStructure(btn.dataset.code));
}
function checkStructure(selectedCode){
  if(answered)return; answered=true; total++;
  const [name,three,code]=current, selected=AMINO_ACIDS.find(a=>a[2]===selectedCode);
  if(selectedCode===code){score++;__stats(code).correct++;removeWrong();feedback(true,`✓ Correct — ${name} (${three}, ${code})`)}
  else{__stats(current[2]).wrong++; addWrong();feedback(false,`✕ You chose ${selected[0]}. Correct: ${name} (${three}, ${code})`)}
  document.querySelectorAll(".choice").forEach(b=>{b.disabled=true;if(b.dataset.code===code)b.classList.add("correct");if(b.dataset.code===selectedCode&&selectedCode!==code)b.classList.add("wrong")});
  $("#nextWrap").innerHTML=`<button class="primary-btn next-btn" id="nextBtn">Next Question →</button>`;
  $("#nextBtn").onclick=nextQuestion; updateStats();
}

// ============================================================
// VITAMINS LEARNER
// ============================================================

const VITAMINS = [
  {
    vitamin: "Vitamin A",
    name: "Retinol",
    sources: "Fish liver oil, carrots, butter and milk",
    deficiency: "Xerophthalmia i.e., hardening of cornea of eye; night blindness"
  },
  {
    vitamin: "Vitamin B₁",
    name: "Thiamine",
    sources: "Yeast, milk, green vegetables and cereals",
    deficiency: "Beri-Beri (loss of appetite, retarded growth)"
  },
  {
    vitamin: "Vitamin B₂",
    name: "Riboflavin",
    sources: "Milk, egg white, liver and kidney",
    deficiency: "Cheilosis (fissuring at corners of mouth and lips), digestive disorders and burning sensation of the skin"
  },
  {
    vitamin: "Vitamin B₆",
    name: "Pyridoxine",
    sources: "Yeast, milk, egg yolk, cereals and grams",
    deficiency: "Convulsions"
  },
  {
    vitamin: "Vitamin B₁₂",
    name: "Cobalamin",
    sources: "Meat, fish, egg and curd",
    deficiency: "Pernicious anaemia (RBC deficient in hemoglobin)"
  },
  {
    vitamin: "Vitamin C",
    name: "Ascorbic acid",
    sources: "Citrus fruits, amla and green leafy vegetables",
    deficiency: "Scurvy (bleeding gums)"
  },
  {
    vitamin: "Vitamin D",
    name: "Calciferol",
    sources: "Exposure to sunlight, fish and egg yolk",
    deficiency: "Rickets (bone deformities in children) and osteomalacia (soft bones and joint pain in adults)"
  },
  {
    vitamin: "Vitamin E",
    name: "Tocopherols",
    sources: "Vegetable oils like wheat germ oil, sunflower oil, etc.",
    deficiency: "Increased fragility of RBCs and muscular weakness"
  },
  {
    vitamin: "Vitamin K",
    name: null,
    sources: "Green leafy vegetables",
    deficiency: "Increased blood clotting time"
  },
  {
    vitamin: "Vitamin H",
    name: "Biotin",
    sources: "Yeast, Avocados, Nuts",
    deficiency: "Skin Disease, Loss of hair, Paralysis"
  }
];
let vitaminQuestions = [];
let vitaminCurrent = null;
let vitaminScore = 0;
let vitaminTotal = 0;
let vitaminModeActive = false;
let vitaminMcqModeActive = false;
let vitaminMcqAnswered = false;

function buildVitaminQuestions() {
  const questions = [];

  VITAMINS.forEach(v => {
    if (v.name) {
      questions.push({
        id: `${v.vitamin}-name`,
        type: "name",
        question: `What is ${v.vitamin} also known as?`,
        answer: v.name
      });
    }

    questions.push({
      id: `${v.vitamin}-sources`,
      type: "sources",
      question: `What are the sources of ${v.vitamin}?`,
      answer: v.sources
    });

    questions.push({
      id: `${v.vitamin}-deficiency`,
      type: "deficiency",
      question: `What is caused by deficiency of ${v.vitamin}?`,
      answer: v.deficiency
    });
  });

  return questions;
}

function startVitaminQuiz() {
  __resetWeightedStats();
  vitaminModeActive = true;
  vitaminMcqModeActive = false;

  vitaminQuestions = buildVitaminQuestions();

  vitaminScore = 0;
  vitaminTotal = 0;

  startScreen.hidden = true;
  quizScreen.hidden = false;
  $("#scorePill").hidden = false;
  $("#modeLabel").textContent = "VITAMINS LEARNER";

  nextVitaminQuestion();
}

function chooseVitaminQuestion() {
  return __weightedPick(vitaminQuestions, q => q.id);
}

function vitaminTypeLabel(type) {
  if (type === "name") return "VITAMIN NAME";
  if (type === "sources") return "SOURCES";
  return "DEFICIENCY DISEASE";
}

function updateVitaminStats() {
  const remaining = vitaminQuestions.filter(
    q => __stats(q.id).shown === 0
  ).length;

  $("#scoreText").textContent = `${vitaminScore} / ${vitaminTotal}`;
  $("#missedBadge").textContent =
      remaining === 0
          ? "All questions seen"
          : `${remaining} unseen`;
}

function nextVitaminQuestion() {
  vitaminCurrent = chooseVitaminQuestion();
  updateVitaminStats();

  questionArea.innerHTML = `
    <article class="question-card vitamin-question-card">
      <div class="vitamin-kicker">${vitaminTypeLabel(vitaminCurrent.type)}</div>

      <h2 class="vitamin-question">
        ${vitaminCurrent.question}
      </h2>

      <div id="vitaminAnswer"></div>

      <div class="vitamin-actions" id="vitaminActions">
        <button
          class="primary-btn vitamin-show-answer"
          id="showVitaminAnswer"
        >
          Show Answer
        </button>
      </div>

      <p class="vitamin-instruction">
        Recall the answer first, then reveal it and grade yourself.
      </p>
    </article>
  `;

  $("#showVitaminAnswer").onclick = revealVitaminAnswer;
}

function revealVitaminAnswer() {
  $("#vitaminAnswer").innerHTML = `
    <div class="vitamin-answer">
      <span class="vitamin-answer-label">ANSWER</span>
      <div class="vitamin-answer-text">${vitaminCurrent.answer}</div>
    </div>
  `;

  $("#vitaminActions").innerHTML = `
    <button class="vitamin-grade-btn wrong" id="vitaminWrong">
      ✕ Got it wrong
    </button>

    <button class="vitamin-grade-btn right" id="vitaminRight">
      ✓ Got it right
    </button>
  `;

  $("#vitaminWrong").onclick = () => gradeVitamin(false);
  $("#vitaminRight").onclick = () => gradeVitamin(true);
}

function gradeVitamin(correct) {
  vitaminTotal++;

  if (correct) {
    vitaminScore++;
    __stats(vitaminCurrent.id).correct++;
  } else {
    __stats(vitaminCurrent.id).wrong++;
  }

  nextVitaminQuestion();
}


// ============================================================
// VITAMINS MCQ
// ============================================================
function startVitaminMcqQuiz() {
  __resetWeightedStats();
  vitaminModeActive = true;
  vitaminMcqModeActive = true;

  vitaminQuestions = buildVitaminQuestions();

  vitaminScore = 0;
  vitaminTotal = 0;

  startScreen.hidden = true;
  quizScreen.hidden = false;
  $("#scorePill").hidden = false;
  $("#modeLabel").textContent = "VITAMINS MCQ";

  nextVitaminMcqQuestion();
}

function vitaminDistractorAnswers(question) {
  const candidates = vitaminQuestions
    .filter(q => q.type === question.type && q.id !== question.id)
    .map(q => q.answer);

  return [...new Set(candidates)];
}

function buildVitaminMcqOptions(question) {
  const distractors = shuffle(vitaminDistractorAnswers(question));

  const desiredTotal = Math.min(5, distractors.length + 1);
  const options = [
    question.answer,
    ...distractors.slice(0, desiredTotal - 1)
  ];

  return shuffle(options);
}

function nextVitaminMcqQuestion() {
  vitaminMcqAnswered = false;
  vitaminCurrent = chooseVitaminQuestion();
  updateVitaminStats();

  const options = buildVitaminMcqOptions(vitaminCurrent);

  questionArea.innerHTML = `
    <article class="question-card vitamin-question-card vitamin-mcq-card">
      <div class="vitamin-kicker">${vitaminTypeLabel(vitaminCurrent.type)} · MCQ</div>

      <h2 class="vitamin-question">
        ${vitaminCurrent.question}
      </h2>

      <div id="feedback"></div>

      <div class="vitamin-mcq-options">
        ${options.map((option, index) => `
          <button class="vitamin-mcq-option" data-index="${index}">
            <span class="vitamin-option-letter">${String.fromCharCode(65 + index)}</span>
            <span class="vitamin-option-text"></span>
          </button>
        `).join("")}
      </div>

      <div class="next-wrap" id="vitaminMcqNextWrap"></div>

      <p class="vitamin-instruction">
        Choose one answer. Your score is updated automatically.
      </p>
    </article>
  `;

  const buttons = [...document.querySelectorAll(".vitamin-mcq-option")];

  buttons.forEach((button, index) => {
    button.querySelector(".vitamin-option-text").textContent = options[index];
    button.onclick = () => gradeVitaminMcq(options[index], button);
  });
}

function gradeVitaminMcq(selectedAnswer, selectedButton) {
  if (vitaminMcqAnswered) return;

  vitaminMcqAnswered = true;
  vitaminTotal++;

  const correct = selectedAnswer === vitaminCurrent.answer;

  if (correct) {
    vitaminScore++;
    __stats(vitaminCurrent.id).correct++;
    feedback(true, `✓ Correct — ${vitaminCurrent.answer}`);
  } else {
    __stats(vitaminCurrent.id).wrong++;
    feedback(false, `✕ Correct answer: ${vitaminCurrent.answer}`);
  }

  document.querySelectorAll(".vitamin-mcq-option").forEach(button => {
    button.disabled = true;

    const optionText =
      button.querySelector(".vitamin-option-text").textContent;

    if (optionText === vitaminCurrent.answer) {
      button.classList.add("correct");
    }
  });

  if (!correct) {
    selectedButton.classList.add("wrong");
  }

  $("#vitaminMcqNextWrap").innerHTML =
    `<button class="primary-btn next-btn" id="vitaminMcqNextBtn">Next Question →</button>`;

  $("#vitaminMcqNextBtn").onclick = nextVitaminMcqQuestion;

  updateVitaminStats();
}

document.querySelectorAll("[data-mode]").forEach(
  b => b.onclick = () => startQuiz(b.dataset.mode)
);

$("#backBtn").onclick = goHome;
$("#homeBtn").onclick = goHome;

document.addEventListener("keydown", e => {
  if (!vitaminModeActive && answered &&
      (e.key === "Enter" || e.key === "ArrowRight")) {
    nextQuestion();
  } else if (vitaminMcqModeActive && vitaminMcqAnswered &&
             (e.key === "Enter" || e.key === "ArrowRight")) {
    nextVitaminMcqQuestion();
  }
});

$("#vitaminModeBtn").onclick = startVitaminQuiz;
$("#vitaminMcqModeBtn").onclick = startVitaminMcqQuiz;

// ============================================================
// STUDY PACK FLASHCARDS
// ============================================================
const PACKS_CONFIG_PATH = "packs/packs_config.json";

let flashcardModeActive = false;
let packsConfig = null;
let activePack = null;
let packCards = [];
let packCurrent = null;
let packScore = 0;
let packTotal = 0;
let packAnswerRevealed = false;

function escapePackHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function loadJsonFile(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(`Could not load ${path} (${response.status})`);
  return response.json();
}

function studyPackIcon(icon) {
  const icons = { flask: "⚗", atom: "◎", book: "▤", cards: "▱" };
  return icons[icon] || "▱";
}

async function loadStudyPacks() {
  const grid = $("#packGrid");
  const count = $("#packCount");
  if (!grid || !count) return;

  grid.innerHTML = `<div class="pack-loading">Loading study packs…</div>`;
  count.textContent = "Loading…";

  try {
    const config = await loadJsonFile(PACKS_CONFIG_PATH);

    if (!config || !Array.isArray(config.packs)) {
      throw new Error("packs_config.json must contain a packs array.");
    }

    packsConfig = config;

    count.textContent =
      `${config.packs.length} pack${config.packs.length === 1 ? "" : "s"}`;

    grid.innerHTML = config.packs.map(pack => `
      <button class="pack-card" type="button" data-pack-id="${escapePackHtml(pack.id)}">
        <span class="mode-icon">${studyPackIcon(pack.icon)}</span>
        <span class="mode-copy">
          <span class="pack-category">${escapePackHtml(pack.category || "Study Pack")}</span>
          <strong>${escapePackHtml(pack.name || pack.id)}</strong>
          <small>${escapePackHtml(pack.description || "Practice this study pack.")}</small>
        </span>
        <span class="arrow">→</span>
      </button>
    `).join("");

    document.querySelectorAll(".pack-card").forEach(button => {
      button.onclick = () => startStudyPack(button.dataset.packId);
    });

  } catch (error) {
    console.error(error);

    count.textContent = "Unavailable";

    grid.innerHTML = `
      <div class="pack-load-error">
        <strong>Could not load study packs</strong>
        <span>${escapePackHtml(error.message)}</span>
      </div>`;
  }
}

function normalizePackCards(raw, pack) {
  if (!Array.isArray(raw))
    throw new Error(`${pack.path} must contain a JSON array.`);

  return raw.map((card, index) => {

    const versions = Array.isArray(card.versions)
      ? card.versions.map(v => String(v).trim()).filter(Boolean)
      : [];

    if (!versions.length || card.answer == null) {
      console.warn(`Skipping invalid card ${index} in ${pack.id}`, card);
      return null;
    }

    return {
      id: `${pack.id}:${index}`,
      versions,
      group: card.group || pack.name,
      answer: String(card.answer)
    };

  }).filter(Boolean);
}

async function startStudyPack(packId) {
  __resetWeightedStats();

  const pack = packsConfig?.packs?.find(p => p.id === packId);
  if (!pack) return;

  flashcardModeActive = true;
  vitaminModeActive = false;
  vitaminMcqModeActive = false;

  activePack = pack;

  packScore = 0;
  packTotal = 0;
  packAnswerRevealed = false;

  startScreen.hidden = true;
  quizScreen.hidden = false;

  $("#scorePill").hidden = false;
  $("#modeLabel").textContent =
    `${pack.name.toUpperCase()} FLASHCARDS`;

  $("#scoreText").textContent = "0 / 0";

  questionArea.innerHTML = `
    <article class="question-card pack-question-card">
      <div class="pack-question-loading">
        Loading ${escapePackHtml(pack.name)}…
      </div>
    </article>`;

  try {

    packCards = normalizePackCards(
      await loadJsonFile(pack.path),
      pack
    );

    if (!packCards.length) {
      throw new Error("This pack contains no valid flashcards.");
    }

    nextPackCard();

  } catch (error) {

    console.error(error);

    questionArea.innerHTML = `
      <div class="error-box">
        <strong>Could not open ${escapePackHtml(pack.name)}</strong><br>
        ${escapePackHtml(error.message)}
      </div>`;
  }
}

function choosePackCard() {
  return __weightedPick(packCards, card => card.id);
}

function updatePackStats() {

  const remaining = packCards.filter(
    card => __stats(card.id).shown === 0
  ).length;

  $("#scoreText").textContent = `${packScore} / ${packTotal}`;

  $("#missedBadge").textContent =
    remaining === 0
      ? "All cards seen"
      : `${remaining} unseen`;
}

function nextPackCard() {

  packAnswerRevealed = false;

  packCurrent = choosePackCard();

  updatePackStats();

  const question =
    packCurrent.versions[
      Math.floor(Math.random() * packCurrent.versions.length)
    ];

  questionArea.innerHTML = `
    <article class="question-card pack-question-card">

      <div class="pack-question-top">
        <span class="vitamin-kicker">${escapePackHtml(packCurrent.group)}</span>
        <span class="pack-card-count">${packCards.length} cards</span>
      </div>

      <div class="pack-question-face">
        <span class="pack-side-label">QUESTION</span>
        <h3 class="pack-question-text">${escapePackHtml(question)}</h3>
      </div>

      <div id="packAnswer"></div>

      <div class="vitamin-actions" id="packActions">
        <button class="primary-btn vitamin-show-answer" id="showPackAnswer">
          Show Answer
        </button>
      </div>

      <p class="vitamin-instruction">
        Recall the answer first, then reveal it and grade yourself.
      </p>

    </article>`;

  $("#showPackAnswer").onclick = revealPackAnswer;
}

function revealPackAnswer() {

  if (packAnswerRevealed) return;

  packAnswerRevealed = true;

  $("#packAnswer").innerHTML = `
    <div class="pack-answer">
      <span class="pack-side-label">ANSWER</span>
      <div class="pack-answer-text">
        ${escapePackHtml(packCurrent.answer)}
      </div>
    </div>`;

  $("#packActions").innerHTML = `
    <button class="vitamin-grade-btn wrong" id="packWrong">
      ✕ Got it wrong
    </button>

    <button class="vitamin-grade-btn right" id="packRight">
      ✓ Got it right
    </button>`;

  $("#packWrong").onclick = () => gradePackCard(false);
  $("#packRight").onclick = () => gradePackCard(true);
}

function gradePackCard(correct) {

  packTotal++;

  if (correct) {
    packScore++;
    __stats(packCurrent.id).correct++;
  } else {
    __stats(packCurrent.id).wrong++;
  }

  nextPackCard();
}

const refreshPacksBtn = $("#refreshPacksBtn");

if (refreshPacksBtn) {
  refreshPacksBtn.onclick = loadStudyPacks;
}

loadStudyPacks(); 