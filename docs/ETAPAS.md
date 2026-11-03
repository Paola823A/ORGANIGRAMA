# Registro de implementación y validación

Fecha: 29 de octubre de 2026. Implementación realizada después de inspeccionar
el XLSM real y finalizar `ANALISIS-TECNICO.md`.

## Etapa 1 — Inicialización

Archivos: `package.json`, lockfile, `scripts/dev.js`, `frontend/vite.config.js`,
`frontend/src/{main.js,App.vue,router/index.js,styles/main.css}`,
`backend/src/{config/index.js,db/index.js,app.js,server.js}` y
`backend/migrations/001_initial.sql`.

Resultado: monorepo npm, navegación Gráfico/Canva/Upload, selector de empresa,
servidor local, API `/api/v1`, migración automática, SQLite con WAL y claves
foráneas verificadas. El build permite servir frontend y API desde Express.

Validación: migración en bases vacías de las pruebas, endpoint health y build.
El control de origen permite el proxy de desarrollo solo en modo development;
producción comprueba mismo origen.

## Etapa 2 — Importación

Archivos: `backend/src/modules/imports/{reader,service,routes}.js`,
`backend/src/modules/employees/{repository,routes}.js`,
`frontend/src/modules/upload/UploadView.vue`, `scripts/analyze.js`.

Resultado: lectura con SheetJS sin ejecutar macros; validación de extensión,
tamaño, directorio ZIP, hojas y encabezados. Mapeos independientes para ambas
hojas. Vista previa paginada, observaciones, hash, confirmación explícita,
transacción, historial de éxitos/errores, correspondencia por identidad
inequívoca y consulta independiente de cesados. Los originales no se copian.

Validación: XLSM real leído con 733 activos y 791 cesados. 173 observaciones:
10 de formato documental, 141 filas con DNI repetido, una autorreferencia,
13 responsables inexistentes y ocho ambiguos. Importación real desde el navegador
confirmada en la base local con 1524 inserciones. Pruebas de rollback, actualización,
ausencias, documentos con ceros, duplicados, ciclos, hash y vistas previas antiguas.

## Etapa 3 — Modelo de organigramas

Archivos: `shared/graph.js`,
`backend/src/modules/charts/{repository,service,routes}.js`.

Resultado: grafo visual separado de empleados y jefaturas. Tipos EMPLOYEE,
POSITION, BUSINESS_LINE, BRANCH, AREA, GROUP y CUSTOM. Generación por empresa
solo con activos y relaciones maestras válidas dentro de esa empresa. Los
responsables externos a la empresa quedan señalados, sin inventar conexiones.

Validación: pruebas de separación de jerarquías y asociaciones de empleados;
validación de extremos, conexiones múltiples, ciclos, colores, dimensiones y límites.
El grafo generado de AUTRISA tiene 277 tarjetas y 270 conexiones.

## Etapa 4 — Canva

Archivos: `frontend/src/modules/canva/CanvaView.vue`,
`frontend/src/composables/useEditor.js`,
`frontend/src/components/{GraphCanvas,ChartCard,NodeProperties}.vue`,
`frontend/src/services/layout.js`.

Resultado: edición de propiedades, posiciones y conexiones, duplicación,
eliminación, búsqueda e incorporación de empleados, tarjetas manuales, Dagre
global o de rama, zoom/pan, historial limitado a 40 operaciones, guardado con
revisión optimista, advertencia de cambios pendientes y sincronización explícita.
Los guardados preservan el estado de cambios que ocurran mientras responde la API.
Las respuestas de carga antiguas no sustituyen el borrador de otra empresa.

Validación: pruebas de historial y Dagre. Una prueba detectó que el orden de
inserción de conexiones debía respetar también el orden entre hermanas; corregido.
En navegador: agregar sede, editar título, duplicar y deshacer las tres operaciones
devuelve el grafo a 277 tarjetas y 270 conexiones. El borrador se guarda y recupera.

## Etapa 5 — Versionamiento

Archivos: servicio y rutas de charts, tablas chart_drafts/chart_versions y triggers
de la migración, selectores de versiones en las vistas Canva/Gráfico.

Resultado: snapshots completos, publicación transaccional, numeración por empresa,
consulta histórica y creación de borradores desde versiones previas. Los triggers
de SQLite impiden modificar o eliminar versiones publicadas.

Validación: pruebas V1/V2, secuencia independiente en otra empresa, rechazo de
UPDATE/DELETE y conservación de snapshots y borradores después de otra importación.
En navegador se publicó AUTRISA V1 y se recuperó desde Gráfico.

## Etapa 6 — Gráfico y exportación

Archivos: `frontend/src/modules/graphic/GraphicView.vue`,
`frontend/src/services/{export,exportGeometry}.js` y política compartida de filtros.

Resultado: solo lectura, filtros combinados con ancestros reales, búsqueda de
cada representación, colapso, control de nombres y restablecimiento. PNG/JPEG/PDF
capturan la extensión completa visible, con límites explícitos. PDF utiliza
mosaicos A3 con superposición según el tamaño máximo de tarjeta: cada tarjeta
aparece completa en alguna página y no se dibujan copias parciales en los bordes.
Las conexiones continúan entre páginas con coordenadas y numeración de mosaicos.

Validación: en navegador, contraer la raíz redujo el gráfico a siete tarjetas;
buscar una secretaria expandió los ancestros, recuperó 277 tarjetas y la resaltó.
El filtro PRESIDENCIA EJECUTIVA dejó dos tarjetas conectadas. Se verificaron las
descargas PNG, JPEG y PDF con nombres ocultos. Se corrigieron una descarga de
data URL incompatible con el navegador integrado y una captura fuera de pantalla
que producía imágenes blancas. Se revisó visualmente la imagen corregida.

El PDF final de AUTRISA completo tiene **50 páginas A3**. Se verificaron conteo,
numeración y una página interior renderizada con Poppler. La prueba geométrica
comprueba que incluso las tarjetas grandes y las coordenadas negativas están
cubiertas por al menos un mosaico completo.

## Etapa 7 — Validación y documentación

Archivos: `backend/tests/{helpers,api.test,imports.test,charts.test,editor.test,export.test}.js`,
`README.md`, `docs/ANALISIS-TECNICO.md` y este documento.

Resultado final de comandos:

- `npm test`: 19 pruebas aprobadas, cero fallos.
- `npm run build`: compilación de producción correcta.
- `npm audit`: cero vulnerabilidades reportadas.
- SQLite `integrity_check`: ok.
- SQLite `foreign_key_check`: cero violaciones.

Se detuvo el servidor temporal de desarrollo y se inició la aplicación compilada
en `http://127.0.0.1:3001`. La base local conserva la importación y la publicación
real verificadas. Los archivos de QA están bajo `data/qa`, excluidos de Git.
Las descargas de prueba se encuentran en la carpeta Descargas del equipo.

## Alcance y decisiones de V1

No se recibió el boceto Excalidraw. La interfaz utiliza la distribución descrita
en el encargo. No hay autenticación ni publicación en Internet. No se añadieron
frameworks CSS, estado global pesado ni datos de demostración a la aplicación.

La sincronización compara tarjetas guardadas con la base actual y requiere una
selección explícita para sustituir títulos personalizados. El PDF es rasterizado,
con texto visualmente legible pero no seleccionable. El comportamiento y los
límites de memoria, tamaño y paginación se detallan en README.

La revisión manual de las observaciones del XLSM corresponde al responsable de
la base. La aplicación conserva los conflictos; no decide cuál registro duplicado
representa al responsable correcto.
