/**
 * K11 OPERATIONAL OS - OMNI ELITE 2026
 * FIX: Detecção de DPA e Cruzamento de Movimentação
 */

const APP = {
    db: { 
        produtos: [], auditoria: [], fila: [], movimento: [], 
        pdv: [], pdvExtra: {}, tarefas: [], ucGlobal: [] 
    },
    rankings: { 
        growth: [], decline: [], duelos: [], 
        meta: { dom: 0, lossGap: "0.0", desvio: "0.0" } 
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

            const [p, a, m, v, tar, vMesq, vJaca, vBenf] = await Promise.all([
                safeFetch(`./produtos.json?t=${t}`),
                safeFetch(`./auditoria.json?t=${t}`),
                safeFetch(`./movimento.json?t=${t}`),
                safeFetch(`./pdv.json?t=${t}`),
                safeFetch(`./tarefas.json?t=${t}`),
                safeFetch(`./pdvmesquita.json?t=${t}`),
                safeFetch(`./pdvjacarepagua.json?t=${t}`),
                safeFetch(`./pdvbenfica.json?t=${t}`)
            ]);
            
            this.db.auditoria = a.map((item, idx) => ({ id: `uc-${idx}`, fornecedor: item.cod_comprador ?? "N/A", desc: item.descricao ?? "N/A", done: false }));
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
        } catch (e) { st.innerText = 'ERRO DE CARREGAMENTO'; console.error(e); }
    },

    processarEstoque(data) {
        const mapa = {};
        data.forEach(p => {
            const sku = String(p["Produto"] || p["Nº do produto"] || "").trim();
            if (!sku) return;
            if (!mapa[sku]) mapa[sku] = { id: sku, desc: p["Descrição produto"] || "N/A", depositos: [], qtdTotal: 0, valTotal: 0 };
            
            const q = parseFloat(String(p["Quantidade"] || "0").replace(',', '.'));
            
            // CORREÇÃO AQUI: Identificar DPA tanto em "Tipo de depósito" quanto em "Tipo depós.destino"
            let tipoDep = String(p["Tipo de depósito"] || p["Tipo"] || p["Tipo depós.destino"] || "").toUpperCase();
            
            mapa[sku].depositos.push({ 
                pos: p["Posição no depósito"] || p["Posição"] || p["PD destino"] || "S/E", 
                tipo: tipoDep, 
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
        
        // 1. Identificar saídas (de onde o PD origem ou Tipo origem seja DPA/HIDRAULICA)
        const skusQueSairam = new Set();
        this.db.movimento.forEach(m => {
            const origemTipo = String(m["Tp.depósito origem"] || "").toUpperCase();
            const origemPD = String(m["PD origem"] || "").toUpperCase();
            if (origemTipo === "DPA" || origemPD.includes("HIDRAULICA") || origemPD.includes("D-")) {
                skusQueSairam.add(String(m["Produto"]).trim());
            }
        });

        // 2. Filtrar produtos que possuem saldo no DPA mas não estão no Set de saídas
        this.db.produtos.forEach(prod => {
            const saldoNoDPA = prod.depositos.find(d => d.tipo === "DPA" || d.pos.includes("HIDRAULICA"));
            
            if (saldoNoDPA && saldoNoDPA.q > 0) {
                if (!skusQueSairam.has(prod.id)) {
                    const entrada = this.db.movimento.find(m => String(m["Produto"]).trim() === prod.id && (m["Tipo depós.destino"] === "DPA" || m["PD destino"] === "HIDRAULICA"));

                    gargalo.push({
                        id: prod.id,
                        desc: prod.desc,
                        qtdDPA: saldoNoDPA.q,
                        posDPA: saldoNoDPA.pos,
                        data: entrada ? entrada["Data da confirmação"] : "---",
                        tarefa: entrada ? entrada["Tarefa de depósito"] : "N/A",
                        posicoes: prod.depositos.map(d => ({
                            ...d,
                            ocupacao: Math.min(Math.round((d.q / this.CAPACIDADE_PADRAO) * 100), 100)
                        }))
                    });
                }
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
                    <div class="kpi-btn"><span class="label">Desvio vs Obj</span><b style="color:var(--primary); font-size:18px">${APP.rankings.meta.desvio}%</b></div>
                </div>
                <div class="kpi-row">
                    <div class="kpi-btn" onclick="APP.view('detalheTarefas')"><div class="circular-progress" style="--p-perc:${percT}; --color: var(--primary)"><span>${percT}%</span></div><span class="label">Checklist</span></div>
                    <div class="kpi-btn" onclick="APP.view('detalheUC')"><div class="circular-progress" style="--p-perc:${APP.db.ucGlobal.length > 0 ? 100 : 0}; --color: var(--danger)"><span>${APP.db.ucGlobal.length}</span></div><span class="label">UC Global</span></div>
                </div>
                <div class="kpi-row">
                    <div class="kpi-btn" onclick="APP.actions.setFiltroEstoque('ruptura')"><span class="label">Rupturas</span><b style="color:var(--danger); font-size:18px">${nR}</b></div>
                    <div class="kpi-btn" onclick="APP.actions.setFiltroEstoque('abastecimento')"><span class="label">Repor PKL</span><b style="color:var(--primary); font-size:18px">${nA}</b></div>
                </div>`;
        },

        detalheUC() {
            return `
                <div class="op-card alert-p">
                    <span class="label">UC GLOBAL - GARGALOS DPA (HIDRAULICA)</span>
                    <div style="margin-top:15px; margin-bottom:80px">
                        ${APP.db.ucGlobal.length > 0 ? APP.db.ucGlobal.map(item => `
                            <div class="op-card" style="border-left: 4px solid var(--danger); margin: 10px 0;">
                                <div style="display:flex; justify-content:space-between"><b class="mono" style="color:var(--danger)">${item.id}</b><span style="font-size:10px; font-weight:bold; color:var(--danger)">PARADO</span></div>
                                <div style="font-size:12px; margin: 5px 0"><b>${item.desc}</b></div>
                                <div class="end-box" style="background:#fff3f3; font-size:10px">
                                    POS: <b>${item.posDPA}</b> | QTD: <b>${item.qtdDPA}</b><br>
                                    Tarefa: ${item.tarefa} | Data: ${item.data}
                                </div>
                                <div class="label" style="margin-top:10px; font-size:8px">CAPACIDADE EM ESTOQUE FIXO:</div>
                                ${item.posicoes.filter(p => p.tipo !== "DPA" && !p.pos.includes("HIDRAULICA")).map(p => `
                                    <div style="margin-top:5px">
                                        <div style="display:flex; justify-content:space-between; font-size:9px"><span>${p.tipo} | ${p.pos}</span><span>${p.q}/${APP.CAPACIDADE_PADRAO}</span></div>
                                        <div style="width:100%; height:4px; background:#eee; border-radius:2px"><div style="width:${p.ocupacao}%; height:100%; background:${p.ocupacao > 85 ? 'red' : 'green'}"></div></div>
                                    </div>
                                `).join('')}
                                <button class="pos-tag" style="margin-top:10px" onclick="APP.actions.preencher('${item.id}')">LANÇAR MOVIMENTAÇÃO</button>
                            </div>
                        `).join('') : '<div class="op-card" style="text-align:center">NENHUM ITEM PENDENTE NO DPA</div>'}
                    </div>
                    <button class="pos-tag" style="position:fixed; bottom:80px; left:5%; width:90%" onclick="APP.view('dash')">VOLTAR</button>
                </div>`;
        },

        operacional() {
            return `<div style="margin-bottom:80px">
                <div class="op-card alert-s" style="padding:20px"><span class="label">BIPAR SKU</span><input type="number" id="sk-in" class="op-input"><input type="number" id="qt-in" class="op-input" placeholder="QTD"><button onclick="APP.actions.addFila()" class="pos-tag">LANÇAR</button></div>
                <div class="label" style="margin-left:15px">FILA DE ROTAS</div>
                ${APP.db.fila.map((t, i) => `<div class="op-card alert-s">
                    <div style="display:flex; justify-content:space-between"><div><b class="mono" style="font-size:18px">${t.id}</b><div style="font-size:11px">${t.desc}</div><b style="color:var(--primary)">QTD: ${t.qtdSolicitada}</b></div><span class="material-symbols-outlined" onclick="APP.actions.remFila(${i})" style="color:var(--success); font-size:40px; cursor:pointer">task_alt</span></div>
                    <div style="margin-top:10px; background:#f4f4f4; padding:8px; border-radius:4px">${t.depositos.map(d => `<div class="end-box mono" style="font-size:10px; border:none; background:none"><span>${d.tipo} | <b>${d.pos}</b></span> <b>${d.q} un</b></div>`).join('')}</div>
                </div>`).join('') || '<div class="op-card" style="text-align:center; opacity:0.5">VAZIO</div>'}
            </div>`;
        },

        rastreio() {
            return `<div class="op-card alert-p"><span class="label">RASTREIO</span><input type="number" id="sk-r" class="op-input" placeholder="SKU..."><button onclick="APP.actions.rastrear()" class="pos-tag">PESQUISAR</button></div><div id="res-investigar" style="margin-bottom:80px"></div>`;
        },

        projetor() {
            const lista = APP.rankings.duelos.filter(x => x.id.includes(APP.ui.buscaDuelo) || x.desc.toLowerCase().includes(APP.ui.buscaDuelo.toLowerCase()));
            return `
                <div class="duel-selector" style="display:flex; gap:5px; padding:0 12px; margin-bottom:10px">${['mesquita','jacarepagua','benfica'].map(l => `<button style="flex:1; padding:10px; border:none; border-radius:4px; font-size:10px; font-weight:bold; background:${APP.ui.pdvAlvo===l?'var(--primary)':'var(--secondary)'}; color:#fff" onclick="APP.actions.mudarAlvo('${l}')">${l.toUpperCase()}</button>`).join('')}</div>
                <div class="op-card"><div class="label">LOSS GAP: ${APP.rankings.meta.lossGap}%</div><input type="text" placeholder="BUSCAR..." class="op-input" oninput="APP.actions.filtrarDuelo(this.value)" value="${APP.ui.buscaDuelo}"></div>
                <div style="margin-bottom:80px">${lista.map(g => `<div class="op-card" style="border-left:5px solid ${g.status.bg}"><div style="display:flex; justify-content:space-between"><b class="mono">${g.id}</b><div style="background:${g.status.bg}; color:#fff; padding:2px 6px; font-size:9px; border-radius:3px; font-weight:bold">${g.status.label}</div></div><div style="font-weight:700; font-size:13px; margin:8px 0">${g.desc}</div><div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:5px; background:#f4f4f4; padding:8px; border-radius:4px"><div><div class="label" style="font-size:7px">K11</div><b>${g.vMinha}</b></div><div><div class="label" style="font-size:7px">${APP.ui.pdvAlvo.toUpperCase()}</div><b>${g.vAlvo}</b></div><div><div class="label" style="font-size:7px">LOSS</div><b style="color:${g.status.bg}">${g.loss}%</b></div></div></div>`).join('')}</div>`;
        },

        estoque() {
            const f = APP.ui.filtroEstoque; const lista = APP.db.produtos.filter(p => p.status === f);
            return `<div class="kpi-row"><div class="kpi-btn" onclick="APP.actions.setFiltroEstoque('ruptura')" style="${f==='ruptura'?'background:var(--danger);color:#fff':''}">RUPTURAS</div><div class="kpi-btn" onclick="APP.actions.setFiltroEstoque('abastecimento')" style="${f==='abastecimento'?'background:var(--primary);color:#fff':''}">REPOSIÇÃO</div></div><div style="margin-bottom:80px">${lista.map(p => `<div class="op-card" onclick="APP.actions.preencher('${p.id}')"><div style="display:flex; justify-content:space-between"><b class="mono">${p.id}</b><b>${p.qtdTotal} UN</b></div><div style="font-weight:700; font-size:13px; margin:5px 0">${p.desc}</div>${p.depositos.map(d => `<div class="end-box mono" style="font-size:10px"><span>${d.tipo} | <b>${d.pos}</b></span> <b>${d.q}</b></div>`).join('')}</div>`).join('')}</div>`;
        },
        detalheTarefas() { return `<div class="op-card alert-s"><span class="label">CHECKLIST</span><div style="margin-top:15px; margin-bottom:80px">${APP.db.tarefas.map(t => `<div class="end-box" style="${t.done?'opacity:0.4':''}"><span>${t.task}</span><span class="material-symbols-outlined" onclick="APP.actions.toggleTask(${t.id})" style="color:${t.done?'var(--success)':'#ccc'}">${t.done?'check_box':'check_box_outline_blank'}</span></div>`).join('')}</div><button class="pos-tag" style="position:fixed; bottom:80px; left:5%; width:90%" onclick="APP.view('dash')">VOLTAR</button></div>`; }
    },

    actions: {
        animateValue(id, start, end, duration) { const obj = document.getElementById(id); if(!obj) return; let startT = null; const step = (t) => { if (!startT) startT = t; const progress = Math.min((t - startT) / duration, 1); obj.innerHTML = (progress * (end - start) + start).toLocaleString('pt-BR', {minimumFractionDigits: 2}); if (progress < 1) window.requestAnimationFrame(step); }; window.requestAnimationFrame(step); },
        rastrear() {
            const v = document.getElementById('sk-r').value.trim(); const res = document.getElementById('res-investigar'); if(!v) return;
            const p = APP.db.produtos.find(x => x.id === v); const movs = APP.db.movimento.filter(m => String(m["Produto"] || m["Nº do produto"]).trim() === v);
            if(!p) return res.innerHTML = `<div class="op-card">NÃO LOCALIZADO</div>`;
            res.innerHTML = `<div class="op-card alert-s"><b class="mono" style="font-size:18px">${p.id}</b><div class="label">${p.desc}</div><div class="label" style="margin-top:15px">ESTOQUE ATUAL</div>${p.depositos.map(d => `<div class="end-box mono" style="font-size:10px"><span>${d.tipo} | <b>${d.pos}</b></span> <b>${d.q} un</b></div>`).join('')}<div class="label" style="margin-top:15px">HISTÓRICO</div>${movs.length ? movs.reverse().slice(0,10).map(m => `<div class="end-box mono" style="display:block; font-size:9px; border-left:3px solid var(--primary)"><b>${m["Data da confirmação"] || m["Data"] || 'S/D'}</b><br>DE: ${m["PD origem"] || 'S/E'}➔ PARA: ${m["PD destino"] || 'S/E'}</div>`).join('') : '<div class="end-box">Sem histórico.</div>'}</div>`;
        },
        addFila() { const s = document.getElementById('sk-in').value.trim(); const q = parseFloat(document.getElementById('qt-in').value); const p = APP.db.produtos.find(x => x.id === s); if(p && q > 0) { APP.db.fila.push({ ...p, qtdSolicitada: q }); APP.view('operacional'); } },
        toggleTask(id) { const t = APP.db.tarefas.find(x => x.id === id); if(t){ t.done = !t.done; APP.view('detalheTarefas'); } },
        toggleRanking() { APP.ui.rankingAberto = !APP.ui.rankingAberto; APP.view('dash'); },
        mudarAlvo(l) { APP.ui.pdvAlvo = l; APP.processarDueloAqua(); APP.view('projetor'); },
        setFiltroEstoque(f) { APP.ui.filtroEstoque = f; APP.view('estoque'); },
        filtrarDuelo(v) { APP.ui.buscaDuelo = v; APP.view('projetor'); },
        remFila(i) { APP.db.fila.splice(i, 1); APP.view('operacional'); },
        preencher(id) { APP.view('operacional'); setTimeout(() => { document.getElementById('sk-in').value = id; document.getElementById('qt-in').focus(); }, 150); }
    }
};
window.onload = () => APP.init();
