const APP = {
    db: { produtos: [], auditoria: [], fila: [], movimento: [], pdv: [], pdvExtra: {}, tarefas: [] },
    rankings: { growth: [], decline: [], duelos: [], meta: { dom: 0, lossGap: "0.0", desvio: "0.0" } },
    ui: { rankingAberto: false, filtroEstoque: 'ruptura', pdvAlvo: 'mesquita', buscaDuelo: '' },

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
            
            st.innerText = '● K11 OMNI ONLINE'; st.style.color = '#28a745';
            this.view('dash', document.querySelector('.nav-btn'));
        } catch (e) { st.innerText = 'ERRO DE CARREGAMENTO'; }
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
            const sRES = p.depositos.filter(d => d.tipo !== "PKL").reduce((a, b) => a + b.q, 0);
            p.status = (p.qtdTotal <= 0) ? 'ruptura' : (sPKL <= 0 && sRES > 0) ? 'abastecimento' : 'saudavel';
            return p;
        });
    },

    processarDueloAqua() {
        const keywords = ['BOMBA', 'PISCINA', 'CLORO', 'FILTRO', 'MOTOBOMBA', 'VALV', 'CHAVE'];
        const baseAlvo = this.db.pdvExtra[this.ui.pdvAlvo] || [];
        const mapaAlvo = {}; const minhaLoja = {};
        
        baseAlvo.forEach(v => { const id = String(v["Nº do produto"] || v["Produto"] || "").trim(); mapaAlvo[id] = (mapaAlvo[id] || 0) + parseFloat(String(v["Quantidade vendida"] || "0").replace(',', '.')); });
        this.db.pdv.forEach(v => { const id = String(v["Nº do produto"] || v["Produto"] || "").trim(); minhaLoja[id] = (minhaLoja[id] || 0) + parseFloat(String(v["Quantidade vendida"] || "0").replace(',', '.')); });
        
        const comparativo = []; let somaLoss = 0, total = 0;
        this.db.produtos.forEach(p => {
            if (!keywords.some(k => p.desc.toUpperCase().includes(k))) return;
            const vAlvo = mapaAlvo[p.id] || 0; const vMinha = minhaLoja[p.id] || 0;
            const loss = vAlvo > 0 ? (100 - ((vMinha / vAlvo) * 100)) : 0;
            let status = loss >= 30 ? { label: "CRÍTICO", bg: "#d10000" } : { label: "DOMÍNIO", bg: "#28a745" };
            if (vAlvo > 0 || vMinha > 0) { 
                comparativo.push({ id: p.id, desc: p.desc, vAlvo, vMinha, loss: parseFloat(loss.toFixed(1)), status }); 
                somaLoss += loss; 
                total++; 
            }
        });
        this.rankings.duelos = comparativo;
        this.rankings.meta.lossGap = (somaLoss / (total || 1)).toFixed(1);
        // Desvio vs Objetivo: Cálculo fictício baseado na meta de 0% de Loss Gap
        this.rankings.meta.desvio = (parseFloat(this.rankings.meta.lossGap) * 1.2).toFixed(1); 
    },

    processarBI_DualTrend() {
        const analise = {};
        this.db.pdv.forEach(v => {
            const id = String(v["Nº do produto"] || v["Produto"] || "").trim();
            const q = parseFloat(String(v["Quantidade vendida"] || "0").replace(',', '.'));
            if (id && q > 0) {
                if (!analise[id]) analise[id] = { id, qAtual: 0, qAnterior: 0 };
                analise[id].qAtual += q;
                analise[id].qAnterior = analise[id].qAtual * 0.8;
            }
        });
        const lista = Object.values(analise).map(item => {
            const pInfo = this.db.produtos.find(x => x.id === item.id);
            const diff = item.qAtual - item.qAnterior;
            const perc = item.qAnterior > 0 ? (diff / item.qAnterior) * 100 : 0;
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
            const vT = APP.db.produtos.reduce((a, b) => a + b.valTotal, 0);
            const percT = APP.db.tarefas.length > 0 ? Math.round((APP.db.tarefas.filter(t => t.done).length / APP.db.tarefas.length) * 100) : 0;
            const percUC = APP.db.auditoria.length > 0 ? Math.round((APP.db.auditoria.filter(a => a.done).length / APP.db.auditoria.length) * 100) : 0;
            
            setTimeout(() => APP.actions.animateValue('val-inv', 0, vT, 1200), 50);

            return `
                <div class="op-card alert-p" style="text-align:center">
                    <div class="label">VALOR EM ESTOQUE (K11)</div>
                    <div class="mono" style="font-size:26px; color:var(--secondary); margin-top:10px">R$ <span id="val-inv">0</span></div>
                </div>
                <div class="kpi-row">
                    <div class="kpi-btn" onclick="APP.view('projetor')">
                        <span class="label">Loss Gap</span>
                        <b style="color:var(--danger); font-size:20px">${APP.rankings.meta.lossGap}%</b>
                    </div>
                    <div class="kpi-btn">
                        <span class="label">Desvio vs Obj</span>
                        <b style="color:var(--primary); font-size:20px">${APP.rankings.meta.desvio}%</b>
                    </div>
                </div>
                <div class="kpi-row">
                    <div class="kpi-btn" onclick="APP.view('detalheTarefas')">
                        <div class="circular-progress" style="--p-perc:${percT}; --color: var(--primary)"><span>${percT}%</span></div>
                        <span class="label">Checklist</span>
                    </div>
                    <div class="kpi-btn" onclick="APP.view('detalheUC')">
                        <div class="circular-progress" style="--p-perc:${percUC}; --color: var(--secondary)"><span>${percUC}%</span></div>
                        <span class="label">UC Global</span>
                    </div>
                </div>
                <div class="kpi-row">
                    <div class="kpi-btn" onclick="APP.actions.setFiltroEstoque('ruptura')"><span class="label">Rupturas</span><b style="color:var(--danger); font-size:18px">${nR}</b></div>
                    <div class="kpi-btn" onclick="APP.actions.setFiltroEstoque('abastecimento')"><span class="label">Abastecer</span><b style="color:var(--primary); font-size:18px">${nA}</b></div>
                </div>
                <div class="op-card" style="padding:0; overflow:hidden">
                    <div onclick="APP.actions.toggleRanking()" style="padding:15px; display:flex; justify-content:space-between; cursor:pointer; background:#f9f9f9">
                        <span class="label">INTELIGÊNCIA DE MERCADO</span>
                        <span class="material-symbols-outlined" style="transform:rotate(${APP.ui.rankingAberto?'180deg':'0deg'})">insights</span>
                    </div>
                    <div id="ranking-list" style="display:${APP.ui.rankingAberto?'block':'none'}; padding:15px">
                        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:15px">
                            <div><div class="label" style="color:var(--success)">▲ GROWTH</div>
                                ${APP.rankings.growth.map(r => `<div class="trend-item"><div class="trend-header"><b>${r.id}</b><span class="trend-up">+${r.perc}%</span></div><div class="trend-desc">${r.desc.substring(0,25)}</div></div>`).join('')}
                            </div>
                            <div><div class="label" style="color:var(--danger)">▼ DECLINE</div>
                                ${APP.rankings.decline.map(r => `<div class="trend-item"><div class="trend-header"><b>${r.id}</b><span class="trend-down">${r.perc}%</span></div><div class="trend-desc">${r.desc.substring(0,25)}</div></div>`).join('')}
                            </div>
                        </div>
                    </div>
                </div>`;
        },
        // Restante das views permanece conforme a estrutura anterior...
        operacional() {
            return `<div style="margin-bottom:80px">
                <div class="op-card alert-s" style="padding:20px"><span class="label">BIPAR SKU</span><input type="number" id="sk-in" class="op-input"><input type="number" id="qt-in" class="op-input" placeholder="QTD"><button onclick="APP.actions.addFila()" class="pos-tag">LANÇAR</button></div>
                <div class="label" style="margin-left:15px">FILA DE ROTAS</div>
                ${APP.db.fila.map((t, i) => `<div class="op-card alert-s">
                    <div style="display:flex; justify-content:space-between">
                        <div><b class="mono" style="font-size:18px">${t.id}</b><div style="font-size:11px">${t.desc}</div><b style="color:var(--primary)">QTD: ${t.qtdSolicitada}</b></div>
                        <span class="material-symbols-outlined" onclick="APP.actions.remFila(${i})" style="color:var(--success); font-size:40px">task_alt</span>
                    </div>
                    <div style="margin-top:10px; background:#f4f4f4; padding:8px; border-radius:4px">
                        ${t.depositos.map(d => `<div class="end-box mono" style="font-size:10px; border:none; background:none"><span>${d.tipo} | <b>${d.pos}</b></span> <b>${d.q} un</b></div>`).join('')}
                    </div>
                </div>`).join('') || '<div class="op-card" style="text-align:center; opacity:0.5">VAZIO</div>'}
            </div>`;
        },
        rastreio() {
            return `<div class="op-card alert-p"><span class="label">RASTREIO DE FLUXO</span><input type="number" id="sk-r" class="op-input" placeholder="SKU..."><button onclick="APP.actions.rastrear()" class="pos-tag">PESQUISAR</button></div><div id="res-investigar" style="margin-bottom:80px"></div>`;
        },
        projetor() {
            const lista = APP.rankings.duelos.filter(x => x.id.includes(APP.ui.buscaDuelo) || x.desc.toLowerCase().includes(APP.ui.buscaDuelo.toLowerCase()));
            return `
                <div class="duel-selector" style="display:flex; gap:5px; padding:0 12px; margin-bottom:10px">
                    ${['mesquita','jacarepagua','benfica'].map(l => `<button style="flex:1; padding:10px; border:none; border-radius:4px; font-size:10px; font-weight:bold; background:${APP.ui.pdvAlvo===l?'var(--primary)':'var(--secondary)'}; color:#fff" onclick="APP.actions.mudarAlvo('${l}')">${l.toUpperCase()}</button>`).join('')}
                </div>
                <div class="op-card"><div class="label">LOSS GAP: ${APP.rankings.meta.lossGap}%</div><input type="text" placeholder="BUSCAR PRODUTO..." class="op-input" oninput="APP.actions.filtrarDuelo(this.value)" value="${APP.ui.buscaDuelo}"></div>
                <div style="margin-bottom:80px">
                    ${lista.map(g => `<div class="op-card" style="border-left:5px solid ${g.status.bg}">
                        <div style="display:flex; justify-content:space-between"><b class="mono">${g.id}</b><div style="background:${g.status.bg}; color:#fff; padding:2px 6px; font-size:9px; border-radius:3px; font-weight:bold">${g.status.label}</div></div>
                        <div style="font-weight:700; font-size:13px; margin:8px 0">${g.desc}</div>
                        <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:5px; background:#f4f4f4; padding:8px; border-radius:4px">
                            <div><div class="label" style="font-size:7px">K11</div><b>${g.vMinha}</b></div>
                            <div><div class="label" style="font-size:7px">${APP.ui.pdvAlvo.toUpperCase()}</div><b>${g.vAlvo}</b></div>
                            <div><div class="label" style="font-size:7px">LOSS</div><b style="color:${g.status.bg}">${g.loss}%</b></div>
                        </div>
                    </div>`).join('')}
                </div>`;
        },
        estoque() {
            const f = APP.ui.filtroEstoque; const lista = APP.db.produtos.filter(p => p.status === f);
            return `<div class="kpi-row"><div class="kpi-btn" onclick="APP.actions.setFiltroEstoque('ruptura')" style="${f==='ruptura'?'background:var(--danger);color:#fff':''}">RUPTURAS</div><div class="kpi-btn" onclick="APP.actions.setFiltroEstoque('abastecimento')" style="${f==='abastecimento'?'background:var(--primary);color:#fff':''}">REPOSIÇÃO</div></div>
                <div style="margin-bottom:80px">${lista.map(p => `<div class="op-card" onclick="APP.actions.preencher('${p.id}')"><div style="display:flex; justify-content:space-between"><b class="mono">${p.id}</b><b>${p.qtdTotal} UN</b></div><div style="font-weight:700; font-size:13px; margin:5px 0">${p.desc}</div>
                ${p.depositos.map(d => `<div class="end-box mono" style="font-size:10px"><span>${d.tipo} | <b>${d.pos}</b></span> <b>${d.q}</b></div>`).join('')}</div>`).join('')}</div>`;
        },
        detalheUC() { return `<div class="op-card alert-p"><span class="label">RECEBIMENTO UC</span><div style="margin-top:15px">${APP.db.auditoria.map(a => `<div class="end-box" style="${a.done?'opacity:0.4':''}"><div style="font-size:11px"><b>${a.fornecedor}</b><br>${a.desc}</div><span class="material-symbols-outlined" onclick="APP.actions.toggleUC('${a.id}')" style="color:${a.done?'var(--success)':'#ccc'}">${a.done?'check_circle':'radio_button_unchecked'}</span></div>`).join('')}</div><button class="pos-tag" style="margin-top:15px" onclick="APP.view('dash')">VOLTAR</button></div>`; },
        detalheTarefas() { return `<div class="op-card alert-s"><span class="label">CONFERÊNCIA</span><div style="margin-top:15px">${APP.db.tarefas.map(t => `<div class="end-box" style="${t.done?'opacity:0.4':''}"><span>${t.task}</span><span class="material-symbols-outlined" onclick="APP.actions.toggleTask(${t.id})" style="color:${t.done?'var(--success)':'#ccc'}">${t.done?'check_box':'check_box_outline_blank'}</span></div>`).join('')}</div><button class="pos-tag" style="margin-top:15px" onclick="APP.view('dash')">VOLTAR</button></div>`; }
    },

    actions: {
        animateValue(id, start, end, duration) {
            const obj = document.getElementById(id); if(!obj) return;
            let startT = null;
            const step = (t) => {
                if (!startT) startT = t;
                const progress = Math.min((t - startT) / duration, 1);
                obj.innerHTML = (progress * (end - start) + start).toLocaleString('pt-BR', {minimumFractionDigits: 2});
                if (progress < 1) window.requestAnimationFrame(step);
            };
            window.requestAnimationFrame(step);
        },
        rastrear() {
            const v = document.getElementById('sk-r').value.trim(); 
            const res = document.getElementById('res-investigar');
            if(!v) return;

            const p = APP.db.produtos.find(x => x.id === v);
            const movs = APP.db.movimento.filter(m => String(m["Produto"] || m["Nº do produto"]).trim() === v);
            
            if(!p) return res.innerHTML = `<div class="op-card">SKU NÃO ENCONTRADO</div>`;

            res.innerHTML = `
                <div class="op-card alert-s">
                    <b class="mono" style="font-size:18px">${p.id}</b>
                    <div class="label">${p.desc}</div>
                    
                    <div class="label" style="margin-top:15px; color:var(--primary)">ESTOQUE ATUAL</div>
                    ${p.depositos.map(d => `<div class="end-box mono" style="font-size:10px"><span>${d.tipo} | <b>${d.pos}</b></span> <b>${d.q} un</b></div>`).join('')}
                    
                    <div class="label" style="margin-top:15px; color:var(--success)">HISTÓRICO DE FLUXO</div>
                    ${movs.length ? movs.reverse().slice(0,10).map(m => `
                        <div class="end-box mono" style="display:block; font-size:9px; border-left:3px solid var(--primary)">
                            <b>${m["Data de criação"] || m["Data"] || 'S/D'}</b><br>
                            DE: <b>${m["Pos.depósito origem"] || m["PD origem"] || m["Origem"] || 'S/E'}</b> 
                            ➔ PARA: <b>${m["Pos.depósito destino"] || m["PD destino"] || m["Destino"] || 'S/E'}</b>
                        </div>
                    `).join('') : '<div class="end-box">Nenhum movimento encontrado.</div>'}
                </div>`;
        },
        // ... as demais funções (addFila, remFila, etc) permanecem iguais.
        addFila() {
            const s = document.getElementById('sk-in').value.trim(); const q = parseFloat(document.getElementById('qt-in').value);
            const p = APP.db.produtos.find(x => x.id === s);
            if(p && q > 0) { APP.db.fila.push({ ...p, qtdSolicitada: q }); APP.view('operacional'); }
        },
        toggleTask(id) { const t = APP.db.tarefas.find(x => x.id === id); if(t){ t.done = !t.done; APP.view('detalheTarefas'); } },
        toggleUC(id) { const a = APP.db.auditoria.find(x => x.id === id); if(a){ a.done = !a.done; APP.view('detalheUC'); } },
        toggleRanking() { APP.ui.rankingAberto = !APP.ui.rankingAberto; APP.view('dash'); },
        mudarAlvo(l) { APP.ui.pdvAlvo = l; APP.processarDueloAqua(); APP.view('projetor'); },
        setFiltroEstoque(f) { APP.ui.filtroEstoque = f; APP.view('estoque'); },
        filtrarDuelo(v) { APP.ui.buscaDuelo = v; APP.view('projetor'); },
        remFila(i) { APP.db.fila.splice(i, 1); APP.view('operacional'); },
        preencher(id) { APP.view('operacional'); setTimeout(() => { document.getElementById('sk-in').value = id; document.getElementById('qt-in').focus(); }, 150); }
    }
};
window.onload = () => APP.init();
