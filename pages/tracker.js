import React, { useState, useEffect } from 'react';
import Head from 'next/head';

// あなたのスプレッドシートURLを維持しています
const MASTER_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSAruZ3gKMni3ipy08kB8iVkpwlUTlpOro_TvCO4ilZaDeUvdlwVEqYqcsLtbSu5gV0ZhqeRJhDSY0-/pub?output=csv";

export default function Tracker() {
  const [masterData, setMasterData] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [loading, setLoading] = useState(true);

  // --- 進捗管理用のステート ---
  const [userProgress, setUserProgress] = useState({}); // { Master_ID: { parts: [{name, percent}] } }

  // 画像操作用
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });

  // 1. マスターデータとローカル保存データの読み込み
  useEffect(() => {
    const loadData = async () => {
      // 進捗データの復元
      const saved = localStorage.getItem('vspo-cos-progress');
      if (saved) setUserProgress(JSON.parse(saved));

      // スプレッドシート読み込み
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
    loadData();
  }, []);

  // 2. 進捗が更新されるたびにローカル保存
  useEffect(() => {
    if (Object.keys(userProgress).length > 0) {
      localStorage.setItem('vspo-cos-progress', JSON.stringify(userProgress));
    }
  }, [userProgress]);

  // --- 進捗操作の関数 ---
  const addPart = () => {
    if (!selectedItem) return;
    const id = selectedItem.Master_ID;
    const partName = prompt("制作パーツ名を入力してください (例: ウィッグ, 武器, ジャケット)");
    if (!partName) return;

    const currentParts = userProgress[id]?.parts || [];
    setUserProgress({
      ...userProgress,
      [id]: { parts: [...currentParts, { name: partName, percent: 0 }] }
    });
  };

  const updatePercent = (index, val) => {
    const id = selectedItem.Master_ID;
    const newParts = [...userProgress[id].parts];
    newParts[index].percent = parseInt(val);
    setUserProgress({ ...userProgress, [id]: { parts: newParts } });
  };

  const deletePart = (index) => {
    if (!confirm("このパーツを削除しますか？")) return;
    const id = selectedItem.Master_ID;
    const newParts = userProgress[id].parts.filter((_, i) => i !== index);
    setUserProgress({ ...userProgress, [id]: { parts: newParts } });
  };

  // ズームリセット
  useEffect(() => { setZoom(1); setOffset({ x: 0, y: 0 }); }, [selectedItem]);

  // 画像操作ロジック
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
      <Head><title>Vspo! Tracker v2</title></Head>

      <aside className="sidebar">
        <div className="sidebar-header">CHARA MASTER</div>
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
          <span>PROGRESS TRACKER</span>
          <span className="total-badge">{totalProgress}%</span>
        </div>
        
        <div className="total-bar-container">
          <div className="total-bar-fill" style={{ width: `${totalProgress}%` }}></div>
        </div>

        <div className="progress-content">
          <button className="add-btn" onClick={addPart}>+ PART ADD</button>
          
          <div className="parts-list">
            {currentParts.length === 0 && <p className="empty-msg">パーツが未登録です</p>}
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
        </div>
      </aside>

      <style jsx global>{`
        body { margin: 0; background: #0a0a0c; color: #eee; font-family: 'Inter', sans-serif; overflow: hidden; }
        .tracker-root { display: flex; height: 100vh; width: 100vw; }
        .sidebar { width: 240px; background: #121214; border-right: 1px solid #222; flex-shrink: 0; }
        .sidebar-header { padding: 20px; font-weight: bold; color: #00f2ff; border-bottom: 1px solid #222; font-size: 14px; }
        .item-list { padding: 10px; }
        .costume-item { padding: 12px; border-radius: 6px; margin-bottom: 5px; cursor: pointer; border: 1px solid transparent; }
        .costume-item.active { background: #1a1a1d; border-color: #00f2ff; box-shadow: 0 0 10px rgba(0,242,255,0.1); }
        .mem-name { font-size: 13px; font-weight: bold; }
        .cos-type { font-size: 11px; color: #888; }

        .viewer-area { flex: 1; display: flex; flex-direction: column; background: #000; position: relative; overflow: hidden; }
        .info-bar { padding: 12px 20px; background: rgba(20,20,25,0.9); z-index: 10; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #222; }
        .info-bar h2 { font-size: 16px; margin: 0; }
        .controls-hint { font-size: 10px; color: #555; }
        .image-stage { flex: 1; display: flex; align-items: center; justify-content: center; overflow: hidden; }
        .ref-image { max-width: 90%; height: auto; transition: transform 0.05s linear; }

        .progress-panel { width: 320px; background: #121214; border-left: 1px solid #222; display: flex; flex-direction: column; flex-shrink: 0; }
        .panel-header { padding: 20px; display: flex; justify-content: space-between; align-items: center; font-weight: bold; color: #ff00ff; font-size: 14px; }
        .total-badge { background: #ff00ff; color: #fff; padding: 2px 8px; border-radius: 12px; font-size: 11px; }
        .total-bar-container { width: 100%; height: 4px; background: #222; }
        .total-bar-fill { height: 100%; background: #ff00ff; transition: 0.3s; box-shadow: 0 0 8px #ff00ff; }
        
        .progress-content { flex: 1; overflow-y: auto; padding: 20px; }
        .add-btn { width: 100%; padding: 10px; background: #1a1a1d; border: 1px dashed #444; color: #888; border-radius: 6px; cursor: pointer; margin-bottom: 20px; transition: 0.2s; font-size: 12px; }
        .add-btn:hover { border-color: #00f2ff; color: #00f2ff; }
        
        .part-card { background: #1a1a1d; padding: 15px; border-radius: 8px; margin-bottom: 15px; border: 1px solid #333; }
        .part-info { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
        .part-name { font-size: 13px; font-weight: bold; }
        .part-percent { font-size: 13px; color: #00f2ff; }
        .del-mini { background: none; border: none; color: #444; cursor: pointer; font-size: 18px; }
        .del-mini:hover { color: #ff4444; }
        .empty-msg { text-align: center; color: #444; font-size: 12px; margin-top: 50px; }
        
        .p-slider { width: 100%; cursor: pointer; accent-color: #00f2ff; }
        .loading { display: flex; height: 100vh; align-items: center; justify-content: center; background: #000; color: #00f2ff; }
      `}</style>
    </div>
  );
}