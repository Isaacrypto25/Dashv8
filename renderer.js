
// --- ESTADO GLOBAL ---
let produtosAgrupados = [];
let filaOperacional = [];
let vendasData = [];
let auditoriaData = [];
let filtroStatus = 'todos';

const fornecedoresSimulados = ["Tigre", "Fortlev", "Docol", "Deca", "Amanco Wavin", "Krona", "Lorenzetti", "Astra"];

// --- DICIONÁRIO DE SINÔNIMOS ADICIONADO ---
const sinonimos = {
    "BCH": "BUCHA", "LT": "LATAO", "AZ": "AZUL", "SOLD": "SOLDAVEL",
    "20X1/2": "20MMX1/2", "JG": "JOGO", "P/": "PARA", "PVP": "PVC"
};

// Função para normalizar textos alterada para suportar os sinônimos
const normalizar = (t) => {
    let texto = String(t || "").trim().toUpperCase().replace(/\s+/g, ' ');
    // Aplica os sinônimos
    Object.keys(sinonimos).forEach(chave => {
        const regex = new RegExp(`\\b${chave}\\b`, 'g');
        texto = texto.replace(regex, sinonimos[chave]);
    });
    return texto;
};

async function init() {
    try {
        const [resProd, resVendas, resAudit] = await Promise.all([
            fetch('produtos.json?t=' + Date.now()).then(r => r.json()),
            fetch('pdv.json?t=' + Date.now()).then(r => r.json()).catch(() => []),
            fetch('auditoria.json?t=' + Date.now()).then(r => r.json()).catch(() => [])
        ]);

        vendasData = resVendas;
        auditoriaData = resAudit;

        const mapa = {};

        resProd.forEach(p => {
            const sku = String(p["Produto"]).trim();
            if (!sku) return;
            
            if (!mapa[sku]) {
                mapa[sku] = { 
                    id: sku, 
                    desc: p["Descrição produto"] || "Sem descrição", 
                    descBusca: normalizar(p["Descrição produto"]),
                    ael: { q: 0, pos: "S/E" }, 
                    pkl: { q: 0, pos: "S/E" }, 
                    totalVal: 0 
                };
            }

            const q = parseInt(p["Quantidade"]) || 0;
            const v = parseFloat(p["Valor total"]) || 0;
            const pos = p["Posição no depósito"] || "S/E";
            const tipo = String(p["Tipo de depósito"]).toUpperCase();

            if (tipo.includes("AEL")) {
                mapa[sku].ael = { q: q, pos: pos };
            } else {
                mapa[sku].pkl = { q: q, pos: pos };
            }
            mapa[sku].totalVal += v;
        });

        produtosAgrupados = Object.values(mapa).map((p, i) => {
            const total = p.ael.q + p.pkl.q;
            p.fornecedor = fornecedoresSimulados[i % fornecedoresSimulados.length];
            p.status = total === 0 ? 'ruptura' : (p.pkl.q < 100 ? 'alerta' : 'saudavel');
            return p;
        });

        irPara('dashboard');
    } catch (e) { console.error("Erro no init:", e); }
}

const Screens = {
    dashboard: () => {
        const totalEstoque = produtosAgrupados.reduce((a, b) => a + b.totalVal, 0);
        const volumeVendas = vendasData.reduce((a, b) => a + (parseInt(b["Quantidade vendida"]) || 0), 0);
        return `
            <h2>Resumo Geral</h2>
            <div class="grid-dashboard">
                <div class="card-unificado dash-card main">
                    <small>VALOR TOTAL ESTOQUE</small>
                    <h3>R$ ${totalEstoque.toLocaleString('pt-BR')}</h3>
                </div>
                <div class="card-unificado dash-card" onclick="irPara('pdv')">
                    <small>ITENS VENDIDOS</small>
                    <h3>${volumeVendas} Un</h3>
                </div>
                <div class="card-unificado dash-card" onclick="irPara('operacional')">
                    <small>FILA ATIVA</small>
                    <h3>${filaOperacional.length} Itens</h3>
                </div>
            </div>
            <h3 style="margin-top:20px">Status do Depósito</h3>
            <div class="kpi-container">
                <div class="kpi-card red" onclick="setFiltroDash('ruptura')"><span>${produtosAgrupados.filter(x=>x.status==='ruptura').length}</span><small>Faltas</small></div>
                <div class="kpi-card yellow" onclick="setFiltroDash('alerta')"><span>${produtosAgrupados.filter(x=>x.status==='alerta').length}</span><small>Alertas</small></div>
                <div class="kpi-card green" onclick="setFiltroDash('saudavel')"><span>${produtosAgrupados.filter(x=>x.status==='saudavel').length}</span><small>Saudável</small></div>
            </div>
        `;
    },

    pdv: () => PDVManager.gerarTela(vendasData),

    gerenciador: () => `
        <h2>Bipar Entrada</h2>
        <div class="card-unificado">
            <label>SKU</label>
            <input type="number" id="sku-in" class="input-glass" placeholder="00000000" autofocus>
            <label>QTD</label>
            <input type="number" id="qtd-in" class="input-glass" value="1">
            <button onclick="addFila()" class="btn-primary">ENVIAR PARA OPERACIONAL</button>
            <p id="feedback" style="margin-top:10px; text-align:center"></p>
        </div>
    `,

    operacional: () => `
        <h2>Fila de Trabalho</h2>
        ${filaOperacional.map((t, i) => `
            <div class="card-unificado">
                <div style="display:flex; justify-content:space-between">
                    <div style="flex:1">
                        <b style="color:var(--primary)">SKU: ${t.id}</b>
                        <p style="font-size:12px; margin:5px 0">${t.desc}</p>
                        <div class="end-box">
                            <div><small>PULMÃO (AEL)</small><br><b>${t.ael.pos} (${t.ael.q} un)</b></div>
                            <div style="border-left:1px solid #ddd; padding-left:10px"><small>PICKING (PKL)</small><br><b>${t.pkl.pos} (${t.pkl.q} un)</b></div>
                        </div>
                        <div style="margin-top:8px; font-size:11px; font-weight:bold; color:var(--primary)">SOLICITADO: ${t.qtdPedida} UN</div>
                    </div>
                    <button onclick="remFila(${i})" class="btn-check" style="margin-left:10px"><span class="material-symbols-outlined">done</span></button>
                </div>
            </div>
        `).join('') || '<p style="text-align:center; padding:40px; opacity:0.5">Sem pendências.</p>'}
    `,

    estoque: () => `
        <h2>Inventário</h2>
        <div class="kpi-container">
            <div class="kpi-card red ${filtroStatus==='ruptura'?'active':''}" onclick="setFiltro('ruptura')">Faltas</div>
            <div class="kpi-card yellow ${filtroStatus==='alerta'?'active':''}" onclick="setFiltro('alerta')">Alertas</div>
            <div class="kpi-card green ${filtroStatus==='saudavel'?'active':''}" onclick="setFiltro('saudavel')">OK</div>
        </div>
        ${produtosAgrupados.filter(p => filtroStatus === 'todos' || p.status === filtroStatus).map(p => `
            <div class="card-unificado ${p.status}">
                <b>SKU: ${p.id}</b>
                <p style="font-size:11px; margin:5px 0">${p.desc}</p>
                <div class="end-box">
                    <span>AEL: ${p.ael.pos} (${p.ael.q})</span>
                    <span>PKL: ${p.pkl.pos} (${p.pkl.q})</span>
                </div>
            </div>
        `).join('')}
    `,

    fornecedores: () => {
        const grupos = auditoriaData.reduce((acc, item) => {
            const f = item["Fornecedor"] || "DIVERSOS";
            if (!acc[f]) acc[f] = [];
            acc[f].push(item);
            return acc;
        }, {});

        return `
            <h2>Auditoria por Fornecedor</h2>
            <div class="grid-fornecedores">
                ${Object.entries(grupos).map(([nome, notas]) => {
                    // Utilizando unescape para evitar problemas com caracteres especiais no btoa
                    const idSafe = btoa(unescape(encodeURIComponent(nome))).replace(/=/g, '');
                    return `
                    <div class="card-unificado" style="border-top: 4px solid var(--primary); margin-bottom: 20px;">
                        <div onclick="toggleFornecedor('${idSafe}')" style="cursor:pointer">
                            <h3 style="color:var(--primary); margin: 0 0 5px 0; font-size: 16px;">${nome}</h3>
                            <small style="display:block; margin-bottom:10px; opacity:0.7">${notas.length} nota(s) pendente(s)</small>
                        </div>
                        
                        <div id="content-${idSafe}" style="display:none; border-top: 1px solid #eee; padding-top:10px">
                            <button class="btn-primary" style="width:100%; margin-bottom:15px" onclick="analisarPosicoes('${idSafe}', '${nome}')">BUSCAR ENDEREÇOS NO ESTOQUE</button>
                            <div id="lista-${idSafe}">
                                ${notas.map(n => `
                                    <div style="background:#f8f9fa; padding:10px; border-radius:8px; margin-bottom:8px; border: 1px solid #eee;">
                                        <div style="display:flex; justify-content:space-between; font-size:11px; margin-bottom:5px">
                                            <b>NF: ${n["Nota Fiscal"]}</b>
                                        </div>
                                        <p style="font-size:10px; margin:0 0 5px 0; font-weight:500">${n["Descrição"]}</p>
                                        <div style="display:flex; justify-content:space-between; font-size:9px; opacity:0.8">
                                            <span>Qtd: ${n["Qtde Confirmada"]}</span>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                `}).join('') || '<p style="text-align:center; opacity:0.5; padding:40px">Nenhuma auditoria.</p>'}
            </div>
        `;
    }
};

// --- LOGICA DE CRUZAMENTO ATUALIZADA (Busca Inteligente + Trava de Marca) ---
window.analisarPosicoes = (idSafe, nomeFornecedor) => {
    const notas = auditoriaData.filter(a => a["Fornecedor"] === nomeFornecedor);
    const container = document.getElementById(`lista-${idSafe}`);
    const marcaAlvo = nomeFornecedor.toUpperCase();
    
    container.innerHTML = notas.map(n => {
        const busca = normalizar(n["Descrição"]);
        
        // Busca Flexível: Tenta encontrar o produto no estoque que contenha a marca E pelo menos 2 palavras da descrição
        const p = produtosAgrupados.find(est => {
            const palavrasNota = busca.split(" ").filter(w => w.length > 2);
            const comuns = palavrasNota.filter(pal => est.descBusca.includes(pal));
            // Critério: Marca deve bater E ter similaridade de palavras
            return est.descBusca.includes(marcaAlvo) && comuns.length >= 2;
        });
        
        const vaiParaChao = !p || p.pkl.q < 100; 
        const cor = p ? (vaiParaChao ? "#27ae60" : "#2980b9") : "#ff4757";
        const endereco = p ? (vaiParaChao ? p.pkl.pos : p.ael.pos) : 'NÃO LOCALIZADO';

        return `
            <div style="background:#fff; padding:12px; border-radius:8px; margin-top:8px; border-left:6px solid ${cor}; border:1px solid #eee">
                <b style="font-size:11px; display:block; color:#333">${n["Descrição"]}</b>
                <div style="display:flex; justify-content:space-between; margin-top:8px; align-items:center">
                    <div style="font-size:10px">
                        <span style="opacity:0.7">DESTINO:</span> <b style="color:${cor}">${p ? (vaiParaChao ? 'CHÃO (PKL)' : 'AÉREO (AEL)') : '---'}</b><br>
                        <span style="opacity:0.7">ENDEREÇO:</span> <b style="color:#222; font-size:12px">${endereco}</b>
                    </div>
                    <div style="text-align:right">
                        <small style="display:block; font-size:9px; opacity:0.6">QTD</small>
                        <b style="font-size:14px">${n["Qtde Confirmada"]}</b>
                    </div>
                </div>
                ${p ? `<div style="font-size:8px; color:gray; margin-top:5px; border-top:1px dashed #eee; padding-top:3px">Ref. Estoque: ${p.desc}</div>` : ''}
            </div>
        `;
    }).join('');
};

// --- NAVEGAÇÃO E AUXILIARES ---
window.irPara = (t) => {
    document.querySelectorAll('.nav-link').forEach(n => n.classList.toggle('active', n.getAttribute('data-target') === t));
    render(t);
};

window.render = (t) => { document.getElementById('main-view').innerHTML = Screens[t](); window.scrollTo(0,0); };

window.toggleFornecedor = (id) => {
    const c = document.getElementById(`content-${id}`);
    c.style.display = c.style.display === "block" ? "none" : "block";
};

window.addFila = () => {
    const sku = document.getElementById('sku-in').value;
    const p = produtosAgrupados.find(x => String(x.id) === sku);
    if(p) { 
        filaOperacional.push({...p, qtdPedida: document.getElementById('qtd-in').value}); 
        document.getElementById('feedback').innerText = "✅ Adicionado!";
        setTimeout(() => irPara('operacional'), 600);
    } else {
        document.getElementById('feedback').innerText = "❌ SKU Inválido";
    }
};

window.remFila = (i) => { filaOperacional.splice(i, 1); render('operacional'); };
window.setFiltroDash = (s) => { filtroStatus = s; irPara('estoque'); };
window.setFiltro = (s) => { filtroStatus = filtroStatus === s ? 'todos' : s; render('estoque'); };

document.addEventListener('DOMContentLoaded', init);
document.querySelectorAll('.nav-link').forEach(l => l.onclick = (e) => { e.preventDefault(); irPara(l.getAttribute('data-target')); });