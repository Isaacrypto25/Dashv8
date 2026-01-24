let produtosAgrupados = [];
let filaOperacional = [];
let filtroStatus = 'todos';

const fornecedoresSimulados = ["Tigre", "Fortlev", "Docol", "Deca", "Amanco Wavin", "Krona", "Lorenzetti", "Astra"];

async function init() {
    try {
        const res = await fetch('produtos.json?t=' + Date.now());
        const data = await res.json();
        const mapa = {};

        data.forEach(p => {
            const sku = p["Produto"];
            if (!sku) return;
            if (!mapa[sku]) {
                mapa[sku] = { 
                    id: sku, 
                    desc: p["Descrição produto"] || "Sem descrição", 
                    ael: { q: 0, pos: "S/E" }, 
                    pkl: { q: 0, pos: "S/E" }, 
                    totalVal: 0 
                };
            }
            const q = parseInt(p["Quantidade"]) || 0;
            const v = parseFloat(p["Valor total"]) || 0;
            const endereco = p["Posição no depósito"] || "S/E";

            if (String(p["Tipo de depósito"]).includes("AEL")) {
                mapa[sku].ael.q = q;
                mapa[sku].ael.pos = endereco;
            } else {
                mapa[sku].pkl.q = q;
                mapa[sku].pkl.pos = endereco;
            }
            mapa[sku].totalVal += v;
        });

        produtosAgrupados = Object.values(mapa).map((p, i) => {
            const total = p.ael.q + p.pkl.q;
            p.fornecedor = fornecedoresSimulados[i % fornecedoresSimulados.length];
            p.status = total === 0 ? 'ruptura' : (p.ael.q === 0 || p.pkl.q < 100 ? 'alerta' : 'saudavel');
            return p;
        });
        render('dashboard');
    } catch (e) { console.error("Erro:", e); }
}

const Screens = {
    dashboard: () => `
        <h2>Início</h2>
        <div class="card-unificado" style="background: linear-gradient(135deg, var(--primary), #ff8c42); color:white; border:none">
            <small>PATRIMÔNIO ATIVO</small>
            <h1 style="font-size: 2.2rem">R$ ${produtosAgrupados.reduce((a,b)=>a+b.totalVal,0).toLocaleString('pt-BR')}</h1>
        </div>
    `,

    gerenciador: () => `
        <h2>Bipar Produto</h2>
        <div class="card-unificado">
            <label style="font-size: 11px; font-weight: bold; opacity: 0.7;">SKU DO PRODUTO</label>
            <input type="number" id="sku-in" placeholder="00000000" style="width:100%; padding:15px; font-size:1.2rem; border-radius:12px; border:1px solid rgba(0,0,0,0.1); margin-bottom:15px; outline:none">
            
            <label style="font-size: 11px; font-weight: bold; opacity: 0.7;">QUANTIDADE ESPECÍFICA</label>
            <input type="number" id="qtd-in" value="1" style="width:100%; padding:15px; font-size:1.2rem; border-radius:12px; border:1px solid rgba(0,0,0,0.1); outline:none">
            
            <button onclick="addFila()" style="width:100%; padding:18px; background:var(--primary); color:white; border:none; border-radius:15px; font-weight:bold; margin-top:20px;">CONFIRMAR ENTRADA</button>
            <p id="feedback" style="margin-top:15px; text-align:center; font-weight:bold"></p>
        </div>
    `,

    operacional: () => `
        <h2>Operacional (Fila)</h2>
        ${filaOperacional.map((tarefa, i) => `
            <div class="card-unificado">
                <div style="display:flex; justify-content:space-between; align-items:start">
                    <div style="flex:1">
                        <b style="color:var(--primary)">SKU: ${tarefa.id}</b>
                        <p style="font-size:0.85rem; margin:5px 0 10px 0; font-weight:600">${tarefa.desc}</p>
                        
                        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px; margin-bottom:10px">
                            <div style="background:rgba(0,0,0,0.05); padding:8px; border-radius:8px; font-size:10px">
                                <b>AEL: ${tarefa.ael.pos}</b><br>Qtd: ${tarefa.ael.q}
                            </div>
                            <div style="background:rgba(0,0,0,0.05); padding:8px; border-radius:8px; font-size:10px">
                                <b>PKL: ${tarefa.pkl.pos}</b><br>Qtd: ${tarefa.pkl.q}
                            </div>
                        </div>
                        <div style="color:var(--primary); font-size:12px; font-weight:bold">
                            SOLICITADO: ${tarefa.qtdPedida} UN
                        </div>
                    </div>
                    <button onclick="remFila(${i})" style="background:var(--success); color:white; border:none; width:45px; height:45px; border-radius:12px; cursor:pointer; display:flex; align-items:center; justify-content:center">
                        <span class="material-symbols-outlined">done_all</span>
                    </button>
                </div>
            </div>
        `).join('') || '<div class="card-unificado" style="text-align:center; padding:40px; opacity:0.5">Sem tarefas pendentes</div>'}
    `,

    estoque: () => {
        const c = { 
            r: produtosAgrupados.filter(x => x.status === 'ruptura').length,
            a: produtosAgrupados.filter(x => x.status === 'alerta').length,
            s: produtosAgrupados.filter(x => x.status === 'saudavel').length
        };
        return `
            <div class="kpi-container">
                <div class="kpi-card red ${filtroStatus==='ruptura'?'active':''}" onclick="setFiltro('ruptura')"><span>${c.r}</span><small>Faltas</small></div>
                <div class="kpi-card yellow ${filtroStatus==='alerta'?'active':''}" onclick="setFiltro('alerta')"><span>${c.a}</span><small>Alertas</small></div>
                <div class="kpi-card green ${filtroStatus==='saudavel'?'active':''}" onclick="setFiltro('saudavel')"><span>${c.s}</span><small>OK</small></div>
            </div>
            ${produtosAgrupados.filter(p => filtroStatus === 'todos' || p.status === filtroStatus).map(p => `
                <div class="card-unificado ${p.status}">
                    <div style="display:flex; justify-content:space-between"><b>SKU: ${p.id}</b> <span>R$ ${p.totalVal.toLocaleString()}</span></div>
                    <p style="font-size:0.8rem; margin:8px 0">${p.desc}</p>
                    <div style="display:flex; justify-content:space-between; font-size:10px; font-weight:800; color:var(--text-muted)">
                        <span>📍 AEL: ${p.ael.pos} (${p.ael.q})</span>
                        <span>📍 PKL: ${p.pkl.pos} (${p.pkl.q})</span>
                    </div>
                </div>
            `).join('')}
        `;
    },

    fornecedores: () => `
        <h2>Auditores</h2>
        <div class="grid-fornecedores">
            ${Array.from(new Set(produtosAgrupados.map(p=>p.fornecedor))).map((nome, i) => `
                <div class="card-fornecedor" id="forn-${i}">
                    <span class="material-symbols-outlined" style="font-size:35px; color:var(--primary)">water_drop</span>
                    <strong style="display:block; margin:10px 0; font-size:12px">${nome.toUpperCase()}</strong>
                    <button class="btn-quebra" onclick="bloquearAcesso('forn-${i}', '${nome}')">AUDITORIA</button>
                </div>
            `).join('')}
        </div>
    `
};

// --- LOGICA DE APOIO ---
window.addFila = () => {
    const skuVal = document.getElementById('sku-in').value;
    const qtdVal = document.getElementById('qtd-in').value;
    const p = produtosAgrupados.find(x => String(x.id) === skuVal);

    if(p) {
        filaOperacional.push({ ...p, qtdPedida: qtdVal || 1 });
        document.getElementById('feedback').innerText = "✅ ENVIADO À FILA!";
        document.getElementById('feedback').style.color = "var(--success)";
        document.getElementById('sku-in').value = "";
        document.getElementById('qtd-in').value = "1";
        setTimeout(() => { document.getElementById('feedback').innerText = ""; }, 2000);
    } else {
        document.getElementById('feedback').innerText = "❌ SKU NÃO ENCONTRADO";
        document.getElementById('feedback').style.color = "var(--danger)";
    }
};

window.bloquearAcesso = (id, nome) => {
    const lock = document.createElement('div');
    lock.className = 'lock-overlay';
    lock.innerHTML = `<span class="material-symbols-outlined lock-icon-anim">lock</span><h2 style="margin-top:20px">ACESSO RESTRITO</h2>`;
    document.body.appendChild(lock);
    setTimeout(() => lock.remove(), 1500);
};

window.remFila = (i) => { filaOperacional.splice(i, 1); render('operacional'); };
window.render = (t) => { document.getElementById('main-view').innerHTML = Screens[t](); window.scrollTo(0,0); };
window.setFiltro = (s) => { filtroStatus = (filtroStatus === s) ? 'todos' : s; render('estoque'); };

document.addEventListener('DOMContentLoaded', init);
document.querySelectorAll('.nav-link').forEach(l => l.onclick = (e) => {
    e.preventDefault();
    document.querySelectorAll('.nav-link').forEach(n => n.classList.remove('active'));
    l.classList.add('active');
    render(l.getAttribute('data-target'));
});
