# Análisis técnico inicial — 29 de octubre de 2026

## 1. Inspección del archivo real

Archivo: `Base de Datos Personal 2026_octubre_v2.xlsm` (2 187 526 bytes).
SHA-256: `f042ed3f75670ef75f96d0ed86c64c9e11d12bb390816074543f97eee40dd504`.
Inspección de XML dentro del ZIP, sin ejecutar macros ni alterar el archivo.

Se encontraron 13 hojas: AUTRISA-INCAMOTORS-NOVA AUTOS, MOVIMIENTO DE PERSONAL,
LEGAJOS, HEAD COUNT, CONVENIOS DE PERMANENCIA, CESADOS, Vacaciones Vigilancia,
VIGILANCIA INC, SENATI, PLUXEE, BEE BENEFICIOS, OBS e ICEBERG DESVINCULACION.
Solo se procesarán la hoja principal y CESADOS; las demás contienen información
ajena al organigrama y no se importarán.

## 2. Mapeos verificados

Ambas hojas tienen encabezados en fila 3 y datos desde fila 4.

| Campo | Principal | CESADOS |
|---|---|---|
| DNI | A | A |
| Sede | E | D |
| Empresa | F | G |
| Nombre | H | I |
| Área | K | L |
| Puesto | L | M |
| Giro | AI | AJ |
| DNI encargado | AL | AM |

Principal: rango declarado A1:BK1066, 733 registros con identidad y nombre.
No se confundirán sus 1066 filas físicas con empleados. Empresas: AUTRISA 277,
INCAMOTORS 388 y NOVA AUTOS 68.
CESADOS: rango A1:BN794, 791 registros con nombre, cuatro sin documento.
Empresas: AUTRISA 325, INCAMOTORS 376, NOVA AUTOS 78 y SEMINUEVOS 12.

## 3. Identificadores

En principal hay 731 documentos almacenados como texto y dos numéricos.
Tras recortar espacios exteriores, hay 722 textos de ocho caracteres, nueve de
nueve caracteres y dos números de ocho cifras. 35 documentos empiezan por cero.
AL contiene 732 textos y un número. No hay fórmulas en estos identificadores.
La fila 700 contiene un identificador alfanumérico: se conservará y se advertirá,
sin inventar un DNI. Los documentos de nueve caracteres no se truncarán.

En CESADOS hay cinco documentos de siete cifras y cuatro vacíos; se conservarán
como observaciones, sin completar ceros por suposición. Hay 23 documentos con
cero inicial. El lector usará texto original y formato explícito si la celda
numérica tiene una máscara de ceros. No se ejecutarán ni recalcularán fórmulas.

## 4. Duplicados y jerarquía

Principal: tres grupos duplicados (filas 165/516, 180/181 y 258/259). Existen
diferencias entre empresas, y en algunos casos también entre nombres o puestos.
No es seguro fusionarlos. Los 733 registros se preservarán de forma separada.

Resultado de buscar AL exclusivamente contra A, tras recortar espacios:
711 relaciones únicas, 13 referencias inexistentes, ocho ambiguas y una
autorreferencia (fila 15). No hay ciclos adicionales entre relaciones únicas.
Filas con responsable inexistente: 32, 35, 65, 79, 167, 277, 499, 503, 573,
604, 637, 666 y 712. Ambiguas: 215, 228, 244, 421, 422, 458, 651 y 652.

CESADOS: 66 grupos con documento no vacío repetido, 69 repeticiones adicionales.
107 documentos aparecen tanto en principal como en CESADOS. Se conservará la
procedencia y el estado por registro: una coincidencia no prueba que sea el
mismo vínculo laboral. CESADOS será un catálogo de incorporación manual;
no se construirán jefaturas maestras desde esa hoja.

## 5. Modelo SQLite

- companies: UUID, nombre original, clave normalizada única, fechas.
- employees: UUID estable, documento textual no único, nombre, puesto,
  empresa, giro, sede, área, estado ACTIVE/CEASED/ABSENT, origen de hoja,
  fila de referencia, clave de correspondencia, búsqueda normalizada,
  última importación y fechas. Índices por documento, empresa, estado y búsqueda.
- employee_hierarchy: empleado único, responsable interno opcional, documento
  encargado, estado RESOLVED/MISSING/AMBIGUOUS/SELF/CYCLE/EMPTY e importación.
- organization_charts: una fila por empresa, nombre y fechas.
- chart_drafts: organigrama, versión base, nombre, revisión y fechas.
- chart_nodes: ID único dentro del borrador, empleado opcional, tipo, títulos,
  posición, tamaño, presentación, metadatos, colapso y orden.
- chart_edges: ID único dentro del borrador, extremos y presentación; referencias
  compuestas impiden conexiones a nodos de otro borrador. Padre único por destino.
- chart_versions: organigrama, secuencia entera, borrador origen, snapshot y fecha.
  UNIQUE(chart_id, version_number); triggers prohíben UPDATE y DELETE.
- import_batches e import_issues: hash, nombre, conteos, resumen y observaciones
  con hoja/fila/código. No se almacena el libro original ni datos innecesarios.

PRAGMA foreign_keys=ON verificado, WAL, transacciones y migraciones SQL versionadas.
La secuencia de versiones se calcula y escribe dentro de una transacción inmediata.

## 6. Contrato visual

Nodo: `{id, type, employeeId, title, subtitle, position:{x,y}, width, height,
style:{backgroundColor,textColor,borderColor,borderStyle}, collapsed,
siblingOrder, metadata:{company,businessLine,branch,area,dni,employmentStatus,
hierarchyStatus}}`.

Tipos: EMPLOYEE, POSITION, BUSINESS_LINE, BRANCH, AREA, GROUP, CUSTOM.
Conexión: `{id, source, target, style:{color,width,lineType}}`.
Los GROUP son agrupadores lógicos, sin contención geométrica implícita.
Snapshots incluyen todos los datos de presentación y búsqueda.
El grafo visual es dirigido y sin ciclos; admite múltiples entradas y salidas por nodo.
Se admiten raíces múltiples, tarjetas desconectadas y empleados representados varias veces.
Límite inicial: 3000 nodos, 3000 conexiones y profundidad 500.

## 7. Sincronización e identidad estable

Solo la confirmación de una importación modifica empleados y jefaturas maestras.
La vista previa conserva temporalmente en memoria únicamente los campos admitidos,
vence a los 30 minutos y requiere un token aleatorio. La confirmación se ejecuta
en una transacción; los duplicados de hash requieren aceptación explícita.

Correspondencia: documento y hoja únicos en ambos lotes permiten actualizar el
mismo UUID. Para duplicados, solo una firma exacta e inequívoca de campos permitidos
puede conservar el UUID. Los casos ambiguos bloquean la confirmación hasta decidir
explícitamente conservarlos como registros separados; nunca se elige por nombre.
La fila del XLSM es trazabilidad, no identidad estable. Los ausentes se marcan ABSENT
en principal; no se deduce CEASED por ausencia. No se mezclan automáticamente
episodios activos y cesados con el mismo documento.

Ninguna importación modifica borradores ni snapshots. La sincronización de tarjetas
es una operación explícita que muestra diferencias, permite seleccionar tarjetas
y elegir si se actualiza título/puesto; mantiene estilos, posiciones y relaciones.
Una tarjeta personalizada se preserva mientras no se seleccione su actualización.

## 8. Visualización y exportación

Los filtros combinan giro/sede/área sobre atributos congelados en el snapshot.
Se muestran coincidencias y sus ancestros reales, sin crear conexiones nuevas.
Colapso, filtros y nombres son estado local; buscar expande ancestros y centra
cada representación. Exportación captura únicamente el contenido visible del
grafo, con su extensión total y fondo blanco para JPEG. PNG/JPEG tendrán límites
de resolución explícitos. PDF se dividirá en mosaicos A3 cuando sea necesario,
sin capturar navegación ni controles. jsPDF se utilizará en el navegador para
evitar enviar imágenes de personal fuera del entorno interno.

## 9. Estructura

```text
frontend/src/{components,composables,layouts,modules/{graphic,canva,upload},router,services,styles}
backend/src/{config,db,modules/{employees,imports,hierarchy,charts,versions},middleware,utils}
backend/migrations/
backend/tests/
shared/
scripts/
docs/
data/
```

## 10. Etapas y verificación

1. Inicialización: workspaces npm, Vite/Vue/Router, Express, migración y layout.
   Verificar base vacía, claves foráneas, API y compilación.
2. Importación: SheetJS, mapeos independientes, validación, vista previa,
   confirmación, observaciones e historial. Pruebas de archivos inválidos,
   documentos, ciclos, actualizaciones, repetición y rollback.
3. Organigramas: generación desde maestros y grafo independiente.
   Verificar integridad y conservación de maestros al editar.
4. Canva: Vue Flow, Dagre, propiedades, tarjetas, historial local, borradores,
   conexiones y sincronización explícita. Verificar recuperación y posiciones.
5. Versiones: publicar, consultar y duplicar snapshots. Verificar inmutabilidad
   y secuencias independientes por empresa.
6. Gráfico: consulta, filtros, búsqueda, colapso, nombres y exportación.
   Verificar ancestros, extensión y exclusión de controles.
7. Validación: pruebas automatizadas, build, revisión en navegador y README.

El boceto Excalidraw no está disponible. Se utilizará la disposición descrita:
barra lateral, selector de empresa y lienzo amplio con controles compactos.
Los datos personales se mantendrán locales. No se publicará en Sites ni Internet.
