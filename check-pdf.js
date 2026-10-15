/* GiOKri Energy Check - lettura PDF luce. Modulo autonomo: non modifica index.html dell'app esistente. */
(function(){
  'use strict';
  const OFFERS = [
    {name:'MAGIS MIA LUCE FIX SMART', price:0.1652, fixed:10, type:'Fissa'},
    {name:'AUDAX SICURA VERDE CASA FASCE', price:0.1573, fixed:15, type:'Fissa'},
    {name:'NUOVE ENERGIE SEMPLICE LUCE FIX', price:0.1470, fixed:12, type:'Fissa'}
  ];
  const $ = id => document.getElementById(id);
  const fileInput=$('pdfFile'), extractBtn=$('extractBtn'), clearBtn=$('clearBtn');
  let selectedFile=null, extractedText='';
  if(window.pdfjsLib){ pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; }

  function parseNumber(value){
    if(value===null||value===undefined) return NaN;
    let s=String(value).trim().replace(/\s/g,'').replace(/[€]/g,'').replace(/[^0-9,.-]/g,'');
    if(!s) return NaN;
    const comma=s.lastIndexOf(','), dot=s.lastIndexOf('.');
    if(comma>=0 && dot>=0){
      if(comma>dot) s=s.replace(/\./g,'').replace(',','.');
      else s=s.replace(/,/g,'');
    } else if(comma>=0){
      const decimals=s.length-comma-1;
      if(decimals>0 && decimals<=3) s=s.replace(/\./g,'').replace(',','.');
      else s=s.replace(/,/g,'');
    } else if(dot>=0){
      const decimals=s.length-dot-1;
      // Un solo punto seguito da 1-6 cifre è trattato come separatore decimale: 0.245420 resta 0.245420.
      if((s.match(/\./g)||[]).length>1){const parts=s.split('.');s=parts.slice(0,-1).join('')+'.'+parts[parts.length-1];}
      else if(decimals===3 && !s.startsWith('0.')) s=s.replace('.','');
    }
    return Number(s);
  }
  function euro(n){return Number.isFinite(n)?new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(n):'—';}
  function decimal(n,d=4){return Number.isFinite(n)?new Intl.NumberFormat('it-IT',{minimumFractionDigits:d,maximumFractionDigits:d}).format(n):'—';}
  function setStatus(message,kind=''){const el=$('fileStatus');el.textContent=message;el.className='status'+(kind?' '+kind:'');}
  function readField(id){return parseNumber($(id).value);}
  function getValues(){
    const consumption=readField('consumption'), months=readField('months'), energyCost=readField('energyCost'), fixedCost=readField('fixedCost');
    const unit=consumption>0?energyCost/consumption:NaN;
    const monthlyFixed=months>0?fixedCost/months:NaN;
    const periodCost=energyCost+fixedCost;
    const annual=months>0?periodCost/months*12:NaN;
    return {consumption,months,energyCost,fixedCost,unit,monthlyFixed,periodCost,annual};
  }
  function updateDerived(){const v=getValues();$('currentUnitPrice').textContent=Number.isFinite(v.unit)?euro(v.unit)+'/kWh':'—';$('currentMonthlyFixed').textContent=Number.isFinite(v.monthlyFixed)?euro(v.monthlyFixed)+'/mese':'—';$('currentAnnualCost').textContent=Number.isFinite(v.annual)?euro(v.annual):'—';}
  ['months','consumption','energyCost','fixedCost'].forEach(id=>$(id).addEventListener('input',updateDerived));

  function findAmountNear(text, labelRegex, maxChars=300){
    const lines=text.split(/\n+/).map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean);
    for(let i=0;i<lines.length;i++){
      if(labelRegex.test(lines[i])){
        const chunk=lines.slice(i,Math.min(lines.length,i+4)).join(' ');
        const match=chunk.match(/(?:€\s*)?(-?\d{1,3}(?:[. ]\d{3})*(?:[,.]\d{1,6})|-?\d+(?:[,.]\d{1,6})?)(?:\s*€)?/g);
        if(match){for(let j=match.length-1;j>=0;j--){const n=parseNumber(match[j]);if(Number.isFinite(n)&&n>=0)return n;}}
      }
    }
    // Fallback: locate a labelled phrase in flattened text and inspect a short following window.
    const flat=text.replace(/\s+/g,' '); const m=flat.match(new RegExp(labelRegex.source+'[^\\d€]{0,100}(?:€\\s*)?([0-9][0-9., ]{0,16})','i'));
    return m?parseNumber(m[1]):NaN;
  }
  function extractLabeled(text){
    // Conservative matching: all extracted values remain editable and should be checked against the bill.
    const consumption=findAmountNear(text, /consumo\s+(?:totale\s+)?(?:fatturato|del periodo)|energia elettrica prelevata|consumi fatturati/i);
    const energyCost=findAmountNear(text, /di cui spesa per la vendita di energia elettrica/i);
    // In many bills the identical label occurs for both consumption and fixed quota; try to distinguish by nearby section.
    const lines=text.split(/\n+/).map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean);
    let consumptionSale=NaN, fixedSale=NaN;
    for(let i=0;i<lines.length;i++){
      if(/di cui spesa per la vendita di energia elettrica/i.test(lines[i])){
        const chunk=lines.slice(i,Math.min(lines.length,i+3)).join(' ');
        const nums=(chunk.match(/(?:€\s*)?\d[\d., ]{0,15}/g)||[]).map(parseNumber).filter(n=>Number.isFinite(n)&&n>=0);
        const context=lines.slice(Math.max(0,i-5),i+1).join(' ').toLowerCase();
        if(/quota\s+fissa/.test(context)){if(nums.length)fixedSale=nums[nums.length-1];}
        else if(/quota\s+per\s+consumi|scontrino dell'energia|scontrino energia/.test(context)){if(nums.length)consumptionSale=nums[nums.length-1];}
      }
    }
    // Use the section-specific result when identified; avoid pretending ambiguous extraction is certain.
    return {consumption,energyCost:Number.isFinite(consumptionSale)?consumptionSale:energyCost,fixedCost:fixedSale};
  }
  async function extractPdf(file){
    if(!window.pdfjsLib) throw new Error('La libreria di lettura PDF non è stata caricata. Controlla la connessione Internet e ricarica la pagina.');
    const data=await file.arrayBuffer(); const pdf=await pdfjsLib.getDocument({data}).promise; let pages=[];
    for(let p=1;p<=pdf.numPages;p++){
      const page=await pdf.getPage(p); const content=await page.getTextContent();
      // Keep text items in approximate reading order, inserting line breaks when the vertical position changes.
      let lastY=null, line=''; const pageLines=[];
      for(const item of content.items){if(!item.str)continue;const y=item.transform?item.transform[5]:null;if(lastY!==null&&y!==null&&Math.abs(y-lastY)>3){pageLines.push(line.trim());line='';}line+=(line?' ':'')+item.str;if(y!==null)lastY=y;}
      if(line.trim())pageLines.push(line.trim()); pages.push(pageLines.join('\n'));
    }
    return pages.join('\n\n');
  }
  function guessPeriod(text){const m=text.match(/\b(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s+20\d{2}\b/i);return m?m[0].replace(/^./,c=>c.toLowerCase()):'';}
  function guessSupplier(text){const low=text.toLowerCase();if(low.includes('sinergy'))return 'Sinergy Lucegas';return '';}
  function guessOffer(text){const m=text.match(/\b\d{4}[A-Z]{1,5}-[A-Z0-9-]{2,}\b/i);return m?m[0]:'';}
  fileInput.addEventListener('change',()=>{selectedFile=fileInput.files&&fileInput.files[0]||null;extractBtn.disabled=!selectedFile;setStatus(selectedFile?`Selezionato: ${selectedFile.name}`:'Nessun file selezionato.');});
  extractBtn.addEventListener('click',async()=>{
    if(!selectedFile)return; extractBtn.disabled=true;setStatus('Lettura del PDF in corso…');
    try{
      extractedText=await extractPdf(selectedFile);const result=extractLabeled(extractedText);
      if(Number.isFinite(result.consumption))$('consumption').value=result.consumption;
      if(Number.isFinite(result.energyCost))$('energyCost').value=result.energyCost.toLocaleString('it-IT',{maximumFractionDigits:6});
      if(Number.isFinite(result.fixedCost))$('fixedCost').value=result.fixedCost.toLocaleString('it-IT',{maximumFractionDigits:6});
      const period=guessPeriod(extractedText);if(period)$('period').value=period;
      const supplier=guessSupplier(extractedText);if(supplier)$('supplier').value=supplier;
      const offer=guessOffer(extractedText);if(offer)$('offerName').value=offer;
      updateDerived();
      const found=[Number.isFinite(result.consumption),Number.isFinite(result.energyCost),Number.isFinite(result.fixedCost)].filter(Boolean).length;
      if(found===3)setStatus('Lettura completata. Verifica ogni valore confrontandolo con la bolletta.','success');
      else setStatus(`PDF letto, ma sono stati individuati automaticamente ${found} dati su 3 principali. Completa o correggi i campi manualmente.`, '');
    }catch(err){setStatus(err.message||'Non è stato possibile leggere questo PDF. Inserisci i dati manualmente.','error');}
    finally{extractBtn.disabled=!selectedFile;}
  });
  $('compareBtn').addEventListener('click',()=>{
    updateDerived();const v=getValues();const valid=v.consumption>0&&v.months>0&&v.energyCost>=0&&v.fixedCost>=0;
    const message=$('resultMessage'),body=$('offersBody');body.innerHTML='';
    if(!valid){message.textContent='Per effettuare il confronto, inserisci consumo (kWh), mesi del periodo, spesa vendita consumi e spesa vendita quota fissa. I valori devono essere numerici e non negativi.';message.className='status error';return;}
    const currentPeriod=v.periodCost,currentAnnual=v.annual;
    const rows=OFFERS.map(o=>{const period=(v.consumption*o.price)+(o.fixed*v.months);const annual=period/v.months*12;return {...o,period,annual,saving:currentAnnual-annual};});
    const best=rows.reduce((a,b)=>a.annual<b.annual?a:b);
    const currentTr=document.createElement('tr');currentTr.className='current';currentTr.innerHTML=`<td><strong>Offerta attuale</strong>${escapeHtml($('supplier').value||'Fornitore non indicato')}<br><span class="muted">${escapeHtml($('offerName').value||'Nome offerta non indicato')} · ${escapeHtml($('tariffType').value)}</span></td><td>${euro(v.unit)}/kWh</td><td>${euro(v.monthlyFixed)}/mese</td><td>${euro(currentPeriod)}</td><td>${euro(currentAnnual)}</td><td>—</td>`;body.appendChild(currentTr);
    rows.forEach(o=>{const tr=document.createElement('tr');if(o.name===best.name)tr.className='best';const cls=o.saving>=0?'saving-positive':'saving-negative';tr.innerHTML=`<td><strong>${escapeHtml(o.name)}</strong><span class="muted">Tariffa ${o.type}${o.name===best.name?' · minore stima annua':''}</span></td><td>${euro(o.price)}/kWh</td><td>${euro(o.fixed)}/mese</td><td>${euro(o.period)}</td><td>${euro(o.annual)}</td><td class="${cls}">${o.saving>=0?'+':''}${euro(o.saving)}</td>`;body.appendChild(tr);});
    message.textContent='Confronto calcolato. Le differenze sono stime sulla sola componente di vendita; un valore positivo nella colonna finale indica una possibile riduzione rispetto alla proiezione attuale.';message.className='status success';
  });
  $('printBtn').addEventListener('click',()=>window.print());
  clearBtn.addEventListener('click',()=>{fileInput.value='';selectedFile=null;extractedText='';extractBtn.disabled=true;['supplier','offerName','period','consumption','energyCost','fixedCost'].forEach(id=>$(id).value='');$('months').value='1';$('tariffType').value='variabile';setStatus('Nessun file selezionato.');$('offersBody').innerHTML='<tr><td colspan="6" class="muted">Il confronto apparirà qui.</td></tr>';$('resultMessage').textContent='Inserisci e verifica i dati, quindi seleziona “Confronta le offerte”.';$('resultMessage').className='status';updateDerived();});
  function escapeHtml(value){return String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
  updateDerived();
})();
