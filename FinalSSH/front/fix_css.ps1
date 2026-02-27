
$path = "src/App.css"
$content = Get-Content $path -Raw
$newStyles = @"

/* ─────────────────────────────────────────────────────────────────────────────
   Improvement Hub - Premium Redesign
   ───────────────────────────────────────────────────────────────────────────── */
.im-page {
  max-width: 1100px;
  margin: 0 auto;
  padding: 40px 30px;
  animation: imSlideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1);
}

.im-head-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 40px;
}

.im-title-group h1 {
  font-size: 2.2rem;
  font-weight: 800;
  margin: 0;
  color: #1e293b;
}

.im-title-group p {
  color: #64748b;
  margin: 4px 0 0 0;
}

.im-back-pill {
  background: white;
  border: 1px solid #e2e8f0;
  padding: 10px 20px;
  border-radius: 99px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
}

.im-hero-card {
  position: relative;
  background: #1e1b4b;
  border-radius: 28px;
  padding: 40px;
  margin-bottom: 50px;
  color: white;
  overflow: hidden;
}

.im-hero-badge {
  display: inline-block;
  background: rgba(255, 255, 255, 0.1);
  padding: 6px 14px;
  border-radius: 8px;
  font-size: 0.7rem;
  font-weight: 800;
  margin-bottom: 20px;
}

.im-card-stack { display: flex; flex-direction: column; gap: 30px; }
.im-skill-card { display: flex; background: white; border: 1px solid #e2e8f0; border-radius: 24px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.04); transition: transform 0.3s ease; }
.im-skill-card:hover { transform: scale(1.005); border-color: var(--accent); }

.im-card-side { width: 140px; background: #f8fafc; border-right: 1px solid #e2e8f0; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 30px 20px; gap: 15px; }
.im-score-val { font-size: 1.8rem; font-weight: 900; color: var(--accent); }
.im-score-label { font-size: 0.7rem; font-weight: 700; color: #64748b; text-transform: uppercase; }
.im-side-status { font-size: 0.65rem; font-weight: 800; padding: 5px 12px; border-radius: 99px; text-transform: uppercase; }
.im-side-status.priority { background: #fee2e2; color: #ef4444; }

.im-card-main { flex: 1; padding: 32px; }
.im-main-top h3 { font-size: 1.6rem; font-weight: 800; margin-bottom: 12px; }
.im-subtopics-list { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 24px; }
.im-subtopic-dot { font-size: 0.8rem; font-weight: 600; color: #475569; background: white; padding: 4px 12px; border-radius: 8px; border: 1px solid #e2e8f0; }

.im-detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
.im-detail-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 20px; }
.im-detail-box.note { grid-column: span 2; border-left: 4px solid var(--accent); }
.im-detail-label { font-size: 0.75rem; font-weight: 800; color: #94a3b8; text-transform: uppercase; margin-bottom: 12px; }

.im-challenge-text { font-weight: 600; color: #1e293b; font-size: 0.9rem; line-height: 1.5; padding: 12px; background: rgba(124, 58, 237, 0.05); border-radius: 12px; border: 1px dashed var(--accent); }

.im-res-grid { display: flex; flex-direction: column; gap: 8px; }
.im-res-chip { display: flex; align-items: center; gap: 10px; padding: 10px 14px; background: white; border: 1px solid #e2e8f0; border-radius: 12px; text-decoration: none; color: #475569; font-size: 0.85rem; font-weight: 700; transition: all 0.2s; }
.im-res-chip:hover { border-color: var(--accent); color: var(--accent); transform: translateX(4px); }
.im-res-chip.youtube:hover { border-color: #ef4444; color: #ef4444; }

.im-empty-state { text-align: center; padding: 100px 40px; background: white; border-radius: 32px; border: 2px dashed #e2e8f0; max-width: 500px; margin: 60px auto; }
.im-empty-icon { font-size: 4rem; margin-bottom: 24px; }
.im-empty-state h3 { font-size: 1.8rem; margin-bottom: 12px; color: #1e293b; }
.im-empty-state p { color: #64748b; margin-bottom: 30px; }

@keyframes imSlideUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}

@media (max-width: 900px) {
  .im-skill-card { flex-direction: column; }
  .im-card-side { width: 100%; border-right: none; border-bottom: 1px solid #e2e8f0; flex-direction: row; justify-content: space-between; }
  .im-detail-grid { grid-template-columns: 1fr; }
  .im-detail-box.note { grid-column: span 1; }
}
"@

Set-Content $path ($content + $newStyles)
