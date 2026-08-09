// ============================================================
// GUZMAN HVAC — Conexión con Supabase (Fase 2: usuarios + sincronización)
// ============================================================
// Este archivo define window.storage ANTES de que el resto de la app
// cargue, así que la app usa esto como su almacenamiento principal.
// Si algo falla (sin internet, sesión no lista, etc.), el propio código
// de la app ya sabe caer de regreso a almacenamiento local del navegador
// (ver la función setupStorage() dentro de index.html).

(function () {
  const SUPABASE_URL = 'https://cubhmlclqovvmsdskooc.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_drw-q0SBYKj0I3fV0BKvmA_0nmV1DkW';

  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  let resolverSesion;
  const sesionLista = new Promise((r) => { resolverSesion = r; });

  // ---------- Pantalla de código de acceso ----------
  function mostrarFormularioCodigo(mensajeError) {
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
        <div style="font-size:12.5px; color:#5A6A88; margin-bottom:22px;">Ingresa tu código de acceso</div>
        <input id="gh-codigo-input" type="text" placeholder="Código" autocomplete="off"
          style="width:100%; padding:12px 14px; border:1.5px solid #D0D8E8; border-radius:9px; font-size:15px; text-align:center; letter-spacing:1px; margin-bottom:14px; box-sizing:border-box;">
        <div id="gh-codigo-error" style="color:#C8511A; font-size:12.5px; min-height:16px; margin-bottom:10px;">${mensajeError || ''}</div>
        <button id="gh-codigo-btn" style="width:100%; padding:12px; background:#16233F; color:#fff; border:none; border-radius:9px; font-weight:600; font-size:14px; cursor:pointer;">Entrar</button>
      </div>
    `;
    document.body.appendChild(overlay);

    const input = document.getElementById('gh-codigo-input');
    const btn = document.getElementById('gh-codigo-btn');
    input.focus();

    async function intentar() {
      const codigo = input.value.trim();
      if (!codigo) return;
      btn.disabled = true; btn.textContent = 'Verificando...';
      try {
        const { data, error } = await client.rpc('validar_codigo', { codigo_ingresado: codigo });
        const fila = Array.isArray(data) ? data[0] : data;
        if (error || !fila || !fila.ok) {
          document.getElementById('gh-codigo-error').textContent = 'Código incorrecto. Intenta de nuevo.';
          btn.disabled = false; btn.textContent = 'Entrar';
          return;
        }
        overlay.remove();
        resolverSesion();
      } catch (e) {
        document.getElementById('gh-codigo-error').textContent = 'No se pudo conectar. Revisa tu internet.';
        btn.disabled = false; btn.textContent = 'Entrar';
      }
    }

    btn.addEventListener('click', intentar);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') intentar(); });
  }

  async function iniciarSesion() {
    try {
      let { data: { session } } = await client.auth.getSession();
      if (!session) {
        const { data, error } = await client.auth.signInAnonymously();
        if (error) throw error;
        session = data.session;
      }
      const { data: perfil } = await client
        .from('perfiles')
        .select('activo')
        .eq('id', session.user.id)
        .maybeSingle();
      if (perfil && perfil.activo) { resolverSesion(); return; }
    } catch (e) {
      // seguimos y mostramos el formulario de código
    }
    mostrarFormularioCodigo();
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
