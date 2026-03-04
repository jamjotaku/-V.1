import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import { supabase } from '../lib/supabaseClient';

const MASTER_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSAruZ3gKMni3ipy08kB8iVkpwlUTlpOro_TvCO4ilZaDeUvdlwVEqYqcsLtbSu5gV0ZhqeRJhDSY0-/pub?output=csv";

export default function Tracker() {
  const [masterData, setMasterData] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [userProgress, setUserProgress] = useState({});

  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    const loadMaster = async () => {
      const Papa = (await import('papaparse')).default;
      Papa.parse(MASTER_CSV_URL, {
        download: true, header: true, skipEmptyLines: true,
        complete: (res) => {
          setMasterData(res.data);
          if (res.data.length > 0) setSelectedItem(res.data[0]);
          setLoading(false);
        }
      });
    };
    loadMaster();
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user) fetchProgress();
  }, [user]);

  const fetchProgress = async () => {
    const { data } = await supabase.from('user_progress').select('*').eq('user_id', user.id);
    if (data) {
      const formatted = {};
      data.forEach(row => { formatted[row.master_id] = { parts: row.parts }; });
      setUserProgress(formatted);
    }
  };

  const saveToSupabase = async (id, parts) => {
    if (!user) return;
    await supabase.from('user_progress').upsert({
      user_id: user.id, master_id: id, parts: parts, updated_at: new Date()
    }, { onConflict: 'user_id, master_id' });
  };

  const handleLogin = async () => {
    const email = prompt("ログイン用Emailを入力してください");
    if (!email) return;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin + '/tracker' }
    });
    if (error) alert(error.message);
    else alert("ログイン用メールを送信しました！");
  };

  const addPart = () => {
    if (!selectedItem) return;
    const id = selectedItem.Master_ID;
    const partName = prompt("パーツ名を入力してください");
    if (!partName) return;
    const newParts = [...(userProgress[id]?.parts || []), { name: partName, percent: 0 }];
    const newProgress = { ...userProgress, [id]: { parts: newParts } };
    setUserProgress(newProgress);
    saveToSupabase(id, newParts);
  };

  const updatePercent = (index, val) => {
    const id = selectedItem.Master_ID;
    const newParts = [...userProgress[id].parts];
    newParts[index].percent = parseInt(val);
    const newProgress = { ...userProgress, [id]: { parts: newParts } };
    setUserProgress(newProgress);
    saveToSupabase(id, newParts);
  };

  const deletePart = (index) => {
    if (!confirm("削除しますか？")) return;
    const id = selectedItem.Master_ID;
    const newParts = userProgress[id].parts.filter((_, i) => i !== index);
    const newProgress = { ...userProgress, [id]: { parts: newParts } };
    setUserProgress(newProgress);
    saveToSupabase(id, newParts);
  };

  const handleWheel = (e) => { e.preventDefault(); const delta = e.deltaY > 0 ? -0.1 : 0.1; setZoom(prev => Math.min(Math.max(prev + delta, 0.5), 5)); };
  const handleMouseDown = (e) => { setIsDragging(true); setStartPos({ x: e.clientX - offset.x, y: e.clientY - offset.y }); };
  const handleMouseMove = (e) => { if (!isDragging) return; setOffset({ x: e.clientX - startPos.x, y: e.clientY - startPos.y }); };

  if (loading) return <div className="loading">LOADING...</div>;

  const currentParts = selectedItem ? (userProgress[selectedItem.Master_ID]?.parts || []) : [];
  const totalProgress = currentParts.length > 0 
    ? Math.round(currentParts.reduce((acc, p) => acc + p.percent, 0) / currentParts.length) 
    : 0;

  return (
    <div className="tracker-root" onMouseUp={() => setIsDragging(false)}>
      <Head><title>Vspo! Tracker Cloud</title></Head>

      <aside className="sidebar">
        <div className="sidebar-header">
          {user ? (
            <div className="user-info">
              <span className="user-email">{user.email.split('@')[0]}</span>
              <button onClick={() => supabase.auth.signOut()} className="auth-btn">LOGOUT</button>
            </div>
          ) : (
            <button onClick={handleLogin} className="auth-btn login">LOGIN TO SAVE</button>
          )}
        </div>
        <div className="item-list">
          {masterData.map((item) => (
            <div key={item.Master_ID} className={`costume-item ${selectedItem?.Master_ID === item.Master_ID ? 'active' : ''}`} onClick={() => setSelectedItem(item)}>
              <div className="mem-name">{item.Member_Name}</div>
              <div className="cos-type">{item.Costume_Type}</div>
            </div>
          ))}
        </div>
      </aside>

      <main className="viewer-area">
        <div className="info-bar">
          <h2>{selectedItem?.Member_Name} / {selectedItem?.Costume_Type}</h2>
          <div className="controls-hint">Wheel: Zoom / Drag: Move</div>
        </div>
        <div className="image-stage" onWheel={handleWheel} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} style={{ cursor: isDragging ? 'grabbing' : 'grab' }}>
          {selectedItem && (
            <img src={selectedItem.Ref_Image_URL} alt="Ref" className="ref-image" draggable="false" style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})` }} />
          )}
        </div>
      </main>

      <aside className="progress-panel">
        <div className="panel-header">
          <span>{user ? "PROGRESS" : "GUEST MODE"}</span>
          <span className="total-badge">{totalProgress}%</span>
        </div>
        <div className="total-bar-container"><div className="total-bar-fill" style={{ width: `${totalProgress}%` }}></div></div>
        <div className="progress-content">
          {user ? (
            <>
              <button className="add-btn" onClick={addPart}>+ PART ADD</button>
              <div className="parts-list">
                {currentParts.map((part, idx) => (
                  <div key={idx} className="part-card">
                    <div className="part-info">
                      <span className="part-name">{part.name}</span>
                      <span className="part-percent">{part.percent}%</span>
                      <button className="del-mini" onClick={() => deletePart(idx)}>&times;</button>
                    </div>
                    <input type="range" min="0" max="100" value={part.percent} onChange={(e) => updatePercent(idx, e.target.value)} className="p-slider" />
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="guest-msg">ログインすると保存できます</div>
          )}
        </div>
      </aside>

      <style jsx global>{`
        body { margin: 0; background: #0a0a0c; color: #eee; font-family: 'Inter', sans-serif; overflow: hidden; }
        .tracker-root { display: flex; height: 100vh; width: 100vw; }
        
        .sidebar { width: 240px; background: #121214; border-right: 1px solid #222; flex-shrink: 0; display: flex; flex-direction: column; }
        .sidebar-header { padding: 15px; border-bottom: 1px solid #222; }
        .auth-btn { width: 100%; padding: 8px; background: #1a1a1d; border: 1px solid #333; color: #ccc; cursor: pointer; border-radius: 4px; font-size: 11px; font-weight: bold; }
        .auth-btn.login { background: #00f2ff; color: #000; border: none; }
        .user-info { display: flex; flex-direction: column; gap: 5px; text-align: center; }
        .user-email { font-size: 10px; color: #666; }

        .item-list { flex: 1; overflow-y: auto; padding: 10px; }
        .costume-item { padding: 12px; border-radius: 6px; margin-bottom: 5px; cursor: pointer; border: 1px solid transparent; }
        .costume-item.active { background: #1a1a1d; border-color: #00f2ff; }
        .mem-name { font-size: 13px; font-weight: bold; }
        .cos-type { font-size: 11px; color: #888; }

        .viewer-area { flex: 1; display: flex; flex-direction: column; background: #000; position: relative; overflow: hidden; }
        .info-bar { padding: 12px 20px; background: rgba(20,20,25,0.9); z-index: 10; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #222; }
        .info-bar h2 { font-size: 16px; margin: 0; }
        .controls-hint { font-size: 10px; color: #555; }
        .image-stage { flex: 1; display: flex; align-items: center; justify-content: center; overflow: hidden; }
        .ref-image { max-width: 90%; height: auto; transition: transform 0.05s linear; }

        .progress-panel { width: 320px; background: #121214; border-left: 1px solid #222; display: flex; flex-direction: column; flex-shrink: 0; }
        .panel-header { padding: 20px; display: flex; justify-content: space-between; align-items: center; font-weight: bold; color: #ff00ff; }
        .total-badge { background: #ff00ff; color: #fff; padding: 2px 8px; border-radius: 12px; font-size: 11px; }
        .total-bar-container { width: 100%; height: 4px; background: #222; }
        .total-bar-fill { height: 100%; background: #ff00ff; transition: 0.3s; box-shadow: 0 0 8px #ff00ff; }
        
        .progress-content { flex: 1; overflow-y: auto; padding: 20px; }
        .add-btn { width: 100%; padding: 10px; background: #1a1a1d; border: 1px dashed #444; color: #888; border-radius: 6px; cursor: pointer; margin-bottom: 20px; font-size: 12px; }
        .add-btn:hover { border-color: #00f2ff; color: #00f2ff; }
        
        .part-card { background: #1a1a1d; padding: 15px; border-radius: 8px; margin-bottom: 15px; border: 1px solid #333; }
        .part-info { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
        .part-name { font-size: 13px; font-weight: bold; }
        .part-percent { font-size: 13px; color: #00f2ff; }
        .del-mini { background: none; border: none; color: #444; cursor: pointer; font-size: 18px; }
        .del-mini:hover { color: #ff4444; }
        .guest-msg { text-align: center; padding: 40px; color: #555; font-size: 12px; }
        
        .p-slider { width: 100%; cursor: pointer; accent-color: #00f2ff; }
        .loading { display: flex; height: 100vh; align-items: center; justify-content: center; background: #000; color: #00f2ff; }
      `}</style>
    </div>
  );
}