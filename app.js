
const LS_KEY = 'gk_wrong_notes_v1';
let WORDS = [];
let state = { mode: 'home', quiz: null };

class WrongNoteStore {
  constructor(key){ this.key = key; this.items = this.load(); }
  load(){ try{ const x = JSON.parse(localStorage.getItem(this.key)||'[]'); return Array.isArray(x)?x:[] }catch(e){ return [] } }
  save(){ localStorage.setItem(this.key, JSON.stringify(this.items)); }
  addWrong(word, selected){
    const idx = this.items.findIndex(it=>it.id===word.id);
    const now = new Date().toISOString();
    if(idx>=0){
      this.items[idx].wrongs += 1;
      this.items[idx].times += 1;
      this.items[idx].lastWrongAt = now;
      this.items[idx].lastSelected = selected;
    }else{
      this.items.push({
        id: word.id, term: word.term, definition: word.definition,
        chapter: word.chapter, sourceChapter: word.sourceChapter, alias: word.alias||'',
        times: 1, wrongs: 1, lastWrongAt: now, lastSelected: selected
      });
    }
    this.save();
  }
  clear(){ this.items=[]; this.save(); }
  export(){ return JSON.stringify(this.items, null, 2); }
  import(jsonStr){ try{ const arr = JSON.parse(jsonStr); if(Array.isArray(arr)){ // merge by id
      const map = new Map(this.items.map(it=>[it.id,it]));
      arr.forEach(it=>{ if(map.has(it.id)){ const cur=map.get(it.id); cur.times += (it.times||0); cur.wrongs += (it.wrongs||0); cur.lastWrongAt = (it.lastWrongAt||cur.lastWrongAt); cur.lastSelected = it.lastSelected||cur.lastSelected; map.set(it.id, cur); } else { map.set(it.id, it);} });
      this.items = [...map.values()]; this.save();
      return true; }
    }catch(e){ return false }
    return false;
  }
}
const notes = new WrongNoteStore(LS_KEY);

// ---- Utils ----
function uniqChapters(list){ return [...new Set(list.map(w=>w.chapter))]; }
function shuffle(a){ const b = a.slice(); for(let i=b.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [b[i],b[j]]=[b[j],b[i]] } return b; }

// ---- Views ----
function render(){
  const el = document.getElementById('app');
  if(state.mode==='home') return renderHome(el);
  if(state.mode==='quiz') return renderQuiz(el);
  if(state.mode==='notes') return renderNotes(el);
}

function renderHome(el){
  const chapters = uniqChapters(WORDS);
  el.innerHTML = `
    <section class="card">
      <h2>出題設定</h2>
      <div id="chapters" class="grid">${chapters.map(ch=>`
        <label><input type='checkbox' name='chap' value='${ch}' checked> ${ch}</label>`).join('')}
      </div>
      <p>
        問題数： <input type='number' id='qCount' value='30' min='5' max='160' step='5' style='width:80px'>
      </p>
      <p>
        <label><input type='checkbox' id='revMode'> 誤答ノートから復習（ノートにある問題のみ出題）</label>
      </p>
      <button class='btn primary' id='startBtn'>開始する</button>
      <p class='progress'><small class='muted'>語彙：${WORDS.length} / 誤答ノート：${notes.items.length}</small></p>
    </section>`;
  document.getElementById('startBtn').onclick = ()=>{
    const chosen = [...document.querySelectorAll("input[name='chap']:checked")].map(x=>x.value);
    const count = Math.max(5, Math.min(160, parseInt(document.getElementById('qCount').value||'30',10)));
    const rev = document.getElementById('revMode').checked;
    startQuiz({ chapters: new Set(chosen), count, reviewOnly: rev });
  };
}

function startQuiz({chapters, count, reviewOnly}){
  let pool = WORDS;
  if(chapters && chapters.size>0){ pool = pool.filter(w=>chapters.has(w.chapter)); }
  if(reviewOnly){
    const noteIds = new Set(notes.items.map(it=>it.id));
    pool = pool.filter(w=>noteIds.has(w.id));
  }
  // priority: simple weight by priorityScore
  const sorted = pool.slice().sort((a,b)=> (b.priorityScore||0) - (a.priorityScore||0));
  const picked = sorted.slice(0, Math.max(1,count));
  const questions = picked.map(w=> buildMCQ(w, pool));
  state.quiz = { idx:0, correct:0, total: questions.length, items: questions };
  state.mode='quiz';
  render();
}

function pickDistractorsTerms(word, pool){
  const same = pool.filter(w=>w.chapter===word.chapter && w.id!==word.id).map(w=>w.term);
  let cands = same.length>=3 ? same : pool.filter(w=>w.id!==word.id).map(w=>w.term);
  cands = [...new Set(cands)].filter(t=>t!==word.term);
  return shuffle(cands).slice(0,3);
}

function buildMCQ(word, pool){
  const opts = shuffle([word.term, ...(word.distractorsTerms && word.distractorsTerms.length>=3 ? word.distractorsTerms : pickDistractorsTerms(word,pool))]).slice(0,4);
  const correct = opts.indexOf(word.term);
  return { prompt: word.definition, options: opts, correctIndex: correct, word };
}

function renderQuiz(el){
  const qz = state.quiz; const i = qz.idx; const q = qz.items[i];
  el.innerHTML = `
    <section class='card'>
      <div class='progress'>問題 ${i+1} / ${qz.total}（正答 ${qz.correct}）</div>
      <h3>この説明に該当する用語は？</h3>
      <p>${q.prompt}</p>
      <div class='options'>
        ${q.options.map((opt,idx)=> `<button class='btn' data-idx='${idx}'>${String.fromCharCode(65+idx)}. ${opt}</button>`).join('')}
      </div>
      <details class='card'><summary>用語カード</summary>
        <div><strong>${q.word.term}</strong>（${q.word.alias||''}）</div>
        <div>章：${q.word.chapter} / ${q.word.sourceChapter}</div>
        <div>定義：${q.word.definition}</div>
      </details>
    </section>`;
  el.querySelectorAll('button[data-idx]').forEach(btn=> btn.onclick = ()=> selectAnswer(parseInt(btn.dataset.idx,10)) );
}

function selectAnswer(choice){
  const qz = state.quiz; const q = qz.items[qz.idx];
  if(choice===q.correctIndex){ qz.correct += 1; }
  else { notes.addWrong(q.word, q.options[choice]); }
  if(qz.idx+1>=qz.total){
    // finish
    const el=document.getElementById('app');
    el.innerHTML = `
      <section class='card'>
        <h2>結果</h2>
        <p>正答：${qz.correct} / ${qz.total}</p>
        <button class='btn primary' id='toHome'>ホームに戻る</button>
        <button class='btn' id='toNotes'>誤答ノートを見る（${notes.items.length}）</button>
      </section>`;
    document.getElementById('toHome').onclick = ()=>{ state.mode='home'; render(); };
    document.getElementById('toNotes').onclick = ()=>{ state.mode='notes'; render(); };
  } else {
    qz.idx += 1; render();
  }
}

function renderNotes(el){
  const items = notes.items.slice().sort((a,b)=> (b.lastWrongAt||'').localeCompare(a.lastWrongAt||''));
  el.innerHTML = `
    <section class='card'>
      <h2>誤答ノート（${items.length}）</h2>
      <div class='grid'>
        <button class='btn primary' id='retryNotes'>このノートから出題</button>
        <button class='btn warn' id='clearNotes'>ノートを全消去</button>
      </div>
      <details class='card'><summary>エクスポート / インポート</summary>
        <button class='btn' id='exportBtn'>誤答ノートを書き出す</button>
        <input type='file' id='importFile' accept='application/json'>
        <small class='muted'>※ JSONを選ぶと自動で取り込みます</small>
      </details>
      <div id='noteList'></div>
      <button class='btn' id='backHome'>ホームへ</button>
    </section>`;
  document.getElementById('backHome').onclick = ()=>{ state.mode='home'; render(); };
  document.getElementById('retryNotes').onclick = ()=>{
    // start quiz using notes only
    startQuiz({ chapters: null, count: Math.min(30, items.length||10), reviewOnly: true });
  };
  document.getElementById('clearNotes').onclick = ()=>{
    if(confirm('誤答ノートを全て削除しますか？')){ notes.clear(); render(); }
  };
  document.getElementById('exportBtn').onclick = ()=>{
    const blob = new Blob([notes.export()], {type:'application/json'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'wrong_notes_gk200.json'; a.click();
  };
  document.getElementById('importFile').onchange = (e)=>{
    const file = e.target.files[0]; if(!file) return; const rd = new FileReader();
    rd.onload = ()=>{ const ok = notes.import(rd.result); alert(ok?'取り込み完了':'読み込みに失敗しました'); render(); };
    rd.readAsText(file);
  };
  const list = document.getElementById('noteList');
  if(items.length===0){ list.innerHTML = '<p>まだ誤答はありません。</p>'; return; }
  list.innerHTML = items.map(it=> `
    <div class='card'>
      <div><strong>${it.term}</strong>（${it.alias||''}） <small class='muted'>${it.chapter}</small></div>
      <div class='progress'>誤答回数：${it.wrongs} / 出題回数：${it.times} / 最終：${(it.lastWrongAt||'').replace('T',' ').replace('Z','')}</div>
      <details><summary>定義を見る</summary><p>${it.definition}</p></details>
    </div>`).join('');
}

// ---- Navigation binds ----
document.addEventListener('click', e=>{
  if(e.target && e.target.id==='nav-home'){ state.mode='home'; render(); }
  if(e.target && e.target.id==='nav-notes'){ state.mode='notes'; render(); }
});

// ---- Load data ----
fetch('./data/gk_words_200.json').then(r=>r.json()).then(js=>{ WORDS = js; state.mode='home'; render(); });
