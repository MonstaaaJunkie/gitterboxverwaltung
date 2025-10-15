const DAYS_SOON = 30;
const $ = (s)=>document.querySelector(s);

function requireAuth() {
  const token = localStorage.getItem('jwt');
  if (!token) location.replace('/login.html');
  const user = JSON.parse(localStorage.getItem('user') || "null");
  if (user?.role === 'admin') document.getElementById('admin-link').style.display = 'inline';
}
function authHeader(){ const t=localStorage.getItem('jwt'); return {'Authorization':'Bearer '+t,'Content-Type':'application/json'}; }
function uid(){ return Math.random().toString(36).slice(2)+Date.now().toString(36); }
function parseDateInput(v){ return v ? new Date(v + 'T00:00:00') : null; }
function fmt(d){ if(!d) return ''; const dt=(d instanceof Date)? d : new Date(d); return dt.toLocaleDateString(); }
function statusFor(disposeAt){ const today=new Date(), disp=new Date(disposeAt); const diffDays=Math.ceil((disp-today)/(1000*60*60*24)); if(diffDays<0) return {key:'overdue',label:`Überfällig (${Math.abs(diffDays)} T.)`}; if(diffDays<=DAYS_SOON) return {key:'soon',label:`Bald fällig (${diffDays} T.)`}; return {key:'ok',label:'OK'}; }

let state={ items:[], editId:null };

async function load(){
  const res=await fetch('/api/boxes',{headers:authHeader()});
  if(!res.ok){ if(res.status===401) location.replace('/login.html'); throw new Error('Fetch failed'); }
  state.items=await res.json();
  render();
}
async function saveItem(item){ const res=await fetch('/api/boxes',{method:'POST',headers:authHeader(),body:JSON.stringify(item)}); if(!res.ok) throw new Error('Save failed'); }
async function deleteItem(id){ const res=await fetch('/api/boxes/'+encodeURIComponent(id),{method:'DELETE',headers:authHeader()}); if(!res.ok) throw new Error('Delete failed'); }

function escapeHtml(str){ return (str??'').replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m])); }

function render(){
  const tbody = document.getElementById('table-body');
  const search = (document.getElementById('search').value||'').toLowerCase().trim();
  const status = document.getElementById('status-filter').value;
  const sortBy = document.getElementById('sort-by').value;
  let rows = state.items.filter(it=>{
    const match = (it.barcode||'').toLowerCase().includes(search) || (it.title||'').toLowerCase().includes(search) || (it.note||'').toLowerCase().includes(search);
    if(!match) return false;
    const st = statusFor(it.disposeAt).key;
    if(status==='all') return true;
    return st===status;
  });
  rows.sort((a,b)=>{
    switch(sortBy){
      case 'createdAt_desc': return new Date(b.createdAt)-new Date(a.createdAt);
      case 'createdAt_asc': return new Date(a.createdAt)-new Date(b.createdAt);
      case 'disposeAt_asc': return new Date(a.disposeAt)-new Date(b.disposeAt);
      case 'disposeAt_desc': return new Date(b.disposeAt)-new Date(a.disposeAt);
      case 'title_asc': return (a.title||'').localeCompare(b.title||'');
      case 'title_desc': return (b.title||'').localeCompare(a.title||'');
      default: return 0;
    }
  });
  tbody.innerHTML = rows.map(it=>{
    const st=statusFor(it.disposeAt);
    return `<tr>
      <td><code>${escapeHtml(it.barcode)}</code></td>
      <td>${escapeHtml(it.title)}</td>
      <td>${fmt(it.createdAt)}</td>
      <td>${fmt(it.disposeAt)}</td>
      <td><span class="badge ${st.key}">${st.label}</span></td>
      <td class="table-actions">
        <button class="btn btn-secondary" data-act="edit" data-id="${it.id}">Bearbeiten</button>
        <button class="btn btn-danger" data-act="delete" data-id="${it.id}">Löschen</button>
      </td>
    </tr>`;
  }).join('');
}

async function onSubmit(e){
  e.preventDefault();
  const id = state.editId || uid();
  const barcode = document.getElementById('barcode').value.trim();
  const title = document.getElementById('title').value.trim();
  const createdAt = parseDateInput(document.getElementById('createdAt').value)?.toISOString();
  const disposeAt = parseDateInput(document.getElementById('disposeAt').value)?.toISOString();
  const note = document.getElementById('note').value.trim();
  if(!barcode || !title || !createdAt || !disposeAt){ alert('Bitte Felder ausfüllen'); return; }
  await saveItem({ id, barcode, title, createdAt, disposeAt, note });
  state.editId=null; e.target.reset();
  document.getElementById('createdAt').valueAsDate = new Date();
  await load();
}

async function onTableClick(e){
  const btn=e.target.closest('button[data-act]'); if(!btn) return;
  const id=btn.dataset.id; const act=btn.dataset.act;
  const item=state.items.find(x=>x.id===id); if(!item) return;
  if(act==='edit'){
    document.getElementById('barcode').value=item.barcode||'';
    document.getElementById('title').value=item.title||'';
    document.getElementById('createdAt').valueAsDate=new Date(item.createdAt);
    document.getElementById('disposeAt').valueAsDate=new Date(item.disposeAt);
    document.getElementById('note').value=item.note||'';
    state.editId=id;
    window.scrollTo({top:0,behavior:'smooth'});
  } else if(act==='delete'){
    if(confirm('Eintrag wirklich löschen?')){ await deleteItem(id); await load(); }
  }
}

function hookScanner(){
  const openBtn=document.getElementById('btn-scan');
  const modal=document.getElementById('scanner-modal');
  const closeBtn=document.getElementById('close-scanner');
  let qr=null;
  async function open(){
    modal.classList.remove('hidden');
    try{
      qr=new Html5Qrcode('qr-reader');
      await qr.start({facingMode:'environment'},{fps:10,qrbox:{width:300,height:200}}, (decoded)=>{ document.getElementById('barcode').value=decoded; close(); }, ()=>{});
    }catch(err){ console.error(err); alert('Scanner konnte nicht gestartet werden.'); }
  }
  async function close(){ if(qr){ try{ await qr.stop(); await qr.clear(); }catch(e){} qr=null; } modal.classList.add('hidden'); }
  openBtn.addEventListener('click', open); closeBtn.addEventListener('click', close);
  modal.addEventListener('click', (e)=>{ if(e.target===modal) close(); });
}

function initDefaults(){
  document.getElementById('createdAt').valueAsDate = new Date();
  document.getElementById('disposeAt').valueAsDate = new Date(new Date().setMonth(new Date().getMonth()+6));
}

function init(){
  requireAuth();
  initDefaults();
  load();
  document.getElementById('box-form').addEventListener('submit', onSubmit);
  document.getElementById('table-body').addEventListener('click', onTableClick);
  document.getElementById('search').addEventListener('input', render);
  document.getElementById('status-filter').addEventListener('change', render);
  document.getElementById('sort-by').addEventListener('change', render);
  document.getElementById('logout').addEventListener('click', (e)=>{ e.preventDefault(); localStorage.removeItem('jwt'); localStorage.removeItem('user'); location.replace('/login.html'); });
  hookScanner();
}
document.addEventListener('DOMContentLoaded', init);
