# Feed di studio (M3)

Il feed è la home dell'app: si apre su `/` e porta la materia sul telefono una scheda per schermata. Decisioni e motivi nell'[ADR 0015](../decisions/0015-feed-di-studio-m3.md); come funziona dentro in [web.md](../technical/web.md#feed-di-studio-m3).

## Primo avvio
Una schermata spiega i quattro gesti con piccole animazioni e si chiude con **Ho capito, iniziamo**. Si rivede dal foglio delle azioni (*Rivedi i gesti*) o da **Io**.

## Cosa si vede
- In alto: il **capitolo e la lezione** (un tocco apre l'elenco per saltare altrove), i **punti** della sessione, la **serie** di risposte giuste (si accende da 2 in su), l'**anello dei 5 minuti** e il pulsante **IT/EN** della scheda.
- Sotto, la **barra delle battute**: un trattino per ogni battuta della scheda, come nelle storie dei social.
- In basso, la barra **Feed · Ripasso · Libri · Io**, solo con icone (i nomi restano per i lettori di schermo; Libri è *in arrivo* e spento; Ripasso contiene anche l'Esame, vedi [review.md](review.md)).

## Le schede a battute
| Tipo | Battute |
|---|---|
| Concetto | titolo, frase chiave, poi una frase della spiegazione alla volta |
| Passo passo | titolo, frase chiave con il contesto, poi un passo alla volta con il numero grande |
| Confronto | duello *A VS B* con il titolo, frase chiave, una riga del confronto alla volta, la spiegazione alla fine |
| Codice | titolo, frase chiave, poi una frase alla volta con le righe di codice di cui parla illuminate |

Le frasi già lette restano sopra, attenuate. I termini del glossario sono evidenziati. L'etichetta in alto dice da dove viene la scheda (video, lettura, slide), il **minuto** del video quando è noto e se è **salvata**.

**Parola da indovinare**: nella frase chiave un termine è coperto da un riquadro con il punto di domanda. Si prova a ricordarlo e si tocca (il riquadro o la parte destra dello schermo) per scoprirlo: vale **2 punti**. Il termine coperto è il più lungo del glossario della scheda che compare nella frase; se non ce n'è uno, una complessità (`O(log N)`), un pezzo di codice (`cur.next`) o un numero. Sulle schede in italiano capita più spesso che manchi, perché i termini del glossario sono nella forma inglese del corso (sulle prime lezioni DSA: circa 3 schede su 4 in italiano, più di 4 su 5 in inglese).

## Gesti
| Gesto | Azione |
|---|---|
| Tocco a destra | battuta dopo (all'ultima, scheda dopo) |
| Tocco sul terzo sinistro | battuta prima (alla prima, scheda prima) |
| Scorrimento in su / in giù | scheda dopo / prima |
| Doppio tocco | salva la scheda (non la toglie: si toglie dalle azioni o da *Salvati*) |
| Tieni premuto (mezzo secondo) | foglio delle azioni |

Il tocco singolo aspetta un attimo (230 ms) per capire se arriva un secondo tocco. Da tastiera: frecce destra/sinistra o spazio per le battute, frecce su/giù per le schede, **S** salva, **A** apre le azioni. Con un lettore di schermo ogni scheda ha i pulsanti *Battuta precedente*, *Battuta successiva*, *Salva la scheda* e *Altre azioni*, invisibili finché non ricevono il fuoco.

## Foglio delle azioni
- **Salva** / **Rimuovi dai salvati**;
- **Ascolta**: la voce del dispositivo legge tutta la scheda nella sua lingua; si ferma cambiando scheda;
- **Leggi in inglese / in italiano**;
- **Guarda sul portale**: apre sul portale Epicode la parte video della scheda e dice a che minuto cercare (*cerca il minuto 4:12 nel player*); se la scheda non ha un minuto apre la lezione;
- **Fonte**: la parte da cui viene la scheda (per le slide si apre la lezione, perché le slide non hanno una pagina loro sul portale);
- **Chiedi a Claude**: in arrivo con l'assistente di studio (M6);
- **Rivedi i gesti**.

## Domande
Dopo ogni 3 schede arriva un gruppo di **fino a 3 domande** della stessa lezione: prima quelle sui concetti delle schede appena lette, poi quelle sugli altri concetti già letti nella lezione, mai su qualcosa che non si è ancora visto. In alto a destra la domanda dice la sua posizione nel gruppo (*1/3*, *2/3*, …). Alla fine della lezione arriva un ultimo gruppo con le domande rimaste sulle ultime schede. Sul corso DSA quasi tutte le domande generate (246 su 247) entrano così nel feed.
- **Vero o falso**: si trascina la carta a destra (vero) o a sinistra (falso), oppure si usano i due pulsanti.
- **Scelta multipla**: un tocco sull'opzione.

La risposta mostra subito quella giusta e la spiegazione. Una risposta giusta vale **10 punti**, più **2 per ogni risposta giusta di fila** oltre la prima (fino a +8). Da M4 ogni risposta entra nel **ripasso** del suo concetto ([review.md](review.md)).

## Sessioni da 5 minuti
L'anello in alto si riempie in 5 minuti. Passati i 5 minuti, alla scheda successiva compare il riepilogo: punti, minuti, schede viste, risposte giuste e serie migliore, e la sessione si conta tra quelle completate. **Altri 5 minuti** riparte, **Basta per ora** porta a *Io*.

## Lingua
Le schede partono nella **lingua di studio** e le domande nella **lingua delle domande** (inglese di base, perché l'esame è in inglese), scelte in *Io*. **IT/EN** in alto cambia la lingua della scheda o della domanda che si sta guardando.

## Io
- **Aspetto**: tema scuro, chiaro o automatico e uno dei 5 accenti; valgono subito e restano per le visite successive.
- **Studio**: lingua di studio, lingua delle domande, punti e serie, vibrazione, animazioni (si spengono da sole se il sistema chiede di ridurle), avanzamento automatico alla velocità di lettura, *Rivedi i gesti*.
- **I tuoi dati sul dispositivo**: *Salvati* (un tocco riapre il feed su quella scheda), punti totali, serie migliore, sessioni completate.
- **Contenuti**: Le mie lezioni, Estensione, Claude Desktop. In fondo, *Esci*.

## Cosa resta sul telefono
Punti, serie, schede salvate, posizione nel feed, preferenze e la copia della materia restano **solo su questo dispositivo** ([ADR 0003](../decisions/0003-risultati-sul-dispositivo.md)); tema e accento stanno in un cookie per colorare la pagina già al primo caricamento. Il feed riparte dall'ultima scheda vista (anche quella aperta da *Salvati*), anche dopo essere passati da *Io* o aver chiuso l'app. Si apre subito dalla copia salvata, senza aspettare la rete; intanto controlla se ci sono lezioni nuove o aggiornate e, se ci sono, le aggiunge restando sulla stessa scheda. Se la connessione manca, il feed usa la copia salvata e lo dice in alto.

## Installare l'app e usarla senza rete
EpicFeed si installa come un'app: su Android, Chrome propone *Installa app* (o dal menu ⋮ → *Aggiungi a schermata Home*); su iPhone, in Safari, *Condividi → Aggiungi alla schermata Home*. Si apre a schermo intero con la sua icona.

Alla prima apertura su un telefono la prima lezione arriva già pronta con la pagina, e il resto della materia si aggiunge da solo pochi istanti dopo. Dopo la prima apertura con la rete, l'app si apre anche **senza connessione**: mostra l'ultima materia scaricata con l'avviso *offline*, e punti, salvati e posizione funzionano come sempre. Le lezioni generate nel frattempo arrivano alla prima apertura con la rete. Dopo *Esci* la copia offline della pagina si cancella alla visita successiva con la rete.
