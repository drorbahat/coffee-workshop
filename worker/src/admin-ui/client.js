// ───────────────────────────────────────────────
// admin-ui/client.js
// Full production client for A+B hybrid admin UI
// RTL Hebrew primary, inline editing, optimistic updates
// ───────────────────────────────────────────────

export const adminClientJs = `
(function() {
  'use strict';

  /* ── helpers ────────────────────────────────── */
  function esc(s){return String(s??'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'})[c])}
  function escAttr(s){return esc(s).replace(/\"/g,'&quot;')}

  function fmtDate(d){
    if(!d) return '—';
    try{
      const dt=new Date(d+(d.includes('T')?'':'T00:00:00'));
      if(isNaN(dt.getTime())) return String(d).slice(0,10);
      return dt.toLocaleDateString('he-IL',{year:'numeric',month:'long',day:'numeric'});
    }catch(e){return String(d).slice(0,10)}
  }

  function fmtDateCompact(d){
    if(!d) return '—';
    try{
      const dt=new Date(d+(d.includes('T')?'':'T00:00:00'));
      if(isNaN(dt.getTime())) return String(d).slice(0,10);
      return dt.toLocaleDateString('he-IL',{year:'numeric',month:'long',day:'numeric'});
    }catch(e){return String(d).slice(0,10)}
  }

  function showToast(msg,dur){
    const reg=document.getElementById('toast-region');
    if(!reg)return;
    const t=document.createElement('div');
    t.className='toast';
    t.textContent=msg;
    reg.appendChild(t);
    requestAnimationFrame(()=>t.classList.add('show'));
    setTimeout(()=>{t.classList.remove('show');setTimeout(()=>t.remove(),300)},dur||2000);
  }

  /* ── WhatsApp message helper ────────────────── */
  function waDraftMessage(reg){
    const name=reg.name||'';
    const rtype=clientRecordType(reg);
    const isLead=rtype==='lead'||reg.registration_status==='lead'||(reg.workshop_key==='brew_updates'||reg.workshop_key==='espresso_updates');

    if(isLead){
      // Lead / update subscriber — no workshop booked yet
      if(reg.workshop_key==='espresso_updates') return 'היי '+name+', תודה שנרשמת לעדכונים!'+String.fromCharCode(10)+'אעדכן אותך כשייפתח מועד לסדנת אספרסו.';
      return 'היי '+name+', תודה שנרשמת לעדכונים!'+String.fromCharCode(10)+'אעדכן אותך כשייפתח מועד לסדנת חליטות.';
    }

    // Real registration — build message from actual fields
    const edition=reg.edition||'';
    const workshop=reg.workshop||'';
    // Clean workshop display: prefer workshop name, strip "עדכונים" prefix
    let wsName=workshop||edition||'הסדנה';
    if(wsName.startsWith('עדכונים — ')) wsName=wsName.slice(9);
    const date=reg.workshop_date?' ב'+reg.workshop_date:'';
    const amount=reg.amount_ils?reg.amount_ils+'₪':'';
    let msg='היי '+name+', מה שלומך?'+String.fromCharCode(10)+'ראיתי שנרשמת ל'+wsName+date+'.';
    if(amount) msg+=String.fromCharCode(10)+'כדי לשמור מקום — אפשר להעביר '+amount+' בביט.';
    return msg;
  }
  function waUrlWithMessage(reg){
    if(!reg.wa_phone)return null;
    return 'https://wa.me/'+reg.wa_phone+'?text='+encodeURIComponent(waDraftMessage(reg));
  }

  /* ── Status labels (mirrors server) ───────── */
  const SL=Object.freeze({
    whatsapp_status:{pending:'לא נשלחה הודעה',outreach_sent:'נשלחה הודעה',sent:'נשלחה הודעה',awaiting_reply:'ממתין לתשובה',replied_interested:'חזר מעוניין'},
    payment_status:{pending:'לא שולם',bit_request_sent:'Bit נשלח',paid:'שולם'},
    registration_status:{new:'חדש',needs_payment_followup:'פולואפ תשלום',registered_under_shnir:'כלול בהרשמה קבוצתית',not_handled:'לא טופל',confirmed:'מאושר',cancelled:'בוטל',lead:'ליד לעדכונים',group_member:'כלול בהרשמה קבוצתית',interested:'מעוניין',registered:'נרשם'},
    crm_stage:{open:'פתוח',awaiting_reply:'ממתין לתשובה',interested:'מעוניין',closing:'בסגירה',closed:'סגור',lost:'אבד'},
    record_type:{lead:'ליד',registration:'הרשמה',attendee:'כלול בהרשמה'}
  });
  function sl(f,v){return v==null||v===''?'—':SL[f]?.[v]||String(v)}

  /* ── Client-side CRM helpers (mirrors server registration-normalize) ─ */
  function clientRecordType(r){
    if(r.record_type)return r.record_type;
    if(r.registration_status==='registered_under_shnir'||r.registration_status==='group_member')return'attendee';
    const kw=r.workshop_key||wk(r);
    if(r.registration_status==='lead'||kw==='brew_updates'||kw==='espresso_updates')return'lead';
    return'registration';
  }
  function clientIsGroupMember(r){
    return clientRecordType(r)==='attendee'||
      r.registration_status==='registered_under_shnir'||
      r.registration_status==='group_member'||
      String(r.group_registration||'').includes('כלול בהרשמת');
  }
  function clientIsBillableRow(r){
    if(Number(r.is_spam)===1)return false;
    if(r.registration_status==='cancelled')return false;
    if(clientRecordType(r)!=='registration')return false;
    return true;
  }

  /**
   * Resolve the parent registration name for a group member, using the
   * local state.allItems array. Returns a human-readable Hebrew string
   * like "כלול בהרשמת יאנה" or "כלול בהרשמה #18".
   */
  function clientParentName(r){
    if(!clientIsGroupMember(r)||!r.parent_registration_id)return null;
    const parent=state.allItems.find(p=>Number(p.id)===Number(r.parent_registration_id));
    if(parent&&parent.name)return 'כלול בהרשמת '+parent.name;
    return 'כלול בהרשמה #'+r.parent_registration_id;
  }

  function compLane(r){
    if(Number(r.is_spam)===1)return'closed';
    if(r.registration_status==='cancelled')return'closed';
    if(clientIsGroupMember(r))return'closed';
    if(r.payment_status==='paid')return'closed';
    if(r.payment_status==='bit_request_sent')return'waiting_payment';

    if(clientRecordType(r)==='lead'){
      if(r.registration_status==='interested'||r.crm_stage==='interested')return'needs_closing';
      if(r.whatsapp_status==='pending')return'needs_action';
      return'open_leads';
    }

    if(r.registration_status==='needs_payment_followup')return'needs_closing';
    if(r.registration_status==='not_handled')return'needs_action';
    if(r.whatsapp_status==='pending')return'needs_action';
    return'needs_closing';
  }

  /* ── Sprint 1: Human-readable display status & next-action ── */
  function computeDisplayStatus(r){
    const rt=r._record_type||clientRecordType(r);
    const gm=r._is_group_member||clientIsGroupMember(r);
    if(Number(r.is_spam)===1)return{text:'ספאם',tone:'muted'};
    if(r.registration_status==='cancelled'||r.registration_status==='בוטל')return{text:'בוטל',tone:'muted'};
    if(gm)return{text:'כלול בהרשמה',tone:'muted'};
    if(r.payment_status==='paid')return{text:'שולם ✓',tone:'ok'};
    if(r.payment_status==='bit_request_sent')return{text:'מחכה לתשלום',tone:'wait'};
    if(rt==='lead'){
      if(r.registration_status==='interested'||r.crm_stage==='interested')return{text:'חזר מעוניין',tone:'ok'};
      if(r.whatsapp_status==='pending')return{text:'צריך הודעה',tone:'need'};
      if(r.whatsapp_status==='awaiting_reply')return{text:'מחכה לתשובה',tone:'wait'};
      if(r.whatsapp_status==='outreach_sent'||r.whatsapp_status==='sent')return{text:'הודעה נשלחה',tone:'ok'};
      if(r.whatsapp_status==='replied_interested')return{text:'חזר מעוניין',tone:'ok'};
      return{text:'ליד פתוח',tone:'wait'};
    }
    if(r.whatsapp_status==='pending'||r.registration_status==='not_handled')return{text:'צריך הודעה',tone:'need'};
    if(r.whatsapp_status==='awaiting_reply')return{text:'מחכה לתשובה',tone:'wait'};
    if(r.whatsapp_status==='outreach_sent'||r.whatsapp_status==='sent')return{text:'הודעה נשלחה',tone:'ok'};
    if(r.whatsapp_status==='replied_interested')return{text:'חזר מעוניין',tone:'ok'};
    return{text:'מחכה לטיפול',tone:'wait'};
  }

  function computeNextAction(r){
    const rt=r._record_type||clientRecordType(r);
    const gm=r._is_group_member||clientIsGroupMember(r);
    if(Number(r.is_spam)===1||r.registration_status==='cancelled'||gm)return{label:'פתח פרטים',action:'details',tone:'secondary'};
    if(r.payment_status==='paid')return{label:'פתח פרטים',action:'details',tone:'secondary'};
    if(r.payment_status==='bit_request_sent')return{label:'סמן שולם',action:'mark_paid',tone:'primary'};
    if(rt==='lead'){
      if(r.registration_status==='interested'||r.crm_stage==='interested')return{label:'פתח פרטים',action:'details',tone:'secondary'};
      if(r.whatsapp_status==='pending'&&r.wa_phone)return{label:'פתח WhatsApp',action:'open_wa',tone:'primary'};
      return{label:'פתח פרטים',action:'details',tone:'secondary'};
    }
    if(r.whatsapp_status==='pending'&&r.wa_phone)return{label:'פתח WhatsApp',action:'open_wa',tone:'primary'};
    return{label:'פתח פרטים',action:'details',tone:'secondary'};
  }

  function wk(r){
    const t=''+(r.edition||'')+' '+(r.request_type||'')+' '+(r.workshop||'');
    if(t.includes('URU')||t.includes('תל אביב'))return'uru';
    if(t.includes('קנופי')||t.includes('ירושלים'))return'kanopi';
    if(t.includes('אספרסו'))return'espresso_updates';
    if(t.includes('עדכונים')||t.includes('חליט'))return'brew_updates';
    return'other';
  }

  function normPhone(phone){
    const raw=String(phone||'').trim();
    if(!raw||raw.includes('*'))return null;
    const d=raw.replace(/[^0-9+]/g,'');
    if(d.startsWith('+972'))return'972'+d.slice(4);
    if(d.startsWith('972'))return d;
    if(d.startsWith('0'))return'972'+d.slice(1);
    return d.length>=9?d:null;
  }

  function normRow(row){
    const gm=clientIsGroupMember(row);
    return{...row,
      lane:compLane(row),
      workshop_key:wk(row),
      whatsapp_label:sl('whatsapp_status',row.whatsapp_status),
      // Override payment_label for group members: show included status instead of "לא שולם"
      payment_label:gm
        ? (row.parent_registration_id
          ? 'כלול בהרשמה #'+row.parent_registration_id
          : 'כלול בהרשמה')
        : sl('payment_status',row.payment_status),
      registration_label:sl('registration_status',row.registration_status),
      crm_stage_label:sl('crm_stage',row.crm_stage),
      record_type_label:sl('record_type',row.record_type||clientRecordType(row)),
      _record_type:clientRecordType(row),
      _is_group_member:gm,
      _payment_included:gm,  // flag: payment is covered by parent
      _is_billable:clientIsBillableRow(row),
      wa_phone:normPhone(row.phone),
      // Sprint 1: human-readable computed fields
      display_status:computeDisplayStatus(row).text,
      display_tone:computeDisplayStatus(row).tone,
      next_action_label:computeNextAction(row).label,
      next_action_key:computeNextAction(row).action,
    };
  }

  /* ── State ──────────────────────────────────── */
  const state={
    items:[],
    allItems:[],
    workshop_capacity_summary:null,
    activeTab:'cockpit',
    filters:{workshop:'all',whatsapp:'all',payment:'all',registration:'all',record_type:'all',crm_stage:'all',quick:'all',search:'',showCancelled:false},
    selectedId:null,
    savingIds:new Set(),
    lastRefresh:null,
  };

  /* ── API ────────────────────────────────────── */
  async function callUpdate(id,changes){
    state.savingIds.add(id);
    renderAll();
    try{
      const res=await fetch('/admin/registration/update-many',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({id,changes})
      });
      const data=await res.json();
      if(data.ok&&data.registration){
        const idx=state.allItems.findIndex(r=>r.id===id);
        if(idx>=0)state.allItems[idx]=normRow(data.registration);
        showToast('עודכן ✓');
      }else{
        showToast('שגיאה: '+(data.error||'unknown'));
        // rollback — refetch full list
        await fetchData();
      }
    }catch(e){
      showToast('שגיאת רשת');
      console.error(e);
      await fetchData();
    }finally{
      state.savingIds.delete(id);
      renderAll();
      refreshOpenDetails();
    }
  }

  async function callDelete(id,note){
    if(!confirm('בטוח לבטל הרשמה?'))return;
    state.savingIds.add(id);
    renderAll();
    try{
      const res=await fetch('/admin/registration/delete',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({id,note:note||'בוטל מהאדמין'})
      });
      const data=await res.json();
      if(data.ok&&data.registration){
        const idx=state.allItems.findIndex(r=>r.id===id);
        if(idx>=0)state.allItems[idx]=normRow(data.registration);
        showToast('בוטל ✓');
        closeDetails();
      }else{
        showToast('שגיאה: '+(data.error||'unknown'));
      }
    }catch(e){
      showToast('שגיאת רשת');
      console.error(e);
    }finally{
      state.savingIds.delete(id);
      renderAll();
    }
  }

  /* ── Data fetching ──────────────────────────── */
  async function fetchData(){
    try{
      const res=await fetch('/admin/registrations.json');
      if(!res.ok)throw new Error('HTTP '+res.status);
      const data=await res.json();
      state.allItems=(data.registrations||[]).map(normRow);
      state.workshop_capacity_summary=data.workshop_capacity_summary||null;
      // Now that allItems is populated, re-derive payment_label for group
      // members so we can show parent name instead of just parent ID.
      state.allItems.forEach(r=>{
        if(r._is_group_member&&r.parent_registration_id){
          const pn=clientParentName(r);
          if(pn)r.payment_label=pn;
        }
      });
      state.lastRefresh=new Date();
      populateFilters();
      renderAll();
    }catch(e){
      showToast('שגיאה בטעינת נתונים');
      console.error(e);
    }
  }

  function populateFilters(){
    const sel=document.getElementById('filterWorkshop');
    if(!sel)return;
    // Only consider non-cancelled rows by default so a cancelled legacy row
    // does not keep a stale category visible (e.g. 'אחר' from a cancelled row).
    const active=state.filters.showCancelled
      ? state.allItems
      : state.allItems.filter(r=>r.registration_status!=='cancelled');
    const keys=[...new Set(active.map(r=>r.workshop_key))].sort();
    const labels={uru:'URU תל אביב',kanopi:'קנופי ירושלים',brew_updates:'עדכוני חליטה',espresso_updates:'עדכוני אספרסו',other:'אחר'};
    sel.innerHTML='<option value="all">כל הסדנאות</option>';
    keys.forEach(k=>{
      const o=document.createElement('option');
      o.value=k;o.textContent=labels[k]||k;
      sel.appendChild(o);
    });
  }

  /* ── Filtering ──────────────────────────────── */
  function applyFilters(items){
    const f=state.filters;
    return items.filter(r=>{
      if(!f.showCancelled&&r.registration_status==='cancelled')return false;
      if(f.workshop!=='all'&&r.workshop_key!==f.workshop)return false;
      if(f.whatsapp!=='all'&&r.whatsapp_status!==f.whatsapp)return false;
      if(f.payment!=='all'&&r.payment_status!==f.payment)return false;
      if(f.registration!=='all'&&r.registration_status!==f.registration)return false;
      if(f.record_type!=='all'&&(r.record_type||clientRecordType(r))!==f.record_type)return false;
      if(f.crm_stage!=='all'&&(r.crm_stage||'')!==f.crm_stage)return false;
      if(f.quick==='needs_action'&&r.lane!=='needs_action')return false;
      if(f.quick==='no_whatsapp'&&r.whatsapp_status!=='pending')return false;
      if(f.quick==='unpaid'&&(r.payment_status==='paid'||!r.amount_ils))return false;
      if(f.quick==='spam'&&Number(r.is_spam)!==1)return false;
      if(f.search){
        const h=(r.name+' '+r.phone+' '+(r.edition||'')+' '+(r.source||'')+' '+(r.notes||'')).toLowerCase();
        if(!h.includes(f.search.toLowerCase()))return false;
      }
      return true;
    });
  }

  /* ── Wire filters ───────────────────────────── */
  function wireFilters(){
    const byId=id=>document.getElementById(id);
    byId('filterWorkshop')?.addEventListener('change',function(){state.filters.workshop=this.value;renderAll()});
    byId('filterWhatsapp')?.addEventListener('change',function(){state.filters.whatsapp=this.value;renderAll()});
    byId('filterPayment')?.addEventListener('change',function(){state.filters.payment=this.value;renderAll()});
    byId('filterRegistration')?.addEventListener('change',function(){state.filters.registration=this.value;renderAll()});
    byId('filterRecordType')?.addEventListener('change',function(){state.filters.record_type=this.value;renderAll()});
    byId('filterCrmStage')?.addEventListener('change',function(){state.filters.crm_stage=this.value;renderAll()});
    byId('filterSearch')?.addEventListener('input',function(){state.filters.search=this.value;renderAll()});
    byId('showCancelled')?.addEventListener('change',function(){state.filters.showCancelled=this.checked;populateFilters();renderAll()});

    document.getElementById('quickChips')?.addEventListener('click',function(e){
      const chip=e.target.closest('.chip');
      if(!chip)return;
      const val=chip.dataset.quick;
      if(chip.classList.contains('active')){
        chip.classList.remove('active');
        state.filters.quick='all';
      }else{
        document.querySelectorAll('#quickChips .chip').forEach(c=>c.classList.remove('active'));
        chip.classList.add('active');
        state.filters.quick=val;
      }
      renderAll();
    });

    // Refresh button
    byId('refreshBtn')?.addEventListener('click',()=>{
      const btn=byId('refreshBtn');
      const orig=btn.innerHTML;
      btn.innerHTML='רענן…';
      btn.style.animation='spin .6s linear';
      fetchData().finally(()=>{btn.innerHTML=orig;btn.style.animation=''});
    });
  }

  // Spin animation
  const styleSheet=document.createElement('style');
  styleSheet.textContent='@keyframes spin{to{transform:rotate(360deg)}}';
  document.head.appendChild(styleSheet);

  /* ── Tab switching ──────────────────────────── */
  function wireTabs(){
    document.querySelectorAll('.tab-btn').forEach(tab=>{
      tab.addEventListener('click',function(){
        document.querySelectorAll('.tab-btn').forEach(t=>t.classList.remove('active'));
        this.classList.add('active');
        state.activeTab=this.dataset.tab;
        document.getElementById('cockpit-view').classList.toggle('v-hide',state.activeTab!=='cockpit');
        document.getElementById('table-view').classList.toggle('v-hide',state.activeTab!=='table');
      });
    });
  }

  /* ── Render KPI ─────────────────────────────── */
  function renderKPI(items){
    const el=document.getElementById('kpi-band');
    if(!el)return;
    const total=items.length;
    const needs=items.filter(r=>r.lane==='needs_action').length;
    const open_leads=items.filter(r=>r.lane==='open_leads').length;
    const closing=items.filter(r=>r.lane==='needs_closing').length;
    const wait=items.filter(r=>r.lane==='waiting_payment').length;
    const closed=items.filter(r=>r.lane==='closed').length;
    const paidSeats=items.filter(r=>r.payment_status==='paid').reduce((s,r)=>s+(r.seats||0),0);
    el.innerHTML=
      '<div class="kpi-item"><div class="kpi-num">'+total+'</div><div class="kpi-label">סה״כ</div></div>'+
      '<div class="kpi-item needs"><div class="kpi-num">'+needs+'</div><div class="kpi-label">צריך טיפול</div></div>'+
      '<div class="kpi-item wait"><div class="kpi-num">'+(open_leads+closing)+'</div><div class="kpi-label">מחכה לתשובה</div></div>'+
      '<div class="kpi-item closed"><div class="kpi-num">'+paidSeats+'</div><div class="kpi-label">שולם / מקומות</div></div>';
  }

  /* ── Render capacity summary ────────────────── */
  function renderCapacitySummary(){
    const el=document.getElementById('capacity-band');
    if(!el)return;
    const summary=state.workshop_capacity_summary;
    if(!summary||!Object.keys(summary).length){
      el.innerHTML='';
      return;
    }
    const labels={filter_2026_06_15:'קנופי ירושלים',uru_2026_07_03:'URU תל אביב'};
    el.innerHTML=Object.entries(summary).map(([key,ws])=>{
      const title=labels[key]||key;
      const openDot=ws.open?'🟢':'🔴';
      const mismatchHtml=ws.mismatch
        ? '<div class="capacity-mismatch">⚠️ פער: האתר מראה '+ws.public_confirmed+', שילמו '+ws.paid_seats+'</div>'
        : '';
      return '<div class="capacity-card'+(ws.mismatch?' capacity-mismatch-card':'')+'">'+
        '<div class="capacity-title">'+openDot+' '+esc(title)+'</div>'+
        '<div class="capacity-numbers">'+
          '<span class="capacity-num">'+ws.paid_seats+'</span>/<span class="capacity-den">'+ws.capacity+'</span>'+
          ' <span class="capacity-label">שילמו</span>'+
          (ws.manual_reserved>0?' · <span class="capacity-reserved">'+ws.manual_reserved+' שמורים ידנית</span>':'')+
        '</div>'+
        mismatchHtml+
      '</div>';
    }).join('');
  }

  /* ── Render cockpit ─────────────────────────── */
  function renderCockpit(items){
    const view=document.getElementById('cockpit-view');
    if(!view)return;
    const lanes={needs_action:[],open_leads:[],needs_closing:[],waiting_payment:[],closed:[]};
    items.forEach(r=>{if(lanes[r.lane])lanes[r.lane].push(r)});
    lanes.needs_action.sort((a,b)=>(a.id||0)-(b.id||0));
    lanes.open_leads.sort((a,b)=>(b.id||0)-(a.id||0));
    lanes.needs_closing.sort((a,b)=>(b.id||0)-(a.id||0));
    lanes.waiting_payment.sort((a,b)=>(b.id||0)-(a.id||0));
    lanes.closed.sort((a,b)=>(b.id||0)-(a.id||0));

    const labels={
      needs_action:{title:'צריך הודעה',dot:'#b85a3a'},
      open_leads:{title:'מחכה לתשובה',dot:'#5a5a7a'},
      needs_closing:{title:'לסגור הרשמה',dot:'#8a6a20'},
      waiting_payment:{title:'ממתין לתשלום',dot:'#b8913a'},
      closed:{title:'סגור / שולם',dot:'#3a7a4a'}
    };

    view.innerHTML=Object.entries(lanes).map(([key,ln])=> \`
      <div class="lane \${key}">
        <div class="lane-header">
          <span class="lane-dot" style="background:\${labels[key].dot}"></span>
          <h2>\${labels[key].title}</h2>
          <span class="lane-count">\${ln.length}</span>
        </div>
        <div class="lane-items">\${ln.length ? ln.map(r=>renderCockpitCard(r)).join('') : '<div class="lane-empty">אין פריטים כרגע</div>'}</div>
      </div>
    \`).join('');

    // Wire card clicks
    view.querySelectorAll('.cockpit-card').forEach(card=>{
      card.addEventListener('click',function(e){
        if(e.target.closest('.card-action-btn'))return;
        const id=Number(this.dataset.id);
        const reg=state.allItems.find(r=>r.id===id);
        if(reg)openDetails(reg);
      });
    });
    view.querySelectorAll('.card-action-btn').forEach(btn=>{
      btn.addEventListener('click',function(e){
        e.stopPropagation();
        const id=Number(this.dataset.id);
        const action=this.dataset.action;
        handleCockpitAction(id,action);
      });
    });
  }

  function renderCockpitCard(r){
    const isSaving=state.savingIds.has(r.id);

    let actionBtn='';
    let extraLine='';
    if(r.lane==='needs_action'&&r.whatsapp_status==='pending'){
      actionBtn='<button class="card-action-btn'+(isSaving?' saving':'')+'" data-id="'+r.id+'" data-action="open_wa">פתח WhatsApp</button>';
    }else if(r.lane==='needs_action'&&(r.whatsapp_status==='outreach_sent'||r.whatsapp_status==='sent')&&r._is_billable){
      actionBtn='<button class="card-action-btn'+(isSaving?' saving':'')+'" data-id="'+r.id+'" data-action="mark_bit">ביקשתי תשלום</button>';
    }else if(r.lane==='needs_action'&&(r.whatsapp_status==='outreach_sent'||r.whatsapp_status==='sent')&&r._record_type==='lead'){
      actionBtn='<button class="card-action-btn secondary'+(isSaving?' saving':'')+'" data-id="'+r.id+'" data-action="details">פרטים</button>';
    }else if(r.lane==='open_leads'){
      extraLine='<div class="card-lead-status">הודעה נשלחה · מחכים לתשובה</div>';
      actionBtn='<button class="card-action-btn secondary'+(isSaving?' saving':'')+'" data-id="'+r.id+'" data-action="details">פרטים</button>';
    }else if(r.lane==='needs_closing'){
      if(r._is_billable){
        actionBtn='<button class="card-action-btn'+(isSaving?' saving':'')+'" data-id="'+r.id+'" data-action="mark_bit">ביקשתי תשלום</button>';
      }else if(r._record_type==='lead'){
        actionBtn='<button class="card-action-btn'+(isSaving?' saving':'')+'" data-id="'+r.id+'" data-action="move_to_closing">העבר לסגירה</button>';
      }else{
        actionBtn='<button class="card-action-btn secondary'+(isSaving?' saving':'')+'" data-id="'+r.id+'" data-action="details">פרטים</button>';
      }
    }else if(r.lane==='waiting_payment'){
      actionBtn='<button class="card-action-btn'+(isSaving?' saving':'')+'" data-id="'+r.id+'" data-action="mark_paid">סמן שולם</button>';
    }else{
      actionBtn='<button class="card-action-btn secondary'+(isSaving?' saving':'')+'" data-id="'+r.id+'" data-action="details">פרטים</button>';
    }

    const dateStr=fmtDateCompact(r.created_at);
    const seatsStr=r.seats>1?' · '+r.seats+' מקומות · ₪'+(r.amount_ils||0):'';
    const amountStr=r.amount_ils!=null?' · ₪'+r.amount_ils:'';
    const memberInfo=r._is_group_member?' · '+(clientParentName(r)||'כלול בהרשמה'):'';

    // Payment tag class: for included attendees use tag-muted (gray) not tag-need (red)
    const payTagClass=r._payment_included?'tag-muted':(r.payment_status==='paid'?'tag-ok':r.payment_status==='bit_request_sent'?'tag-wait':'tag-need');

    return '<div class="cockpit-card" data-id="'+r.id+'">'+
      '<div class="card-top">'+
        '<span class="card-name">'+esc(r.name)+'</span>'+
        '<span class="card-date">נרשם: '+dateStr+'</span>'+
      '</div>'+
      '<div class="card-meta">'+
        '<span class="ltr">'+esc(r.phone)+'</span>'+
        '<span>·</span>'+
        '<span>'+esc(r.edition||r.workshop||'')+'</span>'+
        seatsStr+amountStr+memberInfo+
      '</div>'+
      extraLine+
      '<div class="card-status-row">'+
        '<span class="tag tag-'+r.display_tone+'" style="font-size:.75rem;padding:3px 10px">'+esc(r.display_status)+'</span>'+
        (r._payment_included
          ? '<span class="tag tag-muted">'+esc(r.payment_label)+'</span>'
          : r.payment_status==='paid'
            ? '<span class="tag tag-ok">שולם</span>'
            : r.payment_status==='bit_request_sent'
              ? '<span class="tag tag-wait">מחכה לתשלום</span>'
              : (r.amount_ils?'<span class="tag tag-need" style="direction:ltr;unicode-bidi:isolate">₪'+r.amount_ils+'</span>':''))+
      '</div>'+
      actionBtn+
    '</div>';
  }

  async function handleCockpitAction(id,action){
    const r=state.allItems.find(x=>x.id===id);
    if(!r)return;
    if(action==='open_wa'){
      const url=waUrlWithMessage(r);
      if(url){
        window.open(url,'_blank');
      }else{
        showToast('אין מספר טלפון תקין לווטסאפ');
      }
    }else if(action==='mark_bit'){
      await callUpdate(id,{payment_status:'bit_request_sent'});
    }else if(action==='mark_paid'){
      if(!confirm('לסמן כשולם?'))return;
      await callUpdate(id,{payment_status:'paid'});
    }else if(action==='move_to_closing'){
      // Move lead to closing: set record_type=registration, registration_status=new, crm_stage=closing, seats=1
      if(!confirm('להעביר לסגירה?'))return;
      await callUpdate(id,{record_type:'registration',registration_status:'new',crm_stage:'closing',seats:1});
    }else if(action==='details'){
      openDetails(r);
    }
  }

  /* ── Render table ──────────────────────────── */
  function renderTable(items){
    const tbody=document.getElementById('table-body');
    if(!tbody)return;
    if(!items.length){
      tbody.innerHTML='<tr><td colspan="12" style="text-align:center;color:#9b9590;padding:30px">אין הרשמות</td></tr>';
      return;
    }

    tbody.innerHTML=items.map(r=>{
      const isSaving=state.savingIds.has(r.id);
      const cancelled=r.registration_status==='cancelled';
      return '<tr data-id="'+r.id+'" class="'+(cancelled?'cancelled':'')+'">'+
        '<td class="sticky-col"><div class="td-name-cell">'+
          '<div><div class="td-edit-input-wrap"><input class="td-edit-input" data-field="name" value="'+escAttr(r.name)+'" data-id="'+r.id+'">'+
          (r._is_group_member?' <span class="td-group-badge">כלול בהרשמה</span>':'')+
          '</div>'+
          '<span class="td-phone"><input class="td-edit-input" data-field="phone" value="'+escAttr(r.phone)+'" data-id="'+r.id+'" style="direction:ltr;text-align:left"></span></div>'+
        '</div></td>'+
        '<td><span style="font-size:.72rem;color:var(--text-tertiary)">'+fmtDateCompact(r.created_at)+'</span></td>'+
        '<td><input class="td-edit-input" data-field="edition" value="'+escAttr(r.edition||r.workshop||'')+'" data-id="'+r.id+'"></td>'+
        '<td><input class="td-edit-input" data-field="seats" type="number" value="'+(r.seats??1)+'" data-id="'+r.id+'" style="width:50px"></td>'+
        '<td><select class="td-edit-select" data-field="whatsapp_status" data-id="'+r.id+'">'+
          '<option value="pending"'+(r.whatsapp_status==='pending'?' selected':'')+'>לא נשלחה</option>'+
          '<option value="outreach_sent"'+(r.whatsapp_status==='outreach_sent'?' selected':'')+'>נשלחה</option>'+
          '<option value="sent"'+(r.whatsapp_status==='sent'?' selected':'')+'>נשלחה</option>'+
        '</select></td>'+
        // Payment column: for group members show badge instead of editable select
        (r._is_group_member
          ? '<td><span class="td-payment-badge tag-muted">'+esc(r.payment_label)+'</span></td>'
          : '<td><select class="td-edit-select" data-field="payment_status" data-id="'+r.id+'">'+
            '<option value="pending"'+(r.payment_status==='pending'?' selected':'')+'>לא שולם</option>'+
            '<option value="bit_request_sent"'+(r.payment_status==='bit_request_sent'?' selected':'')+'>Bit נשלח</option>'+
            '<option value="paid"'+(r.payment_status==='paid'?' selected':'')+'>שולם</option>'+
          '</select></td>')+
        '<td><select class="td-edit-select" data-field="registration_status" data-id="'+r.id+'">'+
          '<option value="new"'+(r.registration_status==='new'?' selected':'')+'>חדש</option>'+
          '<option value="confirmed"'+(r.registration_status==='confirmed'?' selected':'')+'>מאושר</option>'+
          '<option value="lead"'+(r.registration_status==='lead'?' selected':'')+'>ליד</option>'+
          '<option value="interested"'+(r.registration_status==='interested'?' selected':'')+'>מעוניין</option>'+
          '<option value="registered"'+(r.registration_status==='registered'?' selected':'')+'>נרשם</option>'+
          '<option value="needs_payment_followup"'+(r.registration_status==='needs_payment_followup'?' selected':'')+'>פולואפ תשלום</option>'+
          '<option value="not_handled"'+(r.registration_status==='not_handled'?' selected':'')+'>לא טופל</option>'+
          '<option value="group_member"'+(r.registration_status==='group_member'?' selected':'')+'>הרשמה קבוצתית</option>'+
          '<option value="registered_under_shnir"'+(r.registration_status==='registered_under_shnir'?' selected':'')+'>הרשמה קבוצתית</option>'+
          '<option value="cancelled"'+(r.registration_status==='cancelled'?' selected':'')+'>בוטל</option>'+
        '</select></td>'+
        '<td><span style="font-size:.72rem;color:var(--text-tertiary)">'+esc(r.record_type_label||'')+'</span></td>'+
        '<td><span style="font-size:.72rem;color:var(--text-tertiary)">'+esc(r.crm_stage_label||'')+'</span></td>'+
        '<td><input class="td-edit-input" data-field="source" value="'+escAttr(r.source||'')+'" data-id="'+r.id+'" style="width:80px"></td>'+
        '<td><input class="td-edit-input" data-field="notes" value="'+escAttr(r.notes||'')+'" data-id="'+r.id+'" style="width:250px"></td>'+
        '<td><button class="card-action-btn secondary" data-id="'+r.id+'" data-action="row_open" style="font-size:.7rem;padding:4px 8px">פרטים</button></td>'+
      '</tr>';
    }).join('');

    // Wire table inline edits — blur saves
    tbody.querySelectorAll('.td-edit-input,.td-edit-select').forEach(el=>{
      el.addEventListener('change',function(){
        const id=Number(this.dataset.id);
        const field=this.dataset.field;
        let value=this.value;
        if(field==='seats')value=parseInt(value,10)||1;
        callUpdate(id,{[field]:value});
      });
    });

    // Wire row click -> details
    tbody.querySelectorAll('tr').forEach(tr=>{
      tr.addEventListener('click',function(e){
        if(e.target.closest('.card-action-btn')||e.target.closest('.td-edit-input')||e.target.closest('.td-edit-select')||e.target.closest('.td-payment-badge'))return;
        const id=Number(this.dataset.id);
        const reg=state.allItems.find(r=>r.id===id);
        if(reg)openDetails(reg);
      });
    });

    // Wire "פרטים" button
    tbody.querySelectorAll('[data-action="row_open"]').forEach(btn=>{
      btn.addEventListener('click',function(e){
        e.stopPropagation();
        const id=Number(this.dataset.id);
        const reg=state.allItems.find(r=>r.id===id);
        if(reg)openDetails(reg);
      });
    });
  }

  /* ── Details panel ─────────────────────────── */
  function openDetails(reg){
    state.selectedId=reg.id;
    const panel=document.getElementById('details-panel');
    const body=document.getElementById('details-body');
    const title=document.getElementById('details-title');
    if(!panel||!body||!title)return;

    title.textContent=esc(reg.name)+' — חלונית פרטים';

    const rt=reg._record_type||clientRecordType(reg);
    const gm=reg._is_group_member||clientIsGroupMember(reg);
    const waSent=reg.whatsapp_status==='outreach_sent'||reg.whatsapp_status==='sent';

    // Resolve parent name from allItems for a friendlier display
    const parentName=gm?clientParentName(reg):null;

    // Build parent registration dropdown options (plausible parent registrations)
    const parentOptionTags=state.allItems
      .filter(p=>Number(p.id)!==Number(reg.id)&&p.registration_status!=='cancelled'&&Number(p.is_spam)!==1&&!clientIsGroupMember(p))
      .map(p=>{
        const pn=esc(p.name||'');
        const pe=esc(p.edition||p.workshop||'');
        const sel=Number(reg.parent_registration_id)===Number(p.id)?' selected':'';
        return '<option value="'+p.id+'"'+sel+'>'+pn+' · '+pe+' · #'+p.id+'</option>';
      }).join('');

    // Compute current status for prominent display
    let statusText='';
    let statusClass='';
    if(rt==='cancelled'||Number(reg.is_spam)===1){
      statusText='לא רלוונטי';
      statusClass='tag-need';
    }else if(gm){
      statusText=parentName||'כלול בהרשמה';
      statusClass='tag-muted';
    }else if(reg.whatsapp_status==='pending'){
      statusText='מחכה להודעה';
      statusClass='tag-need';
    }else if(waSent){
      statusText='הודעה נשלחה';
      statusClass='tag-ok';
    }else if(reg.whatsapp_status==='replied_interested'&&(reg.payment_status==='pending'||!reg.payment_status)){
      statusText='חזר מעוניין';
      statusClass='tag-wait';
    }else if(reg.payment_status==='bit_request_sent'){
      statusText='מחכה לתשלום';
      statusClass='tag-wait';
    }else if(reg.payment_status==='paid'){
      statusText='שולם';
      statusClass='tag-ok';
    }else{
      const crmLabel=sl('crm_stage',reg.crm_stage);
      const regLabel=sl('registration_status',reg.registration_status);
      statusText=crmLabel||regLabel||'';
      statusClass=crmLabel||regLabel?'tag-wait':'tag-muted';
    }

    body.innerHTML=
      // 1. Person + Workshop + Status (action-first header)
      '<div class=\"details-field-group details-hero\">'+
        '<div class=\"details-hero-name\">'+esc(reg.name)+'</div>'+
        '<div class=\"details-hero-meta\">'+
          '<span class=\"details-hero-workshop\">'+esc(reg.edition||reg.workshop||'—')+'</span>'+
          '<span class=\"ltr\" style=\"font-size:.85rem\">'+esc(reg.phone)+'</span>'+
        '</div>'+
        '<div class=\"details-hero-status\">'+
          '<span class=\"tag tag-'+statusClass+'\" style=\"font-size:.9rem;padding:6px 14px\">'+esc(statusText)+'</span>'+
        '</div>'+
      '</div>'+
      // 2. Editable contact/workshop details
      '<div class=\"details-field-group\">'+
        '<h3>פרטי הרשמה</h3>'+
        '<div class=\"details-field\"><span class=\"field-label\">שם</span><input class=\"details-input\" id=\"det-name\" value=\"'+escAttr(reg.name)+'\"></div>'+
        '<div class=\"details-field\"><span class=\"field-label\">טלפון</span><input class=\"details-input ltr\" id=\"det-phone\" value=\"'+escAttr(reg.phone)+'\" style=\"direction:ltr;text-align:left\"></div>'+
        '<div class=\"details-field\"><span class=\"field-label\">אימייל</span><span class=\"field-value ltr\">'+esc(reg.email||'—')+'</span></div>'+
        '<div class=\"details-field\"><span class=\"field-label\">נרשם</span><span class=\"field-value ltr\">'+(reg.created_at?fmtDate(reg.created_at):'—')+'</span></div>'+
        '<div class=\"details-field\"><span class=\"field-label\">סדנה</span><input class=\"details-input\" id=\"det-edition\" value=\"'+escAttr(reg.edition||'')+'\"></div>'+
        '<div class=\"details-field\"><span class=\"field-label\">תאריך</span><input class=\"details-input\" id=\"det-date\" value=\"'+escAttr(reg.workshop_date||reg.date||'')+'\"></div>'+
        '<div class=\"details-field\"><span class=\"field-label\">מקומות</span><input class=\"details-input\" id=\"det-seats\" type=\"number\" value=\"'+(reg.seats??1)+'\" style=\"width:70px\"></div>'+
        '<div class=\"details-field\"><span class=\"field-label\">סכום</span><span class=\"field-value ltr\">'+(reg.amount_ils!=null?'₪'+reg.amount_ils:'—')+'</span></div>'+
        (gm?'<div class=\"details-field\" style=\"grid-column:1/-1\"><span class=\"field-label\">הסבר</span><span class=\"field-value\" style=\"font-size:.75rem;color:var(--text-tertiary)\">התשלום והמקום מנוהלים דרך ההרשמה הראשית.</span></div>':'')+
        '<div class=\"details-field\"><span class=\"field-label\">מקור</span><input class=\"details-input\" id=\"det-source\" value=\"'+escAttr(reg.source||'')+'\"></div>'+
        '<div class=\"details-field\"><span class=\"field-label\">הערות</span><textarea class=\"details-textarea\" id=\"det-notes\" rows=\"3\">'+esc(reg.notes||'')+'</textarea></div>'+
      '</div>'+
      // 3. Relationship management (visible but secondary)
      '<div class=\"details-field-group\">'+
        '<h3>שיוך להרשמה</h3>'+
        '<div class=\"details-field\"><span class=\"field-label\">שייך להרשמה של</span>'+
          '<select class=\"details-select\" id=\"det-parent-registration\">'+
            '<option value=\"\">לא משויך — הרשמה עצמאית</option>'+
            parentOptionTags+
          '</select>'+
        '</div>'+
        (gm
          ? '<button class=\"details-action-btn secondary\" id=\"det-unlink-attendee\" style=\"margin-top:6px\">הפוך להרשמה עצמאית</button>'
          : '<button class=\"details-action-btn secondary\" id=\"det-convert-to-attendee\" style=\"margin-top:6px\">שייך להרשמה קיימת</button>')+
      '</div>'+
      // 4. Advanced raw statuses (collapsed by default)
      '<details class=\"details-field-group\">'+
        '<summary class=\"details-summary\"><h3 style=\"display:inline\">סטטוסים מתקדמים</h3></summary>'+
        '<div style=\"margin-top:8px\">'+
        '<div class=\"details-field\"><span class=\"field-label\">וואטסאפ</span>'+
          '<select class=\"details-select\" id=\"det-whatsapp\">'+
            '<option value=\"pending\"'+(reg.whatsapp_status==='pending'?' selected':'')+'>לא נשלחה הודעה</option>'+
            '<option value=\"outreach_sent\"'+(reg.whatsapp_status==='outreach_sent'?' selected':'')+'>נשלחה הודעה</option>'+
            '<option value=\"sent\"'+(reg.whatsapp_status==='sent'?' selected':'')+'>נשלחה</option>'+
            '<option value=\"awaiting_reply\"'+(reg.whatsapp_status==='awaiting_reply'?' selected':'')+'>ממתין לתשובה</option>'+
            '<option value=\"replied_interested\"'+(reg.whatsapp_status==='replied_interested'?' selected':'')+'>חזר מעוניין</option>'+
          '</select>'+
        '</div>'+
        (gm
          ? '<div class=\"details-field\"><span class=\"field-label\">תשלום</span><span class=\"field-value\"><span class=\"status-badge tag-muted\">'+esc(reg.payment_label)+'</span></span></div>'
          : '<div class=\"details-field\"><span class=\"field-label\">תשלום</span>'+
            '<select class=\"details-select\" id=\"det-payment\">'+
              '<option value=\"pending\"'+(reg.payment_status==='pending'?' selected':'')+'>לא שולם</option>'+
              '<option value=\"bit_request_sent\"'+(reg.payment_status==='bit_request_sent'?' selected':'')+'>Bit נשלח</option>'+
              '<option value=\"paid\"'+(reg.payment_status==='paid'?' selected':'')+'>שולם</option>'+
            '</select>'+
          '</div>')+
        '<div class=\"details-field\"><span class=\"field-label\">רישום</span>'+
          '<select class=\"details-select\" id=\"det-registration\">'+
            '<option value=\"new\"'+(reg.registration_status==='new'?' selected':'')+'>חדש</option>'+
            '<option value=\"confirmed\"'+(reg.registration_status==='confirmed'?' selected':'')+'>מאושר</option>'+
            '<option value=\"lead\"'+(reg.registration_status==='lead'?' selected':'')+'>ליד לעדכונים</option>'+
            '<option value=\"interested\"'+(reg.registration_status==='interested'?' selected':'')+'>מעוניין</option>'+
            '<option value=\"registered\"'+(reg.registration_status==='registered'?' selected':'')+'>נרשם</option>'+
            '<option value=\"needs_payment_followup\"'+(reg.registration_status==='needs_payment_followup'?' selected':'')+'>פולואפ תשלום</option>'+
            '<option value=\"not_handled\"'+(reg.registration_status==='not_handled'?' selected':'')+'>לא טופל</option>'+
            '<option value=\"group_member\"'+(reg.registration_status==='group_member'?' selected':'')+'>הרשמה קבוצתית</option>'+
            '<option value=\"registered_under_shnir\"'+(reg.registration_status==='registered_under_shnir'?' selected':'')+'>הרשמה קבוצתית</option>'+
            '<option value=\"cancelled\"'+(reg.registration_status==='cancelled'?' selected':'')+'>בוטל</option>'+
          '</select>'+
        '</div>'+
        '<div class=\"details-field\"><span class=\"field-label\">שלב CRM</span>'+
          '<select class=\"details-select\" id=\"det-crm-stage\">'+
            '<option value=\"\">—</option>'+
            '<option value=\"open\"'+(reg.crm_stage==='open'?' selected':'')+'>פתוח</option>'+
            '<option value=\"awaiting_reply\"'+(reg.crm_stage==='awaiting_reply'?' selected':'')+'>ממתין לתשובה</option>'+
            '<option value=\"interested\"'+(reg.crm_stage==='interested'?' selected':'')+'>מעוניין</option>'+
            '<option value=\"closing\"'+(reg.crm_stage==='closing'?' selected':'')+'>בסגירה</option>'+
            '<option value=\"closed\"'+(reg.crm_stage==='closed'?' selected':'')+'>סגור</option>'+
            '<option value=\"lost\"'+(reg.crm_stage==='lost'?' selected':'')+'>אבד</option>'+
          '</select>'+
        '</div>'+
        '<div class=\"details-field\"><span class=\"field-label\">סוג רשומה</span>'+
          '<select class=\"details-select\" id=\"det-record-type\">'+
            '<option value=\"\">—</option>'+
            '<option value=\"lead\"'+(reg.record_type==='lead'||rt==='lead'?' selected':'')+'>ליד</option>'+
            '<option value=\"registration\"'+(reg.record_type==='registration'||(rt==='registration'&&!reg.record_type)?' selected':'')+'>הרשמה</option>'+
            '<option value=\"attendee\"'+(reg.record_type==='attendee'||rt==='attendee'?' selected':'')+'>כלול בהרשמה</option>'+
          '</select>'+
        '</div>'+
        '</div>'+
      '</details>';

    // Actions
    const actionsEl=document.getElementById('details-actions');
    if(actionsEl){
      const isSaving=state.savingIds.has(reg.id);
      const waLink=reg.wa_phone?'https://wa.me/'+reg.wa_phone:'#';
      const _rt=rt;
      const _gm=gm;
      const waPending=reg.whatsapp_status==='pending';
      const waAlreadySent=['outreach_sent','sent','awaiting_reply','replied_interested'].includes(reg.whatsapp_status);

      let btns='';

      // Lead actions
      if(_rt==='lead'){
        if(reg.wa_phone)btns+='<div style="display:flex;gap:4px"><button class="details-action-btn secondary" id="det-wa" style="flex:1">פתח WhatsApp</button><button class="details-action-btn secondary" id="det-wa-copy" style="flex:0 0 auto;padding:10px 12px">📋</button></div>';
        if(waPending){
          btns+='<button class="details-action-btn secondary" id="det-mark-sent" '+(isSaving?'disabled':'')+'>סימנתי הודעה</button>';
        }else if(waAlreadySent){
          btns+='<span class="status-badge tag-ok" id="det-wa-sent-lead">הודעה כבר נשלחה</span>';
        }
      }

      // Lead contacted (outreach_sent/sent) — CRM actions
      if(_rt==='lead'&&waSent){
        btns+='<button class="details-action-btn secondary" id="det-mark-interested" '+(isSaving?'disabled':'')+'>חזר מעוניין</button>';
        btns+='<button class="details-action-btn secondary" id="det-keep-lead" '+(isSaving?'disabled':'')+'>השאר בלידים</button>';
        btns+='<button class="details-action-btn danger" id="det-mark-lost" '+(isSaving?'disabled':'')+'>לא רלוונטי</button>';
      }

      // Interested lead — move to closing
      if(_rt==='lead'&&(reg.registration_status==='interested'||reg.crm_stage==='interested')){
        btns+='<button class="details-action-btn secondary" id="det-move-closing" '+(isSaving?'disabled':'')+'>העבר לסגירת הרשמה</button>';
      }

      // Payment actions — only for registration rows (non-lead, non-attendee)
      if(_rt==='registration'){
        if(reg.wa_phone)btns+='<div style="display:flex;gap:4px"><button class="details-action-btn secondary" id="det-wa" style="flex:1">פתח WhatsApp</button><button class="details-action-btn secondary" id="det-wa-copy" style="flex:0 0 auto;padding:10px 12px">📋</button></div>';
        if(waPending){
          btns+='<button class="details-action-btn secondary" id="det-mark-sent" '+(isSaving?'disabled':'')+'>סימנתי הודעה</button>';
        }else if(waAlreadySent){
          btns+='<span class="status-badge tag-ok" id="det-wa-sent-badge">הודעה כבר נשלחה</span>';
        }
        btns+='<button class="details-action-btn secondary" id="det-mark-bit" '+(isSaving||reg.payment_status==='bit_request_sent'||reg.payment_status==='paid'?'disabled':'')+'>ביקשתי תשלום</button>';
        btns+='<button class="details-action-btn secondary" id="det-mark-paid" '+(isSaving||reg.payment_status==='paid'?'disabled':'')+'>סמן שולם</button>';
      }

      // Lead/registration: add to brew/espresso — sets CRM fields
      if(_rt!=='attendee'){
        btns+='<button class="details-action-btn secondary" id="det-add-espresso" '+(isSaving?'disabled':'')+'>הוסף לעדכוני אספרסו</button>';
        btns+='<button class="details-action-btn secondary" id="det-add-brew" '+(isSaving?'disabled':'')+'>הוסף לעדכוני חליטה</button>';
      }

      // Delete
      btns+='<button class="details-action-btn danger" id="det-delete">בטל הרשמה</button>';

      // Always show save button at bottom
      btns+='<hr style="border:none;border-top:1px solid var(--hairline);margin:8px 0">';
      btns+='<button class="details-action-btn primary" id="det-save-all" '+(isSaving?'disabled':'')+'>שמור שינויים</button>';

      actionsEl.innerHTML=btns;
    }

    panel.classList.add('open');

    // Wire actions
    const id=reg.id;
    document.getElementById('det-wa')?.addEventListener('click',()=>{
      const r=state.allItems.find(x=>x.id===id);
      const url=r?waUrlWithMessage(r):null;
      if(url)window.open(url,'_blank');
      else if(r&&r.wa_phone)window.open('https://wa.me/'+r.wa_phone,'_blank');
    });
    document.getElementById('det-wa-copy')?.addEventListener('click',()=>{
      const r=state.allItems.find(x=>x.id===id);
      if(!r)return;
      const msg=waDraftMessage(r);
      navigator.clipboard.writeText(msg).then(()=>showToast('הודעה הועתקה ✓')).catch(()=>showToast('שגיאה בהעתקה'));
    });
    document.getElementById('det-mark-sent')?.addEventListener('click',()=>callUpdate(id,{whatsapp_status:'outreach_sent'}));
    document.getElementById('det-mark-bit')?.addEventListener('click',()=>callUpdate(id,{payment_status:'bit_request_sent'}));
    document.getElementById('det-mark-paid')?.addEventListener('click',async ()=>{
      if(!confirm('לסמן כשולם?'))return;
      await callUpdate(id,{payment_status:'paid'});
    });
    document.getElementById('det-mark-interested')?.addEventListener('click',()=>callUpdate(id,{registration_status:'interested',crm_stage:'interested',whatsapp_status:'replied_interested'}));
    document.getElementById('det-keep-lead')?.addEventListener('click',()=>callUpdate(id,{crm_stage:'awaiting_reply',whatsapp_status:'awaiting_reply'}));
    document.getElementById('det-mark-lost')?.addEventListener('click',async ()=>{
      if(!confirm('לסמן כליד לא רלוונטי?'))return;
      await callUpdate(id,{crm_stage:'lost',registration_status:'cancelled'});
    });
    document.getElementById('det-move-closing')?.addEventListener('click',async ()=>{
      if(!confirm('להעביר לסגירת עסקה?'))return;
      await callUpdate(id,{record_type:'registration',registration_status:'new',crm_stage:'closing',seats:1,payment_status:'pending'});
    });
    document.getElementById('det-add-espresso')?.addEventListener('click',async()=>{
      await callUpdate(id,{edition:'עדכונים — סדנת אספרסו',request_type:'התעניינות כללית — סדנת אספרסו',workshop:'',workshop_date:'',seats:0,amount_ils:'',registration_status:'lead',record_type:'lead',crm_stage:'awaiting_reply'});
      showToast('נוסף לעדכוני אספרסו ✓');
    });
    document.getElementById('det-add-brew')?.addEventListener('click',async()=>{
      await callUpdate(id,{edition:'עדכונים — סדנת חליטות',request_type:'התעניינות כללית — סדנת חליטות',workshop:'',workshop_date:'',seats:0,amount_ils:'',registration_status:'lead',record_type:'lead',crm_stage:'awaiting_reply'});
      showToast('נוסף לעדכוני חליטה ✓');
    });
    document.getElementById('det-save-all')?.addEventListener('click',async()=>{
      const changes={};
      const fields=[
        ['det-name','name'],
        ['det-phone','phone'],
        ['det-edition','edition'],
        ['det-date','workshop_date'],
        ['det-seats','seats'],
        ['det-source','source'],
        ['det-notes','notes'],
        ['det-whatsapp','whatsapp_status'],
        ['det-payment','payment_status'],
        ['det-registration','registration_status'],
        ['det-crm-stage','crm_stage'],
        ['det-record-type','record_type'],
        ['det-parent-registration','parent_registration_id'],
      ];
      let changed=false;
      for(const[elId,field]of fields){
        const el=document.getElementById(elId);
        if(!el)continue;
        let val=el.value;
        if(field==='seats')val=parseInt(val,10)||0;
        if(field==='parent_registration_id')val=(val===''?null:(parseInt(val,10)||null));
        if(val==='')val=null;
        const cur=reg[field]??null;
        if(val!==cur){
          changes[field]=val;
          changed=true;
        }
      }
      if(!changed){
        showToast('אין שינויים לשמור');
        return;
      }

      // Product shortcut: choosing a parent + saving should be enough.
      // Dror should not need to understand the internal record_type/status fields.
      const nextRecordType=(changes.record_type!==undefined?changes.record_type:(reg.record_type||rt));
      const nextParent=(changes.parent_registration_id!==undefined?changes.parent_registration_id:(reg.parent_registration_id??null));
      if(!gm&&(nextRecordType==='attendee'||nextParent)){
        if(!nextParent){
          showToast('נא לבחור הרשמה ראשית מהרשימה');
          return;
        }
        await callUpdate(id,{
          record_type:'attendee',
          registration_status:'group_member',
          parent_registration_id:Number(nextParent),
          seats:0,
          amount_ils:null,
          payment_status:'pending',
          crm_stage:'closed'
        });
        return;
      }
      if(gm&&(nextRecordType==='registration'||nextParent===null)){
        const current=state.allItems.find(x=>x.id===id);
        const keepAmount=current&&current.amount_ils!=null?current.amount_ils:null;
        await callUpdate(id,{
          record_type:'registration',
          registration_status:'new',
          parent_registration_id:null,
          crm_stage:null,
          seats:1,
          payment_status:'pending',
          amount_ils:keepAmount
        });
        return;
      }

      await callUpdate(id,changes);
    });
    // Convert to attendee: link to selected parent registration
    document.getElementById('det-convert-to-attendee')?.addEventListener('click',async()=>{
      const parentSel=document.getElementById('det-parent-registration');
      const parentId=parentSel?parentSel.value:null;
      if(!parentId||parentId===''){
        showToast('נא לבחור הרשמה ראשית מהרשימה');
        return;
      }
      await callUpdate(id,{
        record_type:'attendee',
        registration_status:'group_member',
        parent_registration_id:Number(parentId),
        seats:0,
        amount_ils:null,
        payment_status:'pending',
        crm_stage:'closed'
      });
    });
    // Unlink attendee: detach from parent, revert to independent registration
    document.getElementById('det-unlink-attendee')?.addEventListener('click',async()=>{
      if(!confirm('לנתק מההרשמה הראשית? ההרשמה תהפוך לעצמאית.'))return;
      const current=state.allItems.find(x=>x.id===id);
      const keepAmount=current&&current.amount_ils!=null?current.amount_ils:null;
      await callUpdate(id,{
        record_type:'registration',
        registration_status:'new',
        parent_registration_id:null,
        crm_stage:null,
        seats:1,
        payment_status:'pending',
        amount_ils:keepAmount
      });
    });
    document.getElementById('det-delete')?.addEventListener('click',()=>{
      const note=prompt('סיבת ביטול (אופציונלי):');
      callDelete(id,note||'בוטל מהאדמין');
    });
    document.getElementById('details-close')?.addEventListener('click',closeDetails);
    document.getElementById('details-overlay')?.addEventListener('click',closeDetails);
  }

  function closeDetails(){
    const panel=document.getElementById('details-panel');
    if(panel)panel.classList.remove('open');
    state.selectedId=null;
  }

  function refreshOpenDetails(){
    if(!state.selectedId)return;
    const fresh=state.allItems.find(r=>r.id===state.selectedId);
    if(fresh)openDetails(fresh);
  }

  /* ── Escape ────────────────────────────────── */
  document.addEventListener('keydown',function(e){
    if(e.key==='Escape')closeDetails();
  });

  /* ── Render all ────────────────────────────── */
  function renderAll(){
    const filtered=applyFilters(state.allItems);
    renderKPI(filtered);
    renderCapacitySummary();
    renderCockpit(filtered);
    renderTable(filtered);
    // Update last refresh time
    const el=document.getElementById('lastRefresh');
    if(el&&state.lastRefresh){
      el.textContent='עודכן: '+state.lastRefresh.toLocaleTimeString('he-IL',{hour:'2-digit',minute:'2-digit'});
    }
    // Update tab visibility
    document.getElementById('cockpit-view')?.classList.toggle('v-hide',state.activeTab!=='cockpit');
    document.getElementById('table-view')?.classList.toggle('v-hide',state.activeTab!=='table');
  }

  /* ── Init ──────────────────────────────────── */
  function init(){
    wireFilters();
    wireTabs();
    fetchData();
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',init);
  }else{
    init();
  }
})();
`;
