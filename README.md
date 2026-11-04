# Molt — Armario virtual

Armario virtual *local-first*: catalogas tus prendas con una foto, generas outfits según la ocasión y el tiempo, y preparas la maleta de un viaje. No hay cuenta, servidor ni analítica: prendas, fotos y outfits se guardan en el navegador (IndexedDB), y el análisis de las fotos se hace en el propio dispositivo con un modelo de IA propio.

> **Licencia:** software propietario, todos los derechos reservados. Ver [LICENSE](LICENSE) y [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Funcionalidades

### Armario
- Galería de tarjetas con búsqueda (nombre, marca, color, código…) siempre a mano y filtros por categoría con su número de prendas; carga 40 prendas por tanda. Si hay un lote de fotos en curso, un aviso lleva de vuelta a él.
- Hasta 4 fotos por prenda (JPG, PNG o WebP de hasta 8 MB), con portada elegible y miniaturas locales de 640 px como máximo.
- **Fotos reducidas al guardar:** se guardan a 2048 px por lado como máximo, en JPEG al 85 % (las transparencias, sobre blanco). Una foto de móvil de 12 MP pasa de ~3 MB a ~0,3 MB, así que 1.000 prendas ocupan unos 0,7 GB en lugar de unos 4,6 GB. Las fotos que ya miden 2048 px o menos y pesan menos de 1 MB se guardan tal cual. El análisis se hace antes, con la foto original. Las fotos guardadas antes de este cambio no se reducen.
- **Código único por prenda** según su tipo, como `SDC-002` (sudadera con capucha nº 2) o `VAQ-001`, para distinguir prendas parecidas. No cambia al editar la prenda y no se reutiliza al borrarla.
- **Añadir prenda:** pestañas para una prenda, varias o desde un look. Con una prenda, primero solo se pide la foto; después se ven la foto en grande, lo que Molt cree que es, los datos principales y, plegados con su resumen, «Uso» y «Notas».
- Detalle de cada prenda con sus fotos, la foto de la etiqueta, los atributos y la procedencia del análisis; edición y borrado.

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
   - Cuando la app tenga dirección pública, añade también su origen y su `/oauth/google.html`.
4. Copia `.env.example` a `.env.local`, pon el ID de cliente en `VITE_GOOGLE_CLIENT_ID` y reinicia `npm run dev`. El ID de cliente no es secreto; `.env.local` está en `.gitignore`.

Formato de la copia (`molt-wardrobe-backup`, versión 1; se siguen leyendo las `vesta-wardrobe-backup` anteriores al cambio de nombre): `backup.json` con todos los registros, donde cada foto se sustituye por la ruta de su archivo en `photos/<id de prenda>/`, más esos archivos. Así podrá sincronizarse archivo a archivo más adelante.

## Privacidad

- Prendas, fotos, outfits y preferencias se guardan solo en IndexedDB, en tu navegador. No hay backend, inicio de sesión ni analítica.
- Los modelos (clasificador y lector de texto) se sirven desde el propio origen y se ejecutan en el dispositivo con WebAssembly: **las fotos y las predicciones no salen del navegador**.
- Conexiones externas, solo cuando las usas: **Open-Meteo** al consultar el tiempo (recibe la ciudad y sus coordenadas, nunca el inventario ni las fotos) y **Google Drive** si guardas o restauras allí la copia (recibe la copia completa, fotos incluidas, en tu propia cuenta).
- La política CSP solo permite conexiones al propio origen, a Open-Meteo (previsión, búsqueda de lugares e histórico) y a la API de Google (`www.googleapis.com`). La app no carga scripts de Google: el inicio de sesión ocurre en una ventana aparte.
- La PWA precachea la interfaz, pero no los modelos ni los datos personales. Los modelos se guardan en Cache Storage tras la primera descarga, para funcionar sin conexión.

Esto describe el diseño del código; no es una auditoría de tráfico.

**Pérdida de datos:** limpiar los datos del sitio, usar otro navegador o perfil, o la purga automática de algunos navegadores (Safari) borra o separa el armario. Haz copias periódicas con **Datos → Exportar copia del armario**. IndexedDB no cifra los datos, y la copia tampoco va cifrada.

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

La app está publicada en <https://molt.ximomartinez98.workers.dev> como archivos estáticos de un Worker. Para conectar el repositorio: en el panel de Cloudflare, **Workers & Pages → Create application → GitHub**, elige este repositorio, usa `main` como rama de producción, `npm run build` para compilar y `dist` como carpeta de archivos.

- **Cabeceras:** [`public/_headers`](public/_headers) da el aislamiento que ONNX Runtime necesita para usar varios hilos. Comprueba en la consola del navegador que `crossOriginIsolated` es `true`.
- **Tamaño:** Cloudflare admite 25 MiB por archivo. `model_quantized.onnx` ocupa 24,55 MiB; un modelo reentrenado que pase de ese límite hará fallar el despliegue.
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
| `src/db/` | Base de datos Dexie, repositorio de prendas, códigos, copia de seguridad y miniaturas |
| `src/cloud/` | Inicio de sesión con Google, API de Drive y guardado automático |
| `src/outfits/` | Generación y puntuación de outfits |
| `src/weather/` | Cliente de Open-Meteo |
| `src/ml/` | Taxonomía compartida con el entrenamiento y exportación de datos |
| `ml/` | Entrenamiento, evaluación y exportación del modelo propio (Python) |
| `public/models/` | Modelos ONNX del clasificador y del OCR, con sus avisos de licencia |

### Base de datos

La base local se llama `molt-wardrobe` y está en la versión 7. Al abrirse trae los datos de `vesta-wardrobe`, el nombre anterior de la app, en una sola transacción, y borra la antigua en un arranque posterior:

| Almacén | Índices | Contenido |
|---|---|---|
| `garments` | `id`, `category`, `name`, `updatedAt`, `&code` | Prendas con atributos, código, fotos, foto de la etiqueta y miniatura (`Blob`) |
| `garmentCodeCounters` | `prefix` | Último número dado a cada prefijo de código |
| `outfits` | `id`, `createdAt`, `favorite`, `kind` | Outfits generados y manuales guardados, con historial de uso |
| `preferences` | `id` | Preferencias del generador |
| `outfitFeedback` | `id`, `type`, `createdAt` | Valoraciones que ajustan las puntuaciones |
| `trendPacks` | `id`, `version`, `publishedAt` | Reservado para tendencias (sin pantalla todavía) |

Las migraciones conservan los datos: v2 añade dimensiones a prendas antiguas; v3, el feedback; v4, el tipo de outfit; v5, los códigos de prenda (asignados por fecha de alta) y sus contadores; v6 convierte la formalidad anterior en niveles de estilo (Casual → Diario, Smart casual → Arreglado, Formal → Formal), también en las preferencias y en los outfits guardados. Las imágenes aún van dentro del registro de cada prenda, así que leer el armario carga todos los `Blob`.

## Modelos de IA

### Clasificador de prendas
- **Modelo:** propio de Molt, entrenado en [`ml/`](ml/README.md). Es DINOv2 ViT-S/14 (Meta, Apache-2.0) congelado, más cabezas de categoría, subcategoría, manga, corte de pantalón y estampado, con la taxonomía de la app ([`ml/taxonomy.json`](ml/taxonomy.json)).
- **Datos:** solo con licencia que permite uso comercial (Clothing Dataset, Fashionpedia, Open Images, Unsplash, Pexels y fotos propias).
- **Formato:** un único ONNX int8 de ~25,6 MB en `public/models/vesta/`, con `vesta-model.json` (salidas, preprocesado, reglas y temperaturas de calibración).
- **Cómo combina las fotos:** promedia las probabilidades de todas las fotos, elige la categoría y busca la subcategoría solo dentro de ella; las alternativas se ordenan por P(categoría) × P(subcategoría | categoría). La app rechaza un modelo exportado con otra versión de taxonomía.
- **Calidad** (heads-v4, test de 2.987 imágenes de las fuentes de entrenamiento): categoría 92,8 %, subcategoría 80,3 % (macro-F1 0,73), manga 88,1 %, estampado 85,3 %, corte 63,4 %. El detalle por clase está en [`ml/README.md`](ml/README.md).
- **Velocidad** en el equipo de desarrollo: la primera foto tarda ~10 s (descarga y carga del modelo); las siguientes, ~1 s con la lectura de texto incluida. La inferencia corre en un *worker* de ONNX Runtime (`env.wasm.proxy`), así que la interfaz no se congela: con 3 fotos, el hilo principal pasó de 3,2 s bloqueado (picos de 960 ms) a ninguna tarea larga. No se ha medido en móviles.

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
  - Una prenda clara sobre fondo claro (sudadera gris sobre blanco) ya no pierde trozos: si el relleno se come el interior de la prenda, dentro de ella solo cuenta como fondo lo casi idéntico al fondo. Las manchas sueltas lejos de la prenda se quitan.
  - Un primer plano (la prenda ocupa toda la foto) no se recorta: no hay fondo que quitar. Una foto que ya viene sin fondo (PNG o WebP transparente) conserva su propio contorno.
  - Probado con las 26 fotos del armario de prueba: las de producto salen bien; las de una persona llevando la prenda conservan a la persona (cabeza, piernas) y las de fondo recargado (una mesa con objetos) o con degradado se quedan como la original.
- **Modelos de quitar fondo evaluados y descartados (oct. 2026):** ISNet-ONNX de onnx-community es AGPL-3.0; BiRefNet-lite (MIT, 115 MB fp16) tarda 80–90 s por foto en CPU, se queda sin memoria a la segunda foto (sus convoluciones deformables) y no cabe en WebGPU (17 buffers por shader, el límite es 16). Para separar la ropa de la persona hará falta un modelo de *human parsing* con licencia comercial.
- **Hilos:** la app pide aislamiento entre orígenes (cabeceras COOP/COEP en `vite.config.ts` y [`public/_headers`](public/_headers); el service worker propio, [`src/sw.ts`](src/sw.ts), las añade a lo que sirve desde caché), así ONNX Runtime usa 4 hilos: el detector del OCR baja de 1,3 s a 0,7 s. En `npm run dev` los hilos no arrancan y se usa uno; se notan en `npm run build` + `npm run preview` y en producción. El hosting debe enviar esas cabeceras (Cloudflare las lee de `_headers`, igual que Netlify).
- **Color:** cada píxel de la prenda (máscara de la cabeza o, si existe, el recorte) se nombra con el color más cercano de la paleta en CIELAB ([`colors.ts`](src/ai/colors.ts)), con varios tonos por nombre (granate es rojo; caqui y camel, beige; oliva, verde; vaquero claro, azul). Se proponen los colores que cubren al menos un 15 % de la prenda. Sin cabeza de segmentación se usa la heurística anterior del borde.

### Reglas sin modelo
- **Uso:** [`src/ai/usageRules.ts`](src/ai/usageRules.ts) sugiere temporadas, estilo y estética según el tipo de prenda (plumífero → otoño e invierno; manga corta → primavera y verano; lana → sin verano; blazer → Arreglado y Formal…).

### Límites conocidos
- El test procede de las mismas fuentes que el entrenamiento; con fotos propias solo hay 29 de referencia.
- En el formulario se analiza una prenda por foto; para varias, «Desde un look». Las oclusiones (chaqueta abierta sobre camiseta) y las fotos de modelo dan recortes con la persona (cabeza, manos, piernas).
- La agrupación automática de «Varias prendas a la vez» depende de la hora EXIF: sin ella (capturas de pantalla, fotos descargadas) cada foto es una prenda; dos prendas del mismo tipo y color fotografiadas seguidas se unen y hay que separarlas en la revisión.
- La segmentación se ha medido con fotos de Fashionpedia y la prueba de «Desde un look» se ha hecho con pocas fotos; falta probarla con selfies reales.
- El corte de pantalón «campana» aún no se aprende.
- Faltan pruebas con etiquetas reales y en móviles.

## Hoja de ruta

- [x] Exportar e importar el armario completo (JSON + imágenes), como copia de seguridad y para cambiar de dispositivo.
- [x] Quitar el fondo de las fotos y medir el color solo sobre la prenda.
- [x] Prototipo: añadir prendas desde una foto de cuerpo entero y guardar el look.
- [ ] Validar «Desde un look» con selfies reales, detectar duplicados ("¿es esta prenda?") y registrar el look como «me lo pongo hoy».
- [x] «Me lo pongo hoy» con calendario, y estadísticas (coste por uso, prendas olvidadas, colores, marcas).
- [ ] Separar metadatos e imágenes en IndexedDB y cargar miniaturas bajo demanda.
- [x] Copia de seguridad opcional en el Google Drive del propio usuario.
- [ ] Copia en Drive por archivos (solo las fotos que cambian) en lugar de un ZIP completo, para armarios grandes.
- [ ] Capa opcional de lenguaje natural para explicar y ordenar outfits, enviando solo texto.
- [x] Guardar los planes de viaje.
- [ ] Tendencias, con una fuente fiable y fechada.
- [x] Dividir el bloque principal de JavaScript: las pantallas se cargan bajo demanda (433 kB al abrir, antes 582 kB).
- [x] Inferencia fuera del hilo principal, para que analizar fotos no congele la interfaz.
- [ ] Probar la usabilidad en móvil y escritorio, y validar el generador con armarios grandes e incompletos.

## Licencia

Copyright © 2026 Ximo Martínez. Todos los derechos reservados. Que el código sea visible no concede ninguna licencia de uso, copia, modificación ni distribución; ver [LICENSE](LICENSE). Los componentes de terceros (DINOv2, PaddleOCR, bibliotecas y datos de entrenamiento) conservan sus licencias, recogidas en [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
