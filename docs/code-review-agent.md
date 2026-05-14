# Agente de Code Review de VecinosApp

## Objetivo

Usar este perfil antes de cerrar cualquier cambio funcional, de seguridad o performance. El agente debe actuar como revisor estricto y priorizar riesgos reales sobre cambios cosméticos.

## Enfoque de revisión

1. Seguridad OWASP
   - Confirmar que las rutas protegidas exigen login.
   - Confirmar que las mutaciones mantienen CSRF.
   - Confirmar que el token CSRF no sea global compartido y que se valide de forma firmada/segura.
   - Revisar que las cookies de sesión sean `HttpOnly`, `SameSite=Lax` y que `COOKIE_SECURE=true` pueda activarse con HTTPS.
   - Evitar redirecciones abiertas, datos sin validar y mensajes de error con detalles internos.
   - Confirmar que no se exponen archivos SQLite, secretos ni carpetas internas desde `public`.
   - Confirmar que usuarios no administradores solo accedan a edificios asignados, tanto en listados como en detalles, ediciones, pagos, recibos, prorrateos y reportes.
   - Revisar wrappers de Express (`res.render`, `res.redirect`, etc.) con especial cuidado: deben preservar exactamente las firmas originales. En particular, no llamar `res.redirect(url, undefined)` porque en producción puede generar `ERR_HTTP_INVALID_STATUS_CODE`.

2. Auditoría
   - Toda creación debe guardar `created_by` cuando aplique.
   - Toda edición, desactivación o cambio de estado debe guardar `updated_by` cuando aplique.
   - Los pagos deben guardar el usuario que registró la operación.
   - Los prorrateos deben registrar el usuario que los generó.
   - Los eventos reales de negocio deben llegar a `instance/vecinosapp_logs.sqlite`.
   - No auditar ruido técnico del navegador: `/favicon`, `/css`, `/js`, `/.well-known` ni navegaciones `GET` normales.
   - Auditar operaciones transaccionales y de seguridad: login, logout, creación/edición/desactivación, pagos, prorrateos y cambios de administración.
   - Guardar `action` y `message` cuando aplique para entender qué pasó sin abrir la consola del servidor.
   - En errores de validación o respuestas `4xx/5xx`, mostrar un mensaje útil en auditoría sin guardar cuerpos completos de formularios, contraseñas ni datos sensibles.

3. Instalación limpia y migraciones
   - Verificar que una instalación desde cero cree todas las tablas, columnas, índices básicos, roles, permisos y usuario inicial.
   - Confirmar que `initDb()` y `initLogDb()` funcionen con rutas nuevas de SQLite y no dependan de una BD previa.
   - Cuando se agregue una columna nueva, actualizar tanto el `CREATE TABLE IF NOT EXISTS` como el bloque `ensureColumn`.
   - Cuando se agregue una tabla o campo crítico, ampliar el chequeo de instalación limpia en `scripts/review.js`.
   - Confirmar que producción use `dataDir` correctamente para que `dist/` lea y escriba las bases en `instance/` del proyecto.

4. Performance
   - El build debe minificar CSS/JS.
   - Los assets estáticos deben tener cache headers en producción.
   - El JS público debe cargarse con `defer` y no contener lógica muerta evidente.
   - Las consultas repetidas o pesadas deben usar filtros, índices o cache cuando sea seguro.
   - El cache de páginas debe estar separado por usuario y debe invalidarse en mutaciones.
   - Evitar que tablas de auditoría, pagos, reportes o detalles grandes crezcan sin paginación, filtros o agrupación visual.

5. Frontend y UX
   - En móvil, validar que componentes densos no desborden: tablas, acordeones, carruseles, navbar y formularios.
   - Las fechas guardadas en UTC deben mostrarse visualmente en la zona horaria del navegador del usuario.
   - Los assets versionados (`?v=<assetVersion>`) deben actualizarse en cada build para evitar inconsistencias de cache en Brave/Chrome/Edge.
   - Si una pantalla depende de JavaScript, debe degradar razonablemente o mostrar datos base útiles si el JS no carga.

6. Limpieza de código
   - Eliminar funciones, vistas, estilos y selectores que ya no se usan.
   - No duplicar validaciones ni lógica de dinero.
   - Mantener los cambios pequeños y alineados con la estructura actual.
   - Revisar variables enviadas a vistas: si una vista ya usa datos agrupados (`allocationsByFloor`, `debtsByFloor`), no seguir enviando colecciones viejas que no se renderizan.
   - Mantener helpers transversales pequeños y reutilizables, por ejemplo acceso por edificio, dinero, consumo, estado y seguridad.

## Casos regresivos obligatorios

- Login correcto y login fallido deben auditarse con usuario/correo y mensaje.
- Logout debe auditarse.
- Crear o editar datos debe redirigir sin romper producción.
- Un usuario propietario u operador no debe poder consultar edificios no asignados mediante URL directa.
- Los reportes deben respetar edificios permitidos.
- Los logs de auditoría no deben mostrar favicon, assets o `/.well-known`.
- La pantalla de logs debe mostrar la fecha en hora local del navegador.
- El build de producción debe servir CSS/JS versionado y minificado.
- Una instalación limpia debe crear esquema completo y datos base.

## Comando obligatorio

Antes de entregar cambios, ejecutar:

```powershell
npm run review
```

Si el comando falla, corregir antes de continuar. Si una advertencia es aceptable, documentar el motivo.
