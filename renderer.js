/**
 * K11 OPERATIONAL OS - OMNI ELITE 2026
 * FIX: Rastreio de Fluxo DPA por Último Movimento
 */

const APP = {
    db: { 
        produtos: [], movimento: [], pdv: [], pdvExtra: {}, tarefas: [], ucGlobal: [] 
    },
    rankings: { 
        growth: [], decline: [], duelos: [], 
        meta: { lossGap: "0.0", desvio: "0.0" } 
    },
    ui: { rankingAberto: false, filtroEstoque: 'ruptura', pdvAlvo: 'mesquita', buscaDuelo: '' },
    CAPACIDADE_PADRAO: 50, 

    async init() {
        const st = document.getElementById('engine-status');
        try {
            const t = Date.now();
            const safeFetch = async (url) => {
                try { const r = await fetch(url); return r.ok ? await r.json() : []; } catch (e) { return []; }
            };

            const [p, m, v, tar, vMesq, vJaca, vBenf] = await Promise.all([
                safeFetch(`./produtos.json?t=${t}`),
                safeFetch(`./movimento.json?t=${t}`),
                safeFetch(`./pdv.json?t=${t}`),
                safeFetch(`./tarefas.json?t=${t}`),
                safeFetch(`./pdvmesquita.json?t=${t}`),
                safeFetch(`./pdvjacarepagua.json?t=${t}`),
                safeFetch(`./pdvbenfica.json?t=${t}`)
            ]);
            
            this.db.movimento = m;
            this.db.pdv = v;
            this.db.pdvExtra = { mesquita: vMesq, jacarepagua: vJaca, benfica: vBenf };
            this.db.tarefas = tar.map((t, i) => ({ ...t, id: i, done: false, task: t.task || t["Tarefa"] || "Tarefa s/ descrição" }));
            
            this.processarEstoque(p);
            this.processarDueloAqua(); 
            this.processarBI_DualTrend();
            this.processarUCGlobal_DPA(); 
            
            st.innerText = '● K11 OMNI ONLINE'; st.style.color = '#28a745';
            this.view('dash', document.querySelector('.nav-btn'));
        } catch (e) { 
            st.innerText = 'ERRO DE DADOS'; 
            console.error("Erro Crítico:", e); 
        }
    },

    processarEstoque(data) {
        const mapa = {};
        data.forEach(p => {
            const sku = String(p["Produto"] || p["Nº do produto"] || "").trim();
            if (!sku) return;
            if (!mapa[sku]) mapa[sku] = { id: sku, desc: p["Descrição produto"] || "N/A", depositos: [], qtdTotal: 0, valTotal: 0 };
            
            const q = parseFloat(String(p["Quantidade"] || "0").replace(',', '.'));
            mapa[sku].depositos.push({ 
                pos: p["Posição no depósito"] || p["Posição"] || "S/E", 
                tipo: String(p["Tipo de depósito"] || p["Tipo"] || "").toUpperCase(), 
                q: q 
            });
            mapa[sku].qtdTotal += q;
            mapa[sku].valTotal += parseFloat(String(p["Valor total"] || "0").replace(',', '.'));
        });
        this.db.produtos = Object.values(mapa).map(p => {
            const sPKL = p.depositos.filter(d => d.tipo === "PKL").reduce((a, b) => a + b.q, 0);
            const sRES = p.depositos.filter(d => d.tipo !== "PKL" && d.tipo !== "DPA").reduce((a, b) => a + b.q, 0);
            p.status = (p.qtdTotal <= 0) ? 'ruptura' : (sPKL <= 0 && sRES > 0) ? 'abastecimento' : 'saudavel';
            return p;
        });
    },

    processarUCGlobal_DPA() {
        const gargalo = [];
        const ultimosMovimentos = {};

        // 1. Mapeia o último estado de cada SKU baseado no log de movimentos
        // O log é processado em ordem cronológica para que o último sobrescreva o anterior
        this.db.movimento.forEach(m => {
            const sku = String(m["Produto"]).trim();
            if (sku) {
                ultimosMovimentos[sku] = m;
            }
        });

        // 2. Analisa se o último estado do produto foi entrar no DPA
        Object.keys(ultimosMovimentos).forEach(sku => {
            const m = ultimosMovimentos[sku];
            const destinoDPA = String(m["Tipo depós.destino"]).toUpperCase() === "DPA" || 
                               String(m["PD destino"]).toUpperCase() === "HIDRAULICA";
            
            // Se o último movimento dele foi ENTRAR no DPA, ele é um gargalo
            if (destinoDPA) {
                const prodInfo = this.db.produtos.find(p => p.id === sku);
                
                gargalo.push({
                    id: sku,
                    desc: m["Descrição produto"] || (prodInfo ? prodInfo.desc : "N/A"),
                    qtdDPA: m["Qtd.real destino UMB"] || m["Peso de carga"] || "Verificar",
                    posDPA: m["PD destino"] || "HIDRAULICA",
                    data: m["Data da confirmação"],
                    tarefa: m["Tarefa de depósito"],
                    // Informação de auxílio: Onde ele deveria estar?
                    posicoes: prodInfo ? prodInfo.depositos.map(d => ({
                        ...d,
                        ocupacao: Math.min(Math.round((d.q / this.CAPACIDADE_PADRAO) * 100), 100)
                    })) : []
                });
            }
        });

        this.db.ucGlobal = gargalo;
    },

    processarDueloAqua() {
        const keywords = ['BOMBA', 'PISCINA', 'CLORO', 'FILTRO', 'MOTOBOMBA', 'VALV', 'CHAVE'];
        const baseAlvo = this.db.pdvExtra[this.ui.pdvAlvo] || [];
        const mapaAlvo = {}; const minhaLoja = {};
        baseAlvo.forEach(v => { const id = String(v["Nº do produto"] || v["Produto"] || "").trim(); mapaAlvo[id] = (mapaAlvo[id] || 0) + parseFloat(String(v["Quantidade vendida"] || "0").replace(',', '.')); });
        this.db.pdv.forEach(v => { const id = String(v["Nº do produto"] || v["Produto"] || "").trim(); minhaLoja[id] = (minhaLoja[id] || 0) + parseFloat(String(v["Quantidade vendida"] || "0").replace(',', '.')); });
        let somaLoss = 0, total = 0; const comparativo = [];
        this.db.produtos.forEach(p => {
            if (!keywords.some(k => p.desc.toUpperCase().includes(k))) return;
            const vAlvo = mapaAlvo[p.id] || 0; const vMinha = minhaLoja[p.id] || 0;
            const loss = vAlvo > 0 ? (100 - ((vMinha / vAlvo) * 100)) : 0;
            if (vAlvo > 0 || vMinha > 0) { 
                comparativo.push({ id: p.id, desc: p.desc, vAlvo, vMinha, loss: parseFloat(loss.toFixed(1)), status: loss >= 30 ? { label: "CRÍTICO", bg: "#d10000" } : { label: "DOMÍNIO", bg: "#28a745" } }); 
                somaLoss += loss; total++; 
            }
        });
        this.rankings.duelos = comparativo;
        this.rankings.meta.lossGap = (somaLoss / (total || 1)).toFixed(1);
        this.rankings.meta.desvio = (parseFloat(this.rankings.meta.lossGap) * 1.2).toFixed(1); 
    },

    processarBI_DualTrend() {
        const analise = {};
        this.db.pdv.forEach(v => {
            const id = String(v["Nº do produto"] || v["Produto"] || "").trim();
            const q = parseFloat(String(v["Quantidade vendida"] || "0").replace(',', '.'));
            if (id && q > 0) {
                if (!analise[id]) analise[id] = { id, qAtual: 0, qAnterior: 0 };
                analise[id].qAtual += q; analise[id].qAnterior = analise[id].qAtual * 0.8;
            }
        });
        const lista = Object.values(analise).map(item => {
            const pInfo = this.db.produtos.find(x => x.id === item.id);
            const perc = item.qAnterior > 0 ? ((item.qAtual - item.qAnterior) / item.qAnterior) * 100 : 0;
            return { ...item, perc: perc.toFixed(1), desc: pInfo ? pInfo.desc : "N/A" };
        });
        this.rankings.growth = [...lista].sort((a, b) => b.perc - a.perc).slice(0, 10);
        this.rankings.decline = [...lista].sort((a, b) => a.perc - b.perc).slice(0, 10);
    },

    view(v, btn) {
        if(btn) { document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active')); btn.classList.add('active'); }
        const stage = document.getElementById('stage');
        if (stage && APP.views[v]) { stage.innerHTML = APP.views[v](); window.scrollTo(0,0); }
    },

    views: {
        dash() {
            const nR = APP.db.produtos.filter(x => x.status === 'ruptura').length;
            const nA = APP.db.produtos.filter(x => x.status === 'abastecimento').length;
            const percT = APP.db.tarefas.length > 0 ? Math.round((APP.db.tarefas.filter(t => t.done).length / APP.db.tarefas.length) * 100) : 0;
            const vT = APP.db.produtos.reduce((a, b) => a + b.valTotal, 0);
            
            setTimeout(() => APP.actions.animateValue('val-inv', 0, vT, 1200), 50);

            return `
                <div class="op-card alert-p" style="text-align:center">
                    <div class="label">VALOR EM ESTOQUE (K11)</div>
                    <div class="mono" style="font-size:26px; color:var(--secondary); margin-top:10px">R$ <span id="val-inv">0</span></div>
                </div>
                <div class="kpi-row">
                    <div class="kpi-btn" onclick="APP.view('projetor')"><span class="label">Loss Gap</span><b style="color:var(--danger); font-size:18px">${APP.rankings.meta.lossGap}%</b></div>
                    <div class="kpi-btn" onclick="APP.view('detalheUC')"><span class="label">UC Global</span><b style="color:var(--danger); font-size:18px">${APP.db.ucGlobal.length}</b></div>
                </div>
                <div class="kpi-row">
                    <div class="kpi-btn" onclick="APP.actions.setFiltroEstoque('ruptura')"><span class="label">Rupturas</span><b style="color:var(--danger); font-size:18px">${nR}</b></div>
                    <div class="kpi-btn" onclick="APP.actions.setFiltroEstoque('abastecimento')"><span class="label">Repor PKL</span><b style="color:var(--primary); font-size:18px">${nA}</b></div>
                </div>`;
        },

        detalheUC() {
            return `
                <div class="op-card alert-p">
                    <span class="label">UC GLOBAL - PENDÊNCIAS DPA</span>
                    <div style="margin-top:15px; margin-bottom:80px">
                        ${APP.db.ucGlobal.length > 0 ? APP.db.ucGlobal.map(item => `
                            <div class="op-card" style="border-left: 4px solid var(--danger); margin: 10px 0;">
                                <div style="display:flex; justify-content:space-between"><b class="mono" style="color:var(--danger)">${item.id}</b><span style="font-size:10px; font-weight:bold; color:var(--danger)">NO DPA</span></div>
                                <div style="font-size:12px; margin: 5px 0"><b>${item.desc}</b></div>
                                <div class="end-box" style="background:#fff3f3; font-size:10px">
                                    Tarefa: <b>${item.tarefa}</b> | Data: <b>${item.data}</b><br>
                                    Posição DPA: <b>${item.posDPA}</b>
                                </div>
                                <div class="label" style="margin-top:10px; font-size:8px">POSIÇÕES FIXAS ATUAIS:</div>
                                ${item.posicoes.length > 0 ? item.posicoes.map(p => `
                                    <div style="margin-top:5px">
                                        <div style="display:flex; justify-content:space-between; font-size:9px"><span>${p.tipo} | ${p.pos}</span><span>${p.q} un</span></div>
                                    </div>
                                `).join('') : '<div style="font-size:9px; color:#999">Sem posições fixas</div>'}
                                <button class="pos-tag" style="margin-top:10px" onclick="APP.actions.preencher('${item.id}')">LANÇAR SAÍDA</button>
                            </div>
                        `).join('') : '<div class="op-card" style="text-align:center">NENHUM ITEM PARADO NO DPA</div>'}
                    </div>
                    <button class="pos-tag" style="position:fixed; bottom:80px; left:5%; width:90%" onclick="APP.view('dash')">VOLTAR</button>
                </div>`;
        },

        operacional() {
            return `<div style="margin-bottom:80px">
                <div class="op-card alert-s" style="padding:20px"><span class="label">BIPAR SKU</span><input type="number" id="sk-in" class="op-input"><input type="number" id="qt-in" class="op-input" placeholder="QTD"><button onclick="APP.actions.addFila()" class="pos-tag">LANÇAR</button></div>
                <div class="label" style="margin-left:15px">FILA DE MOVIMENTAÇÃO</div>
                ${APP.db.fila.map((t, i) => `<div class="op-card alert-s">
                    <div style="display:flex; justify-content:space-between"><div><b class="mono" style="font-size:18px">${t.id}</b><div style="font-size:11px">${t.desc}</div><b style="color:var(--primary)">QTD: ${t.qtdSolicitada}</b></div><span class="material-symbols-outlined" onclick="APP.actions.remFila(${i})" style="color:var(--success); font-size:40px; cursor:pointer">task_alt</span></div>
                </div>`).join('') || '<div class="op-card" style="text-align:center; opacity:0.5">VAZIO</div>'}
            </div>`;
        },
        projetor() {
            const lista = APP.rankings.duelos.filter(x => x.id.includes(APP.ui.buscaDuelo) || x.desc.toLowerCase().includes(APP.ui.buscaDuelo.toLowerCase()));
            return `
                <div class="duel-selector" style="display:flex; gap:5px; padding:0 12px; margin-bottom:10px">${['mesquita','jacarepagua','benfica'].map(l => `<button style="flex:1; padding:10px; border:none; border-radius:4px; font-size:10px; font-weight:bold; background:${APP.ui.pdvAlvo===l?'var(--primary)':'var(--secondary)'}; color:#fff" onclick="APP.actions.mudarAlvo('${l}')">${l.toUpperCase()}</button>`).join('')}</div>
                <div class="op-card"><div class="label">LOSS GAP: ${APP.rankings.meta.lossGap}%</div><input type="text" placeholder="FILTRAR..." class="op-input" oninput="APP.actions.filtrarDuelo(this.value)" value="${APP.ui.buscaDuelo}"></div>
                <div style="margin-bottom:80px">${lista.map(g => `<div class="op-card" style="border-left:5px solid ${g.status.bg}"><div style="display:flex; justify-content:space-between"><b class="mono">${g.id}</b><div style="background:${g.status.bg}; color:#fff; padding:2px 6px; font-size:9px; border-radius:3px; font-weight:bold">${g.status.label}</div></div><div style="font-weight:700; font-size:13px; margin:8px 0">${g.desc}</div><div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:5px; background:#f4f4f4; padding:8px; border-radius:4px"><div><div class="label" style="font-size:7px">K11</div><b>${g.vMinha}</b></div><div><div class="label" style="font-size:7px">${APP.ui.pdvAlvo.toUpperCase()}</div><b>${g.vAlvo}</b></div><div><div class="label" style="font-size:7px">LOSS</div><b style="color:${g.status.bg}">${g.loss}%</b></div></div></div>`).join('')}</div>`;
        },
        estoque() {
            const f = APP.ui.filtroEstoque; const lista = APP.db.produtos.filter(p => p.status === f);
            return `<div class="kpi-row"><div class="kpi-btn" onclick="APP.actions.setFiltroEstoque('ruptura')" style="${f==='ruptura'?'background:var(--danger);color:#fff':''}">RUPTURAS</div><div class="kpi-btn" onclick="APP.actions.setFiltroEstoque('abastecimento')" style="${f==='abastecimento'?'background:var(--primary);color:#fff':''}">REPOSIÇÃO</div></div><div style="margin-bottom:80px">${lista.map(p => `<div class="op-card" onclick="APP.actions.preencher('${p.id}')"><div style="display:flex; justify-content:space-between"><b class="mono">${p.id}</b><b>${p.qtdTotal} UN</b></div><div style="font-weight:700; font-size:13px; margin:5px 0">${p.desc}</div>${p.depositos.map(d => `<div class="end-box mono" style="font-size:10px"><span>${d.tipo} | <b>${d.pos}</b></span> <b>${d.q}</b></div>`).join('')}</div>`).join('')}</div>`;
        }
    },

    actions: {
        animateValue(id, start, end, duration) { const obj = document.getElementById(id); if(!obj) return; let startT = null; const step = (t) => { if (!startT) startT = t; const progress = Math.min((t - startT) / duration, 1); obj.innerHTML = (progress * (end - start) + start).toLocaleString('pt-BR', {minimumFractionDigits: 2}); if (progress < 1) window.requestAnimationFrame(step); }; window.requestAnimationFrame(step); },
        addFila() { const s = document.getElementById('sk-in').value.trim(); const q = parseFloat(document.getElementById('qt-in').value); const p = APP.db.produtos.find(x => x.id === s); if(p && q > 0) { APP.db.fila.push({ ...p, qtdSolicitada: q }); APP.view('operacional'); } },
        mudarAlvo(l) { APP.ui.pdvAlvo = l; APP.processarDueloAqua(); APP.view('projetor'); },
        setFiltroEstoque(f) { APP.ui.filtroEstoque = f; APP.view('estoque'); },
        filtrarDuelo(v) { APP.ui.buscaDuelo = v; APP.view('projetor'); },
        remFila(i) { APP.db.fila.splice(i, 1); APP.view('operacional'); },
        preencher(id) { APP.view('operacional'); setTimeout(() => { document.getElementById('sk-in').value = id; document.getElementById('qt-in').focus(); }, 150); }
    }
};
window.onload = () => APP.init();
