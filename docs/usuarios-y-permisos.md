# Usuarios y permisos

## Activación inicial

En la terminal del proyecto ejecuta `npm run create-owner`. El comando solicita nombre, usuario y contraseña (mínimo 6 caracteres, sin límite máximo, oculta en la terminal). No crea ni muestra contraseñas predeterminadas. La cuenta inicial solo se configura desde la terminal del servidor; no existe registro público ni recuperación pública de la cuenta del creador.

Después actualiza la aplicación e inicia sesión. Hasta crear esa cuenta se conserva el funcionamiento local. El acceso remoto sin creador configurado se rechaza. El usuario de Windows que ejecute el comando necesita acceso al mismo archivo de base de datos que el servidor (`DATABASE_PATH`, si se configura).

## Administrar personal

1. En **Usuarios y permisos**, el creador pulsa **Crear usuario**.
2. Puede buscar personal de la base y vincular la cuenta a un empleado, o indicar un nombre manualmente. Vincularlo no cambia su empresa ni crea nuevas filas de personal.
3. Define un usuario y una contraseña de al menos 6 caracteres, sin límite máximo, y marca módulos para cada empresa.
4. Al crear la cuenta queda **Activa** y puede ingresar inmediatamente a los módulos asignados, sin aprobación adicional.
5. Comunica las credenciales por un medio privado. El sistema no envía correos. Las contraseñas definidas por el administrador son definitivas, sin cambio obligatorio al ingresar.

La vista de usuarios es una tabla con buscador por nombre, usuario o empresa, filtros de empresa, módulo y estado, y paginación. **Editar** permite cambiar nombre, usuario, estado y permisos. **Eliminar** quita la cuenta del listado y revoca sus sesiones y permisos, conservando el personal de la base y el historial de importaciones. La eliminación es lógica; no permite reutilizar el mismo nombre de usuario. La cuenta del creador está protegida frente a eliminación.

Solo el creador puede administrar cuentas y permisos. Puede deshabilitar cuentas, cambiar los permisos o editar la contraseña desde el modal **Editar usuario**. Dejar el campo de contraseña vacío conserva la actual; escribir una nueva la reemplaza al guardar junto con el resto de la cuenta. Los cambios cierran las sesiones previas. El creador conserva todos los módulos en todas las empresas; los permisos nunca se asignan automáticamente por pertenecer a la base.

| Módulo | Alcance por empresa |
| --- | --- |
| Organigrama | Consultar y exportar versiones publicadas. No permite editar borradores. |
| Board | Consultar, crear, editar y publicar organigramas; incluye la consulta publicada. Para buscar e incorporar empleados de otra empresa se requiere Board también en esa empresa. Las tarjetas compartidas ya autorizadas en el organigrama siguen disponibles. |
| Upload | Importar personal únicamente para las empresas autorizadas. El archivo puede contener otras empresas: sus registros se omiten y no cambian su personal ni jerarquías. No se pueden crear empresas nuevas con una carga delegada. El historial delegado muestra solo cargas propias que sigan dentro de los permisos vigentes. |

Las cargas delegadas solo marcan ausentes dentro de empresas autorizadas que tengan registros en el archivo. Si un jefe pertenece a otra empresa excluida de la carga, la relación se marca sin resolver y no modifica la jerarquía exterior. Una importación del creador sigue siendo global, como antes. Una importación simultánea invalida las vistas previas anteriores para evitar sobrescrituras.

## Despliegue posterior en nube

Esta implementación no publica la aplicación ni entrega acceso a ninguna persona. Antes del despliegue, crea la cuenta del creador y conserva la base de datos en un volumen persistente, con copia de seguridad. Usa HTTPS y configura `AUTH_REQUIRED=true` y `AUTH_SECURE_COOKIES=true`. La sesión dura ocho horas y usa una cookie HttpOnly y SameSite=Strict; las contraseñas se almacenan con scrypt y sal aleatoria, siguiendo la [API criptográfica de Node.js](https://nodejs.org/api/crypto.html#cryptoscryptsyncpassword-salt-keylen-options).

El proxy debe conservar el Host público y no reescribirlo a localhost. No habilites el modo de desarrollo en el servidor público. El endpoint de salud es público y solo informa disponibilidad. Los datos de empresas, empleados, borradores, versiones e importaciones exigen sesión y permisos una vez activadas las cuentas.

No existe un restablecimiento automático de contraseña del creador; conserva sus credenciales de forma segura. Solo el creador puede cambiar su propia contraseña. El personal no tiene esta opción y la API también la bloquea; sus contraseñas las administra el creador desde **Editar usuario**.
