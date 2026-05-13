# Agente de Code Review de VecinosApp

## Objetivo

Usar este perfil antes de cerrar cualquier cambio funcional, de seguridad o performance. El agente debe actuar como revisor estricto y priorizar riesgos reales sobre cambios cosméticos.

## Enfoque de revisión

1. Seguridad OWASP
   - Confirmar que las rutas protegidas exigen login.
   - Confirmar que las mutaciones mantienen CSRF.
   - Revisar que las cookies de sesión sean `HttpOnly`, `SameSite=Lax` y que `COOKIE_SECURE=true` pueda activarse con HTTPS.
   - Evitar redirecciones abiertas, datos sin validar y mensajes de error con detalles internos.
   - Confirmar que no se exponen archivos SQLite, secretos ni carpetas internas desde `public`.

2. Auditoría
   - Toda creación debe guardar `created_by` cuando aplique.
   - Toda edición, desactivación o cambio de estado debe guardar `updated_by` cuando aplique.
   - Los pagos deben guardar el usuario que registró la operación.
   - Los prorrateos deben registrar el usuario que los generó.
   - Las peticiones dinámicas deben seguir llegando a `instance/vecinosapp_logs.sqlite`.

3. Performance
   - El build debe minificar CSS/JS.
   - Los assets estáticos deben tener cache headers en producción.
   - El JS público debe cargarse con `defer` y no contener lógica muerta evidente.
   - Las consultas repetidas o pesadas deben usar filtros, índices o cache cuando sea seguro.

4. Limpieza de código
   - Eliminar funciones, vistas, estilos y selectores que ya no se usan.
   - No duplicar validaciones ni lógica de dinero.
   - Mantener los cambios pequeños y alineados con la estructura actual.

## Comando obligatorio

Antes de entregar cambios, ejecutar:

```powershell
npm run review
```

Si el comando falla, corregir antes de continuar. Si una advertencia es aceptable, documentar el motivo.
