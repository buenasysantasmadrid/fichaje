// ══════════════════════════════════════════════════════════════════════════════
// FICHAJES · RRHH — Apps Script v31
// Cambios respecto v30:
//   1. NUEVO "Analizar semana": ventana interactiva con la semana completa.
//      Se pueden cambiar horas y eliminar turnos y los totales (día/semana),
//      descansos y avisos se recalculan al momento. "Proponer arreglo" calcula
//      los cambios en cadena (cada paso tiene en cuenta los anteriores).
//      Nada se guarda en la hoja hasta pulsar "Aplicar".
//   2. FIX: el descanso solo se marca si es MENOR de 12 h exactas (antes el
//      margen aleatorio hacía saltar avisos con 12 h 11 min, p. ej.).
//   3. El análisis antiguo (columnas H-J) sigue en el menú como "(antiguo)".
//
// Cambios de v30 respecto v29:
// Cambios respecto v29 (analizarSeleccion · descanso mínimo de 12 h):
//   1. FIX: una salida de madrugada a partir de las 02:00 se consideraba del
//      día siguiente y no se comparaba con la entrada de ese día → no avisaba
//      del descanso < 12 h. Ahora cada salida pertenece al día de su entrada.
//   2. FIX: las sugerencias de un turno ya no pisan las de los turnos de
//      debajo (se escriben de arriba abajo, desplazándose si hace falta).
//   3. Las sugerencias de descanso indican el día ("Descanso Domingo 16/11: …").
//
// Cambios de v29 respecto v28:
//   1. NUEVO: tras enviar los emails semanales de errores a los empleados,
//      se envía un email resumen a EMAIL_RESUMEN con lo enviado a cada uno
//      (y quién tenía errores pero no tiene email en la hoja EMPLEADOS).
//
// Cambios de v28 respecto v27:
//   1. FIX email semanal de errores: un turno cuya ENTRADA caía justo antes
//      del corte de 30 días y su SALIDA justo después salía como falso
//      "Sin entrada". Ahora se leen también los 2 días anteriores al corte
//      (solo para emparejar) y el corte se calcula por días de calendario
//      (antes se desplazaba un día con el cambio de hora).
//   2. onEdit(): al editar a mano una hoja ...ORIGINAL (columnas A-C) se
//      reordena y se recalculan las horas de turno, día y semana, igual que
//      en las hojas normales. NO se sincroniza con Supabase.
//
// Cambios de v27 respecto v26:
//   1. NUEVO: hoja "HORAS CONTRATO" (Empleado · Horas/semana · Desde · Notas).
//      analizarSeleccion() usa las horas semanales vigentes según la fecha de
//      la semana analizada. Si un empleado no tiene filas, usa REGLAS_EMPLEADOS.
//   2. Menú: "⏱ Crear hoja HORAS CONTRATO".
//   3. HOJAS_SISTEMA incluye 'HORAS CONTRATO' y 'HORARIO'.
//
// Cambios de v26 respecto v25:
//   1. FIX solicitudes de AÑADIR fichaje: al aprobar una solicitud cuya hora
//      actual es "—" (fichaje que no existía, p. ej. una salida olvidada),
//      antes no se escribía nada en la hoja del empleado ni en la ORIGINAL.
//      Ahora se inserta el fichaje nuevo en las dos (sin duplicar si ya existe).
//      Nueva función insertarFichajeAprobado().
//   2. NUEVO: reprocesarSolicitudesAprobadas() — vuelve a aplicar solicitudes
//      ya aprobadas que no llegaron a la hoja (pon sus IDs y ejecútala una vez).
//
// Cambios de v25 respecto v24:
//   1. NUEVO: función sincronizarEmpleadosASupabase() — sincroniza la hoja
//      EMPLEADOS con la tabla `empleados` de Supabase: crea los nuevos,
//      actualiza los existentes y marca como inactivos (activo=false) a los
//      que ya no estén en la hoja.
//   2. onEdit(): al editar la hoja EMPLEADOS se dispara automáticamente
//      sincronizarEmpleadosASupabase(), igual que ya pasaba con VACACIONES.
//   3. onOpen(): nuevo item de menú "👥 Sincronizar Empleados → Supabase"
//      para poder forzar la sincronización manualmente también.
//
// Cambios de v24 respecto v23:
//   1. JENNIFER: nueva entrada en REGLAS_EMPLEADOS con maxHSemana 14 (antes no
//      existía y heredaba el default sin límite semanal → nunca avisaba).
//   2. Nuevo TURNOS_FIJOS + helpers franjaDeTurno() / esTurnoFijo(). Jennifer
//      solo tiene horario fijo en: viernes noche, sábado mediodía, sábado noche
//      y domingo mediodía.
//   3. analizarSeleccion(): al detectar exceso semanal, si el empleado tiene
//      patrón fijo se proponen PRIMERO eliminaciones de los turnos fuera de
//      patrón (mayor a menor duración) y solo después se acorta el turno más
//      largo de los turnos válidos. Resto de controles (9 h/día, 12 h de
//      descanso, etc.) intactos.
//
// Cambios de v23 respecto v22:
//   1. analizarYEnviarErrores / obtenerErroresMes: el análisis ya no usa "ahora"
//      como límite superior, sino las 23:59:59 del día anterior (domingo).
//      Así un fichaje de ENTRADA del lunes en curso (turno abierto) no se
//      cuenta como "ENTRADA SIN SALIDA" — queda fuera de la ventana de análisis.
//   2. Nuevo email en HTML (diseño "tabla resumen"), con asunto y título
//      dinámicos: "🕒 <Nombre>, tienes N fichajes por revisar".
//   3. Resto del script sin cambios respecto a v22.
// ══════════════════════════════════════════════════════════════════════════════

// ── CONFIG ────────────────────────────────────────────────────────────────────
var SUPABASE_URL   = 'https://bseayyfvivnloqkswshb.supabase.co';
var SUPABASE_ANON  = 'sb_publishable_h5RF63turgcsro_2KSUA0A_375BDAFQ';
var NUEVO_DIA_MINS = 120;

var FROM_EMAIL = 'info@buenasysantas.es';
var FROM_NAME  = 'Buenas y Santas - RRHH';
// v29: dirección que recibe el resumen semanal de errores de fichaje.
// Cámbiala aquí si quieres recibirlo en otro correo.
var EMAIL_RESUMEN = FROM_EMAIL;

// TELEGRAM_TOKEN está en ClaveFichaje.js (no va a GitHub: el repositorio es público).
var TELEGRAM_CHAT_ID = '2083568111';

var HOJAS_SISTEMA = [
  'EMPLEADOS','SOLICITUDES','VACACIONES','CODIGOS','SOLICITUD VACACIONES',
  'ANÁLISIS','HORAS CONTRATO','HORARIO'
];

// ══════════════════════════════════════════════════════════════════════════════
// HELPERS SUPABASE REST
// ══════════════════════════════════════════════════════════════════════════════
function sbHeaders() {
  return {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_ANON,
    'Authorization': 'Bearer ' + SUPABASE_ANON,
  };
}

function sbGet(tabla, params) {
  var qs = Object.keys(params || {}).map(function(k) {
    return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
  }).join('&');
  var url = SUPABASE_URL + '/rest/v1/' + tabla + (qs ? '?' + qs : '');
  var res = UrlFetchApp.fetch(url, { headers: sbHeaders(), muteHttpExceptions: true });
  if (res.getResponseCode() >= 400) throw new Error('Supabase GET ' + res.getResponseCode() + ': ' + res.getContentText());
  return JSON.parse(res.getContentText());
}

function sbUpsert(tabla, body) {
  var res = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/' + tabla, {
    method: 'post',
    headers: Object.assign({}, sbHeaders(), { 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
    payload: JSON.stringify(body),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() >= 400) throw new Error('Supabase UPSERT ' + res.getResponseCode() + ': ' + res.getContentText());
}

function sbPatch(tabla, filtro, body) {
  var qs = Object.keys(filtro).map(function(k) {
    return encodeURIComponent(k) + '=' + encodeURIComponent(filtro[k]);
  }).join('&');
  var res = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/' + tabla + '?' + qs, {
    method: 'patch',
    headers: Object.assign({}, sbHeaders(), { 'Prefer': 'return=minimal' }),
    payload: JSON.stringify(body),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() >= 400) throw new Error('Supabase PATCH ' + res.getResponseCode() + ': ' + res.getContentText());
}

// ══════════════════════════════════════════════════════════════════════════════
// TELEGRAM
// ══════════════════════════════════════════════════════════════════════════════
function enviarTelegram(mensaje) {
  try {
    var url = 'https://api.telegram.org/bot' + TELEGRAM_TOKEN + '/sendMessage';
    UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: mensaje,
        parse_mode: 'HTML'
      })
    });
  } catch(e) {
    Logger.log('Error Telegram: ' + e);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// doGet
// ══════════════════════════════════════════════════════════════════════════════
function doGet(e) {
  var action   = e.parameter.action;
  var callback = e.parameter.callback;
  var result;
  try {
    if (action === 'getEmpleados') {
      result = getEmpleados();
    } else if (action === 'getFichajes') {
      result = getFichajes(e.parameter.nombre);
    } else if (action === 'getAllStatus') {
      result = getAllStatus();
    } else if (action === 'getSolicitudes') {
      result = getSolicitudes(e.parameter.emp || '');
    } else if (action === 'getSolicitudesVacaciones') {
      result = getSolicitudesVacaciones(e.parameter.emp || '');
    } else if (action === 'getVacaciones') {
      result = getVacaciones(e.parameter.nombre || '');
    } else if (action === 'guardarSolicitud') {
      result = guardarSolicitudInner(JSON.parse(e.parameter.data || '{}'));
    } else if (action === 'guardarSolicitudVacaciones') {
      result = guardarSolicitudVacacionesInner(JSON.parse(e.parameter.data || '{}'));
    } else if (action === 'aprobarSolicitudVacaciones') {
      result = aprobarSolicitudVacacionesInner(JSON.parse(e.parameter.data || '{}'));
    } else if (action === 'rechazarSolicitudVacaciones') {
      result = rechazarSolicitudVacacionesInner(JSON.parse(e.parameter.data || '{}'));
    } else if (action === 'aprobarSolicitud') {
      result = aprobarSolicitudInner(JSON.parse(e.parameter.data || '{}'));
    } else if (action === 'rechazarSolicitud') {
      result = rechazarSolicitudInner(JSON.parse(e.parameter.data || '{}'));
    } else if (action === 'cancelarSolicitud') {
      result = cancelarSolicitudInner(JSON.parse(e.parameter.data || '{}'));
    } else if (action === 'cancelarSolicitudVacaciones') {
      result = cancelarSolicitudVacacionesInner(JSON.parse(e.parameter.data || '{}'));
    } else if (action === 'enviarCodigo') {
      result = enviarCodigoInner(e.parameter.email, e.parameter.nombre);
    } else if (action === 'verificarCodigo') {
      result = verificarCodigoInner(e.parameter.email, e.parameter.codigo);
    } else if (action === 'cambiarPin') {
      result = cambiarPinInner(JSON.parse(e.parameter.data || '{}'));
    } else {
      result = [];
    }
  } catch (err) {
    result = { error: err.toString() };
  }
  var json = JSON.stringify(result);
  if (callback) {
    return ContentService
      .createTextOutput(callback + '(' + json + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

// ══════════════════════════════════════════════════════════════════════════════
// doPost
// ══════════════════════════════════════════════════════════════════════════════
function doPost(e) {
  try {
    var raw = (e.postData && e.postData.contents)
      ? e.postData.contents
      : (e.parameter && e.parameter.data ? e.parameter.data : '{}');
    var data = JSON.parse(raw);

    var action = data.action;
    if (action === 'addFichaje')                    return addFichaje(data);
    if (action === 'guardarSolicitud')              return resp(guardarSolicitudInner(data));
    if (action === 'guardarSolicitudVacaciones')    return resp(guardarSolicitudVacacionesInner(data));
    if (action === 'aprobarSolicitud')              return resp(aprobarSolicitudInner(data));
    if (action === 'aprobarSolicitudVacaciones')    return resp(aprobarSolicitudVacacionesInner(data));
    if (action === 'rechazarSolicitud')             return resp(rechazarSolicitudInner(data));
    if (action === 'rechazarSolicitudVacaciones')   return resp(rechazarSolicitudVacacionesInner(data));
    if (action === 'cancelarSolicitud')             return resp(cancelarSolicitudInner(data));
    if (action === 'cancelarSolicitudVacaciones')   return resp(cancelarSolicitudVacacionesInner(data));
    return resp({ ok: false, msg: 'Accion desconocida: ' + action });
  } catch (err) {
    return resp({ ok: false, msg: err.toString() });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// onEdit
// ══════════════════════════════════════════════════════════════════════════════
function onEdit(e) {
  try {
    var sheet     = e.range.getSheet();
    var sheetName = sheet.getName();

    if (sheetName === 'VACACIONES') {
      sincronizarVacacionesASupabase();
      return;
    }

    // ── NUEVO v25 · Sincronización automática de EMPLEADOS ──────────────────
    // Al editar cualquier celda de la hoja EMPLEADOS (añadir, quitar o
    // modificar una fila) se sincroniza automáticamente con Supabase:
    // crea los nuevos, actualiza los existentes y marca como inactivos
    // (activo=false) a los que ya no estén en la hoja.
    if (sheetName === 'EMPLEADOS') {
      sincronizarEmpleadosASupabase();
      return;
    }

    if (HOJAS_SISTEMA.indexOf(sheetName) !== -1) return;

    var col = e.range.getColumn();
    var row = e.range.getRow();

    if (row < 2 || col > 3) return;

    reordenarHoja(sheet);
    recalcularHoja(sheet);

    // v28: las hojas ORIGINAL se reordenan y recalculan igual que las
    // normales, pero NO se sincronizan con Supabase.
    if (sheetName.indexOf('ORIGINAL') !== -1) return;

    sincronizarEmpleadoASupabase(sheetName, sheet);

    // NOTA: se ha quitado a propósito el bloque que sincronizaba la hoja
    // ORIGINAL en cada edición manual de esta hoja. Ese bloque comparaba
    // fecha+tipo+hora y, si no encontraba una coincidencia EXACTA (porque
    // habías corregido una hora a mano), añadía una línea NUEVA a ORIGINAL
    // dejando también la vieja — es decir, duplicaba en vez de corregir.
    // Ahora ORIGINAL solo se modifica en dos sitios:
    //   1. addFichaje() — al fichar desde la app (entrada/salida real).
    //   2. aprobarSolicitudInner() — al aprobar una solicitud de cambio de
    //      hora desde la app, que sí busca la fila exacta y la actualiza o
    //      la elimina, sin duplicar nada.
    // Cualquier edición manual directa en la hoja del empleado (fuera de la
    // app) ya NO toca ORIGINAL.

  } catch(err) {
    Logger.log('onEdit error: ' + err);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// onOpen — menú
// ══════════════════════════════════════════════════════════════════════════════
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🔄 Fichajes')
    .addItem('📋 Analizar semana (nuevo)', 'analizarSeleccion')
    .addSeparator()
    .addItem('📋 Analizar selección (antiguo)', 'analizarSeleccionAntiguo')
    .addItem('✅ Aplicar cambios marcados (antiguo)', 'aplicarCambiosMarcados')
    .addItem('🗑 Borrar análisis (columnas H-J)', 'borrarAnalisis')
    .addSeparator()
    .addItem('🏖 Sincronizar Vacaciones → Supabase', 'sincronizarTodasVacaciones')
    .addItem('👥 Sincronizar Empleados → Supabase', 'sincronizarEmpleadosASupabase')
    .addItem('⏱ Crear hoja HORAS CONTRATO', 'crearHojaHorasContrato')
    .addSeparator()
    .addItem('📅 Rellenar horario semanal', 'rellenarHorarioSemanal')
    .addToUi();
}

// ── FIX 1: clearDataValidations() elimina los checkboxes ─────────────────────
function borrarAnalisis() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var nombre = sheet.getName();
  if (HOJAS_SISTEMA.indexOf(nombre) !== -1 || nombre.indexOf('ORIGINAL') !== -1) return;
  var lastRow = sheet.getLastRow();
  if (lastRow >= 1) {
    sheet.getRange(1, 8, lastRow, 3)
      .clearContent()
      .clearFormat()
      .clearNote()
      .clearDataValidations();
  }
}

function sincronizarTodoASupabase() {
  var ss     = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  var n      = 0;
  sheets.forEach(function(sheet) {
    var nombre = sheet.getName();
    if (HOJAS_SISTEMA.indexOf(nombre) !== -1) return;
    if (nombre.indexOf('ORIGINAL') !== -1) return;
    sincronizarEmpleadoASupabase(nombre, sheet);
    n++;
  });
  SpreadsheetApp.getUi().alert('✅ Sincronizadas ' + n + ' hojas a Supabase.');
}

function recalcularTodas() {
  var ss     = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  sheets.forEach(function(sheet) {
    var nombre = sheet.getName();
    if (HOJAS_SISTEMA.indexOf(nombre) !== -1) return;
    if (nombre.indexOf('ORIGINAL') !== -1) return;
    reordenarHoja(sheet);
    recalcularHoja(sheet);
  });
  SpreadsheetApp.getUi().alert('✅ Todas las hojas recalculadas.');
}

// ══════════════════════════════════════════════════════════════════════════════
// SINCRONIZACIÓN FICHAJES CON SUPABASE
// ══════════════════════════════════════════════════════════════════════════════
function getNombreSupabase(nombreHoja) {
  try {
    var res = UrlFetchApp.fetch(
      SUPABASE_URL + '/rest/v1/empleados?select=nombre&activo=eq.true&order=nombre.asc&nombre=ilike.' + encodeURIComponent(nombreHoja.replace(/,/g, ' ').trim().split(/\s+/)[0] + '*'),
      { headers: sbHeaders(), muteHttpExceptions: true }
    );
    var rows = JSON.parse(res.getContentText());
    if (rows && rows.length > 0) return rows[0].nombre;
  } catch(e) {}
  return nombreHoja;
}

function sincronizarEmpleadoASupabase(nombre, sheet) {
  if (sheet.getName().indexOf('ORIGINAL') !== -1) return;

  nombre = getNombreSupabase(nombre);
  var range   = sheet.getDataRange();
  var vals    = range.getValues();
  var display = range.getDisplayValues();
  var start   = (vals.length > 0 && String(vals[0][1]).toUpperCase() === 'TIPO') ? 1 : 0;

  var filas = [];
  for (var i = start; i < vals.length; i++) {
    var fechaRaw = vals[i][0];
    var tipo     = String(vals[i][1] || '').toUpperCase().trim();
    var hora     = normHora(String(display[i][2] || '').substring(0, 5));
    if (!fechaRaw || (tipo !== 'ENTRADA' && tipo !== 'SALIDA')) continue;
    var fechaISO = toISOFromCell(fechaRaw) || toISO(String(fechaRaw));
    if (!fechaISO) continue;
    filas.push({
      empleado_nombre: nombre,
      fecha:           fechaISO,
      tipo:            tipo,
      hora:            hora,
      hora_turno:      String(vals[i][3] || ''),
      hora_dia:        String(vals[i][4] || ''),
    });
  }

  try {
    UrlFetchApp.fetch(
      SUPABASE_URL + '/rest/v1/fichajes?empleado_nombre=eq.' + encodeURIComponent(nombre),
      {
        method: 'delete',
        headers: Object.assign({}, sbHeaders(), { 'Prefer': 'return=minimal' }),
        muteHttpExceptions: true,
      }
    );
    if (filas.length > 0) {
      sbUpsert('fichajes', filas);
    }
    Logger.log('Sincronizado ' + filas.length + ' fichajes de ' + nombre);
  } catch(err) {
    Logger.log('Error sincronizando ' + nombre + ': ' + err);
  }
}

function sincronizarTodasVacaciones() {
  sincronizarVacacionesASupabase();
  SpreadsheetApp.getUi().alert('✅ Vacaciones sincronizadas a Supabase.');
}

function sincronizarVacacionesASupabase() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('VACACIONES');
  if (!sheet) return;

  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 2) return;

  var vals    = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  var display = sheet.getRange(1, 1, lastRow, lastCol).getDisplayValues();

  var COL_TOTAL = 16;
  var NOMBRES_IGNORAR = [
    'VACACIONES 2026','PEDIDO VACACIONES','JUNIO','JULIO','AGOSTO',
    'SEPTIEMBRE','NUEVO 2','NUEVO 3',''
  ];

  function etiquetaDesdeDisplay(displayVal) {
    var s = String(displayVal || '').trim();
    if (!s) return null;
    return s;
  }

  function parseNum(raw, dsp) {
    if (raw === '' || raw === null || raw === undefined) return null;
    if (typeof raw === 'number') return raw;
    var n = parseFloat(String(dsp).replace(',', '.'));
    if (!isNaN(n)) return n;
    n = parseFloat(String(raw).replace(',', '.'));
    return isNaN(n) ? null : n;
  }

  var empSheet = ss.getSheetByName('EMPLEADOS');
  var empRows  = empSheet ? empSheet.getDataRange().getValues() : [];

  function buscarNombreCompleto(nombreCorto) {
    var nc = nombreCorto.toLowerCase().trim();
    for (var ei = 0; ei < empRows.length; ei++) {
      var en = String(empRows[ei][0] || '').trim();
      if (!en) continue;
      if (en.toLowerCase().indexOf(nc) === 0) return en;
    }
    return nombreCorto;
  }

  var registros = [];

  for (var i = 0; i < lastRow - 1; i++) {
    var nombreCelda = String(vals[i][0] || '').trim();
    if (!nombreCelda) continue;
    if (NOMBRES_IGNORAR.indexOf(nombreCelda) !== -1) continue;

    var filaValores    = vals[i + 1];
    var filaValoresDsp = display[i + 1];
    var filaEtiqDsp    = display[i];

    if (String(filaValores[0] || '').trim() !== '') continue;

    var conceptos = [];
    for (var c = 1; c <= 15 && c < lastCol; c++) {
      var etiqueta = etiquetaDesdeDisplay(filaEtiqDsp[c]);
      if (!etiqueta) continue;
      var num = parseNum(filaValores[c], filaValoresDsp[c]);
      if (num === null) continue;
      conceptos.push({ etiqueta: etiqueta, valor: num });
    }

    if (!conceptos.length) continue;

    var totalNum       = parseNum(filaValores[COL_TOTAL], filaValoresDsp[COL_TOTAL]);
    var nombreCompleto = buscarNombreCompleto(nombreCelda);
    var unidad         = nombreCompleto.toLowerCase().indexOf('richard') !== -1 ? 'días' : 'horas';

    registros.push({
      empleado_nombre: nombreCompleto,
      conceptos:       JSON.stringify(conceptos),
      total:           totalNum,
      unidad:          unidad
    });
  }

  registros.forEach(function(emp) {
    try {
      var checkRes = UrlFetchApp.fetch(
        SUPABASE_URL + '/rest/v1/vacaciones?empleado_nombre=eq.' + encodeURIComponent(emp.empleado_nombre) + '&select=id',
        { headers: sbHeaders(), muteHttpExceptions: true }
      );
      var existing = JSON.parse(checkRes.getContentText());

      if (existing && existing.length > 0) {
        UrlFetchApp.fetch(
          SUPABASE_URL + '/rest/v1/vacaciones?empleado_nombre=eq.' + encodeURIComponent(emp.empleado_nombre),
          {
            method: 'patch',
            headers: Object.assign({}, sbHeaders(), { 'Prefer': 'return=minimal' }),
            payload: JSON.stringify({ conceptos: emp.conceptos, total: emp.total, unidad: emp.unidad }),
            muteHttpExceptions: true
          }
        );
        Logger.log('Vacaciones actualizadas: ' + emp.empleado_nombre);
      } else {
        UrlFetchApp.fetch(
          SUPABASE_URL + '/rest/v1/vacaciones',
          {
            method: 'post',
            headers: Object.assign({}, sbHeaders(), { 'Prefer': 'return=minimal' }),
            payload: JSON.stringify(emp),
            muteHttpExceptions: true
          }
        );
        Logger.log('Vacaciones insertadas: ' + emp.empleado_nombre);
      }
    } catch(err) {
      Logger.log('Error vacaciones ' + emp.empleado_nombre + ': ' + err);
    }
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// SINCRONIZACIÓN EMPLEADOS CON SUPABASE (v25b — corregida)
// ══════════════════════════════════════════════════════════════════════════════
// Cambios respecto a la v25 original:
//   1. Antes: 2 peticiones HTTP por empleado (GET comprobar + PATCH/POST).
//      Ahora: UN SOLO upsert masivo con todos los empleados a la vez
//      (igual que ya se hace con la tabla `fichajes`). Mucho más rápido y
//      ya no depende de que dé tiempo a completar 2×N peticiones antes de
//      que Google corte la ejecución (el límite es de solo 30s si esto se
//      dispara desde onEdit, al ser un trigger simple).
//   2. Ahora SÍ se comprueba el código de respuesta HTTP en cada llamada.
//      Antes, un error de Supabase (constraint duplicado, campo obligatorio
//      vacío, etc.) pasaba totalmente desapercibido.
//   3. alert() → toast(): alert() es BLOQUEANTE, abre un modal y la
//      ejecución no se da por terminada hasta que alguien le da a "OK" en
//      la hoja. Eso hacía parecer que el script se quedaba colgado. toast()
//      se muestra en la esquina y desaparece solo, sin bloquear nada.
//
// IMPORTANTE: para que el upsert masivo funcione, la columna "nombre" de la
// tabla `empleados` en Supabase debe tener una restricción UNIQUE (o ser la
// clave primaria). Si no la tiene, ejecuta una vez en el SQL Editor de
// Supabase:
//   ALTER TABLE empleados ADD CONSTRAINT empleados_nombre_key UNIQUE (nombre);
function sincronizarEmpleadosASupabase() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('EMPLEADOS');
  if (!sheet) {
    Logger.log('sincronizarEmpleadosASupabase: no se encontró la hoja EMPLEADOS.');
    return;
  }

  var rows  = sheet.getDataRange().getValues();
  var start = (rows.length > 0 && isNaN(rows[0][3])) ? 1 : 0;

  var nombresSheet = [];
  var payloads = [];

  for (var i = start; i < rows.length; i++) {
    var nombre = String(rows[i][0] || '').trim();
    if (!nombre) continue;
    nombresSheet.push(nombre);

    // Columnas reales de la hoja EMPLEADOS: A=Empleado, B=Nº Afiliación, C=dni, D=pin, E=mail
    // IMPORTANTE: si el email está vacío se manda `null`, no ''. La columna
    // `email` tiene un UNIQUE constraint en Supabase, y Postgres SÍ permite
    // varios NULL en una columna UNIQUE, pero NO permite dos '' (cadena
    // vacía) — dos empleados sin email mandando '' provocaba el error 409
    // "duplicate key value violates unique constraint empleados_email_key".
    var emailEmp = String(rows[i][4] || '').trim();
    var dniEmp   = String(rows[i][2] || '').trim();
    var numAfil  = String(rows[i][1] || '').trim();
    payloads.push({
      nombre: nombre,
      pin: String(rows[i][3] || '').trim(),
      activo: true,
      email: emailEmp !== '' ? emailEmp : null,
      dni: dniEmp !== '' ? dniEmp : null,
      num_afiliacion: numAfil !== '' ? numAfil : null
    });
  }

  var errores = [];
  var n = 0;

  if (payloads.length > 0) {
    try {
      // on_conflict=nombre: le decimos a Supabase que si ya existe una fila
      // con ese "nombre" debe actualizarla (UPDATE), no intentar insertar una
      // nueva. Sin esto, Supabase decide conflictos por la clave primaria
      // (un id que no mandamos), así que trataba cada fila como un INSERT
      // nuevo -> chocaba contra el email/nombre ya existentes -> error 409.
      var res = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/empleados?on_conflict=nombre', {
        method: 'post',
        headers: Object.assign({}, sbHeaders(), {
          'Prefer': 'resolution=merge-duplicates,return=minimal'
        }),
        payload: JSON.stringify(payloads),
        muteHttpExceptions: true
      });
      var code = res.getResponseCode();
      if (code >= 400) {
        var msg = 'Error ' + code + ' al sincronizar empleados: ' + res.getContentText();
        Logger.log(msg);
        errores.push(msg);
      } else {
        n = payloads.length;
        Logger.log('Sincronizados ' + n + ' empleados en un solo upsert.');
      }
    } catch (err) {
      var msg2 = 'Excepción al sincronizar empleados: ' + err;
      Logger.log(msg2);
      errores.push(msg2);
    }
  }

  // Desactivar en Supabase a quien ya no esté en la hoja EMPLEADOS
  try {
    var todosRes = UrlFetchApp.fetch(
      SUPABASE_URL + '/rest/v1/empleados?select=nombre,activo',
      { headers: sbHeaders(), muteHttpExceptions: true }
    );
    if (todosRes.getResponseCode() >= 400) {
      var msg3 = 'Error ' + todosRes.getResponseCode() + ' al leer empleados existentes: ' + todosRes.getContentText();
      Logger.log(msg3);
      errores.push(msg3);
    } else {
      var todosSb = JSON.parse(todosRes.getContentText());
      var aDesactivar = todosSb.filter(function(e) {
        return nombresSheet.indexOf(e.nombre) === -1 && e.activo;
      });
      aDesactivar.forEach(function(e) {
        var resD = UrlFetchApp.fetch(
          SUPABASE_URL + '/rest/v1/empleados?nombre=eq.' + encodeURIComponent(e.nombre),
          {
            method: 'patch',
            headers: Object.assign({}, sbHeaders(), { 'Prefer': 'return=minimal' }),
            payload: JSON.stringify({ activo: false }),
            muteHttpExceptions: true
          }
        );
        if (resD.getResponseCode() >= 400) {
          var msg4 = 'Error ' + resD.getResponseCode() + ' al desactivar ' + e.nombre + ': ' + resD.getContentText();
          Logger.log(msg4);
          errores.push(msg4);
        } else {
          Logger.log('Empleado desactivado en Supabase (ya no está en la hoja): ' + e.nombre);
        }
      });
    }
  } catch (err) {
    var msg5 = 'Excepción al desactivar empleados de baja: ' + err;
    Logger.log(msg5);
    errores.push(msg5);
  }

  Logger.log('sincronizarEmpleadosASupabase completado. Procesados: ' + n + '. Errores: ' + errores.length);

  // toast() en vez de alert(): no bloquea la ejecución y desaparece solo.
  try {
    if (errores.length > 0) {
      SpreadsheetApp.getActiveSpreadsheet().toast(
        errores.slice(0, 2).join(' | '),
        '⚠️ ' + n + ' sincronizados, ' + errores.length + ' error(es) — ver Registros',
        8
      );
    } else {
      SpreadsheetApp.getActiveSpreadsheet().toast(
        'Los que ya no están en la hoja se han marcado como inactivos.',
        '✅ ' + n + ' empleado(s) sincronizados con Supabase',
        5
      );
    }
  } catch (e) {
    // Sin hoja activa disponible (ejecución desde trigger instalable sin interfaz)
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// LECTURA DE DATOS
// ══════════════════════════════════════════════════════════════════════════════
function getEmpleados() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('EMPLEADOS');
  if (!sheet) return [];
  var rows  = sheet.getDataRange().getValues();
  var start = (rows.length > 0 && isNaN(rows[0][3])) ? 1 : 0;
  return rows.slice(start).filter(function(r) { return String(r[0]).trim() !== ''; });
}

function getFichajes(nombre) {
  if (!nombre) return [];
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getHojaEmpleado(ss, nombre);
  if (!sheet) return [];
  var range   = sheet.getDataRange();
  var rows    = range.getValues();
  var display = range.getDisplayValues();
  var start   = (rows.length > 0 && String(rows[0][1]).toUpperCase() === 'TIPO') ? 1 : 0;
  var result  = [];
  for (var i = start; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === '') continue;
    result.push([
      formatFecha(rows[i][0]),
      String(rows[i][1] || '').toUpperCase().trim(),
      horaConSegsDeRaw(rows[i][2], display[i][2]),
      String(rows[i][3] || ''),
      String(rows[i][4] || ''),
      String(rows[i][5] || '')
    ]);
  }
  return result;
}

function getAllStatus() {
  var ss       = SpreadsheetApp.getActiveSpreadsheet();
  var empSheet = ss.getSheetByName('EMPLEADOS');
  if (!empSheet) return {};
  var empRows = empSheet.getDataRange().getValues();
  var start   = (empRows.length > 0 && isNaN(empRows[0][3])) ? 1 : 0;
  var result  = {};
  for (var i = start; i < empRows.length; i++) {
    var nombre = String(empRows[i][0] || '').trim();
    if (!nombre) continue;
    var sheet = getHojaEmpleado(ss, nombre);
    if (!sheet) { result[nombre] = null; continue; }
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) { result[nombre] = null; continue; }
    var rng2    = sheet.getRange(2, 1, 1, 3);
    var vals    = rng2.getValues();
    var display = rng2.getDisplayValues();
    result[nombre] = {
      fecha: formatFecha(vals[0][0]),
      tipo:  String(vals[0][1] || '').toUpperCase().trim(),
      hora:  horaConSegsDeRaw(vals[0][2], display[0][2])
    };
  }
  return result;
}

function getSolicitudes(emp) {
  var ss      = SpreadsheetApp.getActiveSpreadsheet();
  var sheet   = ss.getSheetByName('SOLICITUDES');
  if (!sheet) return [];
  var rows    = sheet.getDataRange().getValues();
  var display = sheet.getDataRange().getDisplayValues();
  if (rows.length < 2) return [];

  var header = rows[0];
  var esFormatoNuevo = (String(header[2] || '').toLowerCase().indexOf('entrada') !== -1 ||
                        String(header[3] || '').toLowerCase().indexOf('nueva')   !== -1 ||
                        String(header[10]|| '').toLowerCase().indexOf('cambia')  !== -1);
  var result = [];
  for (var i = 1; i < rows.length; i++) {
    var r = rows[i];
    var d = display[i];
    if (!String(r[0]).trim()) continue;
    if (emp && String(r[1]).trim() !== emp.trim()) continue;

    if (esFormatoNuevo) {
      var cambiaE  = (r[10] === true || String(r[10]).toLowerCase() === 'true');
      var cambiaS  = (r[11] === true || String(r[11]).toLowerCase() === 'true');
      var elimina  = (r[16] === true || String(r[16] || '').toLowerCase() === 'true');
      result.push({
        id: String(r[0]), emp: String(r[1]),
        fechaEntradaOrig:  toISOFromCell(r[2])  || toISO(String(r[2])),
        fechaEntradaNueva: toISOFromCell(r[3])  || toISO(String(r[3])),
        horaEntradaActual: normHora(String(r[4]  || d[4])),
        horaEntradaNueva:  normHora(String(r[5]  || d[5])),
        fechaSalidaOrig:   toISOFromCell(r[6])  || toISO(String(r[6])),
        fechaSalidaNueva:  toISOFromCell(r[7])  || toISO(String(r[7])),
        horaSalidaActual:  normHora(String(r[8]  || d[8])),
        horaSalidaNueva:   normHora(String(r[9]  || d[9])),
        cambiaEntrada: cambiaE, cambiaSalida: cambiaS,
        motivo: String(r[12] || ''), estado: String(r[13] || 'pendiente'),
        fechaReq: fmtFechaReq(r[14]), emailEmp: String(r[15] || ''),
        eliminarTurno: elimina,
        fecha: toISOFromCell(r[2]) || toISO(String(r[2])),
        tipo: cambiaE ? 'ENTRADA' : 'SALIDA',
        horaActual: normHora(String(d[4]).substring(0,5)),
        horaNueva:  normHora(String(d[5]).substring(0,5)),
        fechaNueva: toISOFromCell(r[3]) || toISO(String(r[3]))
      });
    } else {
      var esE      = (String(r[3]).trim().toUpperCase() === 'ENTRADA');
      var fechaISO = toISOFromCell(r[2]) || toISO(String(r[2]));
      var fechaNISO= r[10] ? (toISOFromCell(r[10]) || toISO(String(r[10]))) : fechaISO;
      var horaAct  = normHora(String(d[4]).substring(0,5));
      var horaNva  = normHora(String(d[5]).substring(0,5));
      result.push({
        id: String(r[0]), emp: String(r[1]),
        fecha: fechaISO, tipo: String(r[3]),
        horaActual: horaAct, horaNueva: horaNva,
        motivo: String(r[6] || ''), estado: String(r[7] || 'pendiente'),
        fechaReq: fmtFechaReq(r[8]), emailEmp: String(r[9] || ''),
        fechaNueva: fechaNISO, turnoEntrada: String(r[11] || ''), turnoSalida: String(r[12] || ''),
        eliminarTurno: false,
        fechaEntradaOrig: fechaISO, fechaEntradaNueva: esE ? fechaNISO : fechaISO,
        horaEntradaActual: esE ? horaAct : normHora(String(r[11]||'')),
        horaEntradaNueva:  esE ? horaNva : normHora(String(r[11]||'')),
        fechaSalidaOrig: fechaISO, fechaSalidaNueva: !esE ? fechaNISO : fechaISO,
        horaSalidaActual: !esE ? horaAct : normHora(String(r[12]||'')),
        horaSalidaNueva:  !esE ? horaNva : normHora(String(r[12]||'')),
        cambiaEntrada: esE, cambiaSalida: !esE
      });
    }
  }
  return result;
}

function getSolicitudesVacaciones(emp) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('SOLICITUD VACACIONES');
  if (!sheet) return [];
  var rows = sheet.getDataRange().getValues();
  if (rows.length < 2) return [];
  var result = [];
  for (var i = 1; i < rows.length; i++) {
    var r = rows[i];
    if (!String(r[0]).trim()) continue;
    if (emp && String(r[1]).trim() !== emp.trim()) continue;
    result.push({
      id: String(r[0]), emp: String(r[1]),
      desde:    toISOFromCell(r[2]) || toISO(String(r[2])),
      hasta:    toISOFromCell(r[3]) || toISO(String(r[3])),
      motivo:   String(r[4] || ''), estado: String(r[5] || 'pendiente'),
      fechaReq: fmtFechaReq(r[6]),  emailEmp: String(r[7] || '')
    });
  }
  return result;
}

function getVacaciones(nombreBuscado) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('VACACIONES');
  if (!sheet) return null;
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 2) return null;
  var vals    = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  var display = sheet.getRange(1, 1, lastRow, lastCol).getDisplayValues();
  var COL_TOTAL = 16;
  var DIAS_ES  = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
  var MESES_ES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto',
                  'septiembre','octubre','noviembre','diciembre'];

  function formatearEtiqueta(v) {
    if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) {
      var tz  = Session.getScriptTimeZone();
      var año = parseInt(Utilities.formatDate(v, tz, 'yyyy'), 10);
      var mes = parseInt(Utilities.formatDate(v, tz, 'M'), 10) - 1;
      var dia = parseInt(Utilities.formatDate(v, tz, 'd'), 10);
      var dow = parseInt(Utilities.formatDate(v, tz, 'u'), 10) % 7;
      var dn  = DIAS_ES[dow];
      return dn.charAt(0).toUpperCase() + dn.slice(1) + ', ' + dia + ' de ' + MESES_ES[mes] + ' ' + año;
    }
    var s = String(v || '').trim();
    if (s.match(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s/)) {
      var d = new Date(s);
      if (!isNaN(d.getTime())) {
        var dn2 = DIAS_ES[d.getDay()];
        return dn2.charAt(0).toUpperCase() + dn2.slice(1) + ', ' + d.getDate() + ' de ' + MESES_ES[d.getMonth()] + ' ' + d.getFullYear();
      }
    }
    return s;
  }

  function parseNum(raw, dsp) {
    if (raw === '' || raw === null || raw === undefined) return null;
    if (typeof raw === 'number') return raw;
    var n = parseFloat(String(dsp).replace(',', '.'));
    if (!isNaN(n)) return n;
    n = parseFloat(String(raw).replace(',', '.'));
    return isNaN(n) ? 0 : n;
  }

  for (var i = 0; i < lastRow - 1; i++) {
    var nombreCelda = String(vals[i][0] || '').trim();
    if (!nombreCelda) continue;
    var nombreNorm = nombreCelda.toLowerCase();
    var buscNorm   = nombreBuscado.toLowerCase().split(' ')[0];
    if (nombreNorm.indexOf(buscNorm) === -1 && buscNorm.indexOf(nombreNorm) === -1) continue;
    var filaArriba   = vals[i];
    var filaAbajo    = vals[i + 1];
    var filaAbajoDsp = display[i + 1];
    var conceptos = [];
    for (var c = 1; c <= 15; c++) {
      var etiqueta = formatearEtiqueta(filaArriba[c]);
      var valorRaw = filaAbajo[c];
      if (!etiqueta && (valorRaw === '' || valorRaw === null || valorRaw === undefined)) continue;
      conceptos.push({ etiqueta: etiqueta, valor: parseNum(valorRaw, filaAbajoDsp[c]) });
    }
    var totalNum = parseNum(filaAbajo[COL_TOTAL], filaAbajoDsp[COL_TOTAL]);
    var anioActual = '';
    for (var ci = 0; ci < conceptos.length; ci++) {
      if (/^\d{4}$/.test(conceptos[ci].etiqueta)) { anioActual = conceptos[ci].etiqueta; break; }
    }
    return {
      nombre: nombreCelda, anioActual: anioActual,
      conceptos: conceptos, total: totalNum,
      unidad: nombreNorm === 'richard' ? 'días' : 'horas'
    };
  }
  return null;
}

// ══════════════════════════════════════════════════════════════════════════════
// FICHAJES — addFichaje
// ══════════════════════════════════════════════════════════════════════════════
function addFichaje(data) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getHojaEmpleado(ss, data.nombre);
  if (!sheet) return resp({ ok: false, msg: 'Hoja no encontrada: ' + data.nombre });

  asegurarCabecera(sheet);
  sheet.insertRowBefore(2);
  sheet.getRange(2, 1).setNumberFormat('@STRING@');
  sheet.getRange(2, 3).setNumberFormat('@STRING@');
  sheet.getRange(2, 1, 1, 7).setValues([[
    fechaConDia(data.fecha) || data.fecha || '',
    data.tipo  || '',
    data.hora  || '',
    '', '', '', ''
  ]]);
  reordenarHoja(sheet);
  recalcularHoja(sheet);
  sincronizarEmpleadoASupabase(sheet.getName(), sheet);

  var nombreOriginal = sheet.getName().split(' ')[0] + 'ORIGINAL';
  var sheetOrig = ss.getSheetByName(nombreOriginal);
  if (sheetOrig) {
    asegurarCabecera(sheetOrig);
    sheetOrig.insertRowBefore(2);
    sheetOrig.getRange(2, 1).setNumberFormat('@STRING@');
    sheetOrig.getRange(2, 3).setNumberFormat('@STRING@');
    sheetOrig.getRange(2, 1, 1, 7).setValues([[
      fechaConDia(data.fecha) || data.fecha || '',
      data.tipo  || '',
      data.hora  || '',
      '', '', '', ''
    ]]);
    reordenarHoja(sheetOrig);
    recalcularHoja(sheetOrig);
  }

  return resp({ ok: true });
}

// ══════════════════════════════════════════════════════════════════════════════
// SOLICITUDES DE CAMBIO DE HORARIO
// ══════════════════════════════════════════════════════════════════════════════
function guardarSolicitudInner(data) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('SOLICITUDES');
  if (!sheet) {
    sheet = ss.insertSheet('SOLICITUDES');
    sheet.appendRow([
      'ID','Empleado',
      'FechaEntradaOrig','FechaEntradaNueva','HoraEntradaActual','HoraEntradaNueva',
      'FechaSalidaOrig','FechaSalidaNueva','HoraSalidaActual','HoraSalidaNueva',
      'CambiaEntrada','CambiaSalida','Motivo','Estado','FechaSolicitud','EmailEmpleado','EliminarTurno'
    ]);
  }

  var id  = data.id || ('SOL-' + Date.now());
  var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy, HH:mm');

  var fEntradaOrig  = isoToDisplay(data.fechaEntradaOrig)  || data.fechaEntradaOrig  || '';
  var fEntradaNueva = isoToDisplay(data.fechaEntradaNueva) || data.fechaEntradaNueva || fEntradaOrig;
  var fSalidaOrig   = isoToDisplay(data.fechaSalidaOrig)   || data.fechaSalidaOrig   || '';
  var fSalidaNueva  = isoToDisplay(data.fechaSalidaNueva)  || data.fechaSalidaNueva  || fSalidaOrig;

  var cambiaEntrada = (data.cambiaEntrada === true || data.cambiaEntrada === 'true');
  var cambiaSalida  = (data.cambiaSalida  === true || data.cambiaSalida  === 'true');
  var eliminarTurno = (data.eliminarTurno === true || data.eliminarTurno === 'true');

  data.horaEntradaActual = normHora(data.horaEntradaActual || '—');
  data.horaEntradaNueva  = normHora(data.horaEntradaNueva  || '—');
  data.horaSalidaActual  = normHora(data.horaSalidaActual  || '—');
  data.horaSalidaNueva   = normHora(data.horaSalidaNueva   || '—');

  sheet.insertRowAfter(1);
  var rng = sheet.getRange(2, 1, 1, 17);
  rng.getCell(1,  5).setNumberFormat('@STRING@');
  rng.getCell(1,  6).setNumberFormat('@STRING@');
  rng.getCell(1,  9).setNumberFormat('@STRING@');
  rng.getCell(1, 10).setNumberFormat('@STRING@');
  rng.getCell(1, 15).setNumberFormat('@STRING@');
  rng.setValues([[
    id, data.emp || '',
    fEntradaOrig, fEntradaNueva, data.horaEntradaActual, data.horaEntradaNueva,
    fSalidaOrig,  fSalidaNueva,  data.horaSalidaActual,  data.horaSalidaNueva,
    cambiaEntrada, cambiaSalida,
    data.motivo || '', 'pendiente', now, data.emailEmp || '', eliminarTurno
  ]]);

  var soloSheet = (data.soloSheet === true || data.soloSheet === 'true');
  if (soloSheet) return { ok: true, id: id };

  if (eliminarTurno) {
    var partes = [];
    if (cambiaEntrada) partes.push('ENTRADA ' + fEntradaOrig + ' ' + data.horaEntradaActual);
    if (cambiaSalida)  partes.push('SALIDA '  + fSalidaOrig  + ' ' + data.horaSalidaActual);
    enviarTelegram('🗑 <b>Solicitud de ELIMINACIÓN de fichaje</b>\n\n<b>' + data.emp + '</b>\n\n'
      + partes.join('\n') + '\n'
      + (data.motivo && data.motivo !== '—' ? 'Motivo: ' + data.motivo + '\n' : '')
      + (data.emailEmp ? 'Email: ' + data.emailEmp + ' ' + now : ''));
    return { ok: true, id: id };
  }

  var tituloCambio = '';
  var hayFE = cambiaEntrada && fEntradaNueva && fEntradaNueva !== fEntradaOrig;
  var hayFS = cambiaSalida  && fSalidaNueva  && fSalidaNueva  !== fSalidaOrig;
  if      (cambiaEntrada && cambiaSalida) tituloCambio = (hayFE || hayFS) ? 'CAMBIO ENTRADA Y SALIDA HORARIO Y FECHA' : 'CAMBIO ENTRADA Y SALIDA HORARIO';
  else if (cambiaEntrada)                 tituloCambio = hayFE ? 'CAMBIO ENTRADA HORARIO Y FECHA' : 'CAMBIO SOLO ENTRADA HORARIO';
  else if (cambiaSalida)                  tituloCambio = hayFS ? 'CAMBIO SALIDA HORARIO Y FECHA'  : 'CAMBIO SOLO SALIDA HORARIO';

  var lineaE = cambiaEntrada
    ? (hayFE ? 'ENTRADA: <s>' + fEntradaOrig + '</s> <s>' + data.horaEntradaActual + '</s> → ' + fEntradaNueva + ' ' + data.horaEntradaNueva
             : 'ENTRADA: ' + fEntradaOrig + ' <s>' + data.horaEntradaActual + '</s> → ' + data.horaEntradaNueva)
    : 'ENTRADA: ' + fEntradaOrig + ' ' + data.horaSalidaActual;

  var lineaS = cambiaSalida
    ? (hayFS ? 'SALIDA: <s>' + fSalidaOrig + '</s> <s>' + data.horaSalidaActual + '</s> → ' + fSalidaNueva + ' ' + data.horaSalidaNueva
             : 'SALIDA: ' + fSalidaOrig + ' <s>' + data.horaSalidaActual + '</s> → ' + data.horaSalidaNueva)
    : 'SALIDA: ' + fSalidaOrig + ' ' + data.horaEntradaActual;

  enviarTelegram('🔄 <b>' + tituloCambio + '</b>\n<b>' + data.emp + '</b>\n\n'
    + lineaE + '\n' + lineaS + '\n'
    + (data.motivo && data.motivo !== '—' ? 'Motivo: ' + data.motivo + '\n' : '')
    + (data.emailEmp ? 'Email: ' + data.emailEmp + ' ' + now : ''));

  return { ok: true, id: id };
}
function guardarSolicitud(data) { return resp(guardarSolicitudInner(data)); }

function guardarSolicitudVacacionesInner(data) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('SOLICITUD VACACIONES');
  if (!sheet) {
    sheet = ss.insertSheet('SOLICITUD VACACIONES');
    sheet.appendRow(['ID','Empleado','Desde','Hasta','Motivo','Estado','Fecha solicitud','Email empleado']);
  }
  var id  = 'VAC-' + Date.now();
  var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy, HH:mm');
  var desdeDisplay = isoToDisplay(data.desde) || data.desde;
  var hastaDisplay = isoToDisplay(data.hasta) || data.hasta;
  sheet.insertRowAfter(1);
  var rng = sheet.getRange(2, 1, 1, 8);
  rng.getCell(1, 7).setNumberFormat('@STRING@');
  rng.setValues([[id, data.emp, desdeDisplay, hastaDisplay, data.motivo || '', 'pendiente', now, data.emailEmp || '']]);
  enviarTelegram('🌴 <b>Nueva solicitud de vacaciones</b>\n\n👤 <b>' + data.emp + '</b>\n📅 Desde: ' + desdeDisplay + '\n📅 Hasta: ' + hastaDisplay + '\n' + (data.motivo ? '💬 ' + data.motivo : ''));
  return { ok: true, id: id };
}

function cancelarSolicitudInner(data) {
  if (!data.id) return { ok: false, msg: 'ID requerido' };
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('SOLICITUDES');
  if (!sheet) return { ok: false, msg: 'Hoja SOLICITUDES no encontrada' };
  var vals = sheet.getDataRange().getValues();
  for (var i = 1; i < vals.length; i++) {
    if (String(vals[i][0]) === String(data.id)) {
      var estadoCol = (vals[i].length >= 16) ? 13 : 7;
      if (String(vals[i][estadoCol]) !== 'pendiente') return { ok: false, msg: 'Solo se pueden cancelar solicitudes pendientes' };
      sheet.deleteRow(i + 1);
      return { ok: true };
    }
  }
  return { ok: false, msg: 'Solicitud no encontrada' };
}

function cancelarSolicitudVacacionesInner(data) {
  if (!data.id) return { ok: false, msg: 'ID requerido' };
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('SOLICITUD VACACIONES');
  if (!sheet) return { ok: false, msg: 'Hoja SOLICITUD VACACIONES no encontrada' };
  var vals = sheet.getDataRange().getValues();
  for (var i = 1; i < vals.length; i++) {
    if (String(vals[i][0]) === String(data.id)) {
      if (String(vals[i][5]) !== 'pendiente') return { ok: false, msg: 'Solo se pueden cancelar solicitudes pendientes' };
      sheet.deleteRow(i + 1);
      return { ok: true };
    }
  }
  return { ok: false, msg: 'Solicitud no encontrada' };
}

// ══════════════════════════════════════════════════════════════════════════════
// APROBAR / RECHAZAR SOLICITUDES
// ══════════════════════════════════════════════════════════════════════════════

// ── NUEVO v26 · Inserta un fichaje nuevo (solicitudes de AÑADIR) ─────────────
// Se usa cuando la solicitud no tiene "hora actual" (—), es decir, el fichaje
// no existía. Si ya hay una fila idéntica (fecha + tipo + hora) no hace nada,
// así se puede volver a ejecutar sin duplicar. Devuelve true si insertó.
function insertarFichajeAprobado(sh, tipo, fechaISO, hora) {
  fechaISO = toISO(String(fechaISO || '').trim());
  hora     = normHora(String(hora || '').trim());
  if (!fechaISO || !/^\d{4}-\d{2}-\d{2}$/.test(fechaISO) || horaToMins(hora) === null) return false;
  var v = sh.getDataRange().getValues(), d = sh.getDataRange().getDisplayValues();
  for (var j = 0; j < v.length; j++) {
    var f = toISOFromCell(v[j][0]) || toISO(String(d[j][0]));
    if (f === fechaISO && String(v[j][1]).toUpperCase().trim() === tipo &&
        normHora(String(d[j][2]).substring(0, 5)) === hora) return false; // ya estaba
  }
  asegurarCabecera(sh);
  sh.insertRowBefore(2);
  sh.getRange(2, 1).setNumberFormat('@STRING@');
  sh.getRange(2, 3).setNumberFormat('@STRING@');
  sh.getRange(2, 1, 1, 7).setValues([[fechaConDia(fechaISO), tipo, hora, '', '', '', '']]);
  return true;
}

function aprobarSolicitudInner(data) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var solSh = ss.getSheetByName('SOLICITUDES');
  var empSh = getHojaEmpleado(ss, data.emp);
  if (!solSh || !empSh) return { ok: false, msg: 'Hoja no encontrada' };

  var vals = solSh.getDataRange().getValues();
  for (var i = 1; i < vals.length; i++) {
    var filaId  = String(vals[i][0]).trim();
    var filaEmp = String(vals[i][1]).trim();
    var matchId  = data.id && filaId === String(data.id).trim();
    var matchFallback = !data.id && filaEmp === String(data.emp||'').trim()
      && String(vals[i][13]||vals[i][7]||'') === 'pendiente'
      && normHora(String(vals[i][8]||'')) === normHora(data.horaSalidaActual||'');
    if (matchId || matchFallback) {
      var estadoCol = (vals[i].length >= 16) ? 13 : 7;
      solSh.getRange(i + 1, estadoCol + 1).setValue('aprobada');
      break;
    }
  }

  var cambiaEntrada  = (data.cambiaEntrada  === true || data.cambiaEntrada  === 'true');
  var cambiaSalida   = (data.cambiaSalida   === true || data.cambiaSalida   === 'true');
  var eliminarTurno2 = (data.eliminarTurno  === true || data.eliminarTurno  === 'true');

  data.horaEntradaActual = normHora(data.horaEntradaActual || '—');
  data.horaEntradaNueva  = normHora(data.horaEntradaNueva  || '—');
  data.horaSalidaActual  = normHora(data.horaSalidaActual  || '—');
  data.horaSalidaNueva   = normHora(data.horaSalidaNueva   || '—');

  var empVals    = empSh.getDataRange().getValues();
  var empDisplay = empSh.getDataRange().getDisplayValues();

  function eliminarFila(tipo, fechaOrig, horaActual) {
    var buscFecha = toISO(String(fechaOrig || '').trim());
    var buscHora  = normHora(String(horaActual || '').trim());
    var buscTipo  = tipo.toUpperCase().trim();
    for (var j = 0; j < empVals.length; j++) {
      var rowFecha = toISOFromCell(empVals[j][0]) || toISO(String(empDisplay[j][0]));
      var rowTipo  = String(empVals[j][1] || '').toUpperCase().trim();
      var rowHora  = normHora(String(empDisplay[j][2] || '').substring(0, 5));
      if (rowFecha === buscFecha && rowTipo === buscTipo && rowHora === buscHora) {
        empSh.deleteRow(j + 1);
        empVals    = empSh.getDataRange().getValues();
        empDisplay = empSh.getDataRange().getDisplayValues();
        return;
      }
    }
  }

  if (eliminarTurno2) {
    if (cambiaEntrada) eliminarFila('ENTRADA', data.fechaEntradaOrig, data.horaEntradaActual);
    if (cambiaSalida)  eliminarFila('SALIDA',  data.fechaSalidaOrig,  data.horaSalidaActual);
    reordenarHoja(empSh);
    recalcularHoja(empSh);
    sincronizarEmpleadoASupabase(empSh.getName(), empSh);

    var nombreOrigElim = empSh.getName().split(' ')[0] + 'ORIGINAL';
    var sheetOrigElim  = ss.getSheetByName(nombreOrigElim);
    if (sheetOrigElim) {
      var origValsElim    = sheetOrigElim.getDataRange().getValues();
      var origDisplayElim = sheetOrigElim.getDataRange().getDisplayValues();
      function eliminarFilaOrig(tipo, fechaOrig, horaActual) {
        var buscFecha = toISO(String(fechaOrig || '').trim());
        var buscHora  = normHora(String(horaActual || '').trim());
        var buscTipo  = tipo.toUpperCase().trim();
        for (var j = 0; j < origValsElim.length; j++) {
          var rowFecha = toISOFromCell(origValsElim[j][0]) || toISO(String(origDisplayElim[j][0]));
          var rowTipo  = String(origValsElim[j][1] || '').toUpperCase().trim();
          var rowHora  = normHora(String(origDisplayElim[j][2] || '').substring(0, 5));
          if (rowFecha === buscFecha && rowTipo === buscTipo && rowHora === buscHora) {
            sheetOrigElim.deleteRow(j + 1);
            origValsElim    = sheetOrigElim.getDataRange().getValues();
            origDisplayElim = sheetOrigElim.getDataRange().getDisplayValues();
            return;
          }
        }
      }
      if (cambiaEntrada) eliminarFilaOrig('ENTRADA', data.fechaEntradaOrig, data.horaEntradaActual);
      if (cambiaSalida)  eliminarFilaOrig('SALIDA',  data.fechaSalidaOrig,  data.horaSalidaActual);
      reordenarHoja(sheetOrigElim);
      recalcularHoja(sheetOrigElim);
    }

    if (data.emailEmp) {
      try {
        var aliases3  = GmailApp.getAliases();
        var fromAddr3 = (aliases3.indexOf(FROM_EMAIL) !== -1) ? FROM_EMAIL : Session.getActiveUser().getEmail();
        var lineasElim = [];
        if (cambiaEntrada) lineasElim.push('  ENTRADA: ' + isoToDisplay(data.fechaEntradaOrig) + ' ' + data.horaEntradaActual);
        if (cambiaSalida)  lineasElim.push('  SALIDA:  ' + isoToDisplay(data.fechaSalidaOrig)  + ' ' + data.horaSalidaActual);
        GmailApp.sendEmail(data.emailEmp,
          'Fichaje eliminado - Buenas y Santas',
          'Hola ' + String(data.emp || '').split(' ')[0] + ',\n\nTu solicitud de eliminación ha sido aprobada.\n\nRegistros eliminados:\n' + lineasElim.join('\n') + '\n\n' + (data.motivo ? 'Motivo: ' + data.motivo + '\n\n' : '') + 'Un saludo,\nBuenas y Santas',
          { from: fromAddr3, name: FROM_NAME }
        );
      } catch(mailErrElim) { Logger.log('Error email eliminar: ' + mailErrElim); }
    }
    return { ok: true };
  }

  function aplicarCambio(tipo, fechaOrig, fechaNueva, horaActual, horaNueva) {
    // v26: sin hora actual = fichaje que no existía → se AÑADE
    if (!horaActual || horaActual === '—') {
      if (insertarFichajeAprobado(empSh, tipo.toUpperCase().trim(), fechaNueva || fechaOrig, horaNueva)) {
        empVals    = empSh.getDataRange().getValues();
        empDisplay = empSh.getDataRange().getDisplayValues();
      }
      return;
    }
    if (!fechaOrig) return;
    var buscFecha = toISO(String(fechaOrig || '').trim());
    var buscHora  = normHora(String(horaActual || '').trim());
    var buscTipo  = tipo.toUpperCase().trim();
    var fNueva    = (fechaNueva && fechaNueva !== '') ? fechaNueva : fechaOrig;
    var filaEncontrada = -1;
    for (var j = 0; j < empVals.length; j++) {
      var rowFecha = toISOFromCell(empVals[j][0]) || toISO(String(empDisplay[j][0]));
      var rowTipo  = String(empVals[j][1] || '').toUpperCase().trim();
      var rowHora  = normHora(String(empDisplay[j][2] || '').substring(0, 5));
      if (rowFecha === buscFecha && rowTipo === buscTipo && rowHora === buscHora) {
        filaEncontrada = j + 1; break;
      }
    }
    if (filaEncontrada === -1) {
      Logger.log('aprobarSolicitud: no se encontró ' + buscTipo + ' ' + buscFecha + ' ' + buscHora + ' en ' + empSh.getName());
      return;
    }
    if (fNueva !== fechaOrig) {
      empSh.deleteRow(filaEncontrada);
      empSh.insertRowBefore(2);
      empSh.getRange(2, 1, 1, 6).setValues([[isoToDisplay(fNueva), buscTipo, horaNueva, '', '', '']]);
      empVals    = empSh.getDataRange().getValues();
      empDisplay = empSh.getDataRange().getDisplayValues();
    } else {
      var rangeHora = empSh.getRange(filaEncontrada, 3);
      rangeHora.setNumberFormat('@STRING@');
      rangeHora.setValue(horaNueva);
      empVals[filaEncontrada - 1][2] = horaNueva;
    }
  }

  if (cambiaEntrada) aplicarCambio('ENTRADA', data.fechaEntradaOrig, data.fechaEntradaNueva, data.horaEntradaActual, data.horaEntradaNueva);
  if (cambiaSalida)  aplicarCambio('SALIDA',  data.fechaSalidaOrig,  data.fechaSalidaNueva,  data.horaSalidaActual,  data.horaSalidaNueva);

  reordenarHoja(empSh);
  recalcularHoja(empSh);
  sincronizarEmpleadoASupabase(empSh.getName(), empSh);

  var nombreOrig = empSh.getName().split(' ')[0] + 'ORIGINAL';
  var sheetOrig  = ss.getSheetByName(nombreOrig);
  if (sheetOrig) {
    var origVals    = sheetOrig.getDataRange().getValues();
    var origDisplay = sheetOrig.getDataRange().getDisplayValues();

    function aplicarCambioOrig(tipo, fechaOrig, fechaNueva, horaActual, horaNueva) {
      // v26: sin hora actual = fichaje que no existía → se AÑADE
      if (!horaActual || horaActual === '—') {
        if (insertarFichajeAprobado(sheetOrig, tipo.toUpperCase().trim(), fechaNueva || fechaOrig, horaNueva)) {
          origVals    = sheetOrig.getDataRange().getValues();
          origDisplay = sheetOrig.getDataRange().getDisplayValues();
        }
        return;
      }
      if (!fechaOrig) return;
      var buscFecha = toISO(String(fechaOrig || '').trim());
      var buscHora  = normHora(String(horaActual || '').trim());
      var buscTipo  = tipo.toUpperCase().trim();
      var fNueva    = (fechaNueva && fechaNueva !== '') ? fechaNueva : fechaOrig;
      var filaEncontrada = -1;
      for (var j = 0; j < origVals.length; j++) {
        var rowFecha = toISOFromCell(origVals[j][0]) || toISO(String(origDisplay[j][0]));
        var rowTipo  = String(origVals[j][1] || '').toUpperCase().trim();
        var rowHora  = normHora(String(origDisplay[j][2] || '').substring(0, 5));
        if (rowFecha === buscFecha && rowTipo === buscTipo && rowHora === buscHora) {
          filaEncontrada = j + 1; break;
        }
      }
      if (filaEncontrada === -1) return;
      if (fNueva !== fechaOrig) {
        sheetOrig.deleteRow(filaEncontrada);
        sheetOrig.insertRowBefore(2);
        sheetOrig.getRange(2, 1, 1, 6).setValues([[isoToDisplay(fNueva), buscTipo, horaNueva, '', '', '']]);
        origVals    = sheetOrig.getDataRange().getValues();
        origDisplay = sheetOrig.getDataRange().getDisplayValues();
      } else {
        var rangeHoraOrig = sheetOrig.getRange(filaEncontrada, 3);
        rangeHoraOrig.setNumberFormat('@STRING@');
        rangeHoraOrig.setValue(horaNueva);
        origVals[filaEncontrada - 1][2] = horaNueva;
      }
    }

    if (cambiaEntrada) aplicarCambioOrig('ENTRADA', data.fechaEntradaOrig, data.fechaEntradaNueva, data.horaEntradaActual, data.horaEntradaNueva);
    if (cambiaSalida)  aplicarCambioOrig('SALIDA',  data.fechaSalidaOrig,  data.fechaSalidaNueva,  data.horaSalidaActual,  data.horaSalidaNueva);
    reordenarHoja(sheetOrig);
    recalcularHoja(sheetOrig);
  }

  if (data.emailEmp) {
    try {
      var aliases  = GmailApp.getAliases();
      var fromAddr = (aliases.indexOf(FROM_EMAIL) !== -1) ? FROM_EMAIL : Session.getActiveUser().getEmail();
      var lineasCambio = [];
      if (cambiaEntrada) {
        var hayFE2 = data.fechaEntradaNueva && data.fechaEntradaNueva !== data.fechaEntradaOrig;
        lineasCambio.push('  ENTRADA: ' + isoToDisplay(data.fechaEntradaOrig) + ' ' + data.horaEntradaActual + '  →  ' + (hayFE2 ? isoToDisplay(data.fechaEntradaNueva) + ' ' : '') + data.horaEntradaNueva);
      }
      if (cambiaSalida) {
        var hayFS2 = data.fechaSalidaNueva && data.fechaSalidaNueva !== data.fechaSalidaOrig;
        lineasCambio.push('  SALIDA:  ' + isoToDisplay(data.fechaSalidaOrig) + ' ' + data.horaSalidaActual + '  →  ' + (hayFS2 ? isoToDisplay(data.fechaSalidaNueva) + ' ' : '') + data.horaSalidaNueva);
      }
      GmailApp.sendEmail(data.emailEmp,
        '✅ Tu solicitud de cambio de turno ha sido aprobada',
        'Hola ' + String(data.emp || '').split(' ')[0] + ',\n\nTu solicitud ha sido APROBADA:\n\n' + lineasCambio.join('\n') + '\n\n' + (data.motivo && data.motivo !== '—' ? 'Motivo: ' + data.motivo + '\n\n' : '') + 'Un saludo,\nBuenas y Santas',
        { from: fromAddr, name: FROM_NAME }
      );
    } catch(mailErr) { Logger.log('Error email aprobar: ' + mailErr); }
  }
  return { ok: true };
}
function aprobarSolicitud(data) { return resp(aprobarSolicitudInner(data)); }

// ── NUEVO v26 · Volver a aplicar solicitudes ya aprobadas que no llegaron ────
// Pon los IDs (columna A de SOLICITUDES) y ejecútala UNA vez desde el editor.
// No reenvía el email al empleado y no duplica fichajes que ya estén.
function reprocesarSolicitudesAprobadas() {
  var todas = getSolicitudes('');
  var n = 0;
  todas.forEach(function(s) {
    if (String(s.estado).toLowerCase() !== 'aprobada') return;
    if (s.eliminarTurno) return;
    var anadeE = s.cambiaEntrada && (!s.horaEntradaActual || s.horaEntradaActual === '—');
    var anadeS = s.cambiaSalida  && (!s.horaSalidaActual  || s.horaSalidaActual  === '—');
    if (!anadeE && !anadeS) return;
    s.emailEmp = '';   // no reenviar email
    Logger.log('Procesando ' + s.id + ' · ' + s.emp + ' · '
      + (anadeE ? 'ENTRADA ' + s.fechaEntradaNueva + ' ' + s.horaEntradaNueva : '')
      + (anadeS ? ' SALIDA ' + s.fechaSalidaNueva + ' ' + s.horaSalidaNueva : ''));
    aprobarSolicitudInner(s);
    n++;
  });
  Logger.log('Terminado. Solicitudes revisadas: ' + n);
}

function aprobarSolicitudVacacionesInner(data) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('SOLICITUD VACACIONES');
  if (!sheet) return { ok: false, msg: 'Hoja no encontrada' };
  var vals = sheet.getDataRange().getValues();
  for (var i = 1; i < vals.length; i++) {
    if (String(vals[i][0]) === String(data.id)) { sheet.getRange(i + 1, 6).setValue('aprobada'); break; }
  }
  if (data.emailEmp) {
    try {
      var aliases  = GmailApp.getAliases();
      var fromAddr = (aliases.indexOf(FROM_EMAIL) !== -1) ? FROM_EMAIL : Session.getActiveUser().getEmail();
      GmailApp.sendEmail(data.emailEmp,
        'Solicitud de vacaciones aprobada - Buenas y Santas',
        'Hola ' + data.emp.split(' ')[0] + ',\n\nTu solicitud de vacaciones ha sido APROBADA:\n\n  Desde: ' + data.desde + '\n  Hasta: ' + data.hasta + '\n\nUn saludo,\nBuenas y Santas',
        { from: fromAddr, name: FROM_NAME }
      );
    } catch(mailErr) { Logger.log('Error email aprobar vacaciones: ' + mailErr); }
  }
  return { ok: true };
}

function rechazarSolicitudVacacionesInner(data) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('SOLICITUD VACACIONES');
  if (!sheet) return { ok: false };
  var vals = sheet.getDataRange().getValues();
  for (var i = 1; i < vals.length; i++) {
    if (String(vals[i][0]) === String(data.id)) { sheet.getRange(i + 1, 6).setValue('rechazada'); break; }
  }
  if (data.emailEmp) {
    try {
      var aliases2  = GmailApp.getAliases();
      var fromAddr2 = (aliases2.indexOf(FROM_EMAIL) !== -1) ? FROM_EMAIL : Session.getActiveUser().getEmail();
      GmailApp.sendEmail(data.emailEmp,
        'Solicitud de vacaciones rechazada - Buenas y Santas',
        'Hola ' + data.emp.split(' ')[0] + ',\n\nTu solicitud de vacaciones del ' + data.desde + ' al ' + data.hasta + ' ha sido rechazada.\n\nUn saludo,\nBuenas y Santas',
        { from: fromAddr2, name: FROM_NAME }
      );
    } catch(mailErr) { Logger.log('Error email rechazar vacaciones: ' + mailErr); }
  }
  return { ok: true };
}

function rechazarSolicitudInner(data) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('SOLICITUDES');
  if (!sheet) return { ok: false };
  var vals = sheet.getDataRange().getValues();
  for (var i = 1; i < vals.length; i++) {
    if (String(vals[i][0]) === String(data.id)) {
      var estadoCol = (vals[i].length >= 16) ? 13 : 7;
      sheet.getRange(i + 1, estadoCol + 1).setValue('rechazada');
      break;
    }
  }
  if (data.emailEmp) {
    try {
      var aliases2  = GmailApp.getAliases();
      var fromAddr2 = (aliases2.indexOf(FROM_EMAIL) !== -1) ? FROM_EMAIL : Session.getActiveUser().getEmail();
      var lineasRechazo = [];
      if (data.cambiaEntrada === true || data.cambiaEntrada === 'true') {
        var hayFER = data.fechaEntradaNueva && data.fechaEntradaNueva !== data.fechaEntradaOrig;
        lineasRechazo.push('  ENTRADA: ' + isoToDisplay(data.fechaEntradaOrig) + ' ' + (data.horaEntradaActual||'—') + '  →  ' + (hayFER ? isoToDisplay(data.fechaEntradaNueva) + ' ' : '') + (data.horaEntradaNueva||'—'));
      }
      if (data.cambiaSalida === true || data.cambiaSalida === 'true') {
        var hayFSR = data.fechaSalidaNueva && data.fechaSalidaNueva !== data.fechaSalidaOrig;
        lineasRechazo.push('  SALIDA:  ' + isoToDisplay(data.fechaSalidaOrig) + ' ' + (data.horaSalidaActual||'—') + '  →  ' + (hayFSR ? isoToDisplay(data.fechaSalidaNueva) + ' ' : '') + (data.horaSalidaNueva||'—'));
      }
      GmailApp.sendEmail(data.emailEmp,
        '❌ Tu solicitud de cambio de turno ha sido rechazada',
        'Hola ' + String(data.emp || '').split(' ')[0] + ',\n\nTu solicitud de cambio de turno ha sido RECHAZADA:\n\n' + (lineasRechazo.length ? lineasRechazo.join('\n') + '\n\n' : '') + (data.motivo && data.motivo !== '—' ? 'Motivo: ' + data.motivo + '\n\n' : '') + 'Un saludo,\nBuenas y Santas',
        { from: fromAddr2, name: FROM_NAME }
      );
    } catch(mailErr) { Logger.log('Error email rechazar: ' + mailErr); }
  }
  return { ok: true };
}
function rechazarSolicitud(data) { return resp(rechazarSolicitudInner(data)); }

// ══════════════════════════════════════════════════════════════════════════════
// PIN / CÓDIGOS DE VERIFICACIÓN
// ══════════════════════════════════════════════════════════════════════════════
function enviarCodigoInner(email, nombre) {
  if (!email) return { ok: false, msg: 'Email requerido' };
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('CODIGOS');
  if (!sheet) { sheet = ss.insertSheet('CODIGOS'); sheet.appendRow(['Email','Codigo','Expira','Usado']); }
  var codigo = String(Math.floor(100000 + Math.random() * 900000));
  var expira = new Date(Date.now() + 10 * 60 * 1000);
  sheet.appendRow([email.toLowerCase(), codigo, expira, 'no']);
  try {
    var aliases  = GmailApp.getAliases();
    var fromAddr = (aliases.indexOf(FROM_EMAIL) !== -1) ? FROM_EMAIL : Session.getActiveUser().getEmail();
    GmailApp.sendEmail(email,
      'Tu código de verificación - Fichajes',
      'Hola ' + (nombre || '') + ',\n\nTu código de verificación es:\n\n    ' + codigo + '\n\nEste código expira en 10 minutos.\n\nUn saludo,\nBuenas y Santas',
      { from: fromAddr, name: FROM_NAME }
    );
  } catch(mailErr) {
    Logger.log('Error enviando código: ' + mailErr);
    return { ok: false, msg: 'Error al enviar el email: ' + mailErr };
  }
  return { ok: true };
}

function verificarCodigoInner(email, codigo) {
  if (!email || !codigo) return { ok: false, msg: 'Datos incompletos' };
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('CODIGOS');
  if (!sheet) return { ok: false, msg: 'No hay códigos registrados' };
  var rows  = sheet.getDataRange().getValues();
  var ahora = new Date();
  var filaValida = -1;
  for (var i = rows.length - 1; i >= 1; i--) {
    var rowEmail  = String(rows[i][0]).toLowerCase().trim();
    var rowCodigo = String(rows[i][1]).trim();
    var rowExpira = rows[i][2];
    var rowUsado  = String(rows[i][3]).trim();
    if (rowEmail !== email.toLowerCase().trim()) continue;
    if (rowUsado === 'si') continue;
    if (rowCodigo !== codigo.trim()) continue;
    var expira2 = (rowExpira instanceof Date) ? rowExpira : new Date(rowExpira);
    if (ahora > expira2) continue;
    filaValida = i + 1; break;
  }
  if (filaValida === -1) return { ok: false, msg: 'Código incorrecto o expirado' };
  sheet.getRange(filaValida, 4).setValue('si');
  return { ok: true };
}

function cambiarPinInner(data) {
  if (!data.email || !data.pin) return { ok: false, msg: 'Datos incompletos' };
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('EMPLEADOS');
  if (!sheet) return { ok: false, msg: 'Hoja EMPLEADOS no encontrada' };
  var rows = sheet.getDataRange().getValues();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][4] || '').toLowerCase().trim() === data.email.toLowerCase().trim()) {
      sheet.getRange(i + 1, 4).setValue(data.pin);
      return { ok: true };
    }
  }
  return { ok: false, msg: 'Empleado no encontrado' };
}

// ══════════════════════════════════════════════════════════════════════════════
// REORDENACIÓN CRONOLÓGICA
// ══════════════════════════════════════════════════════════════════════════════
function reordenarHoja(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 3) return;
  var numData = lastRow - 1;
  var range   = sheet.getRange(2, 1, numData, 7);
  var vals    = range.getValues();
  var display = range.getDisplayValues();

  var filas = vals.map(function(row, i) {
    var fechaISO = toISOFromCell(row[0]) || '';
    var horaStr  = normHora(String(display[i][2] || '').substring(0, 5));
    var mins     = horaToMins(horaStr) || 0;
    var minsSort = mins < NUEVO_DIA_MINS ? mins + 1440 : mins;
    var fechaSort = (mins < NUEVO_DIA_MINS && fechaISO) ? diaAnterior(fechaISO) : fechaISO;
    return { rowVals: row, fechaISO: fechaISO, fechaSort: fechaSort, minsSort: minsSort };
  });

  filas.sort(function(a, b) {
    if (a.fechaSort > b.fechaSort) return -1;
    if (a.fechaSort < b.fechaSort) return  1;
    return b.minsSort - a.minsSort;
  });

  range.setValues(filas.map(function(f) { return f.rowVals; }));
}

// ══════════════════════════════════════════════════════════════════════════════
// CÁLCULO DE HORAS
// ══════════════════════════════════════════════════════════════════════════════
function recalcularHoja(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  var range   = sheet.getRange(2, 1, lastRow - 1, 7);
  var vals    = range.getValues();
  var display = range.getDisplayValues();

  var filas = vals.map(function(row, i) {
    var fechaRaw = row[0];
    var tipo     = String(row[1] || '').toUpperCase().trim();
    var horaStr  = normHora(String(display[i][2] || '').substring(0, 5));
    var fechaISO = toISOFromCell(fechaRaw);
    var mins     = horaToMins(horaStr);
    if (!fechaISO || (tipo !== 'ENTRADA' && tipo !== 'SALIDA') || mins === null) return null;
    var diaKey = fechaISO;
    if (mins < NUEVO_DIA_MINS) diaKey = diaAnterior(fechaISO);
    var semanaKey = getInicioSemana(diaKey);
    return { i: i, tipo: tipo, mins: mins, diaKey: diaKey, semanaKey: semanaKey, turnoMins: null, diaMins: null, semanaMins: null };
  });

  var filasValidas = filas.filter(function(f) { return f !== null; });
  filasValidas.sort(function(a, b) {
    if (a.diaKey !== b.diaKey) return a.diaKey < b.diaKey ? -1 : 1;
    var am = a.mins < NUEVO_DIA_MINS ? a.mins + 1440 : a.mins;
    var bm = b.mins < NUEVO_DIA_MINS ? b.mins + 1440 : b.mins;
    if (am !== bm) return am - bm;
    return b.i - a.i;
  });

  var k = 0;
  while (k < filasValidas.length) {
    var fila = filasValidas[k];
    if (fila.tipo === 'ENTRADA' && fila.turnoMins === null) {
      var salidaIdx = -1;
      for (var s = k + 1; s < filasValidas.length; s++) {
        if (filasValidas[s].tipo === 'SALIDA' && filasValidas[s].turnoMins === null) { salidaIdx = s; break; }
      }
      if (salidaIdx !== -1) {
        var salida = filasValidas[salidaIdx];
        var p1 = fila.diaKey.split('-').map(Number);
        var p2 = salida.diaKey.split('-').map(Number);
        var d1 = new Date(p1[0], p1[1]-1, p1[2]);
        var d2 = new Date(p2[0], p2[1]-1, p2[2]);
        var minsE = Math.floor(d1.getTime() / 60000) + (fila.mins   < NUEVO_DIA_MINS ? fila.mins   + 1440 : fila.mins);
        var minsS = Math.floor(d2.getTime() / 60000) + (salida.mins < NUEVO_DIA_MINS ? salida.mins + 1440 : salida.mins);
        var dur = minsS - minsE; if (dur < 0) dur = 0;
        salida.turnoMins = dur;
        salida.diaKey    = fila.diaKey;
        salida.semanaKey = fila.semanaKey;
        k = salidaIdx + 1;
      } else { k++; }
    } else { k++; }
  }

  var diasOrden = [], dias = {};
  filasValidas.forEach(function(f) {
    if (!dias[f.diaKey]) { dias[f.diaKey] = []; diasOrden.push(f.diaKey); }
    dias[f.diaKey].push(f);
  });
  diasOrden.forEach(function(dk) {
    var grupo = dias[dk];
    var acumDia = 0, diaCompleto = true;
    grupo.forEach(function(f) {
      if (f.tipo === 'SALIDA') { if (f.turnoMins !== null) acumDia += f.turnoMins; else diaCompleto = false; }
    });
    if (diaCompleto && acumDia > 0) {
      for (var f2 = grupo.length - 1; f2 >= 0; f2--) {
        if (grupo[f2].tipo === 'SALIDA') { grupo[f2].diaMins = acumDia; break; }
      }
    }
  });

  var semanasOrden = [], semanas = {};
  filas.forEach(function(f) {
    if (!f) return;
    if (!semanas[f.semanaKey]) { semanas[f.semanaKey] = []; semanasOrden.push(f.semanaKey); }
    semanas[f.semanaKey].push(f);
  });
  semanasOrden.forEach(function(sk) {
    var grupo = semanas[sk];
    var totalSemana = 0;
    grupo.forEach(function(f) { if (f.tipo === 'SALIDA' && f.turnoMins !== null) totalSemana += f.turnoMins; });
    if (totalSemana > 0) {
      for (var i2 = 0; i2 < grupo.length; i2++) {
        if (grupo[i2].tipo === 'SALIDA') { grupo[i2].semanaMins = totalSemana; break; }
      }
    }
  });

  var colD = filas.map(function(f) { return [f && f.turnoMins  !== null ? minsToHHMM(f.turnoMins)  : '']; });
  var colE = filas.map(function(f) { return [f && f.diaMins    !== null ? minsToHHMM(f.diaMins)    : '']; });
  var colF = filas.map(function(f) { return [f && f.semanaMins !== null ? minsToHHMM(f.semanaMins) : '']; });
  sheet.getRange(2, 4, filas.length, 1).setValues(colD);
  sheet.getRange(2, 5, filas.length, 1).setValues(colE);
  sheet.getRange(2, 6, filas.length, 1).setValues(colF);
}

// ══════════════════════════════════════════════════════════════════════════════
// CONTROL DE HORARIOS — Sidebar interactivo
// ══════════════════════════════════════════════════════════════════════════════

var DIAS_ES = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];

var REGLAS_EMPLEADOS = {
  '_todos': { maxHDia: 9, minDescanso: 12 },
  'richard': { maxHDia: 9, maxHSemana: 40, minDescanso: 12, quitarSabados: true },
  'maria':   { maxHDia: 9, maxHSemana: 32, minDescanso: 12 },
  'ana':     { maxHDia: 9, maxHSemana: 20, minDescanso: 12, checkSabDom: true },
  'yamila':  { maxHDia: 9, maxHSemana: 27, minDescanso: 12 },
  'julio':   { maxHDia: 9, maxHSemana: 27.5, minDescanso: 12 },
  'jessica': { maxHDia: 9, maxHSemana: 3.5, minDescanso: 12, quitarMediodiasLunJue: true },
  'shanay':  { maxHDia: 9, maxHSemana: 16.5, minDescanso: 12, checkSabDom: true },
  // NUEVO v24 — Jennifer: 16 h/semana + patrón de turnos fijos
  'jennifer':{ maxHDia: 9, maxHSemana: 16, minDescanso: 12, turnosFijos: 'jennifer' },
  'anyuri':  { maxHDia: 9, maxHSemana: 14.5, minDescanso: 12 },
  'juliana': { maxHDia: 9, maxHSemana: 7.5, minDescanso: 12 }
};

// ── NUEVO v24 · Patrón de turnos FIJOS por empleado ──────────────────────────
// dow:    0=Domingo, 1=Lunes ... 5=Viernes, 6=Sábado
// franja: 'mediodia' = entrada antes de las 16:00
//         'noche'    = entrada a partir de las 16:00
// Cualquier turno que NO esté en esta lista se considera "fuera de horario fijo"
// y es el primer candidato a eliminar cuando la semana excede el objetivo.
var TURNOS_FIJOS = {
  'jennifer': [
    { dow: 5, franja: 'noche'    },  // Viernes  · noche
    { dow: 6, franja: 'mediodia' },  // Sábado   · mediodía
    { dow: 6, franja: 'noche'    },  // Sábado   · noche
    { dow: 0, franja: 'mediodia' }   // Domingo  · mediodía
  ]
};

function franjaDeTurno(entradaMins) {
  if (entradaMins === null || entradaMins === undefined) return 'noche';
  // Entrada de madrugada (< NUEVO_DIA_MINS) = cola del turno de noche del día anterior
  if (entradaMins < NUEVO_DIA_MINS) return 'noche';
  return (entradaMins < 16 * 60) ? 'mediodia' : 'noche';
}

function esTurnoFijo(claveTurnosFijos, dow, entradaMins) {
  var lista = TURNOS_FIJOS[claveTurnosFijos];
  if (!lista) return true; // empleado sin patrón definido → todos sus turnos valen
  var fr = franjaDeTurno(entradaMins);
  for (var i = 0; i < lista.length; i++) {
    if (lista[i].dow === dow && lista[i].franja === fr) return true;
  }
  return false;
}

function getReglas(nombreEmp) {
  var clave = String(nombreEmp || '').trim().split(' ')[0].toLowerCase();
  var base  = REGLAS_EMPLEADOS['_todos'];
  var esp   = REGLAS_EMPLEADOS[clave] || {};
  return Object.assign({}, base, esp);
}

// ── FIX 4: límites de sugerencia según tipo de turno ─────────────────────────
// Mediodía: entrada < 16:00  → entrada no después 13:30, salida no antes 16:00
// Noche:    entrada >= 16:00 → entrada no después 20:30, salida no antes 23:00
function clampSugerencia(horaEntradaMins, tipoAjuste, horaSugeridaMins) {
  var esMediodia = horaEntradaMins < 16 * 60; // entrada antes de las 16:00
  if (tipoAjuste === 'entrada') {
    // No sugerir entrada más tarde del límite
    var limite = esMediodia ? (13 * 60 + 30) : (20 * 60 + 30);
    return Math.min(horaSugeridaMins, limite);
  } else {
    // No sugerir salida antes del límite
    var limite = esMediodia ? (16 * 60) : (23 * 60);
    return Math.max(horaSugeridaMins, limite);
  }
}

// ── Analizar selección del ratón → escribe en col H ─────────────────────────
function analizarSeleccionAntiguo() {
  var ss     = SpreadsheetApp.getActiveSpreadsheet();
  var ui     = SpreadsheetApp.getUi();
  var sheet  = ss.getActiveSheet();
  var nombre = sheet.getName();

  if (HOJAS_SISTEMA.indexOf(nombre) !== -1 || nombre.indexOf('ORIGINAL') !== -1) {
    ui.alert('Abre la hoja del empleado que quieres analizar y selecciona las filas.');
    return;
  }

  var rng     = sheet.getActiveRange();
  var filaIni = rng.getRow();
  var filaFin = rng.getLastRow();
  var vals    = sheet.getDataRange().getValues();
  var display = sheet.getDataRange().getDisplayValues();
  var start   = (vals.length > 0 && String(vals[0][1]).toUpperCase() === 'TIPO') ? 1 : 0;
  if (filaIni <= start + 1) filaIni = start + 1;

  // Todos los fichajes de la hoja (para chequeo de descanso)
  var todosFichajes = [];
  for (var i = start; i < vals.length; i++) {
    var fISO = toISOFromCell(vals[i][0]);
    if (!fISO) continue;
    var tipo = String(vals[i][1] || '').toUpperCase().trim();
    var hora = normHora(String(display[i][2] || '').substring(0, 5));
    if (tipo !== 'ENTRADA' && tipo !== 'SALIDA') continue;
    todosFichajes.push({ fila: i+1, fechaISO: fISO, tipo: tipo, hora: hora, mins: horaToMins(hora) });
  }
  // Calcular diaKey para todos (para filtrar descanso por día laboral)
  // v30: se ordena por tiempo ABSOLUTO y cada SALIDA hereda el día laboral de
  // su ENTRADA. Antes una salida de madrugada a partir de las 02:00 (p. ej.
  // sábado noche → domingo 02:30) contaba como "domingo" y no se comparaba
  // con la entrada del domingo mediodía → nunca avisaba del descanso < 12 h.
  todosFichajes.forEach(function(f) {
    f.diaKey = (f.mins !== null && f.mins < NUEVO_DIA_MINS) ? diaAnterior(f.fechaISO) : f.fechaISO;
    var ppA = f.fechaISO.split('-').map(Number);
    f._abs = Math.floor(new Date(ppA[0], ppA[1]-1, ppA[2]).getTime() / 60000) + (f.mins || 0);
  });
  todosFichajes.sort(function(a,b){ return a._abs - b._abs; });
  var _diaUltimaEntrada = null;
  todosFichajes.forEach(function(f) {
    if (f.tipo === 'ENTRADA') { _diaUltimaEntrada = f.diaKey; }
    else if (_diaUltimaEntrada !== null) { f.diaKey = _diaUltimaEntrada; _diaUltimaEntrada = null; }
  });

  // Fichajes de la selección
  var fichajesSel = [];
  for (var i = start; i < vals.length; i++) {
    var fila = i+1;
    if (fila<filaIni||fila>filaFin) continue;
    var fISO = toISOFromCell(vals[i][0]);
    if (!fISO) continue;
    var tipo = String(vals[i][1]||'').toUpperCase().trim();
    var hora = normHora(String(display[i][2]||'').substring(0,5));
    if (tipo!=='ENTRADA'&&tipo!=='SALIDA') continue;
    fichajesSel.push({ fila:fila, fechaISO:fISO, tipo:tipo, hora:hora, mins:horaToMins(hora) });
  }

  if (!fichajesSel.length) {
    ui.alert('No hay fichajes en la selección.\nSelecciona las filas con los fichajes que quieres analizar.');
    return;
  }

  // FIX 3: ordenar por tiempo ABSOLUTO (diaKey + hora ajustada), igual que recalcularHoja,
  // para que el turno nocturno 20:26 sáb → 00:09 dom se empareje correctamente.
  fichajesSel.forEach(function(f) {
    var pp = f.fechaISO.split('-').map(Number);
    var dBase = new Date(pp[0], pp[1]-1, pp[2]);
    f._absMin = Math.floor(dBase.getTime() / 60000) + f.mins;
  });
  fichajesSel.sort(function(a, b) { return a._absMin - b._absMin; });

  var reglas = getReglas(nombre);

  // v27 · horas semanales vigentes según la fecha de la semana analizada
  var _f0 = fichajesSel[0], _fN = fichajesSel[fichajesSel.length - 1];
  var _dia0 = (_f0.mins !== null && _f0.mins < NUEVO_DIA_MINS) ? diaAnterior(_f0.fechaISO) : _f0.fechaISO;
  var _diaN = (_fN.mins !== null && _fN.mins < NUEVO_DIA_MINS) ? diaAnterior(_fN.fechaISO) : _fN.fechaISO;
  var _lunes = getInicioSemana(_dia0);
  var _horasVig = getHorasSemana(nombre, _lunes);
  if (_horasVig !== null) reglas.maxHSemana = _horasVig;
  if (getInicioSemana(_diaN) !== _lunes) {
    ui.alert('Has seleccionado fichajes de más de una semana.\n' +
             'Se usarán las horas vigentes en la semana del ' + isoToDisplay(_lunes) + '.');
  }

  // ── Variación aleatoria de umbrales (±15 / +5 min) ───────────────────────
  // Cada análisis aplica un offset aleatorio para que los límites no sean
  // siempre exactos y el horario parezca natural.
  var offsetDia     = Math.round((Math.random() * 20) - 15); // -15 a +5 min
  var offsetSemana  = Math.round((Math.random() * 20) - 15); // -15 a +5 min
  var offsetDescanso= Math.round( Math.random() * 15);        //   0 a +15 min (solo suma)
  var limDia      = reglas.maxHDia     * 60 + offsetDia;
  var limSemana   = reglas.maxHSemana ? (reglas.maxHSemana * 60 + offsetSemana) : null;
  var limDescanso = reglas.minDescanso * 60 + offsetDescanso;
  // Clave del empleado para reglas específicas
  var claveEmp = nombre.trim().split(' ')[0].toLowerCase();

  // Emparejar turnos de la selección — ahora en orden cronológico absoluto
  var turnos=[], k=0;
  while(k<fichajesSel.length){
    var f=fichajesSel[k];
    if(f.tipo==='ENTRADA'){
      var sal=null;
      for(var s=k+1;s<fichajesSel.length;s++){
        if(fichajesSel[s].tipo==='SALIDA'){sal=fichajesSel[s];k=s+1;break;}
      }
      var dur=0;
      if(sal){
        // Duración = diferencia de tiempos absolutos ya calculados en _absMin
        dur = Math.max(0, sal._absMin - f._absMin);
      }
      // diaKey del turno = diaKey de la entrada
      var diaKeyTurno = (f.mins !== null && f.mins < NUEVO_DIA_MINS) ? diaAnterior(f.fechaISO) : f.fechaISO;
      var ppD = diaKeyTurno.split('-').map(Number);
      var dowD = new Date(ppD[0],ppD[1]-1,ppD[2]).getDay();
      turnos.push({
        filaEntrada:f.fila, filaSalida:sal?sal.fila:null,
        diaISO:diaKeyTurno,
        fechaEntradaReal:f.fechaISO, fechaSalidaReal:sal?sal.fechaISO:f.fechaISO,
        entrada:f.hora, entradaMins:f.mins,
        salida:sal?sal.hora:'—', salidaMins:sal?sal.mins:null,
        durMins:dur, abierto:!sal, dow:dowD,
        _absMinEntrada:f._absMin,
        _absMinSalida:sal?sal._absMin:f._absMin
      });
    } else { k++; }
  }

  // Totales por diaKey y global
  var porDia={};
  turnos.forEach(function(t){
    if(!porDia[t.diaISO]) porDia[t.diaISO]=0;
    porDia[t.diaISO]+=t.durMins;
  });
  var totalMins=turnos.reduce(function(a,t){return a+t.durMins;},0);

  // ── Limpiar H-J completo (FIX 1: clearDataValidations) ───────────────────
  var lastRowH=sheet.getLastRow();
  if(lastRowH>=1) {
    sheet.getRange(1,8,lastRowH,3)
      .clearContent().clearFormat().clearNote().clearDataValidations();
  }

  // ── Cabecera ──────────────────────────────────────────────────────────────
  var fMin=fichajesSel[0].fechaISO.split('-').map(Number);
  var fMax=fichajesSel[fichajesSel.length-1].fechaISO.split('-').map(Number);
  var cabTxt='📋 '+nombre+' · '+('0'+fMin[2]).slice(-2)+'/'+('0'+fMin[1]).slice(-2)+' – '+('0'+fMax[2]).slice(-2)+'/'+('0'+fMax[1]).slice(-2);
  sheet.getRange(1,8,1,3).merge().setValue(cabTxt)
    .setBackground('#1e3a5f').setFontColor('#ffffff').setFontWeight('bold').setFontSize(9).setWrap(false);
  sheet.getRange(2,8,1,3).setValues([['Problema','Sugerencia','✓']])
    .setBackground('#2d6a35').setFontColor('#ffffff').setFontWeight('bold').setFontSize(8);

  var colH=8,colI=9,colJ=10;

  // ── Analizar turno a turno ────────────────────────────────────────────────
  // v30: los resultados se guardan aquí y se escriben al final, sin pisarse.
  var resultados = [];
  turnos.forEach(function(t,idx){
    var problemas=[],sugerencias=[];
    var horaDiaMins=porDia[t.diaISO]||0;
    var pp=t.diaISO.split('-').map(Number);
    var diaLbl=DIAS_ES[t.dow]+' '+('0'+pp[2]).slice(-2)+'/'+('0'+pp[1]).slice(-2);
    var esUltimoTurnoDia = (idx === turnos.length-1) || (turnos[idx+1].diaISO !== t.diaISO);

    // Máx horas día (con offset aleatorio)
    if(esUltimoTurnoDia && t.salida!=='—' && horaDiaMins > limDia){
      var excesoDia = horaDiaMins - limDia;
      problemas.push('⚠ '+diaLbl+': '+minsToHHMM(horaDiaMins)+' (máx ~'+reglas.maxHDia+'h)');

      if(claveEmp === 'ramiro' && t.dow === 5) {
        // Ramiro viernes: acortar la ENTRADA del primer turno del día (entra más tarde)
        var turnosDia = turnos.filter(function(tt){ return tt.diaISO===t.diaISO; });
        turnosDia.sort(function(a,b){ return a._absMinEntrada - b._absMinEntrada; });
        var primerTurno = turnosDia[0];
        if(primerTurno){
          var entNuevaMins = primerTurno.entradaMins + excesoDia;
          if(entNuevaMins >= 1440) entNuevaMins -= 1440;
          var entClampR = clampSugerencia(primerTurno.entradaMins, 'entrada', entNuevaMins);
          sugerencias.push({
            tipo:'cambiarEntrada',
            fecha:primerTurno.fechaEntradaReal,
            horaActual:primerTurno.entrada,
            horaNueva:minsToHora(entClampR),
            texto:'Entrada '+primerTurno.entrada+' → '+minsToHora(entClampR)+' (viernes Ramiro)'
          });
        }
      } else if(claveEmp === 'maria' && t.dow === 5 && horaDiaMins > 11*60) {
        // María viernes >11h: hasta 3 sugerencias en orden
        var turnosDiaM = turnos.filter(function(tt){ return tt.diaISO===t.diaISO && tt.salida!=='—'; });
        turnosDiaM.sort(function(a,b){ return b._absMinSalida - a._absMinSalida; });
        var excesoRestante = horaDiaMins - limDia;

        // Sugerencia 1: quitar 1h de la salida del último turno
        var ultimoTurnoM = turnosDiaM[0];
        if(ultimoTurnoM){
          var sal1Mins = ultimoTurnoM.salidaMins - 60;
          if(sal1Mins < 0) sal1Mins += 1440;
          var sal1Clamp = clampSugerencia(ultimoTurnoM.entradaMins, 'salida', sal1Mins);
          sugerencias.push({
            tipo:'cambiarSalida',
            fecha:ultimoTurnoM.fechaSalidaReal,
            horaActual:ultimoTurnoM.salida,
            horaNueva:minsToHora(sal1Clamp),
            texto:'Salida último turno '+ultimoTurnoM.salida+' → '+minsToHora(sal1Clamp)+' (−1h)'
          });
          excesoRestante -= 60;
        }

        // Sugerencia 2: eliminar turno de menos de 1h (si aún hay exceso)
        if(excesoRestante > 0){
          var turnoCorto = null;
          for(var tmi=0;tmi<turnosDiaM.length;tmi++){
            if(turnosDiaM[tmi].durMins < 60){ turnoCorto = turnosDiaM[tmi]; break; }
          }
          if(turnoCorto){
            excesoRestante -= turnoCorto.durMins;
            sugerencias.push({
              tipo:'eliminarTurno',
              fecha:turnoCorto.fechaEntradaReal,
              horaEntrada:turnoCorto.entrada,
              horaSalida:turnoCorto.salida,
              salidaISO:turnoCorto.fechaSalidaReal,
              texto:'Eliminar turno corto '+turnoCorto.entrada+'-'+turnoCorto.salida+' (<1h)'
            });
          }
        }

        // Sugerencia 3: entrada más tarde del turno ~11:00 (si aún hay exceso)
        if(excesoRestante > 0){
          var turno11 = null;
          for(var tmi2=0;tmi2<turnosDiaM.length;tmi2++){
            var eMins = turnosDiaM[tmi2].entradaMins;
            if(eMins >= 10*60 && eMins <= 12*60){ turno11 = turnosDiaM[tmi2]; break; }
          }
          if(turno11){
            var ent11Nueva = turno11.entradaMins + excesoRestante;
            if(ent11Nueva >= 1440) ent11Nueva -= 1440;
            var ent11Clamp = clampSugerencia(turno11.entradaMins, 'entrada', ent11Nueva);
            sugerencias.push({
              tipo:'cambiarEntrada',
              fecha:turno11.fechaEntradaReal,
              horaActual:turno11.entrada,
              horaNueva:minsToHora(ent11Clamp),
              texto:'Entrada turno ~11h '+turno11.entrada+' → '+minsToHora(ent11Clamp)
            });
          }
        }

      } else {
        // Caso general: acortar salida del turno más largo
        var turnosMasLargos = turnos.filter(function(tt){ return tt.diaISO===t.diaISO && tt.salida!=='—'; });
        turnosMasLargos.sort(function(a,b){ return b.durMins-a.durMins; });
        var turnoAcortar = turnosMasLargos[0] || t;
        var salActMins = turnoAcortar.salidaMins !== null ? turnoAcortar.salidaMins : 0;
        var salNuevaMins = salActMins - excesoDia;
        if(salNuevaMins < 0) salNuevaMins += 1440;
        var salClamp = clampSugerencia(turnoAcortar.entradaMins, 'salida', salNuevaMins);
        sugerencias.push({
          tipo:'cambiarSalida',
          fecha:turnoAcortar.fechaSalidaReal,
          horaActual:turnoAcortar.salida,
          horaNueva:minsToHora(salClamp),
          texto:'Salida '+turnoAcortar.salida+' → '+minsToHora(salClamp)
        });
      }
    }

    // Richard: quitar sábados
    if(reglas.quitarSabados&&t.dow===6&&t.salida!=='—'){
      problemas.push('⚠ '+diaLbl+': turno en sábado');
      sugerencias.push({tipo:'eliminarTurno',fecha:t.fechaEntradaReal,horaEntrada:t.entrada,horaSalida:t.salida,salidaISO:t.fechaSalidaReal,texto:'Eliminar sábado '+t.entrada+'-'+t.salida});
    }

    // Jessica: quitar mediodías lun-jue
    if(reglas.quitarMediodiasLunJue&&t.dow>=1&&t.dow<=4&&t.salida!=='—'){
      var eH=horaToMins(t.entrada);
      if(eH!==null&&eH>=540&&eH<=900){
        problemas.push('⚠ '+diaLbl+': turno lun-jue ('+t.entrada+'-'+t.salida+')');
        sugerencias.push({tipo:'eliminarTurno',fecha:t.fechaEntradaReal,horaEntrada:t.entrada,horaSalida:t.salida,salidaISO:t.fechaSalidaReal,texto:'Eliminar turno lun-jue '+t.entrada+'-'+t.salida});
      }
    }

    // Exceso semanal (con offset aleatorio)
    if(limSemana && esUltimoTurnoDia && idx===turnos.length-1 && totalMins > limSemana){
      var excesoSem = totalMins - limSemana;
      problemas.push('⚠ Semana: '+minsToHHMM(totalMins)+' (objetivo ~'+reglas.maxHSemana+'h, exceso '+minsToHHMM(excesoSem)+')');

      var restanteSem = excesoSem;

      // ── NUEVO v24 · Empleados con patrón de turnos fijos (Jennifer) ────────
      // Primero se propone ELIMINAR los turnos que caen FUERA del patrón fijo,
      // de mayor a menor duración, hasta cubrir el exceso semanal.
      if(reglas.turnosFijos){
        var fueraPatron = turnos.filter(function(tt){
          return tt.salida!=='—' && !esTurnoFijo(reglas.turnosFijos, tt.dow, tt.entradaMins);
        });
        fueraPatron.sort(function(a,b){return b.durMins-a.durMins;});
        for(var fp=0; fp<fueraPatron.length && restanteSem>0; fp++){
          var tFuera = fueraPatron[fp];
          var ppFu   = tFuera.diaISO.split('-').map(Number);
          var diaFuLbl = DIAS_ES[tFuera.dow]+' '+('0'+ppFu[2]).slice(-2)+'/'+('0'+ppFu[1]).slice(-2);
          sugerencias.push({
            tipo:'eliminarTurno',
            fecha:tFuera.fechaEntradaReal,
            horaEntrada:tFuera.entrada,
            horaSalida:tFuera.salida,
            salidaISO:tFuera.fechaSalidaReal,
            texto:'Eliminar turno fuera de horario fijo: '+diaFuLbl+' '+tFuera.entrada+'-'+tFuera.salida+' ('+minsToHHMM(tFuera.durMins)+')'
          });
          restanteSem -= tFuera.durMins;
        }
      }

      // Si aún queda exceso, acortar el turno más largo.
      // En empleados con patrón fijo solo se tocan los turnos DENTRO del patrón,
      // porque los de fuera ya se han propuesto para eliminar arriba.
      if(restanteSem > 0){
        var turnosConSalida=turnos.filter(function(tt){
          if(tt.salida==='—') return false;
          if(reglas.turnosFijos) return esTurnoFijo(reglas.turnosFijos, tt.dow, tt.entradaMins);
          return true;
        });
        turnosConSalida.sort(function(a,b){return b.durMins-a.durMins;});
        if(turnosConSalida.length>0){
          var tLargo=turnosConSalida[0];
          var salLargoMins=tLargo.salidaMins !== null ? tLargo.salidaMins : 0;
          var salRedMins=salLargoMins-restanteSem;
          if(salRedMins<0)salRedMins+=1440;
          var salRedClamp = clampSugerencia(tLargo.entradaMins, 'salida', salRedMins);
          var diaLargoLbl=DIAS_ES[new Date(tLargo.diaISO.split('-').map(Number)[0],tLargo.diaISO.split('-').map(Number)[1]-1,tLargo.diaISO.split('-').map(Number)[2]).getDay()]+' '+tLargo.diaISO.slice(8,10)+'/'+tLargo.diaISO.slice(5,7);
          sugerencias.push({
            tipo:'cambiarSalida',
            fecha:tLargo.fechaSalidaReal,
            horaActual:tLargo.salida,
            horaNueva:minsToHora(salRedClamp),
            texto:'Acortar turno más largo: salida '+tLargo.salida+' → '+minsToHora(salRedClamp)+' ('+diaLargoLbl+')'
          });
        }
      }
    }

    // Descanso mínimo — solo entre días laborales DISTINTOS (con offset aleatorio)
    if(t.entrada!=='—'){
      var ppE2=t.fechaEntradaReal.split('-').map(Number);
      var dE2=new Date(ppE2[0],ppE2[1]-1,ppE2[2]);
      var miEntAbs = Math.floor(dE2.getTime()/60000) + t.entradaMins;

      var mejorDiff=Infinity, mejorHoraSal=null, mejorFechaSal=null;
      for(var fi=0;fi<todosFichajes.length;fi++){
        var ff=todosFichajes[fi];
        if(ff.tipo!=='SALIDA') continue;
        // Solo comparar con salidas de un día laboral DIFERENTE al de esta entrada
        if(ff.diaKey === t.diaISO) continue;
        var ppS2=ff.fechaISO.split('-').map(Number);
        var dS2=new Date(ppS2[0],ppS2[1]-1,ppS2[2]);
        var absS2 = Math.floor(dS2.getTime()/60000) + ff.mins;
        if(absS2 < miEntAbs){
          var diff=miEntAbs-absS2;
          if(diff<mejorDiff){mejorDiff=diff;mejorHoraSal=ff.hora;mejorFechaSal=ff.fechaISO;}
        }
      }
      // v31: se avisa solo si el descanso es MENOR de 12 h exactas. El margen
      // aleatorio (offsetDescanso) solo se usa para calcular la nueva hora.
      if(mejorDiff<Infinity && mejorDiff < reglas.minDescanso * 60){
        var falta = limDescanso - mejorDiff;
        // Entrada nueva: más tarde en falta minutos
        var entNuevaMins = t.entradaMins + falta;
        if(entNuevaMins>=1440) entNuevaMins-=1440;
        var entClamp = clampSugerencia(t.entradaMins, 'entrada', entNuevaMins);
        // Salida nueva: también más tarde los mismos minutos para mantener horas trabajadas
        // Buscamos la salida de ESTE turno (el que sigue a esta entrada en turnos[])
        var turnoActual = null;
        for(var ti=0;ti<turnos.length;ti++){
          if(turnos[ti].filaEntrada===t.filaEntrada){turnoActual=turnos[ti];break;}
        }
        problemas.push('⚠ '+diaLbl+': solo '+minsToHHMM(mejorDiff)+' descanso (mín ~'+reglas.minDescanso+'h)');
        // Sugerencia 1: cambiar entrada
        sugerencias.push({
          tipo:'cambiarEntrada',
          fecha:t.fechaEntradaReal,
          horaActual:t.entrada,
          horaNueva:minsToHora(entClamp),
          texto:'Descanso '+diaLbl+': entrada '+t.entrada+' → '+minsToHora(entClamp)
        });
        // Sugerencia 2: cambiar salida del mismo turno la misma cantidad
        // Solo si la corrección es significativa (>15 min) para evitar sugerencias triviales
        if(falta > 15 && turnoActual && turnoActual.salida!=='—' && turnoActual.salidaMins!==null){
          var salNuevaMins2 = turnoActual.salidaMins + falta;
          if(salNuevaMins2>=1440) salNuevaMins2-=1440;
          var salClamp2 = clampSugerencia(t.entradaMins, 'salida', salNuevaMins2);
          sugerencias.push({
            tipo:'cambiarSalida',
            fecha:turnoActual.fechaSalidaReal,
            horaActual:turnoActual.salida,
            horaNueva:minsToHora(salClamp2),
            texto:'Descanso '+diaLbl+': salida '+turnoActual.salida+' → '+minsToHora(salClamp2)+' (mantiene horas)'
          });
        }
      }
    }

    resultados.push({ filaRef: t.filaEntrada, problemas: problemas, sugerencias: sugerencias });
  });

  // v30 · Escribir de arriba abajo sin pisar. Antes cada turno escribía sus
  // sugerencias hacia abajo desde su fila y, como se procesaban del más
  // antiguo al más reciente (de abajo arriba en la hoja), el último turno
  // (con las sugerencias de exceso semanal) machacaba las de los turnos de
  // debajo — p. ej. el aviso de descanso del sábado mediodía desaparecía.
  resultados.sort(function(a,b){ return a.filaRef - b.filaRef; });
  var siguienteLibre = 3; // filas 1-2 = cabecera del análisis
  resultados.forEach(function(r){
    var fr0 = Math.max(r.filaRef, siguienteLibre);
    if(r.problemas.length===0){
      sheet.getRange(fr0,colH).setValue('✅ OK')
        .setBackground('#e6f4e8').setFontSize(8).setFontColor('#15803d');
      siguienteLibre = fr0 + 1;
    } else if(r.sugerencias.length===0){
      sheet.getRange(fr0,colH).setValue(r.problemas.join(' | '))
        .setBackground('#fde8eb').setFontSize(8).setWrap(true).setFontColor('#991b1b');
      siguienteLibre = fr0 + 1;
    } else {
      r.sugerencias.forEach(function(sug,si){
        var fr=fr0+si;
        sheet.getRange(fr,colH).setValue(si===0?r.problemas.join(' | '):'')
          .setBackground('#fde8eb').setFontSize(8).setWrap(true).setFontColor('#991b1b');
        sheet.getRange(fr,colI).setValue(sug.texto)
          .setBackground('#fff7ed').setFontSize(8).setWrap(true).setFontColor('#92400e');
        sheet.getRange(fr,colJ).insertCheckboxes().setNote(JSON.stringify(sug)).setBackground('#fff7ed');
      });
      siguienteLibre = fr0 + r.sugerencias.length;
    }
  });

  // Resumen debajo de la última fila seleccionada (o de la última sugerencia)
  var filaRes=Math.max(fichajesSel[fichajesSel.length-1].fila+2, siguienteLibre+1);
  var resTxt='TOTAL: '+minsToHHMM(totalMins);
  var bgRes='#e6f4e8';
  if(reglas.maxHSemana&&totalMins>reglas.maxHSemana*60){
    var exc=totalMins-reglas.maxHSemana*60;
    resTxt+='  ⚠ excede objetivo '+reglas.maxHSemana+'h en '+minsToHHMM(exc);
    bgRes='#fde8eb';
  } else if(reglas.maxHSemana){
    resTxt+='  ✅ objetivo '+reglas.maxHSemana+'h';
  }
  sheet.getRange(filaRes,colH,1,3).merge().setValue(resTxt)
    .setBackground(bgRes).setFontWeight('bold').setFontSize(9).setWrap(true);

  sheet.setColumnWidth(colH,200);
  sheet.setColumnWidth(colI,220);
  sheet.setColumnWidth(colJ,40);

  sheet.setActiveRange(sheet.getRange(fichajesSel[0].fila,colH));
}

// ── Aplicar cambios marcados con checkbox en col J ────────────────────────────
function aplicarCambiosMarcados() {
  var ss     = SpreadsheetApp.getActiveSpreadsheet();
  var ui     = SpreadsheetApp.getUi();
  var sheet  = ss.getActiveSheet();
  var nombre = sheet.getName();

  if(HOJAS_SISTEMA.indexOf(nombre)!==-1||nombre.indexOf('ORIGINAL')!==-1){
    ui.alert('Abre la hoja del empleado cuyos cambios quieres aplicar.');
    return;
  }

  var lastRow=sheet.getLastRow();
  if(lastRow<1){ui.alert('No hay análisis en esta hoja.');return;}

  var chkVals=sheet.getRange(1,10,lastRow,1).getValues();
  var cambios=[];
  for(var i=0;i<lastRow;i++){
    if(chkVals[i][0]!==true) continue;
    var nota=sheet.getRange(i+1,10).getNote();
    if(!nota) continue;
    try{cambios.push(JSON.parse(nota));}catch(e){}
  }

  if(!cambios.length){
    ui.alert('No hay sugerencias marcadas en la columna J.\nMarca los checkboxes y vuelve a ejecutar.');
    return;
  }

  var empSheet=getHojaEmpleado(ss,nombre);
  if(!empSheet){ui.alert('No se encontró la hoja de '+nombre);return;}

  var aplicados=0;
  cambios.forEach(function(c){
    if(c.tipo==='cambiarSalida'){
      if(aplicarCambioHora(empSheet,c.fecha,'SALIDA',c.horaActual,c.horaNueva)) aplicados++;
    } else if(c.tipo==='cambiarEntrada'){
      if(aplicarCambioHora(empSheet,c.fecha,'ENTRADA',c.horaActual,c.horaNueva)) aplicados++;
    } else if(c.tipo==='eliminarTurno'){
      var v=empSheet.getDataRange().getValues();
      var d=empSheet.getDataRange().getDisplayValues();
      var st=(v.length>0&&String(v[0][1]).toUpperCase()==='TIPO')?1:0;
      for(var j=st;j<v.length;j++){
        var fi2=toISOFromCell(v[j][0]); var ti2=String(v[j][1]||'').toUpperCase().trim();
        var h2=normHora(String(d[j][2]||'').substring(0,5));
        if(fi2===c.fecha&&ti2==='ENTRADA'&&h2===c.horaEntrada){empSheet.deleteRow(j+1);v=empSheet.getDataRange().getValues();d=empSheet.getDataRange().getDisplayValues();aplicados++;break;}
      }
      v=empSheet.getDataRange().getValues();d=empSheet.getDataRange().getDisplayValues();
      st=(v.length>0&&String(v[0][1]).toUpperCase()==='TIPO')?1:0;
      var fechaSal=c.salidaISO||c.fecha;
      for(var jj=st;jj<v.length;jj++){
        var fi3=toISOFromCell(v[jj][0]); var ti3=String(v[jj][1]||'').toUpperCase().trim();
        var h3=normHora(String(d[jj][2]||'').substring(0,5));
        if(fi3===fechaSal&&ti3==='SALIDA'&&h3===c.horaSalida){empSheet.deleteRow(jj+1);aplicados++;break;}
      }
    }
  });

  if(aplicados>0){
    reordenarHoja(empSheet);
    recalcularHoja(empSheet);
    sincronizarEmpleadoASupabase(empSheet.getName(),empSheet);
    var lr=sheet.getLastRow();
    if(lr>=1) sheet.getRange(1,8,lr,3).clearContent().clearFormat().clearNote().clearDataValidations();
    ui.alert('✅ '+aplicados+' cambio(s) aplicados y sincronizados con Supabase.\nLa hoja ORIGINAL no ha sido modificada.\n\nVuelve a seleccionar y analizar para ver el resultado actualizado.');
  } else {
    ui.alert('No se aplicó ningún cambio. Comprueba que las horas no han cambiado desde el análisis.');
  }
}

function aplicarCambioHora(sheet, fechaISO, tipo, horaActual, horaNueva) {
  var range   = sheet.getDataRange();
  var vals    = range.getValues();
  var display = range.getDisplayValues();
  var start   = (vals.length > 0 && String(vals[0][1]).toUpperCase() === 'TIPO') ? 1 : 0;
  for (var i = start; i < vals.length; i++) {
    var fISO  = toISOFromCell(vals[i][0]);
    var fTipo = String(vals[i][1] || '').toUpperCase().trim();
    var fHora = normHora(String(display[i][2] || '').substring(0, 5));
    if (fISO === fechaISO && fTipo === tipo && fHora === horaActual) {
      // Cambiar la hora
      var cellHora = sheet.getRange(i + 1, 3);
      cellHora.setNumberFormat('@STRING@');
      cellHora.setValue(horaNueva);

      // Comprobar si hay que cambiar también la fecha:
      // - hora actual era de madrugada (< NUEVO_DIA_MINS) y la nueva NO lo es
      //   → el fichaje "sale" de la madrugada: fecha debe retroceder un día
      // - hora actual NO era de madrugada y la nueva SÍ lo es
      //   → el fichaje "entra" en madrugada: fecha debe avanzar un día
      var minsActual = horaToMins(horaActual);
      var minsNueva  = horaToMins(horaNueva);
      if (minsActual !== null && minsNueva !== null) {
        var eraMarugada  = minsActual < NUEVO_DIA_MINS;
        var seraMarugada = minsNueva  < NUEVO_DIA_MINS;
        if (eraMarugada && !seraMarugada) {
          // Saliendo de madrugada → retroceder un día
          var fechaNueva = diaAnterior(fechaISO);
          var cellFecha = sheet.getRange(i + 1, 1);
          cellFecha.setNumberFormat('@STRING@');
          cellFecha.setValue(fechaConDia(fechaNueva));
        } else if (!eraMarugada && seraMarugada) {
          // Entrando en madrugada → avanzar un día
          var fechaNueva = diaSiguiente(fechaISO);
          var cellFecha = sheet.getRange(i + 1, 1);
          cellFecha.setNumberFormat('@STRING@');
          cellFecha.setValue(fechaConDia(fechaNueva));
        }
      }
      return true;
    }
  }
  return false;
}

// ══════════════════════════════════════════════════════════════════════════════
// HELPERS GENERALES
// ══════════════════════════════════════════════════════════════════════════════
function fechaConDia(isoDate) {
  if (!isoDate) return '';
  var p = String(isoDate).substring(0,10).split('-');
  if (p.length < 3) return isoDate;
  var d = new Date(parseInt(p[0]), parseInt(p[1])-1, parseInt(p[2]));
  var DIAS = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  return DIAS[d.getDay()] + ', ' + p[2] + '/' + p[1] + '/' + p[0];
}

function asegurarCabecera(sheet) {
  if (sheet.getLastRow() < 1) {
    sheet.appendRow(['Fecha','Tipo','Hora','HoraTurno','HoraDia','HoraSemana','']); return;
  }
  var cab = sheet.getRange(1, 1, 1, 6).getValues()[0];
  if (String(cab[1]).toUpperCase() !== 'TIPO') {
    sheet.insertRowBefore(1);
    sheet.getRange(1, 1, 1, 6).setValues([['Fecha','Tipo','Hora','HoraTurno','HoraDia','HoraSemana']]);
  }
}

function getHojaEmpleado(ss, nombre) {
  nombre = String(nombre || '').replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
  var sheet = ss.getSheetByName(nombre);
  if (sheet) return sheet;
  var partes  = String(nombre || '').trim().split(/\s+/);
  var primero = partes[0];
  sheet = ss.getSheetByName(primero);
  if (sheet) return sheet;
  var titleCase = primero.charAt(0).toUpperCase() + primero.slice(1).toLowerCase();
  sheet = ss.getSheetByName(titleCase);
  if (sheet) return sheet;
  sheet = ss.getSheetByName(primero.toUpperCase());
  if (sheet) return sheet;
  var todas = ss.getSheets();
  var primeroLower = primero.toLowerCase();
  for (var i = 0; i < todas.length; i++) {
    var hNombre = todas[i].getName();
    if (HOJAS_SISTEMA.indexOf(hNombre) !== -1) continue;
    if (hNombre.indexOf('ORIGINAL') !== -1) continue;
    if (hNombre.trim().split(/\s+/)[0].toLowerCase() === primeroLower) return todas[i];
  }
  return null;
}

function getInicioSemana(fechaISO) {
  var p = fechaISO.split('-').map(Number);
  var d = new Date(p[0], p[1]-1, p[2]);
  var dow = d.getDay();
  var diffLunes = (dow === 0) ? -6 : 1 - dow;
  d.setDate(d.getDate() + diffLunes);
  return d.getFullYear() + '-' + ('0'+(d.getMonth()+1)).slice(-2) + '-' + ('0'+d.getDate()).slice(-2);
}

function fmtFechaReq(val) {
  if (!val || val === '') return '';
  if (val instanceof Date) return Utilities.formatDate(val, Session.getScriptTimeZone(), 'dd/MM/yyyy, HH:mm');
  return String(val);
}

function formatHoraConSegundos(v) {
  if (!v && v !== 0) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') return Utilities.formatDate(v, Session.getScriptTimeZone(), 'HH:mm:ss');
  if (typeof v === 'number' && v >= 0 && v < 1) {
    var totalSecs = Math.round(v * 86400);
    var h = Math.floor(totalSecs / 3600), mn = Math.floor((totalSecs % 3600) / 60), ss2 = totalSecs % 60;
    return ('0'+h).slice(-2) + ':' + ('0'+mn).slice(-2) + ':' + ('0'+ss2).slice(-2);
  }
  return String(v).trim();
}

function horaConSegsDeRaw(rawVal, displayStr) {
  var fromRaw = formatHoraConSegundos(rawVal);
  if (fromRaw && fromRaw.match(/^\d{2}:\d{2}:\d{2}$/)) return fromRaw;
  return String(displayStr || '').trim();
}

function minsToHHMM(m) {
  if (m === null || m === undefined || m < 0) return '';
  return Math.floor(m / 60) + 'h ' + ('0' + (m % 60)).slice(-2) + 'min';
}

function minsToHora(m) {
  if (m < 0) m += 1440; if (m >= 1440) m -= 1440;
  return ('0' + Math.floor(m/60)).slice(-2) + ':' + ('0' + (m%60)).slice(-2);
}

function horaToMins(s) {
  var m = String(s || '').match(/^(\d{1,2}):(\d{2})/);
  return m ? (+m[1]) * 60 + (+m[2]) : null;
}

function normHora(s) {
  s = String(s || '').trim();
  var m = s.match(/^(\d{1,2}):(\d{2})/);
  if (m) return ('0' + m[1]).slice(-2) + ':' + m[2];
  var m2 = s.match(/(\d{2}):(\d{2}):\d{2}/);
  if (m2) return m2[1] + ':' + m2[2];
  return s.substring(0, 5);
}

function toISOFromCell(v) {
  if (!v) return null;
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return v.getFullYear() + '-' + ('0'+(v.getMonth()+1)).slice(-2) + '-' + ('0'+v.getDate()).slice(-2);
  }
  var s = String(v).trim();
  var conDia = s.match(/^[A-Za-záéíóúÁÉÍÓÚüÜ]+,\s*(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (conDia) return conDia[3] + '-' + ('0'+conDia[2]).slice(-2) + '-' + ('0'+conDia[1]).slice(-2);
  var dm = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dm) return dm[3] + '-' + ('0'+dm[2]).slice(-2) + '-' + ('0'+dm[1]).slice(-2);
  var im = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (im) return s.slice(0, 10);
  var corto = s.match(/^[A-Za-záéíóú]+\s+(\d{1,2})\/(\d{2})\/(\d{4})$/);
  if (corto) return corto[3] + '-' + ('0'+corto[2]).slice(-2) + '-' + ('0'+corto[1]).slice(-2);
  if (s.length > 15) {
    var d = new Date(s);
    if (!isNaN(d.getTime())) return d.getFullYear() + '-' + ('0'+(d.getMonth()+1)).slice(-2) + '-' + ('0'+d.getDate()).slice(-2);
  }
  return null;
}

function toISO(s) {
  s = String(s || '').trim();
  var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return m[3] + '-' + ('0'+m[2]).slice(-2) + '-' + ('0'+m[1]).slice(-2);
  var im = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (im) return s.slice(0, 10);
  return s;
}

function isoToDisplay(iso) {
  if (!iso) return '';
  var m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  var DIAS = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
  var d = new Date(parseInt(m[1]), parseInt(m[2])-1, parseInt(m[3]));
  return DIAS[d.getDay()] + ' ' + m[3] + '/' + m[2] + '/' + m[1];
}

function diaAnterior(isoDate) {
  var p = isoDate.split('-').map(Number);
  var d = new Date(p[0], p[1]-1, p[2]); d.setDate(d.getDate() - 1);
  return d.getFullYear() + '-' + ('0'+(d.getMonth()+1)).slice(-2) + '-' + ('0'+d.getDate()).slice(-2);
}

function diaSiguiente(isoDate) {
  var p = isoDate.split('-').map(Number);
  var d = new Date(p[0], p[1]-1, p[2]); d.setDate(d.getDate() + 1);
  return d.getFullYear() + '-' + ('0'+(d.getMonth()+1)).slice(-2) + '-' + ('0'+d.getDate()).slice(-2);
}

function formatFecha(v) {
  if (!v) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') return Utilities.formatDate(v, Session.getScriptTimeZone(), 'dd/MM/yyyy');
  return String(v).trim();
}

function resp(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ══════════════════════════════════════════════════════════════════════════════
// HORARIO SEMANAL
// ══════════════════════════════════════════════════════════════════════════════

var EMPLEADOS_HORARIO = ['Ramiro', 'Luciana', 'Yamila', 'Julio', 'Shenay', 'Jennifer', 'Juliana', 'Jessica'];

var FILAS_EMPLEADOS_HORARIO = {
  'Ramiro':   5,
  'Luciana':  10,
  'Yamila':   15,
  'Julio':    20,
  'Shenay':   25,
  'Jennifer': 30,
  'Juliana':  35,
  'Jessica':  40
};

function rellenarHorarioSemanal() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();

  var resp = ui.prompt(
    '📅 Rellenar horario semanal',
    'Introduce cualquier fecha de la semana que quieres cargar\n(formato DD/MM/YYYY, o deja vacío para la semana actual):',
    ui.ButtonSet.OK_CANCEL
  );
  if (resp.getSelectedButton() !== ui.Button.OK) return;

  var inputFecha = resp.getResponseText().trim();
  var fechaRef;
  if (!inputFecha) {
    fechaRef = new Date();
  } else {
    var partes = inputFecha.split('/');
    if (partes.length !== 3) {
      ui.alert('Formato incorrecto. Usa DD/MM/YYYY.');
      return;
    }
    fechaRef = new Date(parseInt(partes[2]), parseInt(partes[1]) - 1, parseInt(partes[0]));
    if (isNaN(fechaRef.getTime())) {
      ui.alert('Fecha no válida.');
      return;
    }
  }

  var dow = fechaRef.getDay();
  var diffLunes = (dow === 0) ? -6 : 1 - dow;
  var lunes = new Date(fechaRef);
  lunes.setDate(fechaRef.getDate() + diffLunes);

  var diasSemana = [];
  for (var d = 0; d < 7; d++) {
    var dia = new Date(lunes);
    dia.setDate(lunes.getDate() + d);
    diasSemana.push(dia);
  }

  var hojaHorario = ss.getSheetByName('HORARIO');
  if (!hojaHorario) {
    ui.alert('No se encontró la hoja "HORARIO".');
    return;
  }

  var MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
               'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  var COL_INICIO = 8;

  hojaHorario.getRange(2, 7).setValue(MESES[lunes.getMonth()].toUpperCase());
  hojaHorario.getRange(3, 7).setValue('Sem ' + getNumSemana(lunes));

  var nombresDias = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];
  for (var c = 0; c < 7; c++) {
    hojaHorario.getRange(3, COL_INICIO + c).setValue(nombresDias[c]);
    hojaHorario.getRange(4, COL_INICIO + c).setValue(diasSemana[c].getDate());
  }

  var procesados = 0;

  EMPLEADOS_HORARIO.forEach(function(nombre) {
    var filaBase = FILAS_EMPLEADOS_HORARIO[nombre];
    if (!filaBase) return;

    hojaHorario.getRange(filaBase, COL_INICIO, 4, 7).clearContent();

    // Leer datos desde la hoja ORIGINAL (datos sin modificar)
    var nombreOrig = nombre.toUpperCase() + 'ORIGINAL';
    var hojaEmp = ss.getSheetByName(nombreOrig);
    if (!hojaEmp) {
      // Fallback a la hoja normal si no existe ORIGINAL
      hojaEmp = getHojaEmpleado(ss, nombre);
    }
    if (!hojaEmp) {
      Logger.log('No se encontró hoja para: ' + nombre);
      return;
    }

    var vals    = hojaEmp.getDataRange().getValues();
    var display = hojaEmp.getDataRange().getDisplayValues();
    var start   = (vals.length > 0 && String(vals[0][1]).toUpperCase() === 'TIPO') ? 1 : 0;

    var fichajesPorDia = {};
    for (var i = start; i < vals.length; i++) {
      var fechaISO = toISOFromCell(vals[i][0]);
      if (!fechaISO) continue;
      var tipo = String(vals[i][1] || '').toUpperCase().trim();
      var hora = normHora(String(display[i][2] || '').substring(0, 5));
      if (tipo !== 'ENTRADA' && tipo !== 'SALIDA') continue;
      if (!hora) continue;
      if (!fichajesPorDia[fechaISO]) fichajesPorDia[fechaISO] = [];
      fichajesPorDia[fechaISO].push({ tipo: tipo, hora: hora, mins: horaToMins(hora) });
    }

    for (var d = 0; d < 7; d++) {
      var dia    = diasSemana[d];
      var diaISO = dia.getFullYear() + '-' +
                   ('0' + (dia.getMonth() + 1)).slice(-2) + '-' +
                   ('0' + dia.getDate()).slice(-2);

      var diaSig = new Date(dia);
      diaSig.setDate(dia.getDate() + 1);
      var diaISO_sig = diaSig.getFullYear() + '-' +
                       ('0' + (diaSig.getMonth() + 1)).slice(-2) + '-' +
                       ('0' + diaSig.getDate()).slice(-2);

      var col = COL_INICIO + d;

      var fichajesDia = (fichajesPorDia[diaISO] || []).map(function(f) {
        return { tipo: f.tipo, hora: f.hora, mins: f.mins, madrugada: false };
      });

      var fichajesMadrugada = (fichajesPorDia[diaISO_sig] || [])
        .filter(function(f) { return f.mins !== null && f.mins < NUEVO_DIA_MINS; })
        .map(function(f) {
          var horaExt = (24 + Math.floor(f.mins / 60)) + ':' + ('0' + (f.mins % 60)).slice(-2);
          return { tipo: f.tipo, hora: horaExt, mins: f.mins + 1440, madrugada: true };
        });

      var fichajes = fichajesDia.concat(fichajesMadrugada);
      if (fichajes.length === 0) continue;

      fichajes.sort(function(a, b) { return a.mins - b.mins; });

      var turnos = [];
      var k = 0;
      while (k < fichajes.length) {
        if (fichajes[k].tipo === 'ENTRADA') {
          var turno = { entrada: fichajes[k].hora, salida: null };
          for (var s = k + 1; s < fichajes.length; s++) {
            if (fichajes[s].tipo === 'SALIDA') {
              turno.salida = fichajes[s].hora;
              k = s + 1;
              break;
            }
          }
          if (!turno.salida) k++;
          turnos.push(turno);
        } else {
          k++;
        }
      }

      if (turnos.length >= 1) {
        if (turnos[0].entrada) hojaHorario.getRange(filaBase,     col).setValue(turnos[0].entrada);
        if (turnos[0].salida)  hojaHorario.getRange(filaBase + 1, col).setValue(turnos[0].salida);
      }
      if (turnos.length >= 2) {
        if (turnos[1].entrada) hojaHorario.getRange(filaBase + 2, col).setValue(turnos[1].entrada);
        if (turnos[1].salida)  hojaHorario.getRange(filaBase + 3, col).setValue(turnos[1].salida);
      }
    }

    procesados++;
  });

  ui.alert('✅ Horario cargado para ' + procesados + ' empleados.\nSemana del ' +
    ('0' + lunes.getDate()).slice(-2) + '/' + ('0' + (lunes.getMonth()+1)).slice(-2) + '/' + lunes.getFullYear() +
    ' al ' +
    ('0' + diasSemana[6].getDate()).slice(-2) + '/' + ('0' + (diasSemana[6].getMonth()+1)).slice(-2) + '/' + diasSemana[6].getFullYear()
  );
}

function getNumSemana(fecha) {
  var d = new Date(Date.UTC(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()));
  var dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

// ══════════════════════════════════════════════════════════════════════════════
// ANÁLISIS AUTOMÁTICO DE ERRORES — envío semanal por email
// ══════════════════════════════════════════════════════════════════════════════

// ── Para probar solo con un empleado, cambia SOLO_EMPLEADO a su nombre ────────
var SOLO_EMPLEADO = ''; // ej: 'Luciana' para prueba; '' para todos

function analizarYEnviarErrores() {
  var ss       = SpreadsheetApp.getActiveSpreadsheet();
  var empSheet = ss.getSheetByName('EMPLEADOS');
  if (!empSheet) { Logger.log('No se encontró hoja EMPLEADOS'); return; }

  var empRows = empSheet.getDataRange().getValues();
  var start   = (empRows.length > 0 && isNaN(empRows[0][3])) ? 1 : 0;

  // Límite superior del análisis: 23:59:59 del día anterior (domingo si se ejecuta en lunes).
  // Así un fichaje de ENTRADA del día en curso (turno todavía abierto) queda
  // fuera del análisis y no genera un falso "ENTRADA SIN SALIDA".
  var hoy         = new Date();
  var ayer        = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 1, 23, 59, 59);
  var limiteFinMs = ayer.getTime();

  // Fecha límite inferior: 30 días antes del límite superior (no de "ahora")
  // v28: por días de calendario (restar milisegundos fallaba con el cambio de hora)
  var hace30    = new Date(ayer.getFullYear(), ayer.getMonth(), ayer.getDate() - 30);
  var hace30ISO = hace30.getFullYear() + '-'
    + ('0' + (hace30.getMonth() + 1)).slice(-2) + '-'
    + ('0' + hace30.getDate()).slice(-2);

  var aliases  = GmailApp.getAliases();
  var fromAddr = (aliases.indexOf(FROM_EMAIL) !== -1)
    ? FROM_EMAIL
    : Session.getActiveUser().getEmail();

  var totalEnviados = 0;
  var resumen = [];   // v29: lo que se envía a cada empleado, para el resumen

  for (var ei = start; ei < empRows.length; ei++) {
    var nombreEmp = String(empRows[ei][0] || '').trim();
    var emailEmp  = String(empRows[ei][4] || '').trim(); // col E = email

    if (!nombreEmp) continue;

    // Filtro para prueba
    if (SOLO_EMPLEADO && nombreEmp.toLowerCase().indexOf(SOLO_EMPLEADO.toLowerCase()) === -1) continue;

    if (!emailEmp || emailEmp.indexOf('@') === -1) {
      Logger.log('Sin email válido para: ' + nombreEmp);
      // v29: aunque no se le pueda escribir, sus errores van al resumen
      var erroresSinMail = obtenerErroresMes(ss, nombreEmp, hace30ISO, limiteFinMs);
      if (erroresSinMail.length) resumen.push({ nombre: nombreEmp, email: '', errores: erroresSinMail, estado: 'NO ENVIADO (sin email)' });
      continue;
    }

    var errores = obtenerErroresMes(ss, nombreEmp, hace30ISO, limiteFinMs);

    if (!errores.length) {
      Logger.log('Sin errores: ' + nombreEmp);
      continue;
    }

    var primerNombre = nombreEmp.split(' ')[0];
    var titulo = primerNombre + ', tienes ' + errores.length
      + ' fichaje' + (errores.length === 1 ? '' : 's') + ' por revisar';
    var cuerpoHtml  = construirEmailErroresHtml(titulo, errores);
    var cuerpoTexto = 'Hola ' + primerNombre + ',\n\nTienes ' + errores.length
      + ' fichaje(s) por revisar de los últimos 30 días. Entra en la app de fichajes para corregirlos.\n\nUn saludo,\nBuenas y Santas';

    try {
      GmailApp.sendEmail(
        emailEmp,
        titulo,
        cuerpoTexto,
        { from: fromAddr, name: FROM_NAME, htmlBody: cuerpoHtml }
      );
      Logger.log('Email enviado a ' + nombreEmp + ' (' + emailEmp + ') — ' + errores.length + ' error(es)');
      totalEnviados++;
      resumen.push({ nombre: nombreEmp, email: emailEmp, errores: errores, estado: 'Enviado' });
    } catch (mailErr) {
      Logger.log('Error enviando a ' + nombreEmp + ': ' + mailErr);
      resumen.push({ nombre: nombreEmp, email: emailEmp, errores: errores, estado: 'ERROR AL ENVIAR' });
    }
  }

  Logger.log('Análisis completado. Emails enviados: ' + totalEnviados);

  // v29: resumen para administración
  enviarResumenErrores(resumen, totalEnviados, fromAddr);
}

// ── v29 · Email resumen para administración ──────────────────────────────────
function enviarResumenErrores(resumen, totalEnviados, fromAddr) {
  if (!EMAIL_RESUMEN) return;
  try {
    var totalErrores = resumen.reduce(function(a, r) { return a + r.errores.length; }, 0);
    var asunto = 'Resumen fichajes: ' + totalErrores + ' error' + (totalErrores === 1 ? '' : 'es')
      + ' · ' + totalEnviados + ' email' + (totalEnviados === 1 ? '' : 's') + ' enviado' + (totalEnviados === 1 ? '' : 's');

    var texto, html;
    if (!resumen.length) {
      texto = 'Esta semana no se ha enviado ningún aviso: nadie tiene errores de fichaje en los últimos 30 días.';
      html  = '<p style="font-size:14px;color:#374151;">' + texto + '</p>';
    } else {
      texto = resumen.map(function(r) {
        return r.nombre + ' — ' + r.estado + (r.email ? ' (' + r.email + ')' : '') + '\n'
          + r.errores.map(function(e) { return '   · ' + e.badge + ' · ' + e.fecha + ' · ' + e.detalle; }).join('\n');
      }).join('\n\n');

      html = resumen.map(function(r) {
        var colorEstado = (r.estado === 'Enviado') ? '#15803d' : '#991b1b';
        var filas = r.errores.map(function(e) {
          return '<tr>'
            + '<td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;"><span style="background:' + e.badgeBg + ';color:' + e.badgeColor + ';font-size:11px;font-weight:bold;padding:3px 8px;border-radius:6px;">' + e.badge + '</span></td>'
            + '<td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;color:#374151;">' + e.fecha + '</td>'
            + '<td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;color:#374151;text-align:right;">' + e.detalle + '</td>'
            + '</tr>';
        }).join('');
        return '<div style="margin:0 0 18px;">'
          + '<div style="font-size:14px;font-weight:bold;color:#111827;">' + r.nombre
          + ' <span style="font-weight:normal;color:#6b7280;">· ' + r.errores.length + ' error' + (r.errores.length === 1 ? '' : 'es') + '</span></div>'
          + '<div style="font-size:12px;color:' + colorEstado + ';margin:2px 0 6px;">' + r.estado + (r.email ? ' · ' + r.email : '') + '</div>'
          + '<table style="width:100%;border-collapse:collapse;font-size:13px;">' + filas + '</table>'
          + '</div>';
      }).join('');
    }

    var cuerpoHtml = ''
      + '<div style="background:#f3f4f6;padding:24px;font-family:Arial,Helvetica,sans-serif;">'
      + '<div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;padding:22px 26px;">'
      +   '<span style="font-size:13px;color:#9ca3af;">Buenas y Santas · RRHH</span>'
      +   '<h1 style="margin:6px 0 4px;font-size:19px;color:#111827;">Resumen de errores de fichaje</h1>'
      +   '<p style="margin:0 0 18px;font-size:13px;color:#6b7280;">Últimos 30 días · ' + totalErrores + ' error' + (totalErrores === 1 ? '' : 'es')
      +   ' en ' + resumen.length + ' empleado' + (resumen.length === 1 ? '' : 's') + ' · ' + totalEnviados + ' email' + (totalEnviados === 1 ? '' : 's') + ' enviado' + (totalEnviados === 1 ? '' : 's') + '</p>'
      +   html
      + '</div></div>';

    GmailApp.sendEmail(EMAIL_RESUMEN, asunto, texto, { from: fromAddr, name: FROM_NAME, htmlBody: cuerpoHtml });
    Logger.log('Resumen enviado a ' + EMAIL_RESUMEN);
  } catch (err) {
    Logger.log('Error enviando resumen: ' + err);
  }
}

// ── Analiza los fichajes del último mes de un empleado y devuelve array de errores estructurados ──
// limiteFinMs: instante (ms) a partir del cual se ignoran los fichajes (23:59:59 del domingo)
function obtenerErroresMes(ss, nombreEmp, hace30ISO, limiteFinMs) {
  var sheet = getHojaEmpleado(ss, nombreEmp);
  if (!sheet) {
    Logger.log('No se encontró hoja para: ' + nombreEmp);
    return [];
  }

  var range   = sheet.getDataRange();
  var vals    = range.getValues();
  var display = range.getDisplayValues();
  var start   = (vals.length > 0 && String(vals[0][1]).toUpperCase() === 'TIPO') ? 1 : 0;

  // Recoger fichajes del último mes, EXCLUYENDO todo lo posterior al límite (domingo 23:59)
  // v28: se leen también los 2 días anteriores al corte, SOLO para emparejar
  // (así una salida del primer día encuentra su entrada del día anterior).
  // Los errores de esos 2 días extra no se informan.
  var desdeISO = diaAnterior(diaAnterior(hace30ISO));
  var fichajes = [];
  for (var i = start; i < vals.length; i++) {
    var fechaISO = toISOFromCell(vals[i][0]);
    if (!fechaISO || fechaISO < desdeISO) continue;
    var tipo = String(vals[i][1] || '').toUpperCase().trim();
    var hora = normHora(String(display[i][2] || '').substring(0, 5));
    if (tipo !== 'ENTRADA' && tipo !== 'SALIDA') continue;
    if (!hora) continue;

    var pp = fechaISO.split('-').map(Number);
    var horaMins = horaToMins(hora) || 0;
    var absMs = new Date(pp[0], pp[1] - 1, pp[2], Math.floor(horaMins / 60), horaMins % 60, 0).getTime();
    if (absMs > limiteFinMs) continue; // fichaje del turno en curso → se ignora

    fichajes.push({ fechaISO: fechaISO, tipo: tipo, hora: hora, _abs: Math.floor(absMs / 60000), _fila: i });
  }

  if (!fichajes.length) return [];

  // Ordenar por tiempo absoluto
  fichajes.sort(function(a, b) { return (a._abs - b._abs) || (b._fila - a._fila); });

  var errores = [];
  var usados  = new Array(fichajes.length).fill(false);
  // v28: solo se informa un error si su fecha está dentro de los 30 días
  function registrar(fechaRef, obj) { if (fechaRef >= hace30ISO) errores.push(obj); }

  for (var i = 0; i < fichajes.length; i++) {
    if (usados[i]) continue;
    var f = fichajes[i];

    if (f.tipo === 'ENTRADA') {
      usados[i] = true;
      // Buscar la siguiente SALIDA
      var salidaIdx = -1;
      for (var j = i + 1; j < fichajes.length; j++) {
        if (usados[j]) continue;
        if (fichajes[j].tipo === 'SALIDA') { salidaIdx = j; break; }
      }

      if (salidaIdx === -1) {
        // Entrada sin salida
        registrar(f.fechaISO, construirErrorObj('ENTRADA SIN SALIDA', f.fechaISO, f.hora, null, null));
      } else {
        var sal = fichajes[salidaIdx];
        usados[salidaIdx] = true;
        var durMins = sal._abs - f._abs;

        if (durMins < 0) durMins = 0;

        if (durMins < 5) {
          registrar(f.fechaISO, construirErrorObj('TURNO MUY CORTO', f.fechaISO, f.hora, sal.fechaISO, sal.hora, durMins));
        } else if (durMins > 11 * 60) {
          registrar(f.fechaISO, construirErrorObj('TURNO EXCESIVO', f.fechaISO, f.hora, sal.fechaISO, sal.hora, durMins));
        }
      }

    } else {
      // SALIDA sin ENTRADA previa
      usados[i] = true;
      registrar(f.fechaISO, construirErrorObj('SALIDA SIN ENTRADA', null, null, f.fechaISO, f.hora));
    }
  }

  return errores;
}

// ── Construye un objeto de error listo para pintar en la tabla del email ──────
function construirErrorObj(tipo, fechaE, horaE, fechaS, horaS, durMins) {
  var obj = { tipo: tipo };

  if (tipo === 'TURNO EXCESIVO') {
    obj.badge = 'Turno excesivo';
    obj.badgeBg = '#fde8eb'; obj.badgeColor = '#991b1b';
  } else if (tipo === 'TURNO MUY CORTO') {
    obj.badge = 'Turno muy corto';
    obj.badgeBg = '#fde8eb'; obj.badgeColor = '#991b1b';
  } else if (tipo === 'ENTRADA SIN SALIDA') {
    obj.badge = 'Sin salida';
    obj.badgeBg = '#fff7ed'; obj.badgeColor = '#92400e';
  } else {
    // SALIDA SIN ENTRADA
    obj.badge = 'Sin entrada';
    obj.badgeBg = '#fff7ed'; obj.badgeColor = '#92400e';
  }

  if (fechaE && fechaS && fechaE !== fechaS) {
    obj.fecha = fechaE.slice(8,10) + '-' + fechaS.slice(8,10) + '/' + fechaE.slice(5,7);
  } else if (fechaE) {
    obj.fecha = fechaE.slice(8,10) + '/' + fechaE.slice(5,7);
  } else if (fechaS) {
    obj.fecha = fechaS.slice(8,10) + '/' + fechaS.slice(5,7);
  } else {
    obj.fecha = '';
  }

  if (fechaE && horaE && fechaS && horaS) {
    obj.detalle = horaE + ' → ' + horaS + (durMins !== undefined ? ' (' + minsToHHMM(durMins) + ')' : '');
  } else if (fechaE && horaE) {
    obj.detalle = 'Entrada ' + horaE;
  } else if (fechaS && horaS) {
    obj.detalle = 'Salida ' + horaS;
  } else {
    obj.detalle = '';
  }

  return obj;
}

// ── Cuerpo HTML del email (diseño "tabla resumen") ─────────────────────────────
function construirEmailErroresHtml(titulo, errores) {
  var filas = errores.map(function(e, idx) {
    var borde = (idx === errores.length - 1) ? '' : 'border-bottom:1px solid #f3f4f6;';
    return ''
      + '<tr>'
      + '<td style="padding:12px 26px;' + borde + '"><span style="background:' + e.badgeBg + ';color:' + e.badgeColor + ';font-size:11px;font-weight:bold;padding:3px 8px;border-radius:6px;">' + e.badge + '</span></td>'
      + '<td style="padding:12px 12px;' + borde + 'color:#374151;">' + e.fecha + '</td>'
      + '<td style="padding:12px 26px;' + borde + 'color:#374151;text-align:right;">' + e.detalle + '</td>'
      + '</tr>';
  }).join('');

  return ''
    + '<div style="background:#f3f4f6;padding:24px;font-family:Arial,Helvetica,sans-serif;">'
    + '<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">'
    +   '<div style="padding:22px 26px 0;">'
    +     '<span style="font-size:13px;color:#9ca3af;">Buenas y Santas · RRHH</span>'
    +     '<h1 style="margin:6px 0 4px;font-size:19px;color:#111827;">' + titulo + '</h1>'
    +     '<p style="margin:0 0 18px;font-size:13px;color:#6b7280;line-height:1.6;">Corresponden a los últimos 30 días. Por favor entra en la app y corrígelos.</p>'
    +   '</div>'
    +   '<table style="width:100%;border-collapse:collapse;font-size:13px;">'
    +     '<thead><tr style="background:#f9fafb;">'
    +       '<td style="padding:10px 26px;color:#6b7280;font-weight:bold;border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb;">Tipo</td>'
    +       '<td style="padding:10px 12px;color:#6b7280;font-weight:bold;border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb;">Fecha</td>'
    +       '<td style="padding:10px 26px;color:#6b7280;font-weight:bold;border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb;text-align:right;">Detalle</td>'
    +     '</tr></thead>'
    +     '<tbody>' + filas + '</tbody>'
    +   '</table>'
    +   '<div style="padding:22px 26px;text-align:center;">'
    +     '<a href="#" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;font-size:14px;font-weight:bold;padding:12px 28px;border-radius:8px;">Entrar en la app</a>'
    +   '</div>'
    + '</div>'
    + '</div>';
}

// ══════════════════════════════════════════════════════════════════════════════
// RELLENAR HOJAS DESDE SUPABASE + DIAGNÓSTICO
// ══════════════════════════════════════════════════════════════════════════════
var EMPLEADOS_A_RELLENAR = ['Luciana', 'Juliana'];

function traerFichajesSupabase(nombreSb) {
  var todos = [], offset = 0, pagina = 1000;
  while (true) {
    var rows = sbGet('fichajes', {
      'select': 'fecha,tipo,hora',
      'empleado_nombre': 'eq.' + nombreSb,
      'order': 'fecha.asc,hora.asc',
      'limit': String(pagina),
      'offset': String(offset)
    });
    todos = todos.concat(rows);
    if (rows.length < pagina) break;
    offset += pagina;
  }
  return todos;
}

// Añade a la hoja solo los fichajes que le faltan. Devuelve cuántos añadió.
function volcarFichajesEnHoja(hoja, fichajes) {
  asegurarCabecera(hoja);
  if (hoja.getMaxColumns() < 7) hoja.insertColumnsAfter(hoja.getMaxColumns(), 7 - hoja.getMaxColumns());

  var range   = hoja.getDataRange();
  var vals    = range.getValues();
  var display = range.getDisplayValues();
  var existentes = {};
  for (var i = 1; i < vals.length; i++) {
    var f = toISOFromCell(vals[i][0]);
    var t = String(vals[i][1] || '').toUpperCase().trim();
    var h = normHora(String(display[i][2] || '').substring(0, 5));
    if (f) existentes[f + '|' + t + '|' + h] = true;
  }

  var nuevas = [];
  fichajes.forEach(function(x) {
    var f = String(x.fecha || '').substring(0, 10);
    var t = String(x.tipo || '').toUpperCase().trim();
    var h = normHora(String(x.hora || '').substring(0, 5));
    if (!f || (t !== 'ENTRADA' && t !== 'SALIDA')) return;
    var key = f + '|' + t + '|' + h;
    if (existentes[key]) return;
    existentes[key] = true;
    nuevas.push([fechaConDia(f), t, h, '', '', '', '']);
  });
  if (!nuevas.length) return 0;

  var inicio = hoja.getLastRow() + 1;
  var fin    = inicio + nuevas.length - 1;
  if (hoja.getMaxRows() < fin) hoja.insertRowsAfter(hoja.getMaxRows(), fin - hoja.getMaxRows());
  hoja.getRange(inicio, 1, nuevas.length, 1).setNumberFormat('@STRING@');
  hoja.getRange(inicio, 3, nuevas.length, 1).setNumberFormat('@STRING@');
  hoja.getRange(inicio, 1, nuevas.length, 7).setValues(nuevas);
  reordenarHoja(hoja);
  recalcularHoja(hoja);
  return nuevas.length;
}

// Copia a las pestañas (y a las ORIGINAL) lo que hay en Supabase y falta en el Sheet.
// NO llama a sincronizarEmpleadoASupabase, así que no borra nada en Supabase.

function rellenarHojasDesdeSupabase() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();
  var informe = [];

  EMPLEADOS_A_RELLENAR.forEach(function(corto) {
    try {
      var hoja = getHojaEmpleado(ss, corto);
      if (!hoja) { informe.push('✗ ' + corto + ': no se encuentra su pestaña'); return; }

      var fichajes = traerFichajesPorPatron(corto);
      if (!fichajes.length) { informe.push('✗ ' + corto + ': no hay fichajes en Supabase'); return; }
      var n = volcarFichajesEnHoja(hoja, fichajes);

      var hojaOrig = ss.getSheetByName(hoja.getName().split(' ')[0] + 'ORIGINAL');
      var nOrig = hojaOrig ? volcarFichajesEnHoja(hojaOrig, fichajes) : 0;

      informe.push('✅ ' + corto + ': ' + n + ' fichajes añadidos a "' + hoja.getName() + '"'
        + (hojaOrig ? ' y ' + nOrig + ' a "' + hojaOrig.getName() + '"' : ''));
    } catch (err) {
      informe.push('✗ ' + corto + ': ' + err);
    }
  });

  ui.alert(informe.join('\n'));
}

// Para cada empleado activo: qué pestaña encuentra el script y cuántos fichajes hay en cada sitio.
function diagnosticoHojasEmpleados() {
  var ss   = SpreadsheetApp.getActiveSpreadsheet();
  var ui   = SpreadsheetApp.getUi();
  var emps = sbGet('empleados', { 'select': 'nombre', 'activo': 'eq.true', 'order': 'nombre.asc' });
  var lineas = [];

  emps.forEach(function(e) {
    var nSb  = traerFichajesSupabase(e.nombre).length;
    var hoja = getHojaEmpleado(ss, e.nombre);
    if (!hoja) {
      lineas.push('✗ ' + e.nombre + ' → SIN PESTAÑA · Supabase: ' + nSb);
    } else {
      lineas.push('• ' + e.nombre + ' → "' + hoja.getName() + '" · columnas: ' + hoja.getMaxColumns()
        + ' · filas: ' + Math.max(0, hoja.getLastRow() - 1) + ' · Supabase: ' + nSb);
    }
  });

  var pestanas = ss.getSheets().map(function(s) { return '[' + s.getName() + ']'; }).join(' ');
  Logger.log(lineas.join('\n') + '\n\nPESTAÑAS: ' + pestanas);
  ui.alert('Diagnóstico', lineas.join('\n') + '\n\nPestañas:\n' + pestanas, ui.ButtonSet.OK);
}

function traerFichajesPorPatron(corto) {
  var todos = [], offset = 0, pagina = 1000;
  while (true) {
    var rows = sbGet('fichajes', {
      'select': 'empleado_nombre,fecha,tipo,hora',
      'empleado_nombre': 'ilike.*' + corto + '*',
      'order': 'fecha.asc,hora.asc',
      'limit': String(pagina),
      'offset': String(offset)
    });
    todos = todos.concat(rows);
    if (rows.length < pagina) break;
    offset += pagina;
  }
  return todos;
}

function diagnosticoNombres() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();
  var out = [];
  EMPLEADOS_A_RELLENAR.forEach(function(corto) {
    out.push('══ ' + corto + ' ══');
    var emps = sbGet('empleados', { 'select': 'nombre,activo', 'nombre': 'ilike.*' + corto + '*' });
    if (!emps.length) out.push('empleados: ninguno en Supabase');
    emps.forEach(function(e) { out.push('empleados: "' + e.nombre + '" · activo=' + e.activo); });

    var porNombre = {};
    traerFichajesPorPatron(corto).forEach(function(f) {
      var n = f.empleado_nombre;
      if (!porNombre[n]) porNombre[n] = { c: 0, ini: f.fecha, fin: f.fecha };
      porNombre[n].c++;
      if (f.fecha < porNombre[n].ini) porNombre[n].ini = f.fecha;
      if (f.fecha > porNombre[n].fin) porNombre[n].fin = f.fecha;
    });
    var nombres = Object.keys(porNombre);
    if (!nombres.length) out.push('fichajes: ninguno');
    nombres.forEach(function(n) {
      var p = porNombre[n];
      var hoja = getHojaEmpleado(ss, n);
      out.push('fichajes como "' + n + '": ' + p.c + ' (' + p.ini + ' → ' + p.fin + ') · pestaña: '
        + (hoja ? '"' + hoja.getName() + '"' : 'NO LA ENCUENTRA'));
    });

    var pref = corto.toLowerCase().substring(0, 3);
    var parecidas = ss.getSheets().map(function(s) { return s.getName(); })
      .filter(function(n) { return n.toLowerCase().indexOf(pref) !== -1; });
    out.push('pestañas que empiezan parecido: ' + JSON.stringify(parecidas));
  });
  Logger.log(out.join('\n'));
  ui.alert('Diagnóstico de nombres', out.join('\n'), ui.ButtonSet.OK);
}

function corregirFichajeLuciana() {
  var url = SUPABASE_URL + '/rest/v1/fichajes?empleado_nombre=eq.' + encodeURIComponent('LUCIANA, Fisbein Efron')
    + '&fecha=eq.2026-09-21&tipo=eq.SALIDA&hora=eq.11:27';
  var res = UrlFetchApp.fetch(url, {
    method: 'patch',
    headers: Object.assign({}, sbHeaders(), { 'Prefer': 'return=representation' }),
    payload: JSON.stringify({ tipo: 'ENTRADA' }),
    muteHttpExceptions: true
  });
  Logger.log(res.getResponseCode() + ' → ' + res.getContentText());
}

function rellenarLuciana() { rellenarUno('Luciana'); }
function rellenarJuliana() { rellenarUno('Juliana'); }

function rellenarUno(corto) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = getHojaEmpleado(ss, corto);
  if (!hoja) { Logger.log('✗ No se encuentra la pestaña de ' + corto); return; }
  var fichajes = traerFichajesPorPatron(corto);
  Logger.log('Fichajes en Supabase: ' + fichajes.length);
  var n = volcarFichajesEnHoja(hoja, fichajes);
  Logger.log('Añadidos a ' + hoja.getName() + ': ' + n);
  var hojaOrig = ss.getSheetByName(hoja.getName().split(' ')[0] + 'ORIGINAL');
  if (hojaOrig) Logger.log('Añadidos a ' + hojaOrig.getName() + ': ' + volcarFichajesEnHoja(hojaOrig, fichajes));
  Logger.log('✅ Terminado ' + corto);
}

// ══════════════════════════════════════════════════════════════════════════════
// v27 · HORAS CONTRATO — horas semanales por empleado con fecha de inicio
// ══════════════════════════════════════════════════════════════════════════════
// Hoja "HORAS CONTRATO":  A = Empleado · B = Horas/semana · C = Desde · D = Notas
// Cada cambio de jornada es una fila NUEVA (no borres las antiguas: así las
// semanas pasadas se siguen analizando con las horas que tocaban entonces).
// Para cada semana se usa la fila con la fecha "Desde" más reciente que sea
// igual o anterior al LUNES de esa semana. Pon siempre un lunes en "Desde".
// Si un empleado no tiene ninguna fila, se usa el maxHSemana de REGLAS_EMPLEADOS.
var HOJA_HORAS = 'HORAS CONTRATO';
var _cacheHoras = null;

function claveEmpleado(nombre) {
  return String(nombre || '').replace(/,/g, ' ').trim().split(/\s+/)[0].toLowerCase();
}

function leerHorasContrato() {
  if (_cacheHoras) return _cacheHoras;
  _cacheHoras = {};
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_HORAS);
  if (!sh || sh.getLastRow() < 2) return _cacheHoras;
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues();
  var dsp  = sh.getRange(2, 1, sh.getLastRow() - 1, 3).getDisplayValues();
  for (var i = 0; i < vals.length; i++) {
    var clave = claveEmpleado(vals[i][0]);
    if (!clave) continue;
    var horas = (typeof vals[i][1] === 'number') ? vals[i][1] : parseFloat(String(dsp[i][1]).replace(',', '.'));
    if (isNaN(horas)) continue;
    var desde = toISOFromCell(vals[i][2]) || toISOFromCell(dsp[i][2]);
    if (!desde) continue;
    if (!_cacheHoras[clave]) _cacheHoras[clave] = [];
    _cacheHoras[clave].push({ desde: desde, horas: horas });
  }
  return _cacheHoras;
}

// Devuelve las horas semanales vigentes para ese empleado en la semana que
// empieza el lunes "lunesISO" (yyyy-mm-dd), o null si no hay ninguna fila.
function getHorasSemana(nombre, lunesISO) {
  var lista = leerHorasContrato()[claveEmpleado(nombre)];
  if (!lista) return null;
  var mejor = null;
  lista.forEach(function(r) {
    if (r.desde <= lunesISO && (!mejor || r.desde > mejor.desde)) mejor = r;
  });
  return mejor ? mejor.horas : null;
}

// Crea la hoja la primera vez y la rellena con las horas que había en el código.
function crearHojaHorasContrato() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();
  var sh = ss.getSheetByName(HOJA_HORAS);
  if (sh) { ui.alert('La hoja "' + HOJA_HORAS + '" ya existe.'); ss.setActiveSheet(sh); return; }

  sh = ss.insertSheet(HOJA_HORAS);
  sh.getRange(1, 1, 1, 4).setValues([['Empleado', 'Horas/semana', 'Desde (lunes)', 'Notas']])
    .setBackground('#1e3a5f').setFontColor('#ffffff').setFontWeight('bold');

  var filas = [];
  Object.keys(REGLAS_EMPLEADOS).forEach(function(k) {
    if (k === '_todos' || !REGLAS_EMPLEADOS[k].maxHSemana) return;
    filas.push([k.charAt(0).toUpperCase() + k.slice(1), REGLAS_EMPLEADOS[k].maxHSemana,
                new Date(2026, 0, 1), 'Valor inicial (del script)']);
  });
  if (filas.length) sh.getRange(2, 1, filas.length, 4).setValues(filas);

  sh.getRange('C2:C').setNumberFormat('dd/mm/yyyy')
    .setDataValidation(SpreadsheetApp.newDataValidation().requireDate().build());
  sh.getRange('B2:B').setNumberFormat('0.##');
  sh.setFrozenRows(1);
  sh.setColumnWidths(1, 4, 140);
  sh.setColumnWidth(4, 260);
  ss.setActiveSheet(sh);
  ui.alert('✅ Hoja "' + HOJA_HORAS + '" creada con ' + filas.length + ' empleados.\n\n' +
           'Para cambiar las horas de alguien añade una fila nueva con su nombre, ' +
           'las horas y el lunes desde el que se aplican.');
}
// ══════════════════════════════════════════════════════════════════════════════
// v31 · ANALIZAR SEMANA — ventana interactiva
// ══════════════════════════════════════════════════════════════════════════════
// Selecciona cualquier fila de la semana (o de varias semanas) en la hoja del
// empleado y elige "📋 Analizar semana (nuevo)". Se analizan SIEMPRE semanas
// completas (lunes a domingo).
//
// Reglas que se comprueban (las de REGLAS_EMPLEADOS / HORAS CONTRATO):
//   · horas por día  > maxHDia           (exacto, sin margen)
//   · horas semana   > horas de contrato (exacto, sin margen)
//   · descanso entre días laborales < minDescanso (exacto: 12 h 00 ya vale)
//   · sábados (Richard), mediodías lun-jue (Jessica), turnos fuera de horario
//     fijo (Jennifer), turnos sin salida.
// El margen aleatorio de 0-15 min solo se usa al PROPONER horas nuevas, para
// que no queden siempre exactas — nunca para decidir si algo está mal.

function analizarSeleccion() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var ui    = SpreadsheetApp.getUi();
  var sheet = ss.getActiveSheet();
  var nombre = sheet.getName();
  if (HOJAS_SISTEMA.indexOf(nombre) !== -1 || nombre.indexOf('ORIGINAL') !== -1) {
    ui.alert('Abre la hoja del empleado y selecciona alguna fila de la semana que quieres revisar.');
    return;
  }
  var rng = sheet.getActiveRange();
  var filaIni = rng.getRow(), filaFin = rng.getLastRow();
  var vals = sheet.getDataRange().getValues(), dsp = sheet.getDataRange().getDisplayValues();
  var dias = [];
  for (var i = 0; i < vals.length; i++) {
    var fila = i + 1;
    if (fila < filaIni || fila > filaFin) continue;
    var fISO = toISOFromCell(vals[i][0]) || toISOFromCell(dsp[i][0]);
    var tipo = String(vals[i][1] || '').toUpperCase().trim();
    if (!fISO || (tipo !== 'ENTRADA' && tipo !== 'SALIDA')) continue;
    var mins = horaToMins(normHora(String(dsp[i][2] || '').substring(0, 5)));
    dias.push((mins !== null && mins < NUEVO_DIA_MINS) ? diaAnterior(fISO) : fISO);
  }
  if (!dias.length) {
    ui.alert('No hay fichajes en la selección.\nSelecciona alguna fila de la semana que quieres revisar.');
    return;
  }
  dias.sort();
  var desde = getInicioSemana(dias[0]);
  var hasta = sumarDiasISO_(getInicioSemana(dias[dias.length - 1]), 6);
  mostrarVentanaAnalisis_(nombre, desde, hasta);
}

function mostrarVentanaAnalisis_(nombreHoja, desde, hasta) {
  var data = datosAnalisis(nombreHoja, desde, hasta);
  var json = JSON.stringify(data).replace(/</g, '\\u003c');
  var html = htmlAnalisis_().replace('__DATA__', function() { return json; });
  var out  = HtmlService.createHtmlOutput(html).setWidth(1050).setHeight(720);
  SpreadsheetApp.getUi().showModelessDialog(out, 'Analizar semana · ' + nombreHoja);
}

function sumarDiasISO_(iso, n) {
  var p = iso.split('-').map(Number);
  var d = new Date(p[0], p[1] - 1, p[2] + n);
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
}

function diaNum_(iso) {
  var p = iso.split('-').map(Number);
  return Math.round(Date.UTC(p[0], p[1] - 1, p[2]) / 86400000);
}

// Lee todos los fichajes de la hoja y los empareja en turnos por orden
// cronológico. El día laboral del turno es el de su ENTRADA.
function leerTurnosHoja_(sheet) {
  var range = sheet.getDataRange();
  var vals = range.getValues(), dsp = range.getDisplayValues();
  var f = [];
  for (var i = 0; i < vals.length; i++) {
    var fISO = toISOFromCell(vals[i][0]) || toISOFromCell(dsp[i][0]);
    var tipo = String(vals[i][1] || '').toUpperCase().trim();
    if (!fISO || (tipo !== 'ENTRADA' && tipo !== 'SALIDA')) continue;
    var hora = normHora(String(dsp[i][2] || '').substring(0, 5));
    var mins = horaToMins(hora);
    if (mins === null) continue;
    f.push({ fecha: fISO, tipo: tipo, hora: hora, mins: mins, abs: diaNum_(fISO) * 1440 + mins, fila: i + 1 });
  }
  f.sort(function(a, b) { return (a.abs - b.abs) || (b.fila - a.fila); });

  var turnos = [], sueltas = [], abierta = null;
  f.forEach(function(x) {
    if (x.tipo === 'ENTRADA') {
      if (abierta) turnos.push({ e: abierta, s: null });
      abierta = x;
    } else if (abierta) {
      turnos.push({ e: abierta, s: x });
      abierta = null;
    } else {
      sueltas.push(x);
    }
  });
  if (abierta) turnos.push({ e: abierta, s: null });

  function diaDe(x) { return x.mins < NUEVO_DIA_MINS ? diaAnterior(x.fecha) : x.fecha; }
  turnos.forEach(function(t) { t.dia = diaDe(t.e); });
  sueltas.forEach(function(x) { x.dia = diaDe(x); });
  return { turnos: turnos, sueltas: sueltas };
}

// Llamada desde la ventana (google.script.run) — devuelve los datos de la semana.
function datosAnalisis(nombreHoja, desde, hasta) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(nombreHoja);
  if (!sheet) throw new Error('No encuentro la hoja ' + nombreHoja);

  var L = leerTurnosHoja_(sheet);
  var turnos = [], previa = null, siguiente = null;
  L.turnos.forEach(function(t) {
    if (t.dia < desde) { if (t.s) previa = { fecha: t.s.fecha, hora: t.s.hora }; return; }
    if (t.dia > hasta) {
      if (!siguiente) siguiente = { fecha: t.e.fecha, hora: t.e.hora, lbl: isoToDisplay(t.e.fecha) + ' ' + t.e.hora };
      return;
    }
    var base = diaNum_(t.dia) * 1440;
    turnos.push({
      id: turnos.length, dia: t.dia,
      eFecha: t.e.fecha, eHora: t.e.hora, eRel: t.e.abs - base,
      sFecha: t.s ? t.s.fecha : null, sHora: t.s ? t.s.hora : null, sRel: t.s ? t.s.abs - base : null
    });
  });
  var sueltas = L.sueltas.filter(function(x) { return x.dia >= desde && x.dia <= hasta; })
    .map(function(x) { return 'Salida sin entrada: ' + isoToDisplay(x.fecha) + ' ' + x.hora; });

  var reglas = getReglas(nombreHoja);
  var semanas = {};
  for (var l = getInicioSemana(desde); l <= hasta; l = sumarDiasISO_(l, 7)) {
    var h = getHorasSemana(nombreHoja, l);
    semanas[l] = (h !== null) ? h : (reglas.maxHSemana || null);
  }

  return {
    hoja: nombreHoja, desde: desde, hasta: hasta,
    turnos: turnos, previa: previa, siguiente: siguiente, sueltas: sueltas,
    clave: claveEmpleado(nombreHoja),
    reglas: {
      maxHDia: reglas.maxHDia, minDescanso: reglas.minDescanso,
      quitarSabados: !!reglas.quitarSabados,
      quitarMediodiasLunJue: !!reglas.quitarMediodiasLunJue,
      turnosFijos: reglas.turnosFijos ? (TURNOS_FIJOS[reglas.turnosFijos] || null) : null
    },
    semanas: semanas,
    offsets: {
      dia:      Math.round(Math.random() * 15),
      semana:   Math.round(Math.random() * 15),
      descanso: Math.round(Math.random() * 15)
    }
  };
}

function buscarFilaFichaje_(sheet, fechaISO, tipo, hora) {
  var range = sheet.getDataRange();
  var vals = range.getValues(), dsp = range.getDisplayValues();
  for (var i = 0; i < vals.length; i++) {
    var f = toISOFromCell(vals[i][0]) || toISOFromCell(dsp[i][0]);
    var t = String(vals[i][1] || '').toUpperCase().trim();
    var h = normHora(String(dsp[i][2] || '').substring(0, 5));
    if (f === fechaISO && t === tipo && h === hora) return i + 1;
  }
  return -1;
}

// Llamada desde la ventana — aplica los cambios en la hoja del empleado.
// ops: [{accion:'borrar'|'mover', tipo, fecha, hora, fechaNueva?, horaNueva?}]
function aplicarCambiosAnalisis(nombreHoja, ops) {
  var lock = LockService.getDocumentLock();
  lock.waitLock(20000);
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(nombreHoja);
    if (!sheet) throw new Error('No encuentro la hoja ' + nombreHoja);
    var hechos = 0, fallos = [];
    var orden = ops.filter(function(o) { return o.accion === 'borrar'; })
      .concat(ops.filter(function(o) { return o.accion === 'mover'; }));
    orden.forEach(function(o) {
      var fila = buscarFilaFichaje_(sheet, o.fecha, o.tipo, o.hora);
      if (fila < 0) { fallos.push(o.tipo + ' ' + isoToDisplay(o.fecha) + ' ' + o.hora); return; }
      if (o.accion === 'borrar') {
        sheet.deleteRow(fila);
      } else {
        var cF = sheet.getRange(fila, 1); cF.setNumberFormat('@STRING@'); cF.setValue(fechaConDia(o.fechaNueva));
        var cH = sheet.getRange(fila, 3); cH.setNumberFormat('@STRING@'); cH.setValue(o.horaNueva);
      }
      hechos++;
    });
    if (hechos) {
      reordenarHoja(sheet);
      recalcularHoja(sheet);
      sincronizarEmpleadoASupabase(sheet.getName(), sheet);
    }
    return { hechos: hechos, fallos: fallos };
  } finally {
    lock.releaseLock();
  }
}

// HTML de la ventana. (Ojo si lo editas: aquí dentro no se pueden usar
// acentos graves ni barras invertidas en el código JavaScript.)
function htmlAnalisis_() {
  return `<!DOCTYPE html>
<html><head><base target="_top"><meta charset="utf-8">
<style>
*{box-sizing:border-box}
body{font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#1f2937;margin:0;padding:14px 16px 30px;background:#fff}
.top{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:10px}
.t1{font-size:18px;font-weight:bold}
.t2{color:#6b7280;font-size:12px;margin-top:3px}
.ayuda{color:#6b7280;font-size:12px;margin:0 0 12px}
button{font:inherit;cursor:pointer;border-radius:8px;border:1px solid #d1d5db;background:#fff;padding:7px 12px;white-space:nowrap}
button:hover{background:#f3f4f6}
button:disabled{opacity:.5;cursor:default}
.b1{background:#111827;color:#fff;border-color:#111827}
.b1:hover{background:#374151}
.btns{display:flex;gap:8px}
.cards{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px}
.card{border-radius:10px;padding:10px 14px;border:1px solid #e5e7eb;min-width:180px}
.card .k{font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.03em}
.card .v{font-size:18px;font-weight:bold;margin-top:3px}
.card .s{font-size:11px;color:#6b7280;margin-top:2px}
.ok{background:#ecfdf5;border-color:#a7f3d0}.ok .v{color:#047857}
.err{background:#fef2f2;border-color:#fecaca}.err .v{color:#b91c1c}
.msg{padding:9px 12px;border-radius:8px;background:#eff6ff;color:#1e40af;margin-bottom:12px}
.warnbox{padding:9px 12px;border-radius:8px;background:#fffbeb;color:#92400e;margin-bottom:12px}
table{width:100%;border-collapse:collapse}
th{text-align:left;font-size:11px;color:#6b7280;padding:6px 8px;border-bottom:1px solid #e5e7eb}
td{padding:6px 8px;border-bottom:1px solid #f3f4f6;vertical-align:middle}
tr.dia td{background:#f9fafb;font-weight:bold;border-top:1px solid #e5e7eb}
tr.dia .tot{float:right;font-weight:normal}
tr.del td{opacity:.45}
tr.del td.acc{opacity:1}
input[type=time]{font:inherit;padding:4px 6px;border:1px solid #d1d5db;border-radius:6px}
input.mod{background:#fef9c3;border-color:#eab308}
.antes{font-size:10px;color:#a16207;margin-top:2px}
.sig{font-size:10px;color:#6b7280;margin-top:2px}
.chip{display:inline-block;font-size:11px;padding:2px 7px;border-radius:10px;margin:1px 3px 1px 0}
.c-err{background:#fee2e2;color:#991b1b}.c-warn{background:#fef3c7;color:#92400e}.c-ok{background:#dcfce7;color:#166534}.c-gr{background:#f3f4f6;color:#4b5563}
.rojo{color:#b91c1c;font-weight:bold}
.cambios{margin-top:14px;border-top:1px solid #e5e7eb;padding-top:10px}
.cambios ul{margin:6px 0 0;padding-left:18px}
.cambios li{margin:3px 0}
.acc{text-align:right}
.acc button{padding:4px 8px;margin-left:2px}
</style></head><body><div id="app"></div>
<script>
var DATA = __DATA__;
var NUEVO = 120;
var DIAS = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
var T = [];
var MSG = '';
var OCUPADO = false;

function init(d){
  DATA = d;
  T = d.turnos.map(function(t){
    return { id:t.id, dia:t.dia, eFecha:t.eFecha, eHora:t.eHora, sFecha:t.sFecha, sHora:t.sHora,
             eRel0:t.eRel, sRel0:t.sRel, eRel:t.eRel, sRel:t.sRel, borrado:false };
  });
  OCUPADO = false;
  render();
}

// ── utilidades ──
function pad(n){ return ('0'+n).slice(-2); }
function partes(iso){ return [Number(iso.slice(0,4)), Number(iso.slice(5,7)), Number(iso.slice(8,10))]; }
function dnum(iso){ var p=partes(iso); return Math.round(Date.UTC(p[0],p[1]-1,p[2])/86400000); }
function isoAdd(iso,n){ var p=partes(iso); var d=new Date(Date.UTC(p[0],p[1]-1,p[2]+n)); return d.getUTCFullYear()+'-'+pad(d.getUTCMonth()+1)+'-'+pad(d.getUTCDate()); }
function dow(iso){ var p=partes(iso); return new Date(Date.UTC(p[0],p[1]-1,p[2])).getUTCDay(); }
function lunesDe(iso){ var w=dow(iso); return isoAdd(iso, w===0?-6:1-w); }
function hhmm(rel){ var m=((rel%1440)+1440)%1440; return pad(Math.floor(m/60))+':'+pad(m%60); }
function fmtH(m){ m=Math.round(m); var s=m<0?'-':''; m=Math.abs(m); return s+Math.floor(m/60)+'h '+pad(m%60); }
function ddmm(iso){ return iso.slice(8,10)+'/'+iso.slice(5,7); }
function diaLbl(iso){ return DIAS[dow(iso)]+' '+ddmm(iso); }
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function minsDe(h){ var p=String(h||'').split(':'); if(p.length<2) return null; var a=parseInt(p[0],10), b=parseInt(p[1],10); if(isNaN(a)||isNaN(b)) return null; return a*60+b; }
function absMin(t,rel){ return dnum(t.dia)*1440+rel; }
function dur(t){ return t.sRel===null?0:Math.max(0,t.sRel-t.eRel); }
function dur0(t){ return t.sRel0===null?0:Math.max(0,t.sRel0-t.eRel0); }
function franja(t){ return t.eRel0>=16*60 ? 'noche' : 'mediodia'; }
function esFijo(t){ var L=DATA.reglas.turnosFijos; if(!L) return true; var w=dow(t.dia), f=franja(t); for(var i=0;i<L.length;i++){ if(L[i].dow===w && L[i].franja===f) return true; } return false; }
function limE(t){ return franja(t)==='mediodia' ? 13*60+30 : 20*60+30; }
function limS(t){ return franja(t)==='mediodia' ? 16*60 : 23*60; }
function activos(){ return T.filter(function(t){ return !t.borrado; }); }
function porEntrada(a,b){ return absMin(a,a.eRel)-absMin(b,b.eRel); }
function porDurDesc(a,b){ return dur(b)-dur(a); }
function modificado(t){ return t.borrado || t.eRel!==t.eRel0 || t.sRel!==t.sRel0; }
function esMediodiaLJ(t){ var w=dow(t.dia); return w>=1 && w<=4 && t.eRel0>=540 && t.eRel0<=900; }
function byId(id){ for(var i=0;i<T.length;i++){ if(T[i].id===id) return T[i]; } return null; }

// ── cálculo (siempre sobre el estado ACTUAL, con los cambios ya hechos) ──
function calcular(){
  var R=DATA.reglas, A=activos().sort(porEntrada);
  var porDia={}, porSem={}, info={}, nDesc=0, nDia=0;
  A.forEach(function(t){
    porDia[t.dia]=(porDia[t.dia]||0)+dur(t);
    var l=lunesDe(t.dia); porSem[l]=(porSem[l]||0)+dur(t);
  });
  T.forEach(function(t){ info[t.id]={ descanso:null, avisos:[] }; });
  var previaAbs = DATA.previa ? dnum(DATA.previa.fecha)*1440+minsDe(DATA.previa.hora) : null;
  A.forEach(function(t){
    var inf=info[t.id], prev=previaAbs;
    A.forEach(function(o){
      if(o.dia<t.dia && o.sRel!==null){ var s=absMin(o,o.sRel); if(prev===null || s>prev) prev=s; }
    });
    if(prev!==null){
      var d=absMin(t,t.eRel)-prev;
      if(d>=0){
        inf.descanso=d;
        if(d<R.minDescanso*60){ nDesc++; inf.avisos.push({c:'err', t:'Descanso de solo '+fmtH(d)}); }
      }
    }
    var w=dow(t.dia);
    if(R.quitarSabados && w===6) inf.avisos.push({c:'err', t:'No trabaja sábados'});
    if(R.quitarMediodiasLunJue && esMediodiaLJ(t)) inf.avisos.push({c:'err', t:'Mediodía de lunes a jueves'});
    if(R.turnosFijos && !esFijo(t)) inf.avisos.push({c:'warn', t:'Fuera de su horario fijo'});
    if(t.sRel===null) inf.avisos.push({c:'warn', t:'Sin salida'});
  });
  if(DATA.siguiente && A.length){
    var ult=A[A.length-1];
    if(ult.sRel!==null){
      var sigAbs=dnum(DATA.siguiente.fecha)*1440+minsDe(DATA.siguiente.hora);
      var d2=sigAbs-absMin(ult,ult.sRel);
      if(d2>=0 && d2<R.minDescanso*60){ nDesc++; info[ult.id].avisos.push({c:'err', t:'Solo '+fmtH(d2)+' de descanso hasta el '+DATA.siguiente.lbl}); }
    }
  }
  Object.keys(porDia).forEach(function(k){ if(porDia[k]>R.maxHDia*60) nDia++; });
  return { porDia:porDia, porSem:porSem, info:info, nDesc:nDesc, nDia:nDia };
}

// ── propuesta automática, paso a paso: cada paso ve el resultado del anterior ──
function recortarUno(t, cuanto){
  if(cuanto<=0 || t.sRel===null) return 0;
  var nS=Math.min(t.sRel, Math.max(t.sRel-cuanto, limS(t), t.eRel+30));
  var r=t.sRel-nS;
  if(r>0) t.sRel=nS;
  return r;
}
function recortar(lista, exceso){
  lista.sort(porDurDesc);
  for(var i=0;i<lista.length && exceso>0;i++) exceso-=recortarUno(lista[i], exceso);
  return exceso;
}
function retrasarEntrada(t, cuanto){
  var tope = t.sRel!==null ? Math.min(limE(t), t.sRel-30) : limE(t);
  var nE=Math.max(t.eRel, Math.min(t.eRel+cuanto, tope));
  var mov=nE-t.eRel; t.eRel=nE; return mov;
}

function proponer(){
  var R=DATA.reglas, O=DATA.offsets, antes=ops().length;

  // 1. Turnos que no tocan según reglas fijas
  T.forEach(function(t){
    if(t.borrado) return;
    if((R.quitarSabados && dow(t.dia)===6) || (R.quitarMediodiasLunJue && esMediodiaLJ(t))) t.borrado=true;
  });

  // 2. Descansos < 12 h: entrar más tarde (y salir más tarde para mantener horas)
  activos().sort(porEntrada).forEach(function(t){
    var d=calcular().info[t.id].descanso;
    if(d===null || d>=R.minDescanso*60) return;
    var falta=R.minDescanso*60-d+O.descanso;
    var nE=Math.max(t.eRel, Math.min(t.eRel+falta, limE(t)));
    var mov=nE-t.eRel;
    if(mov>0){
      t.eRel=nE;
      if(t.sRel!==null && mov>15) t.sRel+=mov;
    }
    // Si no basta con entrar más tarde (tope 13:30 / 20:30), se adelanta la
    // salida del turno anterior (sin bajar de 16:00 / 23:00).
    if(falta-mov>0){
      var prev=null;
      activos().forEach(function(o){
        if(o.dia<t.dia && o.sRel!==null && (!prev || absMin(o,o.sRel)>absMin(prev,prev.sRel))) prev=o;
      });
      if(prev) recortarUno(prev, falta-mov);
    }
  });

  // 3. Días con más horas de las permitidas
  var dias={}; activos().forEach(function(t){ dias[t.dia]=1; });
  Object.keys(dias).sort().forEach(function(dia){
    var tot=calcular().porDia[dia]||0, lim=R.maxHDia*60;
    if(tot<=lim) return;
    var exceso=tot-(lim-O.dia), w=dow(dia);
    var del=activos().filter(function(t){ return t.dia===dia && t.sRel!==null; });
    if(DATA.clave==='ramiro' && w===5){
      del.sort(porEntrada); retrasarEntrada(del[0], exceso); return;
    }
    if(DATA.clave==='maria' && w===5 && tot>11*60){
      var ult=del.slice().sort(function(a,b){ return b.sRel-a.sRel; })[0];
      exceso-=recortarUno(ult, Math.min(60, exceso));
      if(exceso>0){
        var corto=del.filter(function(t){ return !t.borrado && dur(t)<60; })[0];
        if(corto){ exceso-=dur(corto); corto.borrado=true; }
      }
      if(exceso>0){
        var t11=del.filter(function(t){ return !t.borrado && t.eRel>=600 && t.eRel<=720; })[0];
        if(t11) exceso-=retrasarEntrada(t11, exceso);
      }
      if(exceso>0) recortar(del.filter(function(t){ return !t.borrado; }), exceso);
      return;
    }
    recortar(del, exceso);
  });

  // 4. Semana por encima del contrato (con lo que ya se ha quitado arriba)
  var sems={}; activos().forEach(function(t){ sems[lunesDe(t.dia)]=1; });
  Object.keys(sems).sort().forEach(function(l){
    var lim=DATA.semanas[l]; if(!lim) return;
    var tot=calcular().porSem[l]||0;
    if(tot<=lim*60) return;
    var exceso=tot-(lim*60-O.semana);
    var sem=activos().filter(function(t){ return lunesDe(t.dia)===l && t.sRel!==null; });
    if(R.turnosFijos){
      sem.filter(function(t){ return !esFijo(t); }).sort(porDurDesc).forEach(function(t){
        if(exceso<=0) return; exceso-=dur(t); t.borrado=true;
      });
    }
    if(exceso>0) recortar(sem.filter(function(t){ return !t.borrado && esFijo(t); }), exceso);
  });

  var c=calcular(), n=ops().length-antes, quedan=c.nDesc+c.nDia+semanasMal(c);
  if(n>0) MSG='✨ Propuesta lista: los cambios están en amarillo y abajo en la lista. Puedes ajustarlos a mano antes de pulsar «Aplicar».'+(quedan?' Queda algo en rojo que no se puede arreglar automáticamente.':'');
  else MSG = quedan ? 'No he encontrado un arreglo automático para lo que está en rojo: ajústalo a mano.' : '✅ No hay nada que arreglar.';
  render();
}

function semanasMal(c){
  var n=0;
  Object.keys(DATA.semanas).forEach(function(l){ var lim=DATA.semanas[l]; if(lim && (c.porSem[l]||0)>lim*60) n++; });
  return n;
}

// ── cambios pendientes ──
function ops(){
  var r=[];
  T.forEach(function(t){
    var lbl=diaLbl(t.dia)+' ('+(franja(t)==='mediodia'?'mediodía':'noche')+')';
    if(t.borrado){
      var op=[{accion:'borrar', tipo:'ENTRADA', fecha:t.eFecha, hora:t.eHora}];
      if(t.sHora) op.push({accion:'borrar', tipo:'SALIDA', fecha:t.sFecha, hora:t.sHora});
      r.push({ desc:'Eliminar turno '+lbl+': '+t.eHora+'–'+(t.sHora||'sin salida')+' ('+fmtH(dur0(t))+')', op:op });
      return;
    }
    var txt=[], op2=[];
    if(t.eRel!==t.eRel0){
      txt.push('entrada '+t.eHora+' → '+hhmm(t.eRel));
      op2.push({accion:'mover', tipo:'ENTRADA', fecha:t.eFecha, hora:t.eHora, fechaNueva:isoAdd(t.dia, Math.floor(t.eRel/1440)), horaNueva:hhmm(t.eRel)});
    }
    if(t.sRel!==null && t.sRel!==t.sRel0){
      txt.push('salida '+t.sHora+' → '+hhmm(t.sRel));
      op2.push({accion:'mover', tipo:'SALIDA', fecha:t.sFecha, hora:t.sHora, fechaNueva:isoAdd(t.dia, Math.floor(t.sRel/1440)), horaNueva:hhmm(t.sRel)});
    }
    if(op2.length) r.push({ desc:lbl+': '+txt.join(' · ')+'  ('+fmtH(dur0(t))+' → '+fmtH(dur(t))+')', op:op2 });
  });
  return r;
}

// ── acciones ──
function setHora(id, k, v){
  var t=byId(id), m=minsDe(v);
  if(!t || m===null){ render(); return; }
  if(k===1){
    t.eRel = m<NUEVO ? m+1440 : m;
    if(t.sRel!==null){ while(t.sRel<=t.eRel) t.sRel+=1440; }
  } else {
    var r=m; while(r<=t.eRel) r+=1440; t.sRel=r;
  }
  MSG=''; render();
}
function borrar(id){ var t=byId(id); t.borrado=true; MSG=''; render(); }
function restaurar(id){ var t=byId(id); t.borrado=false; t.eRel=t.eRel0; t.sRel=t.sRel0; MSG=''; render(); }
function deshacerTodo(){ T.forEach(function(t){ t.borrado=false; t.eRel=t.eRel0; t.sRel=t.sRel0; }); MSG=''; render(); }

function aplicar(){
  var cs=ops(); if(!cs.length) return;
  var lista=[]; cs.forEach(function(x){ lista=lista.concat(x.op); });
  OCUPADO=true; MSG='Aplicando cambios en la hoja…'; render();
  google.script.run
    .withSuccessHandler(function(r){
      MSG='✅ '+r.hechos+' fichaje(s) cambiados en la hoja y sincronizados con Supabase.'
        + (r.fallos.length ? ' ⚠ No encontré: '+r.fallos.join(', ')+' (¿se modificaron mientras tanto?)' : '');
      google.script.run.withSuccessHandler(init).withFailureHandler(fallo).datosAnalisis(DATA.hoja, DATA.desde, DATA.hasta);
    })
    .withFailureHandler(fallo)
    .aplicarCambiosAnalisis(DATA.hoja, lista);
}
function fallo(e){ OCUPADO=false; MSG='❌ Error: '+(e && e.message ? e.message : e); render(); }

// ── pintar ──
function inputHora(t, k){
  var rel = k===1 ? t.eRel : t.sRel, rel0 = k===1 ? t.eRel0 : t.sRel0, mod = rel!==rel0;
  var s='<input type="time" value="'+hhmm(rel)+'"'+(t.borrado||OCUPADO?' disabled':'')+(mod?' class="mod"':'')+' onchange="setHora('+t.id+','+k+',this.value)">';
  if(k===2 && rel>=1440) s+='<div class="sig">día siguiente</div>';
  if(mod && !t.borrado) s+='<div class="antes">antes '+hhmm(rel0)+'</div>';
  return s;
}

function fila(t, c){
  var inf=c.info[t.id], R=DATA.reglas;
  var s='<tr'+(t.borrado?' class="del"':'')+'>';
  s+='<td>'+(franja(t)==='mediodia'?'☀️ Mediodía':'🌙 Noche')
    +(R.turnosFijos && esFijo(t) ? '<br><span class="chip c-gr">horario fijo</span>' : '')+'</td>';
  s+='<td>'+inputHora(t,1)+'</td>';
  s+='<td>'+(t.sRel0===null ? '<span class="chip c-warn">sin salida</span>' : inputHora(t,2))+'</td>';
  s+='<td>'+(t.sRel===null ? '—' : fmtH(dur(t)))
    +(!t.borrado && t.sRel!==null && dur(t)!==dur0(t) ? '<div class="antes">antes '+fmtH(dur0(t))+'</div>' : '')+'</td>';
  var d=inf.descanso;
  s+='<td>'+(t.borrado || d===null ? '—' : '<span class="'+(d<R.minDescanso*60?'rojo':'')+'">'+fmtH(d)+'</span>')+'</td>';
  var avisos;
  if(t.borrado) avisos='<span class="chip c-gr">se eliminará</span>';
  else if(inf.avisos.length) avisos=inf.avisos.map(function(a){ return '<span class="chip c-'+a.c+'">'+esc(a.t)+'</span>'; }).join('');
  else avisos='<span class="chip c-ok">OK</span>';
  s+='<td>'+avisos+'</td>';
  var dis=OCUPADO?' disabled':'';
  s+='<td class="acc">'+(t.borrado
      ? '<button'+dis+' onclick="restaurar('+t.id+')">Restaurar</button>'
      : (modificado(t) ? '<button'+dis+' title="Volver a las horas originales" onclick="restaurar('+t.id+')">↺</button>' : '')
        +'<button'+dis+' title="Eliminar este turno" onclick="borrar('+t.id+')">🗑</button>')+'</td>';
  return s+'</tr>';
}

function render(){
  var c=calcular(), R=DATA.reglas, h=[], cs=ops(), n=cs.length, dis=OCUPADO?' disabled':'';
  h.push('<div class="top"><div><div class="t1">'+esc(DATA.hoja)+'</div>'
    +'<div class="t2">'+diaLbl(DATA.desde)+' → '+diaLbl(DATA.hasta)+' · máx. '+R.maxHDia+' h al día · descanso mínimo '+R.minDescanso+' h</div></div>');
  h.push('<div class="btns">'
    +'<button'+dis+' onclick="proponer()">✨ Proponer arreglo</button>'
    +'<button'+(OCUPADO||!n?' disabled':'')+' onclick="deshacerTodo()">↺ Deshacer todo</button>'
    +'<button class="b1"'+(OCUPADO||!n?' disabled':'')+' onclick="aplicar()">'+(OCUPADO?'Aplicando…':'Aplicar '+n+' cambio'+(n===1?'':'s'))+'</button>'
    +'</div></div>');
  h.push('<p class="ayuda">Cambia las horas o elimina turnos: los totales y avisos se recalculan al momento. No se guarda nada en la hoja hasta pulsar «Aplicar».</p>');

  h.push('<div class="cards">');
  Object.keys(DATA.semanas).sort().forEach(function(l){
    var lim=DATA.semanas[l], tot=c.porSem[l]||0, tot0=0;
    T.forEach(function(t){ if(lunesDe(t.dia)===l) tot0+=dur0(t); });
    var mal = lim && tot>lim*60;
    h.push('<div class="card '+(lim ? (mal?'err':'ok') : '')+'"><div class="k">Semana del '+ddmm(l)+'</div>'
      +'<div class="v">'+fmtH(tot)+(lim?' <span style="font-size:13px;font-weight:normal;color:#6b7280">de '+lim+' h</span>':'')+'</div>'
      +'<div class="s">'+(lim ? (mal ? 'Se pasa '+fmtH(tot-lim*60) : 'Dentro del contrato') : 'Sin horas de contrato')
      +(tot!==tot0 ? ' · antes '+fmtH(tot0) : '')+'</div></div>');
  });
  h.push('<div class="card '+(c.nDesc?'err':'ok')+'"><div class="k">Descansos de menos de '+R.minDescanso+' h</div><div class="v">'+c.nDesc+'</div></div>');
  h.push('<div class="card '+(c.nDia?'err':'ok')+'"><div class="k">Días de más de '+R.maxHDia+' h</div><div class="v">'+c.nDia+'</div></div>');
  h.push('</div>');

  if(MSG) h.push('<div class="msg">'+esc(MSG)+'</div>');
  if(DATA.sueltas && DATA.sueltas.length) h.push('<div class="warnbox">⚠ '+DATA.sueltas.map(esc).join(' · ')+' — corrígelo en la hoja.</div>');

  if(!T.length){
    h.push('<p>No hay turnos en estas fechas.</p>');
  } else {
    h.push('<table><thead><tr><th style="width:130px">Turno</th><th>Entrada</th><th>Salida</th><th>Horas</th><th>Descanso antes</th><th>Avisos</th><th></th></tr></thead><tbody>');
    var dias=[]; T.forEach(function(t){ if(dias.indexOf(t.dia)<0) dias.push(t.dia); }); dias.sort();
    dias.forEach(function(dia){
      var tot=c.porDia[dia]||0, tot0=0;
      T.forEach(function(t){ if(t.dia===dia) tot0+=dur0(t); });
      var mal=tot>R.maxHDia*60;
      h.push('<tr class="dia"><td colspan="7">'+diaLbl(dia)+'<span class="tot'+(mal?' rojo':'')+'">'
        +(tot0!==tot ? '<s style="color:#9ca3af">'+fmtH(tot0)+'</s> ' : '')+fmtH(tot)+' en el día'+(mal?' · pasa de '+R.maxHDia+' h':'')+'</span></td></tr>');
      T.filter(function(t){ return t.dia===dia; }).sort(function(a,b){ return a.eRel0-b.eRel0; })
        .forEach(function(t){ h.push(fila(t,c)); });
    });
    h.push('</tbody></table>');
  }

  h.push('<div class="cambios"><b>Cambios que se aplicarán ('+n+')</b>'
    +(n ? '<ul>'+cs.map(function(x){ return '<li>'+esc(x.desc)+'</li>'; }).join('')+'</ul>'
        : '<div class="t2">Ninguno todavía. Cambia horas, elimina turnos o pulsa «Proponer arreglo».</div>')
    +'</div>');
  document.getElementById('app').innerHTML=h.join('');
}

init(DATA);
</script></body></html>`;
}