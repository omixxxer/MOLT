# Molt — Armario virtual

Armario virtual *local-first*: catalogas tus prendas con una foto, generas outfits según la ocasión y el tiempo, y preparas la maleta de un viaje. No hay cuenta, servidor ni analítica: prendas, fotos y outfits se guardan en el navegador (IndexedDB), y el análisis de las fotos se hace en el propio dispositivo con un modelo de IA propio.

> **Licencia:** software propietario, todos los derechos reservados. Ver [LICENSE](LICENSE) y [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Funcionalidades

### Armario
- Galería de tarjetas con búsqueda (nombre, marca, color, código…) siempre a mano y filtros por categoría con su número de prendas; carga 40 prendas por tanda y solo lee de la base las miniaturas de las prendas que muestra. Si hay un lote de fotos en curso, un aviso lleva de vuelta a él.
- Hasta 4 fotos por prenda (JPG, PNG o WebP de hasta 25 MB cada una), con portada elegible y miniaturas locales de 640 px como máximo.
- **Fotos reducidas al guardar:** se guardan a 2048 px por lado como máximo, en JPEG al 85 % (las transparencias, sobre blanco). Una foto de móvil de 12 MP pasa de ~3 MB a ~0,3 MB, así que 1.000 prendas ocupan unos 0,7 GB en lugar de unos 4,6 GB. Las fotos que ya miden 2048 px o menos y pesan menos de 1 MB se guardan tal cual. El análisis se hace antes, con la foto original. Las fotos guardadas antes de este cambio no se reducen.
- **Código único por prenda** según su tipo, como `SDC-002` (sudadera con capucha nº 2) o `VAQ-001`, para distinguir prendas parecidas. No cambia al editar la prenda y no se reutiliza al borrarla.
- **Hacer la foto en el momento:** en móviles y tabletas, «Hacer foto» abre la cámara del dispositivo, para la prenda, la etiqueta o un look. La foto se usa igual que una elegida del carrete.
- **Añadir prenda:** pestañas para una prenda, varias o desde un look. Con una prenda, primero solo se pide la foto; después se ven la foto en grande, lo que Molt cree que es, los datos principales y, plegados con su resumen, «Uso» y «Notas».
- Detalle de cada prenda con sus fotos, la foto de la etiqueta, los atributos y la procedencia del análisis; edición y borrado. Las fotos originales se leen al abrir el detalle, no antes.

### Catalogación automática
Al añadir o cambiar fotos, la app propone los campos y marca cada uno como **Sugerido** hasta que lo revisas:
- **Categoría, subcategoría y estampado** con el modelo propio de Molt, combinando todas las fotos de la prenda, más tres alternativas para elegir con un toque. Informa también de la manga y del corte del pantalón.
- **Confianza calibrada:** un 80 % acierta aproximadamente 8 de cada 10 veces.
- **Fondo quitado:** la foto principal se recorta sobre fondo transparente y la galería, el detalle y los outfits muestran el recorte; se puede volver a la original con «Ver con fondo». Si el recorte no es fiable, se guarda la foto original.
- **Color** medido solo sobre la prenda y nombrado con la paleta completa (incluidos rosa, amarillo y azul marino; hasta tres colores).
- **Marca** si aparece escrita en la prenda (lengüeta, talón, pecho).
- **Foto de la etiqueta** en un campo propio: de ella se leen marca, talla y composición. Cada foto de etiqueta nueva (o «Cambiar») sustituye esos campos por lo que lee, aunque se hubieran escrito a mano; lo que no lee se queda como estaba. Solo pasa por el lector de texto, así que no altera la clasificación de la prenda.
- **Temporadas, estilo y estética** sugeridos por reglas según el tipo de prenda, la manga y la composición.
- **Nombre** propuesto con subcategoría, colores y marca (p. ej. «Camiseta blanca · Zara»).

El **estilo** es el nivel de vestir en cuatro niveles (Deportivo, Diario, Arreglado y Formal), y cada prenda marca todos los que le encajan: una camisa blanca vale de Diario a Formal y unos vaqueros, de Diario a Arreglado. La **estética** (Minimalista, Clásico, Urbano, Vintage…) es libre y opcional.

### Varias prendas a la vez
- **Añadir prenda → «¿Muchas prendas?»:** eliges o arrastras todas las fotos de golpe (el carrete entero si quieres) y Molt las analiza una a una en el dispositivo: tipo, color, texto y fondo quitado. El análisis sigue aunque cambies de pantalla, con progreso y tiempo estimado.
- **Agrupa sola las fotos de cada prenda:** las fotos hechas con menos de 40 s de diferencia (hora EXIF de la cámara), del mismo tipo y con un color principal en común son la misma prenda (delante, detrás, detalle). Las fotos de etiqueta se reconocen por su texto (composición, «made in», talla, lavado) y se unen a su prenda: de ellas salen marca, talla y composición. Un estampado con mucho texto no cuenta como etiqueta. Sin hora en la foto (capturas, fotos descargadas) cada foto es una prenda.
- **Revisión antes de guardar:** una tarjeta por prenda con el recorte, sus otras fotos y lo leído en la etiqueta. El tipo se corrige escribiendo sobre él y los colores desde una paleta; se decide cuáles añadir y si la prenda se guarda con fondo («Ver con fondo»). La pestaña **Por revisar** deja solo lo dudoso (el modelo tiene poca confianza en el tipo o falta el color), para no repasar cien tarjetas. La agrupación se arregla con «Es la misma que la anterior» y, tocando una miniatura, «Hacer principal», «Es la etiqueta» y «Es otra prenda». Una barra fija abajo muestra el progreso y guarda. Al guardar, cada prenda queda como si se hubiera añadido con el formulario (fotos reducidas, recorte, uso sugerido y registro del análisis). Si se cierra la app antes de guardar, el análisis se pierde.

### Desde un look (prototipo)
- **Añadir prenda → «¿Llevas varias prendas en una foto?»:** con una foto de cuerpo entero, Molt localiza cada prenda, la recorta y la reconoce. Revisas el tipo, marcas cuáles añadir y, si quieres, el look se guarda también como outfit usado hoy.
- La foto completa, con la cara, no se guarda: solo el recorte de cada prenda.
- Aún no detecta si una prenda ya está en el armario (duplicados) y en fotos de modelo el recorte puede incluir manos o pelo.

### Outfits
- **Estudio:** al entrar ya hay un outfit para hoy según la ocasión y el tiempo. Cada pieza se puede **fijar** (no cambia), **cambiar** por la siguiente mejor o **elegir** en un selector que muestra primero lo que mejor combina con el resto. También se puede empezar de cero y dejar que Molt complete el outfit, o crear uno desde el detalle de una prenda.
- **Motor** ([`outfitGenerator.ts`](src/outfits/outfitGenerator.ts), en el dispositivo): valora cuánto abriga cada tipo de prenda y su composición frente al tiempo o la temporada, la armonía de colores (un color protagonista, vecinos, complementarios, neutros), los estampados, si las prendas encajan con la ocasión y entre sí, tus gustos (sobre todo las prendas que han ido juntas, con menos peso cuanto más antiguo) y la rotación (descansa lo reciente y recupera lo olvidado). Busca entre todo el armario, propone outfits distintos entre sí, varía de un día a otro, lleva calzado si hay alguno que encaje, y avisa de lo que puede no funcionar («Puede darte calor», «Calzado abierto con lluvia»).
- El tiempo de la ciudad guardada se consulta solo, una vez al día, en Open-Meteo (solo se envía la ciudad); sin ciudad se usa la temporada.
- **Mis outfits:** guardados y usados, con cuántas veces y cuándo se han puesto; se pueden renombrar, volver a poner, cambiar o eliminar. Una combinación descartada no vuelve a proponerse.
- Las prendas en la lavadora quedan fuera de las propuestas y se gestionan desde el propio selector.

### Inicio e historial
- **Inicio:** al abrir la app ves la propuesta de hoy o lo que ya llevas, cómo vas en los últimos 30 días, prendas que te esperan y lo que le falta al armario. La primera vez, con el armario vacío, se abre una guía por pasos, que luego está siempre en «Cómo funciona».
- **Calendario:** lo que llevaste cada día. Se puede apuntar un outfit guardado en cualquier día pasado o quitarlo. Borrar un outfit de la lista no borra sus días.
- **Estadísticas** ([`wardrobeStats.ts`](src/stats/wardrobeStats.ts), en el dispositivo): días apuntados, prendas en uso, lo que más llevas, lo olvidado (más de 30 días o sin estrenar), coste por puesta con el precio opcional de cada prenda, categorías, colores y marcas, y huecos del armario.

### Maleta
- **Viajes guardados** en el dispositivo y en las copias de seguridad; el que está en curso o por venir se abre primero.
- Eliges destino de una lista (hay varias Valencias), fechas, tipo de viaje y cómo de ligera quieres la maleta. El **motor** ([`packingPlan.ts`](src/trips/packingPlan.ts)) reparte un outfit por día **compartiendo prendas**: cada prenda nueva en la maleta cuenta en contra, según el estilo, y hay un límite de días por prenda y de calzado y capas.
- Cada día se puede cambiar: otra opción, pieza a pieza o según el plan de ese día. Lo que editas no se toca al reajustar.
- **Lista para marcar** por tipo de prenda, con cuántos días se lleva cada una y aviso si está en la lavadora, más lo que no es ropa según el tiempo (paraguas, protector solar…), editable y copiable.
- Al volver a abrir un viaje se mira de nuevo el tiempo: si cambia, avisa de qué días y ofrece reajustar.

### Previsión del tiempo
[`openMeteo.ts`](src/weather/openMeteo.ts) es el único acceso, compartido por Inicio, Outfits y Maleta:
- **Lugares reales** con coordenadas, elegidos de una lista; solo se envía el nombre del lugar, sus coordenadas y las fechas.
- **Se viste para cómo se siente el día:** sensación térmica, con más peso de las horas de día, y el rango: un día de 10 a 22 °C pide una capa aunque la media sea templada. La lluvia cuenta solo si es probable (≥ 40 % o ≥ 1 mm), porque el código del tiempo da el peor momento del día.
- **Cualquier fecha:** la previsión llega a 16 días; más allá se usa la media de esas fechas en los dos años anteriores, marcada como tal.
- **Sin conexión:** respuestas guardadas (3 horas la previsión, 7 días las medias), última previsión si no hay red, un reintento, tiempo límite y errores que dicen qué hacer.

Datos de [Open-Meteo](https://open-meteo.com/) (CC BY 4.0). **Su API gratuita es solo para uso no comercial;** una versión de pago de Molt necesitará su plan comercial.

### Validación del generador, la maleta y el tiempo
Las pruebas ([`outfitGenerator.test.ts`](src/outfits/outfitGenerator.test.ts), [`packingPlan.test.ts`](src/trips/packingPlan.test.ts), [`openMeteo.test.ts`](src/weather/openMeteo.test.ts)) cubren:
- **Generador:** 300 armarios aleatorios y repetibles (0 a 40 prendas, una de cada cuatro sin ningún atributo, algunas en la lavadora) con ocasiones, temperaturas de -25 a 48 °C, lluvia, viento, prendas fijadas y excluidas. En cada propuesta se comprueba que se puede vestir (una prenda por tipo; arriba y abajo o una pieza), que respeta lo fijado, lo excluido, la lavadora, «Formal» y las capas, y que las puntuaciones están entre 0 y 100. Cuando no hay propuesta, siempre se explica por qué. Además: armarios de una sola combinación, solo un vestido, prendas sin atributos en todas las ocasiones y temperaturas, todo en la lavadora, -20 y 45 °C, y 2.000 prendas.
- **Maleta:** viajes de 1 a 14 días con los tres estilos de maleta, una sola combinación posible, prendas sin atributos, todo en la lavadora, días alternos de -15 y 42 °C, días más allá de la previsión (medias de años anteriores), un día editado con una prenda ya borrada y 14 días con historial de uso.
- **Open-Meteo**, con respuestas simuladas: lugar inexistente, sin red, búsqueda cancelada, respuesta ilegible, previsión que no llega a todos los días, día sin temperaturas, día sin los datos opcionales, parte del viaje guardado y la red caída, un año pasado que falla, y viajes lejanos que cruzan el 29 de febrero.

**Fallos encontrados y corregidos:**
- **Lentitud con historial.** Cada combinación (unas 1.800 por búsqueda) volvía a recorrer y fechar todas las valoraciones y los días de uso, y a normalizar los mismos textos. Ahora se resumen una vez por búsqueda. Los resultados son idénticos: se comparó con la versión anterior en 400 búsquedas y 25 viajes aleatorios con historial. Mediana en el equipo de desarrollo, en las pruebas (jsdom), con 120 prendas, 300 valoraciones y 200 días de uso; el cálculo es en el hilo principal:

  | | Antes | Después |
  |---|---|---|
  | Un outfit, sin historial | 78–80 ms | 29–31 ms |
  | Un outfit, con historial | 691–785 ms | 34–35 ms |
  | Maleta de 14 días, sin historial | 3,7–4,8 s | 1,0–1,2 s |
  | Maleta de 14 días, con historial | 25–27 s | 1,1–1,3 s |

- **Viajes lejanos que cruzan el 29 de febrero:** las medias de años anteriores pedían un día de menos (o de más) y el viaje no se podía preparar («La previsión no cubre todas las fechas»). Ahora cada año pasado se pide con el mismo número de días.
- **Respuesta ilegible del servicio:** se atribuía a la conexión («Comprueba tu conexión»); ahora dice que la respuesta no se ha podido leer.

**Límites que quedan:**
- **La maleta se calcula en un worker** ([`planner.worker.ts`](src/trips/planner.worker.ts), con [`plannerClient.ts`](src/trips/plannerClient.ts)): preparar, reajustar y «Otra opción» no bloquean la pantalla. Con 120 prendas, 300 valoraciones y 200 días de uso, un viaje de 14 días bloqueaba el hilo principal 869–921 ms en una sola tarea (escritorio, Chromium, modo desarrollo); en el worker, ninguna tarea larga y un temporizador cada 16 ms se retrasa como mucho 2 ms. Tarda lo mismo (0,8–1 s) y da el mismo resultado. Donde no hay workers se calcula como antes. No se ha medido en móvil, donde tardará más, pero ya sin congelar la pantalla.
- Cada búsqueda considera como mucho 7 partes de arriba, 7 de abajo, 7 vestidos o monos, 3 capas, 3 calzados y 2 accesorios, elegidos por cómo encajan; el resto del armario aparece al pedir más propuestas.
- Cuánto abriga una prenda se deduce de su tipo y su composición; una prenda sin tipo usa un valor medio de su categoría. Con poca ropa de abrigo a -20 °C se propone igualmente lo mejor que hay, con el aviso «Puede darte frío».
- Las puntuaciones son reglas, no un modelo validado con usuarios.
- Sin previsión, las estaciones son las del hemisferio norte.
- Más allá de 16 días se usa la media de dos años, sin probabilidad de lluvia; si una parte del viaje no se puede consultar, no se planifica el viaje con días a medias.

### Copia de seguridad y datos
El menú **Datos** del armario reúne:
- **Exportar copia del armario:** un ZIP con todas las prendas y sus fotos (incluida la de la etiqueta), los outfits guardados, las preferencias y las valoraciones. Sirve como copia de seguridad y para pasar el armario a otro navegador o dispositivo. Contiene tus fotos: guárdalo en un sitio seguro.
- **Importar copia:** lee el ZIP y, si ya tienes prendas, deja elegir entre **combinar** (añade lo que falta y, si una prenda está en los dos sitios, se queda la versión editada más recientemente) o **reemplazar** (el armario queda exactamente como la copia, con confirmación). Si un código ya lo usa otra prenda, la importada recibe uno nuevo. Una copia de una versión más reciente de la app se rechaza sin tocar nada.
- **Google Drive** (si la instalación tiene ID de cliente, ver más abajo): **Guardar en Google Drive**, **Restaurar desde Google Drive** (el mismo panel de combinar o reemplazar) y **Guardar automáticamente**, que sube la copia unos 30 s después del último cambio mientras la sesión de Google siga activa (una hora); cuando caduca, avisa y basta un toque para reconectar.
- **Exportar datos de entrenamiento:** un ZIP con las fotos y sus etiquetas normalizadas, sin nombre, marca, talla, notas ni foto de la etiqueta.

#### Copia en Google Drive
- La copia es el mismo ZIP, guardado como `molt-armario.zip` en la **carpeta oculta de la app** de tu Drive (permiso `drive.appdata`): Molt no puede ver el resto de tu Drive y el archivo no aparece entre tus archivos; lo ves (y puedes borrarlo) en Drive → Configuración → Administrar aplicaciones. Drive conserva versiones anteriores durante un tiempo.
- **Varios dispositivos:** si la copia de Drive se ha guardado desde otro dispositivo después de la última vez que este la vio, Molt no la sobrescribe: ofrece **Restaurar y combinar** o, confirmándolo, **Sobrescribir Drive**.
- **Inicio de sesión sin scripts de Google en la app:** una ventana va a la página de Google y vuelve a `/oauth/google.html`, que entrega el token a la app y se cierra. El token solo vive en memoria, dura una hora y no se guarda; en el navegador solo se recuerda si el guardado automático está activo y cuándo se guardó.

**Activarlo** (una vez, con tu cuenta de Google):
1. En [Google Cloud Console](https://console.cloud.google.com/), crea un proyecto y habilita **Google Drive API**.
2. En **Google Auth Platform → Público** (pantalla de consentimiento), tipo **Externo**, y añade tu cuenta en **Usuarios de prueba**. En **Acceso a datos**, añade el permiso `.../auth/drive.appdata`.
3. En **Clientes → Crear cliente**, tipo **Aplicación web**:
   - **Orígenes de JavaScript autorizados:** `http://localhost:5173` y `http://localhost:4173`.
   - **URI de redireccionamiento autorizados:** `http://localhost:5173/oauth/google.html` y `http://localhost:4173/oauth/google.html`.
   - Para la app publicada, añade también su origen (`https://molt.omixer.workers.dev`) y su `https://molt.omixer.workers.dev/oauth/google.html`, exacto, con `.html`.
4. Copia `.env.example` a `.env.local`, pon el ID de cliente en `VITE_GOOGLE_CLIENT_ID` y reinicia `npm run dev`. El ID de cliente no es secreto; `.env.local` está en `.gitignore`.
5. **Para que cualquiera pueda usarlo** (no solo los usuarios de prueba): en **Google Auth Platform → Público**, **Publicar app**. Hace falta un dominio propio verificado en Google Search Console: Google no acepta un subdominio de `workers.dev` como dominio autorizado. Hasta tenerlo, la app sigue en modo prueba. Como `drive.appdata` es un permiso no sensible, Google no exige verificación; sin verificar la marca, la pantalla de Google muestra el dominio en lugar del nombre y el logo de Molt. En **Marca**, la página de inicio es la dirección de la app y la política de privacidad, [`/privacidad`](public/privacidad.html). En modo prueba solo pueden entrar hasta 100 cuentas añadidas a mano, y su autorización caduca a los 7 días.

Formato de la copia (`molt-wardrobe-backup`, versión 1; se siguen leyendo las `vesta-wardrobe-backup` anteriores al cambio de nombre): `backup.json` con todos los registros, donde cada foto se sustituye por la ruta de su archivo en `photos/<id de prenda>/`, más esos archivos. Así podrá sincronizarse archivo a archivo más adelante.

## Pantallas y teclado

Revisión de Armario, Outfits y Maleta (con sus paneles, el selector de prendas, «Mis outfits», la lista de la maleta y el formulario de viaje) a 360, 768 y 1280 px, con un armario de prueba de 26 prendas, nombres largos, un outfit y un viaje. Se midió en el navegador el desbordamiento horizontal, el tamaño de cada zona táctil, lo que queda bajo la barra inferior al final de la página y dónde acaba el foco al recorrer cada pantalla con el teclado, hacia delante y hacia atrás. Problemas, de más a menos grave:

1. **Grave, corregido. El foco del teclado quedaba tapado** por la barra inferior o por la barra fija de acciones de Outfits: a 360 px, 9 controles de Outfits y 7 de Maleta (algunos del todo); a 1280 px, 3 de Maleta (hasta la mitad). Incumplía WCAG 2.2, criterio 2.4.11. Ahora la página reserva ese espacio al desplazarse hacia un elemento (`scroll-padding`), también bajo la barra de búsqueda del armario y en el panel de edición de prenda: ningún control queda tapado en los tres anchos.
2. **Media, corregido. Tabletas táctiles con tamaños de ratón:** a partir de 721 px los controles medían 30–38 px y la barra inferior 36 px, porque los tamaños para el dedo solo se aplicaban en anchos de móvil. Ahora dependen también del tipo de puntero: con el dedo, 40–44 px en cualquier ancho; con ratón, nada cambia.
3. **Media, corregido. Botones de texto de 16–18 px de alto** («Empezar de cero», «Añadir tu ciudad», «A la lavadora»): una zona invisible alrededor los lleva a 30–43 px sin mover nada ni pisar los controles vecinos.
4. **Media, corregido. Lista de la maleta:** la casilla de lo que no es ropa solo respondía sobre el texto (19 px de una fila de 44), y los botones de quitar y de cerrar medían 28 y 34 px. Ahora toda la fila marca y, con el dedo, los botones miden 40 px.
5. **Leve, se deja.** El enlace «Datos de Open-Meteo» mide 15 px de alto, pero va dentro de una frase (excepción del criterio 2.5.8).
6. **Leve, se deja.** Chips e iconos miden 40 px con el dedo: por encima del mínimo de WCAG (24 px) y por debajo de los 44 px que recomienda Apple.
7. **Leve, se deja.** A 768 px la barra de acciones de Outfits no queda fija y el contenido pasa bajo la barra inferior al desplazarse (con un desenfoque que no bloquea los toques). Al final de la página no queda nada tapado.

**Sin problemas:** ninguna pantalla desborda en horizontal en los tres anchos; las barras fijas quedan 10 px por encima de la navegación; el detalle y el selector se abren por encima de la navegación, reciben el foco y se cierran con Escape; el foco se ve al usar Tab. El gesto de deslizar en Outfits (cambiar de idea) tiene su alternativa en los botones de «Otras ideas» y en «Otra combinación», que funcionan con teclado.

**Sin revisar:** dispositivos reales (iOS Safari, Android), lectores de pantalla, horizontal en móvil, el formulario con una foto ya elegida (su barra se comprobó solo por sus medidas en CSS) y la importación de varias prendas con fotos.

## Privacidad

- Prendas, fotos, outfits y preferencias se guardan solo en IndexedDB, en tu navegador. No hay backend, inicio de sesión ni analítica.
- Los modelos (clasificador y lector de texto) se sirven desde el propio origen y se ejecutan en el dispositivo con WebAssembly: **las fotos y las predicciones no salen del navegador**.
- Conexiones externas, solo cuando las usas: **Open-Meteo** al consultar el tiempo (recibe la ciudad y sus coordenadas, nunca el inventario ni las fotos) y **Google Drive** si guardas o restauras allí la copia (recibe la copia completa, fotos incluidas, en tu propia cuenta).
- La [política de privacidad](public/privacidad.html) (`/privacidad.html`, enlazada desde la cabecera y el menú **Datos**) lo explica para quien use la app. Es una página estática, fuera de la app, y una prueba ([`privacyPage.test.ts`](src/privacyPage.test.ts)) comprueba que nombra el permiso de Drive, el archivo de la copia y cada servicio externo que permite la CSP.
- La política CSP solo permite conexiones al propio origen, a Open-Meteo (previsión, búsqueda de lugares e histórico) y a la API de Google (`www.googleapis.com`). La app no carga scripts de Google: el inicio de sesión ocurre en una ventana aparte.
- La PWA precachea la interfaz, pero no los modelos ni los datos personales. Los modelos se guardan en Cache Storage tras la primera descarga, para funcionar sin conexión.

Esto describe el diseño del código; no es una auditoría de tráfico.

**Pérdida de datos:** limpiar los datos del sitio, usar otro navegador o perfil, o la purga automática de algunos navegadores (Safari) borra o separa el armario. Con prendas guardadas, Molt pide al navegador almacenamiento persistente (el navegador puede negarlo) y, a partir de 5 prendas, recuerda hacer una copia si no hay ninguna o si la última tiene más de 14 días y el armario ha cambiado. Haz copias periódicas con **Datos → Exportar copia del armario**. IndexedDB no cifra los datos, y la copia tampoco va cifrada.

## Puesta en marcha

Requisitos: Node.js 20.19+ o 22.12+, y npm.

```sh
npm install
npm run dev        # servidor de desarrollo
npm test           # pruebas (Vitest, jsdom, fake-indexeddb)
npm run build      # comprobación de TypeScript y compilación con Vite
npm run preview    # previsualizar la compilación
```

## Despliegue en Cloudflare Workers

La app está publicada en <https://molt.omixer.workers.dev> como archivos estáticos de un Worker. Para conectar el repositorio: en el panel de Cloudflare, **Workers & Pages → Create application → GitHub**, elige este repositorio, usa `main` como rama de producción, `npm run build` para compilar y `dist` como carpeta de archivos.

- **Cabeceras:** [`public/_headers`](public/_headers) da el aislamiento que ONNX Runtime necesita para usar varios hilos. Comprueba en la consola del navegador que `crossOriginIsolated` es `true`.
- **Tamaño:** Cloudflare admite 25 MiB por archivo. `model_quantized.onnx` ocupa 24,55 MiB; `npm run build` falla con un aviso claro si un archivo pasa de ese límite ([`check-asset-size.mjs`](scripts/check-asset-size.mjs)).
- **Comprobaciones:** [GitHub Actions](.github/workflows/ci.yml) ejecuta las pruebas y la compilación en cada PR y en `main`.
- **Descarga:** Cloudflare no comprime los `.onnx`. El primer análisis descarga unos 42 MB (modelos y WebAssembly), y el primer recorte con SlimSAM, otros 14 MB. Después quedan en la caché del navegador.
- **Google Drive:** sin `VITE_GOOGLE_CLIENT_ID` en las variables de compilación del proyecto, la instalación funciona con la copia en ZIP y sin Drive. Para activarlo, añade esa variable, vuelve a desplegar y sigue los pasos de «Copia en Google Drive» con la dirección pública. Cloudflare redirige `/oauth/google.html` a `/oauth/google`, así que hay que comprobar el inicio de sesión de Google tras activarlo.
- **Open-Meteo:** su API gratuita solo cubre el uso no comercial.

## Arquitectura

React 19, TypeScript y Vite (pantallas, formulario, detalle de prenda y fondo animado cargados bajo demanda con `React.lazy`); Dexie sobre IndexedDB; PWA con `vite-plugin-pwa`; inferencia con `onnxruntime-web` (WebAssembly). La interfaz usa componentes de [React Bits](https://reactbits.dev) (MIT + Commons Clause) e iconos de Hugeicons: Pill Nav (navegación inferior), Pattern Waves (fondo, con OGL), Gradual Blur (desenfoque del contenido que pasa bajo la navegación), Lattice Loader (estados de carga, con cronómetro mientras se analizan fotos o se lee la etiqueta) y Counter (número de prendas, con cifras que ruedan). Todos respetan la preferencia de movimiento reducido del sistema. Se usan a través de [`reactBits.ts`](src/components/reactBits.ts), que les da tipos con todas las propiedades opcionales.

| Carpeta | Contenido |
|---|---|
| `src/app/` | Pantallas, navegación y estado |
| `src/components/` | Formulario y detalle de prenda, galería, generador de outfits, maleta; `garmentForm/` agrupa las piezas del formulario (fotos, etiqueta, análisis, campos, nombre sugerido y registro del análisis) |
| `src/ai/` | Clasificador ONNX, lector de texto (OCR), marcas, talla y composición, reglas de uso, color |
| `src/db/` | Base de datos Dexie, repositorio de prendas (datos, fotos y miniaturas en almacenes separados), códigos, copia de seguridad y reducción de fotos |
| `src/cloud/` | Inicio de sesión con Google, API de Drive y guardado automático |
| `src/outfits/` | Generación y puntuación de outfits |
| `src/weather/` | Cliente de Open-Meteo |
| `src/ml/` | Taxonomía compartida con el entrenamiento y exportación de datos |
| `ml/` | Entrenamiento, evaluación y exportación del modelo propio (Python) |
| `public/models/` | Modelos ONNX del clasificador y del OCR, con sus avisos de licencia |
| `bench/` | Mediciones en el navegador: lectura del armario con armarios sintéticos, clasificador y color con un conjunto etiquetado local, y revisión de colores; no se publican |

### Base de datos

La base local se llama `molt-wardrobe` y está en la versión 8. Al abrirse trae los datos de `vesta-wardrobe`, el nombre anterior de la app, en una sola transacción, y borra la antigua en un arranque posterior:

| Almacén | Índices | Contenido |
|---|---|---|
| `garments` | `id`, `category`, `name`, `updatedAt`, `&code` | Prendas: atributos, código, análisis, tamaño de la miniatura y si tienen recorte. Ningún `Blob` |
| `garmentPhotos` | `garmentId` | Fotos originales de cada prenda (principal, adicionales, etiqueta y recorte sin fondo) como `Blob` |
| `garmentThumbnails` | `garmentId` | Miniatura de cada prenda como `Blob` |
| `garmentCodeCounters` | `prefix` | Último número dado a cada prefijo de código |
| `outfits` | `id`, `createdAt`, `favorite`, `kind` | Outfits generados y manuales guardados, con historial de uso |
| `preferences` | `id` | Preferencias del generador |
| `outfitFeedback` | `id`, `type`, `createdAt` | Valoraciones que ajustan las puntuaciones |
| `trendPacks` | `id`, `version`, `publishedAt` | Reservado para tendencias (sin pantalla todavía) |
| `trips` | `id`, `startDate` | Planes de viaje guardados |

Las migraciones conservan los datos: v2 añade dimensiones a prendas antiguas; v3, el feedback; v4, el tipo de outfit; v5, los códigos de prenda (asignados por fecha de alta) y sus contadores; v6 convierte la formalidad anterior en niveles de estilo (Casual → Diario, Smart casual → Arreglado, Formal → Formal), también en las preferencias y en los outfits guardados; v7 añade los viajes; v8 saca las fotos, el recorte y la miniatura de cada prenda a `garmentPhotos` y `garmentThumbnails`, prenda a prenda, sin tocar el resto de almacenes (una prenda antigua sin miniatura conserva su foto, que se usa en su lugar). La migración v7 → v8 tiene su prueba, que parte de datos en v7, en [`src/db/database.migration.test.ts`](src/db/database.migration.test.ts).

**Qué se lee y cuándo.** Al abrir la app se lee solo `garments` (sin imágenes). Cada pantalla (Armario, Inicio, Outfits, Historial, Maleta) pide las miniaturas de las prendas que muestra, agrupadas en una sola lectura; las fotos originales se leen al abrir el detalle o editar y al exportar una copia o los datos de entrenamiento, nunca en la lista. Las URL de objeto se revocan cuando la imagen cambia o sale de la pantalla. Cambiar solo la disponibilidad de una prenda no reescribe sus fotos.

#### Medición de la lectura inicial

Con [`bench/storage.html`](bench/storage.html) (`npm run dev` y abrir `/bench/storage.html`): crea un armario sintético en una base aparte con el esquema anterior (imágenes dentro de cada prenda), mide, lo migra y vuelve a medir. Cada prenda lleva una foto de 300 kB y una miniatura de 40 kB con bytes aleatorios. Medido el 16-11-2026 en escritorio (Windows 10, Chromium 156, servidor de desarrollo), tres ejecuciones por tamaño (dos con 2.000); se da el intervalo, porque entre ejecuciones varía hasta el doble según la carga del equipo. «Lista» es la mediana de 6 lecturas, cada una con una conexión nueva.

| Prendas | Lista, antes | Lista, después | `Blob` que devuelve la lista, antes | Después | Leer 40 miniaturas, antes | Después | Migración |
|---|---|---|---|---|---|---|---|
| 100 | 11–23 ms | 1,5–4,2 ms | 200 (34,8 MB) | 0 | 4–14 ms | 7–16 ms | 0,2–0,5 s |
| 500 | 54–139 ms | 5–14 ms | 1.000 (174,1 MB) | 0 | 6–19 ms | 7–21 ms | 0,8–1,9 s |
| 2.000 | 240–361 ms | 25–61 ms | 4.000 (696,3 MB) | 0 | 9–15 ms | 6–20 ms | 7–15 s |

- **Tiempo:** en cada ejecución la lista se leyó entre 4 y 16 veces más rápido; la primera lectura con 2.000 prendas pasó de 0,6–1,8 s a 28–59 ms. Leer las miniaturas de la primera tanda cuesta lo mismo que antes.
- **Memoria:** en Chromium, leer un registro no carga los bytes de sus `Blob` (leer después los 4.000 costó 3,9–5,5 s aparte), así que antes la lista ya solo retenía referencias. El crecimiento del *heap* de JavaScript al leer la lista (`performance.memory`, de poca resolución) no pasó de 4 MB ni antes ni después: no hay diferencia medible. No se ha podido medir la memoria que ocupan los `Blob` fuera del *heap*, ni Firefox, Safari o un móvil, donde el coste de la lectura anterior puede ser distinto.
- **Límites:** la migración se hace en una sola transacción al abrir la app tras actualizar (7–15 s con 2.000 prendas en este equipo, sin indicador de progreso propio) y puede necesitar espacio para las fotos por duplicado hasta que termina. Los datos son bytes aleatorios, no JPEG reales: no se mide la decodificación de imágenes.

## Modelos de IA

### Clasificador de prendas
- **Modelo:** propio de Molt, entrenado en [`ml/`](ml/README.md). Es DINOv2 ViT-S/14 (Meta, Apache-2.0) congelado, más cabezas de categoría, subcategoría, manga, corte de pantalón y estampado, con la taxonomía de la app ([`ml/taxonomy.json`](ml/taxonomy.json)).
- **Datos:** solo con licencia que permite uso comercial (Clothing Dataset, Fashionpedia, Open Images, Unsplash, Pexels y fotos propias).
- **Formato:** un único ONNX int8 de ~25,6 MB en `public/models/vesta/`, con `vesta-model.json` (salidas, preprocesado, reglas y temperaturas de calibración).
- **Cómo combina las fotos:** promedia las probabilidades de todas las fotos, elige la categoría y busca la subcategoría solo dentro de ella; las alternativas se ordenan por P(categoría) × P(subcategoría | categoría). La app rechaza un modelo exportado con otra versión de taxonomía.
- **Calidad** (heads-v4, test de 2.987 imágenes de las fuentes de entrenamiento): categoría 92,8 %, subcategoría 80,3 % (macro-F1 0,73), manga 88,1 %, estampado 85,3 %, corte 63,4 %. El detalle por clase está en [`ml/README.md`](ml/README.md).
- **Evaluación en el navegador** (fase 5, 18-11-2026): el modelo tal como lo usa la app (ONNX int8, su preprocesado y su calibración) con las 610 fotos de la partición de test de Clothing Dataset, que no se usan para entrenar. Categoría 94,3 % (macro-F1 0,89); subcategoría 83,4 % (macro-F1 0,57: las clases con pocas fotos, como chaqueta, blusa, abrigo o top, bajan mucho la media). Por categoría (precisión / exhaustividad): superior 0,98 / 0,96 (419 fotos), inferior 0,96 / 0,95 (98), vestido o mono 0,72 / 0,80 (41), calzado 1,00 / 1,00 (22), abrigo 0,74 / 0,81 (21), accesorio 0,82 / 1,00 (9). Las confusiones más frecuentes son superior → vestido o mono (9), superior → abrigo (6), vestido → superior (5), inferior → vestido o mono (4) y abrigo → superior (4). Cómo repetirla, en [Evaluación del clasificador y del color](#evaluación-del-clasificador-y-del-color).
- **Velocidad y memoria** (Chrome 156 de escritorio con aislamiento entre orígenes, 16 hilos, Windows 10): la primera foto tarda ~3 s (carga del modelo); las siguientes, 344 ms de mediana y 619 ms el percentil 90, con la lectura de texto incluida (40 fotos; en el panel de vista previa del editor, oculto parte del tiempo, salió 844 / 1.600 ms con las 610). La página y sus *workers* ocupan 92 MB tras la primera foto y se quedan en 157 MB a partir de la 30.ª (60 fotos sin recorte). El recorte con SlimSAM sube la página a ~1.680 MB desde el primer recorte, y ahí se queda (no crece con más fotos). La inferencia corre en un *worker* de ONNX Runtime (`env.wasm.proxy`), así que la interfaz no se congela. **No se ha medido en móviles.**

### Lector de texto (OCR)
- **Modelos:** PaddleOCR PP-OCRv5 mobile (Apache-2.0), con un detector de 4,8 MB y un reconocedor de alfabeto latino de 8 MB, en `public/models/ocr/`. Tarda 1–3 s por foto, en paralelo con el clasificador.
- **Lectura:** [`src/ai/textReader.ts`](src/ai/textReader.ts) lee cada línea en la dirección del texto (etiquetas inclinadas o giradas, texto vertical en los dos sentidos) y, si el texto ocupa poco de la foto, da una segunda pasada ampliando esa zona (hasta 3×) para las letras pequeñas.
- **Marca:** [`src/ai/brands.ts`](src/ai/brands.ts) compara el texto con ~95 marcas. Admite letras separadas (N I K E) y una letra mal leída en nombres largos; los logos sin letras (el Jumpman, la «N» de New Balance) no se reconocen.
- **Talla y composición:** [`src/ai/labelParser.ts`](src/ai/labelParser.ts) extrae la talla en letras (XS–4XL, también entre marcas como «-XXL-»), en número europeo con el sistema delante o detrás («EUR 42», «42 EUR», «T. 38») o de vaquero (W32 L34), y la US, UK o MEX tal como la pone la etiqueta («38 US»), con su talla europea aproximada cuando la tabla es clara (calzado UK, mujer US/UK, pecho de hombre, cintura). Une las tablas de tallas impresas en casillas («8 | US», «41.5 | EU»), siguiendo la inclinación de la foto, y redondea a la media talla (el OCR lee a menudo «41.5» como «41.6»). Si hay varias, gana la europea; elige según la categoría: número en calzado, letra en prendas superiores. También extrae la composición en varios idiomas, traducida al español («95 % algodón, 5 % elastano»).
- **Prueba con 6 etiquetas de muestra** (camisetas, sudadera y zapatillas, solo para evaluar): talla correcta en 5 (la «L» dentro de un círculo de Nike no la detecta), composición en las 2 que la traen y marca en las 2 que la escriben.
- **Requisito:** necesita una foto cercana y con buena luz; si no, el campo se deja vacío.

### Segmentación y recorte
- **Cabeza de segmentación propia** en el mismo ONNX del clasificador (salida `segmentation`, misma pasada de DINOv2): para cada uno de los 16 × 16 trozos de la foto, fondo o tipo de prenda (superior, inferior, una pieza, abrigo, calzado, accesorio). Entrenada con las máscaras de 8.511 fotos de Fashionpedia con licencia comercial (`python -m vesta_ml.segment`). En validación (256 fotos): prenda frente a fondo IoU 0,69; mIoU por clase 0,51 (fondo 0,95, superior 0,58, inferior 0,51, una pieza 0,57, abrigo 0,57; calzado 0,16 y accesorios 0,22 son pequeños para la cuadrícula).
- **Recorte:** en fotos de producto con fondo liso, el fondo unido al borde se quita píxel a píxel si coincide con la zona que marca la cabeza (~1 s). Si no, [SlimSAM-77](public/models/sam/NOTICE.md) (Apache-2.0, 13,8 MB cuantizado, se descarga al primer recorte) dibuja el contorno a partir de puntos dentro y fuera de la prenda y se elige la máscara que mejor coincide con la zona (~5–8 s la primera vez en el equipo de desarrollo). Si el contorno no cubre la prenda o es el fondo, no se recorta.
  - **Dos maneras de pedir el contorno:** para una sola prenda se pide con pocos puntos y también con un anillo de puntos de fondo alrededor de ella, y se elige, entre las seis máscaras, la que mejor coincide con la zona. Cada manera falla en fotos distintas; pedir la segunda apenas añade tiempo, porque la foto se codifica una vez.
  - **Limpieza:** se quitan los trozos sueltos que no tocan la prenda (manchas de un estampado, polvo) y se rellenan los agujeros pequeños cerrados dentro de ella (una cremallera blanca en una sudadera oscura); los grandes, como el hueco entre un brazo y el cuerpo, se dejan.
  - **Prenda clara sobre fondo claro:** dentro de la zona de la prenda, el relleno solo quita lo casi idéntico al fondo, así una sudadera gris sobre blanco no pierde el interior. Aun así, en una chaqueta crema sobre gris claro se come hombros y mangas; cuando el interior de la prenda y el borde de la foto son claros y de color parecido, se añade el contorno de SlimSAM a lo que dejó el relleno (~10 s más en esas fotos).
  - Un primer plano (la prenda ocupa toda la foto) no se recorta: no hay fondo que quitar. Una foto que ya viene sin fondo (PNG o WebP transparente) conserva su propio contorno.
  - **Validación (nov. 2026):** 55 fotos, comparando con la versión anterior sobre el mismo análisis: 18 del armario de la vista previa, 19 propias de producto y sobre una cama, 10 de Clothing Dataset (prendas sobre suelos, baldosas, paredes) y 8 de Pexels (personas, exterior). Mejoran con claridad 13: dos que antes no se recortaban (un pantalón corto, unas Crocs), prendas que perdían medio cuerpo (un polo sobre baldosas, un abrigo en la nieve), restos de suelo o de fondo (vaqueros sobre parqué, sudaderas sobre parqué y sobre rojo), la chaqueta crema, unos zuecos con el borde de la suela moteado y tres prendas sobre la cama (un pantalón y dos sudaderas, con menos trozos sueltos). Las fotos de estudio salen igual. En el resto de las fotos sobre una colcha estampada sigue quedando parte de la colcha, porque el contorno de SlimSAM la incluye. Un filtro por color (quitar del borde lo que se parece al fondo) se probó y no mejoraba nada, así que se descartó.
  - **Límites:** las fotos de una persona llevando la prenda conservan a la persona (cabeza, manos, piernas); los accesorios pequeños fallan (en un reloj dentro de su caja se recorta el cojín); y una colcha estampada alrededor de la prenda deja restos. Para fotos propias, mejor una superficie lisa.
- **Modelos de quitar fondo evaluados y descartados (oct. 2026):** ISNet-ONNX de onnx-community es AGPL-3.0; BiRefNet-lite (MIT, 115 MB fp16) tarda 80–90 s por foto en CPU, se queda sin memoria a la segunda foto (sus convoluciones deformables) y no cabe en WebGPU (17 buffers por shader, el límite es 16). Para separar la ropa de la persona hará falta un modelo de *human parsing* con licencia comercial.
- **Hilos:** la app pide aislamiento entre orígenes (cabeceras COOP/COEP en `vite.config.ts` y [`public/_headers`](public/_headers); el service worker propio, [`src/sw.ts`](src/sw.ts), las añade a lo que sirve desde caché), así ONNX Runtime usa 4 hilos: el detector del OCR baja de 1,3 s a 0,7 s. En `npm run dev` los hilos no arrancan y se usa uno; se notan en `npm run build` + `npm run preview` y en producción. El hosting debe enviar esas cabeceras (Cloudflare las lee de `_headers`, igual que Netlify).
- **Color:** cada píxel de la prenda (máscara de la cabeza o, si existe, el recorte, sin su borde de 1–2 px, donde se mezcla con el fondo) se nombra en CIELAB ([`colors.ts`](src/ai/colors.ts)): si apenas tiene color (croma < 10) es negro, gris o blanco según su luminosidad; si no, el tono más cercano de la paleta, con varios tonos por nombre (granate es rojo; caqui y camel, beige; oliva, verde; vaquero claro, azul). Se proponen los colores que cubren al menos un 15 % de la prenda. Sin cabeza de segmentación se usa la heurística anterior del borde.
  - **Medido (18-11-2026)** con la app completa en el navegador (análisis, recorte y color) frente a la versión anterior, sobre las mismas fotos: 77 de Clothing Dataset (una de cada 8 del test; colores puestos a ojo y revisados a mano) y 29 fotos propias. Color principal acertado en Clothing Dataset: 35 → 47 de 77 (45,5 % → 61,0 %); en la mitad que no se usó para elegir los umbrales, 15 → 22 de 38 (39,5 % → 57,9 %). Algún color de la referencia entre los propuestos: 62 % → 82 %. Colores propuestos que sobran: 1,0 → 0,7 por foto. Fotos propias: principal 16 → 17 de 29. Ninguna foto de los dos conjuntos empeora en color principal ni en «algún color». La mayor parte de la mejora viene de nombrar bien los neutros: la versión anterior llamaba «Gris claro» (que no está en la paleta de la app) a casi todo lo blanco o desvaído en fotos con poca luz. Quitar el borde de la prenda solo mejoró la mitad de ajuste (colores exactos 35 % → 41 %); en la de control no cambió nada. Se probó corregir la exposición y el balance de blancos con toda la foto; mejoraba la mitad de ajuste pero no la de control, así que se descartó.

### Evaluación del clasificador y del color
Reproducible con el código de la app en el navegador ([`bench/classifier.html`](bench/classifier.html)) y un conjunto etiquetado local que no se sube al repositorio:

1. `node scripts/eval-prepare.mjs` copia las fotos de una fuente y partición del manifiesto de `ml/` (por defecto, el test de Clothing Dataset) a `public/test-photos/<nombre>/` con su `list.json`. `--colors <archivo>` añade colores de referencia; `--source vesta --split all` prepara las fotos propias, que ya traen colores.
2. `MOLT_BENCH=1 npm run build` y `npm run preview` (varios hilos, como en producción), y abrir `/bench/classifier.html?set=eval-clothing-dataset-test&auto`. Da exactitud, macro-F1, precisión y exhaustividad por clase, la matriz de confusión, la latencia (primera foto, mediana, p90) y la memoria (solo en Chrome con aislamiento entre orígenes), y deja descargar el JSON. `&colors` evalúa solo las fotos con colores (y las recorta, como el formulario), `&limit=N` acorta y `&nocut` no recorta.
3. [`bench/colors.html`](bench/colors.html)`?set=…` muestra las fotos con sus colores de referencia para revisarlos a mano y descarga el archivo corregido para `--colors`.

Los colores de referencia de las 77 fotos de Clothing Dataset están en `%LOCALAPPDATA%\vesta-ml\labels\colors-clothing-dataset-test.json`, junto a los datos de `ml/`.

### Reglas sin modelo
- **Uso:** [`src/ai/usageRules.ts`](src/ai/usageRules.ts) sugiere temporadas, estilo y estética según el tipo de prenda (plumífero → otoño e invierno; manga corta → primavera y verano; lana → sin verano; blazer → Arreglado y Formal…).

### Tiempos límite
Cada paso de los modelos (cargar o una pasada) se abandona a los 2 minutos ([`aiTimeout.ts`](src/ai/aiTimeout.ts)). ONNX Runtime no puede cancelar una pasada, así que tras un tiempo agotado los análisis fallan al momento y se pide volver a abrir la app. La descarga de un modelo no tiene límite total: solo se corta si pasan 30 s sin recibir datos.

### Límites conocidos
- El test procede de las mismas fuentes que el entrenamiento; con fotos propias solo hay 29 de referencia.
- En el formulario se analiza una prenda por foto; para varias, «Desde un look». Las oclusiones (chaqueta abierta sobre camiseta) y las fotos de modelo dan recortes con la persona (cabeza, manos, piernas).
- La agrupación automática de «Varias prendas a la vez» depende de la hora EXIF: sin ella (capturas de pantalla, fotos descargadas) cada foto es una prenda; dos prendas del mismo tipo y color fotografiadas seguidas se unen y hay que separarlas en la revisión.
- La segmentación se ha medido con fotos de Fashionpedia y la prueba de «Desde un look» se ha hecho con pocas fotos; falta probarla con selfies reales.
- El corte de pantalón «campana» aún no se aprende.
- Faltan pruebas con etiquetas reales y en móviles: ni la velocidad ni la memoria del modelo se han medido en un teléfono.
- El recorte con SlimSAM deja la página en ~1,7 GB de memoria; en móviles con poca memoria el navegador podría cerrar la pestaña. El color no propone «Multicolor», y una prenda gris clara puede salir «Blanco»: en una foto con poca luz no se distinguen.

## Hoja de ruta

- [x] Exportar e importar el armario completo (JSON + imágenes), como copia de seguridad y para cambiar de dispositivo.
- [x] Quitar el fondo de las fotos y medir el color solo sobre la prenda.
- [x] Prototipo: añadir prendas desde una foto de cuerpo entero y guardar el look.
- [ ] Validar «Desde un look» con selfies reales, detectar duplicados ("¿es esta prenda?") y registrar el look como «me lo pongo hoy».
- [x] «Me lo pongo hoy» con calendario, y estadísticas (coste por uso, prendas olvidadas, colores, marcas).
- [x] Separar metadatos e imágenes en IndexedDB y cargar miniaturas bajo demanda (la lista de 2.000 prendas pasa de 240–361 ms a 25–61 ms en escritorio).
- [x] Copia de seguridad opcional en el Google Drive del propio usuario.
- [ ] Copia en Drive por archivos (solo las fotos que cambian) en lugar de un ZIP completo, para armarios grandes.
- [ ] Capa opcional de lenguaje natural para explicar y ordenar outfits, enviando solo texto.
- [x] Guardar los planes de viaje.
- [x] Revisar Armario, Outfits y Maleta en móvil, tableta y escritorio, con teclado (ver «Pantallas y teclado»).
- [ ] Tendencias, con una fuente fiable y fechada.
- [x] Dividir el bloque principal de JavaScript: las pantallas se cargan bajo demanda (433 kB al abrir, antes 582 kB). La inferencia (analizador de 41 kB, cargador de ONNX Runtime de 77 kB y su WebAssembly de 14,8 MB) no entra en el bloque inicial (429 kB): se pide al abrir el formulario, «Varias prendas» o «Desde un look». El service worker no precachea ni los modelos ni el WebAssembly, que se guardan en caché la primera vez que se usan.
- [x] Inferencia fuera del hilo principal, para que analizar fotos no congele la interfaz.
- [x] Validar el generador y la maleta con armarios pequeños, grandes e incompletos, tiempo extremo y fechas fuera de la previsión.
- [ ] Probar la usabilidad en móvil y escritorio, y medir la maleta en un móvil (ver «Validación del generador, la maleta y el tiempo»).

## Licencia

Copyright © 2026 Ximo Martínez. Todos los derechos reservados. Que el código sea visible no concede ninguna licencia de uso, copia, modificación ni distribución; ver [LICENSE](LICENSE). Los componentes de terceros (DINOv2, PaddleOCR, bibliotecas y datos de entrenamiento) conservan sus licencias, recogidas en [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
