// ============================================================
// GUZMAN HVAC — Conexión con Supabase (usuario y contraseña)
// ============================================================
// Define window.storage ANTES de que el resto de la app cargue,
// así que la app usa esto como su almacenamiento principal.

(function () {
  const SUPABASE_URL = 'https://cubhmlclqovvmsdskooc.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_drw-q0SBYKj0I3fV0BKvmA_0nmV1DkW';
  const DOMINIO_INTERNO = '@guzmanhvac.app'; // usuario -> "correo" interno, invisible para el usuario

  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  let resolverSesion;
  const sesionLista = new Promise((r) => { resolverSesion = r; });

  function usuarioAEmail(usuario) {
    return usuario.trim().toLowerCase().replace(/\s+/g, '.') + DOMINIO_INTERNO;
  }

  async function asegurarPerfil(usuario) {
    const { data: { user } } = await client.auth.getUser();
    if (!user) throw new Error('No hay sesión activa todavía.');
    const { data: perfil } = await client.from('perfiles').select('id').eq('id', user.id).maybeSingle();
    if (!perfil) {
      const { error } = await client.from('perfiles').insert({ id: user.id, nombre: usuario, rol: 'empleado', activo: true });
      if (error) throw error;
    }
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
        <div style="font-family:'Zilla Slab',serif; font-weight:700; font-size:20px; color:#16233F; margin-bottom:4px;">GUZMAN HVAC</div>
        <div id="gh-login-subtitulo" style="font-size:12.5px; color:#5A6A88; margin-bottom:22px;">Inicia sesión</div>
        <input id="gh-usuario-input" type="text" placeholder="Usuario" autocomplete="username"
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
      if (!usuario || !clave) {
        errorDiv.textContent = 'Escribe tu usuario y contraseña.';
        return;
      }
      if (clave.length < 6) {
        errorDiv.textContent = 'La contraseña debe tener al menos 6 caracteres.';
        return;
      }
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
            await asegurarPerfil(usuario);
          } catch (e) {
            errorDiv.textContent = 'Cuenta creada, pero no se pudo guardar el perfil: ' + (e.message || e);
            btn.disabled = false; btn.textContent = 'Crear cuenta';
            return;
          }
        }
        overlay.remove();
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
        const { data: perfil } = await client.from('perfiles').select('activo').eq('id', session.user.id).maybeSingle();
        if (perfil && perfil.activo) { resolverSesion(); return; }
      }
    } catch (e) {
      // seguimos al formulario de login
    }
    mostrarFormularioLogin();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciarSesion);
  } else {
    iniciarSesion();
  }

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
})();
