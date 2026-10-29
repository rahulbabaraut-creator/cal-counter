import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, Camera, Check, ChevronRight, Clock3, Droplets, Flame, History, ImagePlus, Info, Pause, Play, Plus, RotateCcw, ScanLine, Sparkles, TimerReset, Trash2, Utensils, X } from 'lucide-react';

const STORE_KEY = 'nutrichrono-v1';
const todayKey = () => new Date().toLocaleDateString('en-CA');
const emptyStore = { entries: [], sessions: [], water: 0, calorieTarget: '' };
const round = (n) => Math.round((Number(n) || 0) * 10) / 10;
const calcItem = (item) => {
  const factor = Math.max(0, Number(item.grams) || 0) / 100;
  return {
    calories: Math.round((Number(item.calories_per_100g) || 0) * factor),
    protein: round((Number(item.protein_g_per_100g) || 0) * factor),
    carbs: round((Number(item.carbs_g_per_100g) || 0) * factor),
    fat: round((Number(item.fat_g_per_100g) || 0) * factor)
  };
};
const formatTime = (ms) => {
  const total = Math.floor(ms / 1000);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  const centis = Math.floor((ms % 1000) / 10);
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(centis).padStart(2, '0')}`;
};

function loadStore() {
  try { return { ...emptyStore, ...JSON.parse(localStorage.getItem(STORE_KEY) || '{}') }; }
  catch { return emptyStore; }
}

export default function App() {
  const [store, setStore] = useState(loadStore);
  const [tab, setTab] = useState('home');
  const [scanBusy, setScanBusy] = useState(false);
  const [scanError, setScanError] = useState('');
  const [scanResult, setScanResult] = useState(null);
  const [photoUrl, setPhotoUrl] = useState('');
  const [mealLabel, setMealLabel] = useState('');
  const fileRef = useRef(null);
  const cameraRef = useRef(null);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [laps, setLaps] = useState([]);
  const [sessionLabel, setSessionLabel] = useState('Workout');
  const [manualOpen, setManualOpen] = useState(false);
  const [manual, setManual] = useState({ name: '', grams: '100', calories_per_100g: '100', protein_g_per_100g: '0', carbs_g_per_100g: '0', fat_g_per_100g: '0' });
  const startRef = useRef(0);
  const accumulatedRef = useRef(0);

  useEffect(() => { localStorage.setItem(STORE_KEY, JSON.stringify(store)); }, [store]);
  useEffect(() => {
    if (!running) return;
    let raf;
    const tick = () => {
      setElapsed(accumulatedRef.current + (performance.now() - startRef.current));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running]);

  const todayEntries = useMemo(() => store.entries.filter((entry) => entry.date === todayKey()), [store.entries]);
  const totals = useMemo(() => todayEntries.reduce((acc, entry) => {
    acc.calories += entry.totals.calories; acc.protein += entry.totals.protein; acc.carbs += entry.totals.carbs; acc.fat += entry.totals.fat; return acc;
  }, { calories: 0, protein: 0, carbs: 0, fat: 0 }), [todayEntries]);

  const updateStore = (patch) => setStore((current) => ({ ...current, ...patch }));
  const setScanItem = (index, field, value) => setScanResult((result) => ({ ...result, items: result.items.map((item, i) => i === index ? { ...item, [field]: value } : item) }));

  async function compressImage(file) {
    if (!file || !file.type.startsWith('image/')) throw new Error('Choose a photo file to scan.');
    if (file.size > 15 * 1024 * 1024) throw new Error('This photo is very large. Choose a photo under 15 MB.');
    const source = await new Promise((resolve, reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('Could not read this photo.')); reader.readAsDataURL(file);
    });
    const img = await new Promise((resolve, reject) => {
      const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error('This image could not be opened.')); image.src = source;
    });
    const max = 1280; const ratio = Math.min(1, max / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas'); canvas.width = Math.round(img.width * ratio); canvas.height = Math.round(img.height * ratio);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.82);
  }

  async function scanFile(file) {
    setScanError(''); setScanResult(null); setScanBusy(true);
    try {
      const dataUrl = await compressImage(file);
      setPhotoUrl(dataUrl);
      const response = await fetch('/api/analyze-food', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imageDataUrl: dataUrl }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Could not scan this photo.');
      const items = (payload.items || []).map((item) => ({ ...item, grams: String(Math.round(item.estimated_grams || 100)) }));
      setScanResult({ ...payload, items }); setMealLabel(payload.meal_name || 'Scanned meal');
    } catch (error) {
      setScanError(error.message || 'Could not scan this photo. Check your connection and try again.');
    } finally { setScanBusy(false); }
  }

  function openScanner(source = 'camera') {
    setTab('scan');
    setScanError('');
    setTimeout(() => (source === 'camera' ? cameraRef.current : fileRef.current)?.click(), 80);
  }

  function addConfirmedMeal() {
    if (!scanResult?.items?.length) return;
    const items = scanResult.items.map((item) => ({ ...item, grams: Math.max(0, Number(item.grams) || 0) }));
    const itemTotals = items.reduce((acc, item) => { const c = calcItem(item); acc.calories += c.calories; acc.protein += c.protein; acc.carbs += c.carbs; acc.fat += c.fat; return acc; }, { calories: 0, protein: 0, carbs: 0, fat: 0 });
    const entry = { id: crypto.randomUUID?.() || String(Date.now()), date: todayKey(), createdAt: new Date().toISOString(), name: mealLabel.trim() || scanResult.meal_name || 'Scanned meal', items, totals: itemTotals, source: 'ai' };
    updateStore({ entries: [entry, ...store.entries] }); setScanResult(null); setPhotoUrl(''); setMealLabel(''); setTab('home');
  }

  function addManualFood(event) {
    event.preventDefault();
    if (!manual.name.trim()) return;
    const item = { name: manual.name.trim(), grams: Math.max(0, Number(manual.grams) || 0), calories_per_100g: Math.max(0, Number(manual.calories_per_100g) || 0), protein_g_per_100g: Math.max(0, Number(manual.protein_g_per_100g) || 0), carbs_g_per_100g: Math.max(0, Number(manual.carbs_g_per_100g) || 0), fat_g_per_100g: Math.max(0, Number(manual.fat_g_per_100g) || 0), confidence: 'user-entered', assumptions: 'Nutrition values entered manually.' };
    const c = calcItem(item);
    const entry = { id: crypto.randomUUID?.() || String(Date.now()), date: todayKey(), createdAt: new Date().toISOString(), name: item.name, items: [item], totals: { calories: c.calories, protein: c.protein, carbs: c.carbs, fat: c.fat }, source: 'manual' };
    updateStore({ entries: [entry, ...store.entries] }); setManualOpen(false); setManual({ name: '', grams: '100', calories_per_100g: '100', protein_g_per_100g: '0', carbs_g_per_100g: '0', fat_g_per_100g: '0' });
  }

  function toggleTimer() {
    if (running) { accumulatedRef.current += performance.now() - startRef.current; setElapsed(accumulatedRef.current); setRunning(false); }
    else { startRef.current = performance.now(); setRunning(true); }
  }
  function resetTimer() { setRunning(false); accumulatedRef.current = 0; startRef.current = 0; setElapsed(0); setLaps([]); }
  function addLap() { setLaps((old) => [{ id: old.length + 1, time: elapsed }, ...old]); }
  function saveSession() {
    if (elapsed < 1000) return;
    const session = { id: crypto.randomUUID?.() || String(Date.now()), label: sessionLabel.trim() || 'Session', durationMs: Math.round(elapsed), date: new Date().toISOString() };
    updateStore({ sessions: [session, ...store.sessions] }); resetTimer();
  }
  function removeEntry(id) { updateStore({ entries: store.entries.filter((entry) => entry.id !== id) }); }

  return <div className="app-shell">
    <div className="ambient ambient-one"/><div className="ambient ambient-two"/>
    <header className="topbar"><div className="brand-mark"><Activity size={20}/></div><div><div className="brand-name">NUTRI<span>CHRONO</span></div><div className="brand-sub">YOUR DAILY SYSTEM</div></div><div className="top-status"><span className="status-dot"/> LOCAL DATA</div></header>
    <main className="main-content">
      {tab === 'home' && <>
        <section className="welcome-row"><div><p className="eyebrow">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }).toUpperCase()}</p><h1>Your day,<br/><span>in focus.</span></h1><p className="muted">Small steps. Useful data. Your pace.</p></div><div className="orb"><div className="orb-inner"><Activity size={28}/><span>LIVE</span></div></div></section>
        <section className="card calorie-card"><div className="section-heading"><div><span className="eyebrow">NUTRITION LOG</span><h2>Energy intake</h2></div><span className="icon-chip"><Flame size={18}/></span></div><div className="calorie-number">{Math.round(totals.calories).toLocaleString()} <small>kcal logged</small></div><div className="bar-track"><div className="bar-fill" style={{ width: `${store.calorieTarget ? Math.min(100, totals.calories / Number(store.calorieTarget) * 100) : 0}%` }}/></div><div className="bar-caption"><span>{store.calorieTarget ? `${Math.round(totals.calories / Number(store.calorieTarget) * 100)}% of your personal target` : 'No daily target set'}</span><button className="text-button" onClick={() => { const value = window.prompt('Set a daily calorie target only if you have an appropriate target from a qualified professional. Leave blank to clear it.', store.calorieTarget || ''); if (value !== null && (value.trim() === '' || (Number(value) > 0 && Number.isFinite(Number(value))))) updateStore({ calorieTarget: value.trim() }); }}> {store.calorieTarget ? 'Edit target' : 'Set target'} </button></div><div className="macro-grid"><Macro label="PROTEIN" value={totals.protein} unit="g" color="purple"/><Macro label="CARBS" value={totals.carbs} unit="g" color="cyan"/><Macro label="FAT" value={totals.fat} unit="g" color="pink"/></div></section>
        <div className="section-title-row"><div><span className="eyebrow">QUICK ACCESS</span><h2>What’s next?</h2></div></div>
        <section className="quick-grid"><button className="quick-card scan-quick" onClick={() => openScanner('camera')}><span className="quick-icon"><Camera size={22}/></span><span className="quick-title">Scan a meal</span><span className="quick-desc">AI food recognition</span><ChevronRight className="quick-arrow" size={18}/></button><button className="quick-card timer-quick" onClick={() => setTab('timer')}><span className="quick-icon"><Clock3 size={22}/></span><span className="quick-title">Chronometer</span><span className="quick-desc">Time a session</span><ChevronRight className="quick-arrow" size={18}/></button></section>
        <section className="card water-card"><div className="section-heading"><div className="title-inline"><span className="water-icon"><Droplets size={19}/></span><div><h2>Water check-in</h2><p className="muted small">{store.water} glasses logged today</p></div></div><span className="eyebrow">OPTIONAL</span></div><div className="water-actions"><div className="water-dots">{Array.from({ length: 8 }, (_, i) => <span key={i} className={i < store.water ? 'water-dot active' : 'water-dot'}/>)}</div><div className="step-actions"><button className="round-btn" aria-label="Remove glass" onClick={() => updateStore({ water: Math.max(0, store.water - 1) })}><X size={15}/></button><button className="round-btn add" aria-label="Add glass" onClick={() => updateStore({ water: Math.min(30, store.water + 1) })}><Plus size={16}/></button></div></div></section>
        <section className="food-section"><div className="section-title-row"><div><span className="eyebrow">TODAY</span><h2>Food diary</h2></div><button className="subtle-button" onClick={() => setManualOpen(true)}><Plus size={15}/> Add food</button></div>
          {todayEntries.length === 0 ? <div className="empty-state"><div className="empty-icon"><Utensils size={22}/></div><h3>Your diary starts here</h3><p>Scan a meal or add a food manually. Nothing is saved until you confirm it.</p><button className="primary-button compact" onClick={() => openScanner('camera')}><Camera size={16}/> Scan first meal</button></div> : <div className="entry-list">{todayEntries.map((entry) => <article className="entry-card" key={entry.id}><div className="entry-icon"><Utensils size={18}/></div><div className="entry-main"><div className="entry-title">{entry.name}</div><div className="entry-meta">{new Date(entry.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {entry.items.length} item{entry.items.length === 1 ? '' : 's'} · {entry.source === 'ai' ? 'AI estimate' : 'Manual'}</div><div className="entry-macros">P {round(entry.totals.protein)}g <span>·</span> C {round(entry.totals.carbs)}g <span>·</span> F {round(entry.totals.fat)}g</div></div><div className="entry-calories">{Math.round(entry.totals.calories)}<small>kcal</small></div><button className="delete-button" aria-label="Delete food entry" onClick={() => removeEntry(entry.id)}><Trash2 size={15}/></button></article>)}</div>}
        </section>
      </>}

      {tab === 'scan' && <section className="page-panel"><div className="page-heading"><button className="back-button" onClick={() => { setTab('home'); setScanResult(null); }}><ChevronRight size={17}/> Dashboard</button><span className="eyebrow">AI VISION SCANNER</span><h1>Scan your<br/><span>plate.</span></h1><p className="muted">Take a clear photo of your food. We’ll estimate the visible items, then let you review everything before saving.</p></div>
        {!scanResult && <><div className="scanner-frame"><div className="scanner-corner top-left"/><div className="scanner-corner top-right"/><div className="scanner-corner bottom-left"/><div className="scanner-corner bottom-right"/>{photoUrl ? <img src={photoUrl} alt="Selected meal preview" className="photo-preview"/> : <div className="scanner-placeholder"><div className="scanner-circle"><ScanLine size={34}/></div><strong>Place your meal in view</strong><span>Bright light · Whole plate · Top-down photo</span></div>}{scanBusy && <div className="scan-overlay"><div className="scan-line"/><Sparkles size={28}/><strong>Reading your meal…</strong><span>AI estimates can be wrong. Review before saving.</span></div>}</div>
          <input ref={cameraRef} className="hidden-input" type="file" accept="image/*" capture="environment" onChange={(e) => { const file = e.target.files?.[0]; if (file) scanFile(file); e.target.value = ''; }}/><input ref={fileRef} className="hidden-input" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => { const file = e.target.files?.[0]; if (file) scanFile(file); e.target.value = ''; }}/>
          <div className="scan-buttons"><button className="primary-button" disabled={scanBusy} onClick={() => cameraRef.current?.click()}><Camera size={18}/> {scanBusy ? 'Analyzing…' : 'Open camera'}</button><button className="secondary-button" disabled={scanBusy} onClick={() => fileRef.current?.click()}><ImagePlus size={18}/> Upload photo</button></div>
          {scanError && <div className="error-box"><Info size={18}/><div><strong>Couldn’t scan this photo</strong><p>{scanError}</p><span>Make sure the server is running and the API key is configured.</span></div></div>}
          <div className="privacy-note"><Info size={16}/><p>Your selected photo is sent to your app server and then to the AI provider for analysis. It isn’t added to your diary until you confirm. Don’t scan photos containing personal information.</p></div>
        </>}
        {scanResult && <div className="review-panel"><div className="review-head"><div><span className="eyebrow">REVIEW BEFORE SAVING</span><h2>Check the estimate</h2></div><button className="round-btn" onClick={() => { setScanResult(null); setPhotoUrl(''); }} aria-label="Discard scan"><X size={17}/></button></div>{photoUrl && <img src={photoUrl} alt="Meal to review" className="review-photo"/>}<label className="field-label">Meal name<input value={mealLabel} onChange={(e) => setMealLabel(e.target.value)} maxLength={100}/></label><div className="estimate-notice"><Info size={17}/><p>Photo-based amounts are guesses. Adjust grams and values where needed. Hidden oil, ingredients and recipes can change the result.</p></div>
          {scanResult.items.map((item, index) => { const c = calcItem(item); return <div className="food-review-card" key={`${item.name}-${index}`}><div className="review-item-title"><div><strong>{item.name}</strong><span className={`confidence ${item.confidence}`}>{item.confidence} confidence</span></div><button className="icon-plain" aria-label={`Remove ${item.name}`} onClick={() => setScanResult((r) => ({ ...r, items: r.items.filter((_, i) => i !== index) }))}><Trash2 size={16}/></button></div><p className="assumption">{item.assumptions}</p><label className="field-label">Estimated portion (grams)<input type="number" min="0" max="3000" value={item.grams} onChange={(e) => setScanItem(index, 'grams', e.target.value)}/></label><div className="nutrition-mini"><span><b>{c.calories}</b><small>kcal</small></span><span><b>{c.protein}g</b><small>protein</small></span><span><b>{c.carbs}g</b><small>carbs</small></span><span><b>{c.fat}g</b><small>fat</small></span></div><details className="details-nutrition"><summary>Edit nutrition per 100 g</summary><div className="nutrition-edit-grid">{[['calories_per_100g','Calories'],['protein_g_per_100g','Protein (g)'],['carbs_g_per_100g','Carbs (g)'],['fat_g_per_100g','Fat (g)']].map(([key, label]) => <label key={key} className="field-label">{label}<input type="number" min="0" step="0.1" value={item[key]} onChange={(e) => setScanItem(index, key, e.target.value)}/></label>)}</div></details></div>; })}
          <label className="field-label">AI notes<input value={scanResult.notes} readOnly/></label>
          <div className="review-total"><div><span className="eyebrow">ESTIMATED MEAL TOTAL</span><strong>{scanResult.items.reduce((s, i) => s + calcItem(i).calories, 0).toLocaleString()} <small>kcal</small></strong></div><div className="review-total-macros">P {round(scanResult.items.reduce((s,i)=>s+calcItem(i).protein,0))}g · C {round(scanResult.items.reduce((s,i)=>s+calcItem(i).carbs,0))}g · F {round(scanResult.items.reduce((s,i)=>s+calcItem(i).fat,0))}g</div></div>
          <button className="primary-button full" disabled={!scanResult.items.length} onClick={addConfirmedMeal}><Check size={18}/> Confirm and add to diary</button><button className="text-button full-text" onClick={() => { setScanResult(null); setPhotoUrl(''); }}>Discard scan</button>
        </div>}
      </section>}

      {tab === 'timer' && <section className="page-panel timer-page"><div className="page-heading"><button className="back-button" onClick={() => setTab('home')}><ChevronRight size={17}/> Dashboard</button><span className="eyebrow">CHRONOMETER</span><h1>Own your<br/><span>time.</span></h1><p className="muted">Time a workout, walk, study block or any activity.</p></div><div className="timer-card"><div className="timer-rings"><div className="timer-display"><span className="timer-label">ELAPSED TIME</span><strong>{formatTime(elapsed)}</strong><span className={running ? 'running-state active' : 'running-state'}><i/>{running ? 'RUNNING' : elapsed ? 'PAUSED' : 'READY'}</span></div></div><label className="field-label session-field">Session name<input value={sessionLabel} onChange={(e) => setSessionLabel(e.target.value)} maxLength={60} placeholder="Workout, study…"/></label><div className="timer-controls"><button className="primary-button timer-main" onClick={toggleTimer}>{running ? <Pause size={19}/> : <Play size={19}/>} {running ? 'Pause' : 'Start'}</button><button className="secondary-button" onClick={addLap} disabled={!elapsed}><History size={17}/> Lap</button><button className="secondary-button square" onClick={resetTimer} aria-label="Reset timer"><RotateCcw size={18}/></button></div><button className="save-session" onClick={saveSession} disabled={elapsed < 1000 || running}><Check size={16}/> Save completed session</button></div>{laps.length > 0 && <div className="card laps-card"><div className="section-heading"><h2>Lap times</h2><span className="eyebrow">{laps.length} RECORDED</span></div>{laps.map((lap) => <div className="lap-row" key={lap.id}><span>Lap {lap.id}</span><strong>{formatTime(lap.time)}</strong></div>)}</div>}<div className="section-title-row history-heading"><div><span className="eyebrow">RECENT ACTIVITY</span><h2>Session history</h2></div></div>{store.sessions.length === 0 ? <div className="empty-state compact-empty"><div className="empty-icon"><TimerReset size={22}/></div><p>Saved sessions will appear here.</p></div> : <div className="entry-list">{store.sessions.slice(0, 10).map((session) => <div className="entry-card" key={session.id}><div className="entry-icon timer-entry-icon"><Clock3 size={18}/></div><div className="entry-main"><div className="entry-title">{session.label}</div><div className="entry-meta">{new Date(session.date).toLocaleString()}</div></div><div className="entry-calories">{formatTime(session.durationMs).split('.')[0]}<small>duration</small></div></div>)}</div>}</section>}
    </main>
    {manualOpen && <div className="modal-backdrop" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) setManualOpen(false); }}><form className="manual-modal" onSubmit={addManualFood}><div className="review-head"><div><span className="eyebrow">FOOD DIARY</span><h2>Add food manually</h2></div><button type="button" className="round-btn" onClick={() => setManualOpen(false)}><X size={17}/></button></div><p className="muted small">Enter nutrition values per 100 g from a reliable label or database.</p><label className="field-label">Food name<input required value={manual.name} onChange={(e) => setManual({ ...manual, name: e.target.value })} placeholder="e.g. cooked rice"/></label><label className="field-label">Portion in grams<input required type="number" min="0" value={manual.grams} onChange={(e) => setManual({ ...manual, grams: e.target.value })}/></label><div className="nutrition-edit-grid">{[['calories_per_100g','Calories / 100 g'],['protein_g_per_100g','Protein (g)'],['carbs_g_per_100g','Carbs (g)'],['fat_g_per_100g','Fat (g)']].map(([key,label]) => <label className="field-label" key={key}>{label}<input type="number" min="0" step="0.1" value={manual[key]} onChange={(e) => setManual({ ...manual, [key]: e.target.value })}/></label>)}</div><button className="primary-button full" type="submit"><Plus size={17}/> Add to diary</button></form></div>}
    <nav className="bottom-nav"><button className={tab === 'home' ? 'nav-item active' : 'nav-item'} onClick={() => setTab('home')}><Activity size={19}/><span>Today</span></button><button className={tab === 'scan' ? 'nav-item active' : 'nav-item'} onClick={() => setTab('scan')}><ScanLine size={19}/><span>Scanner</span></button><button className={tab === 'timer' ? 'nav-item active' : 'nav-item'} onClick={() => setTab('timer')}><Clock3 size={19}/><span>Chronometer</span></button></nav>
    <footer className="app-footer">NUTRITION VALUES ARE ESTIMATES · YOUR DATA STAYS IN THIS BROWSER</footer>
  </div>;
}

function Macro({ label, value, unit, color }) {
  return <div className="macro-item"><span className={`macro-dot ${color}`}/><span className="macro-label">{label}</span><strong>{round(value)}<small>{unit}</small></strong></div>;
}
