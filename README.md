# Organigrama

Aplicación interna para importar personal desde XLSM, editar organigramas visuales
y consultar versiones publicadas. Vue 3, Vite, Vue Router, Vue Flow y Dagre en el
frontend; Express, better-sqlite3 y SheetJS en el backend. JavaScript ES Modules,
sin autenticación en esta V1.

## Instalación y ejecución

Requiere Node.js LTS 22.12 o posterior; verificado con Node 24.19.0 en Windows.

```powershell
npm ci --cache .npm-cache
npm run dev
```

Abrir **http://localhost:5173**. El backend escucha en **127.0.0.1:3001**.
Ambos procesos se detienen con Ctrl+C. El servidor se limita a la interfaz local.
Si better-sqlite3 no dispone de binario para otra plataforma, se necesitan las
herramientas de compilación nativas de Node correspondientes a ese equipo.

Para utilizar el build de producción con un solo servidor:

```powershell
npm run build
npm start
```

Abrir **http://127.0.0.1:3001**. Express sirve el frontend compilado y la API.
Variables admitidas: `HOST`, `PORT`, `DATABASE_PATH`. No se carga `.env`
automáticamente. Para un servidor interno, configurar estas variables en el
servicio del sistema y restringir su acceso a la red interna. En producción las
operaciones de escritura desde navegador requieren el mismo origen.

La base se crea y migra automáticamente en `data/organigrama.sqlite`. No está
incluida en Git. El XLSM y las exportaciones tampoco deben incluirse en Git.
Para una copia de seguridad consistente, detener la aplicación y copiar la base;
no copiar solamente el archivo principal mientras existan escrituras WAL.

## Uso

1. **Upload:** seleccionar el XLSM, revisar resumen, registros y observaciones,
   y pulsar **Confirmar importación**. Extensión XLSM, máximo 12 MB; validación
   del ZIP antes de descomprimir. La vista previa dura 30 minutos y reside en
   memoria. Al reiniciar el backend hay que volver a seleccionar el archivo.
2. **Canva:** seleccionar empresa, crear un borrador desde la jerarquía maestra,
   un lienzo vacío o una versión publicada. **+ Tarjeta** incorpora sedes, áreas,
   grupos, líneas de negocio y puestos vacantes. **+ Empleado** permite buscar
   activos, cesados o ausentes de cualquier empresa.
3. Seleccionar una tarjeta para editar títulos, dimensiones, posiciones, orden,
   colores, borde y clasificación. Arrastrar los puntos superior/inferior para
   conectar; seleccionar una conexión permite cambiar padre, subordinado o
   presentación, y desconectarla. También se pueden arrastrar sus extremos.
4. **Distribuir** ejecuta Dagre de arriba hacia abajo. En propiedades se puede
   distribuir una rama. El orden entre hermanas se aplica al distribuir.
   Duplicar copia una tarjeta sin crear empleados ni conexiones.
5. **Guardar borrador** conserva posiciones y estructura. **Publicar versión**
   requiere guardar primero y crea una copia inmutable. Cada empresa tiene su
   propia secuencia V1, V2, etc. Las flechas deshacer/rehacer conservan hasta
   40 operaciones de la sesión. Se advierte al salir con cambios pendientes.
6. **Gráfico:** seleccionar versión, combinar filtros, contraer ramas, expandir
   todo y ocultar nombres. Buscar por nombre, DNI o puesto localiza cada tarjeta,
   limpia filtros, expande ancestros, centra y resalta la representación elegida.
   **Restablecer** recupera el colapso guardado, muestra nombres y limpia filtros.
7. **Exportar** descarga PNG, JPEG sobre blanco o PDF. Incluye el grafo completo
   visible según filtros, colapso y nombres, no solo el área mostrada en pantalla.
   No incluye navegación ni controles. Los gráficos amplios se dividen en páginas
   A3 con superposición según el tamaño de las tarjetas y coordenadas de mosaico.
   Cada tarjeta aparece completa en al menos una página; se omiten copias parciales
   en los bordes. Las conexiones continúan entre mosaicos. PDF rasterizado: el
   texto conserva su aspecto, pero no es seleccionable.

Los grafos grandes abren centrados en la raíz con más descendientes a escala
legible. **Ajustar** muestra toda la extensión; zoom y pan permiten recorrerla.

## Importaciones y sincronización

Los mapeos reales son distintos para principal y CESADOS. Encabezados en fila 3,
datos desde fila 4. La jefatura procede exclusivamente de AL en principal.
CESADOS se utiliza como catálogo manual y lee su DNI encargado de AM únicamente
para validar la estructura, sin crear jerarquías maestras.

Los DNI se conservan como texto. Se recortan espacios exteriores; no se eliminan
ceros, no se truncan documentos de nueve caracteres y no se completan documentos
cortos salvo una máscara numérica explícita del archivo. Se conservan documentos
alfanuméricos y se marcan para revisión. No se ejecutan macros ni fórmulas.
Se importan exclusivamente documento, nombre, empresa, sede, área, puesto, giro
y documento del encargado; no se persisten remuneraciones ni contactos.

Documento único por hoja en la base y en el lote permite mantener el UUID.
Los duplicados solo se corresponden si hay una firma exacta e inequívoca con los
campos permitidos. Los ambiguos se muestran y requieren aceptar su conservación
como registros separados. La fila no es una clave de identidad. Una coincidencia
entre activo y cesado no fusiona sus vínculos. Los activos ausentes se marcan
ABSENT; no se deduce un cese. Se advierte antes de repetir un hash confirmado.

Importar nunca actualiza tarjetas ni conexiones. **Sincronizar datos** en Canva
muestra diferencias de las tarjetas guardadas con empleados actuales. Seleccionar
tarjetas actualiza su clasificación; actualizar también títulos y subtítulos
requiere marcar una casilla explícita. Las modificaciones locales todavía sin
guardar no se incluyen en esa comparación. Guardar antes de sincronizar permite
comparar todo el borrador. La sincronización aplicada se puede deshacer y requiere
guardar para persistir. Las versiones publicadas permanecen intactas.

## Límites

- 3000 nodos y 3000 conexiones por borrador; profundidad máxima 500.
- Varias entradas y salidas por tarjeta, sin ciclos, autorreferencias ni conexiones repetidas entre los mismos puntos.
- Imágenes: hasta 16000 px por dimensión y 32 millones de píxeles. Si el gráfico
  excede esos límites, aplicar filtros, contraer ramas o utilizar PDF.
- PDF: máximo 200 páginas. No se realiza una captura raster gigante antes de
  dividir: cada mosaico se renderiza por separado.
- El historial muestra las últimas 100 operaciones, incluyendo archivos que no
  superaron la validación y transacciones fallidas, sin conservar el archivo.
  Los rechazos previos a la lectura (extensión o tamaño) se muestran en pantalla.
- Procesamiento síncrono acotado a 20000 filas y 80 MB descomprimidos, apropiado
  para los cientos de trabajadores del archivo inicial. El máximo de archivo y
  de vistas previas simultáneas evita retener libros originales ilimitados.

## Verificación

```powershell
npm test
npm run build
npm run analyze
npm audit
```

Las pruebas usan bases SQLite en memoria y libros mínimos de prueba. La prueba
del XLSM real se ejecuta cuando ese archivo está presente; no requiere enviarlo
ni versionarlo. `analyze` imprime únicamente estructura y conteos, sin nombres
ni documentos de trabajadores. La API no expone trazas del servidor.

## Organización y decisiones

```text
frontend/src/components/       Tarjetas, lienzo y propiedades
frontend/src/composables/      Empresa seleccionada e historial del editor
frontend/src/modules/          graphic, canva y upload
frontend/src/services/         HTTP, Dagre y exportación
frontend/src/router/           Navegación
frontend/src/styles/           CSS propio
backend/src/config/           Configuración local
backend/src/db/               Conexión y migraciones
backend/src/modules/          Empleados, importación y organigramas/versiones
backend/src/utils/            Errores de dominio
backend/migrations/           SQL versionado
backend/tests/                Pruebas de lector, API, editor y persistencia
shared/                       Validación de grafos y política de filtros
scripts/                      Desarrollo y análisis agregado
docs/                         Análisis técnico y resumen por etapas
data/                         SQLite local, excluido de Git
```

Las rutas delegan reglas de negocio en servicios y el acceso repetido a tablas
de empleados/grafos está encapsulado en repositorios. Publicación y snapshots
residen en el servicio de organigramas para compartir una sola transacción.
Las migraciones y triggers protegen integridad e inmutabilidad. El guardado usa
revisiones para evitar sobrescribir otra sesión. Los GROUP son nodos lógicos.
Los filtros conservan ancestros reales sin inventar conexiones.

jsPDF se ejecuta en el navegador junto con html-to-image: la exportación no
necesita enviar imágenes de personal al backend ni a servicios externos. SheetJS
se obtiene de su [distribución oficial](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/)
y no de la versión antigua del registro npm. Vue Flow sigue su
[API controlada](https://vueflow.dev/guide/controlled-flow.html).

El análisis del archivo inicial está en [docs/ANALISIS-TECNICO.md](docs/ANALISIS-TECNICO.md)
y la verificación por etapas en [docs/ETAPAS.md](docs/ETAPAS.md).
