
/* GiOKri Energy Check - lettura PDF luce
   Versione migliorata per bollette di fornitori differenti.
   Modulo separato: non modifica index.html.
*/
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
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }

  function parseNumber(value) {
    if (value === null || value === undefined) return NaN;

    let s = String(value)
      .trim()
      .replace(/\s/g, '')
      .replace(/[€]/g, '')
      .replace(/[^0-9,.-]/g, '');

    if (!s) return NaN;

    const comma = s.lastIndexOf(',');
    const dot = s.lastIndexOf('.');

    if (comma >= 0 && dot >= 0) {
      if (comma > dot) {
        s = s.replace(/\./g, '').replace(',', '.');
      } else {
        s = s.replace(/,/g, '');
      }
    } else if (comma >= 0) {
      s = s.replace(/\./g, '').replace(',', '.');
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

    const unitEl = $('currentUnitPrice');
    const fixedEl = $('currentMonthlyFixed');
    const annualEl = $('currentAnnualCost');

    if (unitEl) {
      unitEl.textContent = Number.isFinite(v.unit)
        ? decimal(v.unit, 6) + ' €/kWh'
        : '—';
    }

    if (fixedEl) {
      fixedEl.textContent = Number.isFinite(v.monthlyFixed)
        ? euro(v.monthlyFixed) + '/mese'
        : '—';
    }

    if (annualEl) {
      annualEl.textContent = Number.isFinite(v.annual)
        ? euro(v.annual)
        : '—';
    }
  }

  ['months', 'consumption', 'energyCost', 'fixedCost'].forEach(id => {
    const el = $(id);
    if (el) el.addEventListener('input', updateDerived);
  });

  function normalizeText(text) {
    return String(text || '')
      .replace(/\u00a0/g, ' ')
      .replace(/[‐‑‒–—]/g, '-')
      .replace(/[ \t]+/g, ' ')
      .replace(/\r/g, '\n')
      .replace(/\n{3,}/g, '\n\n');
  }

  function linesOf(text) {
    return normalizeText(text)
      .split(/\n+/)
      .map(s => s.replace(/\s+/g, ' ').trim())
      .filter(Boolean);
  }

  function numberTokens(text) {
    const re = /(?:€\s*)?-?\d{1,3}(?:[. ]\d{3})*(?:,\d{1,6})|-?\d+(?:[,.]\d{1,6})?/g;
    const result = [];
    let match;

    while ((match = re.exec(text)) !== null) {
      const value = parseNumber(match[0]);

      if (Number.isFinite(value)) {
        result.push({
          value,
          raw: match[0],
          index: match.index
        });
      }
    }

    return result;
  }

  function findAmountForLabel(text, labelRegex, options = {}) {
    const lines = linesOf(text);
    const maxLines = options.maxLines || 3;
    const maxChars = options.maxChars || 260;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (!labelRegex.test(line)) continue;

      // Cerca prima sulla riga dell'etichetta.
      const sameLine = numberTokens(line);

      // Se la riga contiene un importo in euro esplicito,
      // preferisce quello invece di prezzi unitari o percentuali.
      const euroAmounts = sameLine.filter(t => {
        const before = line.slice(Math.max(0, t.index - 3), t.index);
        const after = line.slice(t.index + t.raw.length, t.index + t.raw.length + 3);
        return /€/.test(before) || /€/.test(after);
      });

      if (euroAmounts.length) {
        return euroAmounts[euroAmounts.length - 1].value;
      }

      if (sameLine.length) {
        return sameLine[sameLine.length - 1].value;
      }

      // Se l'etichetta è separata dall'importo nel PDF,
      // cerca nelle righe immediatamente successive.
      const following = lines
        .slice(i + 1, Math.min(lines.length, i + maxLines))
        .join(' ');

      const amounts = numberTokens(following);

      if (amounts.length) {
        return amounts[amounts.length - 1].value;
      }
    }

    // Ultimo tentativo: testo appiattito.
    const flat = normalizeText(text).replace(/\s+/g, ' ');
    const label = new RegExp(
      labelRegex.source + '[^\\d€]{0,' + maxChars + '}(?:€\\s*)?([0-9][0-9., ]{0,18})',
      'i'
    );

    const match = flat.match(label);
    return match ? parseNumber(match[1]) : NaN;
  }

  function extractConsumption(text) {
    const flat = normalizeText(text).replace(/\s+/g, ' ');

    const patterns = [
      /consumo\s+fatturato\s*[:\-]?\s*([0-9][0-9., ]*)\s*kWh/i,
      /consumi\s+fatturati\s*[:\-]?\s*([0-9][0-9., ]*)\s*kWh/i,
      /consumo\s+(?:totale\s+)?(?:del\s+periodo)\s*[:\-]?\s*([0-9][0-9., ]*)\s*kWh/i,
      /energia elettrica prelevata\s*[:\-]?\s*([0-9][0-9., ]*)\s*kWh/i,
      /consumo\s+del\s+periodo\s*[:\-]?\s*([0-9][0-9., ]*)\s*kWh/i,
      /totale\s+consumi\s*[:\-]?\s*([0-9][0-9., ]*)\s*kWh/i
    ];

    for (const re of patterns) {
      const m = flat.match(re);

      if (m) {
        const n = parseNumber(m[1]);

        if (Number.isFinite(n) && n > 0) return n;
      }
    }

    // Ricerca mirata nello Scontrino dell'energia.
    const lines = linesOf(text);
    let inBillSection = false;

    for (let i = 0; i < lines.length; i++) {
      if (/scontrino dell['’]energia/i.test(lines[i])) {
        inBillSection = true;
      }

      if (/box dell['’]offerta/i.test(lines[i])) {
        inBillSection = false;
      }

      if (!inBillSection) continue;

      const line = lines[i];

      if (/consumi fatturati|consumo fatturato|totale consumi/i.test(line)) {
        const windowText = lines.slice(i, i + 3).join(' ');
        const m = windowText.match(/([0-9][0-9., ]*)\s*kWh/i);

        if (m) {
          const n = parseNumber(m[1]);
          if (Number.isFinite(n) && n > 0) return n;
        }
      }
    }

    return NaN;
  }

  
function extractBoxOffer(text) {
  const flat = normalizeText(text).replace(/\s+/g, ' ');

  // Importi in formato italiano: 61,18 oppure 13,31.
  // Evita che la virgola separatrice venga incorporata nel numero.
  const number = '(\\d+(?:[.,]\\d{1,6})?)';

  const patterns = [
    new RegExp(
      'di cui\\s+consumi\\s*:\\s*€?\\s*' +
      number +
      '\\s*,?\\s*quota\\s+fissa\\s*:\\s*€?\\s*' +
      number,
      'i'
    ),
    new RegExp(
      'di cui\\s+quota\\s+spesa\\s+consumi\\s*:\\s*€?\\s*' +
      number +
      '[\\s\\S]{0,150}?di cui\\s+quota\\s+spesa\\s+fisso\\s*:\\s*€?\\s*' +
      number,
      'i'
    )
  ];

  for (const re of patterns) {
    const m = flat.match(re);

    if (m) {
      const energyCost = parseNumber(m[1]);
      const fixedCost = parseNumber(m[2]);

      if (
        Number.isFinite(energyCost) &&
        Number.isFinite(fixedCost) &&
        energyCost >= 0 &&
        fixedCost >= 0
      ) {
        return { energyCost, fixedCost };
      }
    }
  }

  return {
    energyCost: NaN,
    fixedCost: NaN
  };
}


  function extractFromBillSections(text) {
    const lines = linesOf(text);

    let energyCost = NaN;
    let fixedCost = NaN;
    let section = '';
    let inEnergyReceipt = false;

    const sellingLabel =
      /di cui spesa per la vendita di energia elettrica|di cui spesa per vendita energia elettrica|spesa per la vendita di energia elettrica/i;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (/scontrino dell['’]energia/i.test(line)) {
        inEnergyReceipt = true;
        section = '';
        continue;
      }

      if (/box dell['’]offerta/i.test(line)) {
        inEnergyReceipt = false;
        section = '';
      }

      if (!inEnergyReceipt) continue;

      // Aggiorna la sezione solo quando la voce è chiaramente riconoscibile.
      if (/quota per i?\s*consumi|quota consumi/i.test(line)) {
        section = 'consumi';
      } else if (/quota fissa/i.test(line)) {
        section = 'fissa';
      } else if (/quota potenza/i.test(line)) {
        section = 'potenza';
      }

      if (!sellingLabel.test(line)) continue;

      // Evita di attribuire la quota potenza alla quota fissa.
      if (section !== 'consumi' && section !== 'fissa') continue;

      const candidates = [line];

      // Alcuni PDF separano etichetta e importo su righe diverse.
      candidates.push(...lines.slice(i + 1, i + 3));

      const nearby = candidates.join(' ');
      const tokens = numberTokens(nearby);

      if (!tokens.length) continue;

      // Preferisce importi esplicitamente accompagnati dal simbolo euro.
      const euroValues = tokens.filter(t => {
        const before = nearby.slice(Math.max(0, t.index - 3), t.index);
        const after = nearby.slice(t.index + t.raw.length, t.index + t.raw.length + 3);
        return /€/.test(before) || /€/.test(after);
      });

      const amount = euroValues.length
        ? euroValues[euroValues.length - 1].value
        : tokens[tokens.length - 1].value;

      if (!Number.isFinite(amount) || amount < 0) continue;

      if (section === 'consumi' && !Number.isFinite(energyCost)) {
        energyCost = amount;
      } else if (section === 'fissa' && !Number.isFinite(fixedCost)) {
        fixedCost = amount;
      }
    }

    return { energyCost, fixedCost };
  }

  function extractLabeled(text) {
    let consumption = extractConsumption(text);

    // Prima scelta: Box dell'offerta.
    let box = extractBoxOffer(text);
    let energyCost = box.energyCost;
    let fixedCost = box.fixedCost;

    // Seconda scelta: voci specifiche nello Scontrino dell'energia.
    if (!Number.isFinite(energyCost) || !Number.isFinite(fixedCost)) {
      const receipt = extractFromBillSections(text);

      if (!Number.isFinite(energyCost)) {
        energyCost = receipt.energyCost;
      }

      if (!Number.isFinite(fixedCost)) {
        fixedCost = receipt.fixedCost;
      }
    }

    // Terza scelta: ricerca per etichetta, senza usare il totale bolletta.
    if (!Number.isFinite(energyCost)) {
      energyCost = findAmountForLabel(
        text,
        /di cui spesa per la vendita di energia elettrica|di cui spesa per vendita energia elettrica/i
      );
    }

    if (!Number.isFinite(fixedCost)) {
      const lines = linesOf(text);
      let inFixedSection = false;

      for (let i = 0; i < lines.length; i++) {
        if (/quota fissa/i.test(lines[i])) inFixedSection = true;
        if (/quota potenza/i.test(lines[i])) inFixedSection = false;

        if (
          inFixedSection &&
          /di cui spesa per la vendita di energia elettrica|di cui spesa per vendita energia elettrica/i.test(lines[i])
        ) {
          const amount = numberTokens(lines[i]);

          if (amount.length) {
            fixedCost = amount[amount.length - 1].value;
            break;
          }
        }
      }
    }

    return { consumption, energyCost, fixedCost };
  }

  async function extractPdf(file) {
    if (!window.pdfjsLib) {
      throw new Error(
        'La libreria PDF non è stata caricata. Controlla la connessione Internet e ricarica la pagina.'
      );
    }

    const data = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data }).promise;
    const pages = [];

    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();

      const items = content.items
        .filter(item => item.str && item.str.trim())
        .map(item => ({
          text: item.str.trim(),
          x: item.transform ? item.transform[4] : 0,
          y: item.transform ? item.transform[5] : 0
        }));

      // Raggruppa gli elementi per altezza, poi li ordina da sinistra a destra.
      // Questo riduce gli errori dovuti a colonne e riquadri PDF.
      items.sort((a, b) => {
        if (Math.abs(a.y - b.y) > 2) return b.y - a.y;
        return a.x - b.x;
      });

      const rows = [];

      for (const item of items) {
        let row = rows.find(r => Math.abs(r.y - item.y) <= 2);

        if (!row) {
          row = { y: item.y, items: [] };
          rows.push(row);
        }

        row.items.push(item);
      }

      rows.sort((a, b) => b.y - a.y);

      const pageLines = rows.map(row =>
        row.items
          .sort((a, b) => a.x - b.x)
          .map(item => item.text)
          .join(' ')
      );

      pages.push(pageLines.join('\n'));
    }

    return pages.join('\n\n');
  }

  function guessPeriod(text) {
    const months =
      'gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre';

    const m = normalizeText(text).match(
      new RegExp('\\b(' + months + ')\\s+20\\d{2}\\b', 'i')
    );

    return m ? m[0].toLowerCase() : '';
  }

  function guessSupplier(text) {
    const low = normalizeText(text).toLowerCase();

    if (/\binvolta\b/.test(low)) return 'Involta';
    if (/\bsinergy\b/.test(low)) return 'Sinergy Lucegas';
    if (/\bmagis\b/.test(low)) return 'MAGIS';
    if (/\baudax\b/.test(low)) return 'AUDAX';
    if (/nuove energie/i.test(low)) return 'NUOVE ENERGIE';

    return '';
  }

  function guessOffer(text) {
    const normalized = normalizeText(text);

    // Prova a recuperare il nome commerciale dell'offerta.
    const patterns = [
      /(?:nome\s+offerta|offerta\s+commerciale|denominazione\s+offerta)\s*[:\-]?\s*([^\n]+)/i,
      /(prezzo\s+pun\s*\+\s*spread)/i,
      /(prezzo\s+pun\s+più\s+spread)/i
    ];

    for (const re of patterns) {
      const m = normalized.match(re);

      if (m) {
        return m[1]
          .split(/\s{2,}|\s+Scadenza|\s+Data decorrenza/i)[0]
          .trim()
          .slice(0, 120);
      }
    }

    const code = normalized.match(/\b\d{4}[A-Z]{1,5}-[A-Z0-9-]{2,}\b/i);
    return code ? code[0] : '';
  }

  function guessTariffType(text) {
    const normalized = normalizeText(text);

    const m = normalized.match(
      /tipologia\s+(?:di\s+)?offerta\s*[:\-]?\s*(?:a\s+prezzo\s+)?(fissa|variabile)/i
    );

    if (m) return m[1].toLowerCase();

    if (/prezzo\s+pun|prezzo\s+variabile|offerta\s+variabile|\bspread\b/i.test(normalized)) {
      return 'variabile';
    }

    if (/prezzo\s+fisso|offerta\s+fissa/i.test(normalized)) {
      return 'fissa';
    }

    return '';
  }

  if (!fileInput || !extractBtn || !clearBtn) {
    console.error('GiOKri Energy Check: elementi HTML mancanti.');
    return;
  }

  fileInput.addEventListener('change', () => {
    selectedFile = fileInput.files && fileInput.files[0] || null;
    extractBtn.disabled = !selectedFile;

    setStatus(
      selectedFile ? 'Selezionato: ' + selectedFile.name : 'Nessun file selezionato.'
    );
  });

  extractBtn.addEventListener('click', async () => {
    if (!selectedFile) return;

    extractBtn.disabled = true;
    setStatus('Lettura del PDF in corso…');

    try {
      extractedText = await extractPdf(selectedFile);

      if (!extractedText.trim()) {
        throw new Error(
          'Non è stato trovato testo leggibile nel PDF. Potrebbe essere una scansione.'
        );
      }

      const result = extractLabeled(extractedText);

      if (Number.isFinite(result.consumption) && result.consumption > 0) {
        $('consumption').value = result.consumption;
      }

      if (Number.isFinite(result.energyCost) && result.energyCost >= 0) {
        $('energyCost').value = result.energyCost.toLocaleString('it-IT', {
          maximumFractionDigits: 6,
          useGrouping: false
        });
      }

      if (Number.isFinite(result.fixedCost) && result.fixedCost >= 0) {
        $('fixedCost').value = result.fixedCost.toLocaleString('it-IT', {
          maximumFractionDigits: 6,
          useGrouping: false
        });
      }

      const period = guessPeriod(extractedText);
      if (period && $('period')) $('period').value = period;

      const supplier = guessSupplier(extractedText);
      if (supplier && $('supplier')) $('supplier').value = supplier;

      const offer = guessOffer(extractedText);
      if (offer && $('offerName')) $('offerName').value = offer;

      const tariffType = guessTariffType(extractedText);
      if (tariffType && $('tariffType')) $('tariffType').value = tariffType;

      updateDerived();

      const found = [
        Number.isFinite(result.consumption) && result.consumption > 0,
        Number.isFinite(result.energyCost) && result.energyCost >= 0,
        Number.isFinite(result.fixedCost) && result.fixedCost >= 0
      ].filter(Boolean).length;

      if (found === 3) {
        setStatus(
          'Lettura completata. Controlla i tre valori principali confrontandoli con la bolletta.',
          'success'
        );
      } else {
        setStatus(
          'PDF letto: individuati ' + found +
          ' dati principali su 3. Verifica e completa i campi mancanti.'
        );
      }

      console.info('GiOKri Energy Check - verifica estrazione', {
        fornitore: supplier || 'non individuato',
        periodo: period || 'non individuato',
        consumo: result.consumption,
        spesaVenditaConsumi: result.energyCost,
        quotaFissaVendita: result.fixedCost
      });

    } catch (err) {
      console.error('Errore lettura PDF:', err);

      setStatus(
        err.message || 'Non è stato possibile leggere il PDF. Inserisci i dati manualmente.',
        'error'
      );
    } finally {
      extractBtn.disabled = !selectedFile;
    }
  });

  const compareBtn = $('compareBtn');

  if (compareBtn) {
    compareBtn.addEventListener('click', () => {
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
          'Inserisci consumo (kWh), mesi del periodo, spesa vendita consumi e quota fissa vendita. Verifica che i valori siano corretti.';
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
        '<td><strong>Offerta attuale</strong>' +
        escapeHtml($('supplier').value || 'Fornitore non indicato') +
        '<br><span class="muted">' +
        escapeHtml($('offerName').value || 'Nome offerta non indicato') +
        ' · ' + escapeHtml($('tariffType').value) + '</span></td>' +
        '<td>' + decimal(v.unit, 6) + ' €/kWh</td>' +
        '<td>' + euro(v.monthlyFixed) + '/mese</td>' +
        '<td>' + euro(v.periodCost) + '</td>' +
        '<td>' + euro(currentAnnual) + '</td><td>—</td>';

      body.appendChild(currentTr);

      rows.forEach(o => {
        const tr = document.createElement('tr');

        if (o.name === best.name) tr.className = 'best';

        const cls = o.saving >= 0 ? 'saving-positive' : 'saving-negative';

        tr.innerHTML =
          '<td><strong>' + escapeHtml(o.name) + '</strong>' +
          '<span class="muted">Tariffa ' + escapeHtml(o.type) +
          (o.name === best.name ? ' · minore stima annua' : '') +
          '</span></td>' +
          '<td>' + decimal(o.price, 4) + ' €/kWh</td>' +
          '<td>' + euro(o.fixed) + '/mese</td>' +
          '<td>' + euro(o.period) + '</td>' +
          '<td>' + euro(o.annual) + '</td>' +
          '<td class="' + cls + '">' +
          (o.saving >= 0 ? '+' : '') + euro(o.saving) + '</td>';

        body.appendChild(tr);
      });

      message.textContent =
        'Confronto calcolato. Sono considerate soltanto le componenti di vendita inserite. ' +
        'Il risultato è una stima, non un preventivo contrattuale. ' +
        'Un risparmio positivo indica una possibile riduzione rispetto alla proiezione attuale.';

      message.className = 'status success';
    });
  }

  const printBtn = $('printBtn');
  if (printBtn) {
    printBtn.addEventListener('click', () => window.print());
  }

  clearBtn.addEventListener('click', () => {
    fileInput.value = '';
    selectedFile = null;
    extractedText = '';
    extractBtn.disabled = true;

    [
      'supplier',
      'offerName',
      'period',
      'consumption',
      'energyCost',
      'fixedCost'
    ].forEach(id => {
      const el = $(id);
      if (el) el.value = '';
    });

    if ($('months')) $('months').value = ' ';
    if ($('tariffType')) $('tariffType').value = ' ';

    setStatus('Nessun file selezionato.');

    if ($('offersBody')) {
      $('offersBody').innerHTML =
        '<tr><td colspan="6" class="muted">Il confronto apparirà qui.</td></tr>';
    }

    if ($('resultMessage')) {
      $('resultMessage').textContent =
        'Inserisci e verifica i dati, quindi seleziona “Confronta le offerte”.';
      $('resultMessage').className = 'status';
    }

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
