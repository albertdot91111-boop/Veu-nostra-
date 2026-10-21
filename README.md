# Veu Natural — lector de text i PDF en català

Aplicació web estàtica i instal·lable (PWA). No necessita backend propi ni envia el text a un servei de síntesi: utilitza `speechSynthesis` del navegador/dispositiu. L'extracció de text PDF utilitza PDF.js des d'un CDN gratuït, així que cal connexió a internet per carregar la biblioteca PDF la primera vegada. Els fitxers de l'aplicació es poden allotjar a Vercel, GitHub Pages o un allotjament estàtic equivalent.

## Funcions de la versió inicial
- Text enganxat o escrit i comptador de caràcters.
- Extracció de text de PDF amb text seleccionable (no OCR d'escanejos).
- Selector de veus disponibles al dispositiu, prioritzant el català.
- Reproducció segmentada per llegir textos llargs, pausa, reprendre i aturar.
- Control de velocitat i modes Veu ràpida / Mode podcast.
- Manifest i service worker per instal·lar-la com a PWA en allotjament HTTPS.

## Prova local
Per evitar restriccions del navegador, serveix els fitxers per HTTP local (no obris simplement `index.html` com a fitxer):

```bash
python -m http.server 8000
```

Obre `http://localhost:8000`.

## Publicació gratuïta
1. Crea un repositori a GitHub i puja tots els fitxers d'aquesta carpeta.
2. A Vercel, importa el repositori.
3. Framework preset: Other; build command buit; output directory `.` (o per defecte si detecta l'HTML estàtic).
4. Desplega i obre la URL HTTPS. Al mòbil, utilitza el menú del navegador «Instal·la aplicació» / «Afegeix a la pantalla d'inici».

## Límits coneguts
- Les veus depenen del sistema operatiu i del navegador; no es pot garantir una veu catalana natural a tots els dispositius.
- `speechSynthesis` no genera un fitxer MP3 descarregable i els navegadors poden limitar la reproducció en segon pla o quan es bloqueja la pantalla.
- Els PDF escanejats necessiten OCR, que encara no està inclòs.
- La biblioteca PDF.js es carrega des de cdnjs. La interfície pot quedar en memòria cau, però la lectura de PDF pot requerir connexió.
- El mode podcast en aquesta versió només aplica un ritme més pausat; no crea narració IA ni afegeix contingut al text.


## Integració experimental de veu neuronal Piper
La interfície inclou un botó beta que intenta carregar `@mintplex-labs/piper-tts-web` via esm.sh i generar una mostra amb un identificador de model català. Aquesta ruta és experimental: cal verificar l'identificador del model publicat, la compatibilitat del paquet amb el navegador i el rendiment del mòbil. No s'ha de considerar una integració validada fins que es provi amb el model real. La primera càrrega necessita internet per baixar biblioteca i model; després la memòria cau depèn del navegador. La generació neuronal s’ha adaptat per dividir el text en fragments d’uns 420 caràcters i generar/reproduir un fragment cada vegada, inclosos textos de fins a 100.000 caràcters. Això redueix l’ús de memòria, però no garanteix que tots els mòbils suportin sessions tan llargues; la generació pot trigar i depèn que la biblioteca/model Piper i l’identificador català funcionin correctament.


## Límit de text

La versió admet fins a 100.000 caràcters enganxats o extrets d’un PDF. Si el PDF supera el límit, s’importen els primers 100.000 caràcters. Per a textos tan llargs, utilitza la lectura estàndard del navegador; la funció Piper experimental ara intenta generar fragments consecutius de tot el text, però cal validar-la en un navegador real i amb el model català publicat.


## Selector de veus catalanes i estils

La interfície filtra les veus del dispositiu per mostrar només veus amb idioma català. El motor neuronal Piper ofereix els models catalans configurats: `ca_ES-upc_ona-medium` (Ona, qualitat mitjana) i `ca_ES-upc_pau-x_low` (Pau, veu masculina, qualitat baixa). Els estils de lectura són Natural, Podcast pausat i Estudi lent i clar. La integració neuronal és experimental i requereix provar-la al dispositiu real.
