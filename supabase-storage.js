// ============================================================
// Kontaly — Conexión con Supabase (usuario y contraseña + roles)
// ============================================================
// Define window.storage ANTES de que el resto de la app cargue,
// así que la app usa esto como su almacenamiento principal.
// También expone window.GH_ROL / window.GH_NOMBRE (el rol y nombre
// del usuario que entró).

(function () {
  if (!window.supabase || !window.supabase.createClient) {
    document.addEventListener('DOMContentLoaded', () => {
      const overlay = document.createElement('div');
      overlay.style.cssText = `
        position: fixed; inset: 0; z-index: 99999; background: #16233F; color: #fff;
        display: flex; align-items: center; justify-content: center; text-align: center;
        font-family: sans-serif; padding: 30px;
      `;
      overlay.innerHTML = `
        <div style="max-width:340px;">
          <div style="font-size:18px;font-weight:700;margin-bottom:10px;">No se pudo cargar el sistema de acceso</div>
          <div style="font-size:13.5px;opacity:.85;line-height:1.5;">Revisa que tengas conexión a internet y vuelve a abrir la app. Si el problema sigue, cierra la app por completo (no solo minimizarla) y ábrela de nuevo.</div>
        </div>`;
      document.body.appendChild(overlay);
    });
    return;
  }

  const SUPABASE_URL = 'https://cubhmlclqovvmsdskooc.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_drw-q0SBYKj0I3fV0BKvmA_0nmV1DkW';
  const DOMINIO_INTERNO = '@guzmanhvac.app';
  const MINUTOS_SESION = 30;

  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { storage: window.sessionStorage, persistSession: true, autoRefreshToken: true }
  });

  let resolverSesion, sesionLista;
  function nuevaEsperaSesion() { sesionLista = new Promise((r) => { resolverSesion = r; }); }
  nuevaEsperaSesion();

  let temporizadorSesion = null;
  function programarExpiracion() {
    if (temporizadorSesion) clearTimeout(temporizadorSesion);
    temporizadorSesion = setTimeout(async () => {
      try { await client.auth.signOut(); } catch (e) {}
      nuevaEsperaSesion();
      mostrarFormularioLogin('Tu sesión expiró después de ' + MINUTOS_SESION + ' minutos. Vuelve a entrar.');
    }, MINUTOS_SESION * 60 * 1000);
  }

  function usuarioAEmail(usuario) {
    const limpio = usuario.trim().toLowerCase().split('@')[0].replace(/[^a-z0-9._-]+/g, '.');
    return limpio + DOMINIO_INTERNO;
  }

  function esperar(ms) { return new Promise((r) => setTimeout(r, ms)); }

  // Crea el perfil con acceso inmediato (sin aprobación), rol "visor" por
  // defecto. Reintenta unas cuantas veces porque justo después de signUp()
  // la sesión nueva a veces tarda una fracción de segundo en quedar lista.
  async function crearPerfil(usuario) {
    let ultimoError = null;
    for (let intento = 0; intento < 6; intento++) {
      const { data: { session } } = await client.auth.getSession();
      if (!session) { await esperar(400); continue; }
      const { data: existente } = await client.from('perfiles').select('id').eq('id', session.user.id).maybeSingle();
      if (existente) return; // ya existe, nada que hacer
      const { error } = await client.from('perfiles').insert({
        id: session.user.id, nombre: usuario, rol: 'visor', activo: false
      });
      if (!error) return;
      ultimoError = error;
      await esperar(500);
    }
    throw ultimoError || new Error('No se pudo crear el perfil.');
  }

  function aplicarPerfilGlobal(perfil) {
    window.GH_ROL = perfil && perfil.rol ? perfil.rol : 'admin';
    window.GH_NOMBRE = perfil && perfil.nombre ? perfil.nombre : '';
  }

  // ---------- Pantalla de usuario / contraseña ----------
  function mostrarFormularioLogin(mensajeError) {
    let overlay = document.getElementById('gh-login-overlay');
    if (overlay) overlay.remove();

    overlay = document.createElement('div');
    overlay.id = 'gh-login-overlay';
    overlay.style.cssText = `
      position: fixed; inset: 0; z-index: 99999;
      background: linear-gradient(135deg,#16233F 0%,#1E3054 100%);
      display: flex; align-items: center; justify-content: center;
      font-family: 'Inter', sans-serif;
    `;
    overlay.innerHTML = `
      <div style="background:#fff; border-radius:16px; padding:36px 32px; width:90%; max-width:360px; box-shadow:0 12px 40px rgba(0,0,0,.35); text-align:center;">
        <div style="font-family:'Zilla Slab',serif; font-weight:700; font-size:20px; color:#16233F; margin-bottom:4px;">Kontaly</div>
        <div id="gh-login-subtitulo" style="font-size:12.5px; color:#5A6A88; margin-bottom:6px;">Inicia sesión</div>
        <div style="font-size:11px; color:#9AA6BE; margin-bottom:16px;">El usuario NO es tu correo — solo un nombre corto (ej. "juan")</div>
        <input id="gh-usuario-input" type="text" placeholder="Usuario (no es tu correo)" autocomplete="username"
          style="width:100%; padding:12px 14px; border:1.5px solid #D0D8E8; border-radius:9px; font-size:15px; margin-bottom:10px; box-sizing:border-box;">
        <input id="gh-clave-input" type="password" placeholder="Contraseña" autocomplete="current-password"
          style="width:100%; padding:12px 14px; border:1.5px solid #D0D8E8; border-radius:9px; font-size:15px; margin-bottom:14px; box-sizing:border-box;">
        <div id="gh-login-error" style="color:#C8511A; font-size:12.5px; min-height:16px; margin-bottom:10px;">${mensajeError || ''}</div>
        <button id="gh-login-btn" style="width:100%; padding:12px; background:#16233F; color:#fff; border:none; border-radius:9px; font-weight:600; font-size:14px; cursor:pointer; margin-bottom:10px;">Entrar</button>
        <button id="gh-modo-btn" style="width:100%; padding:10px; background:none; color:#5A6A88; border:none; font-size:12.5px; cursor:pointer; text-decoration:underline;">¿No tienes cuenta? Crear cuenta</button>
      </div>
    `;
    document.body.appendChild(overlay);

    const usuarioInput = document.getElementById('gh-usuario-input');
    const claveInput = document.getElementById('gh-clave-input');
    const btn = document.getElementById('gh-login-btn');
    const modoBtn = document.getElementById('gh-modo-btn');
    const subtitulo = document.getElementById('gh-login-subtitulo');
    usuarioInput.focus();

    let modoRegistro = false;

    modoBtn.addEventListener('click', () => {
      modoRegistro = !modoRegistro;
      if (modoRegistro) {
        subtitulo.textContent = 'Crea tu cuenta';
        btn.textContent = 'Crear cuenta';
        modoBtn.textContent = '¿Ya tienes cuenta? Entrar';
      } else {
        subtitulo.textContent = 'Inicia sesión';
        btn.textContent = 'Entrar';
        modoBtn.textContent = '¿No tienes cuenta? Crear cuenta';
      }
    });

    async function intentar() {
      const usuario = usuarioInput.value.trim();
      const clave = claveInput.value;
      const errorDiv = document.getElementById('gh-login-error');
      if (!usuario || !clave) { errorDiv.textContent = 'Escribe tu usuario y contraseña.'; return; }
      if (clave.length < 6) { errorDiv.textContent = 'La contraseña debe tener al menos 6 caracteres.'; return; }
      btn.disabled = true; btn.textContent = modoRegistro ? 'Creando...' : 'Entrando...';
      const email = usuarioAEmail(usuario);

      try {
        let resultado;
        if (modoRegistro) {
          resultado = await client.auth.signUp({ email, password: clave });
        } else {
          resultado = await client.auth.signInWithPassword({ email, password: clave });
        }
        if (resultado.error) {
          errorDiv.textContent = resultado.error.message || 'Ocurrió un error. Intenta de nuevo.';
          btn.disabled = false; btn.textContent = modoRegistro ? 'Crear cuenta' : 'Entrar';
          return;
        }

        if (modoRegistro) {
          try {
            await crearPerfil(usuario);
          } catch (e) {
            errorDiv.textContent = 'Cuenta creada, pero no se pudo guardar el perfil: ' + (e.message || e);
            btn.disabled = false; btn.textContent = 'Crear cuenta';
            return;
          }
          // La cuenta queda pendiente de aprobación — no se entra automáticamente.
          try { await client.auth.signOut(); } catch (e) {}
          errorDiv.textContent = 'Cuenta creada. Un administrador debe aprobarla antes de que puedas entrar.';
          modoRegistro = false;
          subtitulo.textContent = 'Inicia sesión';
          btn.disabled = false; btn.textContent = 'Entrar';
          modoBtn.textContent = '¿No tienes cuenta? Crear cuenta';
          return;
        }

        const { data: { user } } = await client.auth.getUser();
        const { data: perfil } = await client.from('perfiles').select('activo,rol,nombre').eq('id', user.id).maybeSingle();
        if (!perfil || !perfil.activo) {
          try { await client.auth.signOut(); } catch (e) {}
          errorDiv.textContent = 'Tu cuenta no está activa. Contacta al administrador.';
          btn.disabled = false; btn.textContent = modoRegistro ? 'Crear cuenta' : 'Entrar';
          return;
        }

        aplicarPerfilGlobal(perfil);
        await cargarCuentaActiva();
        overlay.remove();
        programarExpiracion();
        resolverSesion();
      } catch (e) {
        errorDiv.textContent = 'No se pudo conectar: ' + (e.message || e);
        btn.disabled = false; btn.textContent = modoRegistro ? 'Crear cuenta' : 'Entrar';
      }
    }

    btn.addEventListener('click', intentar);
    claveInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') intentar(); });
  }

  async function iniciarSesion() {
    try {
      const { data: { session } } = await client.auth.getSession();
      if (session) {
        const { data: perfil } = await client.from('perfiles').select('activo,rol,nombre').eq('id', session.user.id).maybeSingle();
        if (perfil && perfil.activo) {
          aplicarPerfilGlobal(perfil);
          await cargarCuentaActiva();
          programarExpiracion();
          resolverSesion();
          return;
        }
      }
    } catch (e) {}
    mostrarFormularioLogin();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciarSesion);
  } else {
    iniciarSesion();
  }

  // Permite que el resto de la app (index.html) sepa cuándo ya se conoce
  // el rol del usuario, sin necesidad de tocar window.storage.
  window.GH_ESPERAR_SESION = () => sesionLista;

  // Cierre de sesión real (no solo recargar la página).
  window.GH_CERRAR_SESION = async () => {
    try { await client.auth.signOut(); } catch (e) {}
    location.reload();
  };

  // ---------- window.storage respaldado por Supabase ----------
  // Sistema de CUENTAS: cada cuenta tiene su propia información. La cuenta
  // "principal" usa las claves tal cual (los datos que ya existían). Otras
  // cuentas anteponen un prefijo "c:<codigo>::" a cada clave, así su
  // información queda separada. Dos usuarios con el mismo código de cuenta
  // comparten la misma información.
  let cuentaActiva = 'principal';
  function prefijoActual() {
    return (cuentaActiva && cuentaActiva !== 'principal') ? ('c:' + cuentaActiva + '::') : '';
  }
  // Las claves globales (empiezan con __) NO se prefijan: son del sistema
  // (por ejemplo, el mapeo de qué cuenta usa cada usuario).
  function claveConCuenta(key) {
    if (key.startsWith('__')) return key;
    return prefijoActual() + key;
  }
  // Lee una clave de una base de datos ESPECÍFICA (no necesariamente la
  // "activa" en este momento) — usado por el visor para ver varias bases de
  // datos a la vez, sin tener que cambiar entre ellas.
  window.GH_LEER_DE_CUENTA = async (codigoCuenta, key) => {
    await sesionLista;
    const pfx = (codigoCuenta && codigoCuenta !== 'principal') ? ('c:' + codigoCuenta + '::') : '';
    const claveCompleta = key.startsWith('__') ? key : (pfx + key);
    try {
      const { data, error } = await client.from('datos_app').select('valor').eq('clave', claveCompleta).maybeSingle();
      if (error || !data) return null;
      return data.valor;
    } catch (e) { return null; }
  };

  // Lee qué cuenta tiene asignada el usuario actual (por defecto "principal")
  async function cargarCuentaActiva() {
    try {
      const { data: { user } } = await client.auth.getUser();
      if (!user) { cuentaActiva = 'principal'; return; }
      window.GH_USER_ID = user.id;
      const { data } = await client.from('datos_app').select('valor').eq('clave', '__cuenta::' + user.id).maybeSingle();
      cuentaActiva = (data && data.valor) ? data.valor : 'principal';
    } catch (e) { cuentaActiva = 'principal'; }
  }

  window.GH_GET_CUENTA = () => cuentaActiva;
  window.GH_SET_CUENTA = async (codigo) => {
    const c = (codigo || 'principal').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'principal';
    // Si es visor y el admin le configuró una lista de bases de datos permitidas,
    // no dejarlo salirse de esa lista (aunque lo intente manualmente).
    if (window.GH_ROL === 'visor' && typeof window.GH_MIS_CUENTAS_VISOR === 'function') {
      try {
        const permitidas = await window.GH_MIS_CUENTAS_VISOR();
        if (Array.isArray(permitidas) && permitidas.length && !permitidas.includes(c)) {
          throw new Error('cuenta-no-permitida');
        }
      } catch (e) {
        if (e && e.message === 'cuenta-no-permitida') throw new Error('Esta base de datos no está permitida para tu usuario.');
        // Si la consulta falla por otra razón (ej. red), no bloquear aquí.
      }
    }
    const { data: { user } } = await client.auth.getUser();
    if (user) {
      await client.from('datos_app').upsert({
        clave: '__cuenta::' + user.id, valor: c,
        actualizado_por: user.id, actualizado_en: new Date().toISOString()
      });
    }
    cuentaActiva = c;
    return c;
  };

  // ---------- Administración de usuarios y cuentas (solo admin) ----------
  const limpiarCodigo = (codigo) => (codigo || 'principal').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'principal';

  // Lista todos los usuarios (perfiles) con la cuenta que tienen asignada
  window.GH_LISTAR_USUARIOS = async () => {
    await sesionLista;
    const { data: perfiles, error } = await client.from('perfiles').select('id, nombre, rol, activo');
    if (error) throw error;
    const { data: mapeos } = await client.from('datos_app').select('clave, valor').like('clave', '__cuenta::%');
    const cuentaDe = {};
    (mapeos || []).forEach((m) => { cuentaDe[m.clave.replace('__cuenta::', '')] = m.valor; });
    const { data: visorMapeos } = await client.from('datos_app').select('clave, valor').like('clave', '__visor_cuentas::%');
    const cuentasVisorDe = {};
    (visorMapeos || []).forEach((m) => {
      try { cuentasVisorDe[m.clave.replace('__visor_cuentas::', '')] = JSON.parse(m.valor) || []; } catch (e) {}
    });
    return (perfiles || []).map((p) => ({ id: p.id, nombre: p.nombre, rol: p.rol, activo: p.activo, cuenta: cuentaDe[p.id] || 'principal', cuentasVisor: cuentasVisorDe[p.id] || null }));
  };

  // Asigna una cuenta a un usuario (por su id)
  window.GH_ASIGNAR_CUENTA = async (userId, codigo) => {
    await sesionLista;
    const c = limpiarCodigo(codigo);
    const { data: { user } } = await client.auth.getUser();
    const { error } = await client.from('datos_app').upsert({
      clave: '__cuenta::' + userId, valor: c,
      actualizado_por: user ? user.id : null, actualizado_en: new Date().toISOString()
    });
    if (error) throw error;
    return c;
  };

  // Para usuarios "visor": el admin decide a CUÁLES bases de datos puede
  // entrar (una lista, no solo una). Si nunca se configura, el visor sigue
  // funcionando como antes (solo su __cuenta:: de siempre).
  window.GH_GUARDAR_CUENTAS_VISOR = async (userId, listaCodigos) => {
    await sesionLista;
    const limpia = [...new Set((listaCodigos || []).map(limpiarCodigo))];
    const { data: { user } } = await client.auth.getUser();
    const { error } = await client.from('datos_app').upsert({
      clave: '__visor_cuentas::' + userId, valor: JSON.stringify(limpia),
      actualizado_por: user ? user.id : null, actualizado_en: new Date().toISOString()
    });
    if (error) throw error;
    return limpia;
  };
  window.GH_OBTENER_CUENTAS_VISOR = async (userId) => {
    await sesionLista;
    const { data } = await client.from('datos_app').select('valor').eq('clave', '__visor_cuentas::' + userId).maybeSingle();
    try { return data && data.valor ? JSON.parse(data.valor) : null; } catch (e) { return null; }
  };
  // El propio visor consulta cuáles bases de datos tiene permitidas (null = sin restricción especial configurada, se usa su __cuenta:: normal)
  window.GH_MIS_CUENTAS_VISOR = async () => {
    if (!window.GH_USER_ID) return null;
    return window.GH_OBTENER_CUENTAS_VISOR(window.GH_USER_ID);
  };

  // Actualiza rol / activo de un usuario
  window.GH_ACTUALIZAR_PERFIL = async (userId, cambios) => {
    await sesionLista;
    const { error } = await client.from('perfiles').update(cambios).eq('id', userId);
    if (error) throw error;
  };

  window.storage = {
    get: async (key) => {
      await sesionLista;
      const { data, error } = await client.from('datos_app').select('valor').eq('clave', claveConCuenta(key)).maybeSingle();
      if (error || !data) throw new Error('not found');
      return { key, value: data.valor, shared: false };
    },
    set: async (key, value) => {
      await sesionLista;
      const { data: { user } } = await client.auth.getUser();
      const { error } = await client.from('datos_app').upsert({
        clave: claveConCuenta(key), valor: value, actualizado_por: user ? user.id : null, actualizado_en: new Date().toISOString()
      });
      if (error) throw error;
      return { key, value, shared: false };
    },
    delete: async (key) => {
      await sesionLista;
      const { error } = await client.from('datos_app').delete().eq('clave', claveConCuenta(key));
      if (error) throw error;
      return { key, deleted: true, shared: false };
    },
    list: async (prefix) => {
      await sesionLista;
      const pfx = prefijoActual();
      let q = client.from('datos_app').select('clave');
      if (pfx) q = q.like('clave', pfx + (prefix || '') + '%');
      else if (prefix) q = q.like('clave', prefix + '%');
      const { data, error } = await q;
      if (error) throw error;
      let keys = (data || []).map((r) => r.clave);
      if (pfx) keys = keys.filter((k) => k.startsWith(pfx)).map((k) => k.slice(pfx.length));
      else keys = keys.filter((k) => !k.startsWith('c:') && !k.startsWith('__'));
      return { keys, prefix, shared: false };
    }
  };
})();
