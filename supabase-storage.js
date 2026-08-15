// ============================================================
// GUZMAN HVAC — Conexión con Supabase (usuario y contraseña + roles)
// ============================================================
// Define window.storage ANTES de que el resto de la app cargue,
// así que la app usa esto como su almacenamiento principal.
// También expone window.GH_ROL / window.GH_NOMBRE (el rol y nombre
// del usuario que entró) y window.checkinAPI (marcar entrada/salida).

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

  // Espera (con reintentos) a que la sesión recién creada quede lista para
  // usarse contra la base de datos, y regresa esa sesión.
  async function esperarSesionLista() {
    for (let intento = 0; intento < 6; intento++) {
      const { data: { session } } = await client.auth.getSession();
      if (session) return session;
      await esperar(400);
    }
    throw new Error('La sesión no quedó lista. Intenta de nuevo.');
  }

  // Trae la lista de trabajadores (para que la persona elija su nombre al
  // registrarse). Funciona incluso antes de tener un perfil propio, gracias
  // a un permiso especial solo para esa llave.
  async function traerNombresTrabajadores() {
    try {
      const { data } = await client.from('datos_app').select('valor').eq('clave', 'gh-trabajadores').maybeSingle();
      if (!data || !data.valor) return [];
      const lista = JSON.parse(data.valor);
      return (lista || []).map((t) => t.nombre).filter(Boolean);
    } catch (e) { return []; }
  }

  // Crea el perfil ya con acceso inmediato (sin aprobación) y el nombre elegido.
  async function crearPerfilConNombre(nombreElegido) {
    let ultimoError = null;
    for (let intento = 0; intento < 5; intento++) {
      const session = await esperarSesionLista().catch(() => null);
      if (!session) { await esperar(400); continue; }
      const { data: existente } = await client.from('perfiles').select('id').eq('id', session.user.id).maybeSingle();
      if (existente) return; // ya existe, nada que hacer
      const { error } = await client.from('perfiles').insert({
        id: session.user.id, nombre: nombreElegido, rol: 'checkin', activo: true
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
      <div id="gh-login-card" style="background:#fff; border-radius:16px; padding:36px 32px; width:90%; max-width:360px; box-shadow:0 12px 40px rgba(0,0,0,.35); text-align:center;">
        <div style="font-family:'Zilla Slab',serif; font-weight:700; font-size:20px; color:#16233F; margin-bottom:4px;">GUZMAN HVAC</div>
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

    // ---- Paso 2 del registro: elegir el nombre (una sola vez) ----
    async function mostrarSelectorNombre() {
      const card = document.getElementById('gh-login-card');
      card.innerHTML = `
        <div style="font-family:'Zilla Slab',serif; font-weight:700; font-size:20px; color:#16233F; margin-bottom:4px;">GUZMAN HVAC</div>
        <div style="font-size:12.5px; color:#5A6A88; margin-bottom:4px;">¿Cuál es tu nombre?</div>
        <div style="font-size:11px; color:#9AA6BE; margin-bottom:16px;">Elígelo con cuidado — no podrás cambiarlo después.</div>
        <div id="gh-nombre-lista" style="max-height:220px;overflow-y:auto;margin-bottom:12px;"></div>
        <div style="font-size:11.5px;color:#9AA6BE;margin:10px 0 8px;">¿No apareces en la lista?</div>
        <input id="gh-nombre-otro" type="text" placeholder="Escribe tu nombre" autocomplete="off"
          style="width:100%; padding:12px 14px; border:1.5px solid #D0D8E8; border-radius:9px; font-size:15px; margin-bottom:10px; box-sizing:border-box;">
        <div id="gh-nombre-error" style="color:#C8511A; font-size:12.5px; min-height:16px; margin-bottom:8px;"></div>
        <button id="gh-nombre-btn" style="width:100%; padding:12px; background:#16233F; color:#fff; border:none; border-radius:9px; font-weight:600; font-size:14px; cursor:pointer;">Confirmar y entrar</button>
      `;
      const lista = document.getElementById('gh-nombre-lista');
      const otroInput = document.getElementById('gh-nombre-otro');
      const errorDiv = document.getElementById('gh-nombre-error');
      const confirmarBtn = document.getElementById('gh-nombre-btn');
      let elegido = null;

      const nombres = await traerNombresTrabajadores();
      if (nombres.length) {
        nombres.forEach((n) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.textContent = n;
          b.style.cssText = 'display:block;width:100%;text-align:left;padding:10px 14px;margin-bottom:6px;background:#F5F8FC;border:1.5px solid #D0D8E8;border-radius:9px;font-family:Inter,sans-serif;font-size:14px;color:#16233F;cursor:pointer;';
          b.addEventListener('click', () => {
            elegido = n;
            otroInput.value = '';
            lista.querySelectorAll('button').forEach((x) => { x.style.background = '#F5F8FC'; x.style.borderColor = '#D0D8E8'; });
            b.style.background = '#E8F0FE'; b.style.borderColor = '#16233F';
          });
          lista.appendChild(b);
        });
      } else {
        lista.innerHTML = '<div style="font-size:12px;color:#9AA6BE;">Todavía no hay trabajadores en la lista.</div>';
      }

      otroInput.addEventListener('input', () => {
        if (otroInput.value.trim()) {
          elegido = null;
          lista.querySelectorAll('button').forEach((x) => { x.style.background = '#F5F8FC'; x.style.borderColor = '#D0D8E8'; });
        }
      });

      confirmarBtn.addEventListener('click', async () => {
        const nombreFinal = elegido || otroInput.value.trim();
        if (!nombreFinal) { errorDiv.textContent = 'Elige un nombre de la lista o escríbelo abajo.'; return; }
        confirmarBtn.disabled = true; confirmarBtn.textContent = 'Guardando...';
        try {
          await crearPerfilConNombre(nombreFinal);
          const { data: { user } } = await client.auth.getUser();
          const { data: perfil } = await client.from('perfiles').select('activo,rol,nombre').eq('id', user.id).maybeSingle();
          aplicarPerfilGlobal(perfil);
          overlay.remove();
          programarExpiracion();
          resolverSesion();
        } catch (e) {
          errorDiv.textContent = 'No se pudo guardar: ' + (e.message || e);
          confirmarBtn.disabled = false; confirmarBtn.textContent = 'Confirmar y entrar';
        }
      });
    }

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
          // Acceso inmediato: en vez de "pendiente de aprobación", pasamos
          // directo a que elija su nombre y ya queda dentro de la app.
          await mostrarSelectorNombre();
          return;
        }

        const { data: { user } } = await client.auth.getUser();
        const { data: perfil } = await client.from('perfiles').select('activo,rol,nombre').eq('id', user.id).maybeSingle();
        if (!perfil || !perfil.activo) {
          try { await client.auth.signOut(); } catch (e) {}
          errorDiv.textContent = 'Tu cuenta no está activa. Contacta al administrador.';
          btn.disabled = false; btn.textContent = 'Entrar';
          return;
        }

        aplicarPerfilGlobal(perfil);
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
  window.storage = {
    get: async (key) => {
      await sesionLista;
      const { data, error } = await client.from('datos_app').select('valor').eq('clave', key).maybeSingle();
      if (error || !data) throw new Error('not found');
      return { key, value: data.valor, shared: false };
    },
    set: async (key, value) => {
      await sesionLista;
      const { data: { user } } = await client.auth.getUser();
      const { error } = await client.from('datos_app').upsert({
        clave: key, valor: value, actualizado_por: user ? user.id : null, actualizado_en: new Date().toISOString()
      });
      if (error) throw error;
      return { key, value, shared: false };
    },
    delete: async (key) => {
      await sesionLista;
      const { error } = await client.from('datos_app').delete().eq('clave', key);
      if (error) throw error;
      return { key, deleted: true, shared: false };
    },
    list: async (prefix) => {
      await sesionLista;
      let q = client.from('datos_app').select('clave');
      if (prefix) q = q.like('clave', prefix + '%');
      const { data, error } = await q;
      if (error) throw error;
      return { keys: (data || []).map((r) => r.clave), prefix, shared: false };
    }
  };

  // ---------- API de check-in (entrada/salida) para empleados ----------
  function horaActual() {
    const d = new Date();
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  function fechaHoy() { return new Date().toISOString().slice(0, 10); }

  window.checkinAPI = {
    deHoy: async () => {
      await sesionLista;
      const { data: { user } } = await client.auth.getUser();
      const { data } = await client.from('checkins').select('*')
        .eq('usuario_id', user.id).eq('fecha', fechaHoy()).maybeSingle();
      return data || null;
    },
    marcarEntrada: async () => {
      await sesionLista;
      const { data: { user } } = await client.auth.getUser();
      const { error } = await client.from('checkins').insert({
        usuario_id: user.id, nombre: window.GH_NOMBRE || '', fecha: fechaHoy(), entrada: horaActual()
      });
      if (error) throw error;
    },
    marcarSalida: async (idCheckin) => {
      await sesionLista;
      const { error } = await client.from('checkins').update({ salida: horaActual() }).eq('id', idCheckin);
      if (error) throw error;
    },
    misUltimos: async (limite) => {
      await sesionLista;
      const { data: { user } } = await client.auth.getUser();
      const { data, error } = await client.from('checkins').select('*')
        .eq('usuario_id', user.id).order('fecha', { ascending: false }).limit(limite || 14);
      if (error) throw error;
      return data || [];
    },
    porNombreRecientes: async (nombre, dias) => {
      await sesionLista;
      const desde = new Date();
      desde.setDate(desde.getDate() - (dias || 21));
      const { data, error } = await client.from('checkins').select('*')
        .ilike('nombre', nombre.trim())
        .gte('fecha', desde.toISOString().slice(0, 10))
        .order('fecha', { ascending: true });
      if (error) throw error;
      return data || [];
    }
  };
})();
