/* GiOKri Energy Check - lettura PDF luce.
   Modulo autonomo: non modifica index.html dell'app esistente. */
(function () {
  'use strict';

  const OFFERS = [
    { name: 'MAGIS MIA LUCE FIX SMART', price: 0.1652, fixed: 10, type: 'Fissa' },
    { name: 'AUDAX SICURA VERDE CASA FASCE', price: 0.1573, fixed: 15, type: 'Fissa' },
    { name: 'NUOVE ENERGIE SEMPLICE LUCE FIX', price: 0.1470, fixed: 12, type: 'Fissa' }
  ];

  const $ = id => document.getElementById(id);
  const fileInput = $('pdfFile');
  const extractBtn = $('extractBtn');
  const clearBtn = $('clearBtn');

  let selectedFile = null;
  let extractedText = '';

  if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }

  function parseNumber(value) {
    if (value === null || value === undefined) return NaN;

    let s = String(value).trim()
      .replace(/\s/g, '')
      .replace(/[€]/g, '')
      .replace(/[^0-9,.-]/g, '');

    if (!s) return NaN;

    const comma = s.lastIndexOf(',');
    const dot = s.lastIndexOf('.');

    if (comma >= 0 && dot >= 0) {
      if (comma > dot) s = s.replace(/\./g, '').replace(',', '.');
      else s = s.replace(/,/g, '');
    } else if (comma >= 0) {
      const decimals = s.length - comma - 1;
      if (decimals > 0 && decimals <= 3) {
        s = s.replace(/\./g, '').replace(',', '.');
      } else {
        s = s.replace(/,/g, '');
      }
    } else if (dot >= 0) {
      const decimals = s.length - dot - 1;
      if ((s.match(/\./g) || []).length > 1) {
        const parts = s.split('.');
        s = parts.slice(0, -1).join('') + '.' + parts[parts.length - 1];
      } else if (decimals === 3 && !s.startsWith('0.')) {
        s = s.replace('.', '');
      }
    }

    return Number(s);
  }

  function euro(n) {
    return Number.isFinite(n)
      ? new Intl.NumberFormat('it-IT', {
          style: 'currency',
          currency: 'EUR',
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        }).format(n)
      : '—';
  }

  function decimal(n, digits = 6) {
    return Number.isFinite(n)
      ? new Intl.NumberFormat('it-IT', {
          minimumFractionDigits: digits,
          maximumFractionDigits: digits
        }).format(n)
      : '—';
  }

  function setStatus(message, kind = '') {
    const el = $('fileStatus');
    if (!el) return;
    el.textContent = message;
    el.className = 'status' + (kind ? ' ' + kind : '');
  }

  function readField(id) {
    const el = $(id);
    return el ? parseNumber(el.value) : NaN;
  }

  function getValues() {
    const consumption = readField('consumption');
    const months = readField('months');
    const energyCost = readField('energyCost');
    const fixedCost = readField('fixedCost');

    const unit = consumption > 0 ? energyCost / consumption : NaN;
    const monthlyFixed = months > 0 ? fixedCost / months : NaN;
    const periodCost = energyCost + fixedCost;
    const annual = months > 0 ? (periodCost / months) * 12 : NaN;

    return {
      consumption,
      months,
      energyCost,
      fixedCost,
      unit,
      monthlyFixed,
      periodCost,
      annual
    };
  }

  function updateDerived() {
    const v = getValues();

    $('currentUnitPrice').textContent =
      Number.isFinite(v.unit) ? decimal(v.unit, 6) + ' €/kWh' : '—';

    $('currentMonthlyFixed').textContent =
      Number.isFinite(v.monthlyFixed) ? euro(v.monthlyFixed) + '/mese' : '—';

    $('currentAnnualCost').textContent =
      Number.isFinite(v.annual) ? euro(v.annual) : '—';
  }

  ['months', 'consumption', 'energyCost', 'fixedCost'].forEach(id => {
    const el = $(id);
    if (el) el.addEventListener('input', updateDerived);
  });

  function linesOf(text) {
    return text.split(/\n+/)
      .map(s => s.replace(/\s+/g, ' ').trim())
      .filter(Boolean);
  }

  function amountAfterLabel(lines, startIndex, maxLines = 3) {
    const chunk = lines
      .slice(startIndex, Math.min(lines.length, startIndex + maxLines))
      .join(' ');

    const euroAmounts = [...chunk.matchAll(/(-?\d[\d., ]*)\s*€/g)]
      .map(m => parseNumber(m[1]))
      .filter(n => Number.isFinite(n) && n >= 0);

    if (euroAmounts.length) {
      return euroAmounts[euroAmounts.length - 1];
    }

    const nums = (chunk.match(/-?\d[\d.,]*/g) || [])
      .map(parseNumber)
      .filter(n => Number.isFinite(n) && n >= 0);

    return nums.length ? nums[nums.length - 1] : NaN;
  }

  /*
   * Estrae esclusivamente la componente di vendita.
   * Non somma rete, oneri, potenza, imposte o IVA.
   */
  
function extractLabeled(text) {
  const flat = text.replace(/\s+/g, ' ');
  let consumption = NaN;
  let energyCost = NaN;
  let fixedCost = NaN;

  // 1. Consumo fatturato: il PDF può inserire parole
  // tra "Consumi fatturati" e il valore in kWh.
  const consumptionMatch =
    flat.match(/consumi fatturati\b[^0-9]{0,120}([0-9][0-9., ]*)\s*kWh/i);

  if (consumptionMatch) {
    const value = parseNumber(consumptionMatch[1]);
    if (Number.isFinite(value) && value > 0) {
      consumption = value;
    }
  }

  // 2. Priorità al Box dell'offerta:
  // contiene direttamente gli importi delle componenti di vendita.
  const boxConsumption = flat.match(
    /di cui quota spesa consumi\s*:\s*([0-9]+(?:[.,][0-9]{1,2})?)\s*€/i
  );

  const boxFixed = flat.match(
    /di cui quota spesa fisso\s*:\s*([0-9]+(?:[.,][0-9]{1,2})?)\s*€/i
  );

  if (boxConsumption) {
    energyCost = parseNumber(boxConsumption[1]);
  }

  if (boxFixed) {
    fixedCost = parseNumber(boxFixed[1]);
  }

  // 3. Alternativa: Scontrino dell'energia.
  // Prende l'importo in euro dopo la dicitura di vendita,
  // ignorando il prezzo unitario espresso in €/kWh o €/mese.
  const saleAmounts = [
    ...flat.matchAll(
      /di cui spesa per la vendita di energia elettrica.{0,180}?([0-9][0-9., ]*)\s*€(?!\s*\/)/gi
    )
  ].map(match => parseNumber(match[1]))
   .filter(value => Number.isFinite(value) && value >= 0);

  if (!Number.isFinite(energyCost) && saleAmounts.length >= 1) {
    energyCost = saleAmounts[0];
  }

  if (!Number.isFinite(fixedCost) && saleAmounts.length >= 2) {
    fixedCost = saleAmounts[1];
  }

  return { consumption, energyCost, fixedCost };
}

  async function extractPdf(file) {
    if (!window.pdfjsLib) {
      throw new Error(
        'La libreria di lettura PDF non è stata caricata. Controlla la connessione Internet e ricarica la pagina.'
      );
    }

    const data = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data }).promise;
    const pages = [];

    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();

      let lastY = null;
      let line = '';
      const pageLines = [];

      for (const item of content.items) {
        if (!item.str) continue;

        const y = item.transform ? item.transform[5] : null;

        if (lastY !== null && y !== null && Math.abs(y - lastY) > 3) {
          if (line.trim()) pageLines.push(line.trim());
          line = '';
        }

        line += (line ? ' ' : '') + item.str;
        if (y !== null) lastY = y;
      }

      if (line.trim()) pageLines.push(line.trim());
      pages.push(pageLines.join('\n'));
    }

    return pages.join('\n\n');
  }

  function guessPeriod(text) {
    const m = text.match(
      /\b(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s+20\d{2}\b/i
    );

    return m ? m[0].replace(/^./, c => c.toLowerCase()) : '';
  }

  function guessSupplier(text) {
    const low = text.toLowerCase();
    if (low.includes('sinergy')) return 'Sinergy Lucegas';
    return '';
  }

  function guessOffer(text) {
    const m = text.match(/\b\d{4}[A-Z]{1,5}-[A-Z0-9-]{2,}\b/i);
    return m ? m[0] : '';
  }

  function guessTariffType(text) {
    const m = text.match(/tipologia\s+offerta\s*[:\-]?\s*(fissa|variabile)/i);
    if (m) return m[1].toLowerCase();

    if (/\bofferta\s+variabile\b/i.test(text)) return 'variabile';
    if (/\bofferta\s+fissa\b/i.test(text)) return 'fissa';

    return '';
  }

  fileInput.addEventListener('change', () => {
    selectedFile = fileInput.files && fileInput.files[0] || null;
    extractBtn.disabled = !selectedFile;

    setStatus(
      selectedFile ? `Selezionato: ${selectedFile.name}` : 'Nessun file selezionato.'
    );
  });

  extractBtn.addEventListener('click', async () => {
    if (!selectedFile) return;

    extractBtn.disabled = true;
    setStatus('Lettura del PDF in corso…');

    try {
      extractedText = await extractPdf(selectedFile);
      const result = extractLabeled(extractedText);

      if (Number.isFinite(result.consumption) && result.consumption > 0) {
        $('consumption').value = result.consumption;
      }

      if (Number.isFinite(result.energyCost) && result.energyCost >= 0) {
        $('energyCost').value = result.energyCost.toLocaleString('it-IT', {
          maximumFractionDigits: 6
        });
      }

      if (Number.isFinite(result.fixedCost) && result.fixedCost >= 0) {
        $('fixedCost').value = result.fixedCost.toLocaleString('it-IT', {
          maximumFractionDigits: 6
        });
      }

      const period = guessPeriod(extractedText);
      if (period) $('period').value = period;

      const supplier = guessSupplier(extractedText);
      if (supplier) $('supplier').value = supplier;

      const offer = guessOffer(extractedText);
      if (offer) $('offerName').value = offer;

      const tariffType = guessTariffType(extractedText);
      if (tariffType && $('tariffType')) {
        $('tariffType').value = tariffType;
      }

      updateDerived();

      const found = [
        Number.isFinite(result.consumption) && result.consumption > 0,
        Number.isFinite(result.energyCost) && result.energyCost >= 0,
        Number.isFinite(result.fixedCost) && result.fixedCost >= 0
      ].filter(Boolean).length;

      if (found === 3) {
        setStatus(
          'Lettura completata. Verifica ogni valore confrontandolo con la bolletta.',
          'success'
        );
      } else {
        setStatus(
          `PDF letto, ma sono stati individuati automaticamente ${found} dati su 3 principali. Completa o correggi i campi manualmente.`
        );
      }
    } catch (err) {
      setStatus(
        err.message || 'Non è stato possibile leggere questo PDF. Inserisci i dati manualmente.',
        'error'
      );
    } finally {
      extractBtn.disabled = !selectedFile;
    }
  });

  $('compareBtn').addEventListener('click', () => {
    updateDerived();

    const v = getValues();
    const valid =
      v.consumption > 0 &&
      v.months > 0 &&
      v.energyCost >= 0 &&
      v.fixedCost >= 0;

    const message = $('resultMessage');
    const body = $('offersBody');
    body.innerHTML = '';

    if (!valid) {
      message.textContent =
        'Per effettuare il confronto, inserisci consumo (kWh), mesi del periodo, spesa vendita consumi e spesa vendita quota fissa. I valori devono essere numerici e non negativi.';
      message.className = 'status error';
      return;
    }

    const currentAnnual = v.annual;

    const rows = OFFERS.map(o => {
      const period = (v.consumption * o.price) + (o.fixed * v.months);
      const annual = (period / v.months) * 12;

      return {
        ...o,
        period,
        annual,
        saving: currentAnnual - annual
      };
    });

    const best = rows.reduce((a, b) => a.annual < b.annual ? a : b);

    const currentTr = document.createElement('tr');
    currentTr.className = 'current';

    currentTr.innerHTML =
      `<td><strong>Offerta attuale</strong>${escapeHtml($('supplier').value || 'Fornitore non indicato')}<br><span class="muted">${escapeHtml($('offerName').value || 'Nome offerta non indicato')} · ${escapeHtml($('tariffType').value)}</span></td>` +
      `<td>${decimal(v.unit, 6)} €/kWh</td>` +
      `<td>${euro(v.monthlyFixed)}/mese</td>` +
      `<td>${euro(v.periodCost)}</td>` +
      `<td>${euro(currentAnnual)}</td>` +
      `<td>—</td>`;

    body.appendChild(currentTr);

    rows.forEach(o => {
      const tr = document.createElement('tr');

      if (o.name === best.name) tr.className = 'best';

      const cls = o.saving >= 0 ? 'saving-positive' : 'saving-negative';

      tr.innerHTML =
        `<td><strong>${escapeHtml(o.name)}</strong><span class="muted">Tariffa ${o.type}${o.name === best.name ? ' · minore stima annua' : ''}</span></td>` +
        `<td>${decimal(o.price, 4)} €/kWh</td>` +
        `<td>${euro(o.fixed)}/mese</td>` +
        `<td>${euro(o.period)}</td>` +
        `<td>${euro(o.annual)}</td>` +
        `<td class="${cls}">${o.saving >= 0 ? '+' : ''}${euro(o.saving)}</td>`;

      body.appendChild(tr);
    });

    message.textContent =
      'Confronto calcolato. Le differenze sono stime sulla sola componente di vendita; un valore positivo nella colonna finale indica una possibile riduzione rispetto alla proiezione attuale.';

    message.className = 'status success';
  });

  $('printBtn').addEventListener('click', () => window.print());

  clearBtn.addEventListener('click', () => {
    fileInput.value = '';
    selectedFile = null;
    extractedText = '';
    extractBtn.disabled = true;

    ['supplier', 'offerName', 'period', 'consumption', 'energyCost', 'fixedCost']
      .forEach(id => {
        const el = $(id);
        if (el) el.value = '';
      });

    $('months').value = '1';
    $('tariffType').value = 'variabile';

    setStatus('Nessun file selezionato.');

    $('offersBody').innerHTML =
      '<tr><td colspan="6" class="muted">Il confronto apparirà qui.</td></tr>';

    $('resultMessage').textContent =
      'Inserisci e verifica i dati, quindi seleziona “Confronta le offerte”.';

    $('resultMessage').className = 'status';
    updateDerived();
  });

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, ch => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[ch]));
  }

  updateDerived();
})();
