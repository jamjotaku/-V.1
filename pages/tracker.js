import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import { supabase } from '../lib/supabaseClient'; // 接続ファイルをインポート

const MASTER_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSAruZ3gKMni3ipy08kB8iVkpwlUTlpOro_TvCO4ilZaDeUvdlwVEqYqcsLtbSu5gV0ZhqeRJhDSY0-/pub?output=csv";

export default function Tracker() {
  const [masterData, setMasterData] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null); // ログインユーザー

  // --- 進捗管理ステート ---
  const [userProgress, setUserProgress] = useState({});

  // 画像操作
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    // 1. ログイン状態の監視
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    // 2. マスターデータ読み込み
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

  // 3. ログイン時、Supabaseからデータを読み込む
  useEffect(() => {
    if (user) {
      fetchProgress();
    }
  }, [user]);

  const fetchProgress = async () => {
    const { data, error } = await supabase
      .from('user_progress')
      .select('*')
      .eq('user_id', user.id);
    
    if (data) {
      const formatted = {};
      data.forEach(row => { formatted[row.master_id] = { parts: row.parts }; });
      setUserProgress(formatted);
    }
  };

  // 4. データ保存（Supabaseへ）
  const saveToSupabase = async (id, parts) => {
    if (!user) return; // ログインしてなければ保存しない
    await supabase.from('user_progress').upsert({
      user_id: user.id,
      master_id: id,
      parts: parts,
      updated_at: new Date()
    }, { onConflict: 'user_id, master_id' });
  };

  // --- ログイン処理 ---
  const handleLogin = async () => {
    const email = prompt("Emailを入力してください");
    if (!email) return;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin + '/tracker' }
    });
    if (error) alert(error.message);
    else alert("ログイン用URLをメールで送りました！");
  };

  const handleLogout = () => supabase.auth.signOut();

  // --- 進捗操作 ---
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
    saveToSupabase(id, newParts); // 動かすたびに保存
  };

  // (画像操作ロジックは前のまま維持)
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
            <button onClick={handleLogout} className="auth-btn">LOGOUT</button>
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
        </div>
        <div className="image-stage" onWheel={handleWheel} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} style={{ cursor: isDragging ? 'grabbing' : 'grab' }}>
          {selectedItem && (
            <img src={selectedItem.Ref_Image_URL} alt="Ref" className="ref-image" draggable="false" style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})` }} />
          )}
        </div>
      </main>

      <aside className="progress-panel">
        <div className="panel-header">
          <span>{user ? "YOUR PROGRESS" : "GUEST MODE"}</span>
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
                    </div>
                    <input type="range" min="0" max="100" value={part.percent} onChange={(e) => updatePercent(idx, e.target.value)} className="p-slider" />
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="guest-msg">ログインするとデータを保存できます</div>
          )}
        </div>
      </aside>

      <style jsx global>{`
        /* 前回のスタイルを維持しつつ、auth-btnを追加 */
        .auth-btn { width: 100%; padding: 10px; background: #222; border: 1px solid #444; color: #eee; cursor: pointer; border-radius: 4px; font-size: 11px; }
        .auth-btn.login { background: #00f2ff; color: #000; border: none; font-weight: bold; }
        .guest-msg { text-align: center; padding: 40px; color: #555; font-size: 12px; }
        /* ... その他前回のスタイル ... */
      `}</style>
    </div>
  );
}