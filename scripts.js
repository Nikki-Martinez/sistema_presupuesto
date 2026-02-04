let prestamos = JSON.parse(localStorage.getItem("cuotas_proyeccion_gt")) || [];
let presupuestoItems = JSON.parse(localStorage.getItem("presupuesto_gt")) || [];
let miSalario = parseFloat(localStorage.getItem("mi_salario_gt")) || 0;
const formatoQ = new Intl.NumberFormat("es-GT", {
  style: "currency",
  currency: "GTQ",
});

function cambiarTab(tab) {
  document
    .querySelectorAll(".tab-btn")
    .forEach((b) => b.classList.remove("active"));
  document
    .querySelectorAll(".view-section")
    .forEach((s) => s.classList.remove("active"));

  if (tab === "cuotas") {
    document
      .querySelector("[onclick=\"cambiarTab('cuotas')\"]")
      .classList.add("active");
    document.getElementById("vista-cuotas").classList.add("active");
  } else {
    document
      .querySelector("[onclick=\"cambiarTab('presupuesto')\"]")
      .classList.add("active");
    document.getElementById("vista-presupuesto").classList.add("active");
  }
}

function verificarCicloPago() {
  const hoy = new Date();
  const diaActual = hoy.getDate();
  const mesActual = hoy.getMonth();
  const anioActual = hoy.getFullYear();
  const ultimaRevision = JSON.parse(
    localStorage.getItem("ultimo_pago_auto"),
  ) || { mes: -1, anio: -1 };

  if (
    diaActual >= 19 &&
    (ultimaRevision.mes !== mesActual || ultimaRevision.anio !== anioActual)
  ) {
    let huboCambios = false;
    prestamos = prestamos.map((p) => {
      if (p.pagadas < p.meses) {
        huboCambios = true;
        return { ...p, pagadas: p.pagadas + 1 };
      }
      return p;
    });
    if (huboCambios) {
      localStorage.setItem(
        "ultimo_pago_auto",
        JSON.stringify({ mes: mesActual, anio: anioActual }),
      );
      guardarYRenderizar();
    }
  }
}

document.getElementById("inputSalario").value = miSalario;

function exportarPDF() {
  const element = document.getElementById("main-content");
  document.body.classList.add("exporting-pdf");
  const opciones = {
    margin: 10,
    filename: `Reporte_Finanzas.pdf`,
    image: { type: "jpeg", quality: 0.98 },
    html2canvas: { scale: 2 },
    jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
  };
  html2pdf()
    .set(opciones)
    .from(element)
    .save()
    .then(() => {
      document.body.classList.remove("exporting-pdf");
    });
}

function exportarDatos() {
  const allData = {
    prestamos,
    presupuesto: presupuestoItems,
    salario: miSalario,
  };
  const dataStr =
    "data:text/json;charset=utf-8," +
    encodeURIComponent(JSON.stringify(allData));
  const dl = document.createElement("a");
  dl.setAttribute("href", dataStr);
  dl.setAttribute("download", "finanzas_total_backup.json");
  dl.click();
}

function importarDatos(event) {
  const file = event.target.files[0];
  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const data = JSON.parse(e.target.result);
      if (data.prestamos) {
        prestamos = data.prestamos;
        presupuestoItems = data.presupuesto || [];
        miSalario = data.salario || 0;
        document.getElementById("inputSalario").value = miSalario;
      } else {
        prestamos = data;
      }
      guardarYRenderizar();
    } catch (err) {
      alert("Error en archivo");
    }
  };
  reader.readAsText(file);
}

function actualizarSalario(valor) {
  miSalario = parseFloat(valor) || 0;
  localStorage.setItem("mi_salario_gt", miSalario);
  render();
}

function agregarCuota() {
  const desc = document.getElementById("desc").value;
  const banco = document.getElementById("banco").value.trim() || "Otros";
  const monto = parseFloat(document.getElementById("monto").value);
  const meses = parseInt(document.getElementById("meses").value);
  const pagadas = parseInt(document.getElementById("pagadas").value) || 0;
  if (!desc || !monto || !meses) return alert("Por favor complete los campos");
  prestamos.push({
    id: Date.now(),
    desc,
    banco,
    monto,
    meses,
    pagadas,
    cuotaMensual: monto / meses,
  });
  guardarYRenderizar();
  document.getElementById("desc").value = "";
  document.getElementById("banco").value = "";
  document.getElementById("monto").value = "";
  document.getElementById("meses").value = "";
}

function eliminarCuota(id) {
  if (confirm("¿Desea eliminar este registro?")) {
    prestamos = prestamos.filter((p) => p.id !== id);
    guardarYRenderizar();
  }
}

function agregarPresupuesto() {
  const desc = document.getElementById("p-desc").value;
  const monto = parseFloat(document.getElementById("p-monto").value);
  if (!desc || !monto) return alert("Complete descripción y monto");
  presupuestoItems.push({ id: Date.now(), desc, monto });
  localStorage.setItem("presupuesto_gt", JSON.stringify(presupuestoItems));
  render();
  document.getElementById("p-desc").value = "";
  document.getElementById("p-monto").value = "";
}

function eliminarPresupuesto(id) {
  presupuestoItems = presupuestoItems.filter((item) => item.id !== id);
  localStorage.setItem("presupuesto_gt", JSON.stringify(presupuestoItems));
  render();
}

function actualizarPagadas(id, cambio) {
  prestamos = prestamos.map((p) => {
    if (p.id === id) {
      let n = p.pagadas + cambio;
      return { ...p, pagadas: n < 0 ? 0 : n > p.meses ? p.meses : n };
    }
    return p;
  });
  guardarYRenderizar();
}

function guardarYRenderizar() {
  localStorage.setItem("cuotas_proyeccion_gt", JSON.stringify(prestamos));
  actualizarSelectoresBancos();
  render();
}

function actualizarSelectoresBancos() {
  const bancosSet = new Set(prestamos.map((p) => p.banco.toUpperCase()));
  const datalist = document.getElementById("bancos-list");
  const selectFiltro = document.getElementById("filtroBanco");
  const valorActualFiltro = selectFiltro.value;
  datalist.innerHTML = "";
  selectFiltro.innerHTML = '<option value="">Todos los bancos</option>';
  Array.from(bancosSet)
    .sort()
    .forEach((b) => {
      datalist.innerHTML += `<option value="${b}">`;
      selectFiltro.innerHTML += `<option value="${b}">${b}</option>`;
    });
  selectFiltro.value = valorActualFiltro;
}

function render() {
  const lista = document.getElementById("lista-cuotas");
  const term = document.getElementById("busqueda").value.toLowerCase();
  const bancoFiltro = document.getElementById("filtroBanco").value;
  lista.innerHTML = "";
  let tG = 0,
    tP = 0,
    tPag = 0,
    tMes = 0;

  // Variables para banco filtrado
  let tBancoTotal = 0,
    tBancoDebe = 0,
    tBancoPagado = 0,
    tBancoCuota = 0;

  prestamos.forEach((p) => {
    const capitalPagadoIndiv = p.cuotaMensual * p.pagadas;
    const saldoP = p.monto - capitalPagadoIndiv;

    tG += p.monto;
    if (p.pagadas < p.meses) {
      tP += saldoP;
      tMes += p.cuotaMensual;
    }
    tPag += capitalPagadoIndiv;

    // Totales específicos del banco seleccionado
    if (p.banco.toUpperCase() === bancoFiltro && bancoFiltro !== "") {
      tBancoTotal += p.monto;
      tBancoPagado += capitalPagadoIndiv;
      if (p.pagadas < p.meses) {
        tBancoDebe += saldoP;
        tBancoCuota += p.cuotaMensual;
      }
    }

    if (
      p.desc.toLowerCase().includes(term) &&
      (bancoFiltro === "" || p.banco.toUpperCase() === bancoFiltro)
    ) {
      const porcentaje = (p.pagadas / p.meses) * 100;
      let colorBar =
        porcentaje > 75 ? "#27ae60" : porcentaje >= 30 ? "#f1c40f" : "#e74c3c";
      lista.innerHTML += `<div class="item">
                    <div class="item-header">
                        <div><span class="banco-tag">${p.banco.toUpperCase()}</span><div class="desc-text">${p.desc}</div></div>
                        <div class="monto-pendiente"><span class="monto-valor">${formatoQ.format(saldoP)}</span><span class="monto-label">PENDIENTE</span></div>
                    </div>
                    <div style="font-size: 0.75rem; color: var(--text-light);">Monto Total: <b>${formatoQ.format(p.monto)}</b> | Cuota: <b>${formatoQ.format(p.cuotaMensual)}</b></div>
                    <div class="progress-container"><div class="progress-bar" style="width: ${porcentaje}%; background: ${colorBar}"></div></div>
                    <div class="item-details">
                        <span>PROGRESO: ${p.pagadas} DE ${p.meses} MESES (${porcentaje.toFixed(0)}%)</span>
                        <div class="controls no-export">
                            <button class="btn-action" onclick="actualizarPagadas(${p.id}, -1)">-</button>
                            <button class="btn-action" onclick="actualizarPagadas(${p.id}, 1)">+ PAGO</button>
                        </div>
                    </div>
                    <button class="btn-delete no-export" onclick="eliminarCuota(${p.id})">Eliminar registro</button>
                </div>`;
    }
  });

  const resumenBanco = document.getElementById("resumen-banco-filtrado");
  if (bancoFiltro !== "" && tBancoTotal > 0) {
    resumenBanco.style.display = "block";
    const porcPagoBanco = (tBancoPagado / tBancoTotal) * 100;
    document.getElementById("titulo-banco-filtrado").innerText =
      `RESUMEN DE CARGA: ${bancoFiltro}`;
    document.getElementById("monto-banco-pagado").innerText =
      formatoQ.format(tBancoPagado);
    document.getElementById("monto-banco-debe").innerText =
      formatoQ.format(tBancoDebe);
    document.getElementById("monto-banco-cuota").innerText =
      formatoQ.format(tBancoCuota);
    document.getElementById("barra-banco-progreso").style.width =
      porcPagoBanco + "%";
    document.getElementById("texto-banco-porcentaje").innerText =
      `HAS PAGADO EL ${porcPagoBanco.toFixed(1)}% DE LA DEUDA TOTAL CON ESTA INSTITUCIÓN`;
  } else {
    resumenBanco.style.display = "none";
  }

  document.getElementById("total-general").innerText = formatoQ.format(tG);
  document.getElementById("total-pendiente").innerText = formatoQ.format(tP);
  document.getElementById("total-pagado").innerText = formatoQ.format(tPag);
  document.getElementById("total-mes").innerText = formatoQ.format(tMes);

  if (miSalario > 0) {
    const perc = (tMes / miSalario) * 100;
    const elP = document.getElementById("porcentajeSueldo");
    elP.innerText = perc.toFixed(1) + "%";
    elP.style.color = perc > 40 ? "var(--danger)" : "var(--success)";
    document.getElementById("mensajeSueldo").innerText =
      perc > 40 ? "CRÍTICO" : "ESTABLE";
  }

  const listaP = document.getElementById("lista-presupuesto");
  listaP.innerHTML = "";
  let sumaPresupuestoManual = 0;
  presupuestoItems.forEach((item) => {
    sumaPresupuestoManual += item.monto;
    listaP.innerHTML += `<tr>
                <td>${item.desc}</td>
                <td style="text-align: right;">${formatoQ.format(item.monto)}</td>
                <td class="no-export" style="text-align: center;">
                    <button class="btn-delete" style="margin:0; padding:0;" onclick="eliminarPresupuesto(${item.id})">Eliminar</button>
                </td>
            </tr>`;
  });
  document.getElementById("p-total-cuotas").innerText = formatoQ.format(tMes);
  document.getElementById("p-total-general").innerText = formatoQ.format(
    sumaPresupuestoManual + tMes,
  );
}

verificarCicloPago();
actualizarSelectoresBancos();
render();
