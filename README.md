# GiOKri Energy Check – Lettura PDF (fase luce)

Modulo autonomo composto da `check-pdf.html`, `check-pdf.js` e `check-pdf.css`. È progettato per essere aggiunto al repository esistente senza modificare `index.html` o gli altri file dell'app attuale.

## Installazione su GitHub Pages
1. Scaricare ed estrarre lo ZIP.
2. Caricare nella cartella principale del repository i tre file `check-pdf.html`, `check-pdf.js`, `check-pdf.css` (e facoltativamente questo README).
3. Non sovrascrivere `index.html` e non modificare gli altri file dell'app.
4. Dopo la pubblicazione, aprire `https://giokrilife-bit.github.io/giokri-energy-check/check-pdf.html`.

## Funzioni incluse
- Lettura locale nel browser di PDF con testo selezionabile tramite PDF.js CDN.
- Campi modificabili per fornitore, offerta, periodo, mesi, consumo, tariffa e componenti di vendita.
- Prezzo medio vendita per kWh e quota fissa mensile calcolati dal periodo.
- Confronto indicativo con tre offerte configurate nel codice.
- Stampa del confronto o salvataggio in PDF tramite la finestra di stampa del browser.

## Dati delle offerte inseriti nella versione iniziale
- MAGIS MIA LUCE FIX SMART: 0,1652 €/kWh + 10 €/mese.
- AUDAX SICURA VERDE CASA FASCE: 0,1573 €/kWh + 15 €/mese.
- NUOVE ENERGIE SEMPLICE LUCE FIX: 0,1470 €/kWh + 12 €/mese.

Verificare le condizioni economiche aggiornate prima dell'utilizzo commerciale.

## Limiti importanti
- I PDF scansionati, composti solo da immagini, non sono letti con OCR in questa versione.
- L'estrazione automatica delle voci della bolletta è prudenziale e può non riconoscere correttamente tutti i layout dei fornitori. Verificare e correggere sempre i valori nei campi.
- Il confronto considera soltanto la vendita dell'energia (prezzo per kWh e quota fissa), non la bolletta completa.
- La proiezione annua è una semplice annualizzazione del periodo inserito; non è una previsione garantita. Per tariffe variabili, il prezzo osservato non garantisce il prezzo futuro.
- La libreria PDF.js è caricata da CDN, quindi è necessaria una connessione Internet per la lettura automatica.

## Test iniziale suggerito
Usare una bolletta elettrica reale e verificare manualmente le voci “Quota per consumi” e “Quota fissa”, limitandosi alla riga “di cui spesa per la vendita di energia elettrica”. In particolare, non sommare trasporto, oneri, imposte, IVA o altre componenti.
