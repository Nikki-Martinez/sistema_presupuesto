(() => {
    'use strict';

    /* ===================== Configuración y estado ===================== */
    const CLAVE = 'panel_cuotas_v1';
    const PALETA = ['#7c3aed', '#2563eb', '#0891b2', '#059669', '#d97706', '#db2777', '#4f46e5', '#0d9488', '#c026d3', '#ea580c'];

    let estadoApp = { bancos: [], planes: [] };
    let editandoId = null;

    const $ = (id) => document.getElementById(id);
    const el = {
        form: $('formPlan'),
        descripcion: $('descripcion'),
        bancoSelect: $('bancoSelect'),
        bancoNuevo: $('bancoNuevo'),
        total: $('total'),
        cuotas: $('cuotas'),
        pagadas: $('pagadas'),
        dia: $('dia'),
        tituloForm: $('tituloForm'),
        textoGuardar: $('textoGuardar'),
        btnCancelar: $('btnCancelar'),
        lista: $('listaPlanes'),
        vacio: $('vacio'),
        filtroBanco: $('filtroBanco'),
        filtroEstado: $('filtroEstado'),
        orden: $('orden'),
        resDeuda: $('resDeuda'),
        resPagado: $('resPagado'),
        resMes: $('resMes'),
        resProximo: $('resProximo'),
        toast: $('toast'),
        archivoImportar: $('archivoImportar')
    };

    /* ===================== Utilidades ===================== */
    const pad = (n) => String(n).padStart(2, '0');
    const aISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const deISO = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
    const hoy = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };

    // Fecha de un mes dado; si el día no existe (ej. 31 en febrero) usa el último día del mes.
    const fechaEnMes = (anio, mes, dia) => {
        const ultimo = new Date(anio, mes + 1, 0).getDate();
        return new Date(anio, mes, Math.min(dia, ultimo));
    };
    // Primera fecha de pago estrictamente posterior a la referencia.
    const siguienteDespuesDe = (ref, dia) => {
        let c = fechaEnMes(ref.getFullYear(), ref.getMonth(), dia);
        if (c <= ref) c = fechaEnMes(ref.getFullYear(), ref.getMonth() + 1, dia);
        return c;
    };
    const mesSiguiente = (f, dia) => fechaEnMes(f.getFullYear(), f.getMonth() + 1, dia);

    const formatoFecha = (iso) => deISO(iso).toLocaleDateString('es-GT', { day: 'numeric', month: 'long', year: 'numeric' });
    const formatoQ = (n) => 'Q ' + (Math.round((n + Number.EPSILON) * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const escapar = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    const colorBanco = (nombre) => {
        let h = 0;
        for (const ch of nombre.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
        return PALETA[h % PALETA.length];
    };

    const nuevoId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

    let temporizadorToast;
    const aviso = (texto, error = false) => {
        el.toast.textContent = texto;
        el.toast.classList.toggle('error', error);
        el.toast.classList.add('visible');
        clearTimeout(temporizadorToast);
        temporizadorToast = setTimeout(() => el.toast.classList.remove('visible'), 3500);
    };

    /* ===================== Almacenamiento ===================== */
    const guardar = () => {
        try { localStorage.setItem(CLAVE, JSON.stringify(estadoApp)); }
        catch (e) { aviso('No se pudo guardar en el navegador.', true); }
    };

    const normalizarPlan = (p) => {
        const cuotas = Math.max(1, parseInt(p.cuotas, 10) || 1);
        const pagadas = Math.min(cuotas, Math.max(0, parseInt(p.pagadas, 10) || 0));
        const dia = Math.min(31, Math.max(1, parseInt(p.dia, 10) || 1));
        const historial = Array.isArray(p.historial) ? p.historial.slice(0, pagadas) : [];
        while (historial.length < pagadas) historial.unshift({ fecha: null, tipo: 'inicial' });
        return {
            id: p.id || nuevoId(),
            descripcion: String(p.descripcion || 'Sin descripción').slice(0, 60),
            banco: String(p.banco || 'Sin banco').slice(0, 40),
            total: Math.max(0.01, Number(p.total) || 0.01),
            cuotas, pagadas, dia, historial,
            proxima: pagadas >= cuotas ? null : (p.proxima || aISO(siguienteDespuesDe(hoy(), dia)))
        };
    };

    const cargar = () => {
        try {
            const crudo = localStorage.getItem(CLAVE);
            if (!crudo) return;
            const datos = JSON.parse(crudo);
            estadoApp.planes = Array.isArray(datos.planes) ? datos.planes.map(normalizarPlan) : [];
            estadoApp.bancos = Array.isArray(datos.bancos) ? datos.bancos.filter((b) => typeof b === 'string') : [];
        } catch (e) {
            estadoApp = { bancos: [], planes: [] };
        }
        estadoApp.planes.forEach((p) => registrarBanco(p.banco));
    };

    const registrarBanco = (nombre) => {
        if (!estadoApp.bancos.some((b) => b.toLowerCase() === nombre.toLowerCase())) {
            estadoApp.bancos.push(nombre);
            estadoApp.bancos.sort((a, b) => a.localeCompare(b, 'es'));
        }
    };

    /* ===================== Lógica de cuotas ===================== */
    // Marca como pagadas las cuotas cuyo día de pago ya llegó (también las de meses en que no se abrió la página).
    const aplicarAutomaticos = () => {
        const h = hoy();
        let aplicadas = 0;
        estadoApp.planes.forEach((p) => {
            while (p.proxima && p.pagadas < p.cuotas && deISO(p.proxima) <= h) {
                const f = deISO(p.proxima);
                p.pagadas++;
                p.historial.push({ fecha: p.proxima, tipo: 'auto' });
                p.proxima = p.pagadas < p.cuotas ? aISO(mesSiguiente(f, p.dia)) : null;
                aplicadas++;
            }
        });
        if (aplicadas) {
            guardar();
            aviso(aplicadas === 1 ? 'Se marcó 1 cuota como pagada automáticamente.' : `Se marcaron ${aplicadas} cuotas como pagadas automáticamente.`);
        }
        return aplicadas;
    };

    const calculos = (p) => {
        const cuota = p.total / p.cuotas;
        const pagado = Math.min(p.total, cuota * p.pagadas);
        const restante = Math.max(0, p.total - pagado);
        const pct = (p.pagadas / p.cuotas) * 100;
        return { cuota, pagado, restante, pct };
    };

    const estadoPlan = (p) => {
        if (p.pagadas >= p.cuotas) return { clave: 'liquidado', texto: 'Liquidado' };
        const dias = Math.round((deISO(p.proxima) - hoy()) / 86400000);
        if (dias <= 3) return { clave: 'porvencer', texto: dias <= 1 ? 'Vence mañana' : `Vence en ${dias} días` };
        return { clave: 'aldia', texto: 'Al día' };
    };

    const pagarCuota = (p) => {
        if (p.pagadas >= p.cuotas) return;
        const base = p.proxima ? deISO(p.proxima) : siguienteDespuesDe(hoy(), p.dia);
        p.pagadas++;
        p.historial.push({ fecha: aISO(hoy()), tipo: 'manual' });
        p.proxima = p.pagadas < p.cuotas ? aISO(mesSiguiente(base, p.dia)) : null;
    };

    const revertirCuota = (p) => {
        if (p.pagadas <= 0) return;
        p.pagadas--;
        p.historial.pop();
        p.proxima = aISO(siguienteDespuesDe(hoy(), p.dia));
    };

    /* ===================== Render ===================== */
    const llenarBancos = () => {
        const selForm = el.bancoSelect.value;
        const selFiltro = el.filtroBanco.value;
        el.bancoSelect.innerHTML = '<option value="">Seleccionar banco...</option>' +
            estadoApp.bancos.map((b) => `<option value="${escapar(b)}">${escapar(b)}</option>`).join('');
        el.filtroBanco.innerHTML = '<option value="">Todos</option>' +
            estadoApp.bancos.map((b) => `<option value="${escapar(b)}">${escapar(b)}</option>`).join('');
        if (estadoApp.bancos.includes(selForm)) el.bancoSelect.value = selForm;
        if (estadoApp.bancos.includes(selFiltro)) el.filtroBanco.value = selFiltro;
    };

    const renderResumen = () => {
        let deuda = 0, pagado = 0, mes = 0, proximo = null;
        estadoApp.planes.forEach((p) => {
            const c = calculos(p);
            deuda += c.restante;
            pagado += c.pagado;
            if (p.pagadas < p.cuotas) {
                mes += c.cuota;
                if (!proximo || p.proxima < proximo.proxima) proximo = p;
            }
        });
        el.resDeuda.textContent = formatoQ(deuda);
        el.resPagado.textContent = formatoQ(pagado);
        el.resMes.textContent = formatoQ(mes);
        el.resProximo.innerHTML = proximo
            ? `${escapar(formatoFecha(proximo.proxima))}<span class="resumen-sub">${escapar(proximo.descripcion)}</span>`
            : '—';
    };

    const textoHistorial = (h, i) => {
        const n = `Cuota ${i + 1}`;
        if (h.tipo === 'inicial' || !h.fecha) return `${n} — registrada al crear el plan`;
        return `${n} — ${formatoFecha(h.fecha)} (${h.tipo === 'auto' ? 'automático' : 'manual'})`;
    };

    const tarjetaHTML = (p) => {
        const c = calculos(p);
        const est = estadoPlan(p);
        const color = colorBanco(p.banco);
        const claseBarra = c.pct >= 66 ? 'verde' : c.pct >= 33 ? 'amarillo' : 'rojo';
        const nota = p.dia > 28 ? ' (último día si el mes es corto)' : '';
        const liquidado = p.pagadas >= p.cuotas;
        const hist = p.historial.length
            ? `<details class="historial"><summary>Historial de pagos (${p.historial.length})</summary><ul>${
                p.historial.map((h, i) => `<li>${escapar(textoHistorial(h, i))}</li>`).join('')
            }</ul></details>`
            : '';

        return `
        <article class="plan" data-id="${p.id}">
            <div class="plan-cabecera">
                <h3 class="plan-titulo">${escapar(p.descripcion)}</h3>
                <span class="chip-banco" style="background:${color}" title="${escapar(p.banco)}">${escapar(p.banco)}</span>
            </div>
            <span class="estado ${est.clave}">${est.texto}</span>
            <div class="datos">
                <div class="dato"><span>Cuota mensual</span><strong>${formatoQ(c.cuota)}</strong></div>
                <div class="dato"><span>Total del plan</span><strong>${formatoQ(p.total)}</strong></div>
                <div class="dato"><span>Pagado</span><strong>${formatoQ(c.pagado)}</strong></div>
                <div class="dato"><span>Restante</span><strong>${formatoQ(c.restante)}</strong></div>
                <div class="dato"><span>Día de pago</span><strong>${p.dia} de cada mes${nota}</strong></div>
                <div class="dato"><span>Próximo pago</span><strong>${liquidado ? '—' : escapar(formatoFecha(p.proxima))}</strong></div>
            </div>
            <div>
                <div class="progreso-fila">
                    <span>Progreso: <strong>${p.pagadas} de ${p.cuotas} cuotas</strong></span>
                    <strong>${c.pct.toFixed(1)}%</strong>
                </div>
                <div class="barra"><div class="barra-relleno ${claseBarra}" style="width:${c.pct}%"></div></div>
            </div>
            <div class="plan-botones">
                <button class="btn btn-verde" data-accion="pagar" ${liquidado ? 'disabled' : ''}><i class="fa-solid fa-check"></i> Pagar</button>
                <button class="btn btn-naranja" data-accion="revertir" ${p.pagadas === 0 ? 'disabled' : ''}><i class="fa-solid fa-rotate-left"></i> Revertir</button>
                <button class="btn btn-azul" data-accion="editar"><i class="fa-solid fa-pen"></i> Editar</button>
                <button class="btn btn-rojo" data-accion="eliminar"><i class="fa-solid fa-trash"></i> Eliminar</button>
            </div>
            ${hist}
        </article>`;
    };

    const render = () => {
        llenarBancos();
        renderResumen();

        let planes = estadoApp.planes.slice();
        if (el.filtroBanco.value) planes = planes.filter((p) => p.banco === el.filtroBanco.value);
        if (el.filtroEstado.value) planes = planes.filter((p) => estadoPlan(p).clave === el.filtroEstado.value);

        const criterios = {
            vencimiento: (a, b) => (a.proxima || '9999') .localeCompare(b.proxima || '9999'),
            banco: (a, b) => a.banco.localeCompare(b.banco, 'es') || a.descripcion.localeCompare(b.descripcion, 'es'),
            restante: (a, b) => calculos(b).restante - calculos(a).restante,
            nombre: (a, b) => a.descripcion.localeCompare(b.descripcion, 'es')
        };
        planes.sort(criterios[el.orden.value]);

        el.lista.innerHTML = planes.map(tarjetaHTML).join('');
        el.vacio.hidden = planes.length > 0;
    };

    /* ===================== Formulario ===================== */
    const marcarInvalido = (input, malo) => input.closest('.campo').classList.toggle('invalido', malo);

    const limpiarForm = () => {
        el.form.reset();
        editandoId = null;
        el.tituloForm.textContent = 'Nuevo Plan de Cuotas';
        el.textoGuardar.textContent = 'Generar Plan de Cuotas';
        el.btnCancelar.hidden = true;
        document.querySelectorAll('.campo.invalido').forEach((c) => c.classList.remove('invalido'));
    };

    const entrarEnEdicion = (p) => {
        editandoId = p.id;
        el.descripcion.value = p.descripcion;
        el.bancoSelect.value = p.banco;
        el.bancoNuevo.value = '';
        el.total.value = p.total;
        el.cuotas.value = p.cuotas;
        el.pagadas.value = p.pagadas;
        el.dia.value = p.dia;
        el.tituloForm.textContent = 'Editar Plan de Cuotas';
        el.textoGuardar.textContent = 'Guardar cambios';
        el.btnCancelar.hidden = false;
        el.form.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.descripcion.focus();
    };

    el.form.addEventListener('submit', (e) => {
        e.preventDefault();

        const descripcion = el.descripcion.value.trim();
        const bancoEscrito = el.bancoNuevo.value.trim();
        const banco = bancoEscrito || el.bancoSelect.value;
        const total = parseFloat(el.total.value);
        const cuotas = parseInt(el.cuotas.value, 10);
        const pagadas = el.pagadas.value === '' ? 0 : parseInt(el.pagadas.value, 10);
        const dia = parseInt(el.dia.value, 10);

        const errores = {
            descripcion: !descripcion,
            banco: !banco,
            total: !(total > 0),
            cuotas: !(cuotas >= 1),
            pagadas: !(pagadas >= 0 && pagadas <= (cuotas || 0)),
            dia: !(dia >= 1 && dia <= 31)
        };
        marcarInvalido(el.descripcion, errores.descripcion);
        marcarInvalido(el.bancoSelect, errores.banco);
        marcarInvalido(el.bancoNuevo, errores.banco);
        marcarInvalido(el.total, errores.total);
        marcarInvalido(el.cuotas, errores.cuotas);
        marcarInvalido(el.pagadas, errores.pagadas);
        marcarInvalido(el.dia, errores.dia);

        if (Object.values(errores).some(Boolean)) {
            aviso(errores.pagadas && !errores.cuotas
                ? 'Las cuotas pagadas no pueden ser más que el total de cuotas.'
                : 'Revisa los campos marcados en rojo.', true);
            return;
        }

        // Si el banco ya existe con otra capitalización, se reutiliza el nombre existente.
        const existente = estadoApp.bancos.find((b) => b.toLowerCase() === banco.toLowerCase());
        const bancoFinal = existente || banco;
        registrarBanco(bancoFinal);

        if (editandoId) {
            const p = estadoApp.planes.find((x) => x.id === editandoId);
            if (p) {
                const cambioFechas = p.cuotas !== cuotas || p.pagadas !== pagadas || p.dia !== dia;
                p.descripcion = descripcion;
                p.banco = bancoFinal;
                p.total = total;
                p.cuotas = cuotas;
                p.dia = dia;
                if (pagadas < p.historial.length) p.historial = p.historial.slice(0, pagadas);
                while (p.historial.length < pagadas) p.historial.unshift({ fecha: null, tipo: 'inicial' });
                p.pagadas = pagadas;
                if (cambioFechas || !p.proxima) {
                    p.proxima = pagadas < cuotas ? aISO(siguienteDespuesDe(hoy(), dia)) : null;
                }
                if (pagadas >= cuotas) p.proxima = null;
            }
            aviso('Plan actualizado.');
        } else {
            estadoApp.planes.push({
                id: nuevoId(),
                descripcion, banco: bancoFinal, total, cuotas, pagadas, dia,
                historial: Array.from({ length: pagadas }, () => ({ fecha: null, tipo: 'inicial' })),
                proxima: pagadas < cuotas ? aISO(siguienteDespuesDe(hoy(), dia)) : null
            });
            aviso('Plan creado.');
        }

        guardar();
        limpiarForm();
        render();
    });

    el.btnCancelar.addEventListener('click', limpiarForm);

    // Escribir un banco nuevo limpia la selección y viceversa.
    el.bancoNuevo.addEventListener('input', () => { if (el.bancoNuevo.value) el.bancoSelect.value = ''; });
    el.bancoSelect.addEventListener('change', () => { if (el.bancoSelect.value) el.bancoNuevo.value = ''; });

    /* ===================== Acciones de las tarjetas ===================== */
    el.lista.addEventListener('click', (e) => {
        const boton = e.target.closest('button[data-accion]');
        if (!boton) return;
        const id = boton.closest('.plan').dataset.id;
        const p = estadoApp.planes.find((x) => x.id === id);
        if (!p) return;

        switch (boton.dataset.accion) {
            case 'pagar':
                pagarCuota(p);
                guardar(); render();
                aviso(p.pagadas >= p.cuotas ? '¡Plan liquidado!' : 'Cuota registrada como pagada.');
                break;
            case 'revertir':
                if (!confirm(`¿Revertir el último pago de "${p.descripcion}"?`)) return;
                revertirCuota(p);
                guardar(); render();
                aviso('Último pago revertido.');
                break;
            case 'editar':
                entrarEnEdicion(p);
                break;
            case 'eliminar':
                if (!confirm(`¿Eliminar el plan "${p.descripcion}"? Esta acción no se puede deshacer.`)) return;
                estadoApp.planes = estadoApp.planes.filter((x) => x.id !== id);
                if (editandoId === id) limpiarForm();
                guardar(); render();
                aviso('Plan eliminado.');
                break;
        }
    });

    [el.filtroBanco, el.filtroEstado, el.orden].forEach((s) => s.addEventListener('change', render));

    /* ===================== Respaldo ===================== */
    $('btnExportar').addEventListener('click', () => {
        const blob = new Blob([JSON.stringify(estadoApp, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `respaldo-cuotas-${aISO(hoy())}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        aviso('Respaldo exportado.');
    });

    $('btnImportar').addEventListener('click', () => el.archivoImportar.click());

    el.archivoImportar.addEventListener('change', () => {
        const archivo = el.archivoImportar.files[0];
        if (!archivo) return;
        const lector = new FileReader();
        lector.onload = () => {
            try {
                const datos = JSON.parse(lector.result);
                if (!datos || !Array.isArray(datos.planes)) throw new Error('formato');
                if (!confirm(`Se reemplazarán tus datos actuales por los del respaldo (${datos.planes.length} planes). ¿Continuar?`)) return;
                estadoApp.planes = datos.planes.map(normalizarPlan);
                estadoApp.bancos = Array.isArray(datos.bancos) ? datos.bancos.filter((b) => typeof b === 'string') : [];
                estadoApp.planes.forEach((p) => registrarBanco(p.banco));
                aplicarAutomaticos();
                guardar(); limpiarForm(); render();
                aviso('Respaldo importado.');
            } catch (err) {
                aviso('El archivo no es un respaldo válido.', true);
            }
            el.archivoImportar.value = '';
        };
        lector.readAsText(archivo);
    });

    /* ===================== Inicio ===================== */
    const revisar = () => { if (aplicarAutomaticos()) render(); else renderResumen(); };

    cargar();
    aplicarAutomaticos();
    render();

    // Si la página queda abierta, se revisa cada minuto y al volver a la pestaña.
    setInterval(revisar, 60000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) revisar(); });
})();
